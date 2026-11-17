import { test, expect, type SectionEncounter } from '../../core';
import { NCD_INITIAL_2_ENCOUNTER_TYPE_UUID } from '../../core/constants';
import { getEncounterObs } from '../../commands';
import { SectionFormPage, ViewFormPage, expectViewShowsSavedObs } from '../../pages';

// section-ncd-notes.xml: "NCD Overview" of the NCD initial part 2 encounter: reason for the visit and clinical
// notes, two free-text areas. The specs use an NCD initial part 2 encounter (_availability.e2e.md: shown for part 2
// only) and open the form URL directly.
//
// Conditions in the form, from documentation inventory (section-ncd-notes.inv.md):
//   ifMode VIEW include=false  :12  heading and script in ENTER/EDIT only
//   ifMode VIEW include=false  :42  #buttons (Next, Save, Cancel) in ENTER/EDIT only
// Scripts: setUpNextAndSubmitButtons() (:17-19, navigation only: no rule, message or default).
// Side effects on save: none. No required fields.
// EDIT is covered by the save test (saved text reopened), VIEW by the same test and by a blank save. Not covered here: Next (needs the visit-page section wiring).
// Findings: none.

const FORM = 'section-ncd-notes.xml';

test.describe('section-ncd-notes', () => {
  let section: SectionEncounter;

  test.beforeEach(async ({ page, createSectionEncounter }) => {
    section = await createSectionEncounter({
      encounterTypeUuid: NCD_INITIAL_2_ENCOUNTER_TYPE_UUID,
      patient: { givenName: 'AutoNotes', familyName: 'Tester', gender: 'F' },
    });
    await SectionFormPage.openEdit(page, FORM, section);
  });

  test('shows the two note areas and the Next, Save and Cancel buttons in EDIT mode', async ({ page }) => {
    // ifMode :12, :42
    await expect(page.locator('#reason-for-visit textarea')).toBeVisible();
    await expect(page.locator('textarea')).toHaveCount(2);
    await expect(page.locator('#next')).toBeVisible();
    await expect(page.locator('#submit')).toBeVisible();
    await expect(page.locator('#cancel')).toBeVisible();
  });

  test('saves with both notes blank (nothing is required)', async ({ page, api }) => {
    const form = new SectionFormPage(page, FORM);
    await form.save();
    await form.expectSaved();
    expect(await getEncounterObs(api, section.encounter.uuid)).toHaveLength(0);
  });

  test('saves the reason for the visit and the clinical notes', async ({ page, api }) => {
    await page.locator('#reason-for-visit textarea').fill('Referred for uncontrolled blood pressure');
    await page.locator('textarea').nth(1).fill('Counselled on salt intake');

    const form = new SectionFormPage(page, FORM);
    await form.save();
    await form.expectSaved();

    const values = (await getEncounterObs(api, section.encounter.uuid)).map((o) => String(o.value));
    expect(values).toContain('Referred for uncontrolled blood pressure');
    expect(values).toContain('Counselled on salt intake');

    // EDIT shows the saved text
    await SectionFormPage.openEdit(page, FORM, section);
    await expect(page.locator('#reason-for-visit textarea')).toHaveValue('Referred for uncontrolled blood pressure');
    await expect(page.locator('textarea').nth(1)).toHaveValue('Counselled on salt intake');

    // VIEW: both notes are shown as saved, in their own place, and the EDIT-only buttons and heading are absent (ifMode :12, :42)
    const view = await expectViewShowsSavedObs(page, api, FORM, section.encounter.uuid);
    await expect(view.page.locator('#reason-for-visit .value')).toHaveText('Referred for uncontrolled blood pressure');
    expect(await view.valueTexts()).toEqual(['Referred for uncontrolled blood pressure', 'Counselled on salt intake']);
    await expect(view.page.locator('#buttons, #next, #submit, #cancel')).toHaveCount(0);
  });

  test('VIEW of an encounter saved with both notes blank shows no value', async ({ page, api }) => {
    const form = new SectionFormPage(page, FORM);
    await form.save();
    await form.expectSaved();

    const view = await ViewFormPage.open(page, FORM, section.encounter.uuid);
    await expect(view.values).toHaveCount(0);
    await expect(view.page.locator('#reason-for-visit .emptyValue')).toHaveCount(1);
  });
});
