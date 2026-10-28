import { test, expect, type SectionEncounter } from '../../core';
import { OUTPATIENT_FOLLOWUP_ENCOUNTER_TYPE_UUID } from '../../core/constants';
import { getEncounterObs } from '../../commands';
import { SectionFormPage, ViewFormPage, expectViewShowsSavedObs } from '../../pages';

// section-chief-complaint.xml: one free-text "Chief complaint" of the outpatient followup encounter (it replaces
// section-history there). The specs open the form URL directly on an outpatient followup encounter; the visit-page
// gating is not exercised (documentation/_availability.e2e.md).
//
// Conditions in the form, from documentation inventory (section-chief-complaint.inv.md):
//   ifMode VIEW include=false  :12   h1 title and the script in ENTER/EDIT only
//   ifMode VIEW include=false  :33   #buttons (#next, #submit, #cancel) in ENTER/EDIT only
// Scripts: setUpNextAndSubmitButtons() on document ready (:17-22): #next saves and opens the next section, #submit saves
//   and returns (shared nextAndSubmitButtons.js, see _shared.e2e.md). No validation, message or default.
// Side effects on save: none. The only field (CIEL:160531) is optional.
// VIEW (viewEncounterWithHtmlForm getAsHtml.action) is covered by the save tests: the saved text shows in the form's one span.value, and a blank save
// shows no value; the heading and the buttons are not rendered (ifMode VIEW include=false :12, :33).
// No findings.

const FORM = 'section-chief-complaint.xml';

test.describe('section-chief-complaint', () => {
  let section: SectionEncounter;

  test.beforeEach(async ({ page, createSectionEncounter }) => {
    section = await createSectionEncounter({
      encounterTypeUuid: OUTPATIENT_FOLLOWUP_ENCOUNTER_TYPE_UUID,
      patient: { givenName: 'AutoCC', familyName: 'Tester', gender: 'F' },
    });
    await SectionFormPage.openEdit(page, FORM, section);
  });

  test('EDIT shows the heading and the Next/Save/Cancel buttons', async ({ page }) => {
    // ifMode VIEW include=false :12, :33
    await expect(page.locator('#htmlform h1')).toBeVisible();
    await expect(page.locator('#next')).toBeVisible();
    await expect(page.locator('#submit')).toBeVisible();
    await expect(page.locator('#cancel')).toBeVisible();
  });

  test('saves the chief complaint and shows it again on reopen (EDIT)', async ({ page, api }) => {
    await page.locator('#chief-complaint textarea').fill('Headache since Monday');
    const form = new SectionFormPage(page, FORM);
    await form.save();
    await form.expectSaved();

    const displays = (await getEncounterObs(api, section.encounter.uuid)).map((o) => o.display.toLowerCase());
    expect(displays).toContain('chief complaint (text): headache since monday');

    await SectionFormPage.openEdit(page, FORM, section);
    await expect(page.locator('#chief-complaint textarea')).toHaveValue('Headache since Monday');

    // VIEW: the text as saved, in the form's own field, with no heading and no buttons
    const view = await expectViewShowsSavedObs(page, api, FORM, section.encounter.uuid);
    expect(await view.valueTexts()).toEqual(['Headache since Monday']);
    await expect(page.locator('#chief-complaint .value')).toHaveText('Headache since Monday');
    await expect(page.locator('h1, #buttons, textarea')).toHaveCount(0);
  });

  test('the field is optional: saving it blank saves no obs', async ({ page, api }) => {
    const form = new SectionFormPage(page, FORM);
    await form.save();
    await form.expectSaved();
    expect(await getEncounterObs(api, section.encounter.uuid)).toHaveLength(0);

    // VIEW: the unanswered field is shown as empty, not as a value
    const view = await ViewFormPage.open(page, FORM, section.encounter.uuid);
    await expect(view.values).toHaveCount(0);
    await expect(page.locator('#chief-complaint .emptyValue')).toHaveCount(1);
  });
});
