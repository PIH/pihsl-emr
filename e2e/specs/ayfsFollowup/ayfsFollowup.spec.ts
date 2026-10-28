import { test, expect, birthdateYearsAgo } from '../../core';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import { EntryFormPage, SectionFormPage, ViewFormPage, expectViewShowsSavedObs, viewMismatches } from '../../pages';
import type { APIRequestContext, Locator, Page } from '@playwright/test';

// ayfsFollowup.xml: "AYFS Followup", the follow-up visit of ayfsIntake.xml without its referral and family planning
// history sections (GBV screening, reason for visit, family planning method, STI screening, rapid tests, diagnosis,
// drug orders, outcome). The specs open enterHtmlFormWithStandardUi in a visit they create for a 17-year-old (availability,
// see documentation/_availability.e2e.md: enableMCHForms, enterMCH, MCH location tag, age 10-24, no AYFS encounter in the
// visit, is not exercised). Provider and location start filled; the form uses <submit> (#buttons input.submitButton).
//
// Conditions in the form, from documentation inventory (ayfsFollowup.inv.md):
//   ifMode VIEW include=false :32, :518   title and #buttons only in ENTER/EDIT (VIEW cannot be opened over REST data)
//   when reason for visit = Other :111    show #other-visit-reason (one <when> on each of the 7 reason checkboxes)
//   when FP method Jadelle/IUD   :251-252 show #implant-date (CIEL:5275 = IUD is not offered in the implant block)
//   includeIf patient is female  :301     "Other contraceptive methods" (emergency contraceptive pills) checkbox
// Scripts: setUpNextAndSubmitButtons() (:23): only wires #submit; nothing observable. Shared widgets: see _shared.
// Side effects on save: ApplyDispositionAction and CleanDiagnosisConstructAction (:20-21); no enrolment.
// Not covered here: lab and drug orders (:373, :468; a saved order cannot be purged), the disposition, the diagnosis
// search, rapid tests (see _shared). EDIT: one save, reopen, change, save round-trip (SL-1458, SL-1467). VIEW: every saved value is shown
// (expectViewShowsSavedObs, with the labels the form gives to the genitalia and Jadelle answers) after the save tests and the EDIT round-trip, plus
// the dates ("dd MMM yyyy") and the diagnoses. The diagnosis widget (#data-collection) comes before the checkbox lists, consumes the saved diagnosis groups
// and shows them as "(Presumed) Malaria [B54]" under "Secondary Diagnosis", so the lists stay blank in VIEW: widget behaviour, not a finding (see ayfsIntake);
// the helper's "Diagnosis" mismatches are filtered for that reason.
//
// Findings (same shapes as ayfsIntake.xml; ids are the same):
//   V1 High (FIXED, SL-1458) :358-360 "Symptoms/problems around the genitalia?" answers CIEL:1115,CIEL:1116 (Normal, Abnormal) but is labelled
//                      yes,no: "Yes" saves Normal. Fixed: answers are now CIEL:1116,CIEL:1115 (Abnormal, Normal) in the yes,no order. TESTED below.
//   V2 Medium (FIXED, SL-1467) :107-116 each reason checkbox carries a <when> on #other-visit-reason: ticking another reason while "Other" is
//                      ticked hides the box and its text is dropped on save. Fixed: the box is shown from a standalone "Other" checkbox (#vr-other) after the repeat. TESTED below.
//   V3 Medium :251-252 #implant-date shows for Jadelle and CIEL:5275 (IUD, not offered here), never for Implanon (CIEL:76022)
//                      or "Other implant". Fix: <when> on CIEL:76022. TESTED below (test.fail).
//   V4 Low    :412,:442,:501 answerCodeXX / answerCodesXX are ignored: diagnosis and "Referred to" labels are concept names.

const FORM = 'ayfsFollowup.xml';
const AYFS_FOLLOWUP_ENCOUNTER_TYPE_UUID = '73399721-644e-494b-86c9-5dd345072db3'; // formEncounterType, line 16

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
// of the genitalia question (Abnormal is "yes") and the Jadelle label.
const VIEW_LABELS: Record<string, string> = {
  'Urogenital exam findings: Abnormal': 'yes',
  'Urogenital exam findings: Normal': 'no',
  'Method of family planning: Jadelle (implantable contraceptive)': 'Jadelle',
};

// "<concept>=<value>" for each obs of the encounter (coded values by their name).
const obsSummary = async (api: APIRequestContext, encounterUuid: string): Promise<string[]> =>
  (await getEncounterObs(api, encounterUuid)).map((o) => {
    const v = o.value as { display?: string } | string | number | null;
    return `${o.concept.display}=${typeof v === 'object' && v !== null ? v.display : v}`;
  });

test.describe('ayfsFollowup', () => {
  const open = async (page: Page, createEntryContext: Parameters<Parameters<typeof test>[2]>[0]['createEntryContext'], gender: 'F' | 'M' = 'F') => {
    const context = await createEntryContext({
      givenName: 'AutoAyfsFu',
      familyName: 'Tester',
      gender,
      birthdate: birthdateYearsAgo(17),
    });
    await EntryFormPage.open(page, FORM, context);
    await expect(page.locator(SAVE)).toBeVisible();
    return context;
  };

  test('saving without the four GBV questions does not save', async ({ page, api, createEntryContext }) => {
    // required="true" on the four GBV radios (:69, :78, :87, :95)
    const context = await open(page, createEntryContext);
    await page.locator(SAVE).click();
    await expect(page.locator('span.field-error', { hasText: 'Required' })).toHaveCount(4);
    await expect(page).not.toHaveURL(/referenceapplication\/home\.page/);
    expect(await getPatientEncounters(api, context.patient.uuid)).toHaveLength(0);
  });

  test('"Other" as the reason for the visit shows its text box', async ({ page, createEntryContext }) => {
    // when :111 on #vr-other
    await open(page, createEntryContext);
    const target = page.locator('#other-visit-reason');
    await expect(target).toBeHidden();
    await checkboxOf(page, 'vr-other').check();
    await expect(target).toBeVisible();
    await checkboxOf(page, 'vr-other').uncheck();
    await expect(target).toBeHidden();
  });

  // V2 (Medium, fixed): ticking Family planning while Other was ticked hid the box and the typed text was lost.
  // The box stays while Other is ticked and its text is saved.
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

  test('ticking Jadelle shows the implant date and unticking hides it', async ({ page, createEntryContext }) => {
    // when :251 (CIEL:1873)
    await open(page, createEntryContext);
    await expect(page.locator('#implant-date')).toBeHidden();
    await checkboxOf(page, 'fp-meth-1873').check();
    await expect(page.locator('#implant-date')).toBeVisible();
    await checkboxOf(page, 'fp-meth-1873').uncheck();
    await expect(page.locator('#implant-date')).toBeHidden();
  });

  // V3 (Medium): the second <when> value is CIEL:5275 (IUD), not offered in the implant block, so Implanon never shows
  // the date. Intended: any implant shows it. Remove test.fail() when fixed.
  test('ticking Implanon shows the implant date (V3)', async ({ page, createEntryContext }) => {
    test.fail();
    await open(page, createEntryContext);
    await checkboxOf(page, 'fp-meth-76022').check();
    await expect(page.locator('#implant-date')).toBeVisible();
  });

  test('"Other contraceptive methods" is offered to a female patient only', async ({ page, createEntryContext }) => {
    // includeIf $patient.gender == 'F' :301
    await open(page, createEntryContext, 'F');
    await expect(page.getByText('Other contraceptive methods', { exact: true })).toBeVisible();
  });

  test('"Other contraceptive methods" is not offered to a male patient', async ({ page, createEntryContext }) => {
    // includeIf $patient.gender == 'F' :301 (availability allows any sex aged 10-24)
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

  test('saves the screening answers, reason for visit and family planning method', async ({
    page,
    api,
    createEntryContext,
  }) => {
    const context = await open(page, createEntryContext);
    await answerGbvNo(page);
    await checkboxOf(page, 'vr-other').check();
    await page.locator('#other-visit-reason textarea').fill('Walk-in for advice');
    await checkboxOf(page, 'fp-meth-1873').check(); // Jadelle
    await page.locator(SAVE).click();
    await expect(page).toHaveURL(/referenceapplication\/home\.page/);

    const encounters = await getPatientEncounters(api, context.patient.uuid);
    expect(encounters.map((e) => e.encounterType.uuid)).toEqual([AYFS_FOLLOWUP_ENCOUNTER_TYPE_UUID]);
    const obs = await obsSummary(api, encounters[0].uuid);
    expect(obs).toEqual(
      expect.arrayContaining([
        'Hit, kicked, punched, or otherwise hurt in the past year=No',
        'Someone caused feelings of fear, unsafety, or danger in the past year=No',
        'Reason for visit=Other',
        'Method of family planning=Jadelle (implantable contraceptive)',
      ]),
    );
    expect(obs.some((o) => o.endsWith('=Walk-in for advice'))).toBeTruthy();
    const view = await expectViewShowsSavedObs(page, api, FORM, encounters[0].uuid, VIEW_LABELS);
    // (some labels are short: check them as whole selected options too)
    const shown = await view.valueTexts();
    for (const expected of ['[X] no', '[X] other', 'Walk-in for advice', '[X] Jadelle']) {
      expect(shown, expected).toContain(expected);
    }
  });

  // VIEW: every saved value is shown under the form's own label, the "Other" specify box appears, and what was not filled is not shown.
  test('VIEW: shows the saved answers by their form labels, the implant date and the diagnoses', async ({ page, api, createEntryContext }) => {
    const context = await open(page, createEntryContext);
    await answerGbvNo(page);
    await radioOf(page, 'Has anyone hit').nth(0).check(); // yes: overrides the No above
    await checkboxOf(page, 'vr-fp').check();
    await checkboxOf(page, 'vr-other').check();
    await page.locator('#other-visit-reason textarea').fill('Walk-in for advice');
    await checkboxOf(page, 'fp-meth-1873').check(); // Jadelle: implant date
    await setDate(page.locator('#implant-date input.hasDatepicker'), 2025, 2, 10);
    await radioOf(page, 'Symptoms/problems around the genitalia').nth(0).check(); // yes -> Abnormal
    await page.locator('#ayfs-dx input[type=checkbox]').nth(1).check(); // Malaria
    await page.locator('#sti-dx input[type=checkbox]').nth(0).check(); // Syphilis
    await setDate(page.locator('#apptDate input.hasDatepicker'), new Date().getFullYear() + 1, 5, 20);
    await page.locator('#outcome-section p input[type=checkbox]').nth(0).check(); // referred to NCD
    await page.locator(SAVE).click();
    await expect(page).toHaveURL(/referenceapplication\/home\.page/);
    const [encounter] = await getPatientEncounters(api, context.patient.uuid);

    // dates are shown as "dd MMM yyyy"; the diagnoses are shown by the diagnosis widget, not in a span.value (checked below)
    const apptYear = new Date().getFullYear() + 1;
    const labels = {
      ...VIEW_LABELS,
      'Date of implant placement: 2025-03-10': '10 Mar 2025',
      [`Return visit date: ${apptYear}-06-20`]: `20 Jun ${apptYear}`,
    };
    const view = await ViewFormPage.open(page, FORM, encounter.uuid);
    expect((await viewMismatches(api, view, encounter.uuid, labels)).filter((m) => !m.startsWith('Diagnosis'))).toEqual([]);
    const shown = await view.valueTexts();
    for (const expected of [
      '[X] yes', // the GBV answer and the genitalia answer
      '[X] no',
      '[X] Family planning',
      '[X] other',
      'Walk-in for advice',
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
    // nothing was ticked for the other methods or reasons
    for (const unexpected of ['[X] Implanon', '[X] ANC', '[X] Microgynon', '[X] OPD', '[X] Typhoid']) {
      expect(shown, unexpected).not.toContain(unexpected);
    }
  });

  // EDIT round-trip (SL-1458, SL-1467): the genitalia answer and the "Other" reason text come back as saved, and a second save replaces them.
  test('EDIT: reopening shows the saved genitalia answer and other-reason text, and a second save replaces them', async ({
    page,
    api,
    createEntryContext,
  }) => {
    const context = await open(page, createEntryContext);
    await answerGbvNo(page);
    await radioOf(page, 'Symptoms/problems around the genitalia').nth(0).check(); // yes -> Abnormal
    await checkboxOf(page, 'vr-other').check();
    await page.locator('#other-visit-reason textarea').fill('Walk-in for advice');
    await checkboxOf(page, 'vr-fp').check();
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
