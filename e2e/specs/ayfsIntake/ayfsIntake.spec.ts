import { test, expect, birthdateYearsAgo } from '../../core';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import {
  EntryFormPage,
  SectionFormPage,
  ViewFormPage,
  expectViewShowsSavedObs,
  selectDefaultProvider,
  viewMismatches,
} from '../../pages';
import type { APIRequestContext, Locator, Page } from '@playwright/test';

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
// the disposition (ApplyDispositionAction), the diagnosis search, the rapid-test widget (see _shared). EDIT: one save, reopen, change, save
// round-trip (SL-1458, SL-1467). VIEW: every saved value is shown (expectViewShowsSavedObs, with the labels the form gives to the genitalia,
// referral-role, school-status and family planning answers) after the save tests and the EDIT round-trip, plus the dates ("dd MMM yyyy"), the
// "Other" specify boxes and the diagnoses. The diagnosis widget (#data-collection, :525) comes before the two checkbox lists, consumes the saved diagnosis
// groups and shows them as "(Presumed) Malaria [B54]" under "Secondary Diagnosis", so the lists stay blank in VIEW (where the checkboxes come first, as in
// cervicalCancerScreening.xml, they are rendered as well): widget behaviour, not a finding; the helper's "Diagnosis" mismatches are filtered for that reason.
//
// Findings:
//   V1 High (fixed in PR #363, SL-1458; not on kgh-demo yet) :470-473 "Symptoms/problems around the genitalia?" answers CIEL:1115,CIEL:1116 (Normal, Abnormal) but is labelled
//                      yes,no: "Yes" (symptoms) saves Normal and "No" saves Abnormal. Fixed: the answers are now CIEL:1116,CIEL:1115
//                      (Abnormal, Normal), in the yes,no order. TESTED below; same line shape in ayfsFollowup :358-360.
//   V2 Medium (fixed in PR #363, SL-1467; not on kgh-demo yet) :113-122 each reason checkbox carries a <when> whose target is #other-visit-reason: ticking any other reason while
//                      "Other" is ticked hides the box, and the text typed in it is dropped on save (hidden widgets are not
//                      submitted). Fixed: the box is shown from a standalone "Other" checkbox (#vr-other) after the repeat. TESTED below.
//   V3 Medium :362-363 #implant-date is shown for Jadelle (CIEL:1873) and CIEL:5275 (IUD), which this block never offers; ticking
//                      Implanon (CIEL:76022) or "Other implant" never shows it (copied from the family planning forms). Fix:
//                      <when> on CIEL:76022 instead of CIEL:5275. TESTED below (test.fixme).
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

// The date widgets are read-only jQuery UI datepickers; setDate also updates the hidden field that is submitted.
const setDate = (display: Locator, year: number, monthIndex: number, day: number) =>
  display.evaluate(
    (el, [y, m, d]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).jq(el).datepicker('setDate', new Date(y, m, d));
    },
    [year, monthIndex, day],
  );

// Coded answers the form labels differently from the concept name (obs display -> text shown in VIEW): the yes/no answerCodes
// of the genitalia question (Abnormal is "yes"), the referral-role and school-status labels, the Jadelle and Microgynon labels.
const VIEW_LABELS: Record<string, string> = {
  'Urogenital exam findings: Abnormal': 'yes',
  'Urogenital exam findings: Normal': 'no',
  'Type of referral role: Self-refer': 'self',
  'Student attending school: Yes': 'in school',
  'Method of family planning: Jadelle (implantable contraceptive)': 'Jadelle',
  'Method of family planning: Ethinyl estradoil / Levonorgestrel': 'Microgynon',
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
    await selectDefaultProvider(page);
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

  // V2 (Medium, fixed in PR #363, not on kgh-demo yet): the reason checkboxes each had their own <when>, so ticking Family planning while Other was ticked hid the
  // box and the typed text was lost. Now the box stays while Other is ticked and its text is saved.
  // Skipped: the form fix (SL-1467, PR #363) is not on kgh-demo yet. Remove test.fixme() once it is released.
  test('the other-reason box stays visible while another reason is ticked too, and its text saves (V2)', async ({
    page,
    api,
    createEntryContext,
  }) => {
    test.fixme();
    const context = await open(page, createEntryContext);
    await answerGbvNo(page);
    await checkboxOf(page, 'vr-other').check();
    await page.locator('#other-visit-reason textarea').fill('Walk-in for advice');
    await checkboxOf(page, 'vr-fp').check();
    await expect(page.locator('#other-visit-reason')).toBeVisible();
    await selectDefaultProvider(page);
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
  // never shows the date. Intended: any implant shows it. Remove test.fixme() when fixed.
  test('ticking Implanon shows the implant date (V3)', async ({ page, createEntryContext }) => {
    test.fixme();
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

  // V1 (High, fixed in PR #363, not on kgh-demo yet): the genitalia question is labelled yes/no and its answers used to be Normal/Abnormal in that order, so "Yes" saved Normal.
  // "Yes" (symptoms present) saves Abnormal and "No" saves Normal.
  for (const [radio, label, saved] of [
    [0, 'Yes', 'Abnormal'],
    [1, 'No', 'Normal'],
  ] as const) {
    // Skipped: the form fix (SL-1458, PR #363) is not on kgh-demo yet. Remove test.fixme() once it is released.
    test(`answering ${label} to genital symptoms saves ${saved} (V1)`, async ({ page, api, createEntryContext }) => {
      test.fixme();
      const context = await open(page, createEntryContext);
      await answerGbvNo(page);
      await radioOf(page, 'Symptoms/problems around the genitalia').nth(radio).check(); // answerCodes yes,no
      await selectDefaultProvider(page);
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
    await selectDefaultProvider(page);
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
    const view = await expectViewShowsSavedObs(page, api, FORM, encounters[0].uuid, VIEW_LABELS);
    // (some labels are short: check them as whole selected options too)
    const shown = await view.valueTexts();
    for (const expected of ['[X] no', '[X] Other', 'Neighbour clinic', '[X] self', '[X] in school', '[X] other', 'Walk-in for advice', '[X] Jadelle']) {
      expect(shown, expected).toContain(expected);
    }
  });

  // VIEW: every saved value is shown under the form's own label, the "Other" specify boxes appear, and what was not filled is not shown.
  test('VIEW: shows the saved answers by their form labels, the history and method groups, dates and diagnoses', async ({
    page,
    api,
    createEntryContext,
  }) => {
    const context = await open(page, createEntryContext);
    await answerGbvNo(page);
    await radioOf(page, 'Has anyone hit').nth(0).check(); // yes: overrides the No above
    await page.locator('#referral-list input').nth(13).check(); // Other
    await page.locator('#other-ref-text textarea').fill('Neighbour clinic');
    await page.locator('#referral-role input').nth(2).check(); // self
    await radioOf(page, 'School status').nth(1).check(); // out of school
    await checkboxOf(page, 'vr-fp').check();
    await checkboxOf(page, 'vr-other').check();
    await page.locator('#other-visit-reason textarea').fill('Walk-in for advice');
    await checkboxOf(page, 'f104625-fp').check(); // history: Microgynon with a start date
    await setDate(page.locator('td.f104625-date input.hasDatepicker').first(), 2024, 0, 15);
    await checkboxOf(page, 'fp-meth-1873').check(); // Jadelle: implant date
    await setDate(page.locator('#implant-date input.hasDatepicker'), 2025, 2, 10);
    await radioOf(page, 'Symptoms/problems around the genitalia').nth(0).check(); // yes -> Abnormal
    await page.locator('#ayfs-dx input[type=checkbox]').nth(1).check(); // Malaria
    await page.locator('#sti-dx input[type=checkbox]').nth(0).check(); // Syphilis
    await setDate(page.locator('#apptDate input.hasDatepicker'), new Date().getFullYear() + 1, 5, 20);
    await page.locator('#outcome-section p input[type=checkbox]').nth(0).check(); // referred to NCD
    await selectDefaultProvider(page);
    await page.locator(SAVE).click();
    await expect(page).toHaveURL(/referenceapplication\/home\.page/);
    const [encounter] = await getPatientEncounters(api, context.patient.uuid);

    // dates are shown as "dd MMM yyyy"; the diagnoses are shown by the diagnosis widget, not in a span.value (checked below)
    const apptYear = new Date().getFullYear() + 1;
    const labels = {
      ...VIEW_LABELS,
      'Family planning start date: 2024-01-15': '15 Jan 2024',
      'Date of implant placement: 2025-03-10': '10 Mar 2025',
      [`Return visit date: ${apptYear}-06-20`]: `20 Jun ${apptYear}`,
    };
    const view = await ViewFormPage.open(page, FORM, encounter.uuid);
    expect((await viewMismatches(api, view, encounter.uuid, labels)).filter((m) => !m.startsWith('Diagnosis'))).toEqual([]);
    const shown = await view.valueTexts();
    for (const expected of [
      '[X] yes', // the GBV answer and the genitalia answer
      '[X] no',
      '[X] Other', // referred from
      'Neighbour clinic',
      '[X] self',
      '[X] out of school',
      '[X] Family planning',
      '[X] other', // reason for visit
      'Walk-in for advice',
      '[X] Microgynon',
      '15 Jan 2024',
      '[X] Jadelle',
      '10 Mar 2025',
      `20 Jun ${apptYear}`,
      '[X] NCD clinic',
    ]) {
      expect(shown, expected).toContain(expected);
    }
    // the genitalia question: "Abnormal" is saved, "yes" is shown
    await expect(view.page.locator('p', { hasText: 'Symptoms/problems around the genitalia' }).locator('.value')).toHaveText('[X] yes');
    // the diagnoses come from the diagnosis widget; the two checkbox lists stay blank in VIEW
    await expect(view.page.locator('#data-collection')).toContainText('Malaria');
    await expect(view.page.locator('#data-collection')).toContainText('Syphilis');
    await expect(view.page.locator('#data-collection')).not.toContainText('Typhoid');
    // nothing was ticked for the other methods, reasons or referrals
    for (const unexpected of ['[X] Implanon', '[X] ANC', '[X] Hormonal IUD', '[X] OPD', '[X] Typhoid']) {
      expect(shown, unexpected).not.toContain(unexpected);
    }
    await expect(view.page.locator('#sti-screen .value')).toHaveCount(1); // only the genitalia answer in the STI section
  });

  // EDIT round-trip (SL-1458, SL-1467): the genitalia answer and the "Other" reason text come back as saved, and a second save replaces them.
  // Skipped: the form fix (SL-1458, SL-1467, PR #363) is not on kgh-demo yet. Remove test.fixme() once it is released.
  test('EDIT: reopening shows the saved genitalia answer and other-reason text, and a second save replaces them', async ({
    page,
    api,
    createEntryContext,
  }) => {
    test.fixme();
    const context = await open(page, createEntryContext);
    await answerGbvNo(page);
    await radioOf(page, 'Symptoms/problems around the genitalia').nth(0).check(); // yes -> Abnormal
    await checkboxOf(page, 'vr-other').check();
    await page.locator('#other-visit-reason textarea').fill('Walk-in for advice');
    await checkboxOf(page, 'vr-fp').check();
    await selectDefaultProvider(page);
    await page.locator(SAVE).click();
    await expect(page).toHaveURL(/referenceapplication\/home\.page/);
    const [encounter] = await getPatientEncounters(api, context.patient.uuid);
    expect(await obsSummary(api, encounter.uuid)).toContain('Urogenital exam findings=Abnormal');

    await page.goto(
      SectionFormPage.editUrl(FORM, { patient: context.patient, encounter: { uuid: encounter.uuid, visitUuid: context.visitUuid } }),
    );
    await expect(page.locator(SAVE)).toBeVisible();
    const genitalia = radioOf(page, 'Symptoms/problems around the genitalia');
    await expect(genitalia.nth(0)).toBeChecked();
    await expect(genitalia.nth(1)).not.toBeChecked();
    await expect(checkboxOf(page, 'vr-other')).toBeChecked();
    await expect(checkboxOf(page, 'vr-fp')).toBeChecked();
    await expect(page.locator('#other-visit-reason')).toBeVisible();
    await expect(page.locator('#other-visit-reason textarea')).toHaveValue('Walk-in for advice');

    // change the answer, the text, and drop the other reason
    await genitalia.nth(1).check(); // no -> Normal
    await page.locator('#other-visit-reason textarea').fill('Follow-up question');
    await checkboxOf(page, 'vr-fp').uncheck();
    await page.locator(SAVE).click();
    await expect(page).toHaveURL(/referenceapplication\/home\.page/);

    const obs = await obsSummary(api, encounter.uuid);
    expect(obs.filter((o) => o.startsWith('Urogenital exam findings='))).toEqual(['Urogenital exam findings=Normal']);
    expect(obs.filter((o) => o.endsWith('=Follow-up question'))).toHaveLength(1);
    expect(obs.some((o) => o.endsWith('=Walk-in for advice'))).toBeFalsy();
    expect(obs.filter((o) => o.startsWith('Reason for visit='))).toEqual(['Reason for visit=Other']);

    // VIEW shows the second save: the new text and answer, and nothing of what was replaced or dropped
    const view = await expectViewShowsSavedObs(page, api, FORM, encounter.uuid, VIEW_LABELS);
    const shown = await view.valueTexts();
    expect(shown).toContain('Follow-up question');
    expect(shown).not.toContain('Walk-in for advice');
    expect(shown).not.toContain('[X] Family planning');
    await expect(view.page.locator('p', { hasText: 'Symptoms/problems around the genitalia' }).locator('.value')).toHaveText('[X] no');
  });
});
