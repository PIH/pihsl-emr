import { test, expect, type SectionEncounter } from '../../core';
import { NCD_FOLLOWUP_ENCOUNTER_TYPE_UUID, NCD_INITIAL_ENCOUNTER_TYPE_UUID } from '../../core/constants';
import { getEncounterObs } from '../../commands';
import { SectionFormPage, expectViewShowsSavedObs } from '../../pages';
import type { Page } from '@playwright/test';

// section-kidney.xml: chronic kidney disease / nephrotic syndrome section of the NCD initial (causes, biopsy,
// stage) and followup (awareness, treatment, control) encounters. The specs open the form URL directly on an NCD
// initial or NCD followup encounter, so the visit-page rule that lists the section (_availability.e2e.md) is not
// exercised.
//
// Conditions in the form, from documentation inventory (section-kidney.inv.md):
//   ifMode VIEW include=false :21,:298  script and buttons: ENTER/EDIT only
//   includeIf initial types   :37   "secondary to" causes, biopsy performed, nephrotic syndrome causes
//   when biopsy = Yes         :71   show #biopsy-details (biopsy results text)
//   includeIf followup types  :129  followup heading (no obs);  :177  "Awareness and treatment", "Disease control"
//                                   and relapse/dialysis rows inside obsgroup PIH:14717 (missed doses and CKD control required)
//   when yes (x4 rows)        :167,:194,:231,:276  #ckd-fui-{tog}-details: only #ckd-fui-missed-details exists (V1)
//   when control = Uncontrolled :249  show #ckd-fui-uncontrolled ("Send for admission")
// Always rendered (both encounter types): CKD stage radio, clinical indicators (oedema, anaemia, hyperlipidaemia),
//   "Hypertension controlled" (:155-174), comments.
// Scripts: only setUpNextAndSubmitButtons() (see _shared); no validation, message, formula or default.
// Side effects on save: postSubmissionAction CleanDiagnosisConstructAction (:19); the form writes no diagnosis obs.
// EDIT is covered by the initial save round-trip (saved biopsy answer), VIEW by the two save tests (exactly the saved answers).
// Not covered here: the Next / other-section buttons (navigation, _shared); the "Other" comment fields.
//
// Findings:
//   V1 Low  :167,:194,:231,:276 11 of 12 thenDisplay targets (#ckd-fui-control-details, -understands-, -titrate-, -adher-,
//                     -aware-, -creatinine-, -pu-, -improved-, -glomer-, -dialysis-, -onDial-details) do not exist; those
//                     <when> rows do nothing. Fix: remove them or add the detail blocks.
//   V2 Low  :33,:107 the section title and "CKD Stage" heading are hard-coded English (the headerCode is a sentence, not
//                     a message code), so they are not translatable.
//   V3 Info :110-124 the legend describes Stage 3B (GFR 30-44) but the radio offers Stages 1-5 only.

const FORM = 'section-kidney.xml';

const radio = (page: Page, wrapperId: string, label: string) =>
  page.locator(`#${wrapperId}`).getByLabel(label, { exact: true });

test.describe('section-kidney: NCD initial', () => {
  let section: SectionEncounter;

  test.beforeEach(async ({ createSectionEncounter }) => {
    section = await createSectionEncounter({
      encounterTypeUuid: NCD_INITIAL_ENCOUNTER_TYPE_UUID,
      patient: { givenName: 'AutoCkd', familyName: 'Tester', gender: 'F' },
    });
  });

  test('renders the causes and biopsy questions and no followup block', async ({ page }) => {
    // includeIf :37 (initial) vs :129, :177 (followup)
    await SectionFormPage.openEdit(page, FORM, section);
    await expect(page.getByText('Chronic renal failure secondary to:')).toBeVisible();
    await expect(page.locator('#renal-biobsy')).toBeVisible();
    await expect(page.getByText('CKD and Nephrotic Syndrome followup indicators')).toHaveCount(0);
    await expect(page.getByText('Awareness and treatment')).toHaveCount(0);
    await expect(page.locator('#ckd-controlled')).toHaveCount(0);
  });

  test('the biopsy results show only when biopsy performed is Yes', async ({ page }) => {
    // when :71
    await SectionFormPage.openEdit(page, FORM, section);
    const details = page.locator('#biopsy-details');
    await expect(details).toBeHidden();
    await radio(page, 'renal-biobsy', 'yes').check();
    await expect(details).toBeVisible();
    await radio(page, 'renal-biobsy', 'no').check();
    await expect(details).toBeHidden();
  });

  test('nothing is required: an empty form saves', async ({ page }) => {
    const form = await SectionFormPage.openEdit(page, FORM, section);
    await form.save();
    await form.expectSaved();
  });

  test('saves causes, biopsy, stage, symptoms and comments; EDIT starts from the saved biopsy answer', async ({
    page,
    api,
  }) => {
    const form = await SectionFormPage.openEdit(page, FORM, section);
    await page.getByLabel('Diabetes', { exact: true }).check();
    await radio(page, 'renal-biobsy', 'yes').check();
    await page.locator('#biopsy-details input[type=text]').fill('Focal sclerosis');
    await page.getByLabel('Minimal change glomerulonephritis').check();
    await page.getByLabel('Stage 3', { exact: true }).check();
    await page.locator('p', { hasText: 'Oedema' }).getByLabel('yes', { exact: true }).check();
    await radio(page, 'ckd-fui-control', 'no').check();
    await page.locator('p', { hasText: 'Comments:' }).locator('input[type=text]').fill('Review in 3 months');
    await form.save();
    await form.expectSaved();

    const displays = (await getEncounterObs(api, section.encounter.uuid)).map((o) => o.display);
    expect(displays.some((d) => /diabetes/i.test(d))).toBeTruthy();
    expect(displays.some((d) => /Focal sclerosis/.test(d))).toBeTruthy();
    expect(displays.some((d) => /minimal change/i.test(d))).toBeTruthy();
    expect(displays.some((d) => /stage iii/i.test(d))).toBeTruthy();
    expect(displays.some((d) => /oedema/i.test(d))).toBeTruthy();
    expect(displays.some((d) => /Review in 3 months/.test(d))).toBeTruthy();

    // when :71 in EDIT mode: the saved Yes shows the biopsy results
    await SectionFormPage.openEdit(page, FORM, section);
    await expect(radio(page, 'renal-biobsy', 'yes')).toBeChecked();
    await expect(page.locator('#biopsy-details')).toBeVisible();
    await expect(page.locator('#biopsy-details input[type=text]')).toHaveValue('Focal sclerosis');

    // VIEW: exactly the saved answers, with the form's own labels for the stage and the nephrotic-syndrome cause; the biopsy
    // results are shown; nothing for the cause / symptom / stage options that were not ticked
    const view = await expectViewShowsSavedObs(page, api, FORM, section.encounter.uuid, {
      'Chronic kidney disease stage: Chronic Kidney Disease, Stage III (Moderate)': '[X] Stage 3',
      'Nephrotic syndrome related disease: Nephrotic syndrome with lesion of minimal change glomerulonephritis':
        '[X] Minimal change glomerulonephritis',
      'Symptom present: Oedema': '[X] yes',
      'CKD symptoms construct: Oedema': '[X] yes',
    });
    expect(await view.valueTexts()).toEqual([
      '[X] Diabetes',
      '[X] yes', // biopsy performed
      'Focal sclerosis',
      '[X] Minimal change glomerulonephritis',
      '[X] Stage 3',
      '[X] yes', // oedema
      '[X] no', // hypertension controlled
      'Review in 3 months',
    ]);
    await expect(view.page.locator('#renal-biobsy .value')).toHaveText('[X] yes');
  });
});

test.describe('section-kidney: NCD followup', () => {
  let section: SectionEncounter;

  test.beforeEach(async ({ page, createSectionEncounter }) => {
    section = await createSectionEncounter({
      encounterTypeUuid: NCD_FOLLOWUP_ENCOUNTER_TYPE_UUID,
      patient: { givenName: 'AutoCkd', familyName: 'Tester', gender: 'F' },
    });
    await SectionFormPage.openEdit(page, FORM, section);
  });

  test('renders the followup indicators and no causes / biopsy questions', async ({ page }) => {
    // includeIf :129, :177 (followup) vs :37 (initial)
    await expect(page.getByText('CKD and Nephrotic Syndrome followup indicators')).toBeVisible();
    await expect(page.getByText('Awareness and treatment')).toBeVisible();
    await expect(page.getByText('Chronic renal failure secondary to:')).toHaveCount(0);
    await expect(page.locator('#renal-biobsy')).toHaveCount(0);
  });

  test('missed doses and CKD control are required: saving blank shows two Required errors', async ({ page }) => {
    // required="true" on ckd-fui-missed (:202) and ckd-controlled (:247)
    const form = new SectionFormPage(page, FORM);
    await form.save();
    await expect(page).not.toHaveURL(/referenceapplication\/home\.page/);
    await expect(page.locator('span.field-error', { hasText: 'Required' })).toHaveCount(2);
  });

  test('"# of missed doses" shows only when missed doses is Yes', async ({ page }) => {
    // when :194 (tog=missed)
    const details = page.locator('#ckd-fui-missed-details');
    await expect(details).toBeHidden();
    await radio(page, 'ckd-fui-missed', 'yes').check();
    await expect(details).toBeVisible();
    await radio(page, 'ckd-fui-missed', 'no').check();
    await expect(details).toBeHidden();
  });

  test('"Send for admission" shows only when CKD control is Uncontrolled', async ({ page }) => {
    // when :249
    const admit = page.locator('#ckd-fui-uncontrolled');
    await expect(admit).toBeHidden();
    await radio(page, 'ckd-controlled', 'uncontrolled').check();
    await expect(admit).toBeVisible();
    await radio(page, 'ckd-controlled', 'complications').check();
    await expect(admit).toBeHidden();
    await radio(page, 'ckd-controlled', 'uncontrolled').check();
    await expect(admit).toBeVisible();
    await radio(page, 'ckd-controlled', 'controlled').check();
    await expect(admit).toBeHidden();
  });

  test('saves the indicators and control status', async ({ page, api }) => {
    await radio(page, 'ckd-fui-missed', 'no').check();
    await radio(page, 'ckd-fui-adher', 'yes').check();
    await radio(page, 'ckd-fui-creatinine', 'yes').check();
    await radio(page, 'ckd-fui-pu', 'no').check();
    await radio(page, 'ckd-fui-dialysis', 'unknown').check();
    await radio(page, 'ckd-controlled', 'uncontrolled').check();
    await page.locator('#ckd-fui-uncontrolled').getByLabel('yes', { exact: true }).check();

    const form = new SectionFormPage(page, FORM);
    await form.save();
    await form.expectSaved();

    const displays = (await getEncounterObs(api, section.encounter.uuid)).map((o) => o.display);
    expect(displays).toContain('NCD clinical status: Not controlled');
    expect(displays).toContain('Missed medication doses in past seven days: No');
    expect(displays).toContain('Stable creatinine level: Yes');
    expect(displays).toContain('Proteinuria: No');
    expect(displays).toContain('Dialysis referral: Unknown');
    expect(displays).toContain('Patient referred to hospital: Yes'); // "Send for admission" (CIEL:1788)

    // VIEW: each indicator shows its own answer. Missed doses was "no", so its count is not shown, and the initial-only questions are absent.
    const view = await expectViewShowsSavedObs(page, api, FORM, section.encounter.uuid, {
      'NCD clinical status: Not controlled': '[X] uncontrolled',
    });
    const v = view.page;
    await expect(v.locator('#ckd-fui-missed .value')).toHaveText('[X] no');
    await expect(v.locator('#ckd-fui-adher .value')).toHaveText('[X] yes');
    await expect(v.locator('#ckd-fui-creatinine .value')).toHaveText('[X] yes');
    await expect(v.locator('#ckd-fui-pu .value')).toHaveText('[X] no');
    await expect(v.locator('#ckd-fui-dialysis .value')).toHaveText('[X] unknown');
    await expect(v.locator('#ckd-controlled .value')).toHaveText('[X] uncontrolled');
    await expect(v.locator('#ckd-fui-uncontrolled .value')).toHaveText('[X] yes');
    await expect(v.locator('#ckd-fui-missed-details .value')).toHaveCount(0);
    await expect(v.locator('#renal-biobsy')).toHaveCount(0);
  });
});
