import type { APIRequestContext, Page } from '@playwright/test';
import { type EntryContext, test, expect, birthdateYearsAgo } from '../../core';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import { EntryFormPage, expectViewShowsSavedObs, VISIT_PAGE_URL } from '../../pages';

// surgicalPostOpNote.xml: "Surgical Note" (service team, description of the operation, ins/outs, plan). A top-level form: the specs
// open enterHtmlFormWithStandardUi inside a visit they create for a 30-year-old female (documentation/_availability.e2e.md:
// enableSurgery, "Surgery Note Location" session tag, Task: emr.enterSurgicalNote, no patient requirement), so the app-loader gating
// is not exercised. The session location (MCH OPD) lacks the tag: the location select (required) starts empty and every save picks the
// first option. The attending surgeon (required) is an autocomplete: a save picks its first suggestion without reading it.
// The form ends with <submit> (no #submit: use #buttons input.submitButton).
//
// Conditions in the form, from documentation inventory (surgicalPostOpNote.inv.md):
//   ifMode VIEW include=false :231,:251,:649   heading, "C-section: also complete Labour and Delivery" notice, buttons: ENTER/EDIT only
//   when #transfusion = Yes        :497   show #type-transfusion (whole blood / packed red cells / plasma / platelets + volume)
//   when #pre-op-antibiotic = Yes  :539   show #pre-antibiotic-name (antibiotic checkboxes)
// Sub-form (documentation/_shared.e2e.md): pregnancy-group-widget (:365, with $pregGroupViewOnly = true so no A/B/C radio is offered; the
//   "previous group" line needs a pregnancy enrolment and an earlier PIH:21747 obs: shared, not covered).
//
// Scripts: :217-227 auto-sizes the textareas on keyup ("avoid scrollbars and facilitate printing"): it listens on #post-op-surgical-note (V1).
// Side effects on save: none (no postSubmissionAction, program, disposition or order).
// VIEW (viewEncounterWithHtmlForm getAsHtml.action) is covered by the 'VIEW:' test (and the save test): the obs groups (IVF, transfusion), the dates and
// the provider/location. Not covered here: EDIT, the pregnancy-group line, the ivf/antibiotic volumes beyond one.
//
// Findings:
//   V1 Low  :220,:225  jq('#post-op-surgical-note') matches nothing (the root is id="surgical-note", no such element): the textareas never grow, the long
//                      findings/instructions keep a scrollbar. Fix: use an element that exists (e.g. wrap the form in a div with that id). TESTED below (test.fixme).
//   V2 Low  :479,:482  CIEL:74653 (Dextran) is rendered twice in the IVF list: two "Dextran" checkboxes, each with its own volume and obsgroup.
//                      Fix: drop one (:482 probably meant another fluid).
//   V3 Low  :563       "Surgery antibiotics" offers CIEL:81951 = Phenobarbital (an anticonvulsant, not an antibiotic); intended concept
//                      unconfirmed. Fix: the intended antibiotic.
//   see V2/V3 in VIEW: with Dextran saved once, the VIEW shows it once (the second row is an empty group, hidden); "Phenobarbital" is listed as an
//                      antibiotic in the VIEW too (tested below).

const FORM = 'surgicalPostOpNote.xml';
const SAVE = '#buttons input.submitButton';

// The attending field: the first provider autocomplete of "Service / Team".
const attending = (page: Page) => page.locator('p', { has: page.getByText('Attending surgeon') }).locator('input[type=text]').first();

const row = (page: Page, text: string) => page.locator('p', { hasText: text });

// Types two letters and clicks the first suggestion; the suggestion text is never read.
const pickAttending = async (page: Page) => {
  await attending(page).pressSequentially('an', { delay: 100 });
  const first = page.locator('ul.ui-autocomplete li:visible').first();
  await expect(first).toBeVisible();
  await first.click();
};

// "<concept>=<value>" for each obs of the encounter (coded values by their name).
const obsSummary = async (api: APIRequestContext, encounterUuid: string): Promise<string[]> =>
  (await getEncounterObs(api, encounterUuid)).map((o) => {
    const v = o.value as { display?: string } | string | number;
    return `${o.concept.display}=${typeof v === 'object' && v !== null ? v.display : v}`;
  });

test.describe('surgicalPostOpNote', () => {
  let context: EntryContext;

  test.beforeEach(async ({ page, createEntryContext }) => {
    context = await createEntryContext({
      givenName: 'AutoSurg',
      familyName: 'Tester',
      gender: 'F',
      birthdate: birthdateYearsAgo(30),
    });
    await EntryFormPage.open(page, FORM, context);
    await expect(page.locator(SAVE)).toBeVisible();
  });

  test('when :497: transfusion Yes shows the transfusion types, No hides them', async ({ page }) => {
    const target = page.locator('#type-transfusion');
    await expect(target).toBeHidden();
    await page.locator('#transfusion').getByLabel('yes').check();
    await expect(target).toBeVisible();
    await page.locator('#transfusion').getByLabel('no', { exact: true }).check();
    await expect(target).toBeHidden();
  });

  test('when :539: pre-operative antibiotic Yes shows the antibiotic names, No hides them', async ({ page }) => {
    const target = page.locator('#pre-antibiotic-name');
    await expect(target).toBeHidden();
    await page.locator('#pre-op-antibiotic').getByLabel('yes').check();
    await expect(target).toBeVisible();
    await page.locator('#pre-op-antibiotic').getByLabel('no', { exact: true }).check();
    await expect(target).toBeHidden();
  });

  test('the pregnancy-group widget is read-only here: no group A/B/C radio is offered (:364)', async ({ page }) => {
    // The only radios of "Description" are admission status, emergency, planned return, scheduled, anaesthesia and wound class.
    await expect(page.locator('#description input[type=radio]')).toHaveCount(2 + 2 + 2 + 2 + 9 + 4);
  });

  test('saving without location and attending surgeon is refused', async ({ page, api }) => {
    // required location (encounterLocation, :278) and required attending (:294)
    await page.locator(SAVE).click();
    await expect(page.locator('#encounterLocation .field-error')).toHaveText(/required/i);
    await expect(page.locator('p', { has: page.getByText('Attending surgeon') }).locator('.field-error')).toHaveText('Required');
    await expect(page).not.toHaveURL(VISIT_PAGE_URL);
    expect(await getPatientEncounters(api, context.patient.uuid)).toHaveLength(0);
  });

  // V1 (Low): the script listens on #post-op-surgical-note, which does not exist. Intended: a textarea grows with its text.
  // Remove test.fixme() when the selector is fixed.
  test('a findings textarea grows with its text (V1)', async ({ page }) => {
    test.fixme();
    const area = page.locator('#additional-comments textarea');
    const before = (await area.boundingBox())?.height ?? 0;
    await area.fill(Array.from({ length: 12 }, (_, i) => `line ${i + 1}`).join('\n'));
    await area.press('x');
    await expect.poll(async () => (await area.boundingBox())?.height ?? 0).toBeGreaterThan(before);
  });

  test('saves the team, description, fluids, transfusion, antibiotic and plan', async ({ page, api }) => {
    await page.locator('#encounterLocation select').selectOption({ index: 1 });
    await pickAttending(page);
    await page.locator('#service-team select').nth(1).selectOption({ index: 1 }); // Surgical service (the first select is the location)
    await page.getByLabel('Hospitalized', { exact: true }).check();
    await row(page, 'Emergency/Urgent').getByLabel('yes').check();
    await page.getByLabel('General anesthesia', { exact: true }).check();
    await page.getByLabel('Clean', { exact: true }).check();
    await row(page, 'Dextrose 10% in water').locator('input[type=checkbox]').check();
    await row(page, 'Dextrose 10% in water').locator('input[type=text]').fill('500');
    await page.locator('#transfusion').getByLabel('yes').check();
    await row(page, 'Whole blood').locator('input[type=checkbox]').check();
    await row(page, 'Whole blood').locator('input[type=text]').fill('2');
    await page.locator('#pre-op-antibiotic').getByLabel('yes').check();
    await page.getByLabel('Cefazolin', { exact: true }).check();
    await page.locator('#additional-comments textarea').fill('Uncomplicated');
    await page.locator('#instructions textarea').fill('Remove stitches in 7 days');
    await page.locator(SAVE).click();
    await new EntryFormPage(page, FORM).expectSaved();

    const encounters = await getPatientEncounters(api, context.patient.uuid);
    expect(encounters).toHaveLength(1);
    expect(await obsSummary(api, encounters[0].uuid)).toEqual(
      expect.arrayContaining([
        'Type of patient=Hospitalized',
        'Emergency=Yes',
        'Type of anesthesia=General anesthesia',
        'Classifications of surgical wounds=Clean',
        'Transfusion status=Yes',
        'Pre-operative antibiotic administered=Yes',
        'Surgery antibiotics=Cefazolin',
        'Additional surgery comments=Uncomplicated',
        'Instructions to patient and/or family=Remove stitches in 7 days',
        'Intravenous fluids administered=Dextrose 10% in water',
        'IVF volume (mL)=500',
        'Type of transfusion fluid=Whole blood',
        'Volume of transfusion=2',
      ]),
    );
    await expectViewShowsSavedObs(page, api, FORM, encounters[0].uuid);
  });

  // VIEW: every saved value is a span.value, the obs groups (IVF, transfusion) only show when they have data, and the dates print as dd MMM yyyy.
  test('VIEW: shows the team, the description, the fluids and the plan that were saved, and nothing for the rest', async ({ page, api }) => {
    await page.locator('#encounterLocation select').selectOption({ index: 1 });
    const locationName = (await page.locator('#encounterLocation select option:checked').innerText()).trim();
    await pickAttending(page);
    const attendingName = (await attending(page).inputValue()).replace(/\s*\(.*\)\s*$/, '').trim(); // the field reads "Name (identifier)", the VIEW the name
    await page.locator('#service-team select').nth(1).selectOption({ index: 1 });
    const service = (await page.locator('#service-team select').nth(1).locator('option:checked').innerText()).trim();
    await page.getByLabel('Hospitalized', { exact: true }).check();
    await row(page, 'Emergency/Urgent').getByLabel('yes').check();
    await row(page, 'Planned return').getByLabel('no', { exact: true }).check();
    await page.getByLabel('General anesthesia', { exact: true }).check();
    await page.getByLabel('Clean', { exact: true }).check();
    const dextran = row(page, 'Dextran').first(); // V2: the form lists Dextran twice
    await dextran.locator('input[type=checkbox]').check();
    await dextran.locator('input[type=text]').fill('250');
    await row(page, 'Dextrose 10% in water').locator('input[type=checkbox]').check();
    await row(page, 'Dextrose 10% in water').locator('input[type=text]').fill('500');
    await page.locator('#transfusion').getByLabel('yes').check();
    await row(page, 'Whole blood').locator('input[type=checkbox]').check();
    await row(page, 'Whole blood').locator('input[type=text]').fill('2');
    await page.locator('#pre-op-antibiotic').getByLabel('yes').check();
    await page.getByLabel('Cefazolin', { exact: true }).check();
    await page.getByLabel('Phenobarbital', { exact: true }).check(); // V3
    await page.locator('#additional-comments textarea').fill('Uncomplicated');
    await page.locator('#instructions textarea').fill('Remove stitches in 7 days');
    await row(page, 'Drainage removal date').locator('input.hasDatepicker').evaluate((el) => {
      const jq = (window as any).jQuery;
      jq(el).datepicker('setDate', new Date(2030, 0, 10));
      jq(el).closest('span').find('input[type=hidden]').change();
    });
    await page.locator(SAVE).click();
    await new EntryFormPage(page, FORM).expectSaved();
    const [encounter] = await getPatientEncounters(api, context.patient.uuid);

    const view = await expectViewShowsSavedObs(page, api, FORM, encounter.uuid, { 'Date to remove drainage: 2030-01-10': '10 Jan 2030' }); // a date-only value
    const shown = await view.valueTexts();
    const today = new Date();
    const date = `${String(today.getDate()).padStart(2, '0')} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][today.getMonth()]} ${today.getFullYear()}`;
    for (const expected of [
      date, // the date of surgery
      locationName,
      service,
      attendingName,
      '[X] Hospitalized',
      '[X] yes', // emergency, transfusion, pre-operative antibiotic
      '[X] no', // planned return
      '[X] General anesthesia',
      '[X] Clean',
      '[X] Dextran',
      '250',
      '[X] Dextrose 10% in water',
      '500',
      '[X] Whole blood',
      '2',
      '[X] Cefazolin',
      '[X] Phenobarbital', // V3: listed as an antibiotic
      'Uncomplicated',
      'Remove stitches in 7 days',
    ]) {
      expect(shown, expected).toContain(expected);
    }
    // the obs groups only show when they have data: one Dextran (V2: the second row of the form is an empty group), no other fluid, one transfusion type
    expect(shown.filter((t) => t === '[X] Dextran')).toHaveLength(1);
    await expect(page.locator('.emptyValue', { hasText: 'Dextran' })).toHaveCount(0);
    await expect(page.locator('#ins-outs .value')).toHaveText([
      '[X] Dextran',
      '250',
      '[X] Dextrose 10% in water',
      '500',
      '[X] yes',
      '[X] Whole blood',
      '2',
      '[X] yes',
      '[X] Cefazolin',
      '[X] Phenobarbital',
    ]);
    await expect(page.locator('.emptyValue', { hasText: 'Plasma' })).toHaveCount(0);
    // the drainage removal date is printed as dd MMM yyyy, the stitches removal date stays empty
    await expect(row(page, 'Drainage removal date').locator('.value')).toHaveText('10 Jan 2030');
    await expect(row(page, 'Stitches removal date').locator('.value')).toHaveCount(0);
    // what was not answered shows no value
    await expect(row(page, 'Scheduled/Elective').locator('.value')).toHaveCount(0);
    await expect(row(page, 'Complications from anaesthesia').locator('.value')).toHaveCount(0);
    expect(shown).not.toContain('[X] Ambulatory');
    await expect(page.locator('#buttons, h2, textarea, select, input[type=text], input[type=radio], input[type=checkbox]')).toHaveCount(0); // read-only
  });
});
