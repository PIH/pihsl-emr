import { type APIRequestContext, type Page } from '@playwright/test';
import { test, expect, birthdateYearsAgo, type EntryContext } from '../../core';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import { EntryFormPage, SectionFormPage, expectViewShowsSavedObs, selectDefaultProvider, VISIT_PAGE_URL } from '../../pages';

// mentalHealth.xml: "Mental Health Intake" (encounter type a8584ab8-cc2a-11e5-9956-625662870761). A long single-page form:
// referral, history, mental state exam, suicide evaluation, diagnoses, CGI scores, the PHQ-9/GAD-7 questionnaires, interventions,
// drug orders, outcome. The specs open enterHtmlFormWithStandardUi inside a visit they create, so availability
// (documentation/_availability.e2e.md: enableMentalHealthForm, "Task: emr.enterMentalHealthNote", "Mental Health Location" session tag,
// first assessment only) is not exercised. The session location lacks the form's location tag, so every save picks a location.
//
// Conditions in the form, from documentation inventory (mentalHealth.inv.md):
//   ifMode VIEW include=false  :83, :166, :845, :946  script, heading, medication CSS, #buttons (ENTER/EDIT only)
//   includeIf gender == 'F'    :875                   the Pregnant checkbox, #pregnant (LMP, EDD) and the calculated GA/EDD box
//   toggle Pregnant            :881                   shows #pregnant (CIEL:5272 checkbox; toggle="pregnant")
// Sub-forms (documentation/_shared.e2e.md): encounter-provider-location-date, mental-health-phq9-gad7-widget (.xml and .js), drug-order-widget-mental-health.
//
// Scripts (:84-152, ENTER/EDIT): for a female patient setUpEdd + EDD validators (shared edd scripts; tested: an LMP fills the EDD and shows the
// calculated box); the return visit date gets minDate = encounter date, and when changing the encounter date makes a chosen return date invalid it
// is cleared with an alert (tested); a block that enables/disables the inputs of `.medication-checkbox` rows (see V2).
// Side effects on save: enrollInProgram "Mental Health" (:190, tested), ApplyDispositionAction (:23), drug orders and the disposition (not saved here).
// Required: family history (:440-458), suicide evaluation (:670-699), primary diagnosis (:734), PIH:3293 "assigned CHW" (:925), provider and
// location (shared); the Required messages and a save with all of them filled are tested.
// VIEW is covered by one test that fills the referral, history, pregnancy dates, CGI-S and both questionnaires.
// Not covered here: the drug-order widget (a saved order cannot be purged over REST), the disposition obs and its follow-up fields, the diagnosis
// autocompletes, EDD validation messages.
//
// Findings:
//   V1 High (FIXED, SL-1457, superseded by SL-434) the old sub-form mental-health-phq9-gad7-scores.xml:162 bound "Total GAD-7 score" to CIEL:165137 (the
//                             PHQ-9 concept). Replaced by mental-health-phq9-gad7-widget.xml (PHQ-9 total PIH:11586 = CIEL:165137, GAD-7 total
//                             PIH:11733 = CIEL:165185), whose script calculates the totals from the answers. TESTED below.
//   V2 Low    :130-152        the `.medication-checkbox` block matches nothing in the rendered form (0 elements at load), so it is dead code; if the
//                             class ever appears, `jq(it).not(':checked')` is a jQuery object and always truthy, so every row starts disabled even when
//                             its box is checked (EDIT). Fix: remove it, or use `!jq(it).is(':checked')`.
//   VW1 Info :881  the Pregnant toggle is not applied in VIEW, so #pregnant (LMP, EDD) is always rendered, blank for a patient who is not pregnant (the
//                   calculated GA/EDD box is ENTER/EDIT script output and stays empty). Same as gainNewbornRegister VW1; not tested.

const FORM = 'mentalHealth.xml';
const MENTAL_HEALTH_INTAKE_ENCOUNTER_TYPE_UUID = 'a8584ab8-cc2a-11e5-9956-625662870761';
const PHQ9_TOTAL = 'CIEL:165137';
const GAD7_TOTAL = 'CIEL:165185';

const SUBMIT = '#buttons input.submitButton';

// The datepickers are read-only jQuery UI widgets: set the date through the widget and fire change on the visible and the hidden field
// (the form's handlers listen to the hidden one).
const setDate = (page: Page, wrapper: string, daysFromToday: number) =>
  page.evaluate(
    ([w, days]) => {
      const d = new Date();
      d.setDate(d.getDate() + (days as number));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const jq = (window as any).jq;
      const input = jq(`${w} input.hasDatepicker`);
      input.datepicker('setDate', d);
      input.change();
      jq(`${w} input[type=hidden]`).not('[name^=_]').change();
    },
    [wrapper, daysFromToday],
  );

const conceptUuid = async (api: APIRequestContext, ref: string): Promise<string> => {
  const res = await api.get(`concept/${ref}?v=custom:(uuid)`);
  expect(res.ok(), `concept ${ref}: ${res.status()}`).toBeTruthy();
  return (await res.json()).uuid;
};

// Moves the start of the test patient's visit back, so the encounter date can be set to an earlier day.
const startVisitDaysAgo = async (api: APIRequestContext, context: EntryContext, days: number) => {
  const start = new Date();
  start.setDate(start.getDate() - days);
  const res = await api.post(`visit/${context.visitUuid}`, { data: { startDatetime: start.toISOString() } });
  expect(res.ok(), `update visit: ${res.status()}`).toBeTruthy();
};

// The VIEW shows the answers in the form's own wording ("Several days" ... "Nearly every day", "Not at all", "Current") where the concepts name them
// "Some days" ... "Daily or almost daily", "Never", "Currently", and a date-only obs (yyyy-MM-dd) as dd MMM yyyy: the labels for the generic VIEW check.
const viewLabels = (obs: Awaited<ReturnType<typeof getEncounterObs>>): Record<string, string> => {
  const wording: Record<string, string> = { 'Some days': 'Several days', 'Daily or almost daily': 'Nearly every day', Never: 'Not at all', Currently: 'Current' };
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const labels: Record<string, string> = {};
  for (const o of obs) {
    const answer = typeof o.value === 'object' && o.value ? (o.value as { display: string }).display : undefined;
    if (answer && wording[answer]) {
      labels[o.display] = wording[answer];
    } else if (typeof o.value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.value)) {
      const [y, m, d] = o.value.split('-');
      labels[o.display] = `${d} ${MONTHS[Number(m) - 1]} ${y}`;
    }
  }
  return labels;
};

test.describe('mentalHealth', () => {
  let context: EntryContext;

  const open = async (page: Page) => {
    await EntryFormPage.open(page, FORM, context);
    await expect(page.locator(SUBMIT)).toBeVisible();
  };

  // The location select starts empty (the session location lacks the "Mental Health Location" tag) and is required.
  // The provider select is blank when the logged-in user has no Provider account.
  const pickProviderAndLocation = async (page: Page) => {
    await selectDefaultProvider(page);
    const location = page.locator('#encounterLocation select');
    if ((await location.inputValue()) === '') {
      await location.selectOption({ index: 1 });
    }
  };

  const saveAndWaitForRedirect = async (page: Page) => {
    await page.locator(SUBMIT).click();
    await new EntryFormPage(page, FORM).expectSaved();
  };

  // Answers every required field (family history x3 and suicide evaluation x4 "No", a primary diagnosis, assigned CHW "Yes"), picks a
  // provider and location and saves.
  const fillRequiredAndSave = async (page: Page) => {
    await pickProviderAndLocation(page);
    for (const radio of await page.locator('#mh_familyhistory input[type=radio][id$="_1"], #mh-suicide input[type=radio][id$="_1"]').all()) {
      await radio.check();
    }
    await page.locator('#mh-diagnoses input.autoCompleteText').first().fill('Depress');
    await page.locator('.ui-autocomplete .ui-menu-item').first().click();
    await page.locator('#mh-Outcome input[type=radio]').first().check();
    await saveAndWaitForRedirect(page);
  };

  const onlyEncounterUuid = async (api: APIRequestContext) => {
    const encounters = await getPatientEncounters(api, context.patient.uuid);
    expect(encounters).toHaveLength(1);
    expect(encounters[0].encounterType.uuid).toBe(MENTAL_HEALTH_INTAKE_ENCOUNTER_TYPE_UUID);
    return encounters[0].uuid;
  };

  test.beforeEach(async ({ createEntryContext }) => {
    context = await createEntryContext({
      givenName: 'AutoMentalHealth',
      familyName: 'Tester',
      gender: 'F',
      birthdate: birthdateYearsAgo(30),
    });
  });

  test('the pregnancy dates show only while Pregnant is ticked, and an LMP fills the EDD', async ({ page }) => {
    // includeIf :875 (female), toggle :881; script :108 (setUpEdd)
    await open(page);
    const pregnant = page.getByLabel('Pregnant', { exact: true });
    await expect(pregnant).toBeVisible();
    await expect(page.locator('#pregnant')).toBeHidden();
    await pregnant.check();
    await expect(page.locator('#pregnant')).toBeVisible();

    await expect(page.locator('#calculated-edd-and-gestational')).toBeHidden();
    await setDate(page, '#lastPeriodDate', -70);
    await expect(page.locator('#calculated-edd-and-gestational')).toBeVisible();
    await expect(page.locator('#edd input.hasDatepicker')).not.toHaveValue('');

    await pregnant.uncheck();
    await expect(page.locator('#pregnant')).toBeHidden();
  });

  test('a male patient has no pregnancy checkbox', async ({ page, createEntryContext }) => {
    // includeIf :875 is false for gender M
    context = await createEntryContext({
      givenName: 'AutoMentalHealthM',
      familyName: 'Tester',
      gender: 'M',
      birthdate: birthdateYearsAgo(30),
    });
    await open(page);
    await expect(page.locator('#mh-Outcome')).toBeVisible();
    await expect(page.getByLabel('Pregnant', { exact: true })).toHaveCount(0);
    await expect(page.locator('#pregnant')).toHaveCount(0);
    await expect(page.locator('#edd')).toHaveCount(0);
  });

  test('a return visit date that becomes earlier than the encounter date is cleared with an alert', async ({ page, api }) => {
    // script :114-128 (setMinReturnVisitDate); the visit has to start earlier so the encounter date can move back
    await startVisitDaysAgo(api, context, 10);
    await open(page);
    const alerts: string[] = [];
    page.on('dialog', async (dialog) => {
      alerts.push(dialog.type());
      await dialog.dismiss();
    });

    await setDate(page, '#encounterDate', -5);
    await setDate(page, '#return-visit-date', -4);
    await expect(page.locator('#return-visit-date input.hasDatepicker')).not.toHaveValue('');
    expect(alerts).toHaveLength(0);

    await setDate(page, '#encounterDate', -2); // the return date (-4) is now before the encounter date
    await expect(page.locator('#return-visit-date input.hasDatepicker')).toHaveValue('');
    expect(alerts).toEqual(['alert']);
  });

  test('saving with the required answers blank shows "Required" in each section and saves nothing', async ({ page, api }) => {
    // required :440-458 (family history), :670-699 (suicide evaluation), :734 (primary diagnosis), :925 (assigned CHW)
    await open(page);
    await pickProviderAndLocation(page);
    await page.locator(SUBMIT).click();
    for (const section of ['#mh_familyhistory', '#mh-suicide', '#mh-diagnoses', '#mh-Outcome']) {
      await expect(page.locator(`${section} span.field-error`).filter({ hasText: 'Required' }).first()).toBeVisible();
    }
    await expect(page).not.toHaveURL(VISIT_PAGE_URL);
    expect(await getPatientEncounters(api, context.patient.uuid)).toHaveLength(0);
  });

  test('saves a referral, alcohol history, a CGI score and the CHW answer, and enrols the patient in Mental Health', async ({ page, api }) => {
    const enrollmentsUrl = `programenrollment?patient=${context.patient.uuid}&v=custom:(program:(name),dateCompleted)`;
    expect(((await (await api.get(enrollmentsUrl)).json()).results as unknown[]).length).toBe(0);

    await open(page);
    await page.locator('#mh_refer input[type=checkbox]').first().check(); // role of referring person
    await page.locator('p', { hasText: 'Alcohol' }).first().getByLabel('Current', { exact: true }).check();
    await page.getByLabel('3 = Mildly ill', { exact: true }).check(); // CGI-S
    await fillRequiredAndSave(page);

    const obs = await getEncounterObs(api, await onlyEncounterUuid(api));
    const displays = obs.map((o) => o.display.toLowerCase());
    expect(displays.some((d) => d.includes('referring person')), displays.join(' | ')).toBeTruthy();
    expect(displays.some((d) => d.includes('alcohol') && d.includes('current')), displays.join(' | ')).toBeTruthy();
    expect(obs.some((o) => o.concept.display.toLowerCase().includes('severity') && String(o.value).startsWith('3'))).toBeTruthy();
    expect(displays.some((d) => d.includes('community health worker')), displays.join(' | ')).toBeTruthy();

    // enrollInProgram :190
    const enrollments = (await (await api.get(enrollmentsUrl)).json()).results as Array<{ program: { name: string } }>;
    expect(enrollments.some((e) => /mental health/i.test(e.program.name))).toBeTruthy();
  });

  // The PHQ-9 and GAD-7 questionnaires (mental-health-phq9-gad7-widget.xml). Each question is a select; the script (.js) adds up the answers
  // (Not at all 0 ... Nearly every day 3) into the total box (#phq9-score, #gad7-score), and writes nothing when no question is answered.
  const phq9Total = (page: Page) => page.locator('#phq9-score input');
  const gad7Total = (page: Page) => page.locator('#gad7-score input');
  const answerAll = async (page: Page, questions: string, answer: string) => {
    for (const select of await page.locator(`${questions} select`).all()) {
      await select.selectOption({ label: answer });
    }
  };

  test('the PHQ-9 and GAD-7 totals are calculated from the answers', async ({ page }) => {
    await open(page);
    await expect(phq9Total(page)).toHaveValue('');
    await expect(gad7Total(page)).toHaveValue('');
    await expect(page.locator('#phq9-questions select')).toHaveCount(9);
    await expect(page.locator('#gad7-questions select')).toHaveCount(7);

    await answerAll(page, '#phq9-questions', 'Nearly every day');
    await expect(phq9Total(page)).toHaveValue('27');
    await expect(gad7Total(page)).toHaveValue(''); // the two questionnaires are independent
    await answerAll(page, '#gad7-questions', 'Several days');
    await expect(gad7Total(page)).toHaveValue('7');

    await page.locator('#phq9-questions select').first().selectOption({ label: 'Not at all' });
    await expect(phq9Total(page)).toHaveValue('24');
  });

  test('the suicide alert shows while PHQ-9 question 9 is answered with anything but "Not at all"', async ({ page }) => {
    await open(page);
    const alert = page.locator('#phq9-suicide-alert');
    const question9 = page.locator('#phq9-question9 select');
    await expect(alert).toBeEmpty();
    await question9.selectOption({ label: 'Several days' });
    await expect(alert).toContainText('safety plan');
    await question9.selectOption({ label: 'Not at all' });
    await expect(alert).toBeEmpty();
  });

  // V1 (High, fixed): the totals are saved under their own concepts, PHQ-9 under CIEL:165137 and GAD-7 under CIEL:165185.
  test('saves the PHQ-9 total under CIEL:165137 and the GAD-7 total under CIEL:165185 (V1)', async ({ page, api }) => {
    await open(page);
    await answerAll(page, '#phq9-questions', 'Several days'); // 9
    await answerAll(page, '#gad7-questions', 'Nearly every day'); // 21
    await fillRequiredAndSave(page);
    const obs = await getEncounterObs(api, await onlyEncounterUuid(api));
    const phq9 = await conceptUuid(api, PHQ9_TOTAL);
    const gad7 = await conceptUuid(api, GAD7_TOTAL);
    expect(obs.filter((o) => o.concept.uuid === phq9).map((o) => o.value)).toEqual([9]);
    expect(obs.filter((o) => o.concept.uuid === gad7).map((o) => o.value)).toEqual([21]);
  });

  // V1 (High, fixed), EDIT variant: a GAD-7 total saved alone is shown in the GAD-7 box when the encounter is reopened, and no PHQ-9 total is saved.
  test('a GAD-7 saved alone stays a GAD-7: no PHQ-9 total, and it reopens in the GAD-7 box (V1)', async ({ page, api }) => {
    await open(page);
    await answerAll(page, '#gad7-questions', 'Several days'); // 7
    await fillRequiredAndSave(page);
    const encounterUuid = await onlyEncounterUuid(api);
    const obs = await getEncounterObs(api, encounterUuid);
    const phq9 = await conceptUuid(api, PHQ9_TOTAL);
    expect(obs.filter((o) => o.concept.uuid === phq9)).toHaveLength(0);

    await page.goto(
      SectionFormPage.editUrl(FORM, { patient: context.patient, encounter: { uuid: encounterUuid, visitUuid: context.visitUuid } }),
    );
    await expect(page.locator(SUBMIT)).toBeVisible();
    await expect(gad7Total(page)).toHaveValue('7');
    await expect(phq9Total(page)).toHaveValue('');

    // VIEW: the same encounter shows the 7 under the GAD-7 total and no PHQ-9 total
    const view = await expectViewShowsSavedObs(page, api, FORM, encounterUuid, viewLabels(obs));
    await expect(view.page.locator('#gad7-score .value')).toHaveText('7');
    await expect(view.page.locator('#phq9-score .value')).toHaveCount(0);
  });

  // VIEW: everything the intake saved is shown (referral, alcohol, pregnancy dates, CGI-S, PHQ-9 and GAD-7 answers and totals), the coded answers
  // with the form's own labels, and the sections and rows that were left empty carry no value.
  test('VIEW: shows the referral, history, pregnancy dates, CGI score, PHQ-9 and GAD-7 answers as saved, and nothing for what was left empty', async ({ page, api }) => {
    await open(page);
    await page.locator('#mh_refer input[type=checkbox]').first().check();
    await page.locator('p', { hasText: 'Alcohol' }).first().getByLabel('Current', { exact: true }).check();
    await page.getByLabel('Pregnant', { exact: true }).check();
    await setDate(page, '#lastPeriodDate', -70); // the script fills the EDD
    await setDate(page, '#return-visit-date', 14);
    await page.getByLabel('3 = Mildly ill', { exact: true }).check(); // CGI-S
    await answerAll(page, '#phq9-questions', 'Several days'); // 9, then question 9 back to "Not at all": 8
    await page.locator('#phq9-question9 select').selectOption({ label: 'Not at all' });
    await answerAll(page, '#gad7-questions', 'Nearly every day'); // 21
    await fillRequiredAndSave(page);
    const encounterUuid = await onlyEncounterUuid(api);

    const labels = { ...viewLabels(await getEncounterObs(api, encounterUuid)), 'Clinical Global Impressions Severity Score: 3': '3 = Mildly ill' };
    const view = await expectViewShowsSavedObs(page, api, FORM, encounterUuid, labels);
    const at = (selector: string) => view.page.locator(`${selector} .value`);

    await expect(at('#mh_refer')).toHaveText('[X] Teacher');
    await expect(at('#mh_patientHistory')).toHaveText('[X] Current'); // alcohol; the other substances are blank
    await expect(at('#mh_familyhistory')).toHaveText(['[X] No', '[X] No', '[X] No']);
    await expect(at('#mh-diagnoses')).toHaveText('Symptoms of depression');
    await expect(at('#mh_improvements')).toHaveText('[X] 3 = Mildly ill');
    await expect(at('#phq9-questions')).toHaveText([...Array(8).fill('Several days'), 'Not at all', '8']); // nine answers, then the total
    await expect(at('#gad7-questions')).toHaveText([...Array(7).fill('Nearly every day'), '21']);
    await expect(at('#phq9-score')).toHaveText('8'); // totals are saved obs: the script that computes them is not in VIEW
    await expect(at('#gad7-score')).toHaveText('21');
    await expect(at('#mh-Outcome').filter({ hasText: 'Yes' })).toHaveText('[X] Yes'); // assigned CHW
    // pregnancy: LMP, EDD and the return visit date are shown as dd MMM yyyy; the calculated GA/EDD box (ENTER/EDIT script) is not
    const lmp = new Date();
    lmp.setDate(lmp.getDate() - 70);
    const DATE = /^\d{2} [A-Z][a-z]{2} \d{4}$/;
    await expect(at('#lastPeriodDate')).toHaveText(new RegExp(`^${String(lmp.getDate()).padStart(2, '0')} ${lmp.toLocaleString('en', { month: 'short' })} ${lmp.getFullYear()}$`));
    await expect(at('#edd')).toHaveText(DATE);
    await expect(at('#return-visit-date')).toHaveText(DATE);
    await expect(at('#calculated-edd-and-gestational')).toHaveText(['', '']);
    // left empty: the interventions, the other history rows, the disposition
    await expect(at('#mh-interventions')).toHaveCount(0);
    await expect(at('#encounter-disposition')).toHaveCount(0);
    await expect(view.page.locator('#buttons')).toHaveCount(0); // ifMode VIEW include=false :946
  });

  test('VIEW: a male patient\'s encounter has no pregnancy block (includeIf :875)', async ({ page, api, createEntryContext }) => {
    context = await createEntryContext({ givenName: 'AutoMentalHealthM', familyName: 'Tester', gender: 'M', birthdate: birthdateYearsAgo(30) });
    await open(page);
    await fillRequiredAndSave(page);
    const view = await expectViewShowsSavedObs(page, api, FORM, await onlyEncounterUuid(api));
    await expect(view.page.locator('#pregnant, #edd, #lastPeriodDate')).toHaveCount(0);
    await expect(view.page.locator('#mh-Outcome .value').filter({ hasText: 'Yes' })).toHaveText('[X] Yes');
  });
});
