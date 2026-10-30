import type { APIRequestContext, Page } from '@playwright/test';
import { type EntryContext, test, expect } from '../../core';
import { MCH_DELIVERY_ENCOUNTER_TYPE_UUID, MCH_OPD_LOCATION_UUID } from '../../core/constants';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import { EntryFormPage, ViewFormPage, expectViewShowsSavedObs, selectDefaultProvider, VISIT_PAGE_URL } from '../../pages';

// newbornDischarge.xml: discharge of a newborn (vitals, weight, oxygen saturations, treatment, diagnoses, labs, physical
// exam, medication orders, feeding, plan and disposition, appointment). A top-level form: the specs open
// enterHtmlFormWithStandardUi inside a visit they create for an infant born 3 days ago, so availability
// (documentation/_availability.e2e.md: mcoeForms + infantProgram, "Newborn Discharge Location" session tag, enterMCH,
// age < 42 days, no duplicate check) is not exercised. The session location (MCH OPD) is not tagged for this form, so the
// location select starts empty and the save tests pick one (the first option).
//
// Conditions in the form, from documentation inventory (newbornDischarge.inv.md):
//   ifMode VIEW include=false  :127, :149, :191, :234, :252, :264, :277, :657  heading, Overview, prior-value lookups,
//                              the postductal <input> and #buttons exist in ENTER/EDIT only
//   ifMode VIEW include=true   :237, :643  postductal value <span> and the "view appointments" link, VIEW only
//   includeIf $deliveryDate    :155  "Date & time of delivery" (latest earlier CIEL:5599 obs)
//   includeIf $deliveryType    :164  "Type of delivery" (latest earlier PIH:11663 obs)
//   includeIf $priorEyeDrops   :254  "[ x ] <date>" before "Prophylactic eye ointment" (CIEL:1651 = CIEL:168724 earlier in the visit)
//   includeIf $priorCordCare   :266  same for "Umbilical cord care" (CIEL:168725)
//   includeIf $priorSupplement :279  same for "Vitamin K" (PIH:SUPPLEMENT RECEIVED = CIEL:86352)
// Sub-forms (documentation/_shared.e2e.md): encounter-provider-location-date, vital-signs-infant-widget (+ .js scoring),
// drug-order-widget-newborn (+ drug-order-widget).
//
// Scripts: :40-107 (1) calculatePostDuctDiff: on change of a .o2SatValue input and on load, preductal minus postductal
// saturation is written to the disabled #postductalDifference input (no name: not saved) and gets class triage-label-red
// when > 5; viewPostDuctDiff does the same from the .value texts in VIEW. (2) .normalObs/.abnormalObs checkboxes in a
// .exam container untick each other (cord stump, eyes, skin). (3) setUpNextAndSubmitButtons().
// Side effects on save: enrollInProgram Infant (:147, tested), ApplyDispositionAction (:19), drug orders (not saved here),
// scheduleAppointment (declined here: a saved appointment is not purged with the patient).
// VIEW is covered by the last test (a filled form saved, then rendered with viewEncounterWithHtmlForm): every saved value is shown (labels
// from answerCode/answerCodes: "[X] Clean", "[X] Breastfed", "[X] Prophylactic eye ointment"), the first-urination date and time are two values,
// the unselected options are empty, the Overview and the "[ x ] <date>" prior-value lookups (:127-279) are not rendered even though an
// earlier encounter holds them, the post-ductal difference is the span.value of :237 that viewPostDuctDiff fills by script and the appointment is the "View Appointments" link of :643. Drug orders in VIEW are not covered.
// Not covered here: vitals scoring and the Save block (shared, _shared.e2e.md), medication orders (a saved drug order
// cannot be purged), the appointment, diagnosis search, the disposition actions other than Home, EDIT mode.
//
// Findings (duplicate id="when" :153 and id="glucose" :340 are _shared V10):
//   V1 Low  :42-52   clearing one saturation leaves the old difference (and red class) in place: the guard only skips
//                    the update when a value is empty. Fix: clear #postductalDifference when either value is empty. (TESTED)
//   V2 Low  :42-52   Number.isNaN is applied to the strings (always false), so "abc" gives a difference of "NaN". Fix:
//                    convert first, test with Number.isFinite.
//   V3 Info :647     scheduleAppointment optional="true" still blocks the save ("Service is required", ...) until
//                    "Don't schedule appointment" is chosen (TESTED).
//   V4 Info :302     the diagnosis widget is labelled "Add presumed or confirmed diagnosis (required)" but a discharge with
//                    no diagnosis saves (TESTED in the save test).
//   VW1 Medium :395, :422  "Comments about umbilical cord" and "Comments about eyes" are two inputs of one concept (CIEL:168722; the same
//                    as V1 of newbornInitial): a saved obs is bound to the first input of its concept, so a lone eye comment is shown as the
//                    umbilical cord comment in VIEW. TESTED below (test.fixme). Fix: a separate concept for one of them.

const FORM = 'newbornDischarge.xml';

// Birthdate (yyyy-mm-dd) of an infant who is `days` days old today (the harness helper only does whole years).
const birthdateDaysAgo = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
};

// The tagged location list does not contain the session location, so the select starts on "Choose a Location...".
// The provider select is blank too when the logged-in user has no Provider account.
const pickProviderAndLocation = async (page: Page) => {
  await selectDefaultProvider(page);
  await page.locator('#encounterLocation select').selectOption({ index: 1 });
};

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

// An earlier encounter in the same visit holding what the form looks up: delivery date and type (CIEL:5599, PIH:11663),
// eye ointment and cord care (CIEL:1651), vitamin K (PIH:SUPPLEMENT RECEIVED). Created over REST just before the form
// opens, so it is "before the current encounter" and "in the visit".
const createPriorEncounter = async (api: APIRequestContext, context: EntryContext): Promise<void> => {
  const now = new Date().toISOString();
  const res = await api.post('encounter', {
    data: {
      patient: context.patient.uuid,
      encounterType: MCH_DELIVERY_ENCOUNTER_TYPE_UUID,
      location: MCH_OPD_LOCATION_UUID,
      encounterDatetime: now,
      visit: context.visitUuid,
      obs: [
        { concept: 'CIEL:5599', value: now },
        { concept: 'PIH:11663', value: 'CIEL:1170' },
        { concept: 'CIEL:1651', value: 'CIEL:168724' },
        { concept: 'CIEL:1651', value: 'CIEL:168725' },
        { concept: 'PIH:SUPPLEMENT RECEIVED', value: 'CIEL:86352' },
      ],
    },
  });
  expect(res.ok(), `create prior encounter: ${res.status()}`).toBeTruthy();
};

test.describe('newbornDischarge', () => {
  let context: EntryContext;

  const open = async (page: Page) => {
    await EntryFormPage.open(page, FORM, context);
    await expect(page.locator('#buttons input.submitButton')).toBeVisible();
  };

  test.beforeEach(async ({ createEntryContext }) => {
    context = await createEntryContext({
      givenName: 'AutoNewbornD',
      familyName: 'Tester',
      gender: 'M',
      birthdate: birthdateDaysAgo(3),
    });
  });

  test('without earlier data the overview and the treatment checkboxes show no prior values', async ({ page }) => {
    // includeIf :155, :164, :254, :266, :279 are all false
    await open(page);
    await expect(page.locator('#Overview')).not.toContainText('Date & time of delivery');
    await expect(page.locator('#Overview')).not.toContainText('Type of delivery');
    await expect(page.locator('#treatment .prior-obs-value')).toHaveCount(0);
  });

  test('earlier delivery date and type, eye ointment, cord care and vitamin K show as prior values', async ({
    page,
    api,
  }) => {
    // includeIf :155 ($deliveryDate), :164 ($deliveryType), :254 ($priorEyeDrops), :266 ($priorCordCare), :279 ($priorSupplement)
    await createPriorEncounter(api, context);
    await open(page);
    await expect(page.locator('#Overview')).toContainText('Date & time of delivery');
    await expect(page.locator('#Overview')).toContainText('Type of delivery: Spontaneous vaginal delivery');
    // one "[ x ] <date>" marker per ticked earlier treatment; Vitamin D has none
    await expect(page.locator('#treatment .prior-obs-value')).toHaveCount(3);
    for (const treatment of ['Prophylactic eye ointment', 'Umbilical cord care', 'Vitamin K']) {
      await expect(page.locator('#treatment div', { hasText: treatment }).locator('.prior-obs-value').first()).toContainText('[ x ]');
    }
  });

  test.describe('postductal difference script', () => {
    // script :40-52 (calculatePostDuctDiff), triggered by change on .o2SatValue inputs and on load
    const fillSats = async (page: Page, pre: string, post: string) => {
      await page.locator('#preDuctalO2 input[type=text]').fill(pre);
      await page.locator('#preDuctalO2 input[type=text]').blur();
      await page.locator('#postDuctalO2 input[type=text]').fill(post);
      await page.locator('#postDuctalO2 input[type=text]').blur();
    };

    test.beforeEach(async ({ page }) => {
      await open(page);
    });

    test('preductal minus postductal is shown, red when the difference is above 5', async ({ page }) => {
      const diff = page.locator('#postductalDifference');
      await expect(diff).toHaveValue('');
      await fillSats(page, '98', '90');
      await expect(diff).toHaveValue('8');
      await expect(diff).toHaveClass(/triage-label-red/);
      await fillSats(page, '98', '96');
      await expect(diff).toHaveValue('2');
      await expect(diff).not.toHaveClass(/triage-label-red/);
    });

    test('clearing one saturation keeps the old difference (V1)', async ({ page }) => {
      // V1 (Low): the intended behaviour would be an empty difference; the test pins what the form does today.
      await fillSats(page, '98', '90');
      await expect(page.locator('#postductalDifference')).toHaveValue('8');
      await page.locator('#postDuctalO2 input[type=text]').fill('');
      await page.locator('#postDuctalO2 input[type=text]').blur();
      await expect(page.locator('#postductalDifference')).toHaveValue('8');
    });

    test('a difference of exactly 5 is not red', async ({ page }) => {
      await fillSats(page, '95', '90');
      await expect(page.locator('#postductalDifference')).toHaveValue('5');
      await expect(page.locator('#postductalDifference')).not.toHaveClass(/triage-label-red/);
    });
  });

  // The three exam groups (cord stump, eyes, skin colour) are .exam containers: ticking a normal finding unticks the
  // abnormal ones and the other way round. script :71-95
  const examGroups = [
    { group: 'Umbilical cord stump', normal: ['Clean', 'Dry'], abnormal: ['Moist', 'Sticky'] },
    { group: 'Eyes', normal: ['Clear'], abnormal: ['Red eyes', 'Yellow eyes', 'Sticky eyes'] },
    { group: 'Skin color', normal: ['Normal (pink)'], abnormal: ['Cyonosis (blue)', 'Jaundice'] },
  ];

  for (const { group, normal, abnormal } of examGroups) {
    test(`exam ${group}: normal and abnormal findings exclude each other`, async ({ page }) => {
      await open(page);
      const box = (label: string) => page.getByLabel(label, { exact: true });
      // Several normal findings can be ticked together; ticking an abnormal one clears them
      for (const n of normal) {
        await box(n).check();
      }
      await box(abnormal[0]).check();
      for (const n of normal) {
        await expect(box(n)).not.toBeChecked();
      }
      // Abnormal findings can be combined; ticking a normal one clears them all
      for (const a of abnormal) {
        await box(a).check();
      }
      await box(normal[0]).check();
      for (const a of abnormal) {
        await expect(box(a)).not.toBeChecked();
      }
      await expect(box(normal[0])).toBeChecked();
    });
  }

  test('saving needs a disposition, and the optional appointment must be declined explicitly', async ({ page, api }) => {
    // encounterDisposition required="true" (:610) and scheduleAppointment optional="true" (:647)
    await open(page);
    await pickProviderAndLocation(page);
    await save(page);
    const errors = page.locator('.field-error:visible');
    await expect(page.locator('#encounter-disposition ~ .field-error, #disposition .field-error').first()).toHaveText('Required');
    await expect(errors.filter({ hasText: 'Service is required' })).toHaveCount(1);
    await expect(page).not.toHaveURL(VISIT_PAGE_URL);
    expect(await getPatientEncounters(api, context.patient.uuid)).toHaveLength(0);
  });

  test('saves the examination, treatment and plan, and enrolls the infant in the Infant program', async ({
    page,
    api,
  }) => {
    await open(page);
    const enrollmentsUrl = `programenrollment?patient=${context.patient.uuid}&v=custom:(program:(name),location:(name),dateCompleted)`;
    expect(((await (await api.get(enrollmentsUrl)).json()).results as unknown[]).length).toBe(0);

    await pickProviderAndLocation(page);
    await page.locator('#weight_kg input[type=text]').fill('3.1');
    await page.getByLabel('Vitamin D', { exact: true }).check();
    await page.getByLabel('Clean', { exact: true }).check();
    await page.getByLabel('Normal (pink)', { exact: true }).check();
    await page.getByLabel('Normal (passed urine)').check();
    await page.getByLabel('Breastfed').check();
    await page.locator('#outcome-condition').getByLabel('Satisfactory').check();
    await page.getByLabel('Transport assistance').check();
    await page.locator('#encounter-disposition select').selectOption({ label: 'Home' });
    // Not scheduling an appointment: a saved appointment is not purged with the patient
    await page.locator('input[type=radio][value=no]').last().check();
    await expect(page.locator('input[type=radio][value=no]').last()).toBeChecked();
    await save(page);
    await new EntryFormPage(page, FORM).expectSaved();

    const encounters = await getPatientEncounters(api, context.patient.uuid);
    expect(encounters).toHaveLength(1);
    // the diagnosis widget is labelled "(required)" yet no diagnosis was entered (V4)
    expect(await obsSummary(api, encounters[0].uuid)).toEqual(
      expect.arrayContaining([
        'Weight (kg)=3.1',
        'Supplement received=Vitamin D / vitamin D2',
        'Neonatal umbilical stump status=Neonatal umbilical stump clean',
        'Skin exam findings=Normal',
        'Urological exam findings=Normal',
        'Infant feeding method=Breastfeeding child',
        'Overall condition=Satisfactory',
        'Disposition categories=Home',
        'Socio-economic assistance recommended=Transport assistance',
      ]),
    );

    // <enrollInProgram programId="Infant" locationTag="Program Location "> at :147
    const res = await api.get(enrollmentsUrl);
    expect(res.ok()).toBeTruthy();
    const enrollments = (await res.json()).results as Array<{ program: { name: string }; dateCompleted: string | null }>;
    expect(enrollments.map((e) => e.program.name)).toEqual(['Infant']);
    expect(enrollments[0].dateCompleted).toBeNull();
  });

  const fillDischarge = async (page: Page) => {
    await pickProviderAndLocation(page);
    await page.locator('#weight_kg input[type=text]').fill('3.1');
    await page.locator('#muac_c input[type=text]').fill('11');
    await page.locator('#preDuctalO2 input[type=text]').fill('98');
    await page.locator('#postDuctalO2 input[type=text]').fill('90');
    await page.locator('#heart_rate input').fill('140');
    await page.locator('#temperature_c input').fill('36.9');
    await page.getByLabel('Vitamin D', { exact: true }).check();
    await page.getByLabel('Prophylactic eye ointment', { exact: true }).check();
    await page.locator('#hemoglobin input').fill('15');
    await page.locator('#tcb input').fill('9');
    await page.getByLabel('Clean', { exact: true }).check();
    await page.getByLabel('Normal (pink)', { exact: true }).check();
    await page.getByLabel('Normal (passed urine)').check();
    await page
      .locator('#pee-time')
      .locator('input.hasDatepicker')
      .evaluate((el) => {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        (window as any).jQuery(el).datepicker('setDate', d);
        (window as any).jQuery(el).trigger('change');
      });
    await page.locator('#pee-time select.hfe-hours').selectOption('9');
    await page.locator('#pee-time select.hfe-minutes').selectOption('5');
    await page.getByLabel('Breastfed').check();
    await page.locator('#outcome-condition').getByLabel('Satisfactory').check();
    await page.getByLabel('Transport assistance').check();
    await page.locator('#encounter-disposition select').selectOption({ label: 'Home' });
    await page.locator('input[type=radio][value=no]').last().check(); // no appointment
  };

  // VIEW (viewEncounterWithHtmlForm): saved values are span.value, unselected options span.emptyValue ("[X] Clean" / "[  ] Dry").
  test('VIEW: shows the saved vitals, treatment, exam, plan and disposition, and none of the ENTER-only lookups', async ({ page, api }) => {
    await createPriorEncounter(api, context); // delivery date and type, eye ointment, cord care and vitamin K given earlier in the visit
    await open(page);
    await fillDischarge(page);
    await save(page);
    await new EntryFormPage(page, FORM).expectSaved();
    const [encounter] = (await getPatientEncounters(api, context.patient.uuid)).filter((e) => e.encounterType.uuid !== MCH_DELIVERY_ENCOUNTER_TYPE_UUID);

    // Answers the form labels differently from the concept (answerCode / answerCodes).
    const view = await expectViewShowsSavedObs(page, api, FORM, encounter.uuid, {
      'Procedure performed: Administration of prophylactic antibiotics to neonatal eyes': 'Prophylactic eye ointment',
      'Supplement received: Vitamin D / vitamin D2': 'Vitamin D',
      'Neonatal umbilical stump status: Neonatal umbilical stump clean': 'Clean',
      'Infant feeding method: Breastfeeding child': 'Breastfed',
    });
    const shown = await view.valueTexts();
    for (const expected of [
      '3.1',
      '98',
      '90',
      '[X] Prophylactic eye ointment',
      '[X] Vitamin D',
      '15',
      '[X] Clean',
      '[X] Normal (pink)',
      '[X] Normal (passed urine)',
      '[X] Breastfed',
      '[X] Satisfactory',
      'Home',
      '[X] Transport assistance',
    ]) {
      expect(shown, expected).toContain(expected);
    }

    // the date and time of the first urination are two values ("dd MMM yyyy" and "h:mm a")
    const urinated = new Date();
    urinated.setDate(urinated.getDate() - 1);
    const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][urinated.getMonth()];
    await expect(page.locator('#pee-time .value')).toHaveText([`${`${urinated.getDate()}`.padStart(2, '0')} ${month} ${urinated.getFullYear()}`, '9:05 AM']);
    // the disposition is plain text (not "[X]"), and the transfer/death fields that belong to other dispositions hold no value
    await expect(page.locator('#disposition .value')).toHaveText('Home');

    // what was not filled is an empty option: the treatments given earlier in the visit (the prior-value markers are ENTER only,
    // :254-279) are not marked as given now, and the other exam answers are not selected
    const empty = (await page.locator('span.emptyValue').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
    for (const expected of ['[ ] Umbilical cord care', '[ ] Vitamin K', '[ ] Dry', '[ ] Jaundice', '[ ] Anuria (No urination)', '[ ] Formula', '[ ] Deteriorated']) {
      expect(empty, expected).toContain(expected);
    }
    await expect(page.locator('#treatment .value')).toHaveText(['[X] Prophylactic eye ointment', '[X] Vitamin D']);
    await expect(page.locator('#treatment .prior-obs-value')).toHaveCount(0);
    await expect(page.locator('#Overview')).toHaveCount(0);
    await expect(page.getByText('Date & time of delivery')).toHaveCount(0);
    await expect(page.getByText('Type of delivery')).toHaveCount(0);

    // VIEW-only parts: the post-ductal difference is an empty span.value that viewPostDuctDiff() (script :54-68) fills from the two
    // saturations (the difference is not saved): 98 - 90; and the appointment is replaced by a link
    await expect(page.locator('span#postductalDifference.value')).toHaveText('8');
    await expect(page.locator('#preDuctalO2 .value')).toHaveText('98');
    await expect(page.locator('#postDuctalO2 .value')).toHaveText('90');
    await expect(page.locator('#postductalDifference').locator('xpath=ancestor::*[@id="postductalDiffDiv"]')).toHaveCount(1);
    await expect(page.locator('#postductalDiffDiv input')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'View Appointments' })).toHaveAttribute('href', '/openmrs/spa/home/appointments');
    await expect(page.locator('p.schedule-appointment-none')).toHaveText('No appointment scheduled');
    // no visible field, button or heading (the order widget keeps a hidden template with a "Calculate Quantity" button)
    await expect(page.locator('h2, #buttons, input:visible, select:visible, textarea:visible, button:visible')).toHaveCount(0);
  });

  // VW1 (Medium): the umbilical cord comment (:395) and the eye comment (:422) are two inputs of one concept (CIEL:168722). A saved obs is
  // bound to the first input of its concept, so a lone eye comment is shown as the cord comment. Intended: shown with the eyes.
  // Remove test.fixme() when the concepts differ.
  test('VW1: an eye comment is shown with the eyes, not with the umbilical cord', async ({ page, api }) => {
    test.fixme();
    await open(page);
    await pickProviderAndLocation(page);
    await page.locator('.exam').nth(1).locator('input[type=text]').fill('Discharge from the left eye');
    await page.locator('#encounter-disposition select').selectOption({ label: 'Home' });
    await page.locator('input[type=radio][value=no]').last().check(); // no appointment
    await save(page);
    await new EntryFormPage(page, FORM).expectSaved();
    const [encounter] = await getPatientEncounters(api, context.patient.uuid);

    await ViewFormPage.open(page, FORM, encounter.uuid);
    await expect(page.locator('.exam').nth(0).locator('.value')).toHaveCount(0);
    await expect(page.locator('.exam').nth(1).locator('.value')).toHaveText(['Discharge from the left eye']);
  });
});
