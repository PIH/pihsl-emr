import { test, expect, type SectionEncounter } from '../../core';
import { NCD_FOLLOWUP_ENCOUNTER_TYPE_UUID } from '../../core/constants';
import { getEncounterObs } from '../../commands';
import { SectionFormPage } from '../../pages';

// section-other-ncd.xml: two "other NCD" diagnoses as checkboxes (Parkinson's disease, Thyroid disease), each in a
// Visit Diagnoses obsgroup, plus a comment. The specs use an NCD followup encounter (the section hangs under NCD
// initial, initial part 2, followup and followup part 2: _availability.e2e.md) and open the form URL directly.
//
// Conditions in the form, from documentation inventory (section-other-ncd.inv.md):
//   ifMode VIEW include=false  :21  script in ENTER/EDIT only
//   ifMode VIEW include=false  :62  jump-button row (#buttonsTopRow: 11 section buttons) and #buttons
// Scripts: setUpNextAndSubmitButtons() (:22-29, navigation only: no rule, message or default).
// Side effects on save: postSubmissionAction CleanDiagnosisConstructAction (:19); its effect on the saved
//   Visit Diagnoses groups is not asserted here (pihcore code). No required fields.
// Not covered here: the jump buttons and Next (need the visit-page section wiring), VIEW mode.
//
// Findings:
//   V1 Low  :40  answerCodeXX="{message}" misspells answerCode in the repeat template (the attribute is
//                ignored): labels come from the concept names, which currently equal the messages. Fix: answerCode.
//   V2 Low  :53  style="text area" is not a valid style (textarea): the comment renders as a one-line text input
//                (confirmed in the rendered form). Fix: style="textarea".

const FORM = 'section-other-ncd.xml';

test.describe('section-other-ncd', () => {
  let section: SectionEncounter;

  test.beforeEach(async ({ page, createSectionEncounter }) => {
    section = await createSectionEncounter({
      encounterTypeUuid: NCD_FOLLOWUP_ENCOUNTER_TYPE_UUID,
      patient: { givenName: 'AutoOther', familyName: 'Tester', gender: 'F' },
    });
    await SectionFormPage.openEdit(page, FORM, section);
  });

  test('shows the two diagnoses, the comment and the section buttons in EDIT mode', async ({ page }) => {
    // ifMode :62
    await expect(page.getByLabel("Parkinson's disease", { exact: true })).toBeVisible();
    await expect(page.getByLabel('Thyroid disease', { exact: true })).toBeVisible();
    await expect(page.locator('#buttonsTopRow button.nextSection')).toHaveCount(11);
    await expect(page.locator('#next')).toBeVisible();
    await expect(page.locator('#submit')).toBeVisible();
  });

  test('saves Parkinson\'s disease and the comment as a visit diagnosis', async ({ page, api }) => {
    await page.getByLabel("Parkinson's disease", { exact: true }).check();
    await page.locator('#other-ncd-dx input[type=text]').fill('Tremor for two years');

    const form = new SectionFormPage(page, FORM);
    await form.save();
    await form.expectSaved();

    const obs = await getEncounterObs(api, section.encounter.uuid);
    const displays = obs.map((o) => o.display.toLowerCase());
    expect(displays.some((d) => d.includes('parkinson'))).toBeTruthy();
    expect(displays.some((d) => d.includes('thyroid'))).toBeFalsy();
    expect(obs.map((o) => String(o.value))).toContain('Tremor for two years');

    // EDIT starts from the saved diagnosis
    await SectionFormPage.openEdit(page, FORM, section);
    await expect(page.getByLabel("Parkinson's disease", { exact: true })).toBeChecked();
    await expect(page.getByLabel('Thyroid disease', { exact: true })).not.toBeChecked();
  });
});
