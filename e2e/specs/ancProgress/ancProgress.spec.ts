import type { APIRequestContext, Page } from '@playwright/test';
import { test, expect, birthdateYearsAgo, type EntryContext } from '../../core';
import { ANC_INTAKE_ENCOUNTER_TYPE_UUID, MCH_OPD_LOCATION_UUID } from '../../core/constants';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import { EntryFormPage, SectionFormPage } from '../../pages';

// ancProgress.xml: "ANC Progress" (MCOE antenatal progress note): intake, vitals, lab results, pregnancy complications,
// general and obstetrical exam (up to 3 foetuses), diagnosis and outcome. The specs open enterHtmlFormWithStandardUi
// inside a visit they create, so availability (documentation/_availability.e2e.md: mcoeForms, enterMCH, session location
// tag "Antenatal Progress Location", female >= 10) is not exercised. The session location (MCH OPD) lacks that tag, so
// the Location select starts blank and is required: every save below picks "Antenatal Ward".
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
//   results and vitals scoring (shared widgets, _shared.e2e.md), VIEW mode, the "form shown" path of other locations.
//
// Findings:
//   V1 Medium :102   hasValue() looks for '.fetusDeliveryTime input' (copied from laborDeliverySummary); no such class
//                    exists here, so on load foetus 2 and 3 are always hidden. A reopened (EDIT) encounter with data for
//                    foetus 2/3 hides it until "Show more" is clicked (twins ticked is the only other trigger). Fix: look
//                    at the foetus inputs, e.g. '#fetus-hr-N input'. Saved groups carry no foetus number, so HFE binds them
//                    to the slots in obs order (once seen reopened with foetus 1 and 2 swapped).   (TESTED, test.fail)
//   V2 Low    :469   id="ob-us={0}" ('=' instead of '-') renders ids "ob-us=1".."ob-us=3"; unusable as a CSS id selector.
//   V3 Low    :574, :599  two "Notes" textareas on the same concept CIEL:161011 (Diagnosis and Outcome sections); both are
//                    saved as separate obs of one concept, so a reader cannot tell which section a note came from.
//   V4 Low    :71-77 the LMP date is formatted as 'yyyy-MM-dd' and parsed with new Date(), i.e. as UTC midnight, then
//                    shown in the browser's time zone: EDD is one day early in time zones west of UTC (not Sierra Leone).
//   V5 Info   :369-373 "twins or triplets" (PIH:DIAGNOSIS = Multiple gestation inside a PIH:Visit Diagnoses group) and the
//                    "Multiple gestation" complication box (:285) record the same fact twice.

const FORM = 'ancProgress.xml';
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
const pickLocation = async (page: Page) => {
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

    await pickLocation(page);
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
  });

  // V1 (Medium): hasValue() checks a class that does not exist, so saved foetus 2 data is hidden when the form is reopened.
  // Intended: foetus 2 is visible (with its saved value) in EDIT. Remove test.fail() when :102 is fixed.
  test('a saved foetus 2 is shown when the encounter is reopened (V1)', async ({ page, api }) => {
    test.fail();
    await pickLocation(page);
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
});
