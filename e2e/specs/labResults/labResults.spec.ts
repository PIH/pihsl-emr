import { type APIRequestContext, type Page } from '@playwright/test';
import { test, expect, birthdateYearsAgo, type CustomTestFixtures, type EntryContext } from '../../core';
import { LAB_RESULTS_ENCOUNTER_TYPE_UUID } from '../../core/constants';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import { VISIT_PAGE_URL, expectViewShowsSavedObs, visitPagePath } from '../../pages';

// labResults.xml v2.0 (pihemr's file, no SL copy; the server runs pihemr master, i.e. with HAI-1249: sickle-cell answer "AC", troponin concepts): "Lab results", one encounter
// of the 7 sections of the Simple UI navigator (Overview, Haematology, Biochemistry, Infectious disease, Urinalysis, Microbiology, Parasitology; ~120 result obs) with a
// "specimen collection date" that IS the encounter date, an "estimated" checkbox and a required "date of test results". KGH only (component labResults).
// Production: the "Lab Results" overall action (no visit needed, `enterHtmlFormWithSimpleUi.page?patientId=..`, session location KGH NCD: only NCD carries the Lab Results
// Location tag). The specs use the same URL, without visitId, from the harness's session location MCH OPD: the form opens there and offers NCD as the only location (the
// location tag AND restrictToSessionVisitLocation), so every save picks NCD. With a specimen date of today the encounter joins the patient's active visit (the fixture's), so the Lab Results entry
// of the visit page shows the form's own VIEW (tested); with a back-dated specimen date (the normal case) the server creates another visit for that date (checked: 2 visits). The form uses NavigatorController (viral-load script), so every test uses the Simple UI, EDIT included
// (editHtmlFormWithSimpleUi.page). Provider is a hidden default (current user). No lab order is saved: the form only saves obs.
//
// Conditions in the form, from documentation inventory (labResults.inv.md):
//   ifMode VIEW include=false :83, :535, :949, :1539  the script below; the shortcut links of Biochemistry, Infectious disease, Urinalysis
//   ifMode ENTER             :124                     default for "below detectable limit" (below)
//   includeIf gender F or age < 2 :827   Pregnancy test (b-hcg) of Biochemistry          (age as of today in ENTER)
//   includeIf age < 5 at the encounter date :1012   HIV PCR (hiv-pcr) of Infectious disease
//   includeIf gender F :1560   Pregnancy (urine-pregnancy) of Urinalysis
//   when CIEL:307 (TB smear) = PIH:SCANTY -> #tb-scanty (AFB number) :1104
// Scripts: :84-122 on load: (1) specimen collection date (encounter-date) change sets the minDate of the date of test results, and a test-date change sets the maxDate of the
//   specimen date; both start with maxDate = today; (2) viral-load toggle (also run on load, so EDIT starts right): "Detected" (CIEL:1301) enables the numeric load and disables
//   the lower-limit field, "Beyond detectable limit" (CIEL:1306) the reverse, no answer disables both. :125-134 (ENTER only): choosing "Beyond detectable limit" fills the
//   lower limit with 839 (the Haiti national standard, V5).
// Required: location (encounterLocation required), specimen collection date (prefilled with now), date of test results (:200). Allowed after the specimen date (allowFutureDates).
// Side effects on save: postSubmissionAction SetObsDatesToSpecimenCollectionDateAction (:4) looks for a PIH:3038 "specimen collection date" obs; the form has none (the specimen date
//   is the encounter date), so it does nothing (V4): the obs dates come from the encounter date (tested).
// Not covered here: the other ~110 result obs (same markup as the ones tested), the shortcut links, the hepatitis B/C viral loads (same pattern as the HIV one), the overall-action
//   launch from KGH NCD (needs a session at that location), retrospective-entry gating.
//
// Findings: see pihemr _findings.e2e.md#labResults (V1-V3 Low: duplicate id urine-leuko, minDate of the results date not applied on load, label for= with no target; V4-V5 Info:
//   dead post-submission action, Haiti default 839 in SL). None is a Medium/High bug, so there is no test.fixme.

const FORM = 'labResults.xml';
const DAY = 24 * 60 * 60 * 1000;

const newPatient = (createEntryContext: CustomTestFixtures['createEntryContext'], gender: 'M' | 'F' = 'F', age = 30) =>
  createEntryContext({ givenName: 'AutoLab', familyName: 'Tester', gender, birthdate: birthdateYearsAgo(age) });

// The production launch has no visitId (the encounter joins the active visit); returnUrl lands on the fixture visit's page.
const params = (context: EntryContext, extra: Record<string, string> = {}) =>
  new URLSearchParams({
    patientId: context.patient.uuid,
    definitionUiResource: `file:configuration/pih/htmlforms/${FORM}`,
    returnUrl: visitPagePath(context.visitUuid),
    ...extra,
  }).toString();
const openEnter = async (page: Page, context: EntryContext) => {
  await page.goto(`htmlformentryui/htmlform/enterHtmlFormWithSimpleUi.page?${params(context)}`);
  await expect(page.locator('#save-form')).toBeVisible();
};
const openEdit = async (page: Page, context: EntryContext, encounterUuid: string) => {
  await page.goto(`htmlformentryui/htmlform/editHtmlFormWithSimpleUi.page?${params(context, { encounterId: encounterUuid })}`);
  await expect(page.locator('#save-form')).toBeVisible();
};
const goToQuestion = async (page: Page, label: string) => {
  await page.locator('li.question-legend', { hasText: new RegExp(`^\\s*${label}\\s*$`) }).click();
};
// "Save Form" validates and goes to the confirmation screen, whose Save button submits.
const save = async (page: Page) => {
  await page.locator('#save-form').click();
  await page.locator('button.submitButton:visible').click();
};
const saveAndWait = async (page: Page) => {
  await save(page);
  await expect(page).toHaveURL(VISIT_PAGE_URL);
};
// The datepickers (specimen collection date `encounter-date`, `test-date`) are read-only jQuery UI inputs; setDate also fills the submitted field.
const setDate = (page: Page, field: 'encounter-date' | 'test-date', date: Date) =>
  page.evaluate(
    ([f, ms]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).getField(`${f}.value`).datepicker('setDate', new Date(ms as number));
    },
    [field, date.getTime()],
  );
const dateOption = (page: Page, field: 'encounter-date' | 'test-date', option: 'minDate' | 'maxDate') =>
  page.evaluate(
    ([f, o]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = (window as any).getField(`${f}.value`).datepicker('option', o);
      return d ? new Date(d).toDateString() : null;
    },
    [field, option],
  );
const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fillOverview = async (page: Page, specimen: Date, tested: Date) => {
  await location(page).selectOption({ label: 'NCD' }); // the only location offered (tag + session visit location)
  await setDate(page, 'encounter-date', specimen);
  await setDate(page, 'test-date', tested);
};

const location = (page: Page) => page.locator('#encounterLocation select');
const labEncounters = async (api: APIRequestContext, patientUuid: string) =>
  (await getPatientEncounters(api, patientUuid)).filter((e) => e.encounterType.uuid === LAB_RESULTS_ENCOUNTER_TYPE_UUID);

// Specimen collected `daysAgo` days ago, results dated the day after (allowed: allowFutureDates), results of 5 sections.
const saveResults = async (page: Page, api: APIRequestContext, createEntryContext: CustomTestFixtures['createEntryContext'], daysAgo = 0) => {
  const context = await newPatient(createEntryContext, 'F', 30);
  const specimen = new Date(Date.now() - daysAgo * DAY - 60_000);
  const tested = new Date(Math.min(specimen.getTime() + DAY, Date.now()));
  await openEnter(page, context);
  await fillOverview(page, specimen, tested);
  await page.locator('#sample-id input').fill('AUTO-1');
  await page.getByLabel('estimated', { exact: true }).check(); // PIH:11781 answered Yes
  await goToQuestion(page, 'Haematology');
  await page.locator('#hemoglobin input').fill('12.5');
  await page.locator('#hematology-comment textarea').fill('Sample slightly haemolysed');
  await goToQuestion(page, 'Biochemistry');
  await page.locator('#glucose-fasting input').fill('95');
  await goToQuestion(page, 'Infectious disease');
  await page.locator('#hiv-rapid-test input[type=radio]').first().check();
  await page.locator('#viral-load input[type=radio]').first().check(); // Detected
  await page.locator('#viral-load-numeric input').fill('500');
  await page.locator('#tb-smear-test input[type=radio]').nth(3).check(); // Scanty
  await page.locator('#tb-scanty input').fill('7');
  await goToQuestion(page, 'Urinalysis');
  await page.locator('#urinalysis-comment textarea').fill('Cloudy');
  await saveAndWait(page);

  const [encounter] = await labEncounters(api, context.patient.uuid);
  expect(encounter, 'one Lab Results encounter').toBeTruthy();
  return { context, specimen, tested, encounterUuid: encounter.uuid, obs: await getEncounterObs(api, encounter.uuid) };
};

test.describe('labResults', () => {
  test('opens at session location MCH OPD by direct URL: seven sections, NCD the only location, provider defaulted, no visit needed in the URL', async ({
    page,
    createEntryContext,
  }) => {
    await openEnter(page, await newPatient(createEntryContext));
    await expect(page.locator('li.question-legend')).toHaveText(['Overview', 'Haematology', 'Biochemistry', 'Infectious disease', 'Urinalysis', 'Microbiology', 'Parasitology']);
    // encounterLocation tags="Lab Results Location" restrictToSessionVisitLocation (:161): MCH OPD has no such tag
    await expect(location(page).locator('option')).toHaveText(['Choose a Location...', 'NCD']);
    // the hidden "Who?" block (:2085): current user as provider
    await expect(page.locator('#encounter-details select').first().locator('option:checked')).toHaveText(process.env.E2E_DEFAULT_PROVIDER_NAME!);
  });

  test('saving without a location, then without the date of test results, reports Required and does not save', async ({ page, api, createEntryContext }) => {
    const context = await newPatient(createEntryContext);
    await openEnter(page, context);
    await page.locator('#save-form').click();
    await expect(page.locator('#encounterLocation span.field-error')).toHaveText('Required'); // encounterLocation required :161
    expect(await labEncounters(api, context.patient.uuid)).toHaveLength(0);

    await location(page).selectOption({ label: 'NCD' });
    await page.locator('#save-form').click();
    await expect(page.locator('#test-date span.field-error')).toHaveText('Required'); // required="true" :200
    await expect(page).not.toHaveURL(VISIT_PAGE_URL);
    expect(await labEncounters(api, context.patient.uuid)).toHaveLength(0);
  });

  test.describe('date scripts (:103-111)', () => {
    test('both dates start with maxDate = today; the specimen date sets the earliest date of the results and the results date the latest specimen date', async ({
      page,
      createEntryContext,
    }) => {
      await openEnter(page, await newPatient(createEntryContext));
      const today = new Date().toDateString();
      expect(await dateOption(page, 'encounter-date', 'maxDate')).toBe(today);
      expect(await dateOption(page, 'test-date', 'maxDate')).toBe(today);

      const specimen = new Date(Date.now() - 5 * DAY);
      await setDate(page, 'encounter-date', specimen);
      await page.locator('#encounter-date input').first().dispatchEvent('change');
      expect(await dateOption(page, 'test-date', 'minDate')).toBe(specimen.toDateString());

      const tested = new Date(Date.now() - 2 * DAY);
      await setDate(page, 'test-date', tested);
      await page.locator('#test-date input').first().dispatchEvent('change');
      expect(await dateOption(page, 'encounter-date', 'maxDate')).toBe(tested.toDateString());
    });
  });

  test.describe('age and gender conditions', () => {
    // includeIf :827 (female or < 2 years: b-hcg), :1012 (< 5 years: hiv-pcr), :1560 (female: urine-pregnancy)
    const profiles = [
      { name: 'adult woman', gender: 'F', age: 30, bhcg: 1, pcr: 0, urinePregnancy: 1 },
      { name: 'adult man', gender: 'M', age: 30, bhcg: 0, pcr: 0, urinePregnancy: 0 },
      { name: '1-year-old boy', gender: 'M', age: 1, bhcg: 1, pcr: 1, urinePregnancy: 0 },
      { name: '3-year-old boy', gender: 'M', age: 3, bhcg: 0, pcr: 1, urinePregnancy: 0 },
      { name: '3-year-old girl', gender: 'F', age: 3, bhcg: 1, pcr: 1, urinePregnancy: 1 },
    ] as const;
    for (const p of profiles) {
      test(`${p.name}: pregnancy test ${p.bhcg ? 'shown' : 'absent'}, HIV PCR ${p.pcr ? 'shown' : 'absent'}, urine pregnancy ${p.urinePregnancy ? 'shown' : 'absent'}`, async ({
        page,
        createEntryContext,
      }) => {
        await openEnter(page, await newPatient(createEntryContext, p.gender, p.age));
        await expect(page.locator('#b-hcg')).toHaveCount(p.bhcg);
        await expect(page.locator('#hiv-pcr')).toHaveCount(p.pcr);
        await expect(page.locator('#urine-pregnancy')).toHaveCount(p.urinePregnancy);
      });
    }
  });

  test('TB smear: the AFB number box shows only for "Scanty" (when :1104)', async ({ page, createEntryContext }) => {
    await openEnter(page, await newPatient(createEntryContext));
    await fillOverview(page, new Date(Date.now() - 60_000), new Date(Date.now() - 60_000)); // the navigator lets the user move on once the Overview's required fields are answered
    await goToQuestion(page, 'Infectious disease');
    const smear = page.locator('#tb-smear-test input[type=radio]');
    await expect(page.locator('#tb-scanty')).toBeHidden();
    await smear.nth(3).check(); // Scanty
    await expect(page.locator('#tb-scanty input')).toBeVisible();
    await smear.nth(0).check(); // +++
    await expect(page.locator('#tb-scanty')).toBeHidden();
  });

  test.describe('HIV viral load (script :84-122, :125-134)', () => {
    const numeric = (page: Page) => page.locator('#viral-load-numeric input');
    const lowerLimit = (page: Page) => page.locator('#detected-lower-limit input');

    test('no answer disables both fields; Detected enables the load; Beyond detectable limit enables the lower limit (default 839 in ENTER)', async ({
      page,
      createEntryContext,
    }) => {
      await openEnter(page, await newPatient(createEntryContext));
      await fillOverview(page, new Date(Date.now() - 60_000), new Date(Date.now() - 60_000));
      await goToQuestion(page, 'Infectious disease');
      const answer = page.locator('#viral-load input[type=radio]');
      await expect(numeric(page)).toBeDisabled();
      await expect(lowerLimit(page)).toBeDisabled();

      await answer.nth(0).check(); // Detected CIEL:1301
      await expect(numeric(page)).toBeEnabled();
      await expect(lowerLimit(page)).toBeDisabled();

      await answer.nth(1).check(); // Beyond detectable limit CIEL:1306
      await expect(numeric(page)).toBeDisabled();
      await expect(lowerLimit(page)).toBeEnabled();
      await expect(lowerLimit(page)).toHaveValue('839'); // ENTER only :125-134

      await answer.nth(0).check();
      await expect(numeric(page)).toBeEnabled();
      await expect(lowerLimit(page)).toBeDisabled();
    });
  });

  test('saves the results under the specimen collection date: encounter and obs dates are the specimen date', async ({
    page,
    api,
    createEntryContext,
  }) => {
    // encounterDate :185 is the specimen date; V4: the post-submission action does nothing, the obs dates come from the encounter
    const { specimen, encounterUuid, obs } = await saveResults(page, api, createEntryContext, 3);
    const displays = obs.map((o) => o.display);

    expect(displays.some((d) => /^Hemoglobin: 12\.5/i.test(d))).toBe(true);
    expect(displays.some((d) => /^Fasting blood glucose: 95/i.test(d))).toBe(true);
    expect(displays.some((d) => /^Sample ID.*AUTO-1/i.test(d) || /AUTO-1/.test(d))).toBe(true);
    expect(displays.some((d) => /Estimated.*Yes/i.test(d))).toBe(true); // PIH:11781
    expect(displays.some((d) => /Sample slightly haemolysed/.test(d))).toBe(true);
    expect(displays.some((d) => /500/.test(d))).toBe(true); // viral load
    expect(displays.some((d) => /Cloudy/.test(d))).toBe(true);
    expect(obs.some((o) => o.concept.display === 'Date of test results')).toBe(true);
    expect(displays.some((d) => /potassium|sodium|creatinine/i.test(d))).toBe(false); // not filled in

    const encounter = await (await api.get(`encounter/${encounterUuid}?v=custom:(encounterDatetime,location:(display),visit:(uuid))`)).json();
    expect(String(encounter.encounterDatetime).startsWith(isoDate(specimen))).toBe(true);
    expect(encounter.location.display).toBe('NCD');
    const dated = await (await api.get(`obs?encounter=${encounterUuid}&v=custom:(concept:(display),obsDatetime)&limit=200`)).json();
    const dates = (dated.results as Array<{ concept: { display: string }; obsDatetime: string }>).filter((o) => o.concept.display !== 'Date of test results');
    expect(dates.length).toBeGreaterThan(5);
    for (const o of dates) {
      expect(o.obsDatetime.startsWith(isoDate(specimen)), `${o.concept.display} is dated ${o.obsDatetime}`).toBe(true);
    }
  });

  test('EDIT starts from the saved results (viral-load toggle included) and a changed value replaces the saved one', async ({ page, api, createEntryContext }) => {
    const { context, encounterUuid } = await saveResults(page, api, createEntryContext, 0);

    await openEdit(page, context, encounterUuid);
    await goToQuestion(page, 'Haematology');
    await expect(page.locator('#hemoglobin input')).toHaveValue('12.5');
    await goToQuestion(page, 'Infectious disease');
    await expect(page.locator('#viral-load input[type=radio]').first()).toBeChecked();
    await expect(page.locator('#viral-load-numeric input')).toHaveValue('500');
    await expect(page.locator('#viral-load-numeric input')).toBeEnabled(); // toggle run on load (EDIT)
    await expect(page.locator('#detected-lower-limit input')).toBeDisabled();
    await expect(page.locator('#tb-scanty input')).toHaveValue('7'); // when :1104 starts from the saved answer
    await goToQuestion(page, 'Haematology');
    await page.locator('#hemoglobin input').fill('13');
    await saveAndWait(page);

    const after = (await getEncounterObs(api, encounterUuid)).map((o) => o.display);
    expect(after.some((d) => /^Hemoglobin: 13/i.test(d))).toBe(true);
    expect(after.some((d) => /^Hemoglobin: 12\.5/i.test(d))).toBe(false);
    expect(after.some((d) => /^Fasting blood glucose: 95/i.test(d))).toBe(true);
  });

  test('VIEW on the visit page (Lab Results entry): the saved results under their ids, nothing for the others, no Save button', async ({ page, api, createEntryContext }) => {
    const { encounterUuid, obs } = await saveResults(page, api, createEntryContext, 0);
    const estimated = obs.find((o) => /^Estimated/i.test(o.display))?.display ?? '';
    // the checkbox shows its own label (answerCode pihcore.date_estimated), not the concept name
    const view = (await expectViewShowsSavedObs(page, api, FORM, encounterUuid, { [estimated]: '[X] estimated' })).page;

    await expect(view.locator('#hemoglobin .value')).toContainText('12.5');
    await expect(view.locator('#glucose-fasting .value')).toContainText('95');
    await expect(view.locator('#viral-load-numeric .value')).toContainText('500');
    await expect(view.locator('#tb-scanty .value')).toContainText('7');
    await expect(view.locator('#sodium .value, #potassium .value, #hiv-pcr .value')).toHaveCount(0); // not filled in
    await expect(view.locator('#save-form, button.submitButton')).toHaveCount(0); // ifMode VIEW include=false
  });
});
