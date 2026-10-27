import { test, expect, birthdateYearsAgo } from '../../core';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import { EntryFormPage } from '../../pages';
import type { APIRequestContext, Page } from '@playwright/test';

// ayfsIntake.xml: "AYFS Initial", the adolescent and youth friendly services first visit (GBV screening, referral,
// reason for visit, family planning history and method, STI screening, rapid tests, diagnosis, drug orders, outcome).
// The specs open enterHtmlFormWithStandardUi in a visit they create for a 17-year-old (availability, see
// documentation/_availability.e2e.md: enableMCHForms, enterMCH, "Maternal and Child Location" session tag, age 10-24,
// no AYFS encounter in the visit, is not exercised). The harness session (MCH OPD) has the tag, so provider (current
// user) and location (session location) start filled; the form uses <submit>, so the button is #buttons input.submitButton.
//
// Conditions in the form, from documentation inventory (ayfsIntake.inv.md):
//   ifMode VIEW include=false :32, :635   title and #buttons only in ENTER/EDIT (VIEW cannot be opened: no form on a REST encounter)
//   when Referred from = Other   :115     show #other-ref-text (the answer is PIH:5622, the <when> says CIEL:5622: same concept)
//   when reason for visit = Other :168    show #other-visit-reason (one <when> on each of the 7 reason checkboxes)
//   toggle FP history checkbox   :213     un-dim .f<dID>-date (opacity 1 and inputs enabled; otherwise 0.5 and disabled)
//   when FP method Jadelle/IUD   :362-363 show #implant-date (the second value, CIEL:5275 = IUD, is not offered there)
//   includeIf patient is female  :414     "Other contraceptive methods" (emergency contraceptive pills) checkbox
// Scripts: setUpNextAndSubmitButtons() (:23, nextAndSubmitButtons.js): no #next here, only wires #submit; nothing observable.
//   Shared: encounter-provider-location-date, rapid-tests-widget, drug-order-widget (see _shared).
// Side effects on save: ApplyDispositionAction and CleanDiagnosisConstructAction (:20-21); no enrolment.
// Not covered here: lab orders (pihLabOrder :492) and drug orders (:581) are never filled (a saved order cannot be purged),
// the disposition (ApplyDispositionAction), the diagnosis search, the rapid-test widget (see _shared), VIEW/EDIT.
//
// Findings:
//   V1 High (FIXED, SL-1458) :470-473 "Symptoms/problems around the genitalia?" answers CIEL:1115,CIEL:1116 (Normal, Abnormal) but is labelled
//                      yes,no: "Yes" (symptoms) saves Normal and "No" saves Abnormal. Fixed: the answers are now CIEL:1116,CIEL:1115
//                      (Abnormal, Normal), in the yes,no order. TESTED below; same line shape in ayfsFollowup :358-360.
//   V2 Medium (FIXED, SL-1467) :113-122 each reason checkbox carries a <when> whose target is #other-visit-reason: ticking any other reason while
//                      "Other" is ticked hides the box, and the text typed in it is dropped on save (hidden widgets are not
//                      submitted). Fixed: the box is shown from a standalone "Other" checkbox (#vr-other) after the repeat. TESTED below.
//   V3 Medium :362-363 #implant-date is shown for Jadelle (CIEL:1873) and CIEL:5275 (IUD), which this block never offers; ticking
//                      Implanon (CIEL:76022) or "Other implant" never shows it (copied from the family planning forms). Fix:
//                      <when> on CIEL:76022 instead of CIEL:5275. TESTED below (test.fail).
//   V4 Low    :525,:555,:614 answerCodeXX / answerCodesXX (typo or disabled) are ignored: the diagnosis and "Referred to" labels
//                      are the concept names, not translatable messages.

const FORM = 'ayfsIntake.xml';
const AYFS_INTAKE_ENCOUNTER_TYPE_UUID = '1f3375af-fd9e-42a9-954e-99533ee15de9'; // formEncounterType, line 17

const GBV_QUESTIONS = ['Has anyone hit', 'Has anyone insulted', 'Has anyone forced', 'Has anyone made'];
const SAVE = '#buttons input.submitButton';

const radioOf = (page: Page, rowText: string) => page.locator('p', { hasText: rowText }).locator('input[type=radio]');
const checkboxOf = (page: Page, wrapperId: string) => page.locator(`#${wrapperId} input[type=checkbox]`);

// Answers the four required GBV questions with No.
const answerGbvNo = async (page: Page) => {
  for (const q of GBV_QUESTIONS) {
    await radioOf(page, q).nth(1).check();
  }
};

// "<concept>=<value>" for each obs of the encounter (coded values by their name).
const obsSummary = async (api: APIRequestContext, encounterUuid: string): Promise<string[]> =>
  (await getEncounterObs(api, encounterUuid)).map((o) => {
    const v = o.value as { display?: string } | string | number | null;
    return `${o.concept.display}=${typeof v === 'object' && v !== null ? v.display : v}`;
  });

test.describe('ayfsIntake', () => {
  const open = async (page: Page, createEntryContext: Parameters<Parameters<typeof test>[2]>[0]['createEntryContext'], gender: 'F' | 'M' = 'F') => {
    const context = await createEntryContext({
      givenName: 'AutoAyfs',
      familyName: 'Tester',
      gender,
      birthdate: birthdateYearsAgo(17),
    });
    await EntryFormPage.open(page, FORM, context);
    await expect(page.locator(SAVE)).toBeVisible();
    return context;
  };

  test('saving without the four GBV questions does not save', async ({ page, api, createEntryContext }) => {
    // required="true" on the four GBV radios (:70, :79, :88, :96)
    const context = await open(page, createEntryContext);
    await page.locator(SAVE).click();
    await expect(page.locator('span.field-error', { hasText: 'Required' })).toHaveCount(4);
    await expect(page).not.toHaveURL(/referenceapplication\/home\.page/);
    expect(await getPatientEncounters(api, context.patient.uuid)).toHaveLength(0);
  });

  test('every referral, diagnosis and referred-to answer renders (the concepts resolve)', async ({ page, createEntryContext }) => {
    await open(page, createEntryContext);
    await expect(page.locator('#referral-list input[type=radio]')).toHaveCount(14);
    await expect(page.locator('#referral-role input[type=radio]')).toHaveCount(5);
    await expect(page.locator('#visit-reason input[type=checkbox]')).toHaveCount(7);
    await expect(page.locator('#ayfs-dx input[type=checkbox]')).toHaveCount(12);
    await expect(page.locator('#sti-dx input[type=checkbox]')).toHaveCount(10);
    await expect(page.locator('#outcome-section p input[type=checkbox]')).toHaveCount(8);
  });

  test('"Referred from: Other" shows the specify box and any other answer hides it', async ({ page, createEntryContext }) => {
    // when :115 (PIH:5622 in the answer list and CIEL:5622 in the <when> are the same concept)
    await open(page, createEntryContext);
    const target = page.locator('#other-ref-text');
    await expect(target).toBeHidden();
    await page.locator('#referral-list input').nth(13).check(); // Other
    await expect(target).toBeVisible();
    await page.locator('#referral-list input').nth(0).check();
    await expect(target).toBeHidden();
  });

  test('"Other" as the reason for the visit shows its text box', async ({ page, createEntryContext }) => {
    // when :168 on #vr-other
    await open(page, createEntryContext);
    const target = page.locator('#other-visit-reason');
    await expect(target).toBeHidden();
    await checkboxOf(page, 'vr-other').check();
    await expect(target).toBeVisible();
    await checkboxOf(page, 'vr-other').uncheck();
    await expect(target).toBeHidden();
  });

  // V2 (Medium, fixed): the reason checkboxes each had their own <when>, so ticking Family planning while Other was ticked hid the
  // box and the typed text was lost. Now the box stays while Other is ticked and its text is saved.
  test('the other-reason box stays visible while another reason is ticked too, and its text saves (V2)', async ({
    page,
    api,
    createEntryContext,
  }) => {
    const context = await open(page, createEntryContext);
    await answerGbvNo(page);
    await checkboxOf(page, 'vr-other').check();
    await page.locator('#other-visit-reason textarea').fill('Walk-in for advice');
    await checkboxOf(page, 'vr-fp').check();
    await expect(page.locator('#other-visit-reason')).toBeVisible();
    await page.locator(SAVE).click();
    await expect(page).toHaveURL(/referenceapplication\/home\.page/);
    const [encounter] = await getPatientEncounters(api, context.patient.uuid);
    expect((await obsSummary(api, encounter.uuid)).some((o) => o.endsWith('=Walk-in for advice'))).toBeTruthy();
  });

  test.describe('family planning history: checking a method un-dims its dates', () => {
    for (const [dID, name] of [
      ['104625', 'Microgynon'],
      ['1873', 'Jadelle'],
      ['190', 'Condoms'],
    ]) {
      test(`${name}`, async ({ page, createEntryContext }) => {
        // toggle :213 {id: 'f<dID>-date', style: 'dim'}
        await open(page, createEntryContext);
        const dates = page.locator(`td.f${dID}-date`).first();
        await expect(dates).toHaveCSS('opacity', '0.5');
        await expect(dates.locator('input').first()).toBeDisabled();
        await page.locator(`#f${dID}-fp input[type=checkbox]`).check();
        await expect(dates).toHaveCSS('opacity', '1');
        await expect(dates.locator('input').first()).toBeEnabled();
        await page.locator(`#f${dID}-fp input[type=checkbox]`).uncheck();
        await expect(dates).toHaveCSS('opacity', '0.5');
      });
    }
  });

  test('ticking Jadelle shows the implant date and unticking hides it', async ({ page, createEntryContext }) => {
    // when :362 (CIEL:1873)
    await open(page, createEntryContext);
    await expect(page.locator('#implant-date')).toBeHidden();
    await checkboxOf(page, 'fp-meth-1873').check();
    await expect(page.locator('#implant-date')).toBeVisible();
    await checkboxOf(page, 'fp-meth-1873').uncheck();
    await expect(page.locator('#implant-date')).toBeHidden();
  });

  // V3 (Medium): the second <when> value is CIEL:5275 (IUD), not offered in the implant block, so Implanon (CIEL:76022)
  // never shows the date. Intended: any implant shows it. Remove test.fail() when fixed.
  test('ticking Implanon shows the implant date (V3)', async ({ page, createEntryContext }) => {
    test.fail();
    await open(page, createEntryContext);
    await checkboxOf(page, 'fp-meth-76022').check();
    await expect(page.locator('#implant-date')).toBeVisible();
  });

  test('"Other contraceptive methods" is offered to a female patient only', async ({ page, createEntryContext }) => {
    // includeIf $patient.gender == 'F' :414
    await open(page, createEntryContext, 'F');
    await expect(page.getByText('Other contraceptive methods', { exact: true })).toBeVisible();
  });

  test('"Other contraceptive methods" is not offered to a male patient', async ({ page, createEntryContext }) => {
    // includeIf $patient.gender == 'F' :414 (availability allows any sex aged 10-24)
    await open(page, createEntryContext, 'M');
    await expect(page.getByText('Other contraceptive methods', { exact: true })).toHaveCount(0);
  });

  // V1 (High, fixed): the genitalia question is labelled yes/no and its answers used to be Normal/Abnormal in that order, so "Yes" saved Normal.
  // "Yes" (symptoms present) saves Abnormal and "No" saves Normal.
  for (const [radio, label, saved] of [
    [0, 'Yes', 'Abnormal'],
    [1, 'No', 'Normal'],
  ] as const) {
    test(`answering ${label} to genital symptoms saves ${saved} (V1)`, async ({ page, api, createEntryContext }) => {
      const context = await open(page, createEntryContext);
      await answerGbvNo(page);
      await radioOf(page, 'Symptoms/problems around the genitalia').nth(radio).check(); // answerCodes yes,no
      await page.locator(SAVE).click();
      await expect(page).toHaveURL(/referenceapplication\/home\.page/);
      const [encounter] = await getPatientEncounters(api, context.patient.uuid);
      const obs = (await obsSummary(api, encounter.uuid)).filter((o) => o.startsWith('Urogenital exam findings='));
      expect(obs).toEqual([`Urogenital exam findings=${saved}`]);
    });
  }

  test('saves the screening answers, referral, reason, family planning method and a note', async ({
    page,
    api,
    createEntryContext,
  }) => {
    const context = await open(page, createEntryContext);
    await answerGbvNo(page);
    await page.locator('#referral-list input').nth(13).check(); // Other
    await page.locator('#other-ref-text textarea').fill('Neighbour clinic');
    await page.locator('#referral-role input').nth(2).check(); // self
    await radioOf(page, 'School status').nth(0).check(); // in school
    await checkboxOf(page, 'vr-other').check();
    await page.locator('#other-visit-reason textarea').fill('Walk-in for advice');
    await checkboxOf(page, 'fp-meth-1873').check(); // Jadelle
    await page.locator(SAVE).click();
    await expect(page).toHaveURL(/referenceapplication\/home\.page/);

    const encounters = await getPatientEncounters(api, context.patient.uuid);
    expect(encounters.map((e) => e.encounterType.uuid)).toEqual([AYFS_INTAKE_ENCOUNTER_TYPE_UUID]);
    const obs = await obsSummary(api, encounters[0].uuid);
    expect(obs).toEqual(
      expect.arrayContaining([
        'Hit, kicked, punched, or otherwise hurt in the past year=No',
        'Someone caused feelings of fear, unsafety, or danger in the past year=No',
        'School referring student=Other',
        'Other referral (text)=Neighbour clinic',
        'Type of referral role=Self-refer',
        'Student attending school=Yes',
        'Reason for visit=Other',
        'Method of family planning=Jadelle (implantable contraceptive)',
      ]),
    );
  });
});
