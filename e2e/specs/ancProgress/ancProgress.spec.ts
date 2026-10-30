import type { APIRequestContext, Page } from '@playwright/test';
import { test, expect, birthdateYearsAgo, type EntryContext } from '../../core';
import { ANC_INTAKE_ENCOUNTER_TYPE_UUID, MCH_OPD_LOCATION_UUID } from '../../core/constants';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import {
  EntryFormPage,
  SectionFormPage,
  ViewFormPage,
  expectViewShowsSavedObs,
  selectDefaultProvider,
  viewMismatches,
} from '../../pages';

// ancProgress.xml: "ANC Progress" (MCOE antenatal progress note): intake, vitals, lab results, pregnancy complications,
// general and obstetrical exam (up to 3 foetuses), diagnosis and outcome. The specs open enterHtmlFormWithStandardUi
// inside a visit they create, so availability (documentation/_availability.e2e.md: mcoeForms, enterMCH, session location
// tag "Antenatal Progress Location", female >= 10) is not exercised. The session location (MCH OPD) lacks that tag, so
// the Location select starts blank and is required: every save below picks "Antenatal Ward" and the default provider.
//
// Conditions in the form, from documentation inventory (ancProgress.inv.md):
//   when #ab-scar = Yes                :355  show #ab-scar-details (# of previous c-sections, scar description)
//   when #fetus-presentation-{1..3}=Other :442  show #other-presentation-{n}
//   when ob-us findings {1..3} = Other :473  show #other-ob-us-find-{n}
//   ifMode VIEW include=false          :45, :96, :163, :604  scripts, heading, Save/Cancel buttons (ENTER/EDIT only)
//   (32 more in shared subforms: see _shared.e2e.md; pregnancy-group-widget, vital-signs-basic-widget, lab-results-section)
// Scripts:
//   :47-69   normal/abnormal exclusion in .exam: ticking a .normalObs box unticks the .abnormalObs boxes and vice versa.
//   :71-83   EDD/GA: latest CIEL:1427 (LMP) of the patient (any encounter) -> #calculated-edd-and-gestational shown with
//            EDD = LMP + 280 days and GA "<w> <d>/7 weeks" (mch.js helpers, computed at encounter date); hidden without LMP.
//   :97-146  foetus 2 and 3 are hidden unless the twins checkbox (#twins) is ticked or "Show more" is clicked; "Show less"
//            hides them again; the buttons swap.
// Side effects on save: postSubmissionActions CleanDiagnosisConstructAction, ApplyDispositionAction and
//   PregnancyProgramEnrollmentAction (patient is enrolled in the Pregnancy program, asserted below).
// Not covered here: disposition (ApplyDispositionAction; transfer/death side effects), diagnosis search widget, lab
//   results and vitals scoring (shared widgets, _shared.e2e.md), the "form shown" path of other locations.
// EDIT: only the foetus 2 reopen (V1). VIEW (end of the save test and the "VIEW:" tests): every saved value is shown (the twins diagnosis comes from
//   the diagnosis widget, not a span.value), foetus groups, scar details and "Other" specify boxes show their own values, foetus 2/3 are not shown
//   when empty, and the two VW findings below are tested. The VIEW has no scripts: the EDD/GA block stays hidden by design (ENTER/EDIT only), as do show more/less.
//
// Findings:
//   V1 Medium :102   hasValue() looks for '.fetusDeliveryTime input' (copied from laborDeliverySummary); no such class
//                    exists here, so on load foetus 2 and 3 are always hidden. A reopened (EDIT) encounter with data for
//                    foetus 2/3 hides it until "Show more" is clicked (twins ticked is the only other trigger). Fix: look
//                    at the foetus inputs, e.g. '#fetus-hr-N input'. Saved groups carry no foetus number, so HFE binds them
//                    to the slots in obs order (once seen reopened with foetus 1 and 2 swapped).   (TESTED, test.fixme)
//   V2 Low    :469   id="ob-us={0}" ('=' instead of '-') renders ids "ob-us=1".."ob-us=3"; unusable as a CSS id selector.
//   V3 Low    :574, :599  two "Notes" textareas on the same concept CIEL:161011 (Diagnosis and Outcome sections); both are
//                    saved as separate obs of one concept, so a reader cannot tell which section a note came from.
//   V4 Low    :71-77 the LMP date is formatted as 'yyyy-MM-dd' and parsed with new Date(), i.e. as UTC midnight, then
//                    shown in the browser's time zone: EDD is one day early in time zones west of UTC (not Sierra Leone).
//   V5 Info   :369-373 "twins or triplets" (PIH:DIAGNOSIS = Multiple gestation inside a PIH:Visit Diagnoses group) and the
//                    "Multiple gestation" complication box (:285) record the same fact twice.
//   VW1 Medium :408-496 the foetus obs groups carry no foetus number, so VIEW (like EDIT, V1) binds them to the slots itself: when foetus 2 has more
//                    members than foetus 1, foetus 2's values are shown under "Foetus 1" and foetus 1's under "Foetus 2" (saved 140/Doppler and
//                    150/Pinard/Breech/posterior, shown 150... in slot 1). Fix: store the foetus number in each group (e.g. a hidden obs set from {0})
//                    and bind by it. (TESTED, test.fixme)
//   VW2 Medium :574, :599 (V3 in VIEW) the two "Notes" are one concept, so a note typed only in Outcome is shown under Diagnosis and the Outcome
//                    notes stay blank in VIEW (the first widget takes the first obs). With both filled, the two notes were seen swapped between
//                    the sections in one of two runs (the obs order is not fixed). Fix: use two different concepts. (TESTED, test.fixme)

const FORM = 'ancProgress.xml';

// Coded answers the form labels differently from the concept name (obs display -> text shown in VIEW).
const VIEW_LABELS: Record<string, string> = {
  'Antenatal and postnatal care team: Team B': 'B',
  'Method of gestational age determination: Obstetric ultrasound': 'Ultrasound',
  'General exam findings: Pallor': 'Pale',
  'Fetal heart rate monitoring method: Fetal doppler': 'Doppler',
};
const DAY_MS = 86400000;

const saveForm = async (page: Page) => {
  // <submit> tag: the button has no #submit (hfe-e2e-specs.skill.md "Harness gotchas")
  await page.locator('#buttons input.submitButton').click();
};

const openForm = async (page: Page, context: EntryContext) => {
  await EntryFormPage.open(page, FORM, context);
  await expect(page.locator('#buttons input.submitButton')).toBeVisible();
};

// The Location select is blank and required because the session location has no "Antenatal Progress Location" tag.
// The Provider select is blank too when the logged-in user has no Provider account.
const pickProviderAndLocation = async (page: Page) => {
  await selectDefaultProvider(page);
  await page.locator('#encounterLocation select').selectOption({ label: 'Antenatal Ward' });
};

const pregnancyEnrollments = async (api: APIRequestContext, patientUuid: string): Promise<string[]> => {
  const res = await api.get(`programenrollment?patient=${patientUuid}&v=custom:(program:(name),dateCompleted)`);
  expect(res.ok()).toBeTruthy();
  const results = (await res.json()).results as Array<{
    program: { name: string };
    dateCompleted: string | null;
  }>;
  return results.filter((e) => e.dateCompleted === null).map((e) => e.program.name);
};

// An earlier encounter of the patient with an LMP obs (CIEL:1427); the purge removes it with the patient.
const createPriorLmp = async (api: APIRequestContext, patientUuid: string, daysAgo: number): Promise<string> => {
  const lmp = new Date(Date.now() - daysAgo * DAY_MS).toISOString().slice(0, 10);
  const res = await api.post('encounter', {
    data: {
      patient: patientUuid,
      encounterType: ANC_INTAKE_ENCOUNTER_TYPE_UUID,
      location: MCH_OPD_LOCATION_UUID,
      encounterDatetime: new Date(Date.now() - 3600000).toISOString(),
      obs: [{ concept: 'CIEL:1427', value: lmp }],
    },
  });
  expect(res.ok(), `create LMP encounter: ${res.status()}`).toBeTruthy();
  return lmp;
};

test.describe('ancProgress', () => {
  let context: EntryContext;

  test.beforeEach(async ({ page, createEntryContext }) => {
    context = await createEntryContext({
      givenName: 'AutoAncProgress',
      familyName: 'Tester',
      gender: 'F',
      birthdate: birthdateYearsAgo(25),
    });
    await openForm(page, context);
  });

  test('"Previous abdominal scar" Yes shows the c-section count and scar description', async ({ page }) => {
    // when :355
    const details = page.locator('#ab-scar-details');
    await expect(details).toBeHidden();
    await page.locator('#ab-scar').getByLabel('yes', { exact: true }).check();
    await expect(details).toBeVisible();
    await page.locator('#ab-scar').getByLabel('no', { exact: true }).check();
    await expect(details).toBeHidden();
  });

  for (const n of [1, 2, 3]) {
    test(`foetus ${n}: "Other" presentation shows its own specify field, "Other" ultrasound finding shows its own`, async ({
      page,
    }) => {
      // when :442 and :473 (target ids are templated per foetus)
      if (n > 1) {
        await page.locator('#show-more-fetus-button').click();
      }
      const otherPresentation = page.locator(`#other-presentation-${n}`);
      const otherUs = page.locator(`#other-ob-us-find-${n}`);
      await expect(otherPresentation).toBeHidden();
      await expect(otherUs).toBeHidden();

      await page.locator(`#fetus-presentation-${n}`).getByLabel('Other', { exact: true }).check();
      await expect(otherPresentation).toBeVisible();
      await page.locator(`#fetus-presentation-${n}`).getByLabel('Cephalic or vertex presentation').check();
      await expect(otherPresentation).toBeHidden();

      // V2: the wrapper id is "ob-us=N"; select it through the attribute
      await page.locator(`[id="ob-us=${n}"]`).getByLabel('Other', { exact: true }).check();
      await expect(otherUs).toBeVisible();
      await page.locator(`[id="ob-us=${n}"]`).getByLabel('Breech presentation').check();
      await expect(otherUs).toBeHidden();
    });
  }

  test('foetus 2 and 3 are hidden until "Show more"; "Show less" hides them again', async ({ page }) => {
    // script :97-146 (ENTER: nothing has a value, so hideOtherFetus() and the Show more button)
    const more = page.locator('#show-more-fetus-button');
    const less = page.locator('#show-less-fetus-button');
    await expect(page.locator('#fetus-1')).toBeVisible();
    await expect(page.locator('#fetus-2')).toBeHidden();
    await expect(page.locator('#fetus-3')).toBeHidden();
    await expect(more).toBeVisible();
    await expect(less).toBeHidden();

    await more.click();
    await expect(page.locator('#fetus-2')).toBeVisible();
    await expect(page.locator('#fetus-3')).toBeVisible();
    await expect(more).toBeHidden();
    await expect(less).toBeVisible();

    await less.click();
    await expect(page.locator('#fetus-2')).toBeHidden();
    await expect(page.locator('#fetus-3')).toBeHidden();
    await expect(more).toBeVisible();
    await expect(less).toBeHidden();
  });

  test('ticking "twins or triplets" shows foetus 2 and 3, unticking hides them', async ({ page }) => {
    // script :97-146, #twins change handler
    const twins = page.locator('#twins').getByLabel('twins or triplets');
    await twins.check();
    await expect(page.locator('#fetus-2')).toBeVisible();
    await expect(page.locator('#fetus-3')).toBeVisible();
    await expect(page.locator('#show-less-fetus-button')).toBeVisible();
    await expect(page.locator('#show-more-fetus-button')).toBeHidden();

    await twins.uncheck();
    await expect(page.locator('#fetus-2')).toBeHidden();
    await expect(page.locator('#fetus-3')).toBeHidden();
    await expect(page.locator('#show-more-fetus-button')).toBeVisible();
  });

  for (const abnormal of ['Oedema', 'Jaundice', 'Pale', 'Other']) {
    test(`general exam: "normal" and "${abnormal}" exclude each other`, async ({ page }) => {
      // script :47-69 (.normalObs / .abnormalObs inside .exam)
      const exam = page.locator('#gen-exam');
      const normal = exam.getByLabel('normal', { exact: true });
      const finding = exam.getByLabel(abnormal, { exact: true });
      await normal.check();
      await finding.check();
      await expect(normal).not.toBeChecked();
      await normal.check();
      await expect(finding).not.toBeChecked();
    });
  }

  test('no earlier LMP: the calculated EDD and gestational age block stays hidden', async ({ page }) => {
    // script :71-83, lastLMP is empty
    await expect(page.locator('#calculated-edd-and-gestational')).toBeHidden();
  });

  test('an earlier LMP shows the calculated EDD (LMP + 280 days) and gestational age', async ({ page, api }) => {
    // script :71-83: needs an LMP obs from another encounter of the patient, so reopen the form after creating it
    const lmp = await createPriorLmp(api, context.patient.uuid, 100);
    await openForm(page, context);

    const block = page.locator('#calculated-edd-and-gestational');
    await expect(block).toBeVisible();
    // the same arithmetic as the script (UTC-parsed date, +280 days, medium date in the browser's locale/time zone)
    const edd = new Date(lmp);
    edd.setDate(edd.getDate() + 280);
    await expect(page.locator('#calculated-edd')).toHaveText(
      new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(edd),
    );
    // LMP was 100 days before today's UTC date: 14 weeks and 2 days (14 3/7 if the UTC day just rolled over)
    await expect(page.locator('#calculated-gestational-age-value')).toHaveText(/^14 [23]\/7 .*weeks/i);
  });

  test('Provider and Location are required: saving with the Location blank does not save', async ({ page, api }) => {
    // encounter-provider-location-date.xml (shared): Location (required) has no default under this session location
    await saveForm(page);
    await expect(page.locator('span.field-error', { hasText: /required/i }).first()).toBeVisible();
    await expect(page).not.toHaveURL(/referenceapplication\/home\.page/);
    expect(await getPatientEncounters(api, context.patient.uuid)).toHaveLength(0);
  });

  test('saves the progress note and enrolls the patient in the Pregnancy program', async ({ page, api }) => {
    expect(await pregnancyEnrollments(api, context.patient.uuid)).toEqual([]);

    await pickProviderAndLocation(page);
    await page.getByRole('radio', { name: 'B', exact: true }).check(); // pregnancy group (shared widget)
    await page.locator('p', { hasText: 'Gravida' }).locator('input').first().fill('2');
    await page.locator('p', { hasText: 'Parity' }).locator('input').first().fill('1');
    await page.getByRole('radio', { name: 'Ultrasound' }).check();
    const vitals = page.locator('#vitals input.legalValue');
    await vitals.nth(0).fill('120'); // normal ranges, so the widget does not require "contact doctor"
    await vitals.nth(1).fill('80');
    await vitals.nth(2).fill('80');
    await page.getByLabel('Malaria', { exact: true }).check(); // pregnancy complication
    await page.locator('#gen-exam').getByLabel('Pale', { exact: true }).check();
    await page.locator('#ab-scar').getByLabel('yes', { exact: true }).check();
    await page.locator('#twins').getByLabel('twins or triplets').check();
    await page.locator('#fetus-hr-1 input').fill('140');
    await page.locator('#fetal_hr_method-1').getByLabel('Doppler').check();
    await page.locator('#fetus-presentation-1').getByLabel('Cephalic or vertex presentation').check();
    await page.locator('#placenta-location-1').getByLabel('anterior').check();
    await page.locator('#afi').getByLabel('normal', { exact: true }).check();
    await page.locator('#outcome-condition').getByLabel('satisfactory', { exact: true }).check();
    await page.locator('#diagnosis textarea:visible').fill('Diagnosis section note');
    await page.locator('#outcome textarea:visible').fill('Outcome section note');

    await saveForm(page);
    await new EntryFormPage(page, FORM).expectSaved();

    const encounters = await getPatientEncounters(api, context.patient.uuid);
    expect(encounters).toHaveLength(1);
    const displays = (await getEncounterObs(api, encounters[0].uuid)).map((o) => o.display);
    const expected = [
      'Gravida: 2',
      'Parity: 1',
      'Antenatal and postnatal care team: Team B',
      'Method of gestational age determination: Obstetric ultrasound',
      'Systolic: 120',
      'Diastolic: 80',
      'Pulse: 80',
      'Maternal complication (coded): Malaria',
      'General exam findings: Pallor',
      'Abdominal scar indicative of prior caesarean section: Yes',
      'Fetal heart rate: 140', // the foetus group's member order varies, so check the members
      'Fetal heart rate monitoring method: Fetal doppler',
      'Fetal presentation: Cephalic or vertex presentation',
      'Placenta location by ultrasound: Anterior',
      'Amniotic fluid level on ultrasound, qualitative: Normal',
      'Overall condition: Satisfactory',
      'Visit Diagnoses: Multiple gestation, Secondary', // twins checkbox survives CleanDiagnosisConstructAction
      'Free text comment: Diagnosis section note', // V3: both Notes boxes are saved on the same concept
      'Free text comment: Outcome section note',
    ];
    expect(expected.filter((e) => !displays.includes(e))).toEqual([]);
    expect(await pregnancyEnrollments(api, context.patient.uuid)).toContain('Pregnancy');

    // VIEW: every saved value is shown (the diagnoses come from the diagnosis widget, not a span.value)
    const view = await ViewFormPage.open(page, FORM, encounters[0].uuid);
    expect((await viewMismatches(api, view, encounters[0].uuid, VIEW_LABELS)).filter((m) => !m.startsWith('Diagnosis'))).toEqual([]);
    // (the labels are short: check them as whole selected options too; the two empty values are the hidden EDD block). Sorted: the two Notes
    // are one concept and HFE gives them to the two widgets in either order (VW2).
    expect((await view.valueTexts()).filter((t) => t !== '').sort()).toEqual(
      [
        '[X] B',
        '2',
        '1',
        '[X] Ultrasound',
        '120',
        '80',
        '80',
        '[X] Malaria',
        '[X] Pale',
        '[X] yes',
        '[X] twins or triplets',
        '140',
        '[X] Doppler',
        '[X] Cephalic or vertex presentation',
        '[X] anterior',
        '[X] normal',
        'Diagnosis section note',
        '[X] satisfactory',
        'Outcome section note',
      ].sort(),
    );
  });

  // V1 (Medium): hasValue() checks a class that does not exist, so saved foetus 2 data is hidden when the form is reopened.
  // Intended: foetus 2 is visible (with its saved value) in EDIT. Remove test.fixme() when :102 is fixed.
  test('a saved foetus 2 is shown when the encounter is reopened (V1)', async ({ page, api }) => {
    test.fixme();
    await pickProviderAndLocation(page);
    await page.locator('#fetus-hr-1 input').fill('140');
    await page.locator('#show-more-fetus-button').click();
    await page.locator('#fetus-hr-2 input').fill('150'); // foetus 1 is filled too: HFE binds saved groups to slots in order
    await saveForm(page);
    await new EntryFormPage(page, FORM).expectSaved();

    const [encounter] = await getPatientEncounters(api, context.patient.uuid);
    await page.goto(
      SectionFormPage.editUrl(FORM, {
        patient: context.patient,
        encounter: { uuid: encounter.uuid, visitUuid: context.visitUuid },
      }),
    );
    await expect(page.locator('#buttons input.submitButton')).toBeVisible();
    await expect(page.locator('#fetus-hr-2 input')).not.toHaveValue('');
    await expect(page.locator('#fetus-2')).toBeVisible({ timeout: 3000 });
  });

  // ---- VIEW (viewEncounterWithHtmlForm getAsHtml.action) ----
  test('VIEW: shows the scar details and only the foetus that has data, and leaves the rest blank', async ({ page, api }) => {
    await pickProviderAndLocation(page);
    await page.locator('#ab-scar').getByLabel('yes', { exact: true }).check();
    await page.locator('#ab-scar-details input:visible').nth(0).fill('2');
    await page.locator('#ab-scar-details input:visible').nth(1).fill('Pfannenstiel');
    await page.locator('#fetus-hr-1 input').fill('140');
    await page.locator('#fetal_hr_method-1').getByLabel('Doppler').check();
    await page.locator('#fetus-presentation-1').getByLabel('Other', { exact: true }).check();
    await page.locator('#other-presentation-1 input').fill('Transverse lie');
    await page.locator(`[id="ob-us=1"]`).getByLabel('Other', { exact: true }).check();
    await page.locator('#other-ob-us-find-1 input').fill('Short cord');
    await page.locator('#placenta-location-1').getByLabel('posterior').check();
    await saveForm(page);
    await new EntryFormPage(page, FORM).expectSaved();
    const [encounter] = await getPatientEncounters(api, context.patient.uuid);

    const view = await ViewFormPage.open(page, FORM, encounter.uuid);
    expect(await viewMismatches(api, view, encounter.uuid, VIEW_LABELS)).toEqual([]);
    const shown = await view.valueTexts();
    for (const expected of ['[X] yes', '2', 'Pfannenstiel', '140', '[X] Doppler', '[X] Other', 'Transverse lie', 'Short cord', '[X] posterior']) {
      expect(shown, expected).toContain(expected);
    }
    // the "Other" specify boxes of the presentation and the ultrasound finding carry their own text
    await expect(view.page.locator('#other-presentation-1 .value')).toHaveText('Transverse lie');
    await expect(view.page.locator('#other-ob-us-find-1 .value')).toHaveText('Short cord');
    // foetus groups are showIfEmpty="false": foetus 2 and 3 have no heading, no fields and no values
    await expect(view.page.locator('h6')).toHaveCount(1);
    await expect(view.page.locator('#fetus-2 .value, #fetus-3 .value, #fetus-2 .emptyValue, #fetus-3 .emptyValue')).toHaveCount(0);
    // what was not answered is blank: the abdominal exam findings, the complications and the outcome
    await expect(view.page.locator('#pregnancy-complications .value')).toHaveCount(0);
    await expect(view.page.locator('#outcome .value')).toHaveCount(0);
    await expect(view.page.locator('#gen-exam .value')).toHaveCount(0);
  });

  // VW1 (Medium): the foetus groups carry no foetus number, so HFE binds them to the slots itself: when foetus 2 has more members than foetus 1,
  // VIEW shows foetus 2's data under "Foetus 1" and foetus 1's under "Foetus 2" (same cause as V1; two groups with the same members stay in order).
  // Intended: each foetus under its own heading. Remove test.fixme() when fixed.
  test('VIEW: each foetus is shown under its own number (VW1)', async ({ page, api }) => {
    test.fixme();
    await pickProviderAndLocation(page);
    await page.locator('#fetus-hr-1 input').fill('140');
    await page.locator('#fetal_hr_method-1').getByLabel('Doppler').check();
    await page.locator('#show-more-fetus-button').click();
    await page.locator('#fetus-hr-2 input').fill('150');
    await page.locator('#fetal_hr_method-2').getByLabel('Pinard').check();
    await page.locator('#fetus-presentation-2').getByLabel('Breech presentation', { exact: true }).check(); // foetus 2 has more members than foetus 1
    await page.locator('#placenta-location-2').getByLabel('posterior').check();
    await saveForm(page);
    await new EntryFormPage(page, FORM).expectSaved();
    const [encounter] = await getPatientEncounters(api, context.patient.uuid);

    const view = await ViewFormPage.open(page, FORM, encounter.uuid);
    await expect(view.page.locator('#fetus-hr-1 .value')).toHaveText('140');
    await expect(view.page.locator('#fetal_hr_method-1 .value')).toHaveText('[X] Doppler');
    await expect(view.page.locator('#fetus-hr-2 .value')).toHaveText('150');
    await expect(view.page.locator('#fetal_hr_method-2 .value')).toHaveText('[X] Pinard');
  });

  // VW2 (Medium): the Diagnosis and Outcome "Notes" are two widgets on one concept (V3), and HFE fills them in order: a note typed only under
  // Outcome is shown under Diagnosis in VIEW. Intended: shown under Outcome. Remove test.fixme() when fixed.
  test('VIEW: a note typed only under Outcome is shown under Outcome (VW2)', async ({ page, api }) => {
    test.fixme();
    await pickProviderAndLocation(page);
    await page.locator('#outcome textarea:visible').fill('Outcome section note');
    await saveForm(page);
    await new EntryFormPage(page, FORM).expectSaved();
    const [encounter] = await getPatientEncounters(api, context.patient.uuid);

    const view = await ViewFormPage.open(page, FORM, encounter.uuid);
    await expect(view.page.locator('#outcome .value').filter({ hasText: 'Outcome section note' })).toHaveCount(1);
    await expect(view.page.locator('#diagnosis .value')).toHaveCount(0);
  });

  // The EDD and gestational age block is computed by the ENTER/EDIT script only (by design): in VIEW it stays hidden (class "hidden").
  test('VIEW: with an earlier LMP the calculated EDD block stays hidden and nothing is calculated', async ({ page, api }) => {
    await createPriorLmp(api, context.patient.uuid, 100);
    await openForm(page, context);
    await pickProviderAndLocation(page);
    await page.locator('p', { hasText: 'Gravida' }).locator('input').first().fill('2');
    await saveForm(page);
    await new EntryFormPage(page, FORM).expectSaved();
    const encounter = (await getPatientEncounters(api, context.patient.uuid)).find((e) => e.encounterType.uuid !== ANC_INTAKE_ENCOUNTER_TYPE_UUID)!;

    const view = await expectViewShowsSavedObs(page, api, FORM, encounter.uuid);
    expect(await view.valueTexts()).toContain('2');
    await expect(view.page.locator('#calculated-edd-and-gestational')).toHaveClass(/hidden/);
    await expect(view.page.locator('#calculated-gestational-age-value')).toBeEmpty();
  });
});
