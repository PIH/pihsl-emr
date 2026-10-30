import type { APIRequestContext, Page } from '@playwright/test';
import { test, expect, type EntryContext } from '../../core';
import { MCH_OPD_LOCATION_UUID } from '../../core/constants';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import { EntryFormPage, ViewFormPage, expectViewShowsSavedObs, selectDefaultProvider, VISIT_PAGE_URL } from '../../pages';

// newbornInitial.xml: "Newborn Initial" (NICU admission of a newborn): outborn history, mother's risk factors, vitals (infant
// widget), condition, exam, MSNS score, reasons for admission/diagnoses, treatment, outcome. The specs open
// enterHtmlFormWithStandardUi inside a visit they create, for an infant born 3 days ago, so availability
// (documentation/_availability.e2e.md: enableMCOEForms, enterMCH, "NICU Location", age < 42 days at visit start, no
// Newborn Initial in the visit) is not exercised.
//
// Conditions in the form, from documentation inventory (newbornInitial.inv.md):
//   when #d-location = Other    :314  show #delivery-location-other
//   when #transport = Other     :335  show #other-transport
//   when #air = CPAP            :809  show #cpap;   when #air = Supplemental oxygen  :810  show #oxy2
//   ifMode ENTER                :43   retrospective-date script (below)
//   ifMode VIEW include=false   :66, :208, :230, :420, :862  scripts, heading, Overview section, last-weight spans, buttons
//                               (ENTER renders them: one smoke assertion below; the VIEW test asserts the heading, the last-weight
//                               span and the buttons are absent; the Overview is VW3)
// Scripts: :44-62 (ENTER) if the encounter date is not today at load, set the time widgets to 00:00 (runs once on load, so
//   picking a past date afterwards keeps the current time). :67-193 (ENTER/EDIT): .normalObs/.abnormalObs checkboxes inside one
//   .exam block are mutually exclusive; setUpNextAndSubmitButtons(); REST GET of the patient's encounters up to the encounter
//   date, and for the ones in the same visit shows the latest birth weight (CIEL:5916, #birthWeightBox), birth length
//   (CIEL:163554, #birthLengthBox) and the last weight (CIEL:5089, #lastWeightKg); no warning in this form.
// Side effects on save: enrollInProgram Infant (:228, locationTag "Program Location "), CleanDiagnosisConstructAction and
//   ApplyDispositionAction (:21-22). No order. Provider and location are required (shared subform).
// Not covered here: disposition (ApplyDispositionAction), infant vitals scoring and the Save block (_shared.e2e.md), the
//   retrospective-time script (needs a non-today date at load), diagnosis search, EDIT mode.
// VIEW is covered by 'VIEW: ...' (a filled form saved, then rendered with viewEncounterWithHtmlForm): every saved value is shown, with the
//   labels of answerCode/answerCodes ("[X] motorbike", "[X] Anaemia", "[X] Breastfed"), the one selected radio of each group, the
//   conditional details (delivery location text, CPAP pressure) and no value for what was left empty. The "when" show/hide controls are
//   JavaScript and cannot be checked in the loaded HTML.
//
// Findings (the duplicate id="glucose" at :494 is see _shared V10):
//   V1 Low  :549, :576  CIEL:168722 is used for both "Comments about umbilical cord" and "Comments about eyes": two text
//                       inputs of one concept, saved as two indistinguishable obs (unconfirmed how EDIT re-binds them).
//                       Fix: a separate concept for one of them.
//   V2 Low  :777, :857  CIEL:161011 ("Summary") is offered twice, in Diagnoses and in Outcome: two textareas of one concept.
//   V3 Low  :44-62      the "retrospective data entry" default runs once on load; changing the date in the widget never
//                       resets the time, and `currentEncounterDate` is an undeclared global. Fix: bind it to the date change.
//   V4 Info :218        location widget uses tags="MCH Triage Location" (as in the triage form) while the form is offered at
//                       "NICU Location": the options are NICU and Triage | MCOE, no location is preselected for the
//                       harness session (MCH OPD) and the location is required (tested).
//   VW1 Medium :549, :576  (V1 in VIEW) the cord comment and the eye comment are one concept: a saved obs is bound to the first input of
//                       its concept, so a lone eye comment is shown as the umbilical cord comment. TESTED below (test.fixme).
//                       Fix: a separate concept for one of them.
//   VW2 Medium :777, :857  (V2 in VIEW) the same for the two summaries: a lone Outcome summary is shown in Diagnoses (with both filled
//                       the two texts are swapped). TESTED below (test.fixme). Fix: a separate concept for one of them.
//   VW3 Medium :230  the Overview section (Presenting history, Condition at admission, Clinical adverse effect: all inputs) is in
//                       <ifMode mode="VIEW" include="false">, so what was entered is never shown in VIEW (in newbornDischarge/newbornDailyProgress
//                       that wrapper hides read-only lookups only). TESTED below (test.fixme). Fix: drop the ifMode, or wrap only a heading.

const FORM = 'newbornInitial.xml';
const NEWBORN_INITIAL_ENCOUNTER_TYPE_UUID = '093b6ffc-e55a-461a-85cc-c6acf7714a23';

// A newborn: the form is only offered for patients younger than 42 days at visit start.
const daysAgo = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

// Records an earlier encounter in the visit with the given obs (concept mappings and numbers/codes as REST accepts them).
const recordEarlierEncounter = async (api: APIRequestContext, context: EntryContext, obs: Array<{ concept: string; value: unknown }>) => {
  const res = await api.post('encounter', {
    data: {
      patient: context.patient.uuid,
      encounterType: NEWBORN_INITIAL_ENCOUNTER_TYPE_UUID,
      location: MCH_OPD_LOCATION_UUID,
      encounterDatetime: new Date().toISOString(),
      visit: context.visitUuid,
      obs,
    },
  });
  expect(res.ok(), `create encounter: ${res.status()}`).toBeTruthy();
};

const saveButton = (page: Page) => page.locator('#buttons input.submitButton');

test.describe('newbornInitial', () => {
  let context: EntryContext;

  test.beforeEach(async ({ createEntryContext }) => {
    context = await createEntryContext({ givenName: 'AutoNbInitial', familyName: 'Tester', gender: 'F', birthdate: daysAgo(3) });
  });

  const open = async (page: Page) => {
    await EntryFormPage.open(page, FORM, context);
    await expect(page.locator('#outborn')).toBeVisible();
  };

  // when :314, :335, :809, :810
  const showHide: Array<[string, string, string, string, string]> = [
    // [name, group, trigger answer, target, answer that hides it]
    ['delivery location other (:314)', '#d-location', 'other', '#delivery-location-other', 'home'],
    ['transport other (:335)', '#transport', 'other', '#other-transport', 'car'],
    ['air supply CPAP (:809)', '#air', 'CPAP', '#cpap', 'Room air'],
    ['air supply oxygen (:810)', '#air', 'Supplemental oxygen therapy', '#oxy2', 'Room air'],
  ];
  for (const [name, group, answer, target, other] of showHide) {
    test(`${name} shows ${target} only for that answer`, async ({ page }) => {
      await open(page);
      await expect(page.locator(target)).toBeHidden();
      await page.locator(group).getByLabel(answer, { exact: true }).check();
      await expect(page.locator(target)).toBeVisible();
      await page.locator(group).getByLabel(other, { exact: true }).check();
      await expect(page.locator(target)).toBeHidden();
    });
  }

  test('CPAP and oxygen show their own fields and not each other', async ({ page }) => {
    // when :809 vs :810
    await open(page);
    await page.locator('#air').getByLabel('CPAP', { exact: true }).check();
    await expect(page.locator('#cpap')).toBeVisible();
    await expect(page.locator('#oxy2')).toBeHidden();
    await page.locator('#air').getByLabel('Supplemental oxygen therapy', { exact: true }).check();
    await expect(page.locator('#oxy2')).toBeVisible();
    await expect(page.locator('#cpap')).toBeHidden();
  });

  // script :67 normal/abnormal exclusion, one .exam block per row: [block index, normal, other normal, abnormal]
  const exams: Array<[string, number, string, string]> = [
    ['umbilical cord', 0, 'Clean', 'Moist'],
    ['eyes', 1, 'Clear', 'Red eyes'],
    ['skin colour', 2, 'Normal (pink)', 'Jaundice'],
  ];
  for (const [name, index, normal, abnormal] of exams) {
    test(`${name}: a normal and an abnormal finding exclude each other`, async ({ page }) => {
      await open(page);
      const block = page.locator('.exam').nth(index);
      await block.getByLabel(normal, { exact: true }).check();
      await block.getByLabel(abnormal, { exact: true }).check();
      await expect(block.getByLabel(normal, { exact: true })).not.toBeChecked();
      await block.getByLabel(normal, { exact: true }).check();
      await expect(block.getByLabel(abnormal, { exact: true })).not.toBeChecked();
    });
  }

  test('an earlier birth weight, birth length and weight in the visit are shown next to the inputs', async ({ page, api }) => {
    // script :67 prefill from REST (same visit, not this encounter)
    await recordEarlierEncounter(api, context, [
      { concept: 'CIEL:5916', value: 3.1 },
      { concept: 'CIEL:163554', value: 50 },
      { concept: 'CIEL:5089', value: 3.0 },
    ]);
    await open(page);
    await expect(page.locator('#birthWeightInfo')).toContainText('3.1kg');
    await expect(page.locator('#birthLengthInfo')).toContainText('50cm');
    await expect(page.locator('#lastWeightKg')).toContainText('3kg');
    await expect(page.locator('#birthWeightBox')).toBeVisible();
    await expect(page.locator('#birthLengthBox')).toBeVisible();
  });

  test('without earlier weights the birth weight box stays hidden', async ({ page }) => {
    await open(page);
    await expect(page.locator('#birthWeightBox')).toBeHidden();
    await expect(page.locator('#Overview')).toBeVisible(); // ifMode VIEW include=false :230 (ENTER renders it)
  });

  test('saving without a location does not save', async ({ page }) => {
    // required location widget (shared subform; the session location MCH OPD is not an option, so none is preselected)
    await open(page);
    await expect(page.locator('#encounterLocation select')).toHaveValue('');
    await saveButton(page).click();
    await expect(page.locator('span.field-error:visible', { hasText: /required/i }).first()).toBeVisible();
    await expect(page).not.toHaveURL(VISIT_PAGE_URL);
  });

  test('saves history, exam, diagnosis and treatment, and enrolls the infant in the Infant program', async ({ page, api }) => {
    const enrollmentsUrl = `programenrollment?patient=${context.patient.uuid}&v=custom:(program:(name),dateCompleted)`;
    expect(((await (await api.get(enrollmentsUrl)).json()).results as unknown[]).length).toBe(0);

    await open(page);
    await selectDefaultProvider(page);
    await page.locator('#encounterLocation select').selectOption({ label: 'NICU' });
    await page.locator('#Overview textarea').first().fill('Born outside, brought by motorbike');
    await page.locator('#outcome-condition').getByLabel('fair', { exact: true }).check();
    await page.locator('#d-location').getByLabel('home', { exact: true }).check();
    await page.locator('#weight_kg input').fill('2.8');
    await page.locator('.exam').nth(0).getByLabel('Dry', { exact: true }).check();
    await page.locator('#dx .two-columns').first().getByLabel('Birth asphyxia', { exact: true }).check();
    await page.locator('#air').getByLabel('Room air', { exact: true }).check();
    await page.locator('#treatment textarea').fill('Warmth, feeding');
    await saveButton(page).click();
    await new EntryFormPage(page, FORM).expectSaved();

    const encounters = await getPatientEncounters(api, context.patient.uuid);
    expect(encounters.map((e) => e.encounterType.uuid)).toEqual([NEWBORN_INITIAL_ENCOUNTER_TYPE_UUID]);
    const displays = (await getEncounterObs(api, encounters[0].uuid)).map((o) => o.display.toLowerCase());
    for (const expected of ['presenting history', 'weight', 'dry', 'asphyxia', 'room air', 'warmth']) {
      expect(displays.some((d) => d.includes(expected)), `an obs mentions "${expected}"`).toBeTruthy();
    }

    // enrollInProgram Infant :228
    const enrollments = (await (await api.get(enrollmentsUrl)).json()).results as Array<{ program: { name: string } }>;
    expect(enrollments.some((e) => /infant/i.test(e.program.name))).toBeTruthy();
  });

  const fillInitial = async (page: Page) => {
    await selectDefaultProvider(page);
    await page.locator('#encounterLocation select').selectOption({ label: 'NICU' });
    // outborn history
    const outborn = page.locator('#outborn');
    await outborn.locator('input[type=text]').nth(0).fill('Fatmata Kamara'); // mother's name
    await outborn.locator('input[type=text]').nth(1).fill('27'); // mother's age
    await outborn.locator('input[type=text]').nth(2).fill('076123456'); // mother's telephone
    await outborn.getByLabel('twins', { exact: true }).check();
    await outborn.getByLabel('Delivery by cesarean section').check();
    await page.locator('#d-location').getByLabel('other', { exact: true }).check();
    await page.locator('#delivery-location-other input[type=text]').fill('Roadside');
    await page.locator('#transport').getByLabel('motorbike', { exact: true }).check();
    await outborn.locator('textarea').fill('Prolonged labour at home');
    await page.locator('#mother').getByLabel('Malaria').check();
    await page.locator('#mother input[type=checkbox]').first().check(); // Pre-eclampsia
    await page.locator('#heart_rate input').fill('150');
    await page.locator('#temperature_c input').fill('36.8');
    await page.locator('#weight_kg input').fill('2.8');
    await page.locator('#muac_c input').fill('9');
    await page.locator('#hemoglobin input').fill('14');
    await page.locator('#labs').getByLabel('Positive').check();
    // exam (only the cord comment: the cord and eye comments are two inputs of one concept, see V1 and VW1)
    await page.locator('.exam').nth(0).getByLabel('Dry', { exact: true }).check();
    await page.locator('.exam').nth(0).locator('input[type=text]').fill('Cord comment');
    await page.locator('.exam').nth(1).getByLabel('Clear', { exact: true }).check();
    await page.locator('.exam').nth(2).getByLabel('Jaundice', { exact: true }).check();
    await page.locator('#exam').getByLabel('Anuria (No urination)').check();
    await page.locator('#exam').getByLabel('None', { exact: true }).check(); // stool
    await page.locator('#exam').locator('p').filter({ hasText: 'Seizures' }).getByLabel('no', { exact: true }).check();
    await page.locator('#scores input[type=text]').fill('5');
    await page.locator('#dx .two-columns').first().getByLabel('Birth asphyxia', { exact: true }).check();
    await page.locator('#dx .two-columns').first().getByLabel('Anaemia', { exact: true }).check();
    await page.locator('#dx').getByLabel('Neonatal sepsis', { exact: true }).check();
    await page.locator('#dx textarea[id^=w]').fill('Dx summary text'); // (the Outcome summary is the same concept, see V2 and VW2)
    await page.locator('#treatment').getByLabel('Breastfed', { exact: true }).check();
    await page.locator('#treatment').getByLabel('Tube', { exact: true }).check();
    await page.locator('#air').getByLabel('CPAP', { exact: true }).check();
    await page.locator('#cpap input[type=text]').fill('6');
    await page.locator('#treatment textarea').fill('Warmth, feeding');
  };

  // VIEW (viewEncounterWithHtmlForm): saved values are span.value, unselected options span.emptyValue ("[X] motorbike" / "[  ] car").
  test('VIEW: shows the saved history, exam, diagnoses and treatment, and not what was left empty', async ({ page, api }) => {
    await open(page);
    await fillInitial(page);
    await saveButton(page).click();
    await new EntryFormPage(page, FORM).expectSaved();
    const [encounter] = await getPatientEncounters(api, context.patient.uuid);

    // Answers the form labels differently from the concept (answerCodes / answerCode), and the hidden markers it does not show: the
    // contact's relationship (hiddenAnswerConceptId :66) and the diagnosis order.
    const view = await expectViewShowsSavedObs(page, api, FORM, encounter.uuid, {
      'Method of transportation: Motorcycle': 'motorbike',
      'Diagnosis: Anemia': 'Anaemia',
      'Skin exam findings: Neonatal jaundice': 'Jaundice',
      'Neonatal umbilical stump status: Neonatal umbilical stump dry': 'Dry',
      'Feeding technique for newborn: Tube feeding of infant': 'Tube',
      'Infant feeding method: Breastfeeding child': 'Breastfed',
      'Relationship to patient: Mother': '',
      'Diagnosis order: Secondary': '',
    });
    const shown = await view.valueTexts();
    for (const expected of [
      'Fatmata Kamara',
      '27',
      '076123456',
      '[X] twins',
      '[X] Delivery by cesarean section',
      '[X] other',
      'Roadside',
      '[X] motorbike',
      'Prolonged labour at home',
      '[X] Malaria',
      '150',
      '2.8',
      '[X] Positive',
      '[X] Dry',
      'Cord comment',
      '[X] Clear',
      '[X] Jaundice',
      '[X] Anuria (No urination)',
      '[X] None',
      '[X] no',
      '5',
      '[X] Anaemia',
      '[X] Birth asphyxia',
      '[X] Neonatal sepsis',
      'Dx summary text',
      '[X] Breastfed',
      '[X] Tube',
      '[X] CPAP',
      '6',
      'Warmth, feeding',
    ]) {
      expect(shown, expected).toContain(expected);
    }

    // conditional answers: the delivery location "other" and its text, and the one selected radio of each group
    await expect(page.locator('#d-location .value')).toHaveText(['[X] other']);
    await expect(page.locator('#d-location .emptyValue')).toHaveCount(4);
    await expect(page.locator('#delivery-location-other .value')).toHaveText('Roadside');
    await expect(page.locator('#transport .value')).toHaveText(['[X] motorbike']);
    await expect(page.locator('#other-transport .value')).toHaveCount(0); // the transport "other" text was not given
    await expect(page.locator('#air .value')).toHaveText(['[X] CPAP']);
    await expect(page.locator('#cpap .value')).toHaveText('6');
    await expect(page.locator('#oxy2 .value')).toHaveCount(0);
    // what was not ticked or typed is not a value: the maternal complications, the other exam answers, the other labs
    await expect(page.locator('#mother .value')).toHaveText(['[X] Preeclampsia', '[X] Malaria']);
    await expect(page.locator('.exam').nth(0).locator('.value')).toHaveText(['[X] Dry', 'Cord comment']);
    await expect(page.locator('.exam').nth(1).locator('.value')).toHaveText(['[X] Clear']);
    await expect(page.locator('#labs .value')).toHaveText(['14', '[X] Positive']);
    // the diagnoses that were not ticked (obsgroup showIfEmpty=false) are not listed
    await expect(page.locator('#dx .value')).toHaveText(['[X] Anaemia', '[X] Birth asphyxia', '[X] Neonatal sepsis', 'Dx summary text']);
    await expect(page.getByText('Macrosomia')).toHaveCount(0);
    // ENTER-only content is absent: the heading, the last-weight lookup span and the buttons
    await expect(page.locator('h2, #lastWeightKg, #buttons, input, select, textarea, button')).toHaveCount(0);
  });

  // VW1 (Medium): the umbilical cord comment (:549) and the eye comment (:576) are two inputs of one concept (CIEL:168722). HFE binds
  // a saved obs to the first input of its concept, so a lone eye comment is shown as the cord comment. Intended: it is shown with the eyes.
  // Remove test.fixme() when the concepts differ.
  test('VW1: an eye comment is shown with the eyes, not with the umbilical cord', async ({ page, api }) => {
    test.fixme();
    await open(page);
    await selectDefaultProvider(page);
    await page.locator('#encounterLocation select').selectOption({ label: 'NICU' });
    await page.locator('.exam').nth(1).locator('input[type=text]').fill('Discharge from the left eye');
    await saveButton(page).click();
    await new EntryFormPage(page, FORM).expectSaved();
    const [encounter] = await getPatientEncounters(api, context.patient.uuid);

    await ViewFormPage.open(page, FORM, encounter.uuid);
    await expect(page.locator('.exam').nth(0).locator('.value')).toHaveCount(0);
    await expect(page.locator('.exam').nth(1).locator('.value')).toHaveText(['Discharge from the left eye']);
  });

  // VW2 (Medium): the summary in Diagnoses (:777) and the one in Outcome (:857) are the same concept (CIEL:161011); a lone Outcome
  // summary is shown in the Diagnoses section. Intended: it is shown in Outcome. Remove test.fixme() when the concepts differ.
  test('VW2: an Outcome summary is shown in the Outcome section, not in Diagnoses', async ({ page, api }) => {
    test.fixme();
    await open(page);
    await selectDefaultProvider(page);
    await page.locator('#encounterLocation select').selectOption({ label: 'NICU' });
    await page.locator('#outcome textarea').fill('Discharged to the ward');
    await saveButton(page).click();
    await new EntryFormPage(page, FORM).expectSaved();
    const [encounter] = await getPatientEncounters(api, context.patient.uuid);

    await ViewFormPage.open(page, FORM, encounter.uuid);
    await expect(page.locator('#dx .value')).toHaveCount(0);
    await expect(page.locator('#outcome .value')).toHaveText(['Discharged to the ward']);
  });

  // VW3 (Medium): the whole Overview section (presenting history, condition at admission, clinical adverse effect: three inputs) is inside
  // <ifMode mode="VIEW" include="false"> (:230), so none of it is shown in VIEW. Intended: shown (the sibling forms hide only their read-only
  // lookups). Remove test.fixme() when the ifMode is removed.
  test('VW3: the Overview answers (presenting history, condition at admission) are shown in VIEW', async ({ page, api }) => {
    test.fixme();
    await open(page);
    await selectDefaultProvider(page);
    await page.locator('#encounterLocation select').selectOption({ label: 'NICU' });
    await page.locator('#Overview textarea').first().fill('Born outside, brought by motorbike');
    await page.locator('#Overview #outcome-condition').getByLabel('fair', { exact: true }).check();
    await page.locator('#Overview').getByLabel('yes', { exact: true }).check();
    await saveButton(page).click();
    await new EntryFormPage(page, FORM).expectSaved();
    const [encounter] = await getPatientEncounters(api, context.patient.uuid);

    const view = await ViewFormPage.open(page, FORM, encounter.uuid);
    const shown = await view.valueTexts();
    for (const expected of ['Born outside, brought by motorbike', '[X] fair', '[X] yes']) {
      expect(shown, expected).toContain(expected);
    }
  });
});
