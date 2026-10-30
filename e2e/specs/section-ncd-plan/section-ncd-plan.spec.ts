import { type Page } from '@playwright/test';
import { test, expect, type SectionEncounter } from '../../core';
import { NCD_FOLLOWUP_ENCOUNTER_TYPE_UUID } from '../../core/constants';
import { getEncounterObs } from '../../commands';
import { SectionFormPage, expectViewShowsSavedObs, VISIT_PAGE_URL } from '../../pages';

// section-ncd-plan.xml: treatment plan, lab test orders, radiology/EKG/echo findings, medication orders, new clinical
// impressions (NCD categories) and disposition of the NCD encounter. The specs use an NCD followup encounter
// (_availability.e2e.md: shown for NCD initial, followup and part 2) and open the form URL directly.
//
// Conditions in the form, from documentation inventory (section-ncd-plan.inv.md):
//   ifMode VIEW include=false  :24   heading in ENTER/EDIT only
//   toggle {nick}-onset-date   :313  9 NCD categories; no element has these ids (V2)
//   ifMode EDIT                :356  disposition CSS only (inside <style>)
//   ifMode VIEW include=false  :400  Save / Cancel buttons (<submit>, not the #submit button of the other sections)
// Scripts: none of its own. onLoadFunction="renderOrderWidgetAsCheckboxes" (:68, shared script) renders the 29 lab
//   tests as checkboxes (#order_toggle_<n>); the drug-order widget (:290, see _shared.e2e.md) is not exercised.
//   The encounterDisposition widget (:374) shows the transfer location / date of death field per disposition.
// Side effects on save: <enrollInProgram programId="NCD"> (:31); postSubmissionAction ApplyDispositionAction (:3) and
//   SetOrderAutoExpireDateAction (:4); lab orders (:68). The enrollment and obs are asserted below.
// Not covered here: saving a lab order (it works, but an encounter with an order cannot be purged over REST, so the
//   fixture teardown fails and leaves the patient behind), medication orders (drug-order widget needs a drug and
//   dosing), SetOrderAutoExpireDateAction, saving a disposition
//   (Admission/Transfer/Death have real effects on the visit and patient), order revise/discontinue.
// EDIT is covered by the save test (saved values reopened), VIEW by the same test (the saved values only, the date format, no buttons).
//
// Findings:
//   V1 Low  :33, :287  two <section id="drug-orders">: the first one is the Treatment plan, the second the medications.
//                      Duplicate id, misleading on the first. Fix: id="treatment-plan-section" on :33.
//   V2 Low  :313       the category template is copied from the history section: toggle="{nickname}-onset-date" has
//                      no target in this form (9 dead toggles; same as section-ncd-followup V1). Fix: drop toggle.
//   V3 Low  :47        `padding-top padding-bottom: 0px;` (missing colon) is invalid CSS and is ignored.

const FORM = 'section-ncd-plan.xml';

// This form ends with <submit>, which renders input.submitButton[value=Save] and no #submit button, so
// SectionFormPage.openEdit/save() cannot be used; local equivalents.
const openPlan = async (page: Page, section: SectionEncounter) => {
  await page.goto(SectionFormPage.editUrl(FORM, section));
  await expect(page.locator('#treatment-plan textarea')).toBeVisible();
  await expect(page.locator('input.submitButton')).toBeVisible();
};
const savePlan = async (page: Page) => {
  await page.locator('input.submitButton').click();
  await expect(page).toHaveURL(VISIT_PAGE_URL);
};

// Read-only jQuery UI datepicker; setDate also updates the hidden field that is submitted.
const setDate = (page: Page, wrapper: string, date: Date) =>
  page.evaluate(
    ([w, ms]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).jq(`${w} input.hasDatepicker`).datepicker('setDate', new Date(ms as number));
    },
    [wrapper, date.getTime()],
  );

test.describe('section-ncd-plan', () => {
  let section: SectionEncounter;

  test.beforeEach(async ({ page, createSectionEncounter }) => {
    section = await createSectionEncounter({
      encounterTypeUuid: NCD_FOLLOWUP_ENCOUNTER_TYPE_UUID,
      patient: { givenName: 'AutoPlan', familyName: 'Tester', gender: 'F' },
    });
    await openPlan(page, section);
  });

  test('renders the lab tests as checkboxes and the Save and Cancel buttons in EDIT mode', async ({ page }) => {
    // onLoadFunction :68, ifMode :400
    await expect(page.locator('#test-orders input[type=checkbox][id^=order_toggle_]')).toHaveCount(29);
    await expect(page.locator('input.submitButton')).toBeVisible();
    await expect(page.locator('button.cancel[type=button]')).toBeVisible();
  });

  // encounterDisposition widget :374: the extra field per disposition (nothing is saved here)
  const dispositions = [
    { label: 'Transfer within hospital', field: '#transferInternalLocation' },
    { label: 'Transfer out of hospital', field: '#transferExternalLocation' },
    { label: 'Death', field: '#dateOfDeath' },
  ];
  test('the disposition shows the transfer location or date of death only for the matching choice', async ({ page }) => {
    const select = page.locator('#encounter-disposition select').first();
    for (const d of dispositions) {
      await expect(page.locator(d.field), `${d.field} starts hidden`).toBeHidden();
    }
    for (const d of dispositions) {
      await select.selectOption({ label: d.label });
      for (const other of dispositions) {
        if (other === d) {
          await expect(page.locator(other.field), `${d.label} shows ${other.field}`).toBeVisible();
        } else {
          await expect(page.locator(other.field), `${d.label} hides ${other.field}`).toBeHidden();
        }
      }
    }
    await select.selectOption({ label: 'Discharge' });
    for (const d of dispositions) {
      await expect(page.locator(d.field)).toBeHidden();
    }
  });

  test('ticking an NCD category in the new clinical impressions shows no onset date (V2)', async ({ page }) => {
    // toggle :313 has no target here
    await page.locator('#diabetes-onset-q').getByLabel('Diabetes', { exact: true }).check();
    await expect(page.locator('#diabetes-onset-date')).toHaveCount(0);
  });

  test('saves the plan, a chest X-ray, the new clinical impression and the next appointment', async ({
    page,
    api,
  }) => {
    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);

    await page.locator('#treatment-plan textarea').fill('Start amlodipine and review in a month');
    await page.getByLabel('Normal', { exact: true }).first().check(); // chest X-ray findings
    await page.locator('#diabetes-onset-q').getByLabel('Diabetes', { exact: true }).check();
    await page.locator('#clinical-impress textarea').fill('Poorly controlled diabetes');
    await page.getByLabel('Medication prescribed', { exact: true }).check();
    await setDate(page, '#apptDate', nextYear);
    await savePlan(page);

    const obs = await getEncounterObs(api, section.encounter.uuid);
    const displays = obs.map((o) => `${o.concept.display}: ${o.display}`.toLowerCase());
    const values = obs.map((o) => String(o.value));
    expect(values).toContain('Start amlodipine and review in a month');
    expect(values).toContain('Poorly controlled diabetes');
    expect(displays.some((d) => d.includes('diabetes'))).toBeTruthy();
    expect(displays.some((d) => d.includes('chest'))).toBeTruthy(); // hidden "procedure performed" of the X-ray group
    expect(displays.some((d) => d.includes('normal'))).toBeTruthy();
    expect(displays.some((d) => d.includes(String(nextYear.getFullYear())))).toBeTruthy(); // return visit date

    // <enrollInProgram programId="NCD"> :31
    const res = await api.get(`programenrollment?patient=${section.patient.uuid}&v=custom:(program:(name))`);
    expect(res.ok()).toBeTruthy();
    const enrollments = (await res.json()).results as Array<{ program: { name: string } }>;
    expect(enrollments.some((e) => /ncd/i.test(e.program.name))).toBeTruthy();

    // EDIT starts from the saved values
    await openPlan(page, section);
    await expect(page.locator('#treatment-plan textarea')).toHaveValue('Start amlodipine and review in a month');
    await expect(page.locator('#diabetes-onset-q').getByLabel('Diabetes', { exact: true })).toBeChecked();
    await expect(page.getByLabel('Medication prescribed', { exact: true })).toBeChecked();

    // VIEW: the plan, the chest X-ray finding, the new clinical impression, the medication tick and the return visit date (dd MMM yyyy);
    // the lab tests and the disposition were not touched, so they show no value. The hidden "Radiology procedure performed" obs of the
    // X-ray group is set by the form, not shown.
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const apptText = `${String(nextYear.getDate()).padStart(2, '0')} ${months[nextYear.getMonth()]} ${nextYear.getFullYear()}`;
    const view = await expectViewShowsSavedObs(page, api, FORM, section.encounter.uuid, {
      'Radiology procedure performed: Chest (X-ray)': '',
      'Medication prescribed at consult end: Yes': '[X] Medication prescribed',
      [`Return visit date: ${nextYear.getFullYear()}-${String(nextYear.getMonth() + 1).padStart(2, '0')}-${String(nextYear.getDate()).padStart(2, '0')}`]: apptText, // a date-only value: the helper compares only text, number and coded values
    });
    expect(await view.valueTexts()).toEqual([
      'Start amlodipine and review in a month',
      '[X] Normal',
      '[X] Diabetes',
      'Poorly controlled diabetes',
      '[X] Medication prescribed',
      apptText,
    ]);
    await expect(view.page.locator('#apptDate .value')).toHaveText(apptText);
    await expect(view.page.locator('#test-orders .value, #encounter-disposition .value')).toHaveCount(0);
    await expect(view.page.locator('input.submitButton, button.cancel')).toHaveCount(0); // ifMode :400
  });
});
