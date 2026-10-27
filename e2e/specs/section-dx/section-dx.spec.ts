import { type Page } from '@playwright/test';
import { test, expect, type SectionEncounter } from '../../core';
import { OUTPATIENT_INITIAL_ENCOUNTER_TYPE_UUID } from '../../core/constants';
import { getEncounterObs } from '../../commands';
import { SectionFormPage } from '../../pages';

// section-dx.xml: "Clinical impressions": coded diagnoses (encounterDiagnosesByObs widget) and a free-text clinical note.
// It hangs under several parents (Outpatient initial/followup, NCD initial/followup, MCH delivery; see
// documentation/_availability.e2e.md) but nothing in the form branches on the encounter type, age or gender, so the
// specs use one fixture: an outpatient initial encounter. They open the form URL directly (no visit-page gating).
//
// Conditions in the form, from documentation inventory (section-dx.inv.md):
//   ifMode VIEW include=false  :4    .hasDatepicker style in ENTER/EDIT only
//   ifMode VIEW include=false  :12   h3 title and the script in ENTER/EDIT only
//   ifMode VIEW include=false  :34   #buttons (#next, #submit, #cancel) in ENTER/EDIT only
// Scripts: setUpNextAndSubmitButtons() on document ready (:15-20), shared nextAndSubmitButtons.js (_shared.e2e.md).
//   No validation, message or default of its own.
// Side effects on save: the widget writes obs, not Encounter Diagnosis rows: a "Visit Diagnoses" obs group (diagnosis,
//   certainty, order) per diagnosis; GET encounter ... diagnoses is empty. Not covered: other widget options, since the
//   tag has no attributes besides selectedDiagnosesTarget.
// Not covered here: VIEW mode (REST-created encounters have no form, so viewEncounterWithHtmlForm.page fails); a free-text
//   (non-coded) diagnosis.
//
// Findings:
//   V1 Low   :24    the widget label reads "Add presumed or confirmed diagnosis (required)" but the tag has no required="true"
//                   (compare newbornAdmissionNote.xml), so a blank diagnosis saves. Fix: add required="true" or drop the label.

const FORM = 'section-dx.xml';

test.describe('section-dx', () => {
  let section: SectionEncounter;

  test.beforeEach(async ({ page, createSectionEncounter }) => {
    section = await createSectionEncounter({
      encounterTypeUuid: OUTPATIENT_INITIAL_ENCOUNTER_TYPE_UUID,
      patient: { givenName: 'AutoDx', familyName: 'Tester', gender: 'F' },
    });
    await SectionFormPage.openEdit(page, FORM, section);
  });

  // Types into the diagnosis search and picks the suggestion whose text matches.
  const pickDiagnosis = async (page: Page, term: string, suggestion: RegExp) => {
    await page.locator('#diagnosis-search').pressSequentially(term, { delay: 80 });
    await page.locator('ul.ui-autocomplete li').filter({ hasText: suggestion }).first().click();
  };

  test('EDIT shows the heading and the Next/Save/Cancel buttons', async ({ page }) => {
    // ifMode VIEW include=false :12, :34
    await expect(page.locator('#htmlform h3').first()).toBeVisible();
    await expect(page.locator('#next')).toBeVisible();
    await expect(page.locator('#submit')).toBeVisible();
    await expect(page.locator('#cancel')).toBeVisible();
  });

  test('a blank diagnosis saves although the label says "(required)" (V1)', async ({ page, api }) => {
    const form = new SectionFormPage(page, FORM);
    await form.save();
    await form.expectSaved();
    expect(await getEncounterObs(api, section.encounter.uuid)).toHaveLength(0);
  });

  test('saves a confirmed primary diagnosis and the clinical note, and shows them again on reopen (EDIT)', async ({
    page,
    api,
  }) => {
    await pickDiagnosis(page, 'Pneumonia', /^\s*J18\.9\s*Pneumonia\s*$/);
    const selected = page.locator('#encounter-diagnoses-target');
    await expect(selected.locator('.diagnosis.primary')).toContainText('Pneumonia');
    await selected.getByLabel('Confirmed').check();
    await page.locator('textarea[id^=w]').last().fill('Fever and cough for three days');

    const form = new SectionFormPage(page, FORM);
    await form.save();
    await form.expectSaved();

    const displays = (await getEncounterObs(api, section.encounter.uuid)).map((o) => o.display.toLowerCase());
    expect(displays).toContain('diagnosis: pneumonia');
    expect(displays).toContain('diagnosis certainty: confirmed');
    expect(displays).toContain('diagnosis order: primary');
    expect(displays).toContain('clinical impression comments: fever and cough for three days');

    await SectionFormPage.openEdit(page, FORM, section);
    await expect(page.locator('#encounter-diagnoses-target .diagnosis.primary')).toContainText('Pneumonia');
    await expect(page.locator('#encounter-diagnoses-target').getByLabel('Confirmed')).toBeChecked();
  });
});
