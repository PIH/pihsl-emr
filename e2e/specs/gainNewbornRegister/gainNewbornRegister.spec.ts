import type { APIRequestContext, Page } from '@playwright/test';
import { type EntryContext, test, expect, birthdateYearsAgo } from '../../core';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import { EntryFormPage } from '../../pages';

// gainNewbornRegister.xml: "SCBU Newborn Register" (GAIN): baby and caregiver, referral, delivery, management commenced,
// APGAR, and the discharge/outcome of the SCBU stay, all on one page. A top-level form: the specs open
// enterHtmlFormWithStandardUi inside a visit they create for a 25-year-old woman (the mother whose name the form shows), so
// availability (documentation/_availability.e2e.md: enableMCHGainNewborn, enterMCH, "Maternal and Child Location" session
// tag, female >= 10) is not exercised. Availability lists it as NOT offered (no site lists mchGAINNewborn), so the form is
// only reachable by URL. The session location (MCH OPD) carries the location tag (:43), so the select defaults to it.
//
// Conditions in the form, from documentation inventory (gainNewbornRegister.inv.md):
//   ifMode VIEW include=false  :33, :515  heading and #buttons exist in ENTER/EDIT only
//   when PIH:10635 = CIEL:5622 :176  "Referred by" = Other shows #other-referrer
//   when CIEL:163774 = CIEL:5622 :251  "Place of delivery" = Other shows #other-delivery-place
//   when PIH:12365 = CIEL:5622 :271  "Which facility?" = Other shows #other-facility
//   when PIH:8620 = CIEL:159   :456  "Outcome of admission" = Death shows #scbu-death (death obs group)
// Sub-form (documentation/_shared.e2e.md): encounter-provider-location-date (provider, location, and its own date widget).
// Scripts: none of its own. Side effects on save: none (no program, disposition or order).
// Not covered here: VIEW and EDIT modes; the death group is not saved.
//
// Findings (duplicate id="when" :87 is _shared V10; id="treatment" is on six sections :48, :99, :191, :206, :242, :446):
//   V1 Low  :41-46, :92  two encounter date widgets: the sub-form's own date (its date-widget parameter is not blanked, unlike
//                        gainMaternalRegister.xml:46-48) and "Date & time of arrival". Both are validated and the user
//                        enters the date twice. Fix: pass an empty encounter-date-widget (TESTED: two widgets).
//   V2 Info :364         conceptId="CIEL: 159604" has a stray space but is NOT a defect: HFE trims the reference, the field renders
//                        and saves APGAR score at 5 minutes = CIEL:159604 (TESTED in the save test). Fix: remove the space.
//   V3 Info :478         CIEL:114100 is listed twice in answerConceptIds of "Cause of death"; the widget shows it once.
//   V4 Info :14          htmlform id="gain-maternal-register" is copied from the maternal form (cosmetic).

const FORM = 'gainNewbornRegister.xml';
const SCBU_REGISTER_ENCOUNTER_TYPE_UUID = '3790ecc6-bc63-48f8-9104-f81dc90ee21c';

// The form uses the HFE <submit> tag: there is no #submit.
const save = async (page: Page) => {
  await page.locator('#buttons input.submitButton').click();
};

// "<concept>=<value>" for each obs of the encounter (coded values by their name).
const obsSummary = async (api: APIRequestContext, encounterUuid: string): Promise<string[]> =>
  (await getEncounterObs(api, encounterUuid)).map((o) => {
    const v = o.value as { display?: string } | string | number;
    return `${o.concept.display}=${typeof v === 'object' && v !== null ? v.display : v}`;
  });

test.describe('gainNewbornRegister', () => {
  let context: EntryContext;

  const open = async (page: Page) => {
    await EntryFormPage.open(page, FORM, context);
    await expect(page.locator('#buttons input.submitButton')).toBeVisible();
  };

  test.beforeEach(async ({ createEntryContext }) => {
    context = await createEntryContext({
      givenName: 'AutoGainNb',
      familyName: 'Tester',
      gender: 'F',
      birthdate: birthdateYearsAgo(25),
    });
  });

  // Each "Other" answer reveals a free-text field; any other answer hides it again.
  const otherCases = [
    { name: 'Referred by', group: '#referrer-role', target: '#other-referrer', other: 'Other', not: 'Nurse' }, // :176
    { name: 'Place of delivery', group: '#delivery-place', target: '#other-delivery-place', other: 'Other', not: 'Hospital' }, // :251
    { name: 'Which facility?', group: '#which-facility', target: '#other-facility', other: 'Other', not: 'Wellbody' }, // :271
    { name: 'Outcome of admission', group: '#outcome-admission', target: '#scbu-death', other: 'Death', not: 'Discharged' }, // :456
  ];

  for (const { name, group, target, other, not } of otherCases) {
    test(`"${name}" = ${other} shows ${target}, ${not} hides it`, async ({ page }) => {
      await open(page);
      await expect(page.locator(target)).toBeHidden();
      await page.locator(group).getByLabel(other, { exact: true }).check();
      await expect(page.locator(target)).toBeVisible();
      await page.locator(group).getByLabel(not, { exact: true }).check();
      await expect(page.locator(target)).toBeHidden();
    });
  }

  test('V1: the sub-form date and the arrival date are both rendered', async ({ page }) => {
    // :41-46 does not blank the sub-form's date; :92 adds a second, date-and-time widget
    await open(page);
    await expect(page.locator('span#encounterDate')).toHaveCount(2);
    await expect(page.locator('span#encounterDate select[name$=hours]')).toHaveCount(1);
  });

  test('the mother is shown from the patient and the location is required', async ({ page, api }) => {
    await open(page);
    await expect(page.locator('.two-columns').first()).toContainText('Tester, AutoGainNb');
    await expect(page.locator('#encounterLocation select')).not.toHaveValue('');
    await page.locator('#encounterLocation select').selectOption({ index: 0 });
    await save(page);
    await expect(page.locator('#encounterLocation span.field-error')).toHaveText('required');
    await expect(page).toHaveURL(/enterHtmlFormWithStandardUi/);
    expect(await getPatientEncounters(api, context.patient.uuid)).toHaveLength(0);
  });

  test('saving records the register entry, including APGAR 5 min (V2: stray space in the concept)', async ({ page, api }) => {
    await open(page);
    await page.locator('p', { hasText: 'Name of baby' }).locator('input[type=text]').first().fill('AutoBaby');
    await page.locator('#referrer-role').getByLabel('Nurse', { exact: true }).check();
    await page.locator('#delivery-place').getByLabel('Hospital', { exact: true }).check();
    // the <p> holds both APGAR inputs: the first is 1 minute, the second 5 minutes (V2, :364)
    const apgar = page.locator('p', { hasText: '5 minutes after birth' }).locator('input[type=text]');
    await apgar.nth(0).fill('8');
    await apgar.nth(1).fill('7');
    await page.locator('#outcome-admission').getByLabel('Discharged', { exact: true }).check();
    await save(page);
    await expect(page).toHaveURL(/referenceapplication\/home\.page/);

    const encounters = await getPatientEncounters(api, context.patient.uuid);
    expect(encounters.map((e) => e.encounterType.uuid)).toEqual([SCBU_REGISTER_ENCOUNTER_TYPE_UUID]);
    expect(await obsSummary(api, encounters[0].uuid)).toEqual(
      expect.arrayContaining(['Type of referral role=Nurse', 'APGAR score at 5 minutes=7']),
    );
  });
});
