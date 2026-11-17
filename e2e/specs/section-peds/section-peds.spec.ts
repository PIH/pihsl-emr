import { test, expect, birthdateYearsAgo, type SectionEncounter } from '../../core';
import { OUTPATIENT_INITIAL_ENCOUNTER_TYPE_UUID } from '../../core/constants';
import { getEncounterObs } from '../../commands';
import { SectionFormPage, expectViewShowsSavedObs } from '../../pages';

// section-peds.xml: "Pediatrics food & supplements" section of the outpatient initial/followup encounter.
// On the visit page the section is only shown for patients < 15 years at visit start; the specs open the
// form URL directly, so that rule is not exercised here (documentation/_availability.e2e.md).
//
// Conditions in the form, from documentation inventory (section-peds.inv.md):
//   ifMode VIEW include=false  section-peds.xml:116  supplements heading shown in ENTER/EDIT only
//   ifMode VIEW include=false  section-peds.xml:201  feeding heading shown in ENTER/EDIT only
//   ifMode VIEW include=false  section-peds.xml:288  #buttons (#next, #submit, #cancel) in ENTER/EDIT only
// The specs run in EDIT mode, so the headings and buttons are expected to be present. VIEW is covered by the last test (saved rows
// shown with their own age, the rows left empty blank, and no buttons).

// Scripts (all covered below): jq(function(){...}) on load; `change` on .supplement / .yes-feeding enables and
// focuses the row's .ageReceived input and clears + disables it when unticked; `change` on .no-feeding clears
// and disables the age input and unticks the same row's Yes box (via prop, no change event). Re-run on load for
// EDIT. Next/Submit handlers come from the shared nextAndSubmitButtons.js (documentation/_shared.e2e.md).
// Selectors: classes/ids sit on the wrapper <span> HFE generates, so target the inner input, and locate rows by text.
//
// Findings (no test needed):
//   V1 Info  :21-41, 84-99   age inputs start disabled; a checkbox must be ticked before an age can be typed
//   V2 Info  :134, 221, 227  only vitamin-a, breastfeeding-yes and breastfeedAge have ids (on the wrapper span)

const FORM = 'section-peds.xml';

test.describe('section-peds', () => {
  let section: SectionEncounter;

  test.beforeEach(async ({ page, createSectionEncounter }) => {
    section = await createSectionEncounter({
      encounterTypeUuid: OUTPATIENT_INITIAL_ENCOUNTER_TYPE_UUID,
      patient: { givenName: 'AutoPeds', familyName: 'Tester', gender: 'M', birthdate: birthdateYearsAgo(5) },
    });
    await SectionFormPage.openEdit(page, FORM, section);
  });

  test('EDIT shows the headings and Next/Submit/Cancel buttons', async ({ page }) => {
    // ifMode VIEW include=false at :116, :201, :288
    await expect(page.getByRole('heading', { name: /supplement/i }).first()).toBeVisible();
    await expect(page.locator('#next')).toBeVisible();
    await expect(page.locator('#submit')).toBeVisible();
    await expect(page.locator('#cancel')).toBeVisible();
  });

  test('a supplement age input is disabled until its checkbox is ticked, and is cleared when unticked', async ({
    page,
  }) => {
    // js :107-110, 84-99, 112: change on .supplement enables/clears the row's .ageReceived input
    const row = page.locator('tr', { hasText: 'Vitamin A' });
    const checkbox = row.getByRole('checkbox');
    const age = row.getByRole('textbox');

    await expect(age).toBeDisabled();
    await checkbox.check();
    await expect(age).toBeEnabled();
    await expect(age).toBeFocused();

    await age.fill('6 months');
    await checkbox.uncheck();
    await expect(age).toBeDisabled();
    await expect(age).toHaveValue('');
  });

  test('Yes and No for a feeding method exclude each other', async ({ page }) => {
    // js :65-67, 69-71: .yes-feeding enables the age input; .no-feeding clears and disables it and unticks Yes
    const row = page.locator('tr', { hasText: 'Infant Formula' });
    const [yes, no] = [row.getByRole('checkbox').nth(0), row.getByRole('checkbox').nth(1)];
    const age = row.getByRole('textbox');

    await expect(age).toBeDisabled();
    await yes.check();
    await expect(age).toBeEnabled();
    await age.fill('2 months');

    await no.check();
    await expect(yes).not.toBeChecked();
    await expect(age).toBeDisabled();
    await expect(age).toHaveValue('');

    await yes.check();
    await expect(no).not.toBeChecked();
    await expect(age).toBeEnabled();
  });

  test('saves a supplement with its age as obs on the encounter', async ({ page, api }) => {
    const row = page.locator('tr', { hasText: 'Vitamin A' });
    await row.getByRole('checkbox').check();
    await row.getByRole('textbox').fill('6 months');

    const feeding = page.locator('tr', { hasText: 'Infant Formula' });
    await feeding.getByRole('checkbox').nth(0).check();
    await feeding.getByRole('textbox').fill('2 months');

    const form = new SectionFormPage(page, FORM);
    await form.save();
    await form.expectSaved();

    const obs = await getEncounterObs(api, section.encounter.uuid);
    const displays = obs.map((o) => o.display.toLowerCase());
    expect(displays.some((d) => d.includes('vitamin a'))).toBeTruthy();
    expect(displays.some((d) => d.includes('6 months'))).toBeTruthy();
    expect(displays.some((d) => d.includes('infant formula'))).toBeTruthy();
    expect(displays.some((d) => d.includes('2 months'))).toBeTruthy();
  });

  // VIEW: each row shows its own tick and age (the rows are separate obsgroups), a "No" lands in the No column, and the rows that were
  // left empty show nothing. The feeding Yes / No boxes have no label of their own (the column headers say which is which).
  test('VIEW: shows each supplement and feeding row with its own age, and nothing for the rows left empty', async ({ page, api }) => {
    const supplement = (name: string) => page.locator('tr', { hasText: name });
    await supplement('Vitamin A').getByRole('checkbox').check();
    await supplement('Vitamin A').getByRole('textbox').fill('6 months');
    await supplement('Ferrous sulfate').getByRole('checkbox').check();
    await supplement('Ferrous sulfate').getByRole('textbox').fill('1 year');
    const formula = page.locator('tr', { hasText: 'Infant Formula' });
    await formula.getByRole('checkbox').nth(0).check();
    await formula.getByRole('textbox').fill('2 months');
    await page.locator('tr', { hasText: 'Mixed' }).getByRole('checkbox').nth(1).check(); // Mixed feeding: No
    await page.locator('#feeding textarea').fill('Weaned early');

    const form = new SectionFormPage(page, FORM);
    await form.save();
    await form.expectSaved();

    const view = await expectViewShowsSavedObs(page, api, FORM, section.encounter.uuid, {
      'Infant feeding method: Infant formula': '[X]', // the Yes box has no label text
      'Feeding method absent: Mixed feeding': '[X]', // the No box has no label text
    });
    const v = view.page;
    expect(await view.valueTexts()).toEqual([
      '[X] Vitamin A',
      '6 months',
      '[X] Ferrous sulfate',
      '1 year',
      '[X]', // infant formula: Yes
      '2 months',
      '[X]', // mixed feeding: No
      'Weaned early',
    ]);
    const cells = (name: string) => v.locator('tr', { hasText: name }).locator('td');
    await expect(cells('Vitamin A').nth(1).locator('.value')).toHaveText('6 months');
    await expect(cells('Ferrous sulfate').nth(1).locator('.value')).toHaveText('1 year');
    await expect(cells('Infant Formula').nth(1).locator('.value')).toHaveText('[X]'); // Yes column
    await expect(cells('Infant Formula').nth(2).locator('.value')).toHaveCount(0);
    await expect(cells('Infant Formula').nth(3).locator('.value')).toHaveText('2 months');
    await expect(cells('Mixed').nth(1).locator('.value')).toHaveCount(0);
    await expect(cells('Mixed').nth(2).locator('.value')).toHaveText('[X]'); // No column
    await expect(cells('Mixed').nth(3).locator('.value')).toHaveCount(0);
    await expect(v.locator('tr', { hasText: 'Iodine' }).locator('.value')).toHaveCount(0);
    await expect(v.locator('#next, #submit, #cancel')).toHaveCount(0);
  });
});
