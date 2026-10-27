import { test, expect, type SectionEncounter } from '../../core';
import { NCD_FOLLOWUP_ENCOUNTER_TYPE_UUID, NCD_INITIAL_ENCOUNTER_TYPE_UUID } from '../../core/constants';
import { getEncounterObs } from '../../commands';
import { SectionFormPage } from '../../pages';
import type { Page } from '@playwright/test';

// section-hypertension.xml: hypertension section of the NCD initial (type, stage, complications) and followup
// (self-management and control indicators) encounters. The specs open the form URL directly on an NCD initial or
// NCD followup encounter, so the visit-page rule that lists the section (_availability.e2e.md) is not exercised.
//
// Conditions in the form, from documentation inventory (section-hypertension.inv.md):
//   ifMode VIEW include=false :21,:212,:248  script, "Definition of disease control" table and buttons: ENTER/EDIT only
//   includeIf initial types   :37   "Type of hypertension" radio (Essential / Secondary) - NCD initial / initial part 2
//   includeIf followup types  :148  "Hypertension followup indicators" obsgroup - NCD followup / part 2
//                                   (missed doses and "Patient condition improved" are required)
//   when yes (x5 rows)        :169,:204  #htn-fui-{aware,understand,adher,missed,improved}-details: only
//                                   #htn-fui-missed-details exists (V1)
// Scripts: only setUpNextAndSubmitButtons() (see _shared); no validation, message, formula or default.
// Side effects on save: postSubmissionAction CleanDiagnosisConstructAction (:19); the form writes no diagnosis obs,
//   so nothing observable (not asserted).
// Not covered here: VIEW mode; the Next / other-section buttons (navigation, _shared).
//
// Findings:
//   V1 Low  :169,:204 four of five thenDisplay targets (#htn-fui-aware-details, -understand-, -adher-, -improved-)
//                     do not exist; those <when> rows do nothing. Fix: remove them or add the detail blocks.
//   V2 Info :70-73,:76-110 the stage table lists four BP bands (up to "> 180 ... refer to the ward") but the stage
//                     radio offers three answers (Pre-HTN, 1 Mild, 2 Moderate); there is no severe option.

const FORM = 'section-hypertension.xml';

const radio = (page: Page, wrapperId: string, label: string) =>
  page.locator(`#${wrapperId}`).getByLabel(label, { exact: true });

test.describe('section-hypertension: NCD initial', () => {
  let section: SectionEncounter;

  test.beforeEach(async ({ createSectionEncounter }) => {
    section = await createSectionEncounter({
      encounterTypeUuid: NCD_INITIAL_ENCOUNTER_TYPE_UUID,
      patient: { givenName: 'AutoHtn', familyName: 'Tester', gender: 'M' },
    });
  });

  test('renders the type of hypertension and no followup indicators', async ({ page }) => {
    // includeIf :37 (initial) vs :148 (followup)
    await SectionFormPage.openEdit(page, FORM, section);
    await expect(page.getByLabel('Essential')).toBeVisible();
    await expect(page.getByLabel('Secondary')).toBeVisible();
    await expect(page.getByText('Hypertension followup indicators')).toHaveCount(0);
    await expect(page.locator('#htn-fui-missed')).toHaveCount(0);
  });

  test('nothing is required: an empty form saves', async ({ page }) => {
    const form = await SectionFormPage.openEdit(page, FORM, section);
    await form.save();
    await form.expectSaved();
  });

  test('saves type, stage, summary and complications', async ({ page, api }) => {
    const form = await SectionFormPage.openEdit(page, FORM, section);
    await page.getByLabel('Secondary').check();
    await page.getByLabel('2 (Moderate)').check();
    await page.locator('p', { hasText: 'Hypertension summary' }).locator('input[type=text]').fill('Poorly controlled');
    await page.getByLabel('Stroke', { exact: true }).check();
    await page.getByLabel('Heart failure', { exact: true }).check();
    await form.save();
    await form.expectSaved();

    const displays = (await getEncounterObs(api, section.encounter.uuid)).map((o) => o.display);
    expect(displays.some((d) => /secondary hypertension/i.test(d))).toBeTruthy();
    expect(displays.some((d) => /moderate hypertension/i.test(d))).toBeTruthy();
    expect(displays.some((d) => /Poorly controlled/.test(d))).toBeTruthy();
    expect(displays.some((d) => /cerebrovascular|stroke/i.test(d))).toBeTruthy();
    expect(displays.some((d) => /heart failure/i.test(d))).toBeTruthy();
  });
});

test.describe('section-hypertension: NCD followup', () => {
  let section: SectionEncounter;

  test.beforeEach(async ({ page, createSectionEncounter }) => {
    section = await createSectionEncounter({
      encounterTypeUuid: NCD_FOLLOWUP_ENCOUNTER_TYPE_UUID,
      patient: { givenName: 'AutoHtn', familyName: 'Tester', gender: 'M' },
    });
    await SectionFormPage.openEdit(page, FORM, section);
  });

  test('renders the followup indicators and no type of hypertension', async ({ page }) => {
    // includeIf :148 (followup) vs :37 (initial)
    await expect(page.getByText('Hypertension followup indicators')).toBeVisible();
    await expect(page.getByLabel('Essential')).toHaveCount(0);
  });

  test('missed doses and "condition improved" are required: saving blank shows two Required errors', async ({ page }) => {
    // required="true" on htn-fui-missed (:177) and htn-fui-improved (:202)
    const form = new SectionFormPage(page, FORM);
    await form.save();
    await expect(page).not.toHaveURL(/referenceapplication\/home\.page/);
    await expect(page.locator('span.field-error', { hasText: 'Required' })).toHaveCount(2);
  });

  test('"# of missed doses" shows only when missed doses is Yes', async ({ page }) => {
    // when :169 (tog=missed)
    const details = page.locator('#htn-fui-missed-details');
    await expect(details).toBeHidden();
    await radio(page, 'htn-fui-missed', 'yes').check();
    await expect(details).toBeVisible();
    await radio(page, 'htn-fui-missed', 'unknown').check();
    await expect(details).toBeHidden();
  });

  test('saves the indicators; EDIT starts from the saved "missed doses = yes"', async ({ page, api }) => {
    await radio(page, 'htn-fui-aware', 'yes').check();
    await radio(page, 'htn-fui-understand', 'no').check();
    await radio(page, 'htn-fui-adher', 'unknown').check();
    await radio(page, 'htn-fui-missed', 'yes').check();
    await page.locator('#htn-fui-missed-details input[type=text]').fill('2');
    await radio(page, 'htn-fui-improved', 'yes').check();
    await page.getByLabel('uncontrolled', { exact: true }).check();
    await page.getByLabel('no', { exact: true }).last().check(); // Dangerous BP indicates hospitalization: no

    const form = new SectionFormPage(page, FORM);
    await form.save();
    await form.expectSaved();

    const displays = (await getEncounterObs(api, section.encounter.uuid)).map((o) => o.display);
    expect(displays).toContain('NCD clinical status: Not controlled');
    expect(displays).toContain('Missed medication doses in past seven days: Yes');
    expect(displays).toContain('Number of missed medication doses in past 7 days: 2');
    expect(displays).toContain('Blood pressure indicates hospitalization: No');

    // when :169 in EDIT mode: the saved Yes shows the details block
    await SectionFormPage.openEdit(page, FORM, section);
    await expect(radio(page, 'htn-fui-missed', 'yes')).toBeChecked();
    await expect(page.locator('#htn-fui-missed-details')).toBeVisible();
    await expect(page.locator('#htn-fui-missed-details input[type=text]')).toHaveValue('2');
  });
});
