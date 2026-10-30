import type { APIRequestContext, Locator, Page } from '@playwright/test';
import { type EntryContext, test, expect, birthdateYearsAgo } from '../../core';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import { EntryFormPage, expectViewShowsSavedObs, selectDefaultProvider, VISIT_PAGE_URL } from '../../pages';

// gainMaternalRegister.xml: "Maternity and Delivery Register" (GAIN): one page with admission, labour, delivery, newborn
// condition, diagnoses, family planning, maternal outcome (disposition) and "Delivery conducted by". A top-level form: the
// specs open enterHtmlFormWithStandardUi inside a visit they create for a 25-year-old woman, so availability
// (documentation/_availability.e2e.md: enableMCHGainMaternal, enterMCH, "Maternal and Child Location" session tag, female
// >= 10) is not exercised. Note that availability lists it as NOT offered: no site lists mchGAINMaternal, so the form is
// only reachable by URL. The session location (MCH OPD) carries the form's location tag (:44), so the location select
// defaults to it.
//
// Conditions in the form, from documentation inventory (gainMaternalRegister.inv.md):
//   ifMode VIEW include=false  :35, :330  heading and #buttons exist in ENTER/EDIT only
//   when CIEL:1573 = CIEL:5622 :316  "HCW Cadre" = Other shows #other-role (PIH:14415 free text)
// Sub-form (documentation/_shared.e2e.md): encounter-provider-location-date, with its date widget replaced by an empty span
// (:46-48) because the date is collected in "Maternal outcome" (:291).
//
// Scripts: none of its own.
// Side effects on save: postSubmissionAction ApplyDispositionAction (:21) with the encounterDisposition widget (:296); left
// on its default here (transfer / death dispositions are not exercised).
// VIEW (end of the save test, and the last test): every saved value is shown under the form's own label ("Sex" M/F), the date and time obs as a
// date and a time, the encounter date appears once (under "Maternal outcome"), the "Other" cadre shows its specify text, and what was left blank is not.
// Not covered here: the disposition actions, diagnosis autocomplete (:231, :251), EDIT mode.
//
// Findings: only duplicate id="when" :286 (_shared V10).

const FORM = 'gainMaternalRegister.xml';
const MATERNAL_REGISTER_ENCOUNTER_TYPE_UUID = '9cc89b83-e32f-410a-947d-aeb3bda37571';

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

test.describe('gainMaternalRegister', () => {
  let context: EntryContext;

  const open = async (page: Page) => {
    await EntryFormPage.open(page, FORM, context);
    await expect(page.locator('#buttons input.submitButton')).toBeVisible();
  };

  test.beforeEach(async ({ createEntryContext }) => {
    context = await createEntryContext({
      givenName: 'AutoGainMat',
      familyName: 'Tester',
      gender: 'F',
      birthdate: birthdateYearsAgo(25),
    });
  });

  test('"HCW Cadre" = Other shows the free-text role, any other cadre hides it', async ({ page }) => {
    // when :316 (CIEL:1573 = CIEL:5622 -> #other-role)
    await open(page);
    await expect(page.locator('#other-role')).toBeHidden();
    await page.locator('#hcw-cadre').getByLabel('Other', { exact: true }).check();
    await expect(page.locator('#other-role')).toBeVisible();
    await page.locator('#hcw-cadre').getByLabel('Midwife', { exact: true }).check();
    await expect(page.locator('#other-role')).toBeHidden();
  });

  test('the date widget of the shared sub-form is replaced: only "Maternal outcome" has an encounter date', async ({ page }) => {
    // :46-48 blanks encounter-date-widget; :291 is the only date input of the encounter
    await open(page);
    await expect(page.locator('span#encounterDate')).toHaveCount(1);
    await expect(page.locator('#adt span#encounterDate')).toHaveCount(1);
  });

  test('the location defaults to the session location and is required', async ({ page, api }) => {
    await open(page);
    await expect(page.locator('#encounterLocation select')).not.toHaveValue('');
    await page.locator('#encounterLocation select').selectOption({ index: 0 });
    await selectDefaultProvider(page);
    await save(page);
    await expect(page.locator('#encounterLocation span.field-error')).toHaveText('required');
    await expect(page).toHaveURL(/enterHtmlFormWithStandardUi/);
    expect(await getPatientEncounters(api, context.patient.uuid)).toHaveLength(0);
  });

  test('saving fills the register encounter with the entered obs', async ({ page, api }) => {
    await open(page);
    await page.locator('#delivery-section').getByLabel('Normal', { exact: true }).check();
    await page.locator('#newborn').getByLabel('F', { exact: true }).check();
    await page.locator('#newborn p', { hasText: '(Birth) Weight' }).locator('input[type=text]').fill('3.2');
    await page.locator('#hcw input[type=text]').first().fill('Auto Midwife');
    await page.locator('#hcw-cadre').getByLabel('Midwife', { exact: true }).check();
    await selectDefaultProvider(page);
    await save(page);
    await expect(page).toHaveURL(VISIT_PAGE_URL);

    const encounters = await getPatientEncounters(api, context.patient.uuid);
    expect(encounters.map((e) => e.encounterType.uuid)).toEqual([MATERNAL_REGISTER_ENCOUNTER_TYPE_UUID]);
    expect(await obsSummary(api, encounters[0].uuid)).toEqual(
      expect.arrayContaining([
        'Type of delivery=Spontaneous vaginal delivery',
        'Child gender=Female',
        'Birth weight (kg)=3.2',
        'Name of clinician (text)=Auto Midwife',
        'Delivery assistant=Midwife',
      ]),
    );
    const view = await expectViewShowsSavedObs(page, api, FORM, encounters[0].uuid, {
      'Child gender: Female': 'F',
      'Type of delivery: Spontaneous vaginal delivery': 'Normal',
    });
    // (the labels are short: check them as whole selected options too; the date is the encounter date under "Maternal outcome")
    const now = new Date();
    const today = `${String(now.getDate()).padStart(2, '0')} ${now.toLocaleString('en', { month: 'short' })} ${now.getFullYear()}`;
    expect(await view.valueTexts()).toEqual(['[X] Normal', '[X] F', '3.2', today, 'Auto Midwife', '[X] Midwife']);
  });

  // The date and time widgets: a read-only datepicker plus hour and minute selects (enabled once a date is chosen).
  const setDateTime = async (page: Page, row: Locator, date: Date, hour: number, minute: number) => {
    await row.locator('input.hasDatepicker').evaluate(
      (el, [y, m, d]) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).jq(el).datepicker('setDate', new Date(y, m, d));
        (window as any).jq(el).trigger('change'); // enables the hour and minute selects
      },
      [date.getFullYear(), date.getMonth(), date.getDate()],
    );
    await row.locator('select.hfe-hours').selectOption(String(hour));
    await row.locator('select.hfe-minutes').selectOption(String(minute));
  };

  // VIEW: every saved value is shown, the date and time obs as a date and a time, and the "Other" cadre shows its specify text.
  test('VIEW: shows the saved admission, labour, delivery, newborn and cadre answers, the dates and times, and nothing for what was left blank', async ({
    page,
    api,
  }) => {
    const yesterday = new Date(Date.now() - 86400000);
    const day = `${String(yesterday.getDate()).padStart(2, '0')} ${yesterday.toLocaleString('en', { month: 'short' })} ${yesterday.getFullYear()}`;
    await open(page);
    await setDateTime(page, page.locator('#intake p.date-one-line'), yesterday, 9, 30);
    await page.locator('#intake p', { hasText: 'Gravida' }).locator('input').first().fill('3');
    await page.locator('#intake p', { hasText: 'Parity' }).locator('input').first().fill('2');
    await page.locator('#intake p', { hasText: 'Gestational age' }).locator('input').first().fill('38.4');
    await page.locator('#intake input[type=checkbox]').first().check(); // PAC type
    await setDateTime(page, page.locator('#labor p.date-one-line'), yesterday, 12, 45);
    await page.locator('#labor input[type=radio]').first().check(); // presentation
    await page.locator('#labor input[type=text]:visible').last().fill('Face to pubes');
    await setDateTime(page, page.locator('#delivery-section p.date-one-line'), yesterday, 3, 5);
    await page.locator('#delivery-section').getByLabel('Assisted (vacuum or instrument)', { exact: true }).check();
    await page.locator('#delivery-section').getByLabel('FSB', { exact: true }).check();
    await page.locator('#delivery-section input[type=radio]').nth(6).check(); // partograph used: yes
    await page.locator('#delivery-section input[type=radio]').nth(9).check(); // uterotonic: no
    await page.locator('#newborn').getByLabel('M', { exact: true }).check();
    await page.locator('#newborn p', { hasText: '(Birth) Weight' }).locator('input[type=text]').fill('3.2');
    await page.locator('#newborn p', { hasText: 'APGAR' }).locator('input[type=text]').fill('8');
    await page.locator('#postpartum-fp input[type=radio]').nth(0).check(); // counselled: yes
    await page.locator('#initial-diagnosis-non-coded input').fill('Initial free text');
    await page.locator('#final-diagnosis-non-coded input').fill('Final free text');
    await page.locator('#hcw input[type=text]').first().fill('Auto Midwife');
    await page.locator('#hcw-cadre').getByLabel('Other', { exact: true }).check();
    await page.locator('#other-role input').fill('Traditional birth attendant');
    await selectDefaultProvider(page);
    await save(page);
    await expect(page).toHaveURL(VISIT_PAGE_URL);
    const [encounter] = await getPatientEncounters(api, context.patient.uuid);

    const view = await expectViewShowsSavedObs(page, api, FORM, encounter.uuid, {
      'Child gender: Male': 'M',
      'Type of delivery: Assistance required': 'Assisted (vacuum or instrument)',
      'Qualitative birth outcome: Fresh stillbirth': 'FSB',
    });
    const shown = await view.valueTexts();
    for (const expected of [
      '3',
      '2',
      '38.4',
      '[X] Misoprostol', // PAC type
      '[X] Breech presentation',
      'Face to pubes',
      '[X] Assisted (vacuum or instrument)',
      '[X] FSB',
      '[X] M',
      '3.2',
      '8',
      'Initial free text',
      'Final free text',
      'Auto Midwife',
      '[X] Other',
      'Traditional birth attendant',
    ]) {
      expect(shown, expected).toContain(expected);
    }
    // the date and time obs are shown as a date and a 12-hour time (admission, labour start and delivery), and the encounter date under "Maternal outcome"
    expect(shown.filter((t) => t === day)).toHaveLength(3);
    for (const time of ['9:30 AM', '12:45 PM', '3:05 AM']) {
      expect(shown, time).toContain(time);
    }
    await expect(view.page.locator('#adt #encounterDate .value')).toHaveCount(1);
    // the newborn "Alive" and "Breastfeeding" questions and the second postpartum question were not answered
    await expect(view.page.locator('#newborn p', { hasText: 'Alive' }).locator('.value')).toHaveCount(0);
    await expect(view.page.locator('#newborn p', { hasText: 'Breastfeeding' }).locator('.value')).toHaveCount(0);
    await expect(view.page.locator('#postpartum-fp .value')).toHaveCount(1);
    await expect(view.page.locator('#hcw #other-role .value')).toHaveText('Traditional birth attendant');
  });
});
