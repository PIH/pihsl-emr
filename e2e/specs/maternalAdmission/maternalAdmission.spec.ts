import type { Page } from '@playwright/test';
import { test, expect, birthdateYearsAgo, type EntryContext } from '../../core';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import { EntryFormPage, VisitPage, selectDefaultProvider, VISIT_PAGE_URL } from '../../pages';

// maternalAdmission.xml: "Maternal Admission" (admitting clinician / admitted to / date, reason for admission as encounter diagnoses,
// free-text summary). The specs open enterHtmlFormWithStandardUi inside a visit they create with a 25-year-old female
// (documentation/_availability.e2e.md: enableMCOEForms, enterMCH, "Maternal Admission Location" session tag, female >= 10, no maternal
// admission or generic Admission encounter in the visit), so the app-loader gating is not exercised. The session location (MCH OPD)
// does not carry the form's location tag (Location select starts empty and is required), so every save picks a location by index.
// The form ends with <submit> (no #submit: use #buttons input.submitButton).
//
// Conditions in the form, from documentation inventory (maternalAdmission.inv.md):
//   ifMode VIEW include=false :62   Save/Cancel buttons: ENTER/EDIT only
// Sub-form (behaviour in documentation/_shared.e2e.md): encounter-provider-location-date (provider required, defaults to the current
// user; location restricted to the "Maternal Admission Location" tag).
// Scripts: none.
// Side effects on save: none (no postSubmissionAction, no enrolment, no disposition). The encounter type is also what the Maternal
// Death form looks up in the visit to show where/when the patient was admitted (see maternalDeath.spec.ts).
// Visit-page display: the visit page does NOT show this form's VIEW. The form saves an Admission encounter (260566e1-...), whose entry in
// encounterTypeConfig.js (// admission) has `shortTemplate: defaultEncounterShort.page`, `longTemplate: admissionLong.page` and no templateModelUrl:
// the collapsed card shows the type, date, "by <provider>" and, when it differs from the visit's, the location; the long view lists the
// encounter's diagnoses (primary first, as "<diagnosis>, <order>, <certainty>") and nothing else. The VIEW test (end of the save test) asserts
// that; the form's own VIEW is therefore not tested. The free-text summary is not shown by that template, a field it never shows (not a finding).
// Not covered here: EDIT, the diagnosis certainty/order controls, app-loader availability.

const FORM = 'maternalAdmission.xml';
const ADMISSION_ENCOUNTER_TYPE = '260566e1-c909-4d61-a96f-c1019291a09d';
const SAVE = '#buttons input.submitButton';

const openForm = async (page: Page, context: EntryContext) => {
  await EntryFormPage.open(page, FORM, context);
  await expect(page.locator(SAVE)).toBeVisible(); // handlers are bound on document.ready
};

test.describe('maternalAdmission', () => {
  let ctx: EntryContext;

  test.beforeEach(async ({ createEntryContext }) => {
    ctx = await createEntryContext({ givenName: 'AutoAdmission', familyName: 'Tester', gender: 'F', birthdate: birthdateYearsAgo(25) });
  });

  test('ENTER shows the diagnoses widget, the summary and the Save/Cancel buttons', async ({ page }) => {
    // ifMode VIEW include=false :62
    await openForm(page, ctx);
    await expect(page.locator('#diagnosis-search')).toBeVisible();
    await expect(page.locator('textarea').last()).toBeVisible();
    await expect(page.locator('#buttons .cancel')).toBeVisible();
    // the location starts empty because MCH OPD has no "Maternal Admission Location" tag
    await expect(page.locator('#encounterLocation select')).toHaveValue('');
  });

  test('saving without a location is blocked and nothing is saved', async ({ page, api }) => {
    await openForm(page, ctx);
    await page.locator(SAVE).click();
    await expect(page.locator('#encounterLocation span.field-error')).toBeVisible();
    await expect(page).toHaveURL(/enterHtmlFormWithStandardUi/);
    expect(await getPatientEncounters(api, ctx.patient.uuid)).toHaveLength(0);
  });

  test('saves the admission diagnosis and summary, and leaves the visit open with no program enrolment', async ({ page, api }) => {
    await openForm(page, ctx);
    await selectDefaultProvider(page);
    await page.locator('#encounterLocation select').selectOption({ index: 1 });
    await page.locator('#diagnosis-search').fill('malaria');
    await page.locator('.ui-autocomplete li').first().click();
    await expect(page.locator('#encounter-diagnoses-target > *')).toHaveCount(1);
    await page.locator('textarea').last().fill('Admitted in active labour');
    await page.locator(SAVE).click();
    await expect(page).toHaveURL(VISIT_PAGE_URL);

    const encounters = await getPatientEncounters(api, ctx.patient.uuid);
    expect(encounters.map((e) => e.encounterType.uuid)).toEqual([ADMISSION_ENCOUNTER_TYPE]);
    const displays = (await getEncounterObs(api, encounters[0].uuid)).map((o) => o.display);
    expect(displays).toContain('Free text comment: Admitted in active labour');
    expect(displays).toContain('Diagnosis: Malaria');

    // no side effects: the visit stays open and the patient is not enrolled in a program
    const visits = (await (await api.get(`visit?patient=${ctx.patient.uuid}&v=custom:(stopDatetime)`)).json()).results;
    expect(visits).toHaveLength(1);
    expect(visits[0].stopDatetime).toBeNull();
    const enrollments = (await (await api.get(`programenrollment?patient=${ctx.patient.uuid}&v=custom:(uuid)`)).json()).results;
    expect(enrollments).toHaveLength(0);

    // what the visit page shows for the encounter: the card, and the diagnoses in the long view (admissionLong.page); not the summary
    const visit = await VisitPage.open(page, ctx.visitUuid);
    const entry = visit.encounterOfType(ADMISSION_ENCOUNTER_TYPE);
    await expect(entry).toHaveCount(1);
    await expect(entry.locator('.encounter-name').first()).toContainText('Admission');
    await visit.expand(entry);
    const long = entry.locator(':scope > .visit-element .content'); // admissionLong.page has no .encounter-summary-long
    await expect(long).toContainText('Malaria, Primary, Presumed');
    await expect(long).not.toContainText('Admitted in active labour');
  });
});
