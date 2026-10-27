import { test, expect, type SectionEncounter } from '../../core';
import { ANC_FOLLOWUP_ENCOUNTER_TYPE_UUID } from '../../core/constants';
import { getEncounterObs } from '../../commands';
import { SectionFormPage } from '../../pages';

// section-anc-followup.xml: ANC followup visit (danger signs, risk factors, EDD, vitals, TB screen, tests, treatment,
// diagnoses, orders, prevention, PHQ-2, counselling, birth waiting home, disposition, appointment). On the visit page it is
// the section of an ANC followup encounter (form version 3.x/4.0); the specs open the form URL directly
// (documentation/_availability.e2e.md) with a female patient.
//
// Conditions in the form, from documentation inventory (section-anc-followup.inv.md):
//   ifMode VIEW include=true   :20, :381   VIEW-only CSS and the "view/edit appointments" link
//   ifMode VIEW include=false  :63, :398   script and #buttons (#next, #submit, #cancel) in ENTER/EDIT only
//   when #us-performed checked :231        show #us-findings (ultrasound findings textarea)
// Sub-forms (behaviour in documentation/_shared.e2e.md): pregnancy-group-widget (read-only here, $pregGroupViewOnly :78),
// est-delivery-date-followup (+ edd.js), prior-vital-signs-widget, vital-signs-anc-widget, tb-symptom-screening-widget,
// rapid-tests-widget, drug-order-widget, mental-health-phq2.
//
// Scripts: setUpNextAndSubmitButtons() (:65-70) wires #next/#submit; no rule, message or default of its own.
// Side effects on save: PregnancyProgramEnrollmentAction (:7) enrolls the patient in the Pregnancy program (tested),
// CleanDiagnosisConstructAction and ApplyDispositionAction (:6, :8). No required field; blank save succeeds.
// Not covered here: orders (see section-plan-medication.spec.ts for the shared widget), the appointment widget, the
// disposition, the last-vitals box (see _shared V3: it never appears here).
//
// Findings:
//   V1 Low    :135      render answerCode="pihcore.lab.hiv.title" is ignored (template uses answerCode="{hint}"), so the
//                       HIV risk-factor label is the untranslated "HIV" (same as section-anc-intake V2). Fix: hint=.
//   V2 Info   :363-364  the "Currently staying at birth waiting home" checkbox answer is PIH:12366, a concept named
//                       "Wellbody", so the box reads "Wellbody" (intent unconfirmed: one site's home hard-coded).
//   see _shared V2   invalid EDD disables Save but any vitals blur re-enables it (TESTED below with test.fail).

const FORM = 'section-anc-followup.xml';

test.describe('section-anc-followup', () => {
  let section: SectionEncounter;

  test.beforeEach(async ({ page, createSectionEncounter }) => {
    section = await createSectionEncounter({
      encounterTypeUuid: ANC_FOLLOWUP_ENCOUNTER_TYPE_UUID,
      patient: { givenName: 'AutoAncFu', familyName: 'Tester', gender: 'F' },
    });
    await SectionFormPage.openEdit(page, FORM, section);
  });

  test('ultrasound findings show only when an ultrasound was performed', async ({ page }) => {
    // when :231
    const findings = page.locator('#us-findings');
    await expect(findings).toBeHidden();
    await page.locator('#us-performed input[type=checkbox]').check();
    await expect(findings).toBeVisible();
    await page.locator('#us-performed input[type=checkbox]').uncheck();
    await expect(findings).toBeHidden();
  });

  test('a saved ultrasound shows its findings when the form is reopened (EDIT)', async ({ page, api }) => {
    // when :231, EDIT starts from the saved value
    await page.locator('#us-performed input[type=checkbox]').check();
    await page.locator('#us-findings textarea').fill('Single live fetus');
    await page.locator('#submit').click();
    await new SectionFormPage(page, FORM).expectSaved();

    await SectionFormPage.openEdit(page, FORM, section);
    await expect(page.locator('#us-findings')).toBeVisible();
    await expect(page.locator('#us-findings textarea')).toHaveValue('Single live fetus');
    const displays = (await getEncounterObs(api, section.encounter.uuid)).map((o) => o.display.toLowerCase());
    expect(displays.some((d) => d.includes('single live fetus'))).toBeTruthy();
  });

  test('saves danger signs, risk factors, tests and counselling, and enrolls the patient in the Pregnancy program', async ({
    page,
    api,
  }) => {
    const enrollmentsUrl = `programenrollment?patient=${section.patient.uuid}&v=custom:(program:(name),dateCompleted)`;
    const before = (await (await api.get(enrollmentsUrl)).json()).results as unknown[];
    expect(before.length).toBe(0);

    await page.getByLabel('Fever', { exact: true }).first().check(); // danger sign (Visit Diagnoses group)
    await page.getByLabel('Eclampsia', { exact: true }).check(); // risk factor
    await page.locator('#malariaRDT input[type=radio]').nth(1).check(); // Malaria RDT: Negative
    await page.locator('#fefol input[type=radio]').first().check(); // FeFol: yes
    await page.locator('#bednet input[type=radio]').first().check(); // Received LLIN: yes
    await page.locator('#lab-treatment textarea').last().fill('Mild backache'); // Other complaints
    await page.locator('#submit').click();
    await new SectionFormPage(page, FORM).expectSaved();

    const displays = (await getEncounterObs(api, section.encounter.uuid)).map((o) => o.display.toLowerCase());
    expect(displays.some((d) => d.includes('fever'))).toBeTruthy();
    expect(displays.some((d) => d.includes('eclampsia'))).toBeTruthy();
    expect(displays.some((d) => d.includes('negative'))).toBeTruthy();
    expect(displays.some((d) => d.includes('mild backache'))).toBeTruthy();

    // PregnancyProgramEnrollmentAction :7
    const enrollments = (await (await api.get(enrollmentsUrl)).json()).results as Array<{ program: { name: string } }>;
    expect(enrollments.some((e) => /pregnancy/i.test(e.program.name))).toBeTruthy();
  });

  // see _shared V2: est-delivery-date-followup disables Save on an invalid EDD (|EDD - encounter date| >= 305 days), but
  // vital-signs-widget.js re-enables it on every vitals blur. Intended: Save stays disabled while the EDD is invalid.
  // Remove test.fail() when the shared scripts are fixed.
  test('Save stays disabled after an invalid EDD even when a vitals field is edited (_shared V2)', async ({ page }) => {
    test.fail();
    // the EDD datepicker input is read-only: set the date through the jQuery UI widget and fire change on the hidden field
    await page.evaluate(() => {
      const w = window as unknown as { jq: (s: string) => { datepicker: (a: string, b: Date) => void; change: () => void } };
      w.jq('#w43-display').datepicker('setDate', new Date(2028, 11, 1));
      w.jq('#w43').change();
    });
    await expect(page.locator('#submit')).toBeDisabled();
    await page.locator('#w45').fill('60'); // weight
    await page.locator('#w47').click(); // blur weight
    await expect(page.locator('#submit')).toBeDisabled({ timeout: 3000 });
  });
});
