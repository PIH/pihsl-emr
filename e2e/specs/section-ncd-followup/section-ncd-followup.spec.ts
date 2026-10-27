import { test, expect, type SectionEncounter } from '../../core';
import { NCD_FOLLOWUP_ENCOUNTER_TYPE_UUID } from '../../core/constants';
import { getEncounterObs } from '../../commands';
import { SectionFormPage } from '../../pages';

// section-ncd-followup.xml: Patient Details, NCD categories and vitals of the NCD followup encounter.
// The specs open the form URL directly, so the visit-page rule that shows this section only for the full
// followup and followup part 1 is not exercised (documentation/_availability.e2e.md).
//
// Conditions in the form, from documentation inventory (section-ncd-followup.inv.md):
//   ifMode VIEW include=false  :33   "Visit Information" heading in ENTER/EDIT only
//   includeIf followup types   :160  Patient Details fieldset (visit type, social support, missed school; all required)
//   when #social-support = Yes :182  show #specify-support
//   when #missed-school = Yes  :203  show #days-missed
//   toggle {nick}-onset-date   :238  dead: target never rendered (V1, Low) - not tested
//   includeIf initial types    :242  onset dates, never true for followup encounters
//   includeIf age < 13         :413, :483  MUAC fields; need a child patient and are not covered here
//   ifMode VIEW / not VIEW     :459, :469  BP read-only text vs inputs
//   ifMode VIEW include=false  :526  #buttons

// Scripts (:41-155, run on jq(document).ready in every mode including VIEW):
//   prefill (REST): GET ws/rest/v1/visit/<visitUuid>?v=custom:(...encounters:(...obs...)) with the visit uuid fixed at
//     render time. Takes the first Vitals-with-Glucose encounter that has obs and fills the read-only #lastVitals
//     panel (date/time, BP, heart rate, temperature, MUAC, respiratory rate, O2 sat, weight, height, fasting or
//     random glucose); #lastVitals (class hidden) is shown only when such an encounter exists. Not covered here:
//     it needs a vitals encounter in the visit.
//   derived (:141-145): #last_bmi = weight / (height/100)^2, toFixed(1), only when both exist.
//   a random glucose obs hides #fbg_span and shows #rbg_span.
// Side effects on save: <enrollInProgram programId="NCD"> (:225), covered below.
// The only blocking rule is HFE required="true" on the three Patient Details radios.
//
// Findings:
//   V1 Low :238, 242-246  category template copied from the history section: toggle="{nickname}-onset-date" targets
//                         exist only inside the initial-type includeIf, never true for followup encounters (9 dead
//                         toggles and a dead block). Fix: drop them here.
//   V2 Low :79-146        "most recent vitals" is the first Vitals-with-Glucose encounter in the REST array, not sorted
//                         by encounterDatetime (unconfirmed: depends on REST ordering).
//   V3 Low :130-138       the glucose label swap happens only when the random obs is read; with both fasting and random
//                         in one encounter the label can be wrong (unconfirmed, unusual data).
//   V4 Low :175-213       <div id="specify-support"> and <div id="days-missed"> nested inside <p class="side-by-side">
//                         (invalid HTML; the browser auto-closes the <p>). Fix: move the divs outside the <p>.

const FORM = 'section-ncd-followup.xml';

test.describe('section-ncd-followup', () => {
  let section: SectionEncounter;

  test.beforeEach(async ({ page, createSectionEncounter }) => {
    section = await createSectionEncounter({
      encounterTypeUuid: NCD_FOLLOWUP_ENCOUNTER_TYPE_UUID,
      patient: { givenName: 'AutoNcd', familyName: 'Tester', gender: 'F' },
    });
    await SectionFormPage.openEdit(page, FORM, section);
  });

  test('"if yes, specify support" shows only when social support is Yes', async ({ page }) => {
    // when :182
    const support = page.locator('#specify-support');
    await expect(support).toBeHidden();
    await page.locator('#w4_0').check(); // Social support: Yes
    await expect(support).toBeVisible();
    await page.locator('#w4_1').check(); // No
    await expect(support).toBeHidden();
  });

  test('"days of lost schooling" shows only when missed school is Yes', async ({ page }) => {
    // when :203
    const days = page.locator('#days-missed');
    await expect(days).toBeHidden();
    await page.locator('#w15_0').check(); // Missed school: Yes
    await expect(days).toBeVisible();
    await page.locator('#w15_1').check(); // No
    await expect(days).toBeHidden();
  });

  test('the Patient Details radios are required: saving with them blank does not save', async ({ page }) => {
    // required="true" on type of visit, social support and missed school (:160)
    const form = new SectionFormPage(page, FORM);
    await form.save();
    await expect(page).not.toHaveURL(/referenceapplication\/home\.page/);
    await expect(page.locator('span.field-error', { hasText: 'Required' }).first()).toBeVisible();
  });

  test('saves the visit details and NCD categories, and enrolls the patient in the NCD program', async ({
    page,
    api,
  }) => {
    await page.locator('#w2_0').check(); // Type of visit: Scheduled
    await page.locator('#w4_1').check(); // Social support: No
    await page.locator('#w15_1').check(); // Missed school: No
    await page.getByLabel('Diabetes', { exact: true }).check();
    await page.getByLabel('Hypertension', { exact: true }).check();

    const form = new SectionFormPage(page, FORM);
    await form.save();
    await form.expectSaved();

    const displays = (await getEncounterObs(api, section.encounter.uuid)).map((o) => o.display.toLowerCase());
    expect(displays.some((d) => d.includes('scheduled'))).toBeTruthy();
    expect(displays.some((d) => d.includes('diabetes'))).toBeTruthy();
    expect(displays.some((d) => d.includes('hypertension'))).toBeTruthy();

    // <enrollInProgram programId="NCD"> at :225 enrolls the patient on save
    const res = await api.get(
      `programenrollment?patient=${section.patient.uuid}&v=custom:(program:(name),dateCompleted)`,
    );
    expect(res.ok()).toBeTruthy();
    const enrollments = (await res.json()).results as Array<{ program: { name: string } }>;
    expect(enrollments.some((e) => /ncd/i.test(e.program.name))).toBeTruthy();
  });
});
