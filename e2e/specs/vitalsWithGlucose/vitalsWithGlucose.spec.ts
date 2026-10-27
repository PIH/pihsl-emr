import { type Page, type APIRequestContext } from '@playwright/test';
import { test, expect, birthdateYearsAgo, type CustomTestFixtures, type EntryContext } from '../../core';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import { EntryFormPage } from '../../pages';

// vitalsWithGlucose.xml: "Vitals with glucose" (vitals.xml without TB screening/mobility/"confused", with a second BP
// and a "Glucose fingerstick" question: fasting yes/no, FBG, RBG, coded glucose). Reached with a synthetic patient with
// an active visit and no encounter. Most tests open enterHtmlFormWithStandardUi (EntryFormPage); production opens the
// form in the Simple UI (one question per screen, _availability.e2e.md), the only UI in which ExitHandlers and
// NavigatorController exist, so the tests of the glucose toggle and of the cm<->mm MUAC converter open
// enterHtmlFormWithSimpleUi (local helper openSimple). Availability (Vitals Glucose Location tag, retro) is not exercised.
// Session location MCH OPD carries the Vitals Glucose Location tag, so the location select is preset.
//
// Conditions in the form, from documentation inventory (vitalsWithGlucose.inv.md); the age is as of today (ENTER):
//   includeIf age > 5                :188, :552   BMI script / BMI box, and BP "expected" class (:231)
//   includeIf age < 13 or female     :273, :694   MUAC box (cm input + mm obs) and its cm<->mm script
//   includeIf age < 13 / age > 12    :720, :724   muac_cm max 27 (child) / 56 (female 13+)
//   includeIf age < 5                :750         z-score obs
//   includeIf age < 3                :355, :766   head circumference and MUAC/HC ratio box and script
//   ifMode VIEW (include true/false) :26-:716     view-only vs entry-only blocks; VIEW cannot be tested (no form on a REST encounter)
// Scripts: :127 Fahrenheit / lbs / inches converters (V2); :190-229 BMI = kg/(cm/100)^2, one decimal; :275-322 cm -> mm
//   (x10) and mm -> cm (/10) on exit of muac_cm/muac_mm (V3); :356-395 ratio = (mm/10)/HC; :450-481 glucose toggle on
//   change of #fasting: Yes (CIEL:1065, "FBG") enables #fbg and disables/hides #rbg and #glucose-coded; No (CIEL:1066,
//   "RBG") the reverse; no answer hides all three (NavigatorController, Simple UI only).
// Required: none (no required attribute or class="required"). Encounter location is required (subform).
// Side effects on save: none (no program, order or disposition). Encounter type 2fd151a2-... (Vitals).
// Not covered: VIEW and EDIT modes, retro-entry gating, shared provider/location/date behaviour (_shared.e2e.md).
//
// Findings:
//   V1 Low  :15 vs :486  id="vitals-with-glucose" is on both the <htmlform> and the <section> (two elements in the page);
//                        the VIEW css (#vitals-with-glucose ...) and any `#vitals-with-glucose` locator match both. Fix: rename one.
//   V2 Low  :127-184     ExitHandlers for 'fahrenheit', 'lbs', 'inches': no input carries those classes, so the converters
//                        never run. Fix: delete the script.
//   V3 Low  :276-278     convertCmToMm = cm*10 without rounding: muac_cm 15.35 writes 153.5 into the integer mm obs, which then
//                        fails with "Must be a whole number" on a field the user did not type. Fix: Math.round(cm * 10).
//   V4 Low  :812,825,833 `<uimessage code="Glucose fingerstick"/>` and the FBG/RBG labels use English text as message codes
//                        (not translated); :590 English answerLabels. Fix: real codes.
//   V5 Info Standard UI: `ExitHandlers/NavigatorController is not defined` is thrown by :127, :287 and :450, so there
//                        all three glucose fields stay visible and cm<->mm conversion does not run (Simple UI works).

const FORM = 'vitalsWithGlucose.xml';
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

const newPatient = (createEntryContext: CustomTestFixtures['createEntryContext'], gender: 'M' | 'F', age: number) =>
  createEntryContext({ givenName: 'AutoGlucose', familyName: 'Tester', gender, birthdate: birthdateYearsAgo(age) });

test.describe('vitalsWithGlucose', () => {
  // includeIf :188/:552 (BMI, BP expected), :273/:694 (MUAC), :720/:724 (muac_cm max), :750 (z-score), :355/:766 (HC, ratio)
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
      await expect(page.locator('#bp_systolic input')).toHaveClass(p.bmi ? /expected/ : /^(?!.*expected).*$/); // :231 inside the age > 5 block
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
    // BMI script :201-229 (age > 5)
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
    // ratio script :367-395 (age < 3): (140 / 10) / 45 = 0.31
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
    await expect(page).not.toHaveURL(/referenceapplication\/home\.page/);
  });

  test('Simple UI: the glucose fields follow the fasting answer', async ({ page, createEntryContext }) => {
    // glucose toggle :450-481
    const context = await newPatient(createEntryContext, 'F', 30);
    await openSimple(page, context);
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
    await goToQuestion(page, 'Glucose');
    await page.locator('#fasting input[type=radio]').nth(0).check(); // Yes first: FBG value must not survive the switch
    await page.locator('#fbg input').fill('5.5');
    await page.locator('#fasting input[type=radio]').nth(1).check(); // No -> RBG
    await page.locator('#rbg input').fill('7.1');
    await page.locator('#glucose-coded input[type=radio]').nth(1).check();
    await page.locator('#save-form').click(); // confirmation screen
    await page.locator('button.submitButton:visible').click();
    await expect(page).toHaveURL(/referenceapplication\/home\.page/);

    const saved = await savedObs(api, context.patient.uuid);
    expect(saved.encounterType).toBe(VITALS_ENCOUNTER_TYPE_UUID);
    expect(saved.displays).toEqual(expect.arrayContaining(['Patient fasting for blood glucose test: No']));
    expect(saved.displays.some((d) => d.includes('7.1'))).toBe(true);
    expect(saved.displays.some((d) => d.startsWith('Fasting blood glucose'))).toBe(false);
    expect(saved.displays.some((d) => d.includes('5.5'))).toBe(false);
  });

  test('Simple UI: MUAC cm and mm fields convert both ways and cm is limited to 56 (female) / 27 (child)', async ({ page, createEntryContext }) => {
    // cm -> mm and mm -> cm handlers :287-322 (adult female); max from :720/:724
    const context = await newPatient(createEntryContext, 'F', 30);
    await openSimple(page, context);
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
    // :720 max 27 for age < 13
    const context = await newPatient(createEntryContext, 'M', 8);
    await openSimple(page, context);
    await goToQuestion(page, 'MUAC');
    await blur(page, '#muac_cm', '30');
    await expect(page.locator('span.field-error', { hasText: 'Maximum: 27' })).toBeVisible();
  });
});
