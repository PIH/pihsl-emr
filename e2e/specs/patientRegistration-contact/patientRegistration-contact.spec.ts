import { type APIRequestContext, type Page } from '@playwright/test';
import { test, expect, type SectionEncounter } from '../../core';
import { PATIENT_REGISTRATION_ENCOUNTER_TYPE_UUID } from '../../core/constants';
import { RegistrationSummaryPage, SectionFormPage, VisitPage, buttonsSubmit, openEditWithButtonsSubmit } from '../../pages';

// patientRegistration-contact.xml (pihemr's file; SL has no copy): the contact person of the patient, one obs group "PATIENT CONTACTS
// CONSTRUCT" of four text obs (name, relationship, address as a textarea of at most 250 characters, phone). It is not a wizard fragment: the
// registration summary page shows it as a "most recent encounter" widget (editable; skipped only in Liberia) and opens it for editing, so the
// specs create an empty Patient Registration encounter over REST (createSectionEncounter) and open the edit URL directly. That skips the
// summary-page widget gating (_availability.e2e.md). Unlike zl-emr's copy this one has no address hierarchy, no phone rule and no required field.
//
// Conditions in the form, from documentation inventory (patientRegistration-contact.inv.md):
//   ifMode VIEW include=false  :5, :19, :64   script, h2, Save/Cancel (ENTER/EDIT only)
// Required: none. Scripts (:6-12): removes the first generated title span of #contactPerson (tested).
// Side effects on save: none (one obs group). Encounter type Patient Registration.
// Visit-page display: the Patient Registration entry of encounterTypeConfig.js has no templateModelUrl, so the visit page shows no VIEW of this
//   form; `showOnVisitList: false` only keeps the type out of the visit list's type summary, the encounter itself is listed and expands with
//   defaultEncounterLong: one `p.aligned` row for the contact group (label, the group's values). The test asserts that row.
// Registration summary page: the "CONTACT PERSON" widget (coreapps-mostRecentRegistrationContact, every site but Liberia) renders this form in VIEW
//   (getAsHtml): name, relationship, address and phone each in span.value under their own ids (:34 ff.; the unanswered ones as span.emptyValue), no
//   h2 or #buttons (ifMode VIEW include=false), and an edit pencil to this form. The tests read it through RegistrationSummaryPage (the VIEW blocks of
//   this form are checked there, not on the visit page).
// Not covered here: Cancel.
// Findings: none.

const FORM = 'patientRegistration-contact.xml';

const openForm = (page: Page, section: SectionEncounter) => openEditWithButtonsSubmit(page, FORM, section);
const save = async (page: Page) => {
  await buttonsSubmit(page).click();
  await new SectionFormPage(page, FORM).expectSaved();
  await page.waitForLoadState('load');
};

const name = (page: Page) => page.locator('#contactName input');
const relationship = (page: Page) => page.locator('#contactRelationship input');
const address = (page: Page) => page.locator('#contactAddress textarea');
const phone = (page: Page) => page.locator('#contactPhoneNumber input');

// The contact groups of the (synthetic) encounter: concept name -> text of every member, one record per group.
const contactGroups = async (api: APIRequestContext, encounterUuid: string) => {
  const res = await api.get(`encounter/${encounterUuid}?v=custom:(obs:(concept:(display),groupMembers:(concept:(display),value)))`);
  expect(res.ok()).toBeTruthy();
  const obs = (await res.json()).obs as Array<{
    concept: { display: string };
    groupMembers: Array<{ concept: { display: string }; value: unknown }> | null;
  }>;
  return {
    ungrouped: obs.filter((o) => !o.groupMembers || o.groupMembers.length === 0).length,
    groups: obs
      .filter((o) => o.groupMembers && o.groupMembers.length > 0)
      .map((o) => ({
        concept: o.concept.display,
        members: Object.fromEntries(o.groupMembers!.map((m) => [m.concept.display, String(m.value)])),
      })),
  };
};

test.describe('patientRegistration-contact', () => {
  let section: SectionEncounter;

  test.beforeEach(async ({ page, createSectionEncounter }) => {
    section = await createSectionEncounter({
      encounterTypeUuid: PATIENT_REGISTRATION_ENCOUNTER_TYPE_UUID,
      patient: { givenName: 'AutoContact', familyName: 'Tester', gender: 'F' },
    });
    await openForm(page, section);
  });

  test('renders the heading, the four fields and Save/Cancel, with the generated title span removed', async ({ page }) => {
    // when :5, :19, :64 (ENTER/EDIT)
    await expect(page.locator('h2')).toHaveCount(1);
    await expect(name(page)).toBeVisible();
    await expect(relationship(page)).toBeVisible();
    await expect(address(page)).toBeVisible();
    await expect(phone(page)).toBeVisible();
    await expect(page.locator('#buttons button.cancel')).toBeVisible();
    // script :6-12
    await expect(page.locator('#contactPerson span.title')).toHaveCount(0);
  });

  test('the address is a textarea limited to 250 characters', async ({ page }) => {
    await expect(address(page)).toHaveAttribute('maxlength', '250');
  });

  test('saving with every field blank saves no contact group (nothing is required)', async ({ page, api }) => {
    await save(page);
    const { groups, ungrouped } = await contactGroups(api, section.encounter.uuid);
    expect(groups).toHaveLength(0);
    expect(ungrouped).toBe(0);
  });

  test('saves one contact group with the four values, and EDIT starts from them', async ({ page, api }) => {
    await name(page).fill('AutoContact Person');
    await relationship(page).fill('Sister');
    await address(page).fill('12 Main Street, Freetown');
    await phone(page).fill('076123456');
    await save(page);

    const { groups, ungrouped } = await contactGroups(api, section.encounter.uuid);
    expect(ungrouped).toBe(0);
    expect(groups).toHaveLength(1);
    expect(groups[0].concept).toMatch(/contact/i);
    expect(Object.values(groups[0].members).sort()).toEqual(['076123456', '12 Main Street, Freetown', 'AutoContact Person', 'Sister']);

    // when :5 (EDIT): the widgets are filled from the saved group
    await openForm(page, section);
    await expect(name(page)).toHaveValue('AutoContact Person');
    await expect(relationship(page)).toHaveValue('Sister');
    await expect(address(page)).toHaveValue('12 Main Street, Freetown');
    await expect(phone(page)).toHaveValue('076123456');

    // Visit page: the encounter's default long template lists the contact group as one row with its values
    const visit = await VisitPage.open(page, section.encounter.visitUuid);
    const long = await visit.expand(visit.encounterOfType(PATIENT_REGISTRATION_ENCOUNTER_TYPE_UUID));
    await expect(long.locator('p.aligned')).toHaveCount(1);
    for (const text of ['AutoContact Person', 'Sister', '12 Main Street, Freetown', '076123456']) {
      await expect(long.locator('p.aligned')).toContainText(text);
    }

    // Registration summary page: the widget shows each saved value under its own id; ENTER/EDIT-only parts are absent; the pencil leads to this form
    const summary = await RegistrationSummaryPage.open(page, section.patient.uuid);
    await expect(summary.value('contact', 'contactName')).toHaveText('AutoContact Person');
    await expect(summary.value('contact', 'contactRelationship')).toHaveText('Sister');
    await expect(summary.value('contact', 'contactAddress')).toHaveText('12 Main Street, Freetown');
    await expect(summary.value('contact', 'contactPhoneNumber')).toHaveText('076123456');
    for (const gone of ['h2', '#buttons', 'button.submitButton', 'input:not([type=hidden])', 'textarea']) {
      await expect(summary.widget('contact').locator(gone), `${gone} is ENTER/EDIT only`).toHaveCount(0);
    }
    await summary.expectEditLink('contact');
  });

  test('a partly filled group saves only the answered members', async ({ page, api }) => {
    await name(page).fill('AutoContact Partial');
    await save(page);
    const { groups } = await contactGroups(api, section.encounter.uuid);
    expect(groups).toHaveLength(1);
    expect(Object.values(groups[0].members)).toEqual(['AutoContact Partial']);

    // Registration summary page: the answered name is a value, the three unanswered questions are shown empty
    const summary = await RegistrationSummaryPage.open(page, section.patient.uuid);
    await expect(summary.value('contact', 'contactName')).toHaveText('AutoContact Partial');
    for (const id of ['contactRelationship', 'contactAddress', 'contactPhoneNumber']) {
      await expect(summary.value('contact', id), `${id} was not answered`).toHaveCount(0);
    }
  });

  test('EDIT: changing the relationship and re-saving replaces it, in the same single group', async ({ page, api }) => {
    await name(page).fill('AutoContact Person');
    await relationship(page).fill('Sister');
    await save(page);

    await openForm(page, section);
    await relationship(page).fill('Brother');
    await save(page);

    const { groups } = await contactGroups(api, section.encounter.uuid);
    expect(groups).toHaveLength(1);
    expect(Object.values(groups[0].members).sort()).toEqual(['AutoContact Person', 'Brother']);

    // Registration summary page: the second save's relationship and nothing of the replaced one
    const summary = await RegistrationSummaryPage.open(page, section.patient.uuid);
    await expect(summary.value('contact', 'contactRelationship')).toHaveText('Brother');
    await expect(summary.value('contact', 'contactName')).toHaveText('AutoContact Person');
    expect(Object.values(await summary.rows('contact'))).not.toContain('Sister');
  });

  test('EDIT: clearing every field and saving removes the group', async ({ page, api }) => {
    await name(page).fill('AutoContact Person');
    await phone(page).fill('076123456');
    await save(page);

    await openForm(page, section);
    await name(page).fill('');
    await phone(page).fill('');
    await save(page);

    const { groups } = await contactGroups(api, section.encounter.uuid);
    expect(groups).toHaveLength(0);

    // Registration summary page: nothing is shown as a value any more
    const summary = await RegistrationSummaryPage.open(page, section.patient.uuid);
    await expect(summary.widget('contact').locator('span.value')).toHaveCount(0);
  });
});
