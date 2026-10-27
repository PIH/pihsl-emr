import type { APIRequestContext, Page } from '@playwright/test';
import { test, expect, birthdateYearsAgo, type EntryContext } from '../../core';
import { MCH_DELIVERY_ENCOUNTER_TYPE_UUID, MCH_OPD_LOCATION_UUID } from '../../core/constants';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import { EntryFormPage } from '../../pages';

// maternalDischarge.xml: "Maternal Discharge" (admission date line, diagnoses, clinical history, pregnancy group (read-only), test and hospital
// summaries, discharge medications, disposition, discharge recommendation, next appointment, Save / Save&Print). The specs open
// enterHtmlFormWithStandardUi inside a visit they create with a 25-year-old female (documentation/_availability.e2e.md: enableMCOEForms, enterMCH,
// "Maternal Discharge Location" session tag, female >= 10), so the app-loader gating is not exercised. The session location (MCH OPD) lacks the
// form's location tag, so the Location select starts empty and every save picks one by index. The form ends with <submit> (no #submit).
//
// Conditions in the form, from documentation inventory (maternalDischarge.inv.md):
//   ifMode VIEW include=false :106,:126,:145,:251 / include=true :30,:234   heading, Overview, style, buttons / VIEW-only styles and text: ENTER/EDIT only here
//   includeIf :127   $fn.latestObsBeforeCurrentEncounter('CIEL:1640', true) exists -> section #Overview "Date & time of admission" with that
//                    obs (written by ancProgress, laborProgress, section-delivery); needs an earlier CIEL:1640 obs (fixture below), both states tested
//   disposition widget (encounterDisposition :221, options from pih-dispositions-sierraLeone-mcoe.json for this encounter type): Transfer out of
//                    hospital -> #transferExternalLocation (required); Death -> #dateOfDeath; Home / Mother's dorm / Left against medical advice /
//                    Absconded -> nothing (tested)
// Sub-forms (behaviour in documentation/_shared.e2e.md): encounter-provider-location-date, pregnancy-group-widget (read-only here, $pregGroupViewOnly),
// drug-order-widget, save-and-print-button (+ .js; duplicate ids: see _shared V10 and V17). Scripts of its own: none.
// Side effects on save: ApplyDispositionAction (:21) runs the disposition's actions: Home / Mother's dorm / LAMA / Absconded / Transfer out close the
// visit (closeCurrentVisit), Death marks the patient dead; PregnancyProgramPostpartumTransitionAction (:22): Antenatal -> Delivered, or enrols the
// patient in the Delivered state when there is no active enrolment (both tested). Save&Print adds printForm=true to the return URL (tested).
// Not covered here (cannot be purged or would change the patient for good): saving a drug order (an order blocks purging the encounter), a booked
// appointment (appointment = yes), and the Death disposition (it marks the patient dead through core death handling, which may leave patient-level
// data the harness does not purge); VIEW/EDIT; the print dialog on the visit page (see maternalDischarge-print.spec.ts).
//
// Findings:
//   V1 Medium :194,:204      "Summary of investigation done and results" and "Summary of management in the hospital" are both CIEL:165399
//        ("Test result free text"): two obs of one concept are saved, so reports cannot tell them apart and the management summary has no concept
//        of its own. Fix: give the management summary its own concept. (TESTED below with test.fail)
//   V2 Info :238  scheduleAppointment optional="true" renders a "schedule an appointment?" choice that is "yes" by default in ENTER (HFE
//        ScheduleAppointmentElement): Save is blocked by six appointment errors until the user picks "No" or books one.

const FORM = 'maternalDischarge.xml';
const SAVE = '#buttons input.submitButton';
const PREGNANCY_PROGRAM = '6a5713c2-3fd5-46e7-8f25-36a0f7871e12';
const ANTENATAL_STATE = 'a83896bf-9094-4a3c-b843-e75509a52b32';

const openForm = async (page: Page, context: EntryContext) => {
  await EntryFormPage.open(page, FORM, context);
  await expect(page.locator(SAVE)).toBeVisible(); // handlers are bound on document.ready
};

const disposition = (page: Page) => page.locator('#encounter-disposition select');

// Fills the minimum for a save with the given disposition: location, no appointment, optional text.
const fillDischarge = async (page: Page, option: string) => {
  await page.locator('#encounterLocation select').selectOption({ index: 1 });
  await disposition(page).selectOption({ label: option });
  await page.locator('#disposition-section input[type=radio][value=no]').check(); // next appointment: No (V2)
};

// A delivery encounter earlier in the visit holding the admission date/time (CIEL:1640).
const createAdmissionDate = async (api: APIRequestContext, ctx: EntryContext) => {
  const res = await api.post('encounter', {
    data: {
      patient: ctx.patient.uuid,
      encounterType: MCH_DELIVERY_ENCOUNTER_TYPE_UUID,
      location: MCH_OPD_LOCATION_UUID,
      encounterDatetime: new Date().toISOString(),
      visit: ctx.visitUuid,
      obs: [{ concept: 'CIEL:1640', value: new Date(Date.now() - 26 * 3600 * 1000).toISOString() }],
    },
  });
  expect(res.ok(), `admission date: ${res.status()}`).toBeTruthy();
};

const dischargeEncounter = async (api: APIRequestContext, ctx: EntryContext) => {
  const encounters = await getPatientEncounters(api, ctx.patient.uuid);
  const discharge = encounters.filter((e) => e.encounterType.uuid === '2110a810-db62-4914-ba95-604b96010164');
  expect(discharge).toHaveLength(1);
  return discharge[0];
};

const pregnancyStates = async (api: APIRequestContext, ctx: EntryContext) => {
  const res = await api.get(`programenrollment?patient=${ctx.patient.uuid}&v=custom:(program:(name),states:(state:(concept:(display)),endDate))`);
  expect(res.ok()).toBeTruthy();
  return (await res.json()).results as Array<{
    program: { name: string };
    states: Array<{ state: { concept: { display: string } }; endDate: string | null }>;
  }>;
};

test.describe('maternalDischarge', () => {
  let ctx: EntryContext;

  test.beforeEach(async ({ createEntryContext }) => {
    ctx = await createEntryContext({ givenName: 'AutoDischarge', familyName: 'Tester', gender: 'F', birthdate: birthdateYearsAgo(25) });
  });

  test('ENTER shows the heading, the sections, the buttons and a read-only pregnancy group', async ({ page }) => {
    // ifMode VIEW include=false :106,:251; pregnancy-group-widget with $pregGroupViewOnly: no A/B/C radio
    await openForm(page, ctx);
    await expect(page.locator('h2')).toBeVisible();
    for (const section of ['#diagnosis', '#history', '#test-summary', '#hospital-mgmt', '#drug-orders', '#disposition-section']) {
      await expect(page.locator(section)).toBeVisible();
    }
    await expect(page.locator('#history input[type=radio]')).toHaveCount(0);
    await expect(page.locator('#buttons #save-and-print-button')).toBeVisible();
    await expect(page.locator('#buttons .cancel')).toBeVisible();
  });

  // ---- conditions ----
  test('includeIf :127: the Overview with the admission date appears only when an earlier CIEL:1640 obs exists', async ({ page, api }) => {
    await openForm(page, ctx);
    await expect(page.locator('#Overview')).toHaveCount(0);

    await createAdmissionDate(api, ctx);
    await openForm(page, ctx);
    await expect(page.locator('#Overview')).toContainText('Date & time of admission');
    await expect(page.locator('#Overview')).toContainText(/\d{2} [A-Z][a-z]{2} \d{4} \d{1,2}:\d{2} (AM|PM)/);
  });

  const dispositions = [
    ['Home', null],
    ["Mother's dorm", null],
    ['Left against medical advice', null],
    ['Absconded', null],
    ['Transfer out of hospital', '#transferExternalLocation'],
    ['Death', '#dateOfDeath'],
  ] as const;

  test('disposition options show their own extra field and no other', async ({ page }) => {
    await openForm(page, ctx);
    for (const [option, target] of dispositions) {
      await disposition(page).selectOption({ label: option });
      for (const field of ['#transferExternalLocation', '#dateOfDeath']) {
        await expect(page.locator(field), `${option} -> ${field}`).toBeVisible({ visible: field === target });
      }
    }
  });

  // ---- required fields ----
  test('saving an empty form shows the location, disposition and appointment errors and saves nothing', async ({ page, api }) => {
    await openForm(page, ctx);
    await page.locator(SAVE).click();
    await expect(page.locator('#encounterLocation span.field-error')).toBeVisible();
    await expect(page.locator('#disposition span.field-error').first()).toBeVisible(); // disposition is required
    // V2: the appointment choice defaults to "yes", so its fields are required too
    const errors = await page.locator('span.field-error:visible').allTextContents();
    for (const message of ['Service is required', 'Appointment date is required', 'Provider is required']) {
      expect(errors).toContain(message);
    }
    await expect(page).toHaveURL(/enterHtmlFormWithStandardUi/);
    expect(await getPatientEncounters(api, ctx.patient.uuid)).toHaveLength(0);
  });

  test('Transfer out of hospital without a destination is rejected', async ({ page, api }) => {
    await openForm(page, ctx);
    await fillDischarge(page, 'Transfer out of hospital');
    await page.locator(SAVE).click();
    await expect(page.locator('#transferExternalLocation span.field-error')).toBeVisible();
    await expect(page).toHaveURL(/enterHtmlFormWithStandardUi/);
    expect(await getPatientEncounters(api, ctx.patient.uuid)).toHaveLength(0);
  });

  // ---- save ----
  test('Save&Print saves the discharge, closes the visit, enrols the patient as Delivered and asks the visit page to print', async ({ page, api }) => {
    await openForm(page, ctx);
    await fillDischarge(page, 'Home');
    await page.locator('#diagnosis-search').fill('malaria');
    await page.locator('.ui-autocomplete li').first().click();
    await expect(page.locator('#encounter-diagnoses-target > *')).toHaveCount(1);
    await page.locator('#history textarea').fill('Normal delivery, uneventful stay');
    await page.locator('#test-summary textarea').fill('Hb 11');
    await page.locator('#hospital-mgmt textarea').fill('Oxytocin, observation');
    await page.locator('#disposition-section textarea').first().fill('Review at 6 weeks');
    await page.locator('#buttons #save-and-print-button').click(); // save-and-print-button.js appends printForm=true to the return URL
    await expect(page).toHaveURL(/referenceapplication\/home\.page.*printForm=true/);

    const displays = (await getEncounterObs(api, (await dischargeEncounter(api, ctx)).uuid)).map((o) => o.display);
    for (const expected of [
      'Past medical history added (text): Normal delivery, uneventful stay',
      'Test result free text: Hb 11',
      'Test result free text: Oxytocin, observation',
      'Diagnosis: Malaria',
      'Disposition categories: Home',
    ]) {
      expect(displays, expected).toContain(expected);
    }
    expect(displays.some((d) => d.includes('Review at 6 weeks'))).toBeTruthy();

    // ApplyDispositionAction: Home closes the visit
    const visits = (await (await api.get(`visit?patient=${ctx.patient.uuid}&includeInactive=true&v=custom:(stopDatetime)`)).json()).results;
    expect(visits[0].stopDatetime).not.toBeNull();
    // PregnancyProgramPostpartumTransitionAction: no enrolment -> enrolled in Delivered
    const enrollments = await pregnancyStates(api, ctx);
    expect(enrollments).toHaveLength(1);
    expect(enrollments[0].program.name).toBe('Pregnancy');
    expect(enrollments[0].states.map((s) => [s.state.concept.display, s.endDate])).toEqual([['Delivered', null]]);
  });

  test('saving with an Antenatal enrolment moves it to Delivered', async ({ page, api }) => {
    const start = new Date(Date.now() - 30 * 86400000).toISOString();
    const enroll = await api.post('programenrollment', {
      data: { patient: ctx.patient.uuid, program: PREGNANCY_PROGRAM, dateEnrolled: start, states: [{ state: ANTENATAL_STATE, startDate: start }] },
    });
    expect(enroll.ok(), `enroll: ${enroll.status()}`).toBeTruthy();

    await openForm(page, ctx);
    await fillDischarge(page, "Mother's dorm");
    await page.locator(SAVE).click();
    await expect(page).toHaveURL(/referenceapplication\/home\.page/);

    const enrollments = await pregnancyStates(api, ctx);
    expect(enrollments).toHaveLength(1);
    const states = Object.fromEntries(enrollments[0].states.map((s) => [s.state.concept.display, s.endDate]));
    expect(states['Delivered']).toBeNull();
    expect(states['Antenatal']).not.toBeNull();
    // "Mother's dorm" also closes the visit
    const visits = (await (await api.get(`visit?patient=${ctx.patient.uuid}&includeInactive=true&v=custom:(stopDatetime)`)).json()).results;
    expect(visits[0].stopDatetime).not.toBeNull();
  });

  // V1: remove test.fail() when the management summary has its own concept.
  test.fail('V1: the investigation and management summaries are stored under different concepts', async ({ page, api }) => {
    await openForm(page, ctx);
    await fillDischarge(page, 'Home');
    await page.locator('#test-summary textarea').fill('Investigation summary');
    await page.locator('#hospital-mgmt textarea').fill('Management summary');
    await page.locator(SAVE).click();
    await expect(page).toHaveURL(/referenceapplication\/home\.page/);

    const obs = await getEncounterObs(api, (await dischargeEncounter(api, ctx)).uuid);
    const investigation = obs.find((o) => o.value === 'Investigation summary');
    const management = obs.find((o) => o.value === 'Management summary');
    expect(investigation).toBeDefined();
    expect(management).toBeDefined();
    expect(management?.concept.uuid).not.toBe(investigation?.concept.uuid);
  });
});
