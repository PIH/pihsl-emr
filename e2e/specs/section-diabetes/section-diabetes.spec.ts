import { test, expect, type SectionEncounter } from '../../core';
import { NCD_FOLLOWUP_ENCOUNTER_TYPE_UUID, NCD_INITIAL_ENCOUNTER_TYPE_UUID } from '../../core/constants';
import { getEncounterObs } from '../../commands';
import { SectionFormPage, ViewFormPage, expectViewShowsSavedObs, VISIT_PAGE_URL } from '../../pages';
import type { Page } from '@playwright/test';

// section-diabetes.xml: diabetes section of the NCD initial (diagnosis, complications) and followup
// (indicators, disease control) encounters. The specs open the form URL directly on an NCD initial or NCD
// followup encounter, so the visit-page rule that lists the section (_availability.e2e.md) is not exercised.
//
// Conditions in the form, from documentation inventory (section-diabetes.inv.md):
//   ifMode VIEW include=false :21,:300,:500  script, "Definition of disease control" table and buttons: ENTER/EDIT only
//   includeIf initial types   :37   diagnosis table (Type 1/2 DM radios, required) - NCD initial / initial part 2
//   includeIf gender F / != F :53/:77  "Gestational DM" option only for women
//   includeIf followup types  :152  "Diabetes followup indicators" obsgroup (4 required radios) - NCD followup / part 2
//   when yes (x5 rows)        :174  #dm-{improved,insulin,severe,adher,missed}-details: only #dm-missed-details exists
//   when #dm-indications-ace=Yes :219 show #dm-on-ace-details;  when #dm-ace=No :233 show #dm-not-ace-details
//   when yes (x3 + x3 rows)   :265,:285  #dm-fui-*-details, #dm-{home,abiity,adjust}-details: none exist (V3)
//   when Fundoscopy Completed :346 show #fundy-results;  when Abnormal :359 show #fun-findings
//   when Foot exam Completed  :393 show #foot-results;  when Abnormal :406 show #abnormal-foot
//   when Loss of sensation    :419 show #foot-numb-message (on each of the 4 foot checkboxes; V1)
// Scripts: only setUpNextAndSubmitButtons() (see _shared); no validation, message, formula or default.
// Side effects on save: postSubmissionAction CleanDiagnosisConstructAction (:19) completes the diagnosis constructs.
// VIEW (viewEncounterWithHtmlForm getAsHtml.action) is covered for both encounter types: the diagnosis table only for NCD initial, the indicators only
// for NCD followup, saved values in span.value, no scripts at all (so every conditional block is rendered, empty).
// Not covered here: the Next / other-section buttons (navigation, _shared).
//
// Findings:
//   V1 Medium :416-421 the "Ulcer prevention recommended" message has a <when value="Loss of sensation"> on each of the
//                      four foot-finding checkboxes; ticking any other box (Neuropathy, Ulcer, Infection) fires its handler,
//                      which hides the message again although "Numbness of foot" is still ticked.
//                      Fix: put the <controls> on the Loss-of-sensation checkbox only. TESTED below (test.fixme).
//   V2 Low    :34,:112 id="complications-dm" on 10 checkboxes and id="diabetes" equals the htmlform id.
//   V3 Low    :174,:265,:285 10 of 13 thenDisplay targets (#dm-improved-details, ..., #dm-adjust-details) do not exist; those
//                      <when> rows do nothing. Fix: remove them or add the detail blocks.
//   V4 Low    :416,:426 the Foot infection render has no `tag`, so its wrapper id is the literal dm-foot-{tag}-dx.
//   V5 Low    :132-146 "Complications at injection site" is always shown; it is not tied to the "Injection site"
//                      complication (unconfirmed intent).
//   VW1 Low   :446-450 the "Ulcer prevention recommended" message is plain text that only the <when> script hides; VIEW has no scripts, so every diabetes
//                      encounter shows it, also with no foot exam or without "Numbness of foot" ticked. Fix: render it in VIEW only when the encounter has a
//                      CIEL:165471 = CIEL:132653 obs (includeIf on $encounter.obs) and keep the <when> for ENTER/EDIT. TESTED below (test.fixme).

const FORM = 'section-diabetes.xml';

const radio = (page: Page, wrapperId: string, label: string) =>
  page.locator(`#${wrapperId}`).getByLabel(label, { exact: true });

// Obs whose concept name is not what the form shows (answerCodes) or that the VIEW does not print as a span.value (hidden diagnosis metadata).
const VIEW_LABELS: Record<string, string> = {
  'Diagnosis order: Secondary': '',
  'Diagnosis: Type 1 diabetes': '[X] Type 1 DM',
  'Diagnosis: Type 2 diabetes': '[X] Type 2 DM',
  'Complications related to diabetes: Cerebrovascular accident': '[X] Stroke',
  'Complications related to diabetes: Complications at injection site': '[X] Injection site',
};

const displaysOf = async (api: Parameters<typeof getEncounterObs>[0], section: SectionEncounter) =>
  (await getEncounterObs(api, section.encounter.uuid)).map((o) => o.display);

test.describe('section-diabetes: NCD initial', () => {
  let section: SectionEncounter;

  test.beforeEach(async ({ createSectionEncounter }) => {
    section = await createSectionEncounter({
      encounterTypeUuid: NCD_INITIAL_ENCOUNTER_TYPE_UUID,
      patient: { givenName: 'AutoDm', familyName: 'Tester', gender: 'F' },
    });
  });

  test('a woman gets the Gestational DM option, the followup indicators are not rendered', async ({ page }) => {
    // includeIf :37, :53 (gender F), :152 (followup only)
    await SectionFormPage.openEdit(page, FORM, section);
    await expect(page.getByLabel('Type 1 DM')).toBeVisible();
    await expect(page.getByLabel('Type 2 DM')).toBeVisible();
    await expect(page.getByLabel('Gestational DM')).toBeVisible();
    await expect(page.getByText('Diabetes followup indicators')).toHaveCount(0);
  });

  test('a man gets only Type 1 and Type 2 DM', async ({ page, createSectionEncounter }) => {
    // includeIf :77 (gender != F)
    const man = await createSectionEncounter({
      encounterTypeUuid: NCD_INITIAL_ENCOUNTER_TYPE_UUID,
      patient: { givenName: 'AutoDm', familyName: 'Tester', gender: 'M' },
    });
    await SectionFormPage.openEdit(page, FORM, man);
    await expect(page.getByLabel('Type 1 DM')).toBeVisible();
    await expect(page.getByLabel('Type 2 DM')).toBeVisible();
    await expect(page.getByLabel('Gestational DM')).toHaveCount(0);
  });

  test('the diabetes type is required: saving without it does not save', async ({ page }) => {
    // required="true" on the diagnosis radio (:61)
    const form = await SectionFormPage.openEdit(page, FORM, section);
    await form.save();
    await expect(page).not.toHaveURL(VISIT_PAGE_URL);
    await expect(page.locator('span.field-error', { hasText: 'Required' }).first()).toBeVisible();
  });

  test('saves the diabetes type, complications and a completed fundoscopy; the diagnosis is recorded', async ({
    page,
    api,
  }) => {
    const form = await SectionFormPage.openEdit(page, FORM, section);
    await page.getByLabel('Type 2 DM').check();
    await page.getByLabel('Diabetic foot', { exact: true }).check();
    await page.getByLabel('Stroke', { exact: true }).check();
    await radio(page, 'fundy-perf', 'Completed').check();
    await form.save();
    await form.expectSaved();

    // CleanDiagnosisConstructAction (:19) turns the "Visit Diagnoses" construct into a diagnosis
    const displays = await displaysOf(api, section);
    expect(displays.some((d) => /^Diagnosis: .*type 2/i.test(d))).toBeTruthy();
    expect(displays.some((d) => /diabetic foot/i.test(d))).toBeTruthy();
    expect(displays.some((d) => /cerebrovascular|stroke/i.test(d))).toBeTruthy();
    expect(displays.some((d) => /fundoscopy|completed/i.test(d))).toBeTruthy();
  });

  test('EDIT starts from the saved value: a saved Completed fundoscopy shows the results block', async ({ page, api }) => {
    // when :346 in EDIT mode
    const form = await SectionFormPage.openEdit(page, FORM, section);
    await page.getByLabel('Type 1 DM').check();
    await radio(page, 'fundy-perf', 'Completed').check();
    await form.save();
    await form.expectSaved();

    await SectionFormPage.openEdit(page, FORM, section);
    await expect(radio(page, 'fundy-perf', 'Completed')).toBeChecked();
    await expect(page.locator('#fundy-results')).toBeVisible();
    await expectViewShowsSavedObs(page, api, FORM, section.encounter.uuid, VIEW_LABELS);
  });

  test('VIEW: shows the diagnosis, complications, fundoscopy and foot findings that were saved, and nothing of the followup indicators', async ({
    page,
    api,
  }) => {
    const form = await SectionFormPage.openEdit(page, FORM, section);
    await page.getByLabel('Type 2 DM').check();
    await page.getByLabel('Diabetic foot', { exact: true }).check();
    await page.getByLabel('Stroke', { exact: true }).check();
    await page.getByLabel('Injection site', { exact: true }).check();
    await page.locator('#injection-site').getByLabel('Lipohypertrophy').check();
    await radio(page, 'fundy-perf', 'Completed').check();
    await radio(page, 'fun-abnorm', 'Abnormal').check();
    await page.locator('#fun-findings').getByLabel('Retinal detachment').check();
    await radio(page, 'foot-exam', 'Completed').check();
    await radio(page, 'normal-foot', 'Abnormal').check();
    await page.locator('#dm-foot-ulcer-dx').getByLabel('Foot ulcer').check();
    await page.locator('#dm-foot-numb-dx').getByLabel('Numbness of foot').check();
    await page.locator('#abnormal-foot p.list-inline').getByLabel('yes').check(); // referred to surgery
    await page.locator('#diabetes > p').last().locator('input[type=text]').fill('Review in 2 weeks');
    await form.save();
    await form.expectSaved();

    const view = await expectViewShowsSavedObs(page, api, FORM, section.encounter.uuid, VIEW_LABELS);
    const shown = await view.valueTexts();
    for (const expected of [
      '[X] Type 2 DM', // answerCodes: the form's label, not "Type 2 diabetes"
      '[X] Diabetic foot',
      '[X] Stroke', // the concept is "Cerebrovascular accident"
      '[X] Injection site',
      '[X] Lipohypertrophy',
      '[X] Completed', // fundoscopy, foot examination
      '[X] Abnormal', // fundoscopy results, foot exam findings
      '[X] Retinal detachment',
      '[X] Numbness of foot',
      '[X] Foot ulcer',
      '[X] yes', // referred to surgery
      'Review in 2 weeks',
    ]) {
      expect(shown, expected).toContain(expected);
    }
    // the other diagnoses are listed unselected, the unanswered questions have no value, the followup block is not rendered (includeIf :152)
    await expect(page.locator('.emptyValue', { hasText: /Type 1 DM/ })).toHaveCount(1);
    await expect(page.locator('.emptyValue', { hasText: /Gestational DM/ })).toHaveCount(1);
    expect(shown).not.toContain('[X] Neuropathy');
    await expect(page.locator('p.list-inline', { hasText: 'Improvement since last visit' }).locator('.value')).toHaveCount(0);
    await expect(page.getByText('Diabetes followup indicators')).toHaveCount(0);
    await expect(page.getByText('Disease control')).toHaveCount(0);
    await expect(page.locator('#buttonsTopRow, input:not([type=hidden]), textarea, select')).toHaveCount(0); // read-only
  });
});

test.describe('section-diabetes: NCD followup', () => {
  let section: SectionEncounter;

  test.beforeEach(async ({ page, createSectionEncounter }) => {
    section = await createSectionEncounter({
      encounterTypeUuid: NCD_FOLLOWUP_ENCOUNTER_TYPE_UUID,
      patient: { givenName: 'AutoDm', familyName: 'Tester', gender: 'F' },
    });
    await SectionFormPage.openEdit(page, FORM, section);
  });

  test('renders the followup indicators and no diagnosis table', async ({ page }) => {
    // includeIf :152 (followup) vs :37 (initial)
    await expect(page.getByText('Diabetes followup indicators')).toBeVisible();
    await expect(page.getByLabel('Type 1 DM')).toHaveCount(0);
    await expect(page.getByLabel('Gestational DM')).toHaveCount(0);
  });

  test('saving with the required indicator radios blank shows four Required errors', async ({ page }) => {
    // required="true": On insulin (:180), Missed doses (:183), Glucometer home (:290), Disease control (:322)
    const form = new SectionFormPage(page, FORM);
    await form.save();
    await expect(page).not.toHaveURL(VISIT_PAGE_URL);
    await expect(page.locator('span.field-error', { hasText: 'Required' })).toHaveCount(4);
  });

  test('"# of missed doses" shows only when missed doses is Yes', async ({ page }) => {
    // when :174 (q=missed)
    const details = page.locator('#dm-missed-details');
    await expect(details).toBeHidden();
    await radio(page, 'dm-missed-top', 'yes').check();
    await expect(details).toBeVisible();
    await radio(page, 'dm-missed-top', 'no').check();
    await expect(details).toBeHidden();
  });

  test('ACE inhibitor questions chain: indication Yes, then not on ACE (No) asks for the reason', async ({ page }) => {
    // when :219, :233
    const onAce = page.locator('#dm-on-ace-details');
    const reason = page.locator('#dm-not-ace-details');
    await expect(onAce).toBeHidden();
    await radio(page, 'dm-indications-ace', 'yes').check();
    await expect(onAce).toBeVisible();
    await expect(reason).toBeHidden();
    await radio(page, 'dm-ace', 'no').check();
    await expect(reason).toBeVisible();
    await radio(page, 'dm-ace', 'yes').check();
    await expect(reason).toBeHidden();
    await radio(page, 'dm-indications-ace', 'no').check();
    await expect(onAce).toBeHidden();
  });

  // Table of the nested show/hide pairs: [parent wrapper, answer that shows, answer that hides, child, grandparent]
  const chains: Array<[string, string, string, string, string]> = [
    ['fundy-perf', 'Completed', 'Not done', '#fundy-results', ''], // when :346
    ['fun-abnorm', 'Abnormal', 'Normal', '#fun-findings', 'fundy-perf'], // when :359
    ['foot-exam', 'Completed', 'Not done', '#foot-results', ''], // when :393
    ['normal-foot', 'Abnormal', 'Normal', '#abnormal-foot', 'foot-exam'], // when :406
  ];
  for (const [wrapper, showAnswer, hideAnswer, target, parent] of chains) {
    test(`#${wrapper}: "${showAnswer}" shows ${target}, "${hideAnswer}" hides it`, async ({ page }) => {
      if (parent) {
        await radio(page, parent, 'Completed').check(); // reveal the nested question first
      }
      await expect(page.locator(target)).toBeHidden();
      await radio(page, wrapper, showAnswer).check();
      await expect(page.locator(target)).toBeVisible();
      await radio(page, wrapper, hideAnswer).check();
      await expect(page.locator(target)).toBeHidden();
    });
  }

  test('"Ulcer prevention recommended" shows when Numbness of foot is ticked', async ({ page }) => {
    // when :419 on the Numbness checkbox
    await radio(page, 'foot-exam', 'Completed').check();
    await radio(page, 'normal-foot', 'Abnormal').check();
    const message = page.locator('#foot-numb-message');
    await expect(message).toBeHidden();
    await page.locator('#dm-foot-numb-dx').getByLabel('Numbness of foot').check();
    await expect(message).toBeVisible();
    await page.locator('#dm-foot-numb-dx').getByLabel('Numbness of foot').uncheck();
    await expect(message).toBeHidden();
  });

  // V1 (Medium): each of the four foot checkboxes carries the same <when>, so ticking another finding hides the
  // message while Numbness stays ticked. Intended: the message stays while Numbness is ticked.
  // Remove test.fixme() when the <controls> are moved to the Numbness checkbox.
  test('the "Ulcer prevention" message stays visible when another foot finding is ticked too (V1)', async ({ page }) => {
    test.fixme();
    await radio(page, 'foot-exam', 'Completed').check();
    await radio(page, 'normal-foot', 'Abnormal').check();
    await page.locator('#dm-foot-numb-dx').getByLabel('Numbness of foot').check();
    await expect(page.locator('#foot-numb-message')).toBeVisible();
    await page.locator('#dm-foot-ulcer-dx').getByLabel('Foot ulcer').check();
    await expect(page.locator('#foot-numb-message')).toBeVisible();
  });

  test('saves the indicators, disease control and foot findings', async ({ page, api }) => {
    await radio(page, 'dm-insulin-top', 'no').check();
    await radio(page, 'dm-missed-top', 'yes').check();
    await page.locator('#dm-missed-details input[type=text]').fill('3');
    await radio(page, 'dm-home-top', 'no').check();
    await page.getByLabel('controlled', { exact: true }).check();
    await radio(page, 'foot-exam', 'Completed').check();
    await radio(page, 'normal-foot', 'Abnormal').check();
    await page.locator('#dm-foot-ulcer-dx').getByLabel('Foot ulcer').check();

    const form = new SectionFormPage(page, FORM);
    await form.save();
    await form.expectSaved();

    const displays = await displaysOf(api, section);
    expect(displays.some((d) => /controlled/i.test(d) && !/uncontrolled/i.test(d))).toBeTruthy();
    expect(displays.some((d) => /missed/i.test(d) && /yes/i.test(d))).toBeTruthy();
    expect(displays.some((d) => /Foot examination findings: Foot ulcer/i.test(d))).toBeTruthy();
    expect(displays.some((d) => /: 3$/.test(d))).toBeTruthy();
    await expectViewShowsSavedObs(page, api, FORM, section.encounter.uuid, VIEW_LABELS);
  });

  // The four required indicator radios, so that a followup can be saved.
  const fillRequired = async (page: Page) => {
    await radio(page, 'dm-insulin-top', 'no').check();
    await radio(page, 'dm-missed-top', 'no').check();
    await radio(page, 'dm-home-top', 'no').check();
    await page.getByLabel('controlled', { exact: true }).check();
  };

  test('VIEW: shows the indicators that were saved with the form\'s own yes/no/controlled labels, and nothing of the diagnosis table', async ({
    page,
    api,
  }) => {
    await radio(page, 'dm-insulin-top', 'no').check();
    await radio(page, 'dm-missed-top', 'yes').check();
    await page.locator('#dm-missed-details input[type=text]').fill('3');
    await radio(page, 'dm-home-top', 'no').check();
    await radio(page, 'dm-indications-ace', 'yes').check();
    await radio(page, 'dm-ace', 'no').check();
    await page.locator('#dm-not-ace-details input').fill('Hyperkalaemia');
    await radio(page, 'dm-fui-aware', 'unknown').check();
    await page.getByLabel('controlled', { exact: true }).check();
    await page.locator('p', { hasText: 'DKA indicates hospitalization' }).getByLabel('unknown').check();
    const form = new SectionFormPage(page, FORM);
    await form.save();
    await form.expectSaved();

    const view = await expectViewShowsSavedObs(page, api, FORM, section.encounter.uuid, VIEW_LABELS);
    const answer = (label: string) => page.locator('p.list-inline-wide', { hasText: label }).locator('.value');
    await expect(answer('On insulin')).toHaveText('[X] no');
    await expect(answer('Missed doses in past week')).toHaveText('[X] yes');
    await expect(answer('Indications for ACE inhibitors')).toHaveText('[X] yes');
    await expect(answer('On ACE inhibitors')).toHaveText('[X] no');
    await expect(answer('Aware and understands the disease')).toHaveText('[X] unknown');
    await expect(answer('Glucometer (home)')).toHaveText('[X] no');
    // "controlled" is the answer, "uncontrolled" is only listed unselected
    await expect(answer('Disease control')).toHaveText('[X] controlled');
    await expect(page.locator('.emptyValue', { hasText: /^\s*\[\s*\]\s*uncontrolled\s*$/ })).toHaveCount(1);
    expect(await view.valueTexts()).toEqual(expect.arrayContaining(['3', 'Hyperkalaemia']));
    // not answered: the other indicators, fundoscopy and foot examination
    await expect(answer('Patient condition improved')).toHaveCount(0);
    await expect(answer('Understands treatment')).toHaveCount(0);
    await expect(page.locator('p.side-by-side', { hasText: 'Fundoscopy performed' }).locator('.value')).toHaveCount(0);
    await expect(page.locator('p.list-inline', { hasText: 'Foot examination performed' }).locator('.value')).toHaveCount(0);
    // the diagnosis table is for the initial encounters only (includeIf :37)
    await expect(page.getByText('Type 1 DM')).toHaveCount(0);
    await expect(page.getByText('Suggested treatment')).toHaveCount(0);
  });

  // VW1 (Low): VIEW has no scripts, so the <when>-controlled message is always printed. Intended: only with "Numbness of foot" ticked.
  // Remove test.fixme() when the message is made conditional in VIEW.
  test('VIEW: "Ulcer prevention recommended" is shown only when Numbness of foot was saved (VW1)', async ({ page, api }) => {
    test.fixme();
    await fillRequired(page);
    await radio(page, 'foot-exam', 'Completed').check();
    await radio(page, 'normal-foot', 'Abnormal').check();
    await page.locator('#dm-foot-ulcer-dx').getByLabel('Foot ulcer').check(); // not the numbness box
    const form = new SectionFormPage(page, FORM);
    await form.save();
    await form.expectSaved();

    await ViewFormPage.open(page, FORM, section.encounter.uuid);
    expect((await displaysOf(api, section)).some((d) => /numbness|loss of sensation/i.test(d))).toBe(false); // the precondition: not saved
    await expect(page.getByText('Ulcer prevention recommended')).toBeHidden();
  });
});
