import type { APIRequestContext, Locator, Page } from '@playwright/test';
import { type EntryContext, test, expect, birthdateYearsAgo } from '../../core';
import { MCH_OPD_LOCATION_UUID } from '../../core/constants';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import { EntryFormPage, expectViewShowsSavedObs } from '../../pages';

// familyPlanningIntake.xml: first family planning visit (disability, service type, vitals, earlier methods with dates,
// method chosen today, appointment, referrals). A top-level form: the specs open enterHtmlFormWithStandardUi inside a visit
// they create, so availability (documentation/_availability.e2e.md: enableMCHForms + pregnancy, enterMCH, "Maternal and
// Child Location" session tag, female >= 10, no FP intake or followup in the visit) is not exercised. The session location
// (MCH OPD) has the tag, so the Location select is preselected and Save works with the defaults. familyPlanningFollowup.xml
// has the same formUuid but another encounter type (formEncounterType 52fe1a29-... here), asserted in the save test.
//
// Conditions in the form, from documentation inventory (familyPlanningIntake.inv.md):
//   toggle CIEL:374 style dim  :137       history row f<id>-date start/end dates are disabled and dimmed until the row is ticked
//   when Jadelle/Implanon      :310-311   show #implant-date (every box of the implant repeat carries both <when>s)
//   includeIf gender F         :362,:380,:402  Emergency contraceptive pills, Tubal ligation, LAM in "Family planning method"
//   includeIf gender M         :387       Vasectomy in the same section (history table lists both permanent methods always)
//   ifMode VIEW include=false  :23,:41,:461  CSS, heading, #buttons in ENTER/EDIT only
// Sub-forms (documentation/_shared.e2e.md): encounter-provider-location-date, prior-vital-signs-widget (+ .js),
// vital-signs-wt-ht-bp-widget (no scoring).
//
// Scripts: :32-37 setUpNextAndSubmitButtons() only; there are no #next / .nextSection buttons, so Save posts the form.
// Side effects on save: ReopenVisitAction (:20, reopens a closed visit; the visit here is open). No program, order or
// disposition. No required field apart from the provider (preselected).
// VIEW (end of the save test, and the last test): every saved value is shown in its own checkbox/radio or field (expectViewShowsSavedObs, with the
// labels of the visit type and the methods, and the dates as "dd MMM yyyy"), the history shows only the ticked row with its start date and a
// blank end date, and a male patient's VIEW has Vasectomy and none of the female-only methods (includeIf :362-:402).
// Not covered here: EDIT mode, a closed visit being reopened, the Next/Save navigation script.
//
// Findings:
//   V1 Medium :310-311  the second <when> value is CIEL:5275 (intrauterine device) but the repeat only renders Jadelle
//                       (CIEL:1873) and Implanon (CIEL:76022): ticking Implanon (or "Other implant") never shows
//                       #implant-date, and ticking Implanon while Jadelle is ticked hides it again. Fix: value="CIEL:76022".
//                       TESTED below (test.fail). Same in familyPlanningFollowup.xml:223-224.
//   V2 Low    :68       answerCodeXX="{name}" is not an HFE attribute (typo for answerCode), so the disability checkboxes show
//                       the concept names ("Speech/Language disorder"), not the intended labels. Same in followup :58.
//   V3 Low    :368-369  "Other contraceptive methods" > Emergency contraceptive pills is saved under CIEL:160693 "Method of
//                       contraception failure" = Emergency contraceptive pills, not under Method of family planning like every
//                       other method (intent unconfirmed; same in ayfs forms and familyPlanningFollowup.xml:281-282).
//   V4 Info   :387      the male branch (Vasectomy) is unreachable in production: the availability row offers the form to
//                       females only (still tested with a male fixture).

const FORM = 'familyPlanningIntake.xml';
const FP_INTAKE_ENCOUNTER_TYPE_UUID = '52fe1a29-678d-49cb-9ccd-7296d634284d';
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

test.describe('familyPlanningIntake', () => {
  let context: EntryContext;

  const open = async (page: Page) => {
    await EntryFormPage.open(page, FORM, context);
    await expect(page.locator('#buttons input.submitButton')).toBeVisible();
  };

  test.beforeEach(async ({ createEntryContext }) => {
    context = await createEntryContext({
      givenName: 'AutoFpIntake',
      familyName: 'Tester',
      gender: 'F',
      birthdate: birthdateYearsAgo(25),
    });
  });

  // includeIf :362, :380, :387, :402
  for (const { gender, present, absent } of [
    { gender: 'F' as const, present: ['Emergency contraceptive pills', 'Tubal ligation', 'Lactation amenorrhea method (LAM)'], absent: ['Vasectomy'] },
    { gender: 'M' as const, present: ['Vasectomy'], absent: ['Emergency contraceptive pills', 'Tubal ligation', 'Lactation amenorrhea method (LAM)'] },
  ]) {
    test(`the gender-specific methods for a ${gender === 'F' ? 'female' : 'male'} patient`, async ({ page, createEntryContext }) => {
      if (gender === 'M') {
        context = await createEntryContext({
          givenName: 'AutoFpMale',
          familyName: 'Tester',
          gender: 'M',
          birthdate: birthdateYearsAgo(25),
        });
      }
      await open(page);
      const methods = page.locator('#fp-method');
      for (const label of present) {
        await expect(methods.getByLabel(label, { exact: true })).toHaveCount(1);
      }
      for (const label of absent) {
        await expect(methods.getByLabel(label, { exact: true })).toHaveCount(0);
      }
    });
  }

  // toggle :137 (style dim): the start/end date inputs of a history row follow its checkbox
  for (const { name, id } of [
    { name: 'Microgynon', id: '104625' },
    { name: 'Depo-provera', id: '907' },
    { name: 'Tubal ligation', id: '1472' },
  ]) {
    test(`ticking "${name}" in the history enables its start and end dates`, async ({ page }) => {
      await open(page);
      const dates = page.locator(`td.f${id}-date input.hasDatepicker`);
      await expect(dates).toHaveCount(2);
      await expect(dates.first()).toBeDisabled();
      await expect(dates.last()).toBeDisabled();
      const box = page.locator(`#f${id}-fp input[type=checkbox]`);
      await box.check();
      await expect(dates.first()).toBeEnabled();
      await expect(dates.last()).toBeEnabled();
      await box.uncheck();
      await expect(dates.first()).toBeDisabled();
    });
  }

  test('ticking Jadelle shows the implant date, unticking hides it', async ({ page }) => {
    // when :310 (CIEL:1873)
    await open(page);
    const date = page.locator('#implant-date');
    await expect(date).toBeHidden();
    const jadelle = page.locator('#fp-meth-1873 input[type=checkbox]');
    await jadelle.check();
    await expect(date).toBeVisible();
    await jadelle.uncheck();
    await expect(date).toBeHidden();
  });

  // V1 (Medium): the second <when> of every implant box is CIEL:5275 (IUD), so Implanon (CIEL:76022) never shows the date.
  // Intended behaviour: Implanon is an implant like Jadelle. Remove test.fail() when :311 is fixed.
  test('ticking Implanon shows the implant date (V1)', async ({ page }) => {
    test.fail();
    await open(page);
    await page.locator('#fp-meth-76022 input[type=checkbox]').check();
    await expect(page.locator('#implant-date')).toBeVisible({ timeout: 3000 });
  });

  test('saving without a provider is refused', async ({ page, api }) => {
    // encounterProviderAndRole required="true" (:58); the provider select starts on the current user
    await open(page);
    await page.locator('#who select').selectOption({ index: 0 });
    await save(page);
    await expect(page.locator('span.field-error', { hasText: 'Required' }).first()).toBeVisible();
    await expect(page).not.toHaveURL(/referenceapplication\/home\.page/);
    expect(await getPatientEncounters(api, context.patient.uuid)).toHaveLength(0);
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
    await expect(page.locator('#last_bp_systolic')).toHaveText('118');
    await expect(page.locator('#last_bp_diastolic')).toHaveText('76');
    await expect(page.locator('#last_weight')).toHaveText('60');
    await expect(page.locator('#last_height')).toHaveText('160');
    await expect(page.locator('#last_bmi')).toHaveText('23.4'); // 60 / 1.6^2
  });

  test('saves the history, the chosen method, vitals and appointment as an FP intake encounter', async ({ page, api }) => {
    await open(page);

    await page.locator('#disability').getByLabel('Visual impairment', { exact: true }).check();
    await page.locator('#service').getByLabel('Method switch', { exact: true }).check();
    await page.locator('#service').getByLabel('48 hours to 6 weeks', { exact: true }).check();

    await page.locator('#bp_systolic input').fill('120');
    await page.locator('#bp_diastolic input').fill('80');
    await page.locator('#weight input').fill('60');
    await page.locator('#height input').fill('160');

    // earlier method: Microgynon with a start date
    await page.locator('#f104625-fp input[type=checkbox]').check();
    await setDate(page.locator('td.f104625-date input.hasDatepicker').first(), 2024, 0, 15);

    await page.locator('#fp-method p', { hasText: 'Family planning counselling' }).getByLabel('yes').check();
    await page.locator('#accepts-fp').getByLabel('yes').check();
    await page.locator('#fp-meth-907 input[type=checkbox]').check(); // Depo-provera
    await page.locator('#fp-meth-1873 input[type=checkbox]').check(); // Jadelle: implant date appears
    await setDate(page.locator('#implant-date input.hasDatepicker'), new Date().getFullYear(), 0, 10);

    await setDate(page.locator('#apptDate input.hasDatepicker'), new Date().getFullYear() + 1, 5, 20);
    await page.locator('#additional p', { hasText: 'Referred out' }).getByLabel('no').check();

    await save(page);
    await expect(page).toHaveURL(/referenceapplication\/home\.page/);

    const encounters = await getPatientEncounters(api, context.patient.uuid);
    expect(encounters.map((e) => e.encounterType.uuid)).toEqual([FP_INTAKE_ENCOUNTER_TYPE_UUID]);
    const obs = await obsSummary(api, encounters[0].uuid);
    expect(obs).toEqual(
      expect.arrayContaining([
        'Disability=Visual impairment',
        'Visit type=Change contraceptive method',
        'Postpartum time period=48 hours to 6 weeks',
        'Systolic=120',
        'Diastolic=80',
        'Weight (kg)=60',
        'Height (cm)=160',
        'Family planning start date=2024-01-15',
        'Family planning counseling=Yes',
        'Adopts modern family planning method immediately post-partum=Yes',
        'Method of family planning=Medroxyprogesterone acetate (Depo-provera)',
        'Method of family planning=Jadelle (implantable contraceptive)',
        'Method of family planning=Ethinyl estradoil / Levonorgestrel', // the history row, in its own history construct group
        'Date of implant placement=' + new Date().getFullYear() + '-01-10',
        'Return visit date=' + (new Date().getFullYear() + 1) + '-06-20',
        'Patient referred or escorted=No',
      ]),
    );

    // VIEW: every saved value is shown (the dates as "dd MMM yyyy", the methods under the form's labels), the others are not
    const year = new Date().getFullYear();
    const view = await expectViewShowsSavedObs(page, api, FORM, encounters[0].uuid, {
      'Visit type: Change contraceptive method': 'Method switch',
      'Method of family planning: Ethinyl estradoil / Levonorgestrel': 'Microgynon',
      'Method of family planning: Medroxyprogesterone acetate (Depo-provera)': 'Depo-provera',
      'Method of family planning: Jadelle (implantable contraceptive)': 'Jadelle',
      'Family planning start date: 2024-01-15': '15 Jan 2024',
      [`Date of implant placement: ${year}-01-10`]: `10 Jan ${year}`,
      [`Return visit date: ${year + 1}-06-20`]: `20 Jun ${year + 1}`,
    });
    expect(await view.valueTexts()).toEqual([
      '[X] Visual impairment',
      '[X] Method switch',
      '[X] 48 hours to 6 weeks',
      '120',
      '80',
      '60',
      '160',
      '[X] Microgynon', // history row, with its start date and an empty end date
      '15 Jan 2024',
      '[X] yes', // counselling
      '[X] yes', // accepts post-partum family planning
      '[X] Depo-provera',
      '[X] Jadelle',
      `10 Jan ${year}`, // implant date
      `20 Jun ${year + 1}`,
      '[X] no', // referred out
    ]);
    // the history keeps the start date in the Microgynon row, leaves its end date blank, and shows no row for the methods that were not ticked
    await expect(view.page.locator('td.f104625-date .value')).toHaveText('15 Jan 2024');
    await expect(view.page.locator('td.f104625-date .emptyValue')).toHaveCount(1);
    await expect(view.page.locator('td[id$="-fp"]')).toHaveCount(1);
    await expect(view.page.locator('#implant-date .value')).toHaveText(`10 Jan ${year}`);
  });

  // VIEW of the gender-specific methods (includeIf gender M / F): a male patient's VIEW has Vasectomy and none of the female-only methods.
  test('VIEW: a male patient is shown Vasectomy and none of the female-only methods', async ({ page, api, createEntryContext }) => {
    context = await createEntryContext({ givenName: 'AutoFpMale', familyName: 'Tester', gender: 'M', birthdate: birthdateYearsAgo(25) });
    await open(page);
    await page.locator('#fp-method').getByLabel('Vasectomy', { exact: true }).check();
    await save(page);
    await expect(page).toHaveURL(/referenceapplication\/home\.page/);
    const [encounter] = await getPatientEncounters(api, context.patient.uuid);

    const view = await expectViewShowsSavedObs(page, api, FORM, encounter.uuid);
    expect(await view.valueTexts()).toEqual(['[X] Vasectomy']);
    const methods = await view.page.locator('#fp-method').innerText();
    expect(methods).toContain('Vasectomy');
    for (const femaleOnly of ['Emergency contraceptive pills', 'Tubal ligation', 'Lactation amenorrhea method']) {
      expect(methods, femaleOnly).not.toContain(femaleOnly);
    }
  });
});
