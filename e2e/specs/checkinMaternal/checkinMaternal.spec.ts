import type { Page } from '@playwright/test';
import { test, expect, birthdateYearsAgo, type EntryContext } from '../../core';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import { MCH_OPD_LOCATION_UUID } from '../../core/constants';
import { EntryFormPage, VisitPage, selectDefaultProvider, VISIT_PAGE_URL } from '../../pages';

// checkinMaternal.xml: "Maternal Check-In" (provider, location, date, optional referral to MCOE triage, appointments). In
// production it is opened from the visit page or the registration page (enableCheckIn SL block, "Check-In Maternal Location"
// tag, no maternal check-in in the visit); the specs open enterHtmlFormWithStandardUi inside a visit they create, so that
// gating is not exercised.
//
// Conditions in the form, from documentation inventory (checkinMaternal.inv.md):
//   ifMode ENTER   :98   MCOE Triage fieldset ...
//   includeIf (!$visit || $visit.open) :99   ... only when there is no visit or the visit is open (tested with a visit stopped over REST)
//   ifMode VIEW    :94 (hidden #most-recent-encounter-title), :117 (VIEW copy of the triage checkbox): not tested, see Visit-page display
// Scripts: none in this file (shared provider/location/date subform: _shared.e2e.md).
// Side effects on save: postSubmissionAction AddPatientToQueueAction (:21). It is the only reason to tick "Refer to MCOE triage"
//   (CIEL:1272 = PIH:14976, :111); the specs do NOT tick it on save, because a queue entry for a synthetic patient may not be
//   purgeable. The location defaults to the MCOE triage macro (:86, f85feffc-...) when that location carries the tag.
// Visit-page display: the visit page does NOT show this form's VIEW (:94 and :117 are therefore not tested). The Maternal Check-In entry of
// encounterTypeConfig.js (// Maternal checkIn, 251c03fa-...) has `shortTemplate: checkInShort.page`, `longTemplate: defaultHtmlFormEncounterLong.page` and
// `templateModelUrl: /module/htmlformentry/encounter.json?...` (HFE's field list, not getAsHtml.action): the encounter is a collapsed card with
// the encounter type, date, "by <provider>" and the type-of-visit obs (this form saves none), and expanding it lists one label + .obs-value row per saved field
// (the referral obs, when it was saved). The VIEW tests (last two) assert the card and those rows.
// Not covered here: saving with the referral ticked (queue entry), appointments, EDIT mode.
//
// Findings:
//   VW1 Info :70-92  the form's own VIEW renders an empty "Details" fieldset (legend, h3 and the shared provider/location/date block, which is
//        ifMode VIEW include=false) above the triage box; checkin.xml has a separate VIEW version (:75) that leaves it out. The visit page does
//        not show this VIEW (see Visit-page display), so users never see it; no test (it was test.fixme). If the VIEW is ever shown, wrap :70-92 in
//        <ifMode mode="VIEW" include="false">.

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
    await expect(page).toHaveURL(VISIT_PAGE_URL);

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

  // ---- the visit page (checkInShort.page, defaultHtmlFormEncounterLong.page) ----
  test('the visit page shows a check-in saved without the referral as a card with no saved values', async ({ page, api }) => {
    await EntryFormPage.open(page, FORM, context);
    await fillWhoWhere(page);
    await saveButton(page).click();
    await expect(page).toHaveURL(VISIT_PAGE_URL);
    const [encounter] = await getPatientEncounters(api, context.patient.uuid);
    expect(await getEncounterObs(api, encounter.uuid)).toHaveLength(0);

    const visit = await VisitPage.open(page, context.visitUuid);
    const entry = visit.encounterOfType(MATERNAL_CHECKIN_ENCOUNTER_TYPE_UUID);
    await expect(entry).toHaveCount(1);
    await expect(entry.locator('.encounter-name').first()).toContainText('Maternal Check-in');
    await expect(entry.locator('.row.col-12 .encounter-card-summary').first()).toHaveText(''); // no type-of-visit obs
    const long = await visit.expand(entry);
    await expect(long.locator('.obs-value')).toHaveCount(0); // nothing was saved, so no row
    await expect(long.locator('fieldset, select, input, #most-recent-encounter-title')).toHaveCount(0); // none of the form's own HTML
  });

  // The form is saved without the referral (ticking it would add the patient to the triage queue, :21) and the referral obs is added to the encounter
  // over REST: the encounter keeps its form, which HFE's encounter.json (templateModelUrl of the entry) needs to list the fields.
  test('the visit page lists the saved referral obs as a row of the expanded check-in', async ({ page, api }) => {
    await EntryFormPage.open(page, FORM, context);
    await fillWhoWhere(page);
    await saveButton(page).click();
    await expect(page).toHaveURL(VISIT_PAGE_URL);
    const [encounter] = await getPatientEncounters(api, context.patient.uuid);
    const res = await api.post('obs', {
      data: { person: context.patient.uuid, encounter: encounter.uuid, concept: 'CIEL:1272', value: 'PIH:14976', obsDatetime: new Date(Date.now() - 60_000).toISOString() },
    });
    expect(res.ok(), `add referral obs: ${res.status()}`).toBeTruthy();

    const visit = await VisitPage.open(page, context.visitUuid);
    const entry = visit.encounterOfType(MATERNAL_CHECKIN_ENCOUNTER_TYPE_UUID);
    await expect(entry).toHaveCount(1);
    const long = await visit.expand(entry);
    await expect(long.locator('.obs-value')).toHaveCount(1);
  });
});
