import type { APIRequestContext, Page } from '@playwright/test';
import { test, expect, birthdateYearsAgo, type EntryContext } from '../../core';
import { ANC_INTAKE_ENCOUNTER_TYPE_UUID, MCH_OPD_LOCATION_UUID } from '../../core/constants';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import { EntryFormPage, SectionFormPage } from '../../pages';

// laborProgress.xml: "Labour Progress" (MCOE labour ward note): intake, vitals, lab results, labour complications,
// labour onset and membranes, physical exam (up to 4 foetuses), induction, abdominal scar and outcome. The specs open
// enterHtmlFormWithStandardUi inside a visit they create, so availability (documentation/_availability.e2e.md: mcoeForms,
// enterMCH, session location tag "Antenatal Location", female >= 10) is not exercised. The session location (MCH OPD)
// lacks that tag, so the Location select starts blank and is required: every save below picks "Antenatal Ward".
//
// Conditions in the form, from documentation inventory (laborProgress.inv.md):
//   when #membrane-state = Ruptured    :229  show #rupture-details (rupture date/time, membrane colour, meconium class)
//   when #fetus-presentation-N = Other :359  show #other-presentation (id repeated for the 4 foetuses, V1)
//   when #induced = Yes                :409  show #induced-details (induction date/time, method)
//   when #ab-scar = Yes                :449  show #ab-scar-details (# of previous c-sections, scar description)
//   ifMode VIEW include=false          :33, :69, :267, :507  scripts, heading, Save/Cancel buttons (ENTER/EDIT only)
//   (32 more in shared subforms: see _shared.e2e.md; pregnancy-group-widget, vital-signs-widget, lab-results-section)
// Scripts:
//   :35-54   EDD/GA: latest CIEL:1427 (LMP) of the patient (any encounter) -> #calculated-edd-and-gestational shown with
//            EDD = LMP + 280 days and GA "<w> <d>/7 weeks" (mch.js helpers, computed at encounter date); hidden without LMP.
//   :268-301 foetus 2-4 are hidden on load; "Show more" shows them, "Show less" hides them again; the buttons swap.
// Side effects on save: postSubmissionActions CleanDiagnosisConstructAction, ApplyDispositionAction and
//   PregnancyProgramEnrollmentAction (patient is enrolled in the Pregnancy program, asserted below).
// Not covered here: disposition (ApplyDispositionAction; transfer/death side effects), partogram upload (complex obs),
//   lab results and vitals scoring (shared widgets, _shared.e2e.md), VIEW mode, other session locations.
//
// Findings:
//   V1 Medium :359, :363  <div id="other-presentation"> sits inside the 4-foetus <repeat> without {0}, and every <when>
//                    targets "#other-presentation". jQuery resolves an id to its first element only, so the specify fields
//                    of foetus 2-4 are never hidden (visible after "Show more" whatever the answer) and choosing "Other"
//                    for foetus 2-4 reveals foetus 1's field. Fix: id="other-presentation-{0}" and the same in thenDisplay.
//                    (TESTED below with test.fail)
//   V2 Medium :273   hasValue() looks for '.fetus-name input' (copied from section-delivery); no such class exists here, so on
//                    load foetus 2-4 are always hidden: a reopened (EDIT) encounter with data for foetus 2-4 hides it until
//                    "Show more" is clicked. Fix: look at the foetus inputs, e.g. '#fetus-hr-N input'. Saved groups carry no
//                    foetus number, so HFE binds them to the slots in obs order.   (TESTED below with test.fail)
//   V3 Low    :37-43 the LMP date is formatted as 'yyyy-MM-dd' and parsed with new Date(), i.e. as UTC midnight, then shown
//                    in the browser's time zone: EDD is one day early in time zones west of UTC (not Sierra Leone).

const FORM = 'laborProgress.xml';
const DAY_MS = 86400000;

const saveForm = async (page: Page) => {
  // <submit> tag: the button has no #submit (hfe-e2e-specs.skill.md "Harness gotchas")
  await page.locator('#buttons input.submitButton').click();
};

const openForm = async (page: Page, context: EntryContext) => {
  await EntryFormPage.open(page, FORM, context);
  await expect(page.locator('#buttons input.submitButton')).toBeVisible();
};

// The Location select is blank and required because the session location has no "Antenatal Location" tag.
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

test.describe('laborProgress', () => {
  let context: EntryContext;

  test.beforeEach(async ({ page, createEntryContext }) => {
    context = await createEntryContext({
      givenName: 'AutoLaborProgress',
      familyName: 'Tester',
      gender: 'F',
      birthdate: birthdateYearsAgo(25),
    });
    await openForm(page, context);
  });

  test('membrane details show only when Membranes is Ruptured', async ({ page }) => {
    // when :229
    const details = page.locator('#rupture-details');
    await expect(details).toBeHidden();
    await page.locator('#membrane-state').getByLabel('Ruptured').check();
    await expect(details).toBeVisible();
    for (const other of ['Intact', 'Unknown']) {
      await page.locator('#membrane-state').getByLabel(other).check();
      await expect(details).toBeHidden();
      await page.locator('#membrane-state').getByLabel('Ruptured').check();
      await expect(details).toBeVisible();
    }
  });

  test('induction date and method show only when Induced labor is Yes', async ({ page }) => {
    // when :409
    const details = page.locator('#induced-details');
    await expect(details).toBeHidden();
    await page.locator('#induced').getByLabel('Yes').check();
    await expect(details).toBeVisible();
    await page.locator('#induced').getByLabel('No').check();
    await expect(details).toBeHidden();
  });

  test('"Previous abdominal scar" Yes shows the c-section count and scar description', async ({ page }) => {
    // when :449
    const details = page.locator('#ab-scar-details');
    await expect(details).toBeHidden();
    await page.locator('#ab-scar').getByLabel('Yes').check();
    await expect(details).toBeVisible();
    await page.locator('#ab-scar').getByLabel('No').check();
    await expect(details).toBeHidden();
  });

  test('foetus 1: "Other" presentation shows the specify field, another answer hides it', async ({ page }) => {
    // when :359 (foetus 1 is the first #other-presentation, the one jQuery resolves, so it works)
    const specify = page.locator('[id="other-presentation"]').first();
    await expect(specify).toBeHidden();
    await page.locator('#fetus-presentation-1').getByLabel('Other', { exact: true }).check();
    await expect(specify).toBeVisible();
    await page.locator('#fetus-presentation-1').getByLabel('Cephalic or vertex presentation').check();
    await expect(specify).toBeHidden();
  });

  // V1 (Medium): the four specify fields share one id. Intended: each foetus has its own specify field, hidden until that
  // foetus' presentation is Other. Remove test.fail() when :359-363 are fixed.
  test('foetus 2: "Other" presentation shows foetus 2\'s own specify field only (V1)', async ({ page }) => {
    test.fail();
    await page.locator('#show-more-fetus-button').click();
    const specify = page.locator('[id="other-presentation"]');
    await expect(specify).toHaveCount(4);
    await expect(specify.nth(1)).toBeHidden({ timeout: 3000 }); // before any answer
    await page.locator('#fetus-presentation-2').getByLabel('Other', { exact: true }).check();
    await expect(specify.nth(1)).toBeVisible();
    await expect(specify.nth(0)).toBeHidden();
  });

  test('foetus 2-4 are hidden until "Show more"; "Show less" hides them again', async ({ page }) => {
    // script :268-301 (ENTER: nothing has a value, so hideOtherFetus() and the Show more button)
    const more = page.locator('#show-more-fetus-button');
    const less = page.locator('#show-less-fetus-button');
    await expect(page.locator('#fetus-1')).toBeVisible();
    for (const n of [2, 3, 4]) {
      await expect(page.locator(`#fetus-${n}`)).toBeHidden();
    }
    await expect(more).toBeVisible();
    await expect(less).toBeHidden();

    await more.click();
    for (const n of [2, 3, 4]) {
      await expect(page.locator(`#fetus-${n}`)).toBeVisible();
    }
    await expect(more).toBeHidden();
    await expect(less).toBeVisible();

    await less.click();
    for (const n of [2, 3, 4]) {
      await expect(page.locator(`#fetus-${n}`)).toBeHidden();
    }
    await expect(more).toBeVisible();
    await expect(less).toBeHidden();
  });

  test('no earlier LMP: the calculated EDD and gestational age block stays hidden', async ({ page }) => {
    // script :35-54, lastLMP is empty
    await expect(page.locator('#calculated-edd-and-gestational')).toBeHidden();
  });

  test('an earlier LMP shows the calculated EDD (LMP + 280 days) and gestational age', async ({ page, api }) => {
    // script :35-54: needs an LMP obs from another encounter of the patient, so reopen the form after creating it
    const lmp = await createPriorLmp(api, context.patient.uuid, 100);
    await openForm(page, context);

    await expect(page.locator('#calculated-edd-and-gestational')).toBeVisible();
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

  test('saves the labour note and enrolls the patient in the Pregnancy program', async ({ page, api }) => {
    expect(await pregnancyEnrollments(api, context.patient.uuid)).toEqual([]);

    await pickLocation(page);
    await page.getByRole('radio', { name: 'B', exact: true }).check(); // pregnancy group (shared widget)
    await page.locator('p', { hasText: 'Gravida' }).locator('input').first().fill('2');
    await page.locator('p', { hasText: 'Parity' }).locator('input').first().fill('1');
    await page.getByRole('radio', { name: 'Last menstrual date' }).check();
    const vitals = page.locator('#vitals input.legalValue');
    await vitals.nth(0).fill('120'); // normal ranges, so the widget does not require "contact doctor"
    await vitals.nth(1).fill('80');
    await vitals.nth(2).fill('80');
    await page.locator('#labor-complications').getByLabel('Prolonged labour').check();
    await page.locator('#membrane-state').getByLabel('Ruptured').check();
    await page.locator('#rupture-details').getByLabel('Clear', { exact: true }).check();
    await page.locator('#induced').getByLabel('Yes').check();
    await page.locator('#induced-details').getByLabel('Oxytocin').check();
    await page.locator('#ab-scar').getByLabel('No').check();
    await page.locator('#fetus-hr-1 input').fill('140');
    await page.locator('#fetus-presentation-1').getByLabel('Cephalic or vertex presentation').check();
    await page.locator('#outcome-condition').getByLabel('satisfactory', { exact: true }).check();
    await page.locator('#outcome textarea:visible').fill('Labour note');

    await saveForm(page);
    await new EntryFormPage(page, FORM).expectSaved();

    const encounters = await getPatientEncounters(api, context.patient.uuid);
    expect(encounters).toHaveLength(1);
    const displays = (await getEncounterObs(api, encounters[0].uuid)).map((o) => o.display);
    const expected = [
      'Gravida: 2',
      'Parity: 1',
      'Antenatal and postnatal care team: Team B',
      'Method of gestational age determination: Date of last menstrual period',
      'Systolic: 120',
      'Diastolic: 80',
      'Pulse: 80',
      'Complications at delivery set: Prolonged labor',
      'Status of fetal membranes: Ruptured membranes',
      'Fetal membranes color: Clear',
      'Induced labor: Yes',
      'Method of labor induction: Administration of oxytocin',
      'Abdominal scar indicative of prior caesarean section: No',
      'Fetal heart rate: 140', // the foetus group's member order varies, so check the members
      'Fetal presentation: Cephalic or vertex presentation',
      'Overall condition: Satisfactory',
      'Free text comment: Labour note',
    ];
    expect(expected.filter((e) => !displays.includes(e))).toEqual([]);
    expect(await pregnancyEnrollments(api, context.patient.uuid)).toContain('Pregnancy');
  });

  // V2 (Medium): hasValue() checks a class that does not exist, so saved foetus 2 data is hidden when the form is reopened.
  // Intended: foetus 2 is visible (with its saved value) in EDIT. Remove test.fail() when :273 is fixed.
  test('a saved foetus 2 is shown when the encounter is reopened (V2)', async ({ page, api }) => {
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
