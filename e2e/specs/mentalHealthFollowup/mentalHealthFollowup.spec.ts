import { type APIRequestContext, type Page } from '@playwright/test';
import { test, expect, birthdateYearsAgo, type EntryContext } from '../../core';
import { MCH_OPD_LOCATION_UUID } from '../../core/constants';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import { EntryFormPage, expectViewShowsSavedObs, selectDefaultProvider } from '../../pages';

// mentalHealthFollowup.xml: "Mental Health Follow-up" (encounter type 9d701a81-bb83-40ea-9efc-af50f05575f2), the short counterpart of
// mentalHealth.xml (housing, presenting features, mental state exam, suicide evaluation, diagnoses, CGI scores with the previous values, the
// shared PHQ-9/GAD-7 totals, interventions, drug orders, outcome). The specs open enterHtmlFormWithStandardUi inside a visit they create, so
// availability (documentation/_availability.e2e.md: enableMentalHealthForm, "Task: emr.enterMentalHealthNote", "Mental Health Location" session tag,
// no assessment or followup in the visit, no prior assessment needed) is not exercised. The session location lacks the form's location tag, so
// every save picks a location and the default provider.
//
// Conditions in the form, from documentation inventory (mentalHealthFollowup.inv.md):
//   ifMode VIEW include=false  :81, :163, :515, :551, :703  script, heading, previous-value rows, #buttons (ENTER/EDIT only)
//   includeIf latestObs PIH:6797 before the encounter date  :516  "Previous seizure frequency" row (needs an earlier seizure-frequency obs)
//   includeIf latestObs {CIEL:163222/3/4} likewise          :552  "Previous <CGI> score" row under each CGI-S/-I/-E radio group
//   includeIf gender == 'F'    :629                         Pregnant checkbox, #pregnant (LMP, EDD) and calculated GA/EDD box
//   toggle Pregnant            :634                         shows #pregnant (CIEL:5272 checkbox; toggle="pregnant")
// $encounterDate is set by the <lookup complexExpression> at :22 (the encounter date, or the visit start in ENTER), so the scan's "macro-undefined"
// leads at :22, :516-557 are false positives. Sub-forms (documentation/_shared.e2e.md): encounter-provider-location-date,
// mental-health-phq9-gad7-widget (asserted in mentalHealth.spec.ts), drug-order-widget-mental-health.
//
// Scripts (:82-148, ENTER/EDIT): same as mentalHealth.xml: setUpEdd + EDD validators for a female patient (tested through the LMP test); the return
// visit date gets minDate = encounter date and is cleared with an alert when the encounter date moves past it (tested); `.medication-checkbox` block (V1).
// Side effects on save: enrollInProgram "Mental Health" (:183, tested), ApplyDispositionAction (:23), drug orders and the disposition (not saved here).
// Required: suicide evaluation (:402-433), primary diagnosis (:468), PIH:3293 "assigned CHW" (:681), provider and location (shared); the Required
// messages and a save with all of them filled are tested.
// VIEW is covered by one test (housing, presenting feature, pregnancy dates, CGI-S, PHQ-9; the previous-value rows are absent).
// Not covered here: the drug-order widget (a saved order cannot be purged over REST), the disposition obs, the other CGI previous-value rows (only
// CGI-S is seeded), the diagnosis autocompletes beyond the required one, EDD validation messages.
//
// Findings:
//   V1 Low    :127-149        the `.medication-checkbox` block matches nothing in the rendered form (0 elements at load), so it is dead code; if the
//                             class ever appears, `jq(it).not(':checked')` is a jQuery object and always truthy, so every row starts disabled even when
//                             its box is checked (EDIT). Fix: remove it, or use `!jq(it).is(':checked')`. (Same as mentalHealth.xml V2.)
//   VW1 Info :634  the Pregnant toggle is not applied in VIEW, so #pregnant (LMP, EDD) is always rendered, blank for a patient who is not pregnant (the
//                   calculated GA/EDD box is ENTER/EDIT script output and stays empty). Same as gainNewbornRegister VW1; not tested.

const FORM = 'mentalHealthFollowup.xml';
const MENTAL_HEALTH_FOLLOWUP_ENCOUNTER_TYPE_UUID = '9d701a81-bb83-40ea-9efc-af50f05575f2';

const SUBMIT = '#buttons input.submitButton';

// The datepickers are read-only jQuery UI widgets: set the date through the widget and fire change on the visible and the hidden field
// (the form's handlers listen to the hidden one).
const setDate = (page: Page, wrapper: string, daysFromToday: number) =>
  page.evaluate(
    ([w, days]) => {
      const d = new Date();
      d.setDate(d.getDate() + (days as number));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const jq = (window as any).jq;
      const input = jq(`${w} input.hasDatepicker`);
      input.datepicker('setDate', d);
      input.change();
      jq(`${w} input[type=hidden]`).not('[name^=_]').change();
    },
    [wrapper, daysFromToday],
  );

const conceptUuid = async (api: APIRequestContext, ref: string): Promise<string> => {
  const res = await api.get(`concept/${ref}?v=custom:(uuid)`);
  expect(res.ok(), `concept ${ref}: ${res.status()}`).toBeTruthy();
  return (await res.json()).uuid;
};

// Moves the start of the test patient's visit back, so the encounter date can be set to an earlier day.
const startVisitDaysAgo = async (api: APIRequestContext, context: EntryContext, days: number) => {
  const start = new Date();
  start.setDate(start.getDate() - days);
  const res = await api.post(`visit/${context.visitUuid}`, { data: { startDatetime: start.toISOString() } });
  expect(res.ok(), `update visit: ${res.status()}`).toBeTruthy();
};

// An earlier followup (3 days ago, before the visit starts, outside any visit) with a seizure frequency of 4 per month and CGI-S 3, which the
// "previous value" rows (:516, :552) read through fn.latestObs(..., aMomentBefore(encounter date)).
const createPriorFollowup = async (api: APIRequestContext, context: EntryContext): Promise<string> => {
  const earlier = new Date();
  earlier.setDate(earlier.getDate() - 3);
  const res = await api.post('encounter', {
    data: {
      patient: context.patient.uuid,
      encounterType: MENTAL_HEALTH_FOLLOWUP_ENCOUNTER_TYPE_UUID,
      location: MCH_OPD_LOCATION_UUID,
      encounterDatetime: earlier.toISOString(),
      obs: [
        { concept: 'PIH:6797', value: 4 },
        { concept: 'CIEL:163222', value: 3 },
      ],
    },
  });
  expect(res.ok(), `create prior encounter: ${res.status()}`).toBeTruthy();
  return (await res.json()).uuid;
};

test.describe('mentalHealthFollowup', () => {
  let context: EntryContext;

  const open = async (page: Page) => {
    await EntryFormPage.open(page, FORM, context);
    await expect(page.locator(SUBMIT)).toBeVisible();
  };

  // The location select starts empty (the session location lacks the "Mental Health Location" tag) and is required.
  // The provider select is blank too when the logged-in user has no Provider account.
  const pickProviderAndLocation = async (page: Page) => {
    await selectDefaultProvider(page);
    const location = page.locator('#encounterLocation select');
    if ((await location.inputValue()) === '') {
      await location.selectOption({ index: 1 });
    }
  };

  // Answers every required field (suicide evaluation x4 "No", a primary diagnosis, assigned CHW "Yes"), picks a provider and location and saves.
  const fillRequiredAndSave = async (page: Page) => {
    await pickProviderAndLocation(page);
    for (const radio of await page.locator('#mh-suicide input[type=radio][id$="_1"]').all()) {
      await radio.check();
    }
    await page.locator('#mh-diagnoses input.autoCompleteText').first().fill('Depress');
    await page.locator('.ui-autocomplete .ui-menu-item').first().click();
    await page.locator('#mh-Outcome input[type=radio]').first().check();
    await page.locator(SUBMIT).click();
    await new EntryFormPage(page, FORM).expectSaved();
  };

  test.beforeEach(async ({ createEntryContext }) => {
    context = await createEntryContext({
      givenName: 'AutoMentalFollowup',
      familyName: 'Tester',
      gender: 'F',
      birthdate: birthdateYearsAgo(30),
    });
  });

  test('the pregnancy dates show only while Pregnant is ticked, and an LMP fills the EDD', async ({ page }) => {
    // includeIf :629 (female), toggle :634; script :105 (setUpEdd)
    await open(page);
    const pregnant = page.getByLabel('Pregnant', { exact: true });
    await expect(pregnant).toBeVisible();
    await expect(page.locator('#pregnant')).toBeHidden();
    await pregnant.check();
    await expect(page.locator('#pregnant')).toBeVisible();

    await expect(page.locator('#calculated-edd-and-gestational')).toBeHidden();
    await setDate(page, '#lastPeriodDate', -70);
    await expect(page.locator('#calculated-edd-and-gestational')).toBeVisible();
    await expect(page.locator('#edd input.hasDatepicker')).not.toHaveValue('');

    await pregnant.uncheck();
    await expect(page.locator('#pregnant')).toBeHidden();
  });

  test('a male patient has no pregnancy checkbox', async ({ page, createEntryContext }) => {
    // includeIf :629 is false for gender M
    context = await createEntryContext({
      givenName: 'AutoMentalFollowupM',
      familyName: 'Tester',
      gender: 'M',
      birthdate: birthdateYearsAgo(30),
    });
    await open(page);
    await expect(page.locator('#mh-Outcome')).toBeVisible();
    await expect(page.getByLabel('Pregnant', { exact: true })).toHaveCount(0);
    await expect(page.locator('#pregnant')).toHaveCount(0);
    await expect(page.locator('#edd')).toHaveCount(0);
  });

  // The "previous value" rows are the grey italic labels of #mh_improvements.
  const previousRows = (page: Page) => page.locator('#mh_improvements label[style*="italic"]');

  test('without an earlier followup there are no previous seizure frequency or CGI rows', async ({ page }) => {
    // includeIf :516 and :552 are false: fn.latestObs(...) finds nothing
    await open(page);
    await expect(page.locator('#mh_improvements')).toBeVisible();
    await expect(previousRows(page)).toHaveCount(0);
  });

  test('an earlier seizure frequency and CGI-S score are shown as previous values', async ({ page, api }) => {
    // includeIf :516 (PIH:6797) and :552 (CIEL:163222 only; the I and E rows have no earlier obs)
    await createPriorFollowup(api, context);
    await open(page);
    await expect(previousRows(page)).toHaveCount(2);
    await expect(previousRows(page).first()).toContainText('4'); // seizures per month
    await expect(previousRows(page).last()).toContainText('3'); // CGI-S
  });

  test('a return visit date that becomes earlier than the encounter date is cleared with an alert', async ({ page, api }) => {
    // script :111-125 (setMinReturnVisitDate); the visit has to start earlier so the encounter date can move back
    await startVisitDaysAgo(api, context, 10);
    await open(page);
    const alerts: string[] = [];
    page.on('dialog', async (dialog) => {
      alerts.push(dialog.type());
      await dialog.dismiss();
    });

    await setDate(page, '#encounterDate', -5);
    await setDate(page, '#return-visit-date', -4);
    await expect(page.locator('#return-visit-date input.hasDatepicker')).not.toHaveValue('');
    expect(alerts).toHaveLength(0);

    await setDate(page, '#encounterDate', -2); // the return date (-4) is now before the encounter date
    await expect(page.locator('#return-visit-date input.hasDatepicker')).toHaveValue('');
    expect(alerts).toEqual(['alert']);
  });

  test('saving with the required answers blank shows "Required" in each section and saves nothing', async ({ page, api }) => {
    // required :402-433 (suicide evaluation), :468 (primary diagnosis), :681 (assigned CHW)
    await open(page);
    await pickProviderAndLocation(page);
    await page.locator(SUBMIT).click();
    for (const section of ['#mh-suicide', '#mh-diagnoses', '#mh-Outcome']) {
      await expect(page.locator(`${section} span.field-error`).filter({ hasText: 'Required' }).first()).toBeVisible();
    }
    await expect(page).not.toHaveURL(/referenceapplication\/home\.page/);
    expect(await getPatientEncounters(api, context.patient.uuid)).toHaveLength(0);
  });

  test('saves a presenting feature, a CGI score and the CHW answer, and enrols the patient in Mental Health', async ({ page, api }) => {
    const enrollmentsUrl = `programenrollment?patient=${context.patient.uuid}&v=custom:(program:(name),dateCompleted)`;
    expect(((await (await api.get(enrollmentsUrl)).json()).results as unknown[]).length).toBe(0);

    await open(page);
    await page.locator('#mh_presentingFeatures input[type=checkbox]').first().check();
    await page.getByLabel('3 = Mildly ill', { exact: true }).check(); // CGI-S
    await fillRequiredAndSave(page);

    const encounters = await getPatientEncounters(api, context.patient.uuid);
    expect(encounters.map((e) => e.encounterType.uuid)).toEqual([MENTAL_HEALTH_FOLLOWUP_ENCOUNTER_TYPE_UUID]);
    const obs = await getEncounterObs(api, encounters[0].uuid);
    const displays = obs.map((o) => o.display.toLowerCase());
    expect(obs.some((o) => /severity/i.test(o.concept.display) && String(o.value).startsWith('3')), displays.join(' | ')).toBeTruthy();
    expect(displays.some((d) => d.includes('community health worker')), displays.join(' | ')).toBeTruthy();

    // enrollInProgram :183
    const enrollments = (await (await api.get(enrollmentsUrl)).json()).results as Array<{ program: { name: string } }>;
    expect(enrollments.some((e) => /mental health/i.test(e.program.name))).toBeTruthy();
  });

  // VIEW: everything the follow-up saved is shown (housing, presenting feature, pregnancy dates, CGI-S, PHQ-9 answers and total), the coded answers
  // with the form's own labels; the "previous value" rows (ENTER/EDIT only) and what was left empty carry no value.
  test('VIEW: shows the saved answers, dates and scores as saved, and not the previous-value rows nor what was left empty', async ({ page, api }) => {
    const priorUuid = await createPriorFollowup(api, context); // seizure frequency 4 and CGI-S 3 earlier: the previous-value rows exist in ENTER
    await open(page);
    await expect(previousRows(page)).toHaveCount(2);
    await page.locator('#housing input').first().check();
    await page.locator('#mh_presentingFeatures input[type=checkbox]').first().check();
    await page.getByLabel('Pregnant', { exact: true }).check();
    await setDate(page, '#lastPeriodDate', -70); // the script fills the EDD
    await setDate(page, '#return-visit-date', 14);
    await page.getByLabel('2 = Borderline mentally ill', { exact: true }).check(); // CGI-S, different from the earlier 3
    for (const select of await page.locator('#phq9-questions select').all()) {
      await select.selectOption({ label: 'More than half the days' });
    }
    await fillRequiredAndSave(page);

    const encounter = (await getPatientEncounters(api, context.patient.uuid)).find((e) => e.uuid !== priorUuid)!;

    // a date-only obs arrives as yyyy-MM-dd and is shown as dd MMM yyyy; the coded answers of the questionnaire and the housing/pregnancy
    // checkboxes are shown with the form's wording
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const labels: Record<string, string> = { 'Pregnancy status: Yes': '[X] Pregnant', 'Clinical Global Impressions Severity Score: 2': '2 = Borderline mentally ill' };
    for (const o of await getEncounterObs(api, encounter.uuid)) {
      if (typeof o.value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.value)) {
        const [y, m, d] = o.value.split('-');
        labels[o.display] = `${d} ${MONTHS[Number(m) - 1]} ${y}`;
      }
    }
    const view = await expectViewShowsSavedObs(page, api, FORM, encounter.uuid, labels);
    const at = (selector: string) => view.page.locator(`${selector} .value`);
    await expect(at('#housing')).toHaveText('[X] Currently homeless');
    await expect(at('#mh_presentingFeatures')).toHaveText('[X] Hallucinations');
    await expect(at('#mh-diagnoses')).toHaveText('Symptoms of depression');
    await expect(at('#mh_improvements')).toHaveText('[X] 2 = Borderline mentally ill'); // not the earlier 3, which is only a previous value
    await expect(view.page.locator('#mh_improvements label[style*="italic"]')).toHaveCount(0); // the previous-value rows are ENTER/EDIT only (:515, :551)
    await expect(at('#phq9-questions')).toHaveText([...Array(9).fill('More than half the days'), '18']); // nine answers, then the total
    await expect(at('#phq9-score')).toHaveText('18');
    await expect(view.page.locator('#gad7-score .value, #gad7-questions .value')).toHaveCount(0); // GAD-7 left empty: no total
    await expect(at('#mh-Outcome').filter({ hasText: 'Pregnant' })).toHaveText('[X] Pregnant');
    await expect(at('#lastPeriodDate')).toHaveText(/^\d{2} [A-Z][a-z]{2} \d{4}$/);
    await expect(at('#edd')).toHaveText(/^\d{2} [A-Z][a-z]{2} \d{4}$/);
    await expect(at('#return-visit-date')).toHaveText(/^\d{2} [A-Z][a-z]{2} \d{4}$/);
    await expect(at('#mh-interventions')).toHaveCount(0);
    await expect(at('#encounter-disposition')).toHaveCount(0);
    await expect(view.page.locator('#buttons')).toHaveCount(0); // ifMode VIEW include=false :703
  });
});
