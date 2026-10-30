import { type Page, type APIRequestContext } from '@playwright/test';
import { test, expect, birthdateYearsAgo, type CustomTestFixtures, type EntryContext } from '../../core';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import { EntryFormPage, expectViewShowsSavedObs, selectDefaultProvider } from '../../pages';

// vitals.xml: "Vitals" (height, weight, BMI, consciousness, mobility, temperature, pulse, BP, RR, SpO2, MUAC,
// z-score, head circumference, TB screening). Reached with a synthetic patient who has an active visit and no
// encounter. Most tests open enterHtmlFormWithStandardUi (EntryFormPage); production opens the form in the Simple UI
// (one question per screen, _availability.e2e.md), the only UI in which ExitHandlers/NavigatorController exist, so
// the tests of the cm<->mm MUAC converter and of the "required" fieldsets open enterHtmlFormWithSimpleUi (local
// helper openSimple). Availability (Vitals Location tag, retro privilege) is not exercised. Session location MCH OPD
// has no Vitals Location tag, so every save picks a location in the "Details" select.
//
// Conditions in the form, from documentation inventory (vitals.inv.md); the age is as of today (ENTER):
//   includeIf age > 5                :210, :527   BMI script / BMI box, and BP "expected" class (:253)
//   includeIf age < 13 or female     :295, :698   MUAC box (cm input + mm obs) and its cm<->mm script
//   includeIf age < 13 / age > 12    :719, :723   muac_cm max 27 (child) / 56 (female 13+)
//   includeIf age < 5                :747         z-score obs
//   includeIf age < 3                :378, :759   head circumference and MUAC/HC ratio box and script
//   ifMode VIEW (include true/false) :35-:799     view-only vs entry-only blocks (VIEW is tested: see openViewWithScripts)
// Scripts: :19 uimessage strings; :147 Fahrenheit / lbs / inches converters (V1); :212-250 BMI = kg/(cm/100)^2, one
//   decimal, shown on change of weight/height; :297-343 cm -> mm (x10) and mm -> cm (/10) on exit of muac_cm/muac_mm
//   (needs ExitHandlers, Simple UI only); :379-418 ratio = (mm/10)/HC, one decimal; :580 checkboxRadio (V3).
// Required: fieldsets with class="required" (consciousness, mobility, temperature, pulse, RR, SpO2, TB screening,
//   chief complaint) are enforced by the Simple UI navigator only (V5). The location select is required in both UIs.
// Side effects on save: none (no program, order or disposition). Encounter type 4fb47712-... (Vitals).
// VIEW (viewEncounterWithHtmlForm getAsHtml.action) is covered by the 'VIEW:' tests: the saved values, and what the VIEW scripts compute (BMI, MUAC in cm,
// MUAC/HC ratio) and hide (a vital with no value, SL-337); they need the page's jq, see openViewWithScripts.
// Not covered: EDIT mode, retro-entry gating, shared provider/location/date behaviour (_shared.e2e.md).
//
// Findings:
//   V1 Low  :147-205    ExitHandlers for 'fahrenheit', 'lbs', 'inches' (+ ids temperature_f etc. only in comments): no input
//                       carries those classes, so the converters never run. Fix: delete the script.
//   V2 Low  :298-300    convertCmToMm = cm*10 without rounding: muac_cm 15.35 writes 153.5 into the integer mm obs, which then
//                       fails with "Must be a whole number" on a field the user did not type. Fix: Math.round(cm * 10).
//   V3 Low  :580-589    checkboxRadio script binds clicks on checkboxes inside .checkboxRadio, but the "confused" obs is
//                       rendered as radios (native exclusion), so the script is dead. Fix: delete it.
//   V4 Low  :565,602,623,633,497-799  English answerLabels, "(required)" and "If at least two questions answers yes" are
//                       hard-coded, not uimessage codes (not translated). Fix: uimessage / answerCodes.
//   V5 Info Standard UI does not enforce the "(required)" fieldsets: an empty form with only a location saves an
//                       encounter with no obs. Simple UI (production) does enforce them (tested).
//   V6 Info Standard UI: `ExitHandlers is not defined` is thrown by :147 and :309 (cm<->mm conversion does not run).
//   VW1 Low :270-290,:452-467,:529-545  in VIEW the BMI fieldset stays visible with only its "(Calculated) BMI" heading when the BMI cannot be computed (no height or
//                       weight, patient over 5): the wrapper is hidden but the fieldset holds no .emptyValue, so the SL-337 rule (:452) does not hide it.
//                       Fix: hide the BMI fieldset in the VIEW script when no BMI was computed. TESTED below (test.fixme).

const FORM = 'vitals.xml';
const VITALS_ENCOUNTER_TYPE_UUID = '4fb47712-34a6-40d2-8ed3-e153abbd25b7';

// Local helpers (duplicated in vitalsWithGlucose.spec.ts on purpose).
const openSimple = async (page: Page, context: EntryContext) => {
  await page.goto(EntryFormPage.enterUrl(FORM, context).replace('enterHtmlFormWithStandardUi', 'enterHtmlFormWithSimpleUi'));
  await expect(page.locator('#save-form')).toBeVisible();
};
const goToQuestion = async (page: Page, label: string) => {
  await page.locator('li.question-legend', { hasText: new RegExp(`^\\s*${label}\\s*$`) }).click();
};
const pickProviderAndLocation = async (page: Page) => {
  await selectDefaultProvider(page);
  await page.locator('#w3').selectOption({ index: 1 });
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

// The VIEW of a saved encounter with the form's own scripts running (they compute the BMI, the MUAC in cm and the MUAC/HC ratio and hide the empty
// vitals, :213-:467, VIEW only). ViewFormPage loads the HTML with setContent, which has no jq of its own and runs `jq(fn)` / `jq(document).ready(fn)`
// before the rest of the body is parsed: so start from a page that has jq (an unrelated section form) and let those callbacks wait one tick.
const openViewWithScripts = async (page: Page, api: APIRequestContext, context: EntryContext, encounterUuid: string, labels: Record<string, string> = {}) => {
  await page.goto(EntryFormPage.enterUrl('section-chief-complaint.xml', context));
  await page.evaluate(() => {
    const w = window as any;
    const jq = w.jq;
    w.jq = Object.assign(function (this: unknown, arg: unknown) {
      if (arg === document) {
        return { ready: (fn: () => void) => setTimeout(fn, 0) };
      }
      if (typeof arg === 'function') {
        setTimeout(arg as () => void, 0);
        return undefined;
      }
      return jq.apply(this, arguments);
    }, jq);
  });
  const view = await expectViewShowsSavedObs(page, api, FORM, encounterUuid, labels);
  await page.waitForTimeout(500); // the scripts run on the next tick
  return view;
};

// What the form shows for the answers it labels itself (the "No" of the TB rows, the confusion radios).
const VIEW_LABELS: Record<string, string> = {
  'Symptom absent: Confusion': 'no',
  'TB symptom absent: Cough > 2 weeks': '[X] No',
  'TB symptom absent: Weight loss (kg)': '[X] No',
  'TB symptom absent: Fever': '[X] No',
  'TB symptom absent: Night sweats': '[X] No',
};

const newPatient = (createEntryContext: CustomTestFixtures['createEntryContext'], gender: 'M' | 'F', age: number) =>
  createEntryContext({ givenName: 'AutoVitals', familyName: 'Tester', gender, birthdate: birthdateYearsAgo(age) });

test.describe('vitals', () => {
  // includeIf :210/:527 (BMI, BP expected), :295/:698 (MUAC), :719/:723 (muac_cm max), :747 (z-score), :378/:759 (HC, ratio)
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
      const heading = (text: RegExp) => page.locator('section#vitals fieldset h3', { hasText: text });

      await expect(page.locator('#calculated-bmi-wrapper')).toHaveCount(p.bmi ? 1 : 0);
      await expect(page.locator('#bp_systolic input')).toHaveClass(p.bmi ? /expected/ : /^(?!.*expected).*$/); // :253 inside the age > 5 block
      await expect(page.locator('#muac_cm')).toHaveCount(p.muacMax ? 1 : 0);
      if (p.muacMax) {
        await expect(page.locator('#muac_cm')).toHaveAttribute('max', p.muacMax);
      }
      await expect(heading(/MUAC$/)).toHaveCount(p.muacMax ? 1 : 0);
      await expect(page.locator('#z_score')).toHaveCount(p.zscore ? 1 : 0);
      await expect(page.locator('#head_cm')).toHaveCount(p.head ? 1 : 0);
      await expect(page.locator('#calculated-ratio-wrapper')).toHaveCount(p.head ? 1 : 0);
    });
  }

  test('BMI is calculated from weight and height and hidden when one is missing', async ({ page, createEntryContext }) => {
    // BMI script :223-250 (age > 5)
    const context = await newPatient(createEntryContext, 'M', 30);
    await EntryFormPage.open(page, FORM, context);
    await expect(page.locator('#calculated-bmi-wrapper')).toBeHidden();
    await expect(page.locator('#no-calculated-bmi')).toBeVisible();

    await blur(page, '#height_cm input', '170');
    await expect(page.locator('#calculated-bmi-wrapper')).toBeHidden();
    await blur(page, '#weight_kg input', '70');
    await expect(page.locator('#calculated-bmi-wrapper')).toBeVisible();
    await expect(page.locator('#calculated-bmi')).toHaveText('24.2');
    await expect(page.locator('#no-calculated-bmi')).toBeHidden();

    await blur(page, '#weight_kg input', '');
    await expect(page.locator('#calculated-bmi-wrapper')).toBeHidden();
  });

  test('MUAC/HC ratio is calculated from MUAC (mm) and head circumference (cm) for a child under 3', async ({ page, createEntryContext }) => {
    // ratio script :390-418 (age < 3): (140 / 10) / 45 = 0.31
    const context = await newPatient(createEntryContext, 'M', 2);
    await EntryFormPage.open(page, FORM, context);
    await expect(page.locator('#calculated-ratio-wrapper')).toBeHidden();

    await blur(page, '#muac_mm input', '140');
    await blur(page, '#head_cm input', '45');
    await expect(page.locator('#calculated-ratio-wrapper')).toBeVisible();
    await expect(page.locator('#calculated-ratio')).toHaveText('0.3');
  });

  test('a temperature above the concept range blocks the save', async ({ page, createEntryContext }) => {
    // numeric-range validation from the concept (not form specific): Temperature (C) max 43
    const context = await newPatient(createEntryContext, 'M', 30);
    await EntryFormPage.open(page, FORM, context);
    await pickProviderAndLocation(page);
    await blur(page, '#temperature_c input', '99');
    await saveStandard(page);
    await expect(page.locator('span.field-error', { hasText: 'Cannot be greater than 43' })).toBeVisible();
    await expect(page).not.toHaveURL(/referenceapplication\/home\.page/);
  });

  test('saving without a location does not save (required encounter location)', async ({ page, createEntryContext }) => {
    // encounter-provider-location-date subform: location select blank because the session location lacks the Vitals Location tag
    const context = await newPatient(createEntryContext, 'M', 30);
    await EntryFormPage.open(page, FORM, context);
    await blur(page, '#temperature_c input', '37');
    await saveStandard(page);
    await expect(page.locator('span.field-error', { hasText: 'required' }).first()).toBeVisible();
    await expect(page).not.toHaveURL(/referenceapplication\/home\.page/);
  });

  test('saves the vitals entered (Standard UI) as one Vitals encounter', async ({ page, api, createEntryContext }) => {
    const context = await newPatient(createEntryContext, 'M', 30);
    const form = await EntryFormPage.open(page, FORM, context);
    await pickProviderAndLocation(page);
    await page.locator('#chief_complaint input').fill('cough');
    await blur(page, '#height_cm input', '170');
    await blur(page, '#weight_kg input', '70');
    await blur(page, '#temperature_c input', '37.5');
    await blur(page, '#heart_rate input', '80');
    await blur(page, '#bp_systolic input', '120');
    await blur(page, '#bp_diastolic input', '80');
    await blur(page, '#respiratory_rate input', '18');
    await blur(page, '#o2_sat input', '98');
    await page.locator('#mobility_level input[type=radio]').first().check(); // Able to walk without assistance
    await saveStandard(page);
    await form.expectSaved();

    const saved = await savedObs(api, context.patient.uuid);
    expect(saved.encounterType).toBe(VITALS_ENCOUNTER_TYPE_UUID);
    expect(saved.displays).toEqual(
      expect.arrayContaining([
        'Chief complaint (text): cough',
        'Height (cm): 170.0',
        'Weight (kg): 70.0',
        'Temperature (C): 37.5',
        'Pulse: 80',
        'Systolic: 120',
        'Diastolic: 80',
        'Respiratory rate: 18',
        'Blood oxygen saturation: 98',
        'Level of mobility: Able to walk without assistance',
      ]),
    );
  });

  test('Simple UI: Save Form is refused while required questions are unanswered', async ({ page, api, createEntryContext }) => {
    // class="required" fieldsets (V5): the navigator blocks the save and shows "Required"
    const context = await newPatient(createEntryContext, 'M', 30);
    await openSimple(page, context);
    await pickProviderAndLocation(page);
    await page.locator('#save-form').click();
    await expect(page.locator('span.field-error', { hasText: 'Required' }).first()).toBeVisible();
    await expect(page.locator('button.submitButton:visible')).toHaveCount(0); // no confirmation screen
    expect(await getPatientEncounters(api, context.patient.uuid)).toHaveLength(0);
  });

  test('Simple UI: MUAC cm and mm fields convert both ways and the full form saves', async ({ page, api, createEntryContext }) => {
    // cm -> mm and mm -> cm handlers :309-343 (adult female), BMI, required questions, TB screening, save
    const context = await newPatient(createEntryContext, 'F', 30);
    await openSimple(page, context);
    await pickProviderAndLocation(page);

    await goToQuestion(page, 'Chief Complaint');
    await page.locator('#chief_complaint input').fill('fever');
    await goToQuestion(page, 'Height');
    await page.locator('#height_cm input').fill('160');
    await goToQuestion(page, 'Weight');
    await page.locator('#weight_kg input').fill('60');
    await goToQuestion(page, '\\(Calculated\\) BMI');
    await expect(page.locator('#calculated-bmi')).toHaveText('23.4');
    await goToQuestion(page, 'Consciousness');
    await page.locator('#consciousness_level input[type=radio]').first().check(); // Awake (alert)
    await page.locator('.checkboxRadio input[type=radio]').nth(1).check(); // Confused: no
    await goToQuestion(page, 'Level of mobility');
    await page.locator('#mobility_level input[type=radio]').first().check();
    await goToQuestion(page, 'Temperature');
    await page.locator('#temperature_c input').fill('37.5');
    await goToQuestion(page, 'Heart Rate');
    await page.locator('#heart_rate input').fill('80');
    await goToQuestion(page, 'Respiratory Rate');
    await page.locator('#respiratory_rate input').fill('18');
    await goToQuestion(page, 'O₂ Sat');
    await page.locator('#o2_sat input').fill('98');

    await goToQuestion(page, 'MUAC');
    await blur(page, '#muac_cm', '15');
    await expect(page.locator('#muac_mm input')).toHaveValue('150');
    await blur(page, '#muac_mm input', '200');
    await expect(page.locator('#muac_cm')).toHaveValue('20');

    await page.locator('#save-form').click(); // first unanswered required question: TB screening
    const tb = page.locator('section#tb_screening input[type=radio]');
    for (const i of [1, 3, 5, 7]) {
      await tb.nth(i).check(); // four "No"
    }
    await page.locator('#save-form').click(); // confirmation screen
    await page.locator('button.submitButton:visible').click();
    await expect(page).toHaveURL(/referenceapplication\/home\.page/);

    const saved = await savedObs(api, context.patient.uuid);
    expect(saved.displays).toEqual(
      expect.arrayContaining([
        'Chief complaint (text): fever',
        'Middle upper arm circumference (mm): 200',
        'Temperature (C): 37.5',
        'Pulse: 80',
        'TB symptom absent: Fever',
        'TB symptom absent: Cough > 2 weeks',
        'Symptom absent: Confusion',
      ]),
    );
  });

  // VIEW (viewEncounterWithHtmlForm getAsHtml.action): saved values in span.value, with the scripts of the form running as they do on the visit page.
  test('VIEW: shows the saved vitals, the BMI and the MUAC in cm computed from them, and hides the vitals that were not recorded', async ({
    page,
    api,
    createEntryContext,
  }) => {
    const context = await newPatient(createEntryContext, 'F', 30);
    const form = await EntryFormPage.open(page, FORM, context);
    await pickProviderAndLocation(page);
    await page.locator('#chief_complaint input').fill('cough');
    await blur(page, '#height_cm input', '160');
    await blur(page, '#weight_kg input', '60');
    await blur(page, '#heart_rate input', '80'); // temperature, respiratory rate and O2 saturation are left blank
    await blur(page, '#bp_systolic input', '120');
    await blur(page, '#bp_diastolic input', '80');
    await blur(page, '#muac_mm input', '150'); // the cm field converts only in the Simple UI (V6): enter the mm obs
    await page.locator('#mobility_level input[type=radio]').first().check();
    await page.locator('#consciousness_level input[type=radio]').first().check();
    await page.locator('.checkboxRadio input[type=radio]').nth(1).check(); // confused: no
    const tb = page.locator('section#tb_screening input[type=radio]');
    for (const i of [1, 3, 5, 7]) {
      await tb.nth(i).check(); // four "No"
    }
    await saveStandard(page);
    await form.expectSaved();
    const [encounter] = await getPatientEncounters(api, context.patient.uuid);

    const view = await openViewWithScripts(page, api, context, encounter.uuid, VIEW_LABELS);
    const shown = await view.valueTexts();
    for (const expected of ['cough', '160', '60', '80', '120', '150', 'Awake (alert)', 'no', 'Able to walk without assistance']) {
      expect(shown, expected).toContain(expected);
    }
    // computed by the VIEW scripts: BMI = 60 / 1.6^2 = 23.4 (one decimal), MUAC 150 mm shown as 15 cm
    await expect(page.locator('#calculated-bmi')).toHaveText('23.4');
    await expect(page.locator('#muac_cm_display')).toHaveText('15');
    // a vital with no value is hidden (SL-337), the others stay
    for (const empty of ['temperature_c', 'respiratory_rate', 'o2_sat']) {
      await expect(page.locator(`#${empty}`).locator('xpath=ancestor::fieldset[1]'), empty).toBeHidden();
    }
    for (const filled of ['heart_rate', 'height_cm', 'weight_kg']) {
      await expect(page.locator(`#${filled}`).locator('xpath=ancestor::fieldset[1]'), filled).toBeVisible();
    }
    // the TB rows show "No" under their own labels
    await expect(page.locator('section#tb_screening .value')).toHaveText(['[X] No', '[X] No', '[X] No', '[X] No']);
    await expect(page.locator('#buttons, input[type=text], input[type=radio], textarea, select')).toHaveCount(0); // read-only
  });

  test('VIEW: a child under 3 gets the MUAC/HC ratio, no BMI, and the z-score only when recorded', async ({ page, api, createEntryContext }) => {
    const context = await newPatient(createEntryContext, 'M', 2);
    const form = await EntryFormPage.open(page, FORM, context);
    await pickProviderAndLocation(page);
    await blur(page, '#muac_mm input', '140');
    await blur(page, '#head_cm input', '45');
    await saveStandard(page);
    await form.expectSaved();
    const [encounter] = await getPatientEncounters(api, context.patient.uuid);

    const view = await openViewWithScripts(page, api, context, encounter.uuid);
    expect(await view.valueTexts()).toEqual(expect.arrayContaining(['140', '45']));
    // (140 mm / 10) / 45 cm = 0.31, shown with one decimal; the 2-year-old has no BMI (age > 5 only, :210) and shows its MUAC in cm
    await expect(page.locator('#calculated-ratio')).toHaveText('0.3');
    await expect(page.locator('#muac_cm_display')).toHaveText('14');
    await expect(page.locator('#calculated-bmi-wrapper')).toHaveCount(0);
    await expect(page.locator('#z_score').locator('xpath=ancestor::fieldset[1]')).toBeHidden(); // the z-score was not recorded
  });

  // VW1 (Low): the BMI fieldset is not hidden by the VIEW scripts when the BMI cannot be computed (its "value" span is never filled, so the
  // empty-vitals rule finds no empty obs in it), so the VIEW shows the "(Calculated) BMI" heading with nothing under it for an adult with no height or
  // weight. Intended: hidden like the other vitals that were not recorded. Remove test.fixme() when fixed.
  test('VIEW: no "(Calculated) BMI" heading when the height or weight was not recorded (VW1)', async ({ page, api, createEntryContext }) => {
    test.fixme();
    const context = await newPatient(createEntryContext, 'M', 30);
    const form = await EntryFormPage.open(page, FORM, context);
    await pickProviderAndLocation(page);
    await blur(page, '#temperature_c input', '37.5');
    await saveStandard(page);
    await form.expectSaved();
    const [encounter] = await getPatientEncounters(api, context.patient.uuid);

    await openViewWithScripts(page, api, context, encounter.uuid);
    await expect(page.locator('#calculated-bmi').locator('xpath=ancestor::fieldset[1]')).toBeHidden();
  });
});
