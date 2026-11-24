import { type Page, type APIRequestContext } from '@playwright/test';
import { test, expect, birthdateYearsAgo, type CustomTestFixtures, type EntryContext } from '../../core';
import { MCH_OPD_LOCATION_UUID } from '../../core/constants';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import { EntryFormPage, expectViewShowsSavedObs, selectDefaultProvider, VISIT_PAGE_URL } from '../../pages';

// vitalsWithGlucose.xml: "Vitals with glucose" (vitals.xml without TB screening/mobility/"confused", with a second BP
// and a "Glucose fingerstick" question: fasting yes/no, FBG, RBG, coded glucose). Reached with a synthetic patient with
// an active visit and no encounter. Most tests open enterHtmlFormWithStandardUi (EntryFormPage); production opens the
// form in the Simple UI (one question per screen, _availability.e2e.md), the only UI in which ExitHandlers and
// NavigatorController exist, so the tests of the glucose toggle and of the cm<->mm MUAC converter open
// enterHtmlFormWithSimpleUi (local helper openSimple). Availability (Vitals Glucose Location tag, retro) is not exercised.
// Session location MCH OPD carries the Vitals Glucose Location tag, so the location select is preset.
//
// Conditions in the form, from documentation inventory (vitalsWithGlucose.inv.md); the age is as of today (ENTER):
//   includeIf age > 5                :192, :556   BMI script / BMI box, and BP "expected" class (:235)
//   includeIf age < 13 or female     :277, :698   MUAC box (cm input + mm obs) and its cm<->mm script
//   includeIf age < 13 / age > 12    :724, :728   muac_cm max 27 (child) / 56 (female 13+)
//   includeIf age < 5                :754         z-score obs
//   includeIf age < 3                :359, :770   head circumference and MUAC/HC ratio box and script
//   includeIf MCH OPD, female, age >= 10 :861 the Pregnancy status question (SL-1527) and the Pregnancy group. The location is the encounter's
//                                    (EDIT/VIEW), else the login location; the specs log in at MCH OPD (core/global-setup.ts)
//   when #pregnant = no              :877         show #delivered-last-6-weeks (SL-1527)
//   ifMode VIEW (include true/false) :30-:720     view-only vs entry-only blocks (VIEW is tested, on the visit page)
// Scripts: :131 Fahrenheit / lbs / inches converters (V2); :194-233 BMI = kg/(cm/100)^2, one decimal; :279-326 cm -> mm
//   (x10) and mm -> cm (/10) on exit of muac_cm/muac_mm (V3); :360-399 ratio = (mm/10)/HC; :454-485 glucose toggle on
//   change of #fasting: Yes (CIEL:1065, "FBG") enables #fbg and disables/hides #rbg and #glucose-coded; No (CIEL:1066,
//   "RBG") the reverse; no answer hides all three (NavigatorController, Simple UI only).
// Required: "Is patient pregnant?" (#pregnant :872) and, when shown, "delivered in the last 6 weeks" (#delivered-6-weeks), both only where the
//   Pregnancy status question is on the form (:861); a required field hidden by controls is not required (htmlformentry HTML-880).
//   Encounter location is required (subform).
// Side effects on save: postSubmissionAction PregnancyStatusProgramEnrollmentAction (:21, pihcore, SL-1527): pregnant = yes enrolls in the
//   Pregnancy program (Antenatal), pregnant = no + delivered = yes (Delivered), on the encounter date, only when no Pregnancy enrollment is
//   active then; without the questions (not MCH OPD, male, under 10) it does nothing. No order or disposition. Encounter type 2fd151a2-... (Vitals).
// VIEW (on the visit page) is covered by the 'VIEW:' tests: the saved values, the glucose block with its FBG/RBG labels, and what
// the VIEW scripts compute (BMI, MUAC/HC ratio) and hide (a vital with no value, SL-337); they run when the visit page inserts the HTML.
// Not covered: EDIT mode, retro-entry gating, shared provider/location/date behaviour (_shared.e2e.md).
//
// Findings:
//   V1 Low  :15 vs :490  id="vitals-with-glucose" is on both the <htmlform> and the <section> (two elements in the page);
//                        the VIEW css (#vitals-with-glucose ...) and any `#vitals-with-glucose` locator match both. Fix: rename one.
//   V2 Low  :131-188     ExitHandlers for 'fahrenheit', 'lbs', 'inches': no input carries those classes, so the converters
//                        never run. Fix: delete the script.
//   V3 Low  :280-282     convertCmToMm = cm*10 without rounding: muac_cm 15.35 writes 153.5 into the integer mm obs, which then
//                        fails with "Must be a whole number" on a field the user did not type. Fix: Math.round(cm * 10).
//   V4 Low  :816,829,837 `<uimessage code="Glucose fingerstick"/>` and the FBG/RBG labels use English text as message codes
//                        (not translated); :594 English answerLabels. Fix: real codes.
//   V5 Info Standard UI: `ExitHandlers/NavigatorController is not defined` is thrown by :131, :291 and :454, so there
//                        all three glucose fields stay visible and cm<->mm conversion does not run (Simple UI works).
//   VW1 Low :212-234,:434-447,:555-574  in VIEW the BMI fieldset stays visible with only its "(Calculated) BMI" heading when the BMI cannot be computed (no
//                        height or weight, patient over 5): the SL-337 rule (:434) only hides a fieldset that has no .value, and the empty #calculated-bmi span has the
//                        class "value". Fix: hide the BMI fieldset in the VIEW script when no BMI was computed. TESTED below (test.fixme).
// Note (not a finding): the VIEW prints the glucose block as it is stored and not as it was answered: with FBG saved, the empty RBG value and the unselected
//   High/Low answers are listed too, because the glucose toggle script is ENTER/EDIT only (tested).

// The Standard UI pages do not load uicommons' navigator/exitHandlers.js (only the Simple UI pages do), so the form's top-level `ExitHandlers[...] = ...` lines (and, in vitalsWithGlucose, the
// glucose script's NavigatorController calls) throw on load (V6): tolerated on the Standard UI pages only; the Simple UI tests still fail on any JavaScript error. Remove this line when SL-1522 is fixed.
test.use({ allowedJsErrors: [/WithStandardUi[\s\S]*(ExitHandlers|NavigatorController) is not defined/] });

const FORM = 'vitalsWithGlucose.xml';
const PREGNANCY_PROGRAM = '6a5713c2-3fd5-46e7-8f25-36a0f7871e12';
const NCD_LOCATION_UUID = '7a17bfc6-4032-4784-98cd-59d819c03b43'; // a Vitals Glucose Location other than MCH OPD
const VITALS_ENCOUNTER_TYPE_UUID = '2fd151a2-fbef-43e3-b82d-c3f70f1d7333';

// Local helpers (duplicated in vitals.spec.ts on purpose).
const openSimple = async (page: Page, context: EntryContext) => {
  await page.goto(EntryFormPage.enterUrl(FORM, context).replace('enterHtmlFormWithStandardUi', 'enterHtmlFormWithSimpleUi'));
  await expect(page.locator('#save-form')).toBeVisible();
};
const goToQuestion = async (page: Page, label: string) => {
  await page.locator('li.question-legend', { hasText: new RegExp(`^\\s*${label}\\s*$`) }).click();
};
// <submit/> renders "Enter Form" (input.submitButton), not #submit
const saveStandard = async (page: Page) => {
  await selectDefaultProvider(page);
  await page.locator('input.submitButton').click();
};
const blur = async (page: Page, selector: string, value: string) => {
  await page.locator(selector).fill(value);
  await page.locator(selector).press('Tab');
};
const savedObs = async (api: APIRequestContext, patientUuid: string) => {
  const encounters = await getPatientEncounters(api, patientUuid);
  expect(encounters).toHaveLength(1);
  const obs = await getEncounterObs(api, encounters[0].uuid);
  return { encounterType: encounters[0].encounterType.uuid, displays: obs.map((o) => o.display) };
};

// Simple UI: answers the Pregnancy status question (SL-1527), required for a woman at MCH OPD.
const answerPregnancy = async (page: Page, pregnant: 'yes' | 'no', delivered?: 'yes' | 'no') => {
  await goToQuestion(page, 'Pregnancy status');
  await page.locator('#pregnant').getByLabel(pregnant, { exact: true }).check();
  if (delivered) {
    await page.locator('#delivered-6-weeks').getByLabel(delivered, { exact: true }).check();
  }
};
// Simple UI: Save opens the confirmation screen, whose button submits.
const saveSimple = async (page: Page) => {
  await page.locator('#save-form').click();
  await page.locator('button.submitButton:visible').click();
};
// The patient's Pregnancy program enrollments with their states (concept name, start, end), voided states left out.
const pregnancyEnrollments = async (api: APIRequestContext, patientUuid: string) => {
  const res = await api.get(
    `programenrollment?patient=${patientUuid}&v=custom:(program:(uuid),dateEnrolled,dateCompleted,states:(state:(concept:(display)),startDate,endDate,voided))`,
  );
  expect(res.ok(), `get enrollments: ${res.status()}`).toBeTruthy();
  type Enrollment = {
    program: { uuid: string };
    dateEnrolled: string;
    dateCompleted: string | null;
    states: Array<{ state: { concept: { display: string } }; startDate: string; endDate: string | null; voided: boolean }>;
  };
  return ((await res.json()).results as Enrollment[])
    .filter((e) => e.program.uuid === PREGNANCY_PROGRAM)
    .map((e) => ({ dateEnrolled: e.dateEnrolled, dateCompleted: e.dateCompleted, states: e.states.filter((st) => !st.voided) }));
};

const newPatient = (createEntryContext: CustomTestFixtures['createEntryContext'], gender: 'M' | 'F', age: number) =>
  createEntryContext({ givenName: 'AutoGlucose', familyName: 'Tester', gender, birthdate: birthdateYearsAgo(age) });

test.describe('vitalsWithGlucose', () => {
  // includeIf :192/:556 (BMI, BP expected), :277/:698 (MUAC), :724/:728 (muac_cm max), :754 (z-score), :359/:770 (HC, ratio)
  const profiles = [
    { name: 'adult male', gender: 'M', age: 30, bmi: true, muacMax: null, zscore: false, head: false },
    { name: 'adult female', gender: 'F', age: 30, bmi: true, muacMax: '56', zscore: false, head: false },
    { name: '8 year old', gender: 'M', age: 8, bmi: true, muacMax: '27', zscore: false, head: false },
    { name: '4 year old', gender: 'M', age: 4, bmi: false, muacMax: '27', zscore: true, head: false },
    { name: '2 year old', gender: 'M', age: 2, bmi: false, muacMax: '27', zscore: true, head: true },
  ] as const;

  for (const p of profiles) {
    test(`age/gender conditional boxes for the ${p.name}`, async ({ page, createEntryContext }) => {
      const context = await newPatient(createEntryContext, p.gender, p.age);
      await EntryFormPage.open(page, FORM, context);

      await expect(page.locator('#calculated-bmi-wrapper')).toHaveCount(p.bmi ? 1 : 0);
      await expect(page.locator('#bp_systolic input')).toHaveClass(p.bmi ? /expected/ : /^(?!.*expected).*$/); // :235 inside the age > 5 block
      await expect(page.locator('#muac_cm')).toHaveCount(p.muacMax ? 1 : 0);
      if (p.muacMax) {
        await expect(page.locator('#muac_cm')).toHaveAttribute('max', p.muacMax);
      }
      await expect(page.locator('#z_score')).toHaveCount(p.zscore ? 1 : 0);
      await expect(page.locator('#head_cm')).toHaveCount(p.head ? 1 : 0);
      await expect(page.locator('#calculated-ratio-wrapper')).toHaveCount(p.head ? 1 : 0);
    });
  }

  test('BMI is calculated from weight and height and hidden when one is missing', async ({ page, createEntryContext }) => {
    // BMI script :205-233 (age > 5)
    const context = await newPatient(createEntryContext, 'M', 30);
    await EntryFormPage.open(page, FORM, context);
    await expect(page.locator('#calculated-bmi-wrapper')).toBeHidden();
    await expect(page.locator('#no-calculated-bmi')).toBeVisible();

    await blur(page, '#height_cm input', '170');
    await blur(page, '#weight_kg input', '70');
    await expect(page.locator('#calculated-bmi-wrapper')).toBeVisible();
    await expect(page.locator('#calculated-bmi')).toHaveText('24.2');
    await expect(page.locator('#no-calculated-bmi')).toBeHidden();

    await blur(page, '#height_cm input', '');
    await expect(page.locator('#calculated-bmi-wrapper')).toBeHidden();
  });

  test('MUAC/HC ratio is calculated from MUAC (mm) and head circumference (cm) for a child under 3', async ({ page, createEntryContext }) => {
    // ratio script :371-399 (age < 3): (140 / 10) / 45 = 0.31
    const context = await newPatient(createEntryContext, 'M', 2);
    await EntryFormPage.open(page, FORM, context);
    await expect(page.locator('#calculated-ratio-wrapper')).toBeHidden();

    await blur(page, '#muac_mm input', '140');
    await blur(page, '#head_cm input', '45');
    await expect(page.locator('#calculated-ratio-wrapper')).toBeVisible();
    await expect(page.locator('#calculated-ratio')).toHaveText('0.3');
  });

  test('saves vitals with both blood pressures and glucose (Standard UI) as one Vitals encounter', async ({ page, api, createEntryContext }) => {
    const context = await newPatient(createEntryContext, 'M', 30);
    const form = await EntryFormPage.open(page, FORM, context);
    await blur(page, '#temperature_c input', '37.5');
    await blur(page, '#heart_rate input', '80');
    await blur(page, '#bp_systolic input', '120');
    await blur(page, '#bp_diastolic input', '80');
    await blur(page, '#bp_systolic2 input', '130');
    await blur(page, '#bp_diastolic2 input', '85');
    await blur(page, '#o2_sat input', '98');
    await page.locator('#fasting input[type=radio]').first().check(); // Yes = FBG
    await blur(page, '#fbg input', '5.5'); // no toggle in Standard UI (V5)
    await saveStandard(page);
    await form.expectSaved();

    const saved = await savedObs(api, context.patient.uuid);
    expect(saved.encounterType).toBe(VITALS_ENCOUNTER_TYPE_UUID);
    expect(saved.displays).toEqual(
      expect.arrayContaining([
        'Temperature (C): 37.5',
        'Pulse: 80',
        'Systolic: 120',
        'Diastolic: 80',
        'Blood oxygen saturation: 98',
        'Patient fasting for blood glucose test: Yes',
        'Fasting blood glucose (mmol/L): 5.5',
      ]),
    );
    expect(saved.displays.filter((d) => d.includes('130') || d.includes('85'))).toHaveLength(2); // second BP pair
  });

  test('saving without a location does not save (required encounter location)', async ({ page, createEntryContext }) => {
    // encounter-provider-location-date subform: location select is required
    const context = await newPatient(createEntryContext, 'M', 30);
    await EntryFormPage.open(page, FORM, context);
    await page.locator('#w3').selectOption({ index: 0 });
    await blur(page, '#temperature_c input', '37');
    await saveStandard(page);
    await expect(page.locator('span.field-error', { hasText: 'required' }).first()).toBeVisible();
    await expect(page).not.toHaveURL(VISIT_PAGE_URL);
  });

  test('Simple UI: the glucose fields follow the fasting answer', async ({ page, createEntryContext }) => {
    // glucose toggle :454-485
    const context = await newPatient(createEntryContext, 'F', 30);
    await openSimple(page, context);
    await selectDefaultProvider(page); // the navigator does not leave "Details" while the required provider is empty
    await goToQuestion(page, 'Glucose');
    const fbg = page.locator('#fbg input');
    const rbg = page.locator('#rbg input');
    const coded = page.locator('#glucose-coded input[type=radio]').first();
    const fasting = page.locator('#fasting input[type=radio]');

    await expect(fbg).toBeHidden(); // no answer: all three hidden
    await expect(rbg).toBeHidden();
    await expect(coded).toBeHidden();

    await fasting.nth(0).check(); // Yes -> FBG
    await expect(fbg).toBeVisible();
    await expect(rbg).toBeHidden();
    await expect(coded).toBeHidden();

    await fbg.fill('5.5');
    await fasting.nth(1).check(); // No -> RBG + coded
    await expect(fbg).toBeHidden();
    await expect(rbg).toBeVisible();
    await expect(coded).toBeVisible();

    await fasting.nth(0).check(); // back to Yes: the RBG branch is disabled again
    await expect(rbg).toBeHidden();
    await expect(rbg).toBeDisabled();
    await expect(fbg).toBeEnabled();
  });

  test('Simple UI: a random glucose saves RBG and the coded result and no FBG', async ({ page, api, createEntryContext }) => {
    const context = await newPatient(createEntryContext, 'F', 30);
    await openSimple(page, context);
    await selectDefaultProvider(page);
    await goToQuestion(page, 'Glucose');
    await page.locator('#fasting input[type=radio]').nth(0).check(); // Yes first: FBG value must not survive the switch
    await page.locator('#fbg input').fill('5.5');
    await page.locator('#fasting input[type=radio]').nth(1).check(); // No -> RBG
    await page.locator('#rbg input').fill('7.1');
    await page.locator('#glucose-coded input[type=radio]').nth(1).check();
    await answerPregnancy(page, 'no', 'no'); // required for a woman at MCH OPD (SL-1527)
    await saveSimple(page);
    await expect(page).toHaveURL(VISIT_PAGE_URL);

    const saved = await savedObs(api, context.patient.uuid);
    expect(saved.encounterType).toBe(VITALS_ENCOUNTER_TYPE_UUID);
    expect(saved.displays).toEqual(expect.arrayContaining(['Patient fasting for blood glucose test: No']));
    expect(saved.displays.some((d) => d.includes('7.1'))).toBe(true);
    expect(saved.displays.some((d) => d.startsWith('Fasting blood glucose'))).toBe(false);
    expect(saved.displays.some((d) => d.includes('5.5'))).toBe(false);

    // VIEW: the answer "No" is labelled RBG, the random value and the coded result are values, the discarded FBG is not
    const [encounter] = await getPatientEncounters(api, context.patient.uuid);
    const view = await expectViewShowsSavedObs(page, api, FORM, encounter.uuid, { 'Patient fasting for blood glucose test: No': '[X] RBG' });
    const glucose = view.root.locator('fieldset', { hasText: 'Glucose fingerstick' });
    await expect(glucose.locator('.value')).toHaveText(['[X] RBG', '7.1', '[X] Low']); // the second coded answer
    await expect(glucose.locator('#fbg .value')).toHaveCount(0); // the FBG is empty
    await expect(glucose).not.toContainText('5.5');
  });

  test('Simple UI: MUAC cm and mm fields convert both ways and cm is limited to 56 (female) / 27 (child)', async ({ page, createEntryContext }) => {
    // cm -> mm and mm -> cm handlers :291-326 (adult female); max from :724/:728
    const context = await newPatient(createEntryContext, 'F', 30);
    await openSimple(page, context);
    await selectDefaultProvider(page);
    await goToQuestion(page, 'MUAC');
    await blur(page, '#muac_cm', '15');
    await expect(page.locator('#muac_mm input')).toHaveValue('150');
    await blur(page, '#muac_mm input', '200');
    await expect(page.locator('#muac_cm')).toHaveValue('20');

    await goToQuestion(page, 'MUAC'); // Tab from the last MUAC field moved on to the next question
    await blur(page, '#muac_cm', '60');
    await expect(page.locator('span.field-error', { hasText: 'Maximum: 56' })).toBeVisible();
  });

  test('Simple UI: a child MUAC above 27 cm is refused', async ({ page, createEntryContext }) => {
    // :724 max 27 for age < 13
    const context = await newPatient(createEntryContext, 'M', 8);
    await openSimple(page, context);
    await selectDefaultProvider(page);
    await goToQuestion(page, 'MUAC');
    await blur(page, '#muac_cm', '30');
    await expect(page.locator('span.field-error', { hasText: 'Maximum: 27' })).toBeVisible();
  });

  // ---- SL-1527: Pregnancy status (:861) and the Pregnancy program enrollment (:21) ----
  test('Simple UI: a woman at MCH OPD is asked "Is patient pregnant?", and "delivered in the last 6 weeks" only when not pregnant', async ({
    page,
    createEntryContext,
  }) => {
    const context = await newPatient(createEntryContext, 'F', 30);
    await openSimple(page, context);
    await selectDefaultProvider(page);
    await goToQuestion(page, 'Pregnancy status');
    await expect(page.locator('#pregnant')).toBeVisible();
    await expect(page.locator('#delivered-last-6-weeks')).toBeHidden();
    await page.locator('#pregnant').getByLabel('no', { exact: true }).check();
    await expect(page.locator('#delivered-last-6-weeks')).toBeVisible();
    await page.locator('#delivered-6-weeks').getByLabel('yes', { exact: true }).check();
    await page.locator('#pregnant').getByLabel('yes', { exact: true }).check();
    await expect(page.locator('#delivered-last-6-weeks')).toBeHidden();
    await expect(page.locator('#delivered-6-weeks input[type=radio]:checked')).toHaveCount(0); // hiding clears the answer
  });

  // includeIf :861: only female, 10 or older, at MCH OPD
  const notAsked = [
    { name: 'a man', gender: 'M', age: 30 },
    { name: 'a 9 year old girl', gender: 'F', age: 9 },
  ] as const;
  for (const n of notAsked) {
    test(`Simple UI: ${n.name} at MCH OPD is not asked the pregnancy status`, async ({ page, createEntryContext }) => {
      const context = await newPatient(createEntryContext, n.gender, n.age);
      await openSimple(page, context);
      await expect(page.locator('li.question-legend', { hasText: 'Glucose' })).toHaveCount(1);
      await expect(page.locator('li.question-legend', { hasText: 'Pregnancy status' })).toHaveCount(0);
      await expect(page.locator('#pregnant')).toHaveCount(0);
    });
  }

  test('Simple UI: a woman seen outside MCH OPD is not asked the pregnancy status, and is not enrolled', async ({ page, api, createEntryContext }) => {
    const context = await newPatient(createEntryContext, 'F', 30);
    // the login location decides (ENTER); every test shares the login session, so it is set back to MCH OPD afterwards
    const moved = await page.request.post('ws/rest/v1/session', { data: { sessionLocation: NCD_LOCATION_UUID } });
    expect(moved.ok(), `session location: ${moved.status()}`).toBeTruthy();
    try {
      await openSimple(page, context);
      await expect(page.locator('li.question-legend', { hasText: 'Pregnancy status' })).toHaveCount(0);
      await expect(page.locator('#pregnant')).toHaveCount(0);
      await selectDefaultProvider(page);
      await page.locator('#encounterLocation select').selectOption({ label: 'NCD' }); // this NCD login location is not one of the options
      await saveSimple(page);
      await expect(page).toHaveURL(VISIT_PAGE_URL);
      expect(await pregnancyEnrollments(api, context.patient.uuid)).toEqual([]);
    } finally {
      const back = await page.request.post('ws/rest/v1/session', { data: { sessionLocation: MCH_OPD_LOCATION_UUID } });
      expect(back.ok(), `session location back: ${back.status()}`).toBeTruthy();
    }
  });

  // The navigator enforces class="required" (:<field class="required">): Save stops on the unanswered question instead of opening the
  // confirmation. "delivered" is disabled by the form's script unless pregnant = no, so it is required only when it is shown.
  test('Simple UI: the pregnancy status is required, and "delivered in the last 6 weeks" too when not pregnant', async ({ page, api, createEntryContext }) => {
    const context = await newPatient(createEntryContext, 'F', 30);
    await openSimple(page, context);
    await selectDefaultProvider(page);
    const confirm = page.locator('button.submitButton:visible');

    await page.locator('#save-form').click();
    await expect(page.locator('#pregnant')).toBeVisible(); // stopped on the pregnancy status
    await expect(confirm).toHaveCount(0);

    await page.locator('#pregnant').getByLabel('no', { exact: true }).check();
    await page.locator('#save-form').click();
    await expect(page.locator('#delivered-6-weeks')).toBeVisible(); // stopped on "delivered"
    await expect(confirm).toHaveCount(0);

    await page.locator('#delivered-6-weeks').getByLabel('no', { exact: true }).check();
    await saveSimple(page);
    await expect(page).toHaveURL(VISIT_PAGE_URL);
    const saved = await savedObs(api, context.patient.uuid);
    expect(saved.displays).toEqual(expect.arrayContaining(['Pregnancy status: No', 'Delivered within the last 6 weeks: No']));
    expect(await pregnancyEnrollments(api, context.patient.uuid)).toEqual([]); // no + no: not enrolled
  });

  const enrollments = [
    { name: 'pregnant enrolls in the Pregnancy program, Antenatal', pregnant: 'yes', state: 'Antenatal' },
    { name: 'not pregnant, delivered in the last 6 weeks, enrolls in the Pregnancy program, Delivered', pregnant: 'no', delivered: 'yes', state: 'Delivered' },
  ] as const;
  for (const e of enrollments) {
    test(`Simple UI: postSubmissionAction :21: ${e.name} (SL-1527)`, async ({ page, api, createEntryContext }) => {
      const context = await newPatient(createEntryContext, 'F', 30);
      await openSimple(page, context);
      await selectDefaultProvider(page);
      await answerPregnancy(page, e.pregnant, 'delivered' in e ? e.delivered : undefined);
      await saveSimple(page);
      await expect(page).toHaveURL(VISIT_PAGE_URL);

      const [encounter] = await getPatientEncounters(api, context.patient.uuid);
      const res = await api.get(`encounter/${encounter.uuid}?v=custom:(encounterDatetime)`);
      const when = new Date((await res.json()).encounterDatetime);
      const found = await pregnancyEnrollments(api, context.patient.uuid);
      expect(found).toHaveLength(1);
      expect(new Date(found[0].dateEnrolled).getTime()).toBe(when.getTime()); // enrolled on the encounter date
      expect(found[0].dateCompleted).toBeNull();
      expect(found[0].states.map((st) => st.state.concept.display)).toEqual([e.state]);
      expect(new Date(found[0].states[0].startDate).toDateString()).toBe(when.toDateString()); // a state start has no time
      expect(found[0].states[0].endDate).toBeNull();
    });
  }

  // VIEW (on the visit page): saved values in span.value, with the scripts of the form running as they do on the visit page.
  test('VIEW: shows both blood pressures and the fasting glucose under the form\'s FBG/RBG labels, and hides the vitals that were not recorded', async ({
    page,
    api,
    createEntryContext,
  }) => {
    const context = await newPatient(createEntryContext, 'M', 30);
    const form = await EntryFormPage.open(page, FORM, context);
    await blur(page, '#temperature_c input', '37.5');
    await blur(page, '#heart_rate input', '80');
    await blur(page, '#bp_systolic input', '120');
    await blur(page, '#bp_diastolic input', '80');
    await blur(page, '#bp_systolic2 input', '130');
    await blur(page, '#bp_diastolic2 input', '85');
    await blur(page, '#o2_sat input', '98');
    await page.locator('#fasting input[type=radio]').first().check(); // Yes = FBG
    await blur(page, '#fbg input', '5.5');
    await saveStandard(page);
    await form.expectSaved();
    const [encounter] = await getPatientEncounters(api, context.patient.uuid);

    // "FBG" is the form's label of the answer Yes (answerCodes), so the obs "Patient fasting for blood glucose test: Yes" shows as "[X] FBG"
    const view = await expectViewShowsSavedObs(page, api, FORM, encounter.uuid, { 'Patient fasting for blood glucose test: Yes': '[X] FBG' });
    // (the empty BMI span of an adult with no height/weight is a span.value too: VW1)
    expect((await view.valueTexts()).filter((t) => t !== '')).toEqual(['37.5', '80', '120', '80', '130', '85', '98', '[X] FBG', '5.5']);
    // each pair is shown under its own heading
    await expect(view.root.locator('fieldset', { hasText: 'Blood Pressure #1' }).locator('.value')).toHaveText(['120', '80']);
    await expect(view.root.locator('fieldset', { hasText: 'Blood Pressure #2' }).locator('.value')).toHaveText(['130', '85']);
    // the glucose block is printed as stored: FBG answered, the RBG value and the High/Low answers listed empty (the toggle script is ENTER/EDIT only)
    const glucose = view.root.locator('fieldset', { hasText: 'Glucose fingerstick' });
    await expect(glucose.locator('.value')).toHaveText(['[X] FBG', '5.5']);
    await expect(glucose.locator('.emptyValue')).toHaveCount(4); // RBG answer, RBG value, High, Low
    // a vital with no value is hidden (SL-337), the others stay
    for (const empty of ['chief_complaint', 'height_cm', 'weight_kg', 'respiratory_rate']) {
      await expect(view.root.locator(`#${empty}`).locator('xpath=ancestor::fieldset[1]'), empty).toBeHidden();
    }
    for (const filled of ['temperature_c', 'heart_rate', 'o2_sat']) {
      await expect(view.root.locator(`#${filled}`).locator('xpath=ancestor::fieldset[1]'), filled).toBeVisible();
    }
    await expect(view.root.locator('#buttons, input[type=text], input[type=radio], textarea, select')).toHaveCount(0); // read-only
  });

  test('VIEW: a height and weight give the BMI (computed by the VIEW), and a child under 3 the MUAC/HC ratio', async ({ page, api, createEntryContext }) => {
    const adult = await newPatient(createEntryContext, 'M', 30);
    const adultForm = await EntryFormPage.open(page, FORM, adult);
    await blur(page, '#height_cm input', '170');
    await blur(page, '#weight_kg input', '70');
    await saveStandard(page);
    await adultForm.expectSaved();
    const [adultEncounter] = await getPatientEncounters(api, adult.patient.uuid);
    const adultView = await expectViewShowsSavedObs(page, api, FORM, adultEncounter.uuid);
    await expect(adultView.root.locator('#calculated-bmi')).toHaveText('24.2'); // 70 / 1.7^2

    const child = await newPatient(createEntryContext, 'M', 2);
    const childForm = await EntryFormPage.open(page, FORM, child);
    await blur(page, '#muac_mm input', '140');
    await blur(page, '#head_cm input', '45');
    await saveStandard(page);
    await childForm.expectSaved();
    const [childEncounter] = await getPatientEncounters(api, child.patient.uuid);
    const childView = await expectViewShowsSavedObs(page, api, FORM, childEncounter.uuid);
    await expect(childView.root.locator('#calculated-ratio')).toHaveText('0.3'); // (140 / 10) / 45
    await expect(childView.root.locator('#calculated-bmi-wrapper')).toHaveCount(0); // no BMI under 5
  });

  // VW1 (Low): the BMI fieldset is not hidden by the VIEW scripts when the BMI cannot be computed. Intended: hidden like the other vitals that were not
  // recorded. Remove test.fixme() when fixed.
  test('VIEW: no "(Calculated) BMI" heading when the height or weight was not recorded (VW1)', async ({ page, api, createEntryContext }) => {
    test.fixme();
    const context = await newPatient(createEntryContext, 'M', 30);
    const form = await EntryFormPage.open(page, FORM, context);
    await blur(page, '#temperature_c input', '37.5');
    await saveStandard(page);
    await form.expectSaved();
    const [encounter] = await getPatientEncounters(api, context.patient.uuid);

    const view = await expectViewShowsSavedObs(page, api, FORM, encounter.uuid);
    await expect(view.root.locator('#calculated-bmi').locator('xpath=ancestor::fieldset[1]')).toBeHidden();
  });
});
