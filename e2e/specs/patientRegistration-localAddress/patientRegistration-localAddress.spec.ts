import { type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { test, expect, type SectionEncounter } from '../../core';
import { PATIENT_REGISTRATION_ENCOUNTER_TYPE_UUID } from '../../core/constants';
import { RegistrationSummaryPage, SectionFormPage, VisitPage, buttonsSubmit, openEditWithButtonsSubmit } from '../../pages';

// patientRegistration-localAddress.xml (pihsl-emr's own form, Sierra Leone only): the "local contact" of the patient: contact name, phone and a local
// address picked from the address hierarchy (country, district, chiefdom, section, village, plus a free-text address), one obs group (PIH:14704). It is
// not a wizard fragment: the registration summary page shows it as a "most recent encounter" widget (editable; SL only) and opens it for editing, so the
// specs create an empty Patient Registration encounter over REST (createSectionEncounter) and open the edit URL directly, which skips the widget gating
// (_availability.e2e.md). Needs the Sierra Leone address hierarchy (kgh-ci has it: Sierra Leone > Bo > Badjia ...).
//
// Conditions in the form, from documentation inventory (patientRegistration-localAddress.inv.md):
//   ifMode VIEW include=false  :3, :51, :78, :131   hierarchy script, h2, the edit address block (6 obs), Save/Cancel (ENTER/EDIT only)
//   ifMode VIEW include=true   :32, :113            VIEW script that hides empty address obs, and the VIEW copy of the 6 address obs (VIEW only: checked on the registration summary page, see below)
//   The inventory's six duplicate-id leads (contactAddress-*) are the two address blocks :78 and :113: they never render together (EDIT vs VIEW): discarded.
// Required (HFE): contact name :67, country :87, district :91, chiefdom (stateProvince) :95. Phone, section, village and address are optional.
// Scripts (:6-29): registrationapp PersonAddressWithHierarchy on #contactAddress-container: each level is an autocomplete over the hierarchy (free text is cleared on
//   blur; a level with no entries below the chosen parent is disabled), the "quick search" input (shortcutFor stateProvince) lists "chiefdom, district, country"
//   and fills those three levels, address2 is free text (manualFields). :21-26 removes `#contactPerson span.title` and hides `#contactPerson .required`: copy-pasted
//   from the contact form, the section here is `#localContactInfo` (V1).
// Side effects on save: none (one obs group). Encounter type Patient Registration.
// Visit-page display: the Patient Registration entry of encounterTypeConfig.js has no templateModelUrl, so the visit page shows no VIEW of this
//   form; `showOnVisitList: false` only keeps the type out of the visit list's type summary, the encounter itself is listed and expands with
//   defaultEncounterLong: one `p.aligned` row for the group (label, the group's values). The test asserts that row.
// Registration summary page: the "LOCAL ADDRESS" widget (coreapps-mostRecentRegistrationLocalAddress, Sierra Leone sites only, CustomAppLoaderFactory
//   enablePatientRegistration) renders this form in VIEW (getAsHtml): the contact name and phone, and the address levels, each in span.value under its
//   own id (contactFirstName, contactPhoneNumber, contactAddress-*; the VIEW script :33-46 removes the unanswered ones instead of showing
//   span.emptyValue), no h2, quick search or #buttons (ifMode VIEW include=false), and an edit pencil to this form. The tests read it through
//   RegistrationSummaryPage (the VIEW blocks of this form are checked there, not on the visit page).
// Not covered here: Cancel, the section and village levels (on kgh-ci the hierarchy has no entries below the chiefdoms tried, so
//   both stay disabled; server data).
//
// Findings:
//   V1 Low  :21-26  the script removes `#contactPerson span.title` and hides `#contactPerson .required`, but the section's id is `localContactInfo`: both are
//                   no-ops, so the red "*" markers of the four required fields stay visible (4 `.required` visible on the page; the contact form hides them).
//                   Fix: use `#localContactInfo`, or delete the lines.
//   V2 Info :73     the phone obs has `class="phoneRegex"`, but no script of this config binds a rule to that class (zl-emr's zl.js does: setUpPhoneNumberRegex): any text
//                   saves as a phone number (checked on kgh-ci: "abc" is saved). Fix: validate in this form's script, or drop the class.

const FORM = 'patientRegistration-localAddress.xml';

const openForm = (page: Page, section: SectionEncounter) => openEditWithButtonsSubmit(page, FORM, section);
const save = async (page: Page) => {
  await buttonsSubmit(page).click();
};
const saveAndWait = async (page: Page) => {
  await save(page);
  await new SectionFormPage(page, FORM).expectSaved();
  await page.waitForLoadState('load');
};

const name = (page: Page) => page.locator('#contactFirstName input');
const phone = (page: Page) => page.locator('#contactPhoneNumber input');
const input = (page: Page, level: string) => page.locator(`#contactAddress-${level} input`);
const REQUIRED_LEVELS = ['country', 'countyDistrict', 'stateProvince'] as const;

// Picks a non-blank suggestion of an address-hierarchy autocomplete (clicking the empty field lists all of them).
const pick = async (page: Page, field: Locator, text: RegExp = /\S/) => {
  await field.click();
  const item = page.locator('ul.ui-autocomplete li:visible').filter({ hasText: text }).first();
  await expect(item).toBeVisible();
  await item.click();
  await expect(field).not.toHaveValue('');
};
// Country Sierra Leone, then the first district and chiefdom offered below it; returns the three values chosen.
const fillLevels = async (page: Page) => {
  await pick(page, input(page, 'country'), /Sierra Leone/);
  await pick(page, input(page, 'countyDistrict'));
  await pick(page, input(page, 'stateProvince'));
  return Promise.all(REQUIRED_LEVELS.map((l) => input(page, l).inputValue()));
};

// The local-contact groups of the (synthetic) encounter: the text of every member, one record per group.
const groups = async (api: APIRequestContext, encounterUuid: string) => {
  const res = await api.get(`encounter/${encounterUuid}?v=custom:(obs:(concept:(display),groupMembers:(concept:(display),value)))`);
  expect(res.ok()).toBeTruthy();
  const obs = (await res.json()).obs as Array<{ groupMembers: Array<{ value: unknown }> | null }>;
  return {
    ungrouped: obs.filter((o) => !o.groupMembers || o.groupMembers.length === 0).length,
    groups: obs.filter((o) => o.groupMembers && o.groupMembers.length > 0).map((o) => o.groupMembers!.map((m) => String(m.value)).sort()),
  };
};

test.describe('patientRegistration-localAddress', () => {
  let section: SectionEncounter;

  test.beforeEach(async ({ page, createSectionEncounter }) => {
    section = await createSectionEncounter({
      encounterTypeUuid: PATIENT_REGISTRATION_ENCOUNTER_TYPE_UUID,
      patient: { givenName: 'AutoLocal', familyName: 'Tester', gender: 'F' },
    });
    await openForm(page, section);
  });

  test('renders the heading, name, phone, the address block (quick search and six levels) and Save/Cancel', async ({ page }) => {
    // when :3, :51, :78, :131 (ENTER/EDIT); the VIEW copy of the address obs (:113) is not rendered
    await expect(page.locator('h2')).toHaveCount(1);
    await expect(name(page)).toBeVisible();
    await expect(phone(page)).toBeVisible();
    await expect(page.locator('input.address-hierarchy-shortcut')).toBeVisible();
    for (const level of [...REQUIRED_LEVELS, 'address1', 'cityVillage', 'address2']) {
      await expect(input(page, level), `${level}: one input`).toHaveCount(1); // no duplicate ids: the VIEW block is not rendered
    }
    await expect(page.locator('#buttons button.cancel')).toBeVisible();
  });

  test('saving with everything blank reports Required on the name, country, district and chiefdom only', async ({ page }) => {
    // required :67, :87, :91, :95
    await save(page);
    for (const id of ['contactFirstName', 'contactAddress-country', 'contactAddress-countyDistrict', 'contactAddress-stateProvince']) {
      await expect(page.locator(`#${id} span.field-error`)).toHaveText('Required');
    }
    await expect(page.locator('span.field-error:visible')).toHaveCount(4);
  });

  test.describe('address hierarchy (script :6-29)', () => {
    test('each level lists the entries of the one above it', async ({ page }) => {
      await pick(page, input(page, 'country'), /Sierra Leone/);
      await input(page, 'countyDistrict').click();
      await expect(page.locator('ul.ui-autocomplete li:visible', { hasText: /^Bo$/ })).toBeVisible();
      await page.locator('ul.ui-autocomplete li:visible', { hasText: /^Bo$/ }).click();
      await expect(input(page, 'countyDistrict')).toHaveValue('Bo');
      await input(page, 'stateProvince').click();
      await expect(page.locator('ul.ui-autocomplete li:visible', { hasText: 'Badjia' })).toBeVisible(); // a chiefdom of Bo
    });

    test('free text that is not a hierarchy entry is cleared on blur; the address is free text', async ({ page }) => {
      await pick(page, input(page, 'country'), /Sierra Leone/);
      const district = input(page, 'countyDistrict');
      await district.fill('Zzzzqq');
      await district.blur();
      await expect(district).toHaveValue('');
      const address = input(page, 'address2');
      await address.fill('Behind the church');
      await address.blur();
      await expect(address).toHaveValue('Behind the church');
    });

    test('the quick search lists "chiefdom, district, country" and fills those three levels', async ({ page }) => {
      const shortcut = page.locator('input.address-hierarchy-shortcut');
      await shortcut.click();
      await shortcut.pressSequentially('Badj', { delay: 60 });
      const item = page.locator('ul.ui-autocomplete li:visible', { hasText: 'Badjia, Bo, Sierra Leone' });
      await expect(item).toBeVisible();
      await item.click();
      await expect(input(page, 'country')).toHaveValue('Sierra Leone');
      await expect(input(page, 'countyDistrict')).toHaveValue('Bo');
      await expect(input(page, 'stateProvince')).toHaveValue('Badjia');
    });
  });

  test('saves one group with the name, phone and address, and EDIT starts from them', async ({ page, api }) => {
    await name(page).fill('AutoLocal Person');
    await phone(page).fill('076123456');
    const levels = await fillLevels(page);
    await input(page, 'address2').fill('Behind the church');
    await saveAndWait(page);

    const saved = await groups(api, section.encounter.uuid);
    expect(saved.ungrouped).toBe(0);
    expect(saved.groups).toEqual([['076123456', 'AutoLocal Person', 'Behind the church', ...levels].sort()]);

    // when :3 (EDIT): the widgets are filled from the saved group
    await openForm(page, section);
    await expect(name(page)).toHaveValue('AutoLocal Person');
    await expect(phone(page)).toHaveValue('076123456');
    for (let i = 0; i < REQUIRED_LEVELS.length; i++) {
      await expect(input(page, REQUIRED_LEVELS[i])).toHaveValue(levels[i]);
    }
    await expect(input(page, 'address2')).toHaveValue('Behind the church');

    // Visit page: the encounter's default long template lists the group as one row with its values
    const visit = await VisitPage.open(page, section.encounter.visitUuid);
    const long = await visit.expand(visit.encounterOfType(PATIENT_REGISTRATION_ENCOUNTER_TYPE_UUID));
    await expect(long.locator('p.aligned')).toHaveCount(1);
    for (const text of ['AutoLocal Person', '076123456', 'Behind the church', ...levels]) {
      await expect(long.locator('p.aligned')).toContainText(text);
    }

    // Registration summary page: each saved value under its own id; the unfilled section and village are not shown;
    // ENTER/EDIT-only parts are absent; the pencil leads to this form's edit page
    const summary = await RegistrationSummaryPage.open(page, section.patient.uuid);
    const shown = (id: string) => summary.value('localAddress', id);
    await expect(shown('contactFirstName')).toHaveText('AutoLocal Person');
    await expect(shown('contactPhoneNumber')).toHaveText('076123456');
    for (let i = 0; i < REQUIRED_LEVELS.length; i++) {
      await expect(shown(`contactAddress-${REQUIRED_LEVELS[i]}`)).toHaveText(levels[i]);
    }
    await expect(shown('contactAddress-address2')).toHaveText('Behind the church');
    for (const id of ['contactAddress-address1', 'contactAddress-cityVillage']) {
      await expect(shown(id), `${id} was not filled`).toHaveCount(0);
    }
    for (const gone of ['h2', 'input.address-hierarchy-shortcut', '#buttons', 'button.submitButton', 'input:not([type=hidden])']) {
      await expect(summary.widget('localAddress').locator(gone), `${gone} is ENTER/EDIT only`).toHaveCount(0);
    }
    await summary.expectEditLink('localAddress');
  });

  test('EDIT: changing the name and clearing the free-text address re-saves them in the same single group', async ({ page, api }) => {
    await name(page).fill('AutoLocal Person');
    const levels = await fillLevels(page);
    await input(page, 'address2').fill('Behind the church');
    await saveAndWait(page);

    await openForm(page, section);
    await name(page).fill('AutoLocal Other');
    await input(page, 'address2').fill('');
    await saveAndWait(page);

    const saved = await groups(api, section.encounter.uuid);
    expect(saved.groups).toEqual([['AutoLocal Other', ...levels].sort()]);

    // Registration summary page for the second save: the new name, the cleared free-text address gone, the levels kept; the pencil opens the form again
    const summary = await RegistrationSummaryPage.open(page, section.patient.uuid);
    await expect(summary.value('localAddress', 'contactFirstName')).toHaveText('AutoLocal Other');
    await expect(summary.value('localAddress', 'contactAddress-address2')).toHaveCount(0);
    await expect(summary.value('localAddress', 'contactAddress-stateProvince')).toHaveText(levels[2]);
    await summary.clickEdit('localAddress');
    await expect(name(page)).toHaveValue('AutoLocal Other');
  });
});
