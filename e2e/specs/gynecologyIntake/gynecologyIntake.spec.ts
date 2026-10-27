import type { APIRequestContext, Locator, Page } from '@playwright/test';
import { type EntryContext, test, expect, birthdateYearsAgo } from '../../core';
import { MCH_OPD_LOCATION_UUID } from '../../core/constants';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import { EntryFormPage } from '../../pages';

// gynecologyIntake.xml: first gynecology visit (vitals, family planning history, menstrual and pregnancy history, clinical
// history, gynecology exam, procedures, diagnoses, rapid tests, lab and drug orders, follow-up clinic and disposition). A
// top-level form: the specs open enterHtmlFormWithStandardUi inside a visit they create, so availability
// (documentation/_availability.e2e.md: enableMCHForms + mchGynecologyForms (KGH), enterMCH, "Maternal and Child Location"
// session tag, female >= 10, no gynecology intake or followup in the visit) is not exercised. The session location (MCH OPD)
// has the tag, so the Location select is preselected and Save works with the defaults.
//
// Conditions in the form, from documentation inventory (gynecologyIntake.inv.md):
//   toggle CIEL:374 style dim  :100   history row f<id>-date start/end dates are disabled and dimmed until the row is ticked
//   when CIEL:161558 = Yes     :359   show #sti-list (seven STI checkboxes) when "STI suspected?" is Yes
//   ifMode VIEW include=false  :25,:45,:527  CSS, heading, #buttons in ENTER/EDIT only
// Sub-forms (documentation/_shared.e2e.md): encounter-provider-location-date, prior-vital-signs-widget (+ .js),
// vital-signs-wt-ht-bp-widget, rapid-tests-widget (HIV "Not performed" reason tested; V5 of _shared), prior-procedure-widget
// (see _shared V16), drug-order-widget.
//
// Scripts: :36-41 setUpNextAndSubmitButtons() only (no #next / .nextSection buttons: Save posts the form).
// Side effects on save: ApplyDispositionAction and CleanDiagnosisConstructAction (:20-21; no disposition or diagnosis is
// chosen here). pihLabOrder (:483) and drug orders (:490) can create orders.
// Not covered here: lab and drug orders and the disposition (a saved testorder cannot be purged), diagnosis search, the
// procedure autocompletes, EDIT and VIEW modes, the Next/Save navigation script.
//
// Findings:
//   V1 Medium :338,:420,:442  every hidden CIEL:1937 obs has a defaultValue (6, 1-5, 1-3), so the "showIfEmpty=false" obsgroups
//                       (cryotherapy CIEL:1938 :335, procedure history PIH:10492 :418, planned procedures PIH:21483 :440) are
//                       never empty: each save stores 1 + 5 + 3 empty groups with only their index. Fix: fill the index
//                       from script when the group has a value, or drop the hidden defaults. TESTED below (test.fail).
//   V2 Low    :285-370  the exam checkboxes carry class normalObs / abnormalObs but nothing makes them exclusive (ancProgress
//                       and newbornDischarge have a handler): "Normal" and "Condyloma" can be saved together (intent
//                       unconfirmed, not asserted).
//   V3 Low    :356      "STI suspected?" (CIEL:161558) is saved as "Patient tested for sexually transmitted illness in current
//                       visit" (Yes/No): the label asks about suspicion, the concept records a test (concept unconfirmed; same in
//                       followup :158).
//   V4 Low    :368      the STI rows use class="{switch}" but their <render>s define finding/name, so the rendered class is
//                       literally "{switch}" (also :373-379; same in followup :170). Harmless, nothing targets it.

const FORM = 'gynecologyIntake.xml';
const GYN_INTAKE_ENCOUNTER_TYPE_UUID = '34700f4f-c3df-4cfc-863a-bd8b92a0a485';
const VITALS_ENCOUNTER_TYPE_UUID = '2fd151a2-fbef-43e3-b82d-c3f70f1d7333'; // hard-coded in prior-vital-signs-widget.js
const SYSTOLIC_CONCEPT_UUID = '3ce934fa-26fe-102b-80cb-0017a47871b2';
const DIASTOLIC_CONCEPT_UUID = '3ce93694-26fe-102b-80cb-0017a47871b2';
const WEIGHT_CONCEPT_UUID = '3ce93b62-26fe-102b-80cb-0017a47871b2';
const HEIGHT_CONCEPT_UUID = '3ce93cf2-26fe-102b-80cb-0017a47871b2';

// The date widgets are read-only jQuery UI datepickers; setDate also updates the hidden field that is submitted.
const setDate = (display: Locator, year: number, monthIndex: number, day: number) =>
  display.evaluate(
    (el, [y, m, d]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).jq(el).datepicker('setDate', new Date(y, m, d));
    },
    [year, monthIndex, day],
  );

const save = (page: Page) => page.locator('#buttons input.submitButton').click();

// "<concept>=<value>" for each obs of the encounter (coded values by their name).
const obsSummary = async (api: APIRequestContext, encounterUuid: string): Promise<string[]> =>
  (await getEncounterObs(api, encounterUuid)).map((o) => {
    const v = o.value as { display?: string } | string | number;
    return `${o.concept.display}=${typeof v === 'object' && v !== null ? v.display : v}`;
  });

test.describe('gynecologyIntake', () => {
  let context: EntryContext;

  const open = async (page: Page) => {
    await EntryFormPage.open(page, FORM, context);
    await expect(page.locator('#buttons input.submitButton')).toBeVisible();
  };

  test.beforeEach(async ({ createEntryContext }) => {
    context = await createEntryContext({
      givenName: 'AutoGynIntake',
      familyName: 'Tester',
      gender: 'F',
      birthdate: birthdateYearsAgo(30),
    });
  });

  test('the STI list shows only when "STI suspected" is Yes', async ({ page }) => {
    // when :359
    await open(page);
    const list = page.locator('#sti-list');
    await expect(list).toBeHidden();
    await page.locator('#susp-sti').getByLabel('Yes', { exact: true }).check();
    await expect(list).toBeVisible();
    await expect(list.locator('input[type=checkbox]')).toHaveCount(7);
    await page.locator('#susp-sti').getByLabel('No', { exact: true }).check();
    await expect(list).toBeHidden();
  });

  // toggle :100 (style dim): the start/end date inputs of a history row follow its checkbox
  for (const { name, id } of [
    { name: 'Microgynon', id: '104625' },
    { name: 'Implanon', id: '76022' },
  ]) {
    test(`ticking "${name}" in the history enables its start and end dates`, async ({ page }) => {
      await open(page);
      const dates = page.locator(`td.f${id}-date input.hasDatepicker`);
      await expect(dates).toHaveCount(2);
      await expect(dates.first()).toBeDisabled();
      const box = page.locator(`#f${id}-fp input[type=checkbox]`);
      await box.check();
      await expect(dates.first()).toBeEnabled();
      await expect(dates.last()).toBeEnabled();
      await box.uncheck();
      await expect(dates.first()).toBeDisabled();
    });
  }

  test('choosing "Not performed" for the HIV rapid test asks for a reason', async ({ page }) => {
    // shared rapid-tests-widget.xml:27 (_shared.e2e.md): CIEL:163722 = Not performed -> #hrt-reason-not-done
    await open(page);
    const reason = page.locator('#hrt-reason-not-done');
    await expect(reason).toBeHidden();
    await page.locator('#hiv-rapid-test').getByLabel('Not performed', { exact: true }).check();
    await expect(reason).toBeVisible();
    await page.locator('#hiv-rapid-test').getByLabel('Negative', { exact: true }).check();
    await expect(reason).toBeHidden();
  });

  test('the most recent vitals of the visit appear above the vitals fields', async ({ page, api }) => {
    // shared prior-vital-signs-widget.js (_shared.e2e.md "prefill"): vitals encounter on the same visit -> #lastVitals
    await open(page);
    await expect(page.locator('#lastVitals')).toBeHidden();

    const res = await api.post('encounter', {
      data: {
        patient: context.patient.uuid,
        encounterType: VITALS_ENCOUNTER_TYPE_UUID,
        location: MCH_OPD_LOCATION_UUID,
        encounterDatetime: new Date().toISOString(),
        visit: context.visitUuid,
        obs: [
          { concept: SYSTOLIC_CONCEPT_UUID, value: 118 },
          { concept: DIASTOLIC_CONCEPT_UUID, value: 76 },
          { concept: WEIGHT_CONCEPT_UUID, value: 60 },
          { concept: HEIGHT_CONCEPT_UUID, value: 160 },
        ],
      },
    });
    expect(res.ok(), `create vitals encounter: ${res.status()}`).toBeTruthy();

    await open(page);
    await expect(page.locator('#lastVitals')).toBeVisible();
    await expect(page.locator('#last_weight')).toHaveText('60');
    await expect(page.locator('#last_bmi')).toHaveText('23.4'); // 60 / 1.6^2
  });

  // V1 (Medium): the hidden CIEL:1937 defaults keep the showIfEmpty="false" obsgroups non-empty, so a save with one exam
  // finding still stores the procedure groups. Intended behaviour: no procedure obs when none was entered. Remove
  // test.fail() when fixed.
  test('saving with no procedure entered stores no procedure groups (V1)', async ({ page, api }) => {
    test.fail();
    await open(page);
    await page.locator('#physical-exam').getByLabel('PAP test performed', { exact: true }).check();
    await save(page);
    await expect(page).toHaveURL(/referenceapplication\/home\.page/);

    const encounters = await getPatientEncounters(api, context.patient.uuid);
    const obs = await obsSummary(api, encounters[0].uuid);
    expect(obs.filter((o) => o.startsWith('Procedure performed quantity') || o.startsWith('Planned procedure set'))).toEqual([]);
  });

  test('saves vitals, histories, exam, rapid test and follow-up clinic as a gynecology intake encounter', async ({ page, api }) => {
    await open(page);

    await page.locator('#bp_systolic input').fill('120');
    await page.locator('#bp_diastolic input').fill('80');
    await page.locator('#weight input').fill('62');
    await page.locator('#height input').fill('165');

    await page.locator('#f104625-fp input[type=checkbox]').check(); // earlier method: Microgynon
    await setDate(page.locator('td.f104625-date input.hasDatepicker').first(), 2023, 4, 1);

    // menstrual history: gravida/para/abortus/living, then (text inputs of the section, in order) cycle length,
    // days of menses, age at menarche, age at first intercourse, number of partners
    await page.locator('#gravidaInput input').fill('3');
    await page.locator('#paraInput input').fill('2');
    await page.locator('#abortusInput input').fill('1');
    await page.locator('#livingInput input').fill('2');
    await page.locator('#menstrual-history').getByLabel('Regular', { exact: true }).check();
    const menstrual = page.locator('#menstrual-history input[type=text]');
    await menstrual.nth(4).fill('28');
    await menstrual.nth(6).fill('13');

    await page.locator('#history textarea').fill('Lower abdominal pain for two weeks');

    const exam = page.locator('#physical-exam');
    await exam.getByLabel('Condyloma', { exact: true }).check();
    await exam.getByLabel('PAP test performed', { exact: true }).check();
    await exam.getByLabel('Pre-cancerous dysplasia', { exact: true }).check(); // VIA result
    await page.locator('#susp-sti').getByLabel('Yes', { exact: true }).check();
    await page.locator('#sti-list').getByLabel('Chlamydia', { exact: true }).check();
    await exam.getByLabel('III', { exact: true }).check(); // Tanner stage

    await page.locator('#hiv-rapid-test').getByLabel('Negative', { exact: true }).check();

    await setDate(page.locator('#apptDate input.hasDatepicker'), new Date().getFullYear() + 1, 8, 12);
    await page.locator('#disposition-section').getByLabel('Family planning services', { exact: true }).check();

    await save(page);
    await expect(page).toHaveURL(/referenceapplication\/home\.page/);

    const encounters = await getPatientEncounters(api, context.patient.uuid);
    expect(encounters.map((e) => e.encounterType.uuid)).toEqual([GYN_INTAKE_ENCOUNTER_TYPE_UUID]);
    const obs = await obsSummary(api, encounters[0].uuid);
    expect(obs).toEqual(
      expect.arrayContaining([
        'Systolic=120',
        'Diastolic=80',
        'Weight (kg)=62',
        'Height (cm)=165',
        'Method of family planning=Ethinyl estradoil / Levonorgestrel', // the history row
        'Family planning start date=2023-05-01',
        'Gravida=3',
        'Parity=2',
        'Number of abortions/miscarriages=1',
        'Total number of living children=2',
        'Regular menstrual period=Yes',
        'Duration of menstrual period=28',
        'Age of menarche=13',
        'Past medical history added (text)=Lower abdominal pain for two weeks',
        'Gynecological exam findings=Condyloma',
        'Papanicolaou test status=Completed',
        'Colposcopy of cervix with acetic acid=Pre-cancerous dysplasia',
        'Patient tested for sexually transmitted illness in current visit=Yes',
        'Suspected STD (coded)=Chlamydia',
        'Tanner staging, qualitative=Stage III',
        'Rapid test for HIV=Negative',
        'Return visit date=' + (new Date().getFullYear() + 1) + '-09-12',
        'Type of referral ordered=Family planning services',
      ]),
    );
  });
});
