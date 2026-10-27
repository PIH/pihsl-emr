import { type APIRequestContext, type Page } from '@playwright/test';
import { test, expect, birthdateYearsAgo, type SectionEncounter } from '../../core';
import {
  MCH_OPD_LOCATION_UUID,
  NCD_FOLLOWUP_ENCOUNTER_TYPE_UUID,
  NCD_INITIAL_1_ENCOUNTER_TYPE_UUID,
  NCD_INITIAL_ENCOUNTER_TYPE_UUID,
} from '../../core/constants';
import { getEncounterObs } from '../../commands';
import { SectionFormPage } from '../../pages';

// section-ncd-history.xml: "NCD Patient Card" of the NCD initial encounter (patient details, NCD categories with
// onset dates, vitals, risk factors, comorbidity, reason for visit, clinical notes). The specs use an NCD initial
// encounter (_availability.e2e.md: shown for NCD initial only) and open the form URL directly.
//
// Conditions in the form, from documentation inventory (section-ncd-history.inv.md):
//   ifMode VIEW include=false  :55,:62,:233,:867  heading, script, style, #buttons in ENTER/EDIT only
//   when #missed-school-a Yes  :306  show #days-missed-a
//   when #social-support Yes   :368  show #specify-support
//   when #referral-type other  :397  show #other-referral-text
//   toggle {nick}-onset-date   :434  9 NCD categories, targets rendered by the includeIf at :438
//   includeIf initial/part 1   :438  onset-date divs only for NCD initial and initial part 1 encounter types
//   includeIf age < 13         :609, :679  last-MUAC label and MUAC radios (age at encounter date)
//   ifMode VIEW / not VIEW     :655, :665  BP inputs laid out differently (one pair rendered per mode)
//   includeIf gender F         :744  "Pregnancy" radio
//   when #underlying-comorbidity Yes :832  show #comorbitity-details
//   includeIf initial only     :848  "Reason for visit" and "Clinical notes" sections (not part 1, not followup)
//
// Scripts (:63-231, ENTER/EDIT only):
//   prefill (REST): GET ws/rest/v1/visit/<visitUuid>?v=custom:(...encounters:(...obs...)); the first Vitals encounter
//     of the visit fills the read-only #lastVitals panel (BP, heart rate, temperature, MUAC, RR, O2 sat, weight, height,
//     glucose) and shows it; a random-glucose obs swaps the #fbg_span label for #rbg_span. #last_bmi = weight /
//     (height/100)^2, toFixed(1), only when both exist. Tested below.
//   validation (:175-224): .medicalHistoryText family/past-history comment checks, beforeSubmit hook. See V1.
//   navigation: setUpNextAndSubmitButtons(). Not covered here: Next / section jump buttons (need the visit-page
//     section wiring).
// Side effects on save: <enrollInProgram programId="NCD"> (:421), tested below. Not covered here: the MUAC last-vitals
//     cell (needs a child with a vitals encounter), VIEW mode (the specs only open the edit form).
//
// Findings:
//   V1 Low  :175-224  validateFamHistoryText and its beforeSubmit/change handlers select .medicalHistoryText, a class
//                     no element of this form has: the family/past-history validation is dead code. Fix: delete it.
//   V2 Low  :296-314, :838-845  <div id="days-missed-a"> and <div id="comorbitity-details"> nested in <p> (invalid HTML,
//                     the browser auto-closes the <p>); id "comorbitity" misspelt. Fix: move the divs out of the <p>.
//   V3 Low  :79-186   "last vitals" is the first Vitals encounter in the REST array, not the latest (unconfirmed:
//                     depends on REST ordering). Same as section-ncd-followup V2.
//   V4 Info :93       $encounterDate in <lookup complexExpression> is a velocity #set (renders '') and
//                     serverEncounterDate is never used: dead code. (The inventory's "macro undefined" and the
//                     bp_systolic/bp_diastolic duplicate ids are false positives: one pair per ifMode, one rendered.)

const FORM = 'section-ncd-history.xml';
const VITALS_ENCOUNTER_TYPE_UUID = '2fd151a2-fbef-43e3-b82d-c3f70f1d7333'; // hard-coded in the form script (:66)
const WEIGHT_CONCEPT_UUID = '3ce93b62-26fe-102b-80cb-0017a47871b2';
const HEIGHT_CONCEPT_UUID = '3ce93cf2-26fe-102b-80cb-0017a47871b2';
const RANDOM_GLUCOSE_CONCEPT_UUID = '3cd4e194-26fe-102b-80cb-0017a47871b2';

// Yes/No-style radios inside a wrapper span that has an id.
const pick = (page: Page, wrapper: string, label: string) =>
  page.locator(wrapper).getByLabel(label, { exact: true }).check();

// The required radios without a wrapper id; widget ids are generated but stable for this form.
const fillRequired = async (page: Page, opts: { missedSchool?: 'Yes' | 'No' } = {}) => {
  await page.getByLabel('Scheduled', { exact: true }).check(); // type of visit
  await page.locator('#w4_1').check(); // care household: No
  await page.locator('#w6_1').check(); // vulnerable: No
  await page.getByLabel('Primary school', { exact: true }).check();
  await page.getByLabel('Able to read and write', { exact: true }).check();
  await pick(page, '#missed-school-a', opts.missedSchool ?? 'No');
  await page.getByLabel('Employed', { exact: true }).check();
  await page.locator('#w104').fill('5'); // distance to clinic (miles)
  await page.locator('#w18_1').check(); // food insecurity: No
  await pick(page, '#social-support', 'No');
  await pick(page, '#referral-type', 'OPD');
};

// The date widgets are read-only jQuery UI datepickers; setDate also updates the hidden field that is submitted.
const setDate = (page: Page, wrapper: string, year: number, monthIndex: number, day: number) =>
  page.evaluate(
    ([w, y, m, d]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).jq(`${w} input.hasDatepicker`).datepicker('setDate', new Date(y as number, m as number, d as number));
    },
    [wrapper, year, monthIndex, day],
  );

const addVitalsEncounter = async (
  api: APIRequestContext,
  { patient, encounter }: SectionEncounter,
  obs: Array<{ concept: string; value: number }>,
) => {
  const res = await api.post('encounter', {
    data: {
      patient: patient.uuid,
      encounterType: VITALS_ENCOUNTER_TYPE_UUID,
      location: MCH_OPD_LOCATION_UUID,
      encounterDatetime: new Date().toISOString(),
      visit: encounter.visitUuid,
      obs,
    },
  });
  expect(res.ok(), `create vitals encounter: ${res.status()}`).toBeTruthy();
};

test.describe('section-ncd-history', () => {
  let section: SectionEncounter;

  test.beforeEach(async ({ page, createSectionEncounter }) => {
    section = await createSectionEncounter({
      encounterTypeUuid: NCD_INITIAL_ENCOUNTER_TYPE_UUID,
      patient: { givenName: 'AutoHist', familyName: 'Tester', gender: 'F' },
    });
    await SectionFormPage.openEdit(page, FORM, section);
  });

  // when :306, :368, :397, :832
  const whens = [
    { name: 'days of lost schooling', wrapper: '#missed-school-a', on: 'Yes', off: 'No', target: '#days-missed-a' },
    { name: 'social support details', wrapper: '#social-support', on: 'Yes', off: 'No', target: '#specify-support' },
    { name: 'other referral text', wrapper: '#referral-type', on: 'other', off: 'OPD', target: '#other-referral-text' },
    { name: 'comorbidity details', wrapper: '#underlying-comorbidity', on: 'Yes', off: 'No', target: '#comorbitity-details' },
  ];
  for (const w of whens) {
    test(`${w.name} (${w.target}) shows only when "${w.on}" is selected`, async ({ page }) => {
      await expect(page.locator(w.target)).toBeHidden();
      await pick(page, w.wrapper, w.on);
      await expect(page.locator(w.target)).toBeVisible();
      await pick(page, w.wrapper, w.off);
      await expect(page.locator(w.target)).toBeHidden();
    });
  }

  // toggle :434, targets from the includeIf :438
  const categories = [
    ['diabetes', 'Diabetes'],
    ['htn', 'Hypertension'],
    ['heart_failure', 'Heart failure'],
    ['respire', 'Chronic lung disease'],
    ['kidney_failure', 'Chronic kidney disease'],
    ['cirrhosis', 'Liver disease'],
    ['palliative', 'Palliative care'],
    ['sickle', 'Sickle cell'],
    ['other-ncd', 'Other'],
  ];
  test('each NCD category shows its onset date only while ticked', async ({ page }) => {
    for (const [nick, label] of categories) {
      const box = page.locator(`#${nick}-onset-q`).getByLabel(label, { exact: true });
      await expect(page.locator(`#${nick}-onset-date`), `${nick} starts hidden`).toBeHidden();
      await box.check();
      await expect(page.locator(`#${nick}-onset-date`), `${nick} shown`).toBeVisible();
      await box.uncheck();
      await expect(page.locator(`#${nick}-onset-date`), `${nick} hidden again`).toBeHidden();
    }
  });

  // includeIf :438 (onset dates: initial and part 1) and :848 (reason for visit / clinical notes: initial only)
  const byType = [
    { type: 'NCD initial', uuid: NCD_INITIAL_ENCOUNTER_TYPE_UUID, onset: 1, reason: 1 },
    { type: 'NCD initial part 1', uuid: NCD_INITIAL_1_ENCOUNTER_TYPE_UUID, onset: 1, reason: 0 },
    { type: 'NCD followup', uuid: NCD_FOLLOWUP_ENCOUNTER_TYPE_UUID, onset: 0, reason: 0 },
  ];
  for (const t of byType) {
    test(`on a ${t.type} encounter: onset dates ${t.onset ? 'render' : 'do not render'}, reason for visit ${t.reason ? 'renders' : 'does not render'}`, async ({
      page,
      createSectionEncounter,
    }) => {
      const other = await createSectionEncounter({
        encounterTypeUuid: t.uuid,
        patient: { givenName: 'AutoHist', familyName: 'Tester', gender: 'F' },
      });
      await SectionFormPage.openEdit(page, FORM, other);
      await expect(page.locator('#diabetes-onset-date')).toHaveCount(t.onset);
      await expect(page.locator('#reason-for-visit')).toHaveCount(t.reason);
    });
  }

  test('MUAC (age < 13 at the encounter, :679) and Pregnancy (female, :744) depend on the patient', async ({
    page,
    createSectionEncounter,
  }) => {
    // the adult woman opened in beforeEach
    await expect(page.locator('#muac-results')).toHaveCount(0);
    await expect(page.getByText('Pregnancy', { exact: true })).toBeVisible();

    const boy = await createSectionEncounter({
      encounterTypeUuid: NCD_INITIAL_ENCOUNTER_TYPE_UUID,
      patient: { givenName: 'AutoHist', familyName: 'Tester', gender: 'M', birthdate: birthdateYearsAgo(8) },
    });
    await SectionFormPage.openEdit(page, FORM, boy);
    await expect(page.locator('#muac-results')).toHaveCount(1);
    await expect(page.getByText('Pregnancy', { exact: true })).toHaveCount(0);
  });

  test('the last-vitals panel is hidden without a vitals encounter and filled from one in the visit', async ({
    page,
    api,
  }) => {
    // script :63-186; BMI = weight / (height/100)^2 = 70 / 1.7^2 = 24.2
    await expect(page.locator('#lastVitals')).toBeHidden();
    await addVitalsEncounter(api, section, [
      { concept: WEIGHT_CONCEPT_UUID, value: 70 },
      { concept: HEIGHT_CONCEPT_UUID, value: 170 },
    ]);
    await page.reload();
    await expect(page.locator('#lastVitals')).toBeVisible();
    await expect(page.locator('#last_weight')).toHaveText('70');
    await expect(page.locator('#last_height')).toHaveText('170');
    await expect(page.locator('#last_bmi')).toHaveText('24.2');
    await expect(page.locator('#fbg_span')).toBeVisible();
  });

  test('a random glucose in the last vitals swaps the fasting label for the random one', async ({ page, api }) => {
    await addVitalsEncounter(api, section, [{ concept: RANDOM_GLUCOSE_CONCEPT_UUID, value: 120 }]);
    await page.reload();
    await expect(page.locator('#last_fbg')).toHaveText('120');
    await expect(page.locator('#rbg_span')).toBeVisible();
    await expect(page.locator('#fbg_span')).toBeHidden();
  });

  test('the required fields block the save when blank', async ({ page }) => {
    // required="true" on the 11 Patient Details questions (:246-:405)
    const form = new SectionFormPage(page, FORM);
    await form.save();
    await expect(page).not.toHaveURL(/referenceapplication\/home\.page/);
    await expect(page.locator('span.field-error', { hasText: 'Required' })).toHaveCount(11);
  });

  test('days of lost schooling typed and then hidden by answering No is not saved (when :306)', async ({ page, api }) => {
    await fillRequired(page, { missedSchool: 'Yes' });
    await page.locator('#days-missed-a input').fill('4');
    await pick(page, '#missed-school-a', 'No');
    await expect(page.locator('#days-missed-a')).toBeHidden();

    const form = new SectionFormPage(page, FORM);
    await form.save();
    await form.expectSaved();

    const obs = await getEncounterObs(api, section.encounter.uuid);
    expect(obs.some((o) => o.concept.display.toLowerCase().includes('missed days of school'))).toBeFalsy();
  });

  test('saves the patient details, an NCD category with onset date and the vitals, and enrolls in the NCD program', async ({
    page,
    api,
  }) => {
    await fillRequired(page, { missedSchool: 'Yes' });
    await page.locator('#days-missed-a input').fill('4');
    await page.locator('#diabetes-onset-q').getByLabel('Diabetes', { exact: true }).check();
    await setDate(page, '#diabetes-onset-date', 2024, 2, 15);
    await page.locator('#bp_systolic input').fill('150');
    await page.locator('#bp_diastolic input').fill('95');

    const form = new SectionFormPage(page, FORM);
    await form.save();
    await form.expectSaved();

    const displays = (await getEncounterObs(api, section.encounter.uuid)).map((o) => `${o.concept.display}: ${o.display}`.toLowerCase());
    expect(displays.some((d) => d.includes('scheduled'))).toBeTruthy();
    expect(displays.some((d) => d.includes('diabetes'))).toBeTruthy();
    expect(displays.some((d) => d.includes('2024'))).toBeTruthy(); // onset date
    expect(displays.some((d) => d.includes('150'))).toBeTruthy();
    expect(displays.some((d) => d.includes('95'))).toBeTruthy();

    // <enrollInProgram programId="NCD"> at :421
    const res = await api.get(
      `programenrollment?patient=${section.patient.uuid}&v=custom:(program:(name),dateCompleted)`,
    );
    expect(res.ok()).toBeTruthy();
    const enrollments = (await res.json()).results as Array<{ program: { name: string } }>;
    expect(enrollments.some((e) => /ncd/i.test(e.program.name))).toBeTruthy();

    // EDIT starts from the saved values: the when/toggle targets are already shown
    await SectionFormPage.openEdit(page, FORM, section);
    await expect(page.locator('#days-missed-a')).toBeVisible();
    await expect(page.locator('#diabetes-onset-date')).toBeVisible();
    await expect(page.locator('#specify-support')).toBeHidden();
  });
});
