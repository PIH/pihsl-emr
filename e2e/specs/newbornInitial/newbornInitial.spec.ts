import type { APIRequestContext, Page } from '@playwright/test';
import { test, expect, type EntryContext } from '../../core';
import { MCH_OPD_LOCATION_UUID } from '../../core/constants';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import { EntryFormPage } from '../../pages';

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
//                               (VIEW cannot be tested; ENTER renders them: one smoke assertion below)
// Scripts: :44-62 (ENTER) if the encounter date is not today at load, set the time widgets to 00:00 (runs once on load, so
//   picking a past date afterwards keeps the current time). :67-193 (ENTER/EDIT): .normalObs/.abnormalObs checkboxes inside one
//   .exam block are mutually exclusive; setUpNextAndSubmitButtons(); REST GET of the patient's encounters up to the encounter
//   date, and for the ones in the same visit shows the latest birth weight (CIEL:5916, #birthWeightBox), birth length
//   (CIEL:163554, #birthLengthBox) and the last weight (CIEL:5089, #lastWeightKg); no warning in this form.
// Side effects on save: enrollInProgram Infant (:228, locationTag "Program Location "), CleanDiagnosisConstructAction and
//   ApplyDispositionAction (:21-22). No order. Provider and location are required (shared subform).
// Not covered here: disposition (ApplyDispositionAction), infant vitals scoring and the Save block (_shared.e2e.md), the
//   retrospective-time script (needs a non-today date at load), diagnosis search, EDIT/VIEW.
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
    await expect(page).not.toHaveURL(/referenceapplication\/home\.page/);
  });

  test('saves history, exam, diagnosis and treatment, and enrolls the infant in the Infant program', async ({ page, api }) => {
    const enrollmentsUrl = `programenrollment?patient=${context.patient.uuid}&v=custom:(program:(name),dateCompleted)`;
    expect(((await (await api.get(enrollmentsUrl)).json()).results as unknown[]).length).toBe(0);

    await open(page);
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
});
