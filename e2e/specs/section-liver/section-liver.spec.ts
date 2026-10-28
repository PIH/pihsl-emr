// section-liver.xml: Liver disease section of the NCD initial (diagnoses) and followup (indicators) encounters.
// The specs open the form URL directly under an NCD initial or NCD followup encounter, so the visit-page rule that
// lists this section under both parents is not exercised (documentation/_availability.e2e.md).
//
// Conditions in the form, from documentation inventory (section-liver.inv.md):
//   ifMode VIEW include=false      :21, :365  script and #buttons in ENTER/EDIT only (not covered)
//   includeIf initial / initial-2  :37        diagnosis checkboxes (hepatitis, hepatocarcinoma, cirrhosis)
//   includeIf followup / -2        :106, :171, :303  followup heading, awareness/control block, "On treatment" block
//   when Asymptomatic = No         :126       show #liver-symptoms
//   when {question} = Yes          :189, :225 show #liver-{tog}-details; only #liver-fui-miss-details exists (V1)
//   when liver control = uncontr.  :242       show #liver-fui-uncontrolled ("Send for admission")
//   when HepB indication = Yes     :271       show #new-hepb-reason (all types)
//   includeIf gender == 'F'        :287       two pregnancy reasons inside #new-hepb-reason
//   when On treatment = Yes        :311       show #hepB-details
// Required (followup): missed doses :189, #liver-control :238, #new-hepb-tto :267 (both types), #hepB-q :306.
// Script (:22-27): setUpNextAndSubmitButtons() only (Next / section buttons / Save); no validation or derived value.
// Side effects on save: <postSubmissionAction CleanDiagnosisConstructAction> (:19, pihcore, not read); observed to add
//   a "Diagnosis order: Secondary" obs to the Visit Diagnoses group, asserted below. No program enrollment.
// EDIT is covered by the two save tests (restored when-targets and ticks), VIEW by the same tests (exactly the saved answers).
// Not covered here: the Next / section-jump buttons (navigate to other forms), the Hepatitis B drug
//   "response to treatment" answers (plain radios, no logic).
//
// Findings:
//   V1 Low  :189, 225  <when> targets #liver-fui-under-details, -tite-, -adher-, -aware-, -improved-, #liver-eso-var-details
//                      do not exist (only #liver-fui-miss-details does, :202): answering Yes to those six shows nothing.
//                      Template copied from a form whose rows had detail boxes. Fix: drop the six <when>s.
//   V2 Low  :263-285   <div id="new-hepb-reason"> sits inside <p class="side-by-side"> (invalid HTML; the browser
//                      closes the <p> before the div). Fix: use a <div> wrapper.
//   V3 Low  :267, 306  PIH:14889 "Treatment for Hepatitis B (coded)" holds both "Indication for treatment" (group
//                      PIH:14827) and "On treatment" (group PIH:14890); the grouping obs tells them apart but any
//                      report on the bare concept cannot (unconfirmed intent). Round trip is correct, tested below.

import { type Page } from '@playwright/test';
import { test, expect, type SectionEncounter } from '../../core';
import { NCD_FOLLOWUP_ENCOUNTER_TYPE_UUID, NCD_INITIAL_ENCOUNTER_TYPE_UUID } from '../../core/constants';
import { getEncounterObs } from '../../commands';
import { SectionFormPage, expectViewShowsSavedObs } from '../../pages';

const FORM = 'section-liver.xml';

type Create = (opts: {
  encounterTypeUuid: string;
  patient?: { givenName?: string; familyName?: string; gender?: 'F' | 'M' };
}) => Promise<SectionEncounter>;

// Local helpers. Rows are found by their label text because widget ids (wNN) shift between encounter types.
const openForm = async (page: Page, create: Create, encounterTypeUuid: string, gender: 'F' | 'M' = 'F') => {
  const section = await create({ encounterTypeUuid, patient: { givenName: 'AutoLiver', familyName: 'Tester', gender } });
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

test.describe('section-liver, NCD initial encounter', () => {
  test('shows the diagnosis block and none of the followup indicators', async ({ page, createSectionEncounter }) => {
    // includeIf initial :37; includeIf followup :106, :171, :303 (server-side: absent, not hidden)
    await openForm(page, createSectionEncounter, NCD_INITIAL_ENCOUNTER_TYPE_UUID);
    await expect(page.getByLabel('Chronic Hepatitis C', { exact: true })).toBeVisible();
    await expect(page.locator('#liver-control')).toHaveCount(0);
    await expect(page.locator('#hepB-q')).toHaveCount(0);
    await expect(page.getByText('Liver followup indicators')).toHaveCount(0);
  });

  test('the symptom list shows only when Asymptomatic is No', async ({ page, createSectionEncounter }) => {
    // when :126
    await openForm(page, createSectionEncounter, NCD_INITIAL_ENCOUNTER_TYPE_UUID);
    const symptoms = page.locator('#liver-symptoms');
    await expect(symptoms).toBeHidden();
    await pick(page, /^\s*Asymptomatic/, 'no').check();
    await expect(symptoms).toBeVisible();
    await pick(page, /^\s*Asymptomatic/, 'yes').check();
    await expect(symptoms).toBeHidden();
    await pick(page, /^\s*Asymptomatic/, 'unknown').check();
    await expect(symptoms).toBeHidden();
  });

  test('the Hepatitis B treatment reasons show only when an indication exists', async ({ page, createSectionEncounter }) => {
    // when :271
    await openForm(page, createSectionEncounter, NCD_INITIAL_ENCOUNTER_TYPE_UUID);
    const reasons = page.locator('#new-hepb-reason');
    await expect(reasons).toBeHidden();
    await page.locator('#new-hepb-tto').getByLabel('yes', { exact: true }).check();
    await expect(reasons).toBeVisible();
    await page.locator('#new-hepb-tto').getByLabel('no', { exact: true }).check();
    await expect(reasons).toBeHidden();
  });

  // includeIf patient.gender == 'F' :287: the two pregnancy reasons are rendered for women only
  for (const [gender, count] of [['F', 1], ['M', 0]] as const) {
    test(`pregnancy-related Hepatitis B reasons are ${count ? 'offered' : 'absent'} for a ${gender} patient`, async ({
      page,
      createSectionEncounter,
    }) => {
      await openForm(page, createSectionEncounter, NCD_INITIAL_ENCOUNTER_TYPE_UUID, gender);
      await expect(page.getByLabel('VL not available during pregnancy', { exact: true })).toHaveCount(count);
      await expect(page.getByLabel('VL ≥ 2000 or HbeAg+ during pregnancy', { exact: true })).toHaveCount(count);
      // the shared reasons are offered to everyone
      await expect(page.getByLabel('Co-infection with HCV and/or HIV', { exact: true })).toHaveCount(1);
    });
  }

  test('saving without the Hepatitis B indication does not save', async ({ page, createSectionEncounter }) => {
    // required="true" on #new-hepb-tto :267
    await openForm(page, createSectionEncounter, NCD_INITIAL_ENCOUNTER_TYPE_UUID);
    await new SectionFormPage(page, FORM).save();
    await expect(page).not.toHaveURL(/referenceapplication\/home\.page/);
    await expect(page.locator('span.field-error', { hasText: 'Required' }).first()).toBeVisible();
  });

  test('saves diagnoses, symptoms and the Hepatitis B indication, and restores them in EDIT', async ({
    page,
    createSectionEncounter,
    api,
  }) => {
    const section = await openForm(page, createSectionEncounter, NCD_INITIAL_ENCOUNTER_TYPE_UUID);
    await page.getByLabel('Chronic Hepatitis B', { exact: true }).check();
    await pick(page, /^\s*Asymptomatic/, 'no').check();
    await pick(page, /^\s*Ascites/, 'yes').check();
    await page.locator('#new-hepb-tto').getByLabel('yes', { exact: true }).check();
    await page.getByLabel('Co-infection with HCV and/or HIV', { exact: true }).check();
    await save(page);

    const d = await displays(api, section.encounter.uuid);
    expect(d).toContain('diagnosis: chronic viral hepatitis b');
    // CleanDiagnosisConstructAction (pihcore, not read here) is observed to add "Diagnosis order: Secondary"
    expect(d).toContain('diagnosis order: secondary');
    expect(d).toContain('symptom absent: asymptomatic liver disease');
    expect(d).toContain('symptom present: oedema');
    expect(d).toContain('treatment for hepatitis b (coded): yes');

    // EDIT starts from the saved values: the when-targets are open and the boxes ticked
    await SectionFormPage.openEdit(page, FORM, section);
    await expect(page.locator('#liver-symptoms')).toBeVisible();
    await expect(page.locator('#new-hepb-reason')).toBeVisible();
    await expect(page.getByLabel('Chronic Hepatitis B', { exact: true })).toBeChecked();
    await expect(page.getByLabel('Co-infection with HCV and/or HIV', { exact: true })).toBeChecked();
    // VIEW: exactly the saved answers. The diagnosis, symptoms and Hepatitis B indication use the form's labels ("yes" for a
    // symptom, the indication reason by its own text); "Diagnosis order: Secondary" is written by CleanDiagnosisConstructAction, not
    // by a field of the form, so it has no value of its own in the VIEW.
    const view = await expectViewShowsSavedObs(page, api, FORM, section.encounter.uuid, {
      'Diagnosis: Chronic viral Hepatitis B': '[X] Chronic Hepatitis B',
      'Symptom absent: Asymptomatic liver disease': '[X] no',
      'Symptom present: Oedema': '[X] yes',
      'Reason for Hepatitis B treatment: Chronic hepatitis C with HIV infection': '[X] Co-infection with HCV and/or HIV',
      'Diagnosis order: Secondary': '',
    });
    expect(await view.valueTexts()).toEqual(['[X] Chronic Hepatitis B', '[X] no', '[X] yes', '[X] yes', '[X] Co-infection with HCV and/or HIV']);
    await expect(view.page.locator('#new-hepb-tto .value')).toHaveText('[X] yes');
    await expect(view.page.locator('#hepB-q')).toHaveCount(0); // followup-only question
  });
});

test.describe('section-liver, NCD followup encounter', () => {
  test('shows the followup indicators and not the diagnosis block', async ({ page, createSectionEncounter }) => {
    // includeIf followup :106, :171, :303; includeIf initial :37 (absent)
    await openForm(page, createSectionEncounter, NCD_FOLLOWUP_ENCOUNTER_TYPE_UUID);
    await expect(page.getByText('Liver followup indicators')).toBeVisible();
    await expect(page.locator('#liver-control')).toBeVisible();
    await expect(page.locator('#hepB-q')).toBeVisible();
    await expect(page.getByLabel('Chronic Hepatitis C', { exact: true })).toHaveCount(0);
  });

  test('the missed-dose count shows only when missed doses is Yes', async ({ page, createSectionEncounter }) => {
    // when :189 (the only one of the five treatment questions whose target exists, see V1)
    await openForm(page, createSectionEncounter, NCD_FOLLOWUP_ENCOUNTER_TYPE_UUID);
    const count = page.locator('#liver-fui-miss-details');
    await expect(count).toBeHidden();
    await pick(page, /^\s*Missed doses in past week/, 'yes').check();
    await expect(count).toBeVisible();
    await pick(page, /^\s*Missed doses in past week/, 'no').check();
    await expect(count).toBeHidden();
  });

  test('"Send for admission" shows only when the liver disease is uncontrolled', async ({
    page,
    createSectionEncounter,
  }) => {
    // when :242
    await openForm(page, createSectionEncounter, NCD_FOLLOWUP_ENCOUNTER_TYPE_UUID);
    const admission = page.locator('#liver-fui-uncontrolled');
    await expect(admission).toBeHidden();
    await page.locator('#liver-control').getByLabel('uncontrolled', { exact: true }).check();
    await expect(admission).toBeVisible();
    await page.locator('#liver-control').getByLabel('controlled', { exact: true }).check();
    await expect(admission).toBeHidden();
    await page.locator('#liver-control').getByLabel('complications', { exact: true }).check();
    await expect(admission).toBeHidden();
  });

  test('the Hepatitis B drug block shows only when On treatment is Yes', async ({ page, createSectionEncounter }) => {
    // when :311
    await openForm(page, createSectionEncounter, NCD_FOLLOWUP_ENCOUNTER_TYPE_UUID);
    const details = page.locator('#hepB-details');
    await expect(details).toBeHidden();
    await page.locator('#hepB-q').getByLabel('yes', { exact: true }).check();
    await expect(details).toBeVisible();
    await page.locator('#hepB-q').getByLabel('not applicable', { exact: true }).check();
    await expect(details).toBeHidden();
  });

  test('saving with the required questions blank does not save', async ({ page, createSectionEncounter }) => {
    // required="true": missed doses :189 (req), #liver-control :230, #new-hepb-tto :267, #hepB-q :306
    await openForm(page, createSectionEncounter, NCD_FOLLOWUP_ENCOUNTER_TYPE_UUID);
    await new SectionFormPage(page, FORM).save();
    await expect(page).not.toHaveURL(/referenceapplication\/home\.page/);
    await expect(page.locator('span.field-error', { hasText: 'Required' })).toHaveCount(4);
  });

  test('saves the followup indicators and both Hepatitis B questions, and restores them in EDIT', async ({
    page,
    createSectionEncounter,
    api,
  }) => {
    const section = await openForm(page, createSectionEncounter, NCD_FOLLOWUP_ENCOUNTER_TYPE_UUID);
    await pick(page, /^\s*Missed doses in past week/, 'yes').check();
    await page.locator('#liver-fui-miss-details input[type=text]').fill('3');
    await pick(page, /^\s*Patient condition improved/, 'yes').check();
    await page.locator('#liver-control').getByLabel('uncontrolled', { exact: true }).check();
    await pick(page, /^\s*Send for admission/, 'yes').check();
    await page.locator('#new-hepb-tto').getByLabel('no', { exact: true }).check();
    await page.locator('#hepB-q').getByLabel('yes', { exact: true }).check();
    await page.getByLabel('Tenofovir', { exact: true }).check();
    await save(page);

    const d = await displays(api, section.encounter.uuid);
    expect(d).toContain('number of missed medication doses in past 7 days: 3');
    expect(d).toContain('ncd clinical status: not controlled');
    expect(d).toContain('patient referred to hospital: yes'); // Send for admission

    await SectionFormPage.openEdit(page, FORM, section);
    await expect(page.locator('#liver-fui-miss-details')).toBeVisible();
    await expect(page.locator('#liver-fui-uncontrolled')).toBeVisible();
    await expect(page.locator('#hepB-details')).toBeVisible();
    await expect(page.locator('#new-hepb-reason')).toBeHidden();
    // the same concept (PIH:14889) is answered No for the indication and Yes for treatment, in two obsgroups
    await expect(page.locator('#new-hepb-tto').getByLabel('no', { exact: true })).toBeChecked();
    await expect(page.locator('#hepB-q').getByLabel('yes', { exact: true })).toBeChecked();
    await expect(page.getByLabel('Tenofovir', { exact: true })).toBeChecked();
    // VIEW: the same concept (PIH:14889) answered No for the indication and Yes for the treatment stays on the right question,
    // the missed-dose count is shown, and the Hepatitis B drug is shown by name
    const view = await expectViewShowsSavedObs(page, api, FORM, section.encounter.uuid, {
      'NCD clinical status: Not controlled': '[X] uncontrolled',
    });
    await expect(view.page.locator('#new-hepb-tto .value')).toHaveText('[X] no');
    await expect(view.page.locator('#hepB-q .value')).toHaveText('[X] yes');
    await expect(view.page.locator('#liver-fui-miss-details .value')).toHaveText('3');
    await expect(view.page.locator('#liver-control .value')).toHaveText('[X] uncontrolled');
    await expect(view.page.locator('#liver-fui-uncontrolled .value')).toHaveText('[X] yes');
    await expect(view.page.locator('#hepB-details .value')).toHaveText('[X] Tenofovir');
    await expect(view.page.getByText('Chronic Hepatitis C')).toHaveCount(0); // initial-only diagnoses
  });
});
