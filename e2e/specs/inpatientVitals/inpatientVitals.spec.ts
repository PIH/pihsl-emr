import type { Page } from '@playwright/test';
import { test, expect, birthdateYearsAgo, type EntryContext } from '../../core';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import { EntryFormPage, expectViewShowsSavedObs, selectDefaultProvider, VISIT_PAGE_URL } from '../../pages';

// inpatientVitals.xml: "Vital Signs Inpatient" (BP, HR, RR, temperature, SpO2, haemoglobin, glucose, FHR, then oxygen flow rate
// and total fluid input/output). The specs open enterHtmlFormWithStandardUi inside a visit they create, for an adult woman, so
// availability (documentation/_availability.e2e.md: enableVitals SL, "Vitals Inpatient Location" tag, age > 41 days at visit
// start, retro privilege) is not exercised. The session location (MCH OPD) is not tagged, so every save picks a location.
//
// Conditions in the form, from documentation inventory (inpatientVitals.inv.md):
//   ifMode VIEW include=false :96, :111, :140, :175   provider/location/date block, headings, Oxygen-and-fluids inputs, buttons
//   ifMode VIEW (include true) :162                   VIEW copy of the oxygen/fluid obs (tested in the VIEW checks below)
//   (:136 #most-recent-encounter-title is outside any ifMode: present, hidden by style, in ENTER too.)
// Scripts: none in this file. The vitals scoring (shared vital-signs-widget.js, pregnancy ranges, _shared V9) is exercised by one
//   table-driven test: a summed score >= 2 shows #confirmMsg and disables Save until #contactDr is ticked (see _shared V2, V4, V9);
//   the FHR block #fhrDiv is hidden only at some wards (_shared), visible at the session location.
// Side effects on save: none (no program, order or disposition). Encounter type 6b1c3929-... (Vital Signs Inpatient).
// VIEW is covered by the save test and by one test with only BP and haemoglobin: every saved value is in a span.value of its own field, and the
// fields left empty show nothing. (The page script that colours the vitals in VIEW needs the app's jq: not exercised by setContent.)
// Not covered here: EDIT mode, the retro-entry privilege, ward-dependent FHR hiding (needs another login location).

const FORM = 'inpatientVitals.xml';
const INPATIENT_VITALS_ENCOUNTER_TYPE_UUID = '6b1c3929-f23c-423f-8cad-64b17cf10b99';

const saveButton = (page: Page) => page.locator('#buttons button.submitButton');
const fillWhoWhere = async (page: Page) => {
  await selectDefaultProvider(page);
  const location = page.locator('#w3');
  if (!(await location.inputValue())) {
    await location.selectOption({ index: 1 });
  }
};
// vital input inside its wrapper span (HFE puts the id on the span)
const vital = (page: Page, id: string) => page.locator(`#${id} input`);
const enter = async (page: Page, id: string, value: string) => {
  await vital(page, id).fill(value);
  await vital(page, id).press('Tab');
};

test.describe('inpatientVitals', () => {
  let context: EntryContext;

  test.beforeEach(async ({ createEntryContext }) => {
    context = await createEntryContext({ givenName: 'AutoInpVitals', familyName: 'Tester', gender: 'F', birthdate: birthdateYearsAgo(30) });
  });

  test('ENTER renders provider/location/date, the vitals, oxygen and fluids and Save (ifMode :96, :111, :140, :175)', async ({ page }) => {
    await EntryFormPage.open(page, FORM, context);
    await expect(page.locator('select[name=w1]')).toBeVisible();
    await expect(page.locator('#w3')).toBeVisible();
    await expect(page.locator('#w5-display')).toBeVisible();
    for (const id of ['bp_systolic', 'bp_diastolic', 'heart_rate', 'respiratory_rate', 'temperature_c', 'o2_sat', 'hemoglobin', 'glucose', 'fhr', 'fhr_second']) {
      await expect(vital(page, id)).toBeVisible();
    }
    await expect(page.locator('#o2andFluidsDiv input[type=text]')).toHaveCount(3);
    await expect(saveButton(page)).toBeVisible();
    await expect(page.locator('#most-recent-encounter-title')).toHaveCount(1); // :136, outside any ifMode, hidden by style
    await expect(page.locator('#fhrDiv')).toBeVisible(); // session ward is not one of the FHR-hiding wards
    await expect(page.locator('[id="encounterDate"]')).toHaveCount(1);
  });

  // shared vital-signs-widget.js: RED 3, ORANGE 2, YELLOW 1 summed; sum >= 2 -> #confirmMsg, Save disabled until #contactDr
  const scores: Array<{ name: string; values: Record<string, string>; confirm: boolean }> = [
    { name: 'normal values', values: { bp_systolic: '110', bp_diastolic: '70', heart_rate: '80', o2_sat: '98' }, confirm: false },
    { name: 'one yellow value (SBP 150)', values: { bp_systolic: '150' }, confirm: false },
    { name: 'one red value (SBP 160)', values: { bp_systolic: '160' }, confirm: true },
    { name: 'one orange value (HR 125)', values: { heart_rate: '125' }, confirm: true },
    { name: 'two yellow values (SBP 150, temperature 38.1)', values: { bp_systolic: '150', temperature_c: '38.1' }, confirm: true },
  ];
  for (const s of scores) {
    test(`score: ${s.name} -> confirm message ${s.confirm ? 'shown, Save blocked until acknowledged' : 'hidden'}`, async ({ page }) => {
      await EntryFormPage.open(page, FORM, context);
      for (const [id, value] of Object.entries(s.values)) {
        await enter(page, id, value);
      }
      if (!s.confirm) {
        await expect(page.locator('#confirmMsg')).toBeHidden();
        await expect(saveButton(page)).toBeEnabled();
        return;
      }
      await expect(page.locator('#confirmMsg')).toBeVisible();
      await expect(saveButton(page)).toBeDisabled();
      await page.locator('#contactDr input[type=checkbox]').check();
      await expect(saveButton(page)).toBeEnabled();
      await page.locator('#contactDr input[type=checkbox]').uncheck();
      await expect(saveButton(page)).toBeDisabled();
      await enter(page, 'bp_systolic', '110');
      await enter(page, 'heart_rate', '80');
      await enter(page, 'temperature_c', '37');
      await expect(page.locator('#confirmMsg')).toBeHidden();
      await expect(saveButton(page)).toBeEnabled();
    });
  }

  test('saves the vitals, oxygen and fluids as obs of an inpatient vitals encounter', async ({ page, api }) => {
    await EntryFormPage.open(page, FORM, context);
    await fillWhoWhere(page);
    const values: Record<string, string> = {
      bp_systolic: '120', bp_diastolic: '80', heart_rate: '78', respiratory_rate: '18', temperature_c: '36.8',
      o2_sat: '98', hemoglobin: '11', glucose: '5', fhr: '140', fhr_second: '142',
    };
    for (const [id, value] of Object.entries(values)) {
      await enter(page, id, value);
    }
    const [flow, input, output] = await page.locator('#o2andFluidsDiv input[type=text]').all();
    await flow.fill('2');
    await input.fill('500');
    await output.fill('300');
    await expect(saveButton(page)).toBeEnabled();
    await saveButton(page).click();
    await expect(page).toHaveURL(VISIT_PAGE_URL);

    const encounters = await getPatientEncounters(api, context.patient.uuid);
    expect(encounters.map((e) => e.encounterType.uuid)).toEqual([INPATIENT_VITALS_ENCOUNTER_TYPE_UUID]);
    const obs = await getEncounterObs(api, encounters[0].uuid);
    expect(Object.fromEntries(obs.map((o) => [o.concept.display, o.value]))).toEqual({
      Systolic: 120, Diastolic: 80, Pulse: 78, 'Respiratory rate': 18, 'Temperature (C)': 36.8, 'Blood oxygen saturation': 98,
      Hemoglobin: 11, 'Serum glucose (mmol/L)': 5, 'Fetal heart rate': 140, 'Second fetal heart rate': 142,
      'Delivered oxygen flow rate (L/m)': 2, 'Total fluid input over past 24 hours (mL)': 500, 'Total fluid output over past 24 hours (mL)': 300,
    });

    // VIEW: every vital, oxygen and fluid value is shown in its own field (:162 VIEW copy of the oxygen/fluid obs)
    const view = await expectViewShowsSavedObs(page, api, FORM, encounters[0].uuid);
    for (const [id, value] of Object.entries(values)) {
      await expect(view.valueOf(id), id).toHaveText(value);
    }
    expect(await view.valueTexts()).toEqual([...Object.values(values), '2', '500', '300']);
    await expect(view.page.locator('#o2andFluidsDiv')).toHaveCount(0); // ifMode VIEW include=false :140: the ENTER inputs and their wrapper are gone
    await expect(view.page.locator('#buttons, input')).toHaveCount(0);
  });

  // VIEW of a partly filled form: only the entered vitals are values, the other fields show nothing as a value.
  test('VIEW: a vitals encounter with only BP and haemoglobin shows just those values', async ({ page, api }) => {
    await EntryFormPage.open(page, FORM, context);
    await fillWhoWhere(page);
    for (const [id, value] of Object.entries({ bp_systolic: '118', bp_diastolic: '76', hemoglobin: '11' })) {
      await enter(page, id, value);
    }
    await saveButton(page).click();
    await expect(page).toHaveURL(VISIT_PAGE_URL);

    const [encounter] = await getPatientEncounters(api, context.patient.uuid);
    const view = await expectViewShowsSavedObs(page, api, FORM, encounter.uuid);
    expect(await view.valueTexts()).toEqual(['118', '76', '11']);
    for (const id of ['heart_rate', 'temperature_c', 'o2_sat', 'glucose', 'fhr']) {
      await expect(view.valueOf(id), id).toHaveCount(0);
    }
    await expect(view.valueOf('hemoglobin')).toHaveText('11');
  });
});
