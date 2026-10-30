import type { Page } from '@playwright/test';
import { test, expect, birthdateYearsAgo, type EntryContext } from '../../core';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import { EntryFormPage, ViewFormPage, selectDefaultProvider, viewMismatches, VISIT_PAGE_URL } from '../../pages';

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
// VIEW is covered by the save test (the saved diagnosis and summary are shown, nothing else). Not covered here: EDIT, the diagnosis certainty/order
// controls, app-loader availability.

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

    // VIEW: the free-text summary is a value; the diagnosis is rendered by encounterDiagnosesByObs as plain text "(Presumed) Malaria [B54]", not as a
    // span.value, so the diagnosis obs (order, certainty, diagnosis) are left out of the generic check
    const view = await ViewFormPage.open(page, FORM, encounters[0].uuid);
    expect((await viewMismatches(api, view, encounters[0].uuid)).filter((m) => !m.startsWith('Diagnosis'))).toEqual([]);
    expect(await view.valueTexts()).toEqual(['Admitted in active labour']);
    await expect(view.page.locator('#data-collection')).toContainText(/Primary Diagnosis.*\(Presumed\) Malaria/);
    await expect(view.page.locator('#diagnosis-search')).toHaveCount(0);
    await expect(view.page.locator('#buttons')).toHaveCount(0); // ifMode VIEW include=false :62
  });
});
