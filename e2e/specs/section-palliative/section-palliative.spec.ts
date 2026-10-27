// section-palliative.xml: Palliative care section of the NCD initial (diseases) and followup (indicators) encounters.
// The specs open the form URL directly under an NCD initial or NCD followup encounter, so the visit-page rule that
// lists this section under both parents is not exercised (documentation/_availability.e2e.md).
//
// Conditions in the form, from documentation inventory (section-palliative.inv.md):
//   ifMode VIEW include=false      :21, :216, :290  script, ECOG help table and #buttons in ENTER/EDIT only (not covered)
//   includeIf initial / initial-2  :36        non-tumoral / tumoral disease checkboxes
//   includeIf followup / -2        :86        counselling, awareness/treatment, symptom table
//   when {question} = Yes          :117, :154 show #pall-fui-{tog}-details; only #pall-fui-missed-details exists (V1)
//   toggle symptom checkbox        :172       show tr #<symptom>-details (7 symptoms: progress + control radios)
//   when Hospitalization = Yes     :256       show #hosp-pall-reason (both types)
// Required (followup): "Missed doses in past week" :115 (req="true").
// Script (:22-27): setUpNextAndSubmitButtons() only (Next / section buttons / Save); no validation or derived value.
// Side effects on save: <postSubmissionAction CleanDiagnosisConstructAction> (:19, pihcore, not read); no
//   diagnosis obs in this form, so nothing observable. No program enrollment.
// Not covered here: Next / section-jump buttons, VIEW mode, the "Other" disease / hospitalization comment fields.
//
// Findings:
//   V1 Low  :117, 154  <when> targets #pall-fui-understand-details, -titrate-, -adher-, -aware- and
//                      #pall-fui-improved-details do not exist: answering Yes shows nothing. Fix: drop the five <when>s.
//   V2 Low  :15, :33   id="palliative" on both <htmlform> and the section <div> (duplicate id in the rendered page).
//   V3 Low  :108, 145  <p> wrapping <p class="list-inline"> (invalid HTML; the browser closes the outer <p> empty).

import { type Page } from '@playwright/test';
import { test, expect, type SectionEncounter } from '../../core';
import { NCD_FOLLOWUP_ENCOUNTER_TYPE_UUID, NCD_INITIAL_ENCOUNTER_TYPE_UUID } from '../../core/constants';
import { getEncounterObs } from '../../commands';
import { SectionFormPage } from '../../pages';

const FORM = 'section-palliative.xml';

type Create = (opts: { encounterTypeUuid: string; patient?: { givenName?: string; familyName?: string } }) => Promise<SectionEncounter>;

// Local helpers. Rows are found by their label text because widget ids (wNN) shift between encounter types.
const openForm = async (page: Page, create: Create, encounterTypeUuid: string) => {
  const section = await create({ encounterTypeUuid, patient: { givenName: 'AutoPall', familyName: 'Tester' } });
  await SectionFormPage.openEdit(page, FORM, section);
  return section;
};
const row = (page: Page, text: RegExp) => page.locator('p').filter({ hasText: text });
const pick = (page: Page, text: RegExp, option: string) => row(page, text).getByLabel(option, { exact: true }).first();
const displays = async (api: Parameters<typeof getEncounterObs>[0], uuid: string) =>
  (await getEncounterObs(api, uuid)).map((o) => o.display.toLowerCase());
const save = async (page: Page) => {
  const form = new SectionFormPage(page, FORM);
  await form.save();
  await form.expectSaved();
};

const SYMPTOMS = ['Pain', 'Nausea', 'Constipation', 'Insomnia', 'Weakness', 'Jaundice', 'Dyspnea'];

test.describe('section-palliative, NCD initial encounter', () => {
  test('shows the disease checkboxes and none of the followup indicators', async ({ page, createSectionEncounter }) => {
    // includeIf initial :36; includeIf followup :86 (server-side: absent, not hidden)
    await openForm(page, createSectionEncounter, NCD_INITIAL_ENCOUNTER_TYPE_UUID);
    await expect(page.getByLabel('Breast cancer', { exact: true })).toBeVisible();
    await expect(page.getByText('Palliative followup indicators')).toHaveCount(0);
    await expect(page.getByText('Counselling done')).toHaveCount(0);
  });

  test('the hospitalization reasons show only when Hospitalization required is Yes', async ({
    page,
    createSectionEncounter,
  }) => {
    // when :256
    await openForm(page, createSectionEncounter, NCD_INITIAL_ENCOUNTER_TYPE_UUID);
    const reasons = page.locator('#hosp-pall-reason');
    await expect(reasons).toBeHidden();
    await page.locator('#palliative-hosp').getByLabel('Yes', { exact: true }).check();
    await expect(reasons).toBeVisible();
    await page.locator('#palliative-hosp').getByLabel('No', { exact: true }).check();
    await expect(reasons).toBeHidden();
  });

  test('saves diseases, ECOG and hospitalization, and restores them in EDIT', async ({
    page,
    createSectionEncounter,
    api,
  }) => {
    const section = await openForm(page, createSectionEncounter, NCD_INITIAL_ENCOUNTER_TYPE_UUID);
    await page.getByLabel('Chronic kidney disease', { exact: true }).check();
    await page.getByLabel('Breast cancer', { exact: true }).check();
    await page.getByLabel('2', { exact: true }).check(); // ECOG performance status
    await page.locator('#palliative-hosp').getByLabel('Yes', { exact: true }).check();
    await page.locator('#hosp-pall-reason').getByLabel('Vomiting', { exact: true }).check();
    await save(page);

    const d = await displays(api, section.encounter.uuid);
    expect(d).toContain('disease requiring palliative care treatment: chronic kidney disease');
    expect(d).toContain('disease requiring palliative care treatment: malignant neoplasm of breast');
    expect(d).toContain('ecog performance status: 2');
    expect(d).toContain('patient referred to hospital: yes');
    expect(d).toContain('reasons for referral (coded): vomiting');

    await SectionFormPage.openEdit(page, FORM, section);
    await expect(page.locator('#hosp-pall-reason')).toBeVisible();
    await expect(page.getByLabel('Breast cancer', { exact: true })).toBeChecked();
    await expect(page.getByLabel('2', { exact: true })).toBeChecked();
  });
});

test.describe('section-palliative, NCD followup encounter', () => {
  test('shows the followup indicators and not the disease checkboxes', async ({ page, createSectionEncounter }) => {
    // includeIf followup :86; includeIf initial :36 (absent)
    await openForm(page, createSectionEncounter, NCD_FOLLOWUP_ENCOUNTER_TYPE_UUID);
    await expect(page.getByText('Counselling done')).toBeVisible();
    await expect(page.getByLabel('Breast cancer', { exact: true })).toHaveCount(0);
  });

  test('the missed-dose count shows only when missed doses is Yes', async ({ page, createSectionEncounter }) => {
    // when :117 (the only one of the five treatment questions whose target exists, see V1)
    await openForm(page, createSectionEncounter, NCD_FOLLOWUP_ENCOUNTER_TYPE_UUID);
    const count = page.locator('#pall-fui-missed-details');
    await expect(count).toBeHidden();
    await pick(page, /^\s*Missed doses in past week/, 'yes').check();
    await expect(count).toBeVisible();
    await pick(page, /^\s*Missed doses in past week/, 'no').check();
    await expect(count).toBeHidden();
  });

  test('each symptom\'s progress row shows only while its checkbox is ticked', async ({ page, createSectionEncounter }) => {
    // toggle :172 on the seven symptom checkboxes: the tr id "<symptom>-details" shows while ticked
    await openForm(page, createSectionEncounter, NCD_FOLLOWUP_ENCOUNTER_TYPE_UUID);
    for (const symptom of SYMPTOMS) {
      const details = page.locator(`#${symptom}-details`);
      const box = page.locator(`#${symptom}-symp`).getByLabel(symptom, { exact: true });
      await expect(details, `${symptom} row hidden at first`).toBeHidden();
      await box.check();
      await expect(details, `${symptom} row shown when ticked`).toBeVisible();
      await box.uncheck();
      await expect(details, `${symptom} row hidden again`).toBeHidden();
    }
  });

  test('saving with the missed-doses question blank does not save', async ({ page, createSectionEncounter }) => {
    // required="true" on missed doses :117
    await openForm(page, createSectionEncounter, NCD_FOLLOWUP_ENCOUNTER_TYPE_UUID);
    await new SectionFormPage(page, FORM).save();
    await expect(page).not.toHaveURL(/referenceapplication\/home\.page/);
    await expect(page.locator('span.field-error', { hasText: 'Required' })).toHaveCount(1);
  });

  test('saves the followup indicators and a symptom, and restores them in EDIT', async ({
    page,
    createSectionEncounter,
    api,
  }) => {
    const section = await openForm(page, createSectionEncounter, NCD_FOLLOWUP_ENCOUNTER_TYPE_UUID);
    await pick(page, /^\s*Missed doses in past week/, 'yes').check();
    await page.locator('#pall-fui-missed-details input[type=text]').fill('2');
    await pick(page, /^\s*Counselling done/, 'yes').check();
    await page.locator('#Pain-symp').getByLabel('Pain', { exact: true }).check();
    await page.locator('#Pain-details').getByLabel('worse', { exact: true }).check();
    await page.locator('#Pain-details').getByLabel('uncontrolled', { exact: true }).check();
    await page.getByLabel('3', { exact: true }).check(); // ECOG
    await page.locator('#palliative-hosp').getByLabel('No', { exact: true }).check();
    await save(page);

    const d = await displays(api, section.encounter.uuid);
    expect(d).toContain('counseling status: completed');
    expect(d).toContain('number of missed medication doses in past 7 days: 2');
    expect(d).toContain('sign/symptom name: pain');
    expect(d).toContain('symptom progression: worse');
    expect(d).toContain('symptom management: not controlled');
    expect(d).toContain('ecog performance status: 3');
    expect(d).toContain('patient referred to hospital: no');

    await SectionFormPage.openEdit(page, FORM, section);
    await expect(page.locator('#pall-fui-missed-details')).toBeVisible();
    await expect(page.locator('#Pain-details')).toBeVisible();
    await expect(page.locator('#Nausea-details')).toBeHidden();
    await expect(page.locator('#Pain-details').getByLabel('worse', { exact: true })).toBeChecked();
  });
});
