import type { APIRequestContext, Page } from '@playwright/test';
import { type EntryContext, test, expect, birthdateYearsAgo } from '../../core';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import { EntryFormPage, expectViewShowsSavedObs, selectDefaultProvider, VISIT_PAGE_URL } from '../../pages';

// triage.xml: "MCOE Triage" (National Obstetric Triage and Treatment Form): referral, transport, gestational age, vitals with
// a colour-coded triage priority, a symptom matrix (green/yellow/orange/red), TB screening, rapid tests, PHQ-2, disposition.
// A top-level form: the specs open enterHtmlFormWithStandardUi inside a visit they create for a 25-year-old female, so availability
// (documentation/_availability.e2e.md: enableMCHTriage, "MCH Triage Location" session tag, Task: emr.triage, female >= 10, no
// MCH-triage encounter in the visit) is not exercised. The session location (MCH OPD) lacks the tag, so the location select starts
// empty and every save picks the first option; the provider select (required) also starts empty and is picked by index.
// The form uses its own <button class="submitButton"> (no #submit): use #buttons button.submitButton.
//
// Conditions in the form, from documentation inventory (triage.inv.md):
//   ifMode VIEW include=false :150,:285,:600   script, status bar + title + provider/location/date, buttons: ENTER/EDIT only
//   when referral form received (checkbox) :328       show #refForm (file upload)
//   when #role-refer = PHU / CHW / TBA   :350-352    show #refer-date; = Other :353  show #other-referee (Self-refer shows neither)
//   when #transport = other              :400        show #other-transport
//   when #complaints = other             :565        show #other-complain
// Sub-forms (documentation/_shared.e2e.md): encounter-provider-location-date, vital-signs-widget (+ .js scoring, #confirmMsg, #contactDr),
// tb-symptom-screening-widget (.js + .xml, V15), lab-results-section / rapid-tests-widget, mental-health-phq2. Not repeated here.
//
// Scripts (:151-281, ENTER/EDIT):
//   calculateTriagePriority() (on every .obs-field change and on load) = max(evaluateVitals() from the vitals widget, evaluateSymptoms());
//     sets #sticky to triage-label-green/yellow/orange or triage-dark-red and #statusMessage to Normal / Prompt / Urgent / STAT.
//     evaluateSymptoms(): any ticked .redObs -> STAT, else any .orangeObs -> Urgent, else any .yellowObs -> Prompt, else Normal (greenObs ignored).
//   validateForm() (on document change and click): Save is enabled only when every visible select/input in #disposition has a value
//     (Admission shows a required location select) and the vitals widget does not require "contact the doctor" (drContactRequiredAndMissing).
//   evaluateIsolationStatus(): duplicate of tb-symptom-screening-widget.js: #isolationMsg shows when all four TB radios are "yes".
// Side effects on save: none beyond the obs (no postSubmissionAction, no program, no order; Disposition is only recorded).
// VIEW (viewEncounterWithHtmlForm getAsHtml.action) is covered by the 'VIEW:' test and the save test: the status bar, title and provider/location/date
// are not rendered in VIEW (ifMode VIEW include=false :285), so the VIEW has no triage priority; the page scripts do not run in it.
// Not covered here: the vitals colours per range, the lab results / rapid tests and PHQ-2 (shared), the file upload, Admission / Transfer
// dispositions (saved), EDIT mode.
//
// Findings:
//   V1 Low :152,:241-265  the TB isolation logic is written twice (inline here and in tb-symptom-screening-widget.js), so each radio change
//                         runs it twice; harmless today. Fix: drop the copy in triage.xml.
//   see _shared V2  vital-signs-widget.js enableSubmitButton() on every vitals blur overrides validateForm(): after tabbing out of a vital the
//                         Save button is enabled with no disposition chosen (the server-side "required" still refuses the save).
//                         TESTED below (test.fixme). see _shared V15 for the TB message: checked here, the rule holds as written (all four).

const FORM = 'triage.xml';
const SAVE = '#buttons button.submitButton';

// Pick provider and location (both required, both start empty): by index, the options are not read.
const pickProviderAndLocation = async (page: Page) => {
  await selectDefaultProvider(page);
  await page.locator('#encounterLocation select').selectOption({ index: 1 });
};

const fillVital = async (page: Page, id: string, value: string) => {
  await page.locator(`#${id} input`).fill(value);
  await page.keyboard.press('Tab');
};

// Obs that the form labels differently from their concept (answerCode / TB row labels) in the VIEW, "obs display" -> what the VIEW shows.
const VIEW_LABELS: Record<string, string> = {
  'Triage diagnosis or symptom: Normal labor': '[X] Labour signs (37+ weeks)',
  'Triage diagnosis or symptom: Active labour greater than 34 weeks gestation': '[X] Active labour',
  'Triage diagnosis or symptom: Seizure': '[X] Convulsing',
  'TB symptom present: Cough > 2 weeks': '[X] yes',
  'TB symptom present: Fever': '[X] yes',
  'TB symptom present: Weight loss (kg)': '[X] yes',
  'TB symptom absent: Night sweats': '[X] no',
  'Disposition categories: Discharged': 'Discharge',
};

const tbRow = (page: Page, row: number) => page.locator('.tbScreen > div').nth(row);

// "<concept>=<value>" for each obs of the encounter (coded values by their name).
const obsSummary = async (api: APIRequestContext, encounterUuid: string): Promise<string[]> =>
  (await getEncounterObs(api, encounterUuid)).map((o) => {
    const v = o.value as { display?: string } | string | number;
    return `${o.concept.display}=${typeof v === 'object' && v !== null ? v.display : v}`;
  });

test.describe('triage', () => {
  let context: EntryContext;

  test.beforeEach(async ({ page, createEntryContext }) => {
    context = await createEntryContext({
      givenName: 'AutoTriage',
      familyName: 'Tester',
      gender: 'F',
      birthdate: birthdateYearsAgo(25),
    });
    await EntryFormPage.open(page, FORM, context);
    await expect(page.locator(SAVE)).toBeVisible(); // handlers are bound on document.ready
  });

  // Each row: how to show the target and (optionally) how to hide it again.
  const whens: Array<{ line: string; name: string; target: string; show: (p: Page) => Promise<void>; hide?: (p: Page) => Promise<void> }> = [
    {
      line: ':328',
      name: 'referral form received shows the upload field',
      target: '#refForm',
      show: async (p) => {
        await p.locator('#referral-received input[type=checkbox]').check();
      },
      hide: async (p) => {
        await p.locator('#referral-received input[type=checkbox]').uncheck();
      },
    },
    {
      line: ':350',
      name: 'referral from a Peripheral Health Unit shows the referral date',
      target: '#refer-date',
      show: async (p) => {
        await p.locator('#role-refer').getByLabel('Peripheral Health Unit').check();
      },
      hide: async (p) => {
        await p.locator('#role-refer').getByLabel('Self-refer').check();
      },
    },
    {
      line: ':351',
      name: 'referral from a CHW shows the referral date',
      target: '#refer-date',
      show: async (p) => {
        await p.locator('#role-refer').getByLabel('CHW (Community Health Worker)').check();
      },
    },
    {
      line: ':352',
      name: 'referral from a TBA shows the referral date',
      target: '#refer-date',
      show: async (p) => {
        await p.locator('#role-refer').getByLabel('Traditional birth attendant (TBA)').check();
      },
    },
    {
      line: ':353',
      name: 'referral from "Other" shows the specify field (and not the date)',
      target: '#other-referee',
      show: async (p) => {
        await p.locator('#role-refer').getByLabel('Other', { exact: true }).check();
        await expect(p.locator('#refer-date')).toBeHidden();
      },
      hide: async (p) => {
        await p.locator('#role-refer').getByLabel('Self-refer').check();
      },
    },
    {
      line: ':400',
      name: 'transport "other" shows the specify field',
      target: '#other-transport',
      show: async (p) => {
        await p.locator('#transport').getByLabel('other', { exact: true }).check();
      },
      hide: async (p) => {
        await p.locator('#transport').getByLabel('walking', { exact: true }).check();
      },
    },
    {
      line: ':565',
      name: 'other complaints "other" shows the specify field',
      target: '#other-complain',
      show: async (p) => {
        await p.locator('#complaints').getByLabel('other', { exact: true }).check();
      },
      hide: async (p) => {
        await p.locator('#complaints').getByLabel('nausea/vomiting', { exact: true }).check();
      },
    },
  ];

  for (const w of whens) {
    test(`when ${w.line}: ${w.name}`, async ({ page }) => {
      await expect(page.locator(w.target)).toBeHidden();
      await w.show(page);
      await expect(page.locator(w.target)).toBeVisible();
      await w.hide?.(page);
      if (w.hide) {
        await expect(page.locator(w.target)).toBeHidden();
      }
    });
  }

  // Priority = max(vitals, symptoms). Vital ranges are the shared widget's (SBP 150 yellow, HR 45 orange, SBP 160 red).
  const priorities: Array<{ name: string; vital?: [string, string]; symptoms?: string[]; message: string; colour: string }> = [
    { name: 'no input is Normal (green)', message: 'Normal', colour: 'triage-label-green' },
    { name: 'a green symptom stays Normal', symptoms: ['Pregnancy discomfort'], message: 'Normal', colour: 'triage-label-green' },
    { name: 'a yellow symptom is Prompt', symptoms: ['Active labour'], message: 'Prompt', colour: 'triage-label-yellow' },
    { name: 'an orange symptom is Urgent', symptoms: ['High-risk pregnancy'], message: 'Urgent', colour: 'triage-label-orange' },
    { name: 'a red symptom is STAT', symptoms: ['Convulsing'], message: 'STAT', colour: 'triage-dark-red' },
    { name: 'a yellow and an orange symptom are Urgent', symptoms: ['Active labour', 'High-risk pregnancy'], message: 'Urgent', colour: 'triage-label-orange' },
    { name: 'a yellow vital is Prompt', vital: ['bp_systolic', '150'], message: 'Prompt', colour: 'triage-label-yellow' },
    { name: 'an orange vital is Urgent', vital: ['heart_rate', '45'], message: 'Urgent', colour: 'triage-label-orange' },
    { name: 'a red vital is STAT', vital: ['bp_systolic', '160'], message: 'STAT', colour: 'triage-dark-red' },
    { name: 'orange symptom beats a yellow vital', vital: ['bp_systolic', '150'], symptoms: ['High-risk pregnancy'], message: 'Urgent', colour: 'triage-label-orange' },
    { name: 'red vital beats a yellow symptom', vital: ['bp_systolic', '160'], symptoms: ['Active labour'], message: 'STAT', colour: 'triage-dark-red' },
  ];

  for (const p of priorities) {
    test(`script :184: ${p.name}`, async ({ page }) => {
      if (p.vital) {
        await fillVital(page, p.vital[0], p.vital[1]);
      }
      for (const symptom of p.symptoms ?? []) {
        await page.getByLabel(symptom, { exact: true }).check();
      }
      await expect(page.locator('#statusMessage')).toHaveText(p.message);
      await expect(page.locator('#sticky')).toHaveClass(new RegExp(`\\b${p.colour}\\b`));
    });
  }

  test('script :198: Save follows the disposition (Admission also needs its location)', async ({ page }) => {
    const disposition = page.locator('#encounter-disposition select');
    await expect(page.locator(SAVE)).toBeDisabled(); // nothing chosen
    await disposition.selectOption({ label: 'Discharge' });
    await expect(page.locator(SAVE)).toBeEnabled();
    await disposition.selectOption({ label: 'Admission' });
    await expect(page.locator('#admissionLocation select')).toBeVisible();
    await expect(page.locator(SAVE)).toBeDisabled(); // location select is visible and empty
    await page.locator('#admissionLocation select').selectOption({ index: 1 });
    await expect(page.locator(SAVE)).toBeEnabled();
    await disposition.selectOption({ index: 0 });
    await expect(page.locator(SAVE)).toBeDisabled();
  });

  test('script :214: a STAT vital needs "contact the doctor" ticked before Save is enabled', async ({ page }) => {
    await page.locator('#encounter-disposition select').selectOption({ label: 'Discharge' });
    await expect(page.locator(SAVE)).toBeEnabled();
    await fillVital(page, 'bp_systolic', '160');
    await expect(page.locator('#confirmMsg')).toBeVisible(); // shared widget, _shared.e2e.md
    await expect(page.locator(SAVE)).toBeDisabled();
    await page.locator('#contactDr input[type=checkbox]').check();
    await expect(page.locator(SAVE)).toBeEnabled();
  });

  // see _shared V2: vital-signs-widget.js re-enables Save on every vitals blur, ignoring validateForm()'s missing disposition.
  // Tab (no click) is how a keyboard user leaves the field; a mouse click would run validateForm() again. Remove test.fixme() when fixed.
  test('Save stays disabled after tabbing out of a vital with no disposition (_shared V2)', async ({ page }) => {
    test.fixme();
    await expect(page.locator(SAVE)).toBeDisabled();
    await fillVital(page, 'bp_systolic', '120');
    await expect(page.locator(SAVE)).toBeDisabled();
  });

  test('TB isolation message needs all four symptoms "yes" (_shared V15: the documented rule holds)', async ({ page }) => {
    // tb-symptom-screening-widget.js:5-31 and triage.xml:241-265
    const message = page.locator('#isolationMsg');
    await expect(message).toBeHidden();
    for (let row = 0; row < 3; row++) {
      await tbRow(page, row).getByLabel('yes').check();
      await expect(message).toBeHidden(); // 1, 2, 3 symptoms: no message
    }
    await tbRow(page, 3).getByLabel('yes').check();
    await expect(message).toBeVisible(); // 4 of 4
    await tbRow(page, 1).getByLabel('no').check();
    await expect(message).toBeHidden(); // 3 yes + 1 no
    await tbRow(page, 1).getByLabel('yes').check();
    await expect(message).toBeVisible();
  });

  test('saving without the referral source and transport is refused with "Required"', async ({ page, api }) => {
    // required="true" on #role-refer (:347) and #transport (:395)
    await pickProviderAndLocation(page);
    await page.locator('#encounter-disposition select').selectOption({ label: 'Discharge' });
    await page.locator(SAVE).click();
    await expect(page.locator('#role-refer .field-error')).toHaveText('Required');
    await expect(page.locator('#transport .field-error')).toHaveText('Required');
    await expect(page).not.toHaveURL(VISIT_PAGE_URL);
    expect(await getPatientEncounters(api, context.patient.uuid)).toHaveLength(0);
  });

  test('saves the referral, transport, obstetric history, vitals, symptoms, TB screening and disposition', async ({ page, api }) => {
    await pickProviderAndLocation(page);
    await page.locator('#role-refer').getByLabel('Self-refer').check();
    await page.locator('#transport').getByLabel('walking', { exact: true }).check();
    await page.locator('#gestationalAge input').fill('38');
    await page.locator('#gravida input').fill('2');
    await page.locator('#para input').fill('1');
    await page.locator('#chief_complaint input').fill('Abdominal pain');
    await fillVital(page, 'bp_systolic', '120');
    await fillVital(page, 'bp_diastolic', '80');
    await page.getByLabel('Labour signs (37+ weeks)', { exact: true }).check();
    await page.getByLabel('Vaginal bleeding', { exact: true }).check();
    for (let row = 0; row < 4; row++) {
      await tbRow(page, row).getByLabel('yes').check();
    }
    await page.locator('#encounter-disposition select').selectOption({ label: 'Discharge' });
    await page.locator(SAVE).click();
    await new EntryFormPage(page, FORM).expectSaved();

    const encounters = await getPatientEncounters(api, context.patient.uuid);
    expect(encounters).toHaveLength(1);
    const obs = await obsSummary(api, encounters[0].uuid);
    expect(obs).toEqual(
      expect.arrayContaining([
        'Role of referring person=Self-refer',
        'Method of transportation=Walking',
        'Gestational age at delivery, abortion or miscarriage (weeks)=38',
        'Gravida=2',
        'Parity=1',
        'Chief complaint (text)=Abdominal pain',
        'Systolic=120',
        'Diastolic=80',
        'Triage diagnosis or symptom=Normal labor', // "Labour signs (37+ weeks)"
        'Triage diagnosis or symptom=Vaginal bleeding',
        'Disposition categories=Discharged',
      ]),
    );
    // the four TB symptoms are saved as the answers of "TB symptom present"
    expect(obs.filter((o) => o.startsWith('TB symptom present='))).toHaveLength(4);
    await expectViewShowsSavedObs(page, api, FORM, encounters[0].uuid, {
      'Triage diagnosis or symptom: Normal labor': '[X] Labour signs (37+ weeks)',
      'TB symptom present: Cough > 2 weeks': '[X] yes',
      'TB symptom present: Fever': '[X] yes',
      'TB symptom present: Night sweats': '[X] yes',
      'TB symptom present: Weight loss (kg)': '[X] yes',
      'Disposition categories: Discharged': 'Discharge',
    });
  });

  // VIEW: every saved value in a span.value, the other options listed unselected. The form labels the symptoms, the TB rows (yes/no) and the transport
  // itself, so those obs are mapped to what the VIEW shows.
  test('VIEW: shows the referral, transport, vitals, symptoms, TB screening and disposition that were saved, and no triage status', async ({ page, api }) => {
    await pickProviderAndLocation(page);
    await page.locator('#role-refer').getByLabel('Peripheral Health Unit').check();
    await page.locator('#referral-address input').fill('Makeni PHU');
    await page.locator('#referral-phone-number input').fill('076123456');
    await page.locator('#refer-date input.hasDatepicker').click();
    await page.locator('#ui-datepicker-div a.ui-state-default').first().click(); // a past day (the first cell of the calendar)
    const referralDate = await page.locator('#refer-date input.hasDatepicker').inputValue(); // "dd MMM yyyy"
    await page.locator('#refer-date select.hfe-hours').selectOption('8');
    await page.locator('#refer-date select.hfe-minutes').selectOption('15');
    await page.locator('#transport').getByLabel('other', { exact: true }).check();
    await page.locator('#other-transport input').fill('Boat');
    await page.locator('#gestationalAge input').fill('38');
    await page.locator('#gravida input').fill('2');
    await page.locator('#para input').fill('1');
    await page.locator('#chief_complaint input').fill('Abdominal pain');
    await fillVital(page, 'bp_systolic', '150');
    await fillVital(page, 'bp_diastolic', '95');
    await fillVital(page, 'heart_rate', '88');
    await page.getByLabel('Labour signs (37+ weeks)', { exact: true }).check(); // one symptom per colour column, except yellow twice
    await page.getByLabel('Active labour', { exact: true }).check();
    await page.getByLabel('Vaginal bleeding', { exact: true }).check();
    await page.getByLabel('Convulsing', { exact: true }).check();
    await page.locator('#complaints').getByLabel('other', { exact: true }).check();
    await page.locator('#other-complain input').fill('Headache');
    for (let row = 0; row < 4; row++) {
      await tbRow(page, row).getByLabel(row === 2 ? 'no' : 'yes').check(); // night sweats: no
    }
    await page.locator('#encounter-disposition select').selectOption({ label: 'Discharge' });
    await page.locator('#contactDr input[type=checkbox]').check(); // the 150 systolic is a yellow vital, the convulsion a red symptom
    await page.locator(SAVE).click();
    await new EntryFormPage(page, FORM).expectSaved();
    const [encounter] = await getPatientEncounters(api, context.patient.uuid);

    const view = await expectViewShowsSavedObs(page, api, FORM, encounter.uuid, VIEW_LABELS);
    const shown = await view.valueTexts();
    for (const expected of [
      '[X] Peripheral Health Unit',
      'Makeni PHU',
      '076123456',
      referralDate,
      '8:15 AM',
      '[X] other', // transport, other complaints
      'Boat',
      '38',
      'Abdominal pain',
      '150',
      '95',
      '88',
      'Headache',
      'Discharge',
    ]) {
      expect(shown, expected).toContain(expected);
    }
    // each value sits under its own label
    await expect(page.locator('p.side-by-side', { hasText: 'Gravida' }).locator('.value')).toHaveText(['2', '1']);
    await expect(page.locator('#refer-date .value')).toHaveText([referralDate, '8:15 AM']);
    await expect(page.locator('p', { hasText: 'Method of transport' }).locator('.value').first()).toHaveText('[X] other');
    // the symptom matrix: only the ticked symptoms are values, in the columns they belong to
    await expect(page.locator('table .exam .value')).toHaveText(['[X] Labour signs (37+ weeks)', '[X] Active labour', '[X] Vaginal bleeding', '[X] Convulsing']);
    // the TB rows: "no" for night sweats, "yes" for the others
    await expect(tbRow(page, 0).locator('.value')).toHaveText('[X] yes');
    await expect(tbRow(page, 2).locator('.value')).toHaveText('[X] no');
    // not answered / not rendered: the "other referral" text, the lab results, the PHQ-2; the status bar, the title and the buttons are ENTER/EDIT only (:285, :600)
    await expect(page.locator('#other-referee .value')).toHaveCount(0);
    await expect(page.locator('.bordered-section .value, #rapid-tests-widget .value')).toHaveCount(0);
    expect(shown).not.toContain('[X] Pregnancy discomfort');
    await expect(page.locator('#sticky, #statusMessage, #buttons, h2')).toHaveCount(0);
  });
});
