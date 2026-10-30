// section-sickle-cell.xml: Sickle cell section of the NCD initial (diagnosis, test) and followup (indicators) encounters.
// The specs open the form URL directly under an NCD initial or NCD followup encounter, so the visit-page rule that
// lists this section under both parents is not exercised (documentation/_availability.e2e.md).
//
// Conditions in the form, from documentation inventory (section-sickle-cell.inv.md):
//   ifMode VIEW include=false      :21, :385  script and #buttons in ENTER/EDIT only (not covered)
//   includeIf initial / initial-2  :35        diagnosis radios, other-hemoglobinopathy text, confirmation test (required)
//   includeIf followup / -2        :69, :115  followup heading; complications, transfusion, treatment, control block
//   when Asymptomatic = No         :85        show #sc-not-asymptom (nine symptoms); both types
//   when complications = Yes       :127       show #scd-comp-text
//   when transfusion = Yes         :171       show #transfusion-details
//   when On treatment = Yes        :197       show #sickle-treatment
//   when {question} = Yes          :227, 265  show #scd-fui-{tog}-details / #{tog}-details; only #scd-fui-miss-details exists (V1)
//   when control = uncontrolled    :281       show #sc-fui-uncontrolled
//   when hydroxyurea indicated=Yes :310       show #scd-hydroxy-details (both types), containing
//   when on hydroxyurea = No       :324         show #reason-no-hydroxy
//   when complications = Yes       :357         show #side-effect-hydroxy-compl-details
// Required: #scd-test-method :62 (initial); #transfusion-status :169, #on-sickle-treatment :195, missed doses :225,
//   #sickle-control :279 (followup); #scd-hydroxy-q :308 (both).
// Script (:22-27): setUpNextAndSubmitButtons() only (Next / section buttons / Save); no validation or derived value.
// Side effects on save: <postSubmissionAction CleanDiagnosisConstructAction> (:19, pihcore, not read); observed to add
//   a "Diagnosis order: Secondary" obs to the saved diagnosis (asserted below). No program enrollment.
// EDIT is covered by the two save tests (restored when-targets and ticks), VIEW by the same tests (exactly the saved answers).
// Not covered here: Next / section-jump buttons, the "reason not on hydroxyurea" and "Other" comment boxes.
//
// Findings:
//   V1 Low  :227, 265  <when> targets #scd-fui-malaria-details, -under-, -tite-, -adher-, -aware-, -family- and
//                      #scd-fui-improved-details do not exist: answering Yes shows nothing. Fix: drop the seven <when>s.
//   V2 Low  :223       obs ids "malaria", "under", "tite", "adher", "miss", "aware", "family" are unprefixed and
//                      page-global (the improved row at :261 is prefixed scd-fui-); risk of clashes and of ambiguous
//                      locators. Fix: id="scd-fui-{tog}".
//   V3 Info :116, 304  two obsgroups share PIH:14872 (complications; hydroxyurea); the followup round trip below
//                      shows both reload into the right widgets, so no defect.

import { type Locator, type Page } from '@playwright/test';
import { test, expect, type SectionEncounter } from '../../core';
import { NCD_FOLLOWUP_ENCOUNTER_TYPE_UUID, NCD_INITIAL_ENCOUNTER_TYPE_UUID } from '../../core/constants';
import { getEncounterObs } from '../../commands';
import { SectionFormPage, expectViewShowsSavedObs, VISIT_PAGE_URL } from '../../pages';

const FORM = 'section-sickle-cell.xml';

type Create = (opts: { encounterTypeUuid: string; patient?: { givenName?: string; familyName?: string } }) => Promise<SectionEncounter>;

// Local helpers. Rows are found by their label text because widget ids (wNN) shift between encounter types.
const openForm = async (page: Page, create: Create, encounterTypeUuid: string) => {
  const section = await create({ encounterTypeUuid, patient: { givenName: 'AutoScd', familyName: 'Tester' } });
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
const within = (page: Page, id: string, option: string) => page.locator(`#${id}`).getByLabel(option, { exact: true });

test.describe('section-sickle-cell, NCD initial encounter', () => {
  test('shows the diagnosis and confirmation test and none of the followup questions', async ({
    page,
    createSectionEncounter,
  }) => {
    // includeIf initial :35; includeIf followup :69, :115 (server-side: absent, not hidden)
    await openForm(page, createSectionEncounter, NCD_INITIAL_ENCOUNTER_TYPE_UUID);
    await expect(page.getByLabel('Sickle-cell trait (AS)', { exact: true })).toBeVisible();
    await expect(page.locator('#scd-test-method')).toBeVisible();
    for (const id of ['scd-comp-q', 'transfusion-status', 'on-sickle-treatment', 'sickle-control']) {
      await expect(page.locator(`#${id}`), id).toHaveCount(0);
    }
  });

  test('the symptom list shows only when Asymptomatic is No', async ({ page, createSectionEncounter }) => {
    // when :85
    await openForm(page, createSectionEncounter, NCD_INITIAL_ENCOUNTER_TYPE_UUID);
    const symptoms = page.locator('#sc-not-asymptom');
    await expect(symptoms).toBeHidden();
    await within(page, 'sickle-asymptom', 'no').check();
    await expect(symptoms).toBeVisible();
    await within(page, 'sickle-asymptom', 'yes').check();
    await expect(symptoms).toBeHidden();
  });

  test('the hydroxyurea questions open in three nested steps', async ({ page, createSectionEncounter }) => {
    // when :310 (indicated) -> :324 (on hydroxyurea = No -> reasons) and :357 (complications = Yes)
    await openForm(page, createSectionEncounter, NCD_INITIAL_ENCOUNTER_TYPE_UUID);
    const details = page.locator('#scd-hydroxy-details');
    const reasons = page.locator('#reason-no-hydroxy');
    const complications = page.locator('#side-effect-hydroxy-compl-details');
    await expect(details).toBeHidden();
    await within(page, 'scd-hydroxy-q', 'yes').check();
    await expect(details).toBeVisible();
    await expect(reasons).toBeHidden();
    await expect(complications).toBeHidden();
    await within(page, 'hydroxy-treatment', 'no').check();
    await expect(reasons).toBeVisible();
    await within(page, 'hydroxy-treatment', 'yes').check();
    await expect(reasons).toBeHidden();
    await within(page, 'side-effect-hydroxy', 'yes').check();
    await expect(complications).toBeVisible();
    await within(page, 'side-effect-hydroxy', 'no').check();
    await expect(complications).toBeHidden();
    await within(page, 'scd-hydroxy-q', 'no').check();
    await expect(details).toBeHidden();
  });

  test('saving without the confirmation test and hydroxyurea indication does not save', async ({
    page,
    createSectionEncounter,
  }) => {
    // required="true" on #scd-test-method :62 and #scd-hydroxy-q :308
    await openForm(page, createSectionEncounter, NCD_INITIAL_ENCOUNTER_TYPE_UUID);
    await new SectionFormPage(page, FORM).save();
    await expect(page).not.toHaveURL(VISIT_PAGE_URL);
    await expect(page.locator('span.field-error', { hasText: 'Required' })).toHaveCount(2);
  });

  test('saves the diagnosis, test method, symptoms and hydroxyurea answers, and restores them in EDIT', async ({
    page,
    createSectionEncounter,
    api,
  }) => {
    const section = await openForm(page, createSectionEncounter, NCD_INITIAL_ENCOUNTER_TYPE_UUID);
    await page.getByLabel('Sickle-cell disease', { exact: true }).check();
    await page.getByLabel('HPLC', { exact: true }).check();
    await within(page, 'sickle-asymptom', 'no').check();
    await pick(page, /^\s*Pain/, 'yes').check();
    await within(page, 'scd-hydroxy-q', 'yes').check();
    await within(page, 'hydroxy-treatment', 'yes').check();
    await within(page, 'side-effect-hydroxy', 'yes').check();
    await page.getByLabel('Pancytopenia', { exact: true }).check();
    await page.locator('#side-effect-hydroxy-compl-details input[type=text]').fill('Dry skin');
    await save(page);

    const d = await displays(api, section.encounter.uuid);
    expect(d).toContain('diagnosis: sickle cell disease');
    expect(d).toContain('diagnosis order: secondary'); // CleanDiagnosisConstructAction, observed
    expect(d).toContain('method of sickle cell confirmation: hemoglobin electrophoresis by hplc');
    expect(d).toContain('symptom absent: asymptomatic sickle cell');
    expect(d).toContain('symptom present: pain');
    expect(d).toContain('hydroxyurea indicated: yes');
    expect(d).toContain('treatment with hydroxyurea: yes');
    expect(d).toContain('complication related to hydroxyurea (coded): pancytopenia');
    expect(d).toContain('medication side effect: dry skin'); // free text on CIEL:164377 saves

    await SectionFormPage.openEdit(page, FORM, section);
    await expect(page.locator('#sc-not-asymptom')).toBeVisible();
    await expect(page.locator('#scd-hydroxy-details')).toBeVisible();
    await expect(page.locator('#side-effect-hydroxy-compl-details')).toBeVisible();
    await expect(page.getByLabel('Sickle-cell disease', { exact: true })).toBeChecked();
    await expect(page.getByLabel('Pancytopenia', { exact: true })).toBeChecked();

    // VIEW: exactly the saved answers, each on its own question; the hydroxyurea side effect and its free text are shown.
    // The form labels the diagnosis, the test and the symptoms differently from the concepts ("Diagnosis order: Secondary" is written
    // by CleanDiagnosisConstructAction, not by a field of the form).
    const view = await expectViewShowsSavedObs(page, api, FORM, section.encounter.uuid, {
      'Diagnosis: Sickle cell disease': '[X] Sickle-cell disease',
      'Method of sickle cell confirmation: Hemoglobin electrophoresis by HPLC': '[X] HPLC',
      'Symptom absent: Asymptomatic sickle cell': '[X] no',
      'Symptom present: Pain': '[X] yes',
      'Diagnosis order: Secondary': '',
    });
    expect(await view.valueTexts()).toEqual([
      '[X] Sickle-cell disease',
      '[X] HPLC',
      '[X] no', // asymptomatic
      '[X] yes', // pain
      '[X] yes', // hydroxyurea indicated
      '[X] yes', // on hydroxyurea
      '[X] yes', // side effect
      '[X] Pancytopenia',
      'Dry skin',
    ]);
    await expect(view.page.locator('#sickle-asymptom .value')).toHaveText('[X] no');
    await expect(view.page.locator('#side-effect-hydroxy-compl-details .value')).toHaveText(['[X] Pancytopenia', 'Dry skin']);
    await expect(view.page.locator('#scd-comp-q')).toHaveCount(0); // followup-only
  });
});

test.describe('section-sickle-cell, NCD followup encounter', () => {
  test('shows the followup questions and not the diagnosis block', async ({ page, createSectionEncounter }) => {
    // includeIf followup :69, :115; includeIf initial :35 (absent)
    await openForm(page, createSectionEncounter, NCD_FOLLOWUP_ENCOUNTER_TYPE_UUID);
    for (const id of ['scd-comp-q', 'transfusion-status', 'on-sickle-treatment', 'sickle-control']) {
      await expect(page.locator(`#${id}`), id).toBeVisible();
    }
    await expect(page.locator('#scd-test-method')).toHaveCount(0);
    await expect(page.getByLabel('Sickle-cell trait (AS)', { exact: true })).toHaveCount(0);
  });

  // Table of the followup when-conditions: [name, trigger, other answer, target]
  const cases: Array<[string, (p: Page) => Locator, (p: Page) => Locator, string]> = [
    ['complications since last visit :127', (p) => within(p, 'scd-comp-q', 'yes'), (p) => within(p, 'scd-comp-q', 'no'), '#scd-comp-text'],
    ['transfusion in 12 months :171', (p) => within(p, 'transfusion-status', 'yes'), (p) => within(p, 'transfusion-status', 'no'), '#transfusion-details'],
    ['on treatment :197', (p) => within(p, 'on-sickle-treatment', 'Yes'), (p) => within(p, 'on-sickle-treatment', 'No'), '#sickle-treatment'],
    ['missed doses :227', (p) => pick(p, /^\s*Missed doses in past week/, 'yes'), (p) => pick(p, /^\s*Missed doses in past week/, 'no'), '#scd-fui-miss-details'],
    ['disease uncontrolled :281', (p) => within(p, 'sickle-control', 'uncontrolled'), (p) => within(p, 'sickle-control', 'controlled'), '#sc-fui-uncontrolled'],
  ];
  test('each followup answer shows and hides its detail block', async ({ page, createSectionEncounter }) => {
    await openForm(page, createSectionEncounter, NCD_FOLLOWUP_ENCOUNTER_TYPE_UUID);
    for (const [name, trigger, other, target] of cases) {
      await expect(page.locator(target), `${name}: hidden at first`).toBeHidden();
      await trigger(page).check();
      await expect(page.locator(target), `${name}: shown`).toBeVisible();
      await other(page).check();
      await expect(page.locator(target), `${name}: hidden again`).toBeHidden();
    }
  });

  test('saving with the required followup questions blank does not save', async ({ page, createSectionEncounter }) => {
    // required="true": #transfusion-status :169, #on-sickle-treatment :195, missed doses :225 (req), #sickle-control
    // :279, #scd-hydroxy-q :308
    await openForm(page, createSectionEncounter, NCD_FOLLOWUP_ENCOUNTER_TYPE_UUID);
    await new SectionFormPage(page, FORM).save();
    await expect(page).not.toHaveURL(VISIT_PAGE_URL);
    await expect(page.locator('span.field-error', { hasText: 'Required' })).toHaveCount(5);
  });

  test('saves complications and hydroxyurea in the two PIH:14872 groups, and restores them in EDIT', async ({
    page,
    createSectionEncounter,
    api,
  }) => {
    const section = await openForm(page, createSectionEncounter, NCD_FOLLOWUP_ENCOUNTER_TYPE_UUID);
    await within(page, 'scd-comp-q', 'yes').check();
    await page.locator('#scd-comp-text').getByLabel('Anaemia', { exact: true }).check();
    await within(page, 'transfusion-status', 'no').check();
    await within(page, 'on-sickle-treatment', 'Yes').check();
    await page.locator('#sickle-treatment').getByLabel('Folic acid', { exact: true }).check();
    await pick(page, /^\s*Missed doses in past week/, 'no').check();
    await within(page, 'sickle-control', 'controlled').check();
    await within(page, 'scd-hydroxy-q', 'yes').check();
    await within(page, 'hydroxy-treatment', 'yes').check();
    await save(page);

    const d = await displays(api, section.encounter.uuid);
    expect(d).toContain('complications developed since last visit: yes');
    expect(d).toContain('complications related to sickle cell disease: anemia');
    expect(d).toContain('transfusion status: no');
    expect(d).toContain('treatment for sickle cell (coded): folic acid');
    expect(d).toContain('missed medication doses in past seven days: no');
    expect(d).toContain('ncd clinical status: controlled');
    expect(d).toContain('hydroxyurea indicated: yes');
    expect(d).toContain('treatment with hydroxyurea: yes');

    await SectionFormPage.openEdit(page, FORM, section);
    await expect(page.locator('#scd-comp-text')).toBeVisible();
    await expect(page.locator('#scd-hydroxy-details')).toBeVisible();
    await expect(page.locator('#sickle-treatment')).toBeVisible();
    await expect(within(page, 'scd-comp-q', 'yes')).toBeChecked();
    await expect(within(page, 'scd-hydroxy-q', 'yes')).toBeChecked();
    await expect(within(page, 'hydroxy-treatment', 'yes')).toBeChecked();
    await expect(page.locator('#scd-comp-text').getByLabel('Anaemia', { exact: true })).toBeChecked();

    // VIEW: the two obsgroups that share PIH:14872 (complications and hydroxyurea) each show their own answers, and the
    // questions that were not answered (transfusion details, missed-dose count) show no value
    const view = await expectViewShowsSavedObs(page, api, FORM, section.encounter.uuid, {
      'Complications related to sickle cell disease: Anemia': '[X] Anaemia',
    });
    const v = view.page;
    await expect(v.locator('#scd-comp-q .value')).toHaveText('[X] yes');
    await expect(v.locator('#scd-comp-text .value')).toHaveText('[X] Anaemia');
    await expect(v.locator('#transfusion-status .value')).toHaveText('[X] no');
    await expect(v.locator('#on-sickle-treatment .value')).toHaveText('[X] Yes');
    await expect(v.locator('#sickle-treatment .value')).toHaveText('[X] Folic acid');
    await expect(row(v, /^\s*Missed doses in past week/).locator('.value')).toHaveText('[X] no');
    await expect(v.locator('#sickle-control .value')).toHaveText('[X] controlled');
    await expect(v.locator('#scd-hydroxy-q .value')).toHaveText('[X] yes');
    await expect(v.locator('#hydroxy-treatment .value')).toHaveText('[X] yes');
    await expect(v.locator('#transfusion-details .value')).toHaveCount(0);
    await expect(v.locator('#side-effect-hydroxy-compl-details .value')).toHaveCount(0);
    expect(await view.valueTexts()).toHaveLength(9);
  });
});
