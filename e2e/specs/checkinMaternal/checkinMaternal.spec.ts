import type { Page } from '@playwright/test';
import { test, expect, birthdateYearsAgo, type EntryContext } from '../../core';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import { EntryFormPage } from '../../pages';

// checkinMaternal.xml: "Maternal Check-In" (provider, location, date, optional referral to MCOE triage, appointments). In
// production it is opened from the visit page or the registration page (enableCheckIn SL block, "Check-In Maternal Location"
// tag, no maternal check-in in the visit); the specs open enterHtmlFormWithStandardUi inside a visit they create, so that
// gating is not exercised.
//
// Conditions in the form, from documentation inventory (checkinMaternal.inv.md):
//   ifMode ENTER   :98   MCOE Triage fieldset ...
//   includeIf (!$visit || $visit.open) :99   ... only when there is no visit or the visit is open (tested with a visit stopped over REST)
//   ifMode VIEW    :94 (hidden #most-recent-encounter-title), :117 (VIEW copy of the triage checkbox): VIEW cannot be tested
// Scripts: none in this file (shared provider/location/date subform: _shared.e2e.md).
// Side effects on save: postSubmissionAction AddPatientToQueueAction (:21). It is the only reason to tick "Refer to MCOE triage"
//   (CIEL:1272 = PIH:14976, :111); the specs do NOT tick it on save, because a queue entry for a synthetic patient may not be
//   purgeable. The location defaults to the MCOE triage macro (:86, f85feffc-...) when that location carries the tag.
// Not covered here: saving with the referral ticked (queue entry), appointments, EDIT and VIEW modes.

const FORM = 'checkinMaternal.xml';
const MATERNAL_CHECKIN_ENCOUNTER_TYPE_UUID = '251c03fa-a9dc-4157-855f-b016f4fae9ab';

const fillWhoWhere = async (page: Page) => {
  for (const select of [page.locator('select[name=w1]'), page.locator('#w3')]) {
    if (!(await select.inputValue())) {
      await select.selectOption({ index: 1 });
    }
  }
};
const saveButton = (page: Page) => page.locator('input.submitButton').first();

test.describe('checkinMaternal', () => {
  let context: EntryContext;

  test.beforeEach(async ({ createEntryContext }) => {
    context = await createEntryContext({ givenName: 'AutoCheckinMat', familyName: 'Tester', gender: 'F', birthdate: birthdateYearsAgo(25) });
  });

  test('ENTER in an open visit offers the MCOE triage referral (ifMode :98, includeIf :99)', async ({ page }) => {
    await EntryFormPage.open(page, FORM, context);
    await expect(saveButton(page)).toBeVisible();
    await expect(page.locator('fieldset.queue')).toHaveCount(1);
    await expect(page.locator('input[type=checkbox][name=w8]')).toBeVisible();
    await expect(page.locator('input[type=checkbox][name=w8]')).not.toBeChecked();
    await expect(page.locator('#most-recent-encounter-title')).toHaveCount(0); // :94 is VIEW only
    await page.locator('input[type=checkbox][name=w8]').check();
    await expect(page.locator('input[type=checkbox][name=w8]')).toBeChecked(); // (not saved)
  });

  test('ENTER in a stopped visit does not offer the referral (includeIf :99 false)', async ({ page, api }) => {
    const stop = await api.post(`visit/${context.visitUuid}`, { data: { stopDatetime: new Date(Date.now() + 1000).toISOString() } });
    expect(stop.ok(), `stop visit: ${stop.status()}`).toBeTruthy();
    await EntryFormPage.open(page, FORM, context);
    await expect(saveButton(page)).toBeVisible();
    await expect(page.locator('fieldset.queue')).toHaveCount(0);
    await expect(page.locator('input[type=checkbox][name=w8]')).toHaveCount(0);
  });

  test('Save without the referral creates a Maternal Check-In encounter with no obs', async ({ page, api }) => {
    await EntryFormPage.open(page, FORM, context);
    await fillWhoWhere(page);
    await saveButton(page).click();
    await expect(page).toHaveURL(/referenceapplication\/home\.page/);

    const encounters = await getPatientEncounters(api, context.patient.uuid);
    expect(encounters.map((e) => e.encounterType.uuid)).toEqual([MATERNAL_CHECKIN_ENCOUNTER_TYPE_UUID]);
    expect(await getEncounterObs(api, encounters[0].uuid)).toHaveLength(0);
  });

  test('Save without a location is refused with "Required" (encounterLocation required="true" :86)', async ({ page, api }) => {
    await EntryFormPage.open(page, FORM, context);
    await page.locator('#w3').selectOption({ index: 0 });
    await saveButton(page).click();
    await expect(page.locator('span.field-error').filter({ hasText: /required/i }).first()).toBeVisible();
    expect(await getPatientEncounters(api, context.patient.uuid)).toHaveLength(0);
  });
});
