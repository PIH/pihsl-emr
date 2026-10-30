import { test, expect, type SectionEncounter } from '../../core';
import { NCD_FOLLOWUP_ENCOUNTER_TYPE_UUID, NCD_INITIAL_ENCOUNTER_TYPE_UUID } from '../../core/constants';
import { getEncounterObs } from '../../commands';
import { SectionFormPage, ViewFormPage, expectViewShowsSavedObs } from '../../pages';
import type { Page } from '@playwright/test';

// section-heart-failure.xml: heart failure section of the NCD initial (main diagnosis and sub-diagnoses) and
// followup (symptoms, adherence, control, referral, surgery) encounters. The specs open the form URL directly on
// an NCD initial or NCD followup encounter, so the visit-page rule that lists the section (_availability.e2e.md)
// is not exercised.
//
// Conditions in the form, from documentation inventory (section-heart-failure.inv.md):
//   ifMode VIEW include=false :21,:555  script and buttons: ENTER/EDIT only
//   includeIf initial types   :35   "Main diagnosis" checkboxes + one sub-diagnosis block per main diagnosis; the
//                                   "at least one" script (below) is inside it
//   toggle {tag} on 12 main-diagnosis checkboxes :53  show #cardiomyopathy, #rheumaticHeart, #degenHeart, #rtHeartFail,
//                                   #pericardDisease, #arrythmia, #thromboemb, #congenitalHeart, #unknownHeart;
//                                   "Hypertensive cardiopathy/heart disease" and #hfNoEcho have no target (V6)
//   includeIf followup types  :249  followup heading;  :306  awareness/treatment/control rows (9 obs) inside obsgroup
//                                   PIH:14724; missed doses :332, disease control :413 and NYHA :473 are required
//   when yes (x9 rows)        :323,:378,:396,:441  #hf-fui-{tog}-details: only #hf-fui-missed-details exists (V5)
//   when control = Uncontrolled :415  show #hf-uncontrolled-admit;  when cardiology referral Completed :488 show #cardio-ref-details
//   when "Cardiac surgery performed" ticked :523  show #cardiac-surgery-details
// Always rendered: symptoms (:255-294), fluid status, NYHA class (required), referral, surgery, comments.
// Scripts: setUpNextAndSubmitButtons() (see _shared); initial only: updateLastCheckboxRequired("#hf-main-dx",
//   "#hf-required-msg", "Required") from sl.js (see _shared V6): no main diagnosis ticked -> "Required" in
//   #hf-required-msg and save blocked (beforeSubmit returns false). No formula or default.
// Side effects on save: postSubmissionAction CleanDiagnosisConstructAction (:19) completes the "Visit Diagnoses" constructs.
// EDIT is covered by the followup save (saved surgery tick) and the V2 reopen test, VIEW by the two save tests and the V2 VIEW test.
// Not covered here: the Next / other-section buttons (navigation, _shared); date pickers (referral, surgery).
//
// Findings:
//   V1 High   :115-118 answerConceptIds PIH:20167 (concept "Other rheumatic heart disease") and PIH:20168 ("Unknown rheumatic
//                      heart disease") carry the labels "Unspecified ..." and "Other ..." in swapped order: choosing "Other
//                      rheumatic heart disease" saves "Unknown rheumatic heart disease" and vice versa.
//                      Fix: swap the two answerCodes. TESTED below (test.fixme).
//   V2 High   :101-102,:122-123 two obs of concept PIH:14754 ("if other cardiomyopathy / rheumatic, specify"): HFE binds a saved
//                      value to the first widget, which sits in #cardiomyopathy (hidden unless Cardiomyopathy is ticked and
//                      cleared when hidden), so the text entered under Rheumatic heart disease is not shown when the form is
//                      reopened and is dropped by the next save. Fix: use a different concept for the rheumatic text.
//                      TESTED below (test.fixme; reopen only, no second save), and in VIEW (the VIEW prints the rheumatic text in the
//                      Cardiomyopathy block and leaves the Rheumatic "specify" blank).
//   V3 Low    :232-239 #unknownHeart ("Unknown suspected, specify", concept "Congenital heart disease comment") is toggled by
//                      PIH:12231 "Other heart valve disease or congenital heart disease", not by PIH:20004 "Unknown heart failure
//                      without echocardiogram" (#hfNoEcho, no target): label and trigger do not match (unconfirmed intent).
//   V4 Low    :90-98,:116-118,:220-226 sub-diagnosis labels are hard-coded English answerCode text (untranslatable).
//   V5 Low    :323,:378,:396,:441 nine thenDisplay targets (#hf-fui-understand-details, -salt-, -adher-, -titrate-, -endocard-,
//                      -aware-, -improved-, -referSurg-, -echoImprov-details) do not exist; those <when> rows do nothing.
//   V6 Low    :53 toggle targets "Hypertensive cardiopathy", "Hypertensive heart disease" (with spaces) and "hfNoEcho" match no element.
//   see _shared V6 for the sl.js "Required" message focus/VIEW issue.

const FORM = 'section-heart-failure.xml';

const radio = (page: Page, wrapperId: string, label: string) =>
  page.locator(`#${wrapperId}`).getByLabel(label, { exact: true });

const displaysOf = async (api: Parameters<typeof getEncounterObs>[0], section: SectionEncounter) =>
  (await getEncounterObs(api, section.encounter.uuid)).map((o) => o.display);

test.describe('section-heart-failure: NCD initial', () => {
  let section: SectionEncounter;

  test.beforeEach(async ({ createSectionEncounter }) => {
    section = await createSectionEncounter({
      encounterTypeUuid: NCD_INITIAL_ENCOUNTER_TYPE_UUID,
      patient: { givenName: 'AutoHf', familyName: 'Tester', gender: 'F' },
    });
  });

  test('renders the main diagnosis and no followup rows', async ({ page }) => {
    // includeIf :35 (initial) vs :249, :306 (followup)
    await SectionFormPage.openEdit(page, FORM, section);
    await expect(page.locator('#hf-main-dx')).toBeVisible();
    await expect(page.getByText('Heart failure followup indicators')).toHaveCount(0);
    await expect(page.getByText('Awareness and treatment indicators')).toHaveCount(0);
    await expect(page.locator('#hf-controlled')).toHaveCount(0);
    // not under an includeIf: symptoms and NYHA class are rendered for initial encounters too
    await expect(page.getByLabel('Euvolemic')).toBeVisible();
    await expect(page.getByLabel('I (No limitations)')).toBeVisible();
  });

  // [main diagnosis label, id of the block it reveals]; toggle on :53
  const blocks: Array<[RegExp, string]> = [
    [/^Cardiomyopathy$/, '#cardiomyopathy'],
    [/^Rheumatic heart disease$/, '#rheumaticHeart'],
    [/^Degenerative heart disease$/, '#degenHeart'],
    [/^Right heart failure$/, '#rtHeartFail'],
    [/^Pericardial disease$/, '#pericardDisease'],
    [/^Arrhythmia$/, '#arrythmia'],
    [/^Thromboembolic disorder$/, '#thromboemb'],
    [/^Congenital heart disease$/, '#congenitalHeart'],
    [/^Other heart valve disease or congenital heart disease$/, '#unknownHeart'],
  ];

  test('each main diagnosis reveals its own sub-diagnosis block and hides it again when unticked', async ({ page }) => {
    // toggle :53
    await SectionFormPage.openEdit(page, FORM, section);
    for (const [, target] of blocks) {
      await expect(page.locator(target)).toBeHidden();
    }
    for (const [label, target] of blocks) {
      const box = page.locator('#hf-main-dx').getByLabel(label);
      await box.check();
      await expect(page.locator(target)).toBeVisible();
      await box.uncheck();
      await expect(page.locator(target)).toBeHidden();
    }
  });

  test('un-ticking a main diagnosis clears the sub-diagnosis ticked under it', async ({ page }) => {
    // toggle :53 hides the block and clears its inputs, so no stale sub-diagnosis is saved
    await SectionFormPage.openEdit(page, FORM, section);
    const main = page.locator('#hf-main-dx').getByLabel(/^Cardiomyopathy$/);
    await main.check();
    await page.locator('#cardiomyopathy').getByLabel('Ischemic cardiopathy').check();
    await main.uncheck();
    await main.check();
    await expect(page.locator('#cardiomyopathy').getByLabel('Ischemic cardiopathy')).not.toBeChecked();
  });

  test('saving with no main diagnosis shows "Required" and does not save; ticking one clears the message', async ({
    page,
  }) => {
    // updateLastCheckboxRequired (sl.js) on #hf-main-dx
    const form = await SectionFormPage.openEdit(page, FORM, section);
    const msg = page.locator('#hf-required-msg');
    await expect(msg).toHaveText('Required');
    await page.getByLabel('II (Comfortable with moderate exercise)').check();
    await form.save();
    await expect(page).not.toHaveURL(/referenceapplication\/home\.page/);
    await expect(msg).toBeVisible();

    const box = page.locator('#hf-main-dx').getByLabel(/^Cardiomyopathy$/);
    await box.check();
    await expect(msg).toBeHidden();
    await box.uncheck();
    await expect(msg).toBeVisible();
  });

  test('the NYHA class is required: a diagnosis without it does not save', async ({ page }) => {
    // required="true" on NYHA :473
    const form = await SectionFormPage.openEdit(page, FORM, section);
    await page.locator('#hf-main-dx').getByLabel(/^Cardiomyopathy$/).check();
    await form.save();
    await expect(page).not.toHaveURL(/referenceapplication\/home\.page/);
    await expect(page.locator('span.field-error', { hasText: 'Required' }).first()).toBeVisible();
    await expect(page.locator('#hf-required-msg')).toBeHidden();
  });

  test('saves diagnoses with their sub-diagnoses, symptoms and NYHA class', async ({ page, api }) => {
    const form = await SectionFormPage.openEdit(page, FORM, section);
    await page.locator('#hf-main-dx').getByLabel(/^Rheumatic heart disease$/).check();
    await page.locator('#rheumaticHeart').getByLabel('Pure mitral stenosis').check();
    await page.locator('#hf-main-dx').getByLabel(/^Congenital heart disease$/).check();
    await page.locator('#congenitalHeart').getByLabel('Atrial septal defect (ASD)').check();
    await page.locator('#congenitalHeart').getByLabel('Other congenital heart disease').check();
    await page.locator('#congenitalHeart input[type=text]').fill('congenital note');
    await page.locator('p').filter({ hasText: /^\s*Dyspnea/ }).getByLabel('yes', { exact: true }).check();
    await page.getByLabel('Euvolemic').check();
    await page.getByLabel('II (Comfortable with moderate exercise)').check();
    await form.save();
    await form.expectSaved();

    const displays = await displaysOf(api, section);
    expect(displays).toContain('Diagnosis: Rheumatic heart disease');
    expect(displays).toContain('Diagnosis: Rheumatic mitral stenosis');
    expect(displays).toContain('Diagnosis: Congenital heart disease');
    expect(displays).toContain('Diagnosis: Atrial septal defect');
    expect(displays).toContain('Other congenital heart disease: congenital note');
    expect(displays).toContain('NYHA Class: NYHA Class II');
    expect(displays.some((d) => /dyspnea/i.test(d))).toBeTruthy();
    expect(displays.some((d) => /euvolemi/i.test(d))).toBeTruthy();

    // VIEW: exactly the saved answers, each by the form's own label ("Diagnosis order: Secondary" is written by
    // CleanDiagnosisConstructAction, not by a field of the form); sub-diagnoses appear in their block, the other blocks are empty
    const view = await expectViewShowsSavedObs(page, api, FORM, section.encounter.uuid, {
      'Diagnosis: Rheumatic mitral stenosis': '[X] Pure mitral stenosis',
      'Diagnosis: Atrial septal defect': '[X] Atrial septal defect (ASD)',
      'Symptom present: Dyspnea': '[X] yes',
      'NYHA Class: NYHA Class II': '[X] II (Comfortable with moderate exercise)',
      'Diagnosis order: Secondary': '',
    });
    expect(await view.valueTexts()).toEqual([
      '[X] Rheumatic heart disease',
      '[X] Congenital heart disease',
      '[X] Pure mitral stenosis',
      '[X] Atrial septal defect (ASD)',
      '[X] Other congenital heart disease',
      'congenital note',
      '[X] yes', // dyspnea
      '[X] Euvolemic',
      '[X] II (Comfortable with moderate exercise)',
    ]);
    await expect(view.page.locator('#rheumaticHeart .value')).toHaveText(['[X] Pure mitral stenosis']);
    await expect(view.page.locator('#congenitalHeart .value')).toHaveText([
      '[X] Atrial septal defect (ASD)',
      '[X] Other congenital heart disease',
      'congenital note',
    ]);
    await expect(view.page.locator('#cardiomyopathy .value, #degenHeart .value, #arrythmia .value')).toHaveCount(0);
  });

  // V1 (High): the answerCodes of PIH:20167 / PIH:20168 are swapped, so the "Other rheumatic heart disease" radio
  // saves the concept "Unknown rheumatic heart disease". Intended: the saved diagnosis is the one that was chosen.
  // Remove test.fixme() when the labels are fixed.
  test('choosing "Other rheumatic heart disease" saves that diagnosis (V1)', async ({ page, api }) => {
    test.fixme();
    const form = await SectionFormPage.openEdit(page, FORM, section);
    await page.locator('#hf-main-dx').getByLabel(/^Rheumatic heart disease$/).check();
    await page.locator('#rheumaticHeart').getByLabel('Other rheumatic heart disease').check();
    await page.getByLabel('II (Comfortable with moderate exercise)').check();
    await form.save();
    await form.expectSaved();

    const displays = await displaysOf(api, section);
    expect(displays).toContain('Diagnosis: Other rheumatic heart disease');
  });

  // V2 (High): the free text under Rheumatic heart disease and the one under Cardiomyopathy are both concept
  // PIH:14754; a saved value is bound to the first widget (hidden), so the rheumatic field is empty on reopening.
  // Intended: the text comes back where it was entered. Remove test.fixme() when the concepts differ.
  test('the "other rheumatic heart disease" text is shown again when the form is reopened (V2)', async ({ page }) => {
    test.fixme();
    const form = await SectionFormPage.openEdit(page, FORM, section);
    await page.locator('#hf-main-dx').getByLabel(/^Rheumatic heart disease$/).check();
    await page.locator('#rheumaticHeart input[type=text]').fill('rheumatic other text');
    await page.getByLabel('II (Comfortable with moderate exercise)').check();
    await form.save();
    await form.expectSaved();

    await SectionFormPage.openEdit(page, FORM, section);
    await expect(page.locator('#rheumaticHeart')).toBeVisible();
    await expect(page.locator('#rheumaticHeart input[type=text]')).toHaveValue('rheumatic other text');
  });

  // V2 in VIEW: the rheumatic text is saved under the Cardiomyopathy concept, so the VIEW prints it in the Cardiomyopathy block
  // (observed: "Cardiomyopathy if other cardiomyopathy, specify: rheumatic other text", Cardiomyopathy not ticked) and leaves the
  // Rheumatic block's "specify" blank. Same root cause as V2. Intended: the text is shown under Rheumatic heart disease.
  test('VIEW shows the "other rheumatic heart disease" text under Rheumatic heart disease (V2)', async ({ page }) => {
    test.fixme();
    const form = await SectionFormPage.openEdit(page, FORM, section);
    await page.locator('#hf-main-dx').getByLabel(/^Rheumatic heart disease$/).check();
    await page.locator('#rheumaticHeart input[type=text]').fill('rheumatic other text');
    await page.getByLabel('II (Comfortable with moderate exercise)').check();
    await form.save();
    await form.expectSaved();

    const view = await ViewFormPage.open(page, FORM, section.encounter.uuid);
    await expect(view.page.locator('#rheumaticHeart .value')).toHaveText('rheumatic other text');
    await expect(view.page.locator('#cardiomyopathy .value')).toHaveCount(0);
  });
});

test.describe('section-heart-failure: NCD followup', () => {
  let section: SectionEncounter;

  test.beforeEach(async ({ page, createSectionEncounter }) => {
    section = await createSectionEncounter({
      encounterTypeUuid: NCD_FOLLOWUP_ENCOUNTER_TYPE_UUID,
      patient: { givenName: 'AutoHf', familyName: 'Tester', gender: 'F' },
    });
    await SectionFormPage.openEdit(page, FORM, section);
  });

  test('renders the followup rows and no main diagnosis', async ({ page }) => {
    // includeIf :249, :306 (followup) vs :35 (initial)
    await expect(page.getByText('Heart failure followup indicators')).toBeVisible();
    await expect(page.getByText('Awareness and treatment indicators')).toBeVisible();
    await expect(page.locator('#hf-main-dx')).toHaveCount(0);
    await expect(page.locator('#hf-required-msg')).toHaveCount(0);
  });

  test('NYHA class, missed doses and disease control are required: saving blank shows three Required errors', async ({
    page,
  }) => {
    // required="true" :473, :332, :413
    const form = new SectionFormPage(page, FORM);
    await form.save();
    await expect(page).not.toHaveURL(/referenceapplication\/home\.page/);
    await expect(page.locator('span.field-error', { hasText: 'Required' })).toHaveCount(3);
  });

  test('"# of missed doses" shows only when missed doses is Yes', async ({ page }) => {
    // when :323 (tog=missed)
    const details = page.locator('#hf-fui-missed-details');
    await expect(details).toBeHidden();
    await radio(page, 'hf-fui-missed', 'yes').check();
    await expect(details).toBeVisible();
    await radio(page, 'hf-fui-missed', 'no').check();
    await expect(details).toBeHidden();
  });

  test('"Send for admission" shows only when disease control is Uncontrolled', async ({ page }) => {
    // when :415
    const admit = page.locator('#hf-uncontrolled-admit');
    await expect(admit).toBeHidden();
    await radio(page, 'hf-controlled', 'uncontrolled').check();
    await expect(admit).toBeVisible();
    await radio(page, 'hf-controlled', 'controlled').check();
    await expect(admit).toBeHidden();
  });

  test('the cardiology referral date shows only when the referral is Completed', async ({ page }) => {
    // when :488
    const details = page.locator('#cardio-ref-details');
    await expect(details).toBeHidden();
    await radio(page, 'cardio-ref', 'yes').check();
    await expect(details).toBeVisible();
    await radio(page, 'cardio-ref', 'no').check();
    await expect(details).toBeHidden();
  });

  test('the surgery details show only when "Cardiac surgery performed" is ticked', async ({ page }) => {
    // when :523
    const details = page.locator('#cardiac-surgery-details');
    const performed = page.locator('#cardiac-surgery').getByLabel('Cardiac surgery performed');
    await expect(details).toBeHidden();
    await performed.check();
    await expect(details).toBeVisible();
    await performed.uncheck();
    await expect(details).toBeHidden();
  });

  test('saves the indicators and control status; EDIT starts from the saved surgery tick', async ({ page, api }) => {
    await page.getByLabel('III (Comfortable resting)').check();
    await radio(page, 'hf-fui-missed', 'no').check();
    await radio(page, 'hf-fui-adher', 'yes').check();
    await radio(page, 'hf-controlled', 'uncontrolled').check();
    await page.locator('#hf-uncontrolled-admit').getByLabel('yes', { exact: true }).check();
    await page.locator('p').filter({ hasText: /^\s*On beta-blockers/ }).getByLabel('yes', { exact: true }).check();
    await page.locator('#cardiac-surgery').getByLabel('Cardiac surgery performed').check();
    await page.locator('#cardiac-surgery-details').getByLabel('Valvuloplasty').check();

    const form = new SectionFormPage(page, FORM);
    await form.save();
    await form.expectSaved();

    const displays = await displaysOf(api, section);
    expect(displays).toContain('NYHA Class: NYHA Class III');
    expect(displays).toContain('NCD clinical status: Not controlled');
    expect(displays).toContain('Missed medication doses in past seven days: No');
    expect(displays).toContain('Overall treatment adherence: Yes');
    expect(displays.some((d) => /valvuloplasty/i.test(d))).toBeTruthy();

    // when :523 in EDIT mode: the saved tick shows the surgery details
    await SectionFormPage.openEdit(page, FORM, section);
    await expect(page.locator('#cardiac-surgery').getByLabel('Cardiac surgery performed')).toBeChecked();
    await expect(page.locator('#cardiac-surgery-details')).toBeVisible();
    await expect(page.locator('#cardiac-surgery-details').getByLabel('Valvuloplasty')).toBeChecked();
    await expect(page.locator('#hf-uncontrolled-admit')).toBeVisible();

    // VIEW: each answer is on its own row, "Send for admission" is shown, and the surgery tick and its procedure are shown
    const view = await expectViewShowsSavedObs(page, api, FORM, section.encounter.uuid, {
      'NCD clinical status: Not controlled': '[X] uncontrolled',
      'NYHA Class: NYHA Class III': '[X] III (Comfortable resting)',
      'Procedure performed: Cardiothoracic surgery': '[X] Cardiac surgery performed',
    });
    const v = view.page;
    await expect(v.locator('#hf-fui-missed .value')).toHaveText('[X] no');
    await expect(v.locator('#hf-fui-adher .value')).toHaveText('[X] yes');
    await expect(v.locator('#hf-controlled .value')).toHaveText('[X] uncontrolled');
    await expect(v.locator('#hf-uncontrolled-admit .value')).toHaveText('[X] yes');
    await expect(v.locator('p').filter({ hasText: /^\s*On beta-blockers/ }).locator('.value')).toHaveText('[X] yes');
    await expect(v.locator('#cardiac-surgery-details .value')).toHaveText('[X] Valvuloplasty');
    await expect(v.locator('#hf-fui-missed-details .value')).toHaveCount(0); // missed doses was "no"
    expect(await view.valueTexts()).toHaveLength(8);
  });
});
