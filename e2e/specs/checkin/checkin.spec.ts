import type { Page } from '@playwright/test';
import { test, expect, birthdateYearsAgo } from '../../core';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import { EntryFormPage } from '../../pages';

// checkin.xml: "Check-In" (provider, location, date, and the patient's appointments to check in). In production it is opened
// from the visit page or, with createVisit=true, from the registration page; the specs open enterHtmlFormWithStandardUi inside
// a visit they create, so availability (documentation/_availability.e2e.md: enableCheckIn, privilege mirebalais.checkinForm,
// "Check-In Location" session tag) and the createVisit launch are not exercised. A synthetic patient has no appointments.
//
// Conditions in the form, from documentation inventory (checkin.inv.md):
//   ifMode VIEW include=false :26   the whole entry form (details fieldset, appointments, Save)
//   ifMode VIEW (include true)  :75  VIEW-only section with the hidden #most-recent-encounter-title (VIEW cannot be tested: an
//                                    encounter created over REST has no form; ENTER must not render it)
// Scripts: none in this file (provider/location/date behaviour is in the shared subform, _shared.e2e.md).
// Side effects on save: none from the form itself (the <appointments> tag only acts on appointments the patient has).
// Not covered here: ticking and saving an appointment (needs an appointment in the Appointments module), EDIT and VIEW modes.

const FORM = 'checkin.xml';
const CHECKIN_ENCOUNTER_TYPE_UUID = '55a0d3ea-a4d7-4e88-8f01-5aceb2d3c61b';

// The session location (MCH OPD) lacks the "Check-In Location" tag, so the Location select starts empty; the provider defaults
// to the current user when that user has the form's provider role. Pick an option only when the select has no value.
const fillWhoWhere = async (page: Page) => {
  for (const select of [page.locator('select[name=w1]'), page.locator('#w3')]) {
    if (!(await select.inputValue())) {
      await select.selectOption({ index: 1 });
    }
  }
};
const saveButton = (page: Page) => page.locator('#buttons input.submitButton, input.submitButton').first();

test.describe('checkin', () => {
  test('ENTER renders the entry form (ifMode :26) and not the VIEW-only block (:75)', async ({ page, createEntryContext }) => {
    const context = await createEntryContext({ givenName: 'AutoCheckin', familyName: 'Tester', gender: 'F', birthdate: birthdateYearsAgo(30) });
    await EntryFormPage.open(page, FORM, context);

    await expect(saveButton(page)).toBeVisible();
    await expect(page.locator('select[name=w1]')).toBeVisible(); // provider
    await expect(page.locator('#w3')).toBeVisible(); // location
    await expect(page.locator('#w5-display')).toBeVisible(); // date
    await expect(page.locator('section#checkin')).toHaveCount(1);
    await expect(page.locator('#most-recent-encounter-title')).toHaveCount(0);
    await expect(page.locator('.appointment-checkbox input[type=checkbox]')).toHaveCount(0); // patient has no appointments
  });

  test('Save with the defaults and a location creates a Check-In encounter and redirects', async ({ page, api, createEntryContext }) => {
    const context = await createEntryContext({ givenName: 'AutoCheckin', familyName: 'Tester', gender: 'M', birthdate: birthdateYearsAgo(40) });
    await EntryFormPage.open(page, FORM, context);
    await fillWhoWhere(page);
    await saveButton(page).click();
    await expect(page).toHaveURL(/referenceapplication\/home\.page/);

    const encounters = await getPatientEncounters(api, context.patient.uuid);
    expect(encounters.map((e) => e.encounterType.uuid)).toEqual([CHECKIN_ENCOUNTER_TYPE_UUID]);
    expect(await getEncounterObs(api, encounters[0].uuid)).toHaveLength(0);
  });

  test('Save without a location is refused with "Required" and nothing is saved', async ({ page, api, createEntryContext }) => {
    // encounter location is mandatory in HFE even though :46 does not say required="true"
    const context = await createEntryContext({ givenName: 'AutoCheckin', familyName: 'Tester', gender: 'F', birthdate: birthdateYearsAgo(30) });
    await EntryFormPage.open(page, FORM, context);
    await page.locator('#w3').selectOption({ index: 0 });
    await saveButton(page).click();

    await expect(page.locator('span.field-error').filter({ hasText: /required/i }).first()).toBeVisible();
    await expect(page).not.toHaveURL(/referenceapplication\/home\.page/);
    expect(await getPatientEncounters(api, context.patient.uuid)).toHaveLength(0);
  });
});
