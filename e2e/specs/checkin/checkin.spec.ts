import type { Page } from '@playwright/test';
import { test, expect, birthdateYearsAgo } from '../../core';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import { EntryFormPage, VisitPage, selectDefaultProvider, VISIT_PAGE_URL } from '../../pages';

// checkin.xml: "Check-In" (provider, location, date, and the patient's appointments to check in). In production it is opened
// from the visit page or, with createVisit=true, from the registration page; the specs open enterHtmlFormWithStandardUi inside
// a visit they create, so availability (documentation/_availability.e2e.md: enableCheckIn, privilege mirebalais.checkinForm,
// "Check-In Location" session tag) and the createVisit launch are not exercised. A synthetic patient has no appointments.
//
// Conditions in the form, from documentation inventory (checkin.inv.md):
//   ifMode VIEW include=false :26   the whole entry form (details fieldset, appointments, Save)
//   ifMode VIEW (include true)  :75  VIEW-only section with the hidden #most-recent-encounter-title (ENTER must not render it)
// Scripts: none in this file (provider/location/date behaviour is in the shared subform, _shared.e2e.md).
// Side effects on save: none from the form itself (the <appointments> tag only acts on appointments the patient has).
// Visit-page display: the visit page does NOT show this form's VIEW (:75 is therefore not tested). The Check-In entry of encounterTypeConfig.js
// (// checkIn, 55a0d3ea-...) has `shortTemplate: checkInShort.page`, `longTemplate: defaultHtmlFormEncounterLong.page` and
// `templateModelUrl: /module/htmlformentry/encounter.json?...` (HFE's field list, not getAsHtml.action): the encounter is a collapsed card with the
// encounter type, date, "by <provider>" and the type-of-visit obs (this form saves none), and expanding it lists one label + .obs-value row per saved
// field (none for this form). The VIEW test (last test) asserts that card and the empty list.
// Not covered here: ticking and saving an appointment (needs an appointment in the Appointments module), EDIT mode.

const FORM = 'checkin.xml';
const CHECKIN_ENCOUNTER_TYPE_UUID = '55a0d3ea-a4d7-4e88-8f01-5aceb2d3c61b';

// The session location (MCH OPD) lacks the "Check-In Location" tag, so the Location select starts empty: pick an option only
// when it has no value. The provider select is blank when the user has no Provider account: select the default provider.
const fillWhoWhere = async (page: Page) => {
  await selectDefaultProvider(page);
  const location = page.locator('#w3');
  if (!(await location.inputValue())) {
    await location.selectOption({ index: 1 });
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
    await expect(page).toHaveURL(VISIT_PAGE_URL);

    const encounters = await getPatientEncounters(api, context.patient.uuid);
    expect(encounters.map((e) => e.encounterType.uuid)).toEqual([CHECKIN_ENCOUNTER_TYPE_UUID]);
    expect(await getEncounterObs(api, encounters[0].uuid)).toHaveLength(0);
  });

  test('Save without a location is refused with "Required" and nothing is saved', async ({ page, api, createEntryContext }) => {
    // encounter location is mandatory in HFE even though :46 does not say required="true"
    const context = await createEntryContext({ givenName: 'AutoCheckin', familyName: 'Tester', gender: 'F', birthdate: birthdateYearsAgo(30) });
    await EntryFormPage.open(page, FORM, context);
    await selectDefaultProvider(page);
    await page.locator('#w3').selectOption({ index: 0 });
    await saveButton(page).click();

    await expect(page.locator('span.field-error').filter({ hasText: /required/i }).first()).toBeVisible();
    await expect(page).not.toHaveURL(VISIT_PAGE_URL);
    expect(await getPatientEncounters(api, context.patient.uuid)).toHaveLength(0);
  });

  test('the visit page shows a saved check-in as a card with no saved values, and none of the form', async ({
    page,
    api,
    createEntryContext,
  }) => {
    const context = await createEntryContext({ givenName: 'AutoCheckin', familyName: 'Tester', gender: 'F', birthdate: birthdateYearsAgo(30) });
    await EntryFormPage.open(page, FORM, context);
    await fillWhoWhere(page);
    await saveButton(page).click();
    await expect(page).toHaveURL(VISIT_PAGE_URL);
    const [encounter] = await getPatientEncounters(api, context.patient.uuid);
    expect(await getEncounterObs(api, encounter.uuid)).toHaveLength(0);

    const visit = await VisitPage.open(page, context.visitUuid);
    const entry = visit.encounterOfType(CHECKIN_ENCOUNTER_TYPE_UUID);
    await expect(entry).toHaveCount(1);
    await expect(entry.locator('.encounter-name').first()).toContainText('Check-in');
    await expect(entry.locator('.row.col-12 .encounter-card-summary').first()).toHaveText(''); // checkInShort: no type-of-visit obs saved
    const long = await visit.expand(entry);
    await expect(long.locator('.obs-value')).toHaveCount(0); // defaultHtmlFormEncounterLong: one row per saved field, none here
    await expect(long.locator('#most-recent-encounter-title, section#checkin, select, input, fieldset')).toHaveCount(0); // none of the form's own HTML
  });
});
