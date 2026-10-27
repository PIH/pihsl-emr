import type { APIRequestContext, Page } from '@playwright/test';
import { test, expect, birthdateYearsAgo, type EntryContext } from '../../core';
import { MCH_OPD_LOCATION_UUID } from '../../core/constants';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import { EntryFormPage } from '../../pages';

// maternalDeath.xml: "Maternal Death" review (health facility block read from the visit's admission, preventable death, quality issues, 3 delays,
// underlying causes, three action points). The specs open enterHtmlFormWithStandardUi inside a visit they create with a 25-year-old female
// (documentation/_availability.e2e.md: enableMCOEForms, enterMCH, "Maternal Death Location" session tag, offered only when patient.person.dead),
// so the app-loader gating is not exercised. The session location (MCH OPD) lacks the form's location tag, so every save picks a location by
// index. The form ends with <submit> (no #submit: use #buttons input.submitButton). Tests that need a dead patient mark the synthetic patient
// dead over REST (a dead patient is purged like any other).
//
// Conditions in the form, from documentation inventory (maternalDeath.inv.md):
//   ifMode VIEW include=false :269   Save/Cancel buttons: ENTER/EDIT only
//   lookup :60-86 (not a condition, but drives the first section)   finds the earliest encounter of type 260566e1 (= Maternal Admission, called
//        "Admission" in the comment) in the visit and climbs up to 10 parent locations; :90-102 print "yes/no", the facility, the admission
//        date and the patient's death date from it (tested: with and without an admission, and with a living patient).
// Sub-form (behaviour in documentation/_shared.e2e.md): encounter-provider-location-date (provider required; location by tag).
// Scripts: a beforeSubmit script (SL-1463) sets the hidden primary/secondary marker and the action-point row number only for the groups
//        that have an entry. The inventory's two [macro-undefined?] leads ($visitEncounter, $i) are Velocity #foreach/#set variables: not findings.
// Side effects on save: none. The form does not mark the patient dead and does not close the visit (asserted); death is recorded elsewhere
// (e.g. the "Death" disposition of maternalDischarge.xml, see that spec).
// Not covered here: VIEW/EDIT, the "earliest of several admissions" rule (a REST encounter before the visit start is refused), date pickers
// of the action points, app-loader availability.
//
// Findings:
//   V1 Medium (FIXED, SL-1463) the primary/secondary cause groups and the three action-point groups held hidden obs with a defaultValue
//        (CIEL:159946 "primary"/"secondary", CIEL:165416 row number); a group with a default is never "empty", so every save stored the secondary
//        cause group and action points 2 and 3 with only their label/number. showIfEmpty="false" only affects VIEW. Fixed by dropping the defaults
//        and setting the hidden obs in a beforeSubmit script, only for groups that have an entry. TESTED below.
//   V2 Low :102  format 'dd MMM yyyy HH:mm a' mixes the 24-hour clock with AM/PM ("20:37 PM"). Fix: 'hh:mm a' or 'HH:mm'.
//   V3 Low :94   "Admitted to health facility" prints the top-level ancestor AND the admission encounter's own location ("<facility> <ward>"):
//        the #if has no #else, so the second name is always added (intent unconfirmed). Fix: print only $admissionLocation.
//   V4 Info :90-102  the form never checks patient.person.dead: opened for a living patient the death line is simply blank.

const FORM = 'maternalDeath.xml';
const ADMISSION_ENCOUNTER_TYPE = '260566e1-c909-4d61-a96f-c1019291a09d';
const SAVE = '#buttons input.submitButton';
const DATE_TIME = /^\d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2} (AM|PM)$/;

const openForm = async (page: Page, context: EntryContext) => {
  await EntryFormPage.open(page, FORM, context);
  await expect(page.locator(SAVE)).toBeVisible(); // handlers are bound on document.ready
};

// The facility block: [0] admitted yes/no, [1] facility, [2] admission date/time, [3] death date/time.
const facility = (page: Page) => page.locator('.highlight-facility');

const markDead = async (api: APIRequestContext, ctx: EntryContext) => {
  const cause = await (await api.get('concept/CIEL:5622?v=custom:(uuid)')).json();
  const res = await api.post(`person/${ctx.patient.person.uuid}`, {
    data: { dead: true, deathDate: new Date(Date.now() - 3600 * 1000).toISOString(), causeOfDeath: cause.uuid },
  });
  expect(res.ok(), `mark dead: ${res.status()}`).toBeTruthy();
};

const createAdmission = async (api: APIRequestContext, ctx: EntryContext) => {
  const res = await api.post('encounter', {
    data: {
      patient: ctx.patient.uuid,
      encounterType: ADMISSION_ENCOUNTER_TYPE,
      location: MCH_OPD_LOCATION_UUID,
      encounterDatetime: new Date().toISOString(),
      visit: ctx.visitUuid,
    },
  });
  expect(res.ok(), `admission: ${res.status()}`).toBeTruthy();
};

test.describe('maternalDeath', () => {
  let ctx: EntryContext;

  test.beforeEach(async ({ createEntryContext }) => {
    ctx = await createEntryContext({ givenName: 'AutoDeath', familyName: 'Tester', gender: 'F', birthdate: birthdateYearsAgo(25) });
  });

  // ---- facility block (lookups :60-102) ----
  test('ENTER with an admission in the visit shows yes, the facility, the admission and the death date', async ({ page, api }) => {
    await markDead(api, ctx);
    await createAdmission(api, ctx);
    const location = (await (await api.get(`location/${MCH_OPD_LOCATION_UUID}?v=custom:(name,parentLocation:(name))`)).json()) as {
      name: string;
      parentLocation: { name: string } | null;
    };
    await openForm(page, ctx);
    await expect(facility(page)).toHaveCount(4);
    await expect(facility(page).nth(0)).toHaveText('yes');
    await expect(facility(page).nth(1)).toContainText(location.name);
    if (location.parentLocation) {
      await expect(facility(page).nth(1)).toContainText(location.parentLocation.name); // V3: parent AND ward
    }
    await expect(facility(page).nth(2)).toHaveText(DATE_TIME);
    await expect(facility(page).nth(3)).toHaveText(DATE_TIME);
  });

  test('ENTER without an admission shows "no" and blank facility and admission date, but still the death date', async ({ page, api }) => {
    await markDead(api, ctx);
    await openForm(page, ctx);
    await expect(facility(page).nth(0)).toHaveText('no');
    await expect(facility(page).nth(1)).toBeEmpty();
    await expect(facility(page).nth(2)).toBeEmpty();
    await expect(facility(page).nth(3)).toHaveText(DATE_TIME);
  });

  test('a living patient gets a blank death date (V4)', async ({ page }) => {
    await openForm(page, ctx);
    await expect(facility(page).nth(0)).toHaveText('no');
    await expect(facility(page).nth(3)).toBeEmpty();
  });

  // ---- defaults ----
  test('ENTER defaults the location to the session location (MCH OPD has the "Maternal Death Location" tag) and the provider to the user', async ({ page }) => {
    await openForm(page, ctx);
    await expect(page.locator('#encounterLocation select')).not.toHaveValue('');
    await expect(page.locator('select[name=w1]')).not.toHaveValue('');
  });

  // ---- save ----
  const fillReview = async (page: Page) => {
    await page.locator('#overview input[type=radio]').first().check(); // Preventable death: Yes
    await page.locator('#overview input[type=checkbox]').nth(1).check(); // issue affecting quality: Time
    await page.locator('#overview input[type=checkbox]').nth(6).check(); // 3 delays: Reaching care
    await page.locator('#overview textarea').nth(0).fill('Arrived late from a peripheral unit'); // history
    await page.locator('#overview textarea').nth(1).fill('Earlier referral'); // what could have been done
    await page.locator('#primaryCause input.autoCompleteText').fill('malaria');
    await page.locator('.ui-autocomplete li:visible').first().click();
    const action1 = page.locator('#actionPts tr').nth(2).locator('input[type=text]:visible');
    await action1.nth(0).fill('Review the referral protocol'); // action 1: item
    await action1.nth(1).fill('Matron'); // action 1: responsible person
  };

  test('saves the review and leaves the patient dead and the visit open (the form has no side effects)', async ({ page, api }) => {
    await markDead(api, ctx);
    await createAdmission(api, ctx);
    await openForm(page, ctx);
    await fillReview(page);
    await page.locator(SAVE).click();
    await expect(page).toHaveURL(/referenceapplication\/home\.page/);

    const encounters = (await getPatientEncounters(api, ctx.patient.uuid)).filter((e) => e.encounterType.uuid !== ADMISSION_ENCOUNTER_TYPE);
    expect(encounters).toHaveLength(1);
    const displays = (await getEncounterObs(api, encounters[0].uuid)).map((o) => o.display);
    for (const expected of [
      'Preventable death: Yes',
      'Reasons impacting patient care: Timing',
      'Contributing factors for death: Reaching care',
      'Past medical history added (text): Arrived late from a peripheral unit',
      'Actions to prevent death: Earlier referral',
      'Underlying cause of death: Malaria',
      'Action item: Review the referral protocol',
      'Name of clinician (text): Matron',
    ]) {
      expect(displays, expected).toContain(expected);
    }

    const person = await (await api.get(`person/${ctx.patient.person.uuid}?v=custom:(dead)`)).json();
    expect(person.dead).toBe(true);
    const visits = (await (await api.get(`visit?patient=${ctx.patient.uuid}&v=custom:(stopDatetime)`)).json()).results;
    expect(visits[0].stopDatetime).toBeNull();
  });

  // V1 (fixed): the hidden marker and row number are set only for the groups that have an entry.
  test('V1: empty cause and action-point rows are not stored as groups', async ({ page, api }) => {
    await markDead(api, ctx);
    await openForm(page, ctx);
    await fillReview(page); // one primary cause and one action point: the secondary cause and action points 2/3 stay empty
    await page.locator(SAVE).click();
    await expect(page).toHaveURL(/referenceapplication\/home\.page/);

    const [encounter] = await getPatientEncounters(api, ctx.patient.uuid);
    const obs = await getEncounterObs(api, encounter.uuid);
    expect(obs.filter((o) => o.concept.display.startsWith('Action point set'))).toHaveLength(1);
    expect(obs.filter((o) => o.concept.display.startsWith('Underlying cause of death set'))).toHaveLength(1);
    // the group that was filled still gets its marker and row number
    const displays = obs.map((o) => o.display);
    expect(displays).toContain('Diagnosis order: Primary');
    expect(displays).not.toContain('Diagnosis order: Secondary');
    expect(displays).toContain('Sequence number: 1');
    expect(displays.filter((d) => d.startsWith('Sequence number'))).toHaveLength(1);
  });

  test('V1: every filled cause and action-point row is stored with its marker and row number', async ({ page, api }) => {
    await markDead(api, ctx);
    await openForm(page, ctx);
    await fillReview(page); // primary cause and action point 1
    await page.locator('#secondaryCause input.autoCompleteText').fill('malaria');
    await page.locator('.ui-autocomplete li:visible').first().click();
    // action point 2: only the responsible person; action point 3: only a start date
    await page.locator('#actionPts tr').nth(3).locator('input[type=text]:visible').nth(1).fill('Ward sister');
    // the date inputs are read-only datepickers: set the date through the widget
    await page
      .locator('#actionPts tr')
      .nth(4)
      .locator('input.hasDatepicker')
      .first()
      .evaluate((el) => (window as any).jQuery(el).datepicker('setDate', new Date(2030, 0, 1)));
    await page.locator(SAVE).click();
    await expect(page).toHaveURL(/referenceapplication\/home\.page/);

    const [encounter] = await getPatientEncounters(api, ctx.patient.uuid);
    const displays = (await getEncounterObs(api, encounter.uuid)).map((o) => o.display);
    expect(displays.filter((d) => d.startsWith('Underlying cause of death set'))).toHaveLength(2);
    expect(displays).toContain('Diagnosis order: Primary');
    expect(displays).toContain('Diagnosis order: Secondary');
    expect(displays.filter((d) => d.startsWith('Action point set'))).toHaveLength(3);
    expect(displays.filter((d) => d.startsWith('Sequence number')).sort()).toEqual(['Sequence number: 1', 'Sequence number: 2', 'Sequence number: 3']);
  });
});
