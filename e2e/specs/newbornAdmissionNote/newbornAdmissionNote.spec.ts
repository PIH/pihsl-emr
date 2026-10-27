import type { Page } from '@playwright/test';
import { test, expect, type EntryContext } from '../../core';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import { EntryFormPage } from '../../pages';

// newbornAdmissionNote.xml: "Admission Note" for a newborn admitted to a ward (required diagnoses only). The specs open
// enterHtmlFormWithStandardUi inside a visit they create, for an infant (born 3 days ago), so availability
// (documentation/_availability.e2e.md: component flag adtO3 + ADMISSION_NOTE, enterMCH, "Newborn Admission Note Location",
// age < 42 days at visit start, no Admission encounter in the visit) is not exercised.
//
// Conditions in the form, from documentation inventory (newbornAdmissionNote.inv.md):
//   ifMode VIEW include=false  :74  #buttons (Save, Cancel) in ENTER/EDIT only (VIEW cannot be tested)
//   Shared encounter-provider-location-date.xml: provider/location required, date (see _shared.e2e.md).
// Scripts: :22-48 validateForm() runs on every change/click and on load: Save is disabled (htmlForm.disableSubmitButton)
//   unless #where select, #who select and #when input all have a value and at least one .diagnosis row exists.
// Side effects on save: ReopenVisitAction (:20; no-op for an active visit). encounterDiagnosesByObs (required) saves the
//   diagnoses as an obsgroup. No order, no program enrollment.
// Not covered here: includePriorDiagnosesFromMostRecentEncounterWithDispositionOfType="ADMIT" (:68, needs an earlier
//   admission with disposition), provider-role validation (shared), VIEW, the "date" part of the check (jq('#when input')
//   always has a value; the selector also matches the duplicate #when of the shared subform, see _shared V10).

const FORM = 'newbornAdmissionNote.xml';
const NEWBORN_ADMISSION_ENCOUNTER_TYPE_UUID = '260566e1-c909-4d61-a96f-c1019291a09d';

// A newborn: the form is only offered for patients younger than 42 days at visit start.
const daysAgo = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

const saveButton = (page: Page) => page.locator('#buttons input.submitButton');

test.describe('newbornAdmissionNote', () => {
  let context: EntryContext;

  test.beforeEach(async ({ page, createEntryContext }) => {
    context = await createEntryContext({
      givenName: 'AutoNbAdmission',
      familyName: 'Tester',
      gender: 'F',
      birthdate: daysAgo(3),
    });
    await EntryFormPage.open(page, FORM, context);
    await expect(page.locator('#diagnosis-search')).toBeVisible();
  });

  test('Save stays disabled until a location and a diagnosis are given', async ({ page }) => {
    // script :22-48. The provider defaults to the current user; the location has no default (the session
    // location, MCH OPD, is not one of the "Newborn Admission Note Location" options).
    await expect(saveButton(page)).toBeDisabled();

    await page.locator('#encounterLocation select').selectOption({ label: 'NICU' });
    await expect(saveButton(page)).toBeDisabled(); // no diagnosis yet

    await page.locator('#diagnosis-search').fill('neonatal sepsis');
    await page.locator('.ui-autocomplete li', { hasText: 'P36.9 Neonatal sepsis' }).first().click();
    await expect(page.locator('.diagnosis')).toHaveCount(1);
    await expect(saveButton(page)).toBeEnabled();

    // clearing the location disables Save again
    await page.locator('#encounterLocation select').selectOption({ index: 0 });
    await expect(saveButton(page)).toBeDisabled();
  });

  test('saves the admission with a diagnosis and creates one Newborn Admission encounter', async ({ page, api }) => {
    await page.locator('#encounterLocation select').selectOption({ label: 'NICU' });
    await page.locator('#diagnosis-search').fill('neonatal sepsis');
    await page.locator('.ui-autocomplete li', { hasText: 'P36.9 Neonatal sepsis' }).first().click();
    await expect(saveButton(page)).toBeEnabled();
    await saveButton(page).click();
    await new EntryFormPage(page, FORM).expectSaved();

    const encounters = await getPatientEncounters(api, context.patient.uuid);
    expect(encounters.map((e) => e.encounterType.uuid)).toEqual([NEWBORN_ADMISSION_ENCOUNTER_TYPE_UUID]);
    const displays = (await getEncounterObs(api, encounters[0].uuid)).map((o) => o.display.toLowerCase());
    expect(displays.some((d) => d.includes('sepsis'))).toBeTruthy();
  });
});
