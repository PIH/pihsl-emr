import type { Page } from '@playwright/test';
import { test, expect, type EntryContext } from '../../core';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import { EntryFormPage, expectViewShowsSavedObs, selectDefaultProvider } from '../../pages';

// inpatientNewbornVitals.xml: "Vital Signs Newborn Inpatient" (infant vitals, oxygen and fluids, a newborn exam of six yes/no
// signs, feeding and hematocrit). The specs open enterHtmlFormWithStandardUi inside a visit they create, for an infant born 3 days
// ago, so availability (documentation/_availability.e2e.md: enableVitals SL, "Vitals Inpatient Location" tag, age < 42 days at
// visit start, retro privilege) is not exercised. The session location (MCH OPD) is not tagged, so every save picks a location.
//
// Conditions in the form, from documentation inventory (inpatientNewbornVitals.inv.md):
//   ifMode VIEW include=false :96 (heading), :110 (CSS for the oxygen inputs), :201 (Save/Cancel buttons); ENTER renders them.
// Scripts: none in this file. The infant scoring (shared vital-signs-infant-widget.js: _shared V2, V4) is exercised by one
//   table-driven test: a summed score >= 2 shows #confirmMsg and disables Save until #contactDr is ticked; BP is not scored.
// Exam (:148-:176): six obsgroups (PIH:14858) with radios yes/no: yes saves PIH:SYMPTOM PRESENT = <sign>, no saves
//   PIH:SYMPTOM ABSENT = <sign>; feeding radios (PIH:21125); hematocrit CIEL:1015.
// Side effects on save: none (no program, order or disposition). Encounter type 6b1c3929-... (Vital Signs Inpatient, shared
//   with inpatientVitals.xml).
// VIEW is covered by the save test: every saved value is shown in its field, the exam answers and feeding with the form's own labels, and the four
// signs left unanswered are not rendered. Not covered here: EDIT mode, the retro-entry privilege.

const FORM = 'inpatientNewbornVitals.xml';
const INPATIENT_VITALS_ENCOUNTER_TYPE_UUID = '6b1c3929-f23c-423f-8cad-64b17cf10b99';

const birthdateDaysAgo = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

const saveButton = (page: Page) => page.locator('#buttons button.submitButton');
const fillWhoWhere = async (page: Page) => {
  await selectDefaultProvider(page);
  const location = page.locator('#w3');
  if (!(await location.inputValue())) {
    await location.selectOption({ index: 1 });
  }
};
const vital = (page: Page, id: string) => page.locator(`#${id} input`);
const enter = async (page: Page, id: string, value: string) => {
  await vital(page, id).fill(value);
  await vital(page, id).press('Tab');
};
// the six sign rows in template order (:148-:158), each with a yes and a no radio
const SIGNS = ['seizures', 'floppy', 'lethargy', 'irritable', 'unarousable', 'poorTone'];
const signRadio = (page: Page, sign: number, answer: 'yes' | 'no') => page.locator(`#examDiv input[type=radio][name=w${30 + 2 * sign}]`).nth(answer === 'yes' ? 0 : 1);

test.describe('inpatientNewbornVitals', () => {
  let context: EntryContext;

  test.beforeEach(async ({ createEntryContext }) => {
    context = await createEntryContext({ givenName: 'AutoNbVitals', familyName: 'Tester', gender: 'M', birthdate: birthdateDaysAgo(3) });
  });

  test('ENTER renders provider/location/date, infant vitals, oxygen and fluids, exam and Save (ifMode :96, :110, :201)', async ({ page }) => {
    await EntryFormPage.open(page, FORM, context);
    await expect(page.locator('select[name=w1]')).toBeVisible();
    await expect(page.locator('#w3')).toBeVisible();
    await expect(page.locator('#w5-display')).toBeVisible();
    for (const id of ['bp_systolic', 'bp_diastolic', 'heart_rate', 'respiratory_rate', 'temperature_c', 'o2_sat', 'glucose', 'hematocrit']) {
      await expect(vital(page, id)).toBeVisible();
    }
    await expect(page.locator('#fhrDiv')).toHaveCount(0); // infant widget has no fetal heart rate
    await expect(page.locator('#o2andFluidsDiv input[type=text]')).toHaveCount(3);
    await expect(page.locator('#examDiv input[type=radio]')).toHaveCount(SIGNS.length * 2 + 3);
    await expect(saveButton(page)).toBeVisible();
  });

  test('each sign is a yes/no radio pair: choosing one deselects the other', async ({ page }) => {
    await EntryFormPage.open(page, FORM, context);
    await signRadio(page, 0, 'yes').check();
    await expect(signRadio(page, 0, 'yes')).toBeChecked();
    await signRadio(page, 0, 'no').check();
    await expect(signRadio(page, 0, 'no')).toBeChecked();
    await expect(signRadio(page, 0, 'yes')).not.toBeChecked();
    await expect(signRadio(page, 1, 'yes')).not.toBeChecked(); // other rows unaffected
  });

  // shared vital-signs-infant-widget.js: RED 3, ORANGE 2, YELLOW 1 summed; sum >= 2 -> #confirmMsg, Save disabled until #contactDr
  const scores: Array<{ name: string; values: Record<string, string>; confirm: boolean }> = [
    { name: 'normal values', values: { heart_rate: '130', respiratory_rate: '45', temperature_c: '37', o2_sat: '98', glucose: '4' }, confirm: false },
    { name: 'one yellow value (HR 90)', values: { heart_rate: '90' }, confirm: false },
    { name: 'BP is not scored (200/120)', values: { bp_systolic: '200', bp_diastolic: '120' }, confirm: false },
    { name: 'one red value (HR 70)', values: { heart_rate: '70' }, confirm: true },
    { name: 'one red value (SpO2 85)', values: { o2_sat: '85' }, confirm: true },
    { name: 'one red value (glucose 2.0)', values: { glucose: '2' }, confirm: true },
    { name: 'two yellow values (HR 90, RR 65)', values: { heart_rate: '90', respiratory_rate: '65' }, confirm: true },
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
      for (const [id, value] of Object.entries({ heart_rate: '130', respiratory_rate: '45', o2_sat: '98', glucose: '4' })) {
        await enter(page, id, value);
      }
      await expect(page.locator('#confirmMsg')).toBeHidden();
      await expect(saveButton(page)).toBeEnabled();
    });
  }

  test('saves vitals, oxygen and fluids, the exam signs, feeding and hematocrit', async ({ page, api }) => {
    await EntryFormPage.open(page, FORM, context);
    await fillWhoWhere(page);
    for (const [id, value] of Object.entries({
      bp_systolic: '70', bp_diastolic: '40', heart_rate: '130', respiratory_rate: '45', temperature_c: '37', o2_sat: '98', glucose: '4', hematocrit: '45',
    })) {
      await enter(page, id, value);
    }
    const [flow, input, output] = await page.locator('#o2andFluidsDiv input[type=text]').all();
    await flow.fill('1');
    await input.fill('60');
    await output.fill('30');
    await signRadio(page, 0, 'yes').check(); // seizures present
    await signRadio(page, 1, 'no').check(); // floppy absent
    await page.locator('#examDiv input[type=radio][name=w42]').nth(2).check(); // feeding well
    await expect(saveButton(page)).toBeEnabled();
    await saveButton(page).click();
    await expect(page).toHaveURL(/referenceapplication\/home\.page/);

    const encounters = await getPatientEncounters(api, context.patient.uuid);
    expect(encounters.map((e) => e.encounterType.uuid)).toEqual([INPATIENT_VITALS_ENCOUNTER_TYPE_UUID]);
    const obs = await getEncounterObs(api, encounters[0].uuid);
    const shown = obs.map((o) => `${o.concept.display}=${typeof o.value === 'object' && o.value ? (o.value as { display: string }).display : String(o.value)}`);
    expect(shown).toEqual(
      expect.arrayContaining([
        'Systolic=70', 'Diastolic=40', 'Pulse=130', 'Respiratory rate=45', 'Temperature (C)=37', 'Blood oxygen saturation=98',
        'Serum glucose (mmol/L)=4', 'Hematocrit=45', 'Delivered oxygen flow rate (L/m)=1',
        'Total fluid input over past 24 hours (mL)=60', 'Total fluid output over past 24 hours (mL)=30',
        'Symptom present=Seizure', 'Symptom absent=Floppy infant syndrome', 'Infant feeding observed=Normal',
      ]),
    );
    expect(obs).toHaveLength(16); // 12 values + the 2 signs, each inside its own obs group (2 group obs)

    // VIEW: the coded answers carry the form's own labels (yes/no radios, feeding answerLabels), and the four signs that were not answered
    // are not shown at all (their obsgroups are showIfEmpty="false": no label, no empty radios)
    const view = await expectViewShowsSavedObs(page, api, FORM, encounters[0].uuid, {
      'Symptom present: Seizure': '[X] yes',
      'Symptom absent: Floppy infant syndrome': '[X] no',
      'Infant feeding observed: Normal': '[X] feeding well',
    });
    const texts = await view.valueTexts();
    for (const [id, value] of Object.entries({ bp_systolic: '70', bp_diastolic: '40', heart_rate: '130', respiratory_rate: '45', temperature_c: '37', o2_sat: '98', glucose: '4', hematocrit: '45' })) {
      await expect(view.page.locator(`#${id} .value`), id).toHaveText(value);
    }
    expect(texts).toEqual(['70', '40', '130', '45', '37', '98', '4', '1', '60', '30', '[X] yes', '[X] no', '[X] feeding well', '45']);
    const exam = (await view.page.locator('#examDiv').innerText()).replace(/\s+/g, ' ').replace(/\[\s*\]/g, '[ ]'); // nbsp, "[  ]" for an empty radio
    expect(exam).toContain('Seizures [X] yes [ ] no');
    expect(exam).toContain('Floppy [ ] yes [X] no');
    expect(exam).toContain('Feeding [ ] not feeding [ ] feeding reluctantly [X] feeding well');
    expect(exam).not.toMatch(/lethargy|irritable|unarousable|tone/i);
    await expect(view.page.locator('#examDiv input, #buttons')).toHaveCount(0);
  });
});
