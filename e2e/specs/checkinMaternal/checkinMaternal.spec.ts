import type { Page } from '@playwright/test';
import { test, expect, birthdateYearsAgo, type EntryContext } from '../../core';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import { MCH_OPD_LOCATION_UUID } from '../../core/constants';
import { EntryFormPage, ViewFormPage, expectViewShowsSavedObs, selectDefaultProvider } from '../../pages';

// checkinMaternal.xml: "Maternal Check-In" (provider, location, date, optional referral to MCOE triage, appointments). In
// production it is opened from the visit page or the registration page (enableCheckIn SL block, "Check-In Maternal Location"
// tag, no maternal check-in in the visit); the specs open enterHtmlFormWithStandardUi inside a visit they create, so that
// gating is not exercised.
//
// Conditions in the form, from documentation inventory (checkinMaternal.inv.md):
//   ifMode ENTER   :98   MCOE Triage fieldset ...
//   includeIf (!$visit || $visit.open) :99   ... only when there is no visit or the visit is open (tested with a visit stopped over REST)
//   ifMode VIEW    :94 (hidden #most-recent-encounter-title), :117 (VIEW copy of the triage checkbox): tested in the last three tests
// Scripts: none in this file (shared provider/location/date subform: _shared.e2e.md).
// Side effects on save: postSubmissionAction AddPatientToQueueAction (:21). It is the only reason to tick "Refer to MCOE triage"
//   (CIEL:1272 = PIH:14976, :111); the specs do NOT tick it on save, because a queue entry for a synthetic patient may not be
//   purgeable. The location defaults to the MCOE triage macro (:86, f85feffc-...) when that location carries the tag.
// VIEW (last three tests): the VIEW of a saved check-in shows the triage checkbox as unselected, and with the referral saved as an obs over REST
//   (no form submission, so no queue entry) as selected; the ENTER-only copy of the fieldset is not rendered twice.
// Not covered here: saving with the referral ticked (queue entry), appointments, EDIT mode.
//
// Findings:
//   VW1 Low :70-92  the "Details" fieldset (legend, h3 and the shared provider/location/date block) is rendered in VIEW with nothing in it:
//        the shared block is ifMode VIEW include=false (encounter-provider-location-date.xml), so VIEW shows an empty "Details" box above the triage
//        box. checkin.xml has a separate VIEW version (:75) that leaves the box out. Fix: wrap :70-92 in <ifMode mode="VIEW" include="false">.
//        TESTED below (test.fixme).

const FORM = 'checkinMaternal.xml';
const MATERNAL_CHECKIN_ENCOUNTER_TYPE_UUID = '251c03fa-a9dc-4157-855f-b016f4fae9ab';

const fillWhoWhere = async (page: Page) => {
  await selectDefaultProvider(page);
  const location = page.locator('#w3');
  if (!(await location.inputValue())) {
    await location.selectOption({ index: 1 });
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
    await selectDefaultProvider(page);
    await page.locator('#w3').selectOption({ index: 0 });
    await saveButton(page).click();
    await expect(page.locator('span.field-error').filter({ hasText: /required/i }).first()).toBeVisible();
    expect(await getPatientEncounters(api, context.patient.uuid)).toHaveLength(0);
  });

  // ---- VIEW (:94, :117) ----
  test('VIEW: a check-in saved without the referral shows the triage checkbox as unselected, once, and no values', async ({ page, api }) => {
    await EntryFormPage.open(page, FORM, context);
    await fillWhoWhere(page);
    await saveButton(page).click();
    await expect(page).toHaveURL(/referenceapplication\/home\.page/);
    const [encounter] = await getPatientEncounters(api, context.patient.uuid);

    const view = await ViewFormPage.open(page, FORM, encounter.uuid);
    expect(await view.valueTexts()).toEqual([]);
    await expect(page.locator('#most-recent-encounter-title')).toHaveCount(1);
    await expect(page.locator('fieldset.queue')).toHaveCount(1); // :117 only; the ENTER copy (:98) is not rendered
    await expect(page.locator('#referToMCOETriage .emptyValue')).toContainText('Refer to MCOE triage');
    await expect(page.locator('#referToMCOETriage .value')).toHaveCount(0);
    await expect(page.locator('input, select, button')).toHaveCount(0);
    await expect(page.getByText('No appointments found')).toBeVisible(); // the patient has none
  });

  // The referral is saved as an obs over REST: submitting the form with it ticked would add the patient to the triage queue (:21).
  test('VIEW: a check-in with the saved referral obs shows "Refer to MCOE triage" as selected', async ({ page, api }) => {
    const res = await api.post('encounter', {
      data: {
        patient: context.patient.uuid,
        encounterType: MATERNAL_CHECKIN_ENCOUNTER_TYPE_UUID,
        location: MCH_OPD_LOCATION_UUID,
        encounterDatetime: new Date().toISOString(),
        visit: context.visitUuid,
        obs: [{ concept: 'CIEL:1272', value: 'PIH:14976' }],
      },
    });
    expect(res.ok(), `create check-in: ${res.status()}`).toBeTruthy();
    const encounter = await res.json();

    const view = await expectViewShowsSavedObs(page, api, FORM, encounter.uuid, { 'Type of referral ordered: Triage service': 'Refer to MCOE triage' });
    expect(await view.valueTexts()).toEqual(['[X] Refer to MCOE triage']);
    await expect(page.locator('#referToMCOETriage .emptyValue')).toHaveCount(0);
    await expect(page.locator('fieldset.queue')).toHaveCount(1);
  });

  // VW1 (Low): the "Details" fieldset is rendered in VIEW with nothing in it. Intended: no empty box. Remove test.fixme() when :70-92 is fixed.
  test('VIEW: no empty "Details" fieldset (VW1)', async ({ page, api }) => {
    test.fixme();
    await EntryFormPage.open(page, FORM, context);
    await fillWhoWhere(page);
    await saveButton(page).click();
    await expect(page).toHaveURL(/referenceapplication\/home\.page/);
    const [encounter] = await getPatientEncounters(api, context.patient.uuid);

    await ViewFormPage.open(page, FORM, encounter.uuid);
    const details = page.locator('fieldset').filter({ has: page.locator('legend', { hasText: 'Details' }) });
    await expect(details).toHaveCount(0);
  });
});
