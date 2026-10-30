import type { APIRequestContext, Locator, Page } from '@playwright/test';
import { type EntryContext, test, expect, birthdateYearsAgo } from '../../core';
import { MCH_OPD_LOCATION_UUID } from '../../core/constants';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import { EntryFormPage, expectViewShowsSavedObs, selectDefaultProvider, VISIT_PAGE_URL } from '../../pages';

// gynecologyFollowup.xml: gynecology followup visit (vitals, gynecology exam, planned procedures, diagnoses, rapid tests, lab and
// drug orders, follow-up clinic and disposition). A top-level form: the specs open enterHtmlFormWithStandardUi inside a visit
// they create, so availability (documentation/_availability.e2e.md: enableMCHForms + mchGynecologyForms (KGH), enterMCH,
// "Maternal and Child Location" session tag, female >= 10, no gynecology intake or followup in the visit) is not exercised.
// The session location (MCH OPD) has the tag, so the Location select is preselected and Save works with the defaults.
// Unlike gynecologyFollowup.xml it has no family planning, menstrual, pregnancy or clinical history and no procedure history.
//
// Conditions in the form, from documentation inventory (gynecologyFollowup.inv.md):
//   when CIEL:161558 = Yes     :161   show #sti-list (seven STI checkboxes) when "STI suspected?" is Yes
//   ifMode VIEW include=false  :25,:45,:307  CSS, heading, #buttons in ENTER/EDIT only
// Sub-forms (documentation/_shared.e2e.md): encounter-provider-location-date, prior-vital-signs-widget (+ .js),
// vital-signs-wt-ht-bp-widget, rapid-tests-widget (HIV "Not performed" reason tested; V5 of _shared), drug-order-widget.
//
// Scripts: :36-41 setUpNextAndSubmitButtons() only (no #next / .nextSection buttons: Save posts the form).
// Side effects on save: ApplyDispositionAction and CleanDiagnosisConstructAction (:20-21; no disposition or diagnosis is
// chosen here). pihLabOrder (:263) and drug orders (:270) can create orders.
// Not covered here: lab and drug orders and the disposition (a saved testorder cannot be purged), diagnosis search, the
// procedure autocompletes, EDIT mode, the Next/Save navigation script. VIEW is covered by the full save test (every section) and VW1.
//
// Findings (the same issues as gynecologyFollowup.xml, at these lines):
//   V1 Medium :140,:222  every hidden CIEL:1937 obs has a defaultValue (6, 1-3), so the "showIfEmpty=false" obsgroups (cryotherapy
//                       CIEL:1938 :137, planned procedures PIH:21483 :220) are never empty: each save stores 1 + 3 empty groups
//                       with only their index. Fix: fill the index from script when the group has a value, or drop the hidden
//                       defaults. TESTED below (test.fixme).
//   V2 Low    :87-122   the exam checkboxes carry class normalObs / abnormalObs but nothing makes them exclusive (ancProgress
//                       and newbornDischarge have a handler): "Normal" and "Condyloma" can be saved together (intent
//                       unconfirmed, not asserted).
//   V3 Low    :158      "STI suspected?" (CIEL:161558) is saved as "Patient tested for sexually transmitted illness in current
//                       visit" (Yes/No): the label asks about suspicion, the concept records a test (concept unconfirmed).
//   V4 Low    :170      the STI rows use class="{switch}" but their <render>s define finding/name, so the rendered class is
//                       literally "{switch}" (also :175-181). Harmless, nothing targets it.
//   VW1 Low   :220-232  the V1 defaults also show in VIEW: the empty planned-procedure groups are rendered as blank "____" lines (3), because the
//                       groups are never empty. Fix: V1. TESTED below (test.fixme).
//   VW2 Info :161  the STI list (#sti-list) is always rendered in VIEW, as seven empty checkboxes when "STI suspected?" is not Yes (when/thenDisplay is
//                   ENTER/EDIT only; same as gainNewbornRegister VW1; not tested).

const FORM = 'gynecologyFollowup.xml';
const GYN_FOLLOWUP_ENCOUNTER_TYPE_UUID = '9b973514-7799-41b6-85f1-1ebc752d01f0';
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

const save = async (page: Page) => {
  await selectDefaultProvider(page); // blank when the logged-in user has no Provider account
  await page.locator('#buttons input.submitButton').click();
};

// "<concept>=<value>" for each obs of the encounter (coded values by their name).
const obsSummary = async (api: APIRequestContext, encounterUuid: string): Promise<string[]> =>
  (await getEncounterObs(api, encounterUuid)).map((o) => {
    const v = o.value as { display?: string } | string | number;
    return `${o.concept.display}=${typeof v === 'object' && v !== null ? v.display : v}`;
  });

test.describe('gynecologyFollowup', () => {
  let context: EntryContext;

  const open = async (page: Page) => {
    await EntryFormPage.open(page, FORM, context);
    await expect(page.locator('#buttons input.submitButton')).toBeVisible();
  };

  test.beforeEach(async ({ createEntryContext }) => {
    context = await createEntryContext({
      givenName: 'AutoGynFollowup',
      familyName: 'Tester',
      gender: 'F',
      birthdate: birthdateYearsAgo(30),
    });
  });

  test('the STI list shows only when "STI suspected" is Yes', async ({ page }) => {
    // when :161
    await open(page);
    const list = page.locator('#sti-list');
    await expect(list).toBeHidden();
    await page.locator('#susp-sti').getByLabel('Yes', { exact: true }).check();
    await expect(list).toBeVisible();
    await expect(list.locator('input[type=checkbox]')).toHaveCount(7);
    await page.locator('#susp-sti').getByLabel('No', { exact: true }).check();
    await expect(list).toBeHidden();
  });

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
  // test.fixme() when fixed.
  test('saving with no procedure entered stores no procedure groups (V1)', async ({ page, api }) => {
    test.fixme();
    await open(page);
    await page.locator('#physical-exam').getByLabel('PAP test performed', { exact: true }).check();
    await save(page);
    await expect(page).toHaveURL(VISIT_PAGE_URL);

    const encounters = await getPatientEncounters(api, context.patient.uuid);
    const obs = await obsSummary(api, encounters[0].uuid);
    expect(obs.filter((o) => o.startsWith('Procedure performed quantity') || o.startsWith('Planned procedure set'))).toEqual([]);
  });

  // VW1 (Low): the V1 defaults also keep the empty planned-procedure groups in the VIEW, as blank "____" lines (3) next to the one real
  // "Other procedure planned" line. Intended: the empty groups are not shown. Remove test.fixme() when V1 is fixed.
  test('VIEW: no blank procedure lines for procedures that were not entered (VW1)', async ({ page, api }) => {
    test.fixme();
    await open(page);
    await page.locator('#physical-exam').getByLabel('PAP test performed', { exact: true }).check();
    await save(page);
    await expect(page).toHaveURL(VISIT_PAGE_URL);

    const [encounter] = await getPatientEncounters(api, context.patient.uuid);
    const view = await expectViewShowsSavedObs(page, api, FORM, encounter.uuid, { 'Papanicolaou test status: Completed': '[X] PAP test performed' });
    // only "Other procedure planned" may be blank
    expect(await view.page.locator('#procedures .emptyValue').count()).toBeLessThanOrEqual(1);
  });

  test('saves vitals, exam, rapid test and follow-up clinic as a gynecology followup encounter', async ({ page, api }) => {
    await open(page);

    await page.locator('#bp_systolic input').fill('115');
    await page.locator('#bp_diastolic input').fill('75');
    await page.locator('#weight input').fill('64');
    await page.locator('#height input').fill('166');

    const exam = page.locator('#physical-exam');
    await exam.getByLabel('Genital ulcers', { exact: true }).check();
    await exam.getByLabel('PAP test performed', { exact: true }).check();
    await exam.getByLabel('Neoplasm/cancer', { exact: true }).check(); // VIA result
    await page.locator('#susp-sti').getByLabel('Yes', { exact: true }).check();
    await page.locator('#sti-list').getByLabel('Gonorrhea', { exact: true }).check();
    await exam.getByLabel('IV', { exact: true }).check(); // Tanner stage

    await page.locator('#syphillis-rapid-test').getByLabel('Positive', { exact: true }).check();

    await setDate(page.locator('#apptDate input.hasDatepicker'), new Date().getFullYear() + 1, 10, 3);
    await page.locator('#disposition-section').getByLabel('Mental health', { exact: true }).check();

    await save(page);
    await expect(page).toHaveURL(VISIT_PAGE_URL);

    const encounters = await getPatientEncounters(api, context.patient.uuid);
    expect(encounters.map((e) => e.encounterType.uuid)).toEqual([GYN_FOLLOWUP_ENCOUNTER_TYPE_UUID]);
    const obs = await obsSummary(api, encounters[0].uuid);
    expect(obs).toEqual(
      expect.arrayContaining([
        'Systolic=115',
        'Diastolic=75',
        'Weight (kg)=64',
        'Height (cm)=166',
        'Gynecological exam findings=Genital ulcers',
        'Papanicolaou test status=Completed',
        'Colposcopy of cervix with acetic acid=Neoplasm/cancer',
        'Patient tested for sexually transmitted illness in current visit=Yes',
        'Suspected STD (coded)=Gonorrhea',
        'Tanner staging, qualitative=Stage IV',
        'Rapid syphilis test=Positive',
        'Return visit date=' + (new Date().getFullYear() + 1) + '-11-03',
        'Type of referral ordered=Mental health',
      ]),
    );

    // VIEW: every value is shown, with the form's own labels for the coded answers; the tests and rows that were left alone are not
    const nextYear = new Date().getFullYear() + 1;
    const view = await expectViewShowsSavedObs(page, api, FORM, encounters[0].uuid, {
      'Papanicolaou test status: Completed': '[X] PAP test performed',
      'Tanner staging, qualitative: Stage IV': '[X] IV',
      [`Return visit date: ${nextYear}-11-03`]: `03 Nov ${nextYear}`, // date-only values arrive as yyyy-MM-dd and are shown as dd MMM yyyy
    });
    const at = (selector: string) => view.page.locator(`${selector} .value`);
    for (const [id, value] of Object.entries({ bp_systolic: '115', bp_diastolic: '75', weight: '64', height: '166' })) {
      await expect(at(`#${id}`), id).toHaveText(value);
    }
    await expect(at('#physical-exam').filter({ hasText: 'Genital ulcers' })).toHaveText('[X] Genital ulcers');
    await expect(at('#physical-exam').filter({ hasText: 'Neoplasm/cancer' })).toHaveText('[X] Neoplasm/cancer');
    await expect(at('#susp-sti')).toHaveText('[X] Yes');
    await expect(at('#sti-list')).toHaveText('[X] Gonorrhea');
    await expect(at('#syphillis-rapid-test')).toHaveText('[X] Positive');
    await expect(view.page.locator('#hiv-rapid-test .value, #HBsAg .value, #encounter-disposition .value')).toHaveCount(0); // not filled
    await expect(at('#apptDate')).toHaveText(`03 Nov ${nextYear}`);
    await expect(view.page.locator('#disposition-section .value')).toHaveText([`03 Nov ${nextYear}`, '[X] Mental health']);
    await expect(view.page.locator('#buttons, textarea')).toHaveCount(0); // ifMode VIEW include=false :307
  });
});
