import type { APIRequestContext, Locator, Page } from '@playwright/test';
import { type EntryContext, test, expect, birthdateYearsAgo } from '../../core';
import { MCH_OPD_LOCATION_UUID } from '../../core/constants';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import { EntryFormPage } from '../../pages';

// familyPlanningFollowup.xml: family planning followup visit (disability, service type, vitals, method chosen today,
// appointment, referral out). A top-level form: the specs open enterHtmlFormWithStandardUi inside a visit they create, so
// availability (documentation/_availability.e2e.md: enableMCHForms + pregnancy, enterMCH, "Maternal and Child Location"
// session tag, female >= 10, no FP intake or followup in the visit) is not exercised. The session location (MCH OPD) has the
// tag, so the Location select is preselected and Save works with the defaults. The form has the same formUuid as
// familyPlanningFollowup.xml but formEncounterType 5a1d1710-... (asserted in the save test).
//
// Conditions in the form, from documentation inventory (familyPlanningFollowup.inv.md):
//   when Jadelle/Implanon      :223-224   show #implant-date (every box of the implant repeat carries both <when>s)
//   includeIf gender F         :275,:293,:315  Emergency contraceptive pills, Tubal ligation, LAM in "Family planning method"
//   includeIf gender M         :300       Vasectomy in the same section
//   ifMode VIEW include=false  :31,:359   heading and #buttons in ENTER/EDIT only
// Sub-forms (documentation/_shared.e2e.md): encounter-provider-location-date, prior-vital-signs-widget (+ .js),
// vital-signs-wt-ht-bp-widget (no scoring). Unlike the intake there is no earlier-methods history, post-partum or
// "accepts family planning" question.
//
// Scripts: :22-27 setUpNextAndSubmitButtons() only; there are no #next / .nextSection buttons, so Save posts the form.
// Side effects on save: ReopenVisitAction (:20, reopens a closed visit; the visit here is open). No program, order or
// disposition. No required field apart from the provider (preselected).
// Not covered here: EDIT and VIEW modes, a closed visit being reopened, the Next/Save navigation script.
//
// Findings (familyPlanningIntake.xml has the same V1, V2, the 160693 one and the male-branch one, at its own lines):
//   V1 Medium :223-224  the second <when> value is CIEL:5275 (intrauterine device) but the repeat renders Jadelle (CIEL:1873)
//                       and Implanon (CIEL:76022): ticking Implanon (or "Other implant") never shows #implant-date. Fix:
//                       value="CIEL:76022". TESTED below (test.fail).
//   V2 Low    :58       answerCodeXX="{name}" is not an HFE attribute (typo for answerCode): concept names are shown.
//   V3 Low    :16       formName="Family Planning Initial" although this is the followup form (copy of the intake; the title
//                       <h2> at :34 says "Family Planning Followup"). Fix: formName="Family Planning Followup".
//   V4 Low    :281-282  "Other contraceptive methods" > Emergency contraceptive pills is saved under CIEL:160693 "Method of
//                       contraception failure" = Emergency contraceptive pills, not under Method of family planning like every
//                       other method (intent unconfirmed; same in ayfs forms and familyPlanningIntake.xml:368-369).
//   V5 Info   :300      the male branch (Vasectomy) is unreachable in production: the availability row offers the form to
//                       females only (still tested with a male fixture).

const FORM = 'familyPlanningFollowup.xml';
const FP_FOLLOWUP_ENCOUNTER_TYPE_UUID = '5a1d1710-98b0-4e5f-8f6b-c9cef0c8cf05';
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

test.describe('familyPlanningFollowup', () => {
  let context: EntryContext;

  const open = async (page: Page) => {
    await EntryFormPage.open(page, FORM, context);
    await expect(page.locator('#buttons input.submitButton')).toBeVisible();
  };

  test.beforeEach(async ({ createEntryContext }) => {
    context = await createEntryContext({
      givenName: 'AutoFpFollowup',
      familyName: 'Tester',
      gender: 'F',
      birthdate: birthdateYearsAgo(25),
    });
  });

  // includeIf :275, :293, :300, :315
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

  test('ticking Jadelle shows the implant date, unticking hides it', async ({ page }) => {
    // when :223 (CIEL:1873)
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
    // encounterProviderAndRole required="true" (:48); the provider select starts on the current user
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

  test('saves the chosen method, vitals and appointment as an FP followup encounter', async ({ page, api }) => {
    await open(page);

    await page.locator('#disability').getByLabel('Hearing disorder', { exact: true }).check();
    await page.locator('#service').getByLabel('Post abortion', { exact: true }).check();

    await page.locator('#bp_systolic input').fill('110');
    await page.locator('#bp_diastolic input').fill('70');
    await page.locator('#weight input').fill('58');
    await page.locator('#height input').fill('158');

    await page.locator('#fp-method p', { hasText: 'Family planning counselling' }).getByLabel('no').check();
    await page.locator('#fp-meth-21450 input[type=checkbox]').check(); // Sayana press
    await page.locator('#fp-method').getByLabel('Emergency contraceptive pills', { exact: true }).check();

    await setDate(page.locator('#apptDate input.hasDatepicker'), new Date().getFullYear() + 1, 2, 5);
    await page.locator('#additional p', { hasText: 'Referred out' }).getByLabel('yes').check();

    await save(page);
    await expect(page).toHaveURL(/referenceapplication\/home\.page/);

    const encounters = await getPatientEncounters(api, context.patient.uuid);
    expect(encounters.map((e) => e.encounterType.uuid)).toEqual([FP_FOLLOWUP_ENCOUNTER_TYPE_UUID]);
    const obs = await obsSummary(api, encounters[0].uuid);
    expect(obs).toEqual(
      expect.arrayContaining([
        'Disability=Hearing disorder',
        'Visit type=Post-abortion treatment',
        'Systolic=110',
        'Diastolic=70',
        'Weight (kg)=58',
        'Height (cm)=158',
        'Family planning counseling=No',
        'Method of family planning=Sayana press',
        'Method of contraception failure=Emergency contraceptive pills', // V4: CIEL:160693, not Method of family planning
        'Return visit date=' + (new Date().getFullYear() + 1) + '-03-05',
        'Patient referred or escorted=Yes',
      ]),
    );
  });
});
