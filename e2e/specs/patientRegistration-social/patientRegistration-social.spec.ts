import { type APIRequestContext, type Page } from '@playwright/test';
import { test, expect, type SectionEncounter } from '../../core';
import { PATIENT_REGISTRATION_ENCOUNTER_TYPE_UUID } from '../../core/constants';
import { RegistrationSummaryPage, SectionFormPage, VisitPage, buttonsSubmit, openEditWithButtonsSubmit } from '../../pages';

// patientRegistration-social.xml (pihsl-emr's own copy; it shadows pihemr's, which also asks for religion): social details of the patient,
// three optional answers: place of birth (free text), civil status and occupation (coded dropdowns; the obs concept is "Main activity"). It is
// not a wizard fragment: the registration summary page shows it as a "most recent encounter" widget (editable) and opens it for editing, so the
// specs create an empty Patient Registration encounter over REST (createSectionEncounter) and open the edit URL directly. That skips the
// summary-page widget gating (_availability.e2e.md).
//
// Conditions in the form, from documentation inventory (patientRegistration-social.inv.md):
//   ifMode VIEW include=false  :5, :20, :60   script, h2, Save/Cancel (ENTER/EDIT only)
// Required: none. Scripts (:6-12): removes the first generated title span of #social (tested).
// Side effects on save: none. Encounter type Patient Registration.
// Visit-page display: the Patient Registration entry of encounterTypeConfig.js has no templateModelUrl, so the visit page shows no VIEW of this
//   form; `showOnVisitList: false` only keeps the type out of the visit list's type summary, the encounter itself is listed and expands with
//   defaultEncounterLong: one `p.aligned` row per obs (Birthplace, Civil status, Main activity). The test asserts those rows.
// Registration summary page: the "SOCIAL" widget (coreapps-mostRecentRegistrationSocial, every site) renders this form in VIEW (getAsHtml): the three
//   answers each in span.value under their own ids (placeOfBirth, civilStatus, occupation; an unanswered one is a span.emptyValue), no religion, no
//   h2 or #buttons (ifMode VIEW include=false), and an edit pencil to this form. The tests read it through RegistrationSummaryPage (the VIEW blocks of
//   this form are checked there, not on the visit page).
// Not covered here: Cancel.
//
// Findings:
//   V1 Low  :53  `size="dropdown"` on the occupation obs: the attribute that selects a dropdown is `style`, `size` is the input width. It renders a
//                select only because a coded obs with answerConceptIds defaults to one. Fix: `style="dropdown"` (as civil status, :43).
//   V2 Info :3   "TODO find a better way ... copying the entire form": a copy of pihemr's patientRegistration-social.xml minus religion, so a
//                later change to pihemr's form (new occupations) does not reach SL.

const FORM = 'patientRegistration-social.xml';

const openForm = (page: Page, section: SectionEncounter) => openEditWithButtonsSubmit(page, FORM, section);
const save = async (page: Page) => {
  await buttonsSubmit(page).click();
  await new SectionFormPage(page, FORM).expectSaved();
  await page.waitForLoadState('load');
};

const placeOfBirth = (page: Page) => page.locator('#placeOfBirth input');
const civilStatus = (page: Page) => page.locator('#civilStatus select');
const occupation = (page: Page) => page.locator('#occupation select');

const savedObs = async (api: APIRequestContext, encounterUuid: string) => {
  const res = await api.get(`obs?encounter=${encounterUuid}&v=custom:(display)&limit=50`);
  expect(res.ok(), `get obs: ${res.status()}`).toBeTruthy();
  return ((await res.json()).results as Array<{ display: string }>).map((o) => o.display).sort();
};

// Every answer of the two dropdowns: the label the user clicks -> the concept the obs holds (what the answerCodes / answerConceptIds pairing gives).
const CIVIL_STATUS: Array<[string, string]> = [
  ['Single', 'Single or a child'],
  ['Married', 'Married'],
  ['Living with Partner', 'Living with partner'],
  ['Separated', 'Separated'],
  ['Divorced', 'Divorced'],
  ['Widowed', 'Widowed'],
];
const OCCUPATION: Array<[string, string]> = [
  ['Civil servant', 'Civil servant'],
  ['Commerce', 'Commerce'],
  ['Commercial bike rider', 'Commercial bike rider'],
  ['Cowherd', 'Cowherd'],
  ['Driver', 'Driver'],
  ['Factory worker', 'Factory worker'],
  ['Farmer', 'Farmer'],
  ['Fisherman', 'Fisherman'],
  ['Fruit or vegetable vendor', 'Fruit or vegetable vendor'],
  ['Health care worker', 'Health care worker'],
  ['Housework', 'Housework'],
  ['Housework/Fieldwork', 'Housework/Fieldwork'],
  ['Manual laborer', 'Manual laborer'],
  ['Market vendor', 'Market vendor'],
  ['Military', 'Military'],
  ['Miner', 'Miner'],
  ['Police', 'Police'],
  ['Professional', 'Professional'],
  ['Retired', 'Retired'],
  ['Shop owner', 'Shop owner'],
  ['Student', 'Student'],
  ['Teacher', 'Teacher'],
  ['Unemployed', 'Unemployed'],
  ['Other', 'Other'],
];

test.describe('patientRegistration-social', () => {
  let section: SectionEncounter;

  test.beforeEach(async ({ page, createSectionEncounter }) => {
    section = await createSectionEncounter({
      encounterTypeUuid: PATIENT_REGISTRATION_ENCOUNTER_TYPE_UUID,
      patient: { givenName: 'AutoSocial', familyName: 'Tester', gender: 'F' },
    });
    await openForm(page, section);
  });

  test('renders the heading, the three questions (no religion) and Save/Cancel, with the generated title span removed', async ({ page }) => {
    // when :5, :20, :60 (ENTER/EDIT)
    await expect(page.locator('h2')).toHaveCount(1);
    await expect(placeOfBirth(page)).toBeVisible();
    await expect(civilStatus(page)).toBeVisible(); // V1: occupation is a select although only civil status says style="dropdown"
    await expect(occupation(page)).toBeVisible();
    await expect(page.locator('#religion')).toHaveCount(0); // the point of SL's copy
    await expect(page.locator('#buttons button.cancel')).toBeVisible();
    await expect(page.locator('#social span.title')).toHaveCount(0); // script :6-12
    // an empty first option, then the six civil statuses and the 24 occupations
    await expect(civilStatus(page).locator('option')).toHaveText(['', ...CIVIL_STATUS.map(([label]) => label)]);
    await expect(occupation(page).locator('option')).toHaveText(['', ...OCCUPATION.map(([label]) => label)]);
  });

  test('saving with every question blank saves no obs (nothing is required)', async ({ page, api }) => {
    await save(page);
    expect(await savedObs(api, section.encounter.uuid)).toEqual([]);
  });

  test('saves the three answers, and EDIT starts from them', async ({ page, api }) => {
    await placeOfBirth(page).fill('Freetown');
    await civilStatus(page).selectOption({ label: 'Married' });
    await occupation(page).selectOption({ label: 'Fisherman' });
    await save(page);

    expect(await savedObs(api, section.encounter.uuid)).toEqual(['Birthplace: Freetown', 'Civil status: Married', 'Main activity: Fisherman']);

    await openForm(page, section);
    await expect(placeOfBirth(page)).toHaveValue('Freetown');
    await expect(civilStatus(page).locator('option:checked')).toHaveText('Married');
    await expect(occupation(page).locator('option:checked')).toHaveText('Fisherman');

    // Visit page: the encounter's default long template lists each obs as a row
    const visit = await VisitPage.open(page, section.encounter.visitUuid);
    const long = await visit.expand(visit.encounterOfType(PATIENT_REGISTRATION_ENCOUNTER_TYPE_UUID));
    const row = (label: string) => long.locator('p.aligned').filter({ hasText: label });
    await expect(row('Birthplace')).toContainText('Freetown');
    await expect(row('Civil status')).toContainText('Married');
    await expect(row('Main activity')).toContainText('Fisherman');
    await expect(long.locator('p.aligned')).toHaveCount(3);

    // Registration summary page: the three answers under their ids; no religion; ENTER/EDIT-only parts are absent; the pencil leads to this form
    const summary = await RegistrationSummaryPage.open(page, section.patient.uuid);
    await expect(summary.value('social', 'placeOfBirth')).toHaveText('Freetown');
    await expect(summary.value('social', 'civilStatus')).toHaveText('Married');
    await expect(summary.value('social', 'occupation')).toHaveText('Fisherman');
    await expect(summary.widget('social').locator('#religion')).toHaveCount(0);
    for (const gone of ['h2', '#buttons', 'button.submitButton', 'select', 'input:not([type=hidden])']) {
      await expect(summary.widget('social').locator(gone), `${gone} is ENTER/EDIT only`).toHaveCount(0);
    }
    await summary.expectEditLink('social');
  });

  test('EDIT: changing an answer and clearing another re-saves them', async ({ page, api }) => {
    await placeOfBirth(page).fill('Freetown');
    await civilStatus(page).selectOption({ label: 'Single' });
    await save(page);

    await openForm(page, section);
    await civilStatus(page).selectOption({ label: 'Divorced' });
    await placeOfBirth(page).fill('');
    await save(page);

    expect(await savedObs(api, section.encounter.uuid)).toEqual(['Civil status: Divorced']);

    // Registration summary page: the changed answer, the cleared place of birth not shown as a value; the pencil opens the form with the saved answer
    const summary = await RegistrationSummaryPage.open(page, section.patient.uuid);
    await expect(summary.value('social', 'civilStatus')).toHaveText('Divorced');
    await expect(summary.value('social', 'placeOfBirth')).toHaveCount(0);
    await expect(summary.value('social', 'occupation')).toHaveCount(0);
    await summary.clickEdit('social');
    await expect(civilStatus(page).locator('option:checked')).toHaveText('Divorced');
  });

  // answerCodes vs answerConceptIds (:39-41, :48-52): each label the user clicks must save the concept it names (a swapped pair would save
  // another answer). One save per answer.
  test('every civil status and occupation label saves its own concept', async ({ page, api }) => {
    test.setTimeout(180_000);
    for (const [label, concept] of CIVIL_STATUS) {
      await openForm(page, section);
      await civilStatus(page).selectOption({ label });
      await save(page);
      expect(await savedObs(api, section.encounter.uuid), `civil status "${label}"`).toEqual([`Civil status: ${concept}`]);
    }
    for (const [label, concept] of OCCUPATION) {
      await openForm(page, section);
      await occupation(page).selectOption({ label });
      await save(page);
      expect(await savedObs(api, section.encounter.uuid), `occupation "${label}"`).toEqual([`Civil status: ${CIVIL_STATUS[5][1]}`, `Main activity: ${concept}`].sort());
    }
  });
});
