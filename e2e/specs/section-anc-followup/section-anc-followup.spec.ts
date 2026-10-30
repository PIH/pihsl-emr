import { test, expect, type SectionEncounter } from '../../core';
import { ANC_FOLLOWUP_ENCOUNTER_TYPE_UUID } from '../../core/constants';
import { getEncounterObs } from '../../commands';
import { SectionFormPage, expectViewShowsSavedObs } from '../../pages';

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
// VIEW (viewEncounterWithHtmlForm getAsHtml.action) is covered by the 'VIEW:' test (a form filled across the sections) and by the other save tests;
// the page scripts do not run in it (the "Visit date" and the calculated GA/EDD blocks stay blank), the saved values are shown in span.value.
// Not covered here: orders (see section-plan-medication.spec.ts for the shared widget), the appointment widget (only "No appointment scheduled"),
// the disposition's transfer/death extras, the last-vitals box (see _shared V3: it never appears here).
//
// Findings:
//   V1 Low    :135      render answerCode="pihcore.lab.hiv.title" is ignored (template uses answerCode="{hint}"), so the
//                       HIV risk-factor label is the untranslated "HIV" (same as section-anc-intake V2). Fix: hint=.
//   V2 Info   :363-364  the "Currently staying at birth waiting home" checkbox answer is PIH:12366, a concept named
//                       "Wellbody", so the box reads "Wellbody" (intent unconfirmed: one site's home hard-coded).
//   VW1 Info  :88,:283  the danger signs are saved as "Visit Diagnoses" constructs (CleanDiagnosisConstructAction), so the VIEW of the "Diagnoses"
//                       section lists each ticked danger sign again as "Secondary Diagnosis (Presumed) <sign>" next to the diagnoses the clinician chose
//                       (tested: Fever and Seizure). Probably intended (they are diagnoses in the data); fix only if the duplicate listing is unwanted: filter the
//                       widget or move the danger signs out of the Visit Diagnoses group.
//   see _shared V2   invalid EDD disables Save but any vitals blur re-enables it (TESTED below with test.fixme).

const FORM = 'section-anc-followup.xml';

// Saved obs that the VIEW does not print as a span.value: the hidden order/certainty of a diagnosis construct (the widget prints the diagnosis itself).
const NOT_A_VALUE = { 'Diagnosis order: Secondary': '', 'Diagnosis order: Primary': '', 'Diagnosis certainty: Presumed': '' };

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
    await expectViewShowsSavedObs(page, api, FORM, section.encounter.uuid);
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
    await expectViewShowsSavedObs(page, api, FORM, section.encounter.uuid, NOT_A_VALUE);

    // PregnancyProgramEnrollmentAction :7
    const enrollments = (await (await api.get(enrollmentsUrl)).json()).results as Array<{ program: { name: string } }>;
    expect(enrollments.some((e) => /pregnancy/i.test(e.program.name))).toBeTruthy();
  });

  // VIEW (viewEncounterWithHtmlForm getAsHtml.action): every saved value in a span.value, the rest in span.emptyValue or blank. The widget prints
  // the diagnoses (and the danger signs, which are saved as "Visit Diagnoses" constructs) in plain spans, so the diagnosis obs and the hidden
  // order/certainty obs are mapped to '' ("nothing to look for") and the diagnosis lines are asserted below instead.
  test('VIEW: shows what was saved (checkboxes, radios, tests, EDD, diagnosis, disposition) and nothing for the unanswered questions', async ({
    page,
    api,
  }) => {
    const pickDiagnosis = async () => {
      await page.locator('#diagnosis-search').pressSequentially('Pneumonia', { delay: 80 });
      await page.locator('ul.ui-autocomplete li').filter({ hasText: /^\s*J18\.9\s*Pneumonia\s*$/ }).first().click();
    };

    await page.getByLabel('Fever', { exact: true }).first().check(); // danger signs
    await page.getByLabel('Seizure', { exact: true }).check();
    await page.getByLabel('Eclampsia', { exact: true }).check(); // risk factors
    await page.getByLabel('Syphilis', { exact: true }).check();
    await page.locator('#estimatedGestationalAge input').fill('28'); // the page script derives the EDD from the gestational age
    await page.locator('#weight input').fill('62.5');
    await page.locator('#height input').fill('160');
    await page.locator('#bp_systolic input').fill('118');
    await page.locator('#bp_diastolic input').fill('76');
    await page.locator('#fhr input').fill('140');
    for (let row = 0; row < 4; row++) {
      await page.locator('.tbScreen > div').nth(row).getByLabel(row === 1 ? 'no' : 'yes').check(); // fever: no, the other three: yes
    }
    await page.locator('#malariaRDT input[type=radio]').nth(1).check(); // Negative
    await page.locator('#hiv-rapid-test input[type=radio]').nth(1).check(); // Negative
    await page.locator('#urine-glucose input[type=radio]').nth(1).check(); // +++
    await page.locator('#us-performed input[type=checkbox]').check();
    await page.locator('#us-findings textarea').fill('Single live fetus');
    await page.locator('#fefol input[type=radio]').first().check(); // yes
    await page.locator('#ipt-sp input[type=radio]').nth(1).check(); // no
    await page.locator('#lab-treatment textarea').last().fill('Mild backache');
    await pickDiagnosis();
    await page.locator('#data-collection textarea').last().fill('Booked for ANC');
    await page.locator('#bednet input[type=radio]').first().check();
    await page.locator('#birth-home input[type=checkbox]').check();
    await page.locator('#encounter-disposition select').selectOption({ label: 'Discharge' });
    await page.locator('#submit').click();
    await new SectionFormPage(page, FORM).expectSaved();

    // the EDD the script saved (a date-only value) is shown as dd MMM yyyy
    const saved = (await getEncounterObs(api, section.encounter.uuid)).find((o) => o.concept.display === 'Expected delivery date');
    const [year, monthNumber, day] = String(saved?.value).slice(0, 10).split('-');
    const edd = `${day} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(monthNumber) - 1]} ${year}`;
    const view = await expectViewShowsSavedObs(page, api, FORM, section.encounter.uuid, {
      ...NOT_A_VALUE,
      'Diagnosis: Pneumonia': '',
      [`Expected delivery date: ${year}-${monthNumber}-${day}`]: edd,
      'Disposition categories: Discharged': 'Discharge', // the disposition select shows the option's label
      'TB symptom present: Cough > 2 weeks': '[X] yes', // the TB rows are labelled "Cough > 2 weeks", "Night sweat", "Weight loss" and answered yes/no
      'TB symptom present: Night sweats': '[X] yes',
      'TB symptom present: Weight loss (kg)': '[X] yes',
      'TB symptom absent: Fever': '[X] no',
    });
    const shown = await view.valueTexts();
    for (const expected of [
      '[X] Fever', // danger signs
      '[X] Seizure',
      '[X] Eclampsia', // risk factors
      '[X] Syphilis',
      '28',
      edd,
      '62.5',
      '160',
      '118',
      '76',
      '140',
      '[X] Negative', // malaria RDT, HIV rapid test
      '[X] +++', // urine glucose
      '[X] Ultrasound',
      'Single live fetus',
      '[X] yes', // FeFol, LLIN
      '[X] no', // IPTp-SP
      'Mild backache',
      'Booked for ANC',
      '[X] Wellbody', // V2: the birth waiting home box
      'Discharge',
    ]) {
      expect(shown, expected).toContain(expected);
    }
    // a TB row shows the answer next to its own label
    const tbRow = (label: string) => page.locator('.tbScreen > div').filter({ hasText: label });
    await expect(tbRow('Cough > 2 weeks').locator('.value')).toHaveText(/\[X\]\s*yes/);
    await expect(tbRow('Fever').locator('.value')).toHaveText(/\[X\]\s*no/);
    // the diagnosis widget lists the chosen diagnosis, and also the two danger signs as presumed secondary diagnoses (VW1)
    await expect(page.locator('#data-collection p', { hasText: 'Primary Diagnosis' }).locator('span')).toHaveText('(Presumed) Pneumonia [J18.9]');
    await expect(page.locator('#data-collection p', { hasText: 'Secondary Diagnosis' })).toHaveCount(2);
    // the questions that were not answered show no value
    for (const label of ['Nutrition counselling', 'Counselled for HIV testing', 'Counselled for danger signs', 'Family planning counselling', 'Albendazole']) {
      await expect(page.locator('p.list-inline-wide', { hasText: label }).locator('.value'), label).toHaveCount(0);
    }
    await expect(page.locator('#malariaRDT .emptyValue').first()).toBeVisible(); // the other malaria RDT answers are listed unselected
    expect(shown).not.toContain('[X] Chest pain');
    expect(shown.filter((t) => t.includes('HIV'))).toEqual([]); // the HIV risk-factor box (V1: labelled "HIV") and the HIV counselling were not ticked
    await expect(page.getByText('No appointment scheduled')).toBeVisible(); // no appointment was booked
    await expect(page.locator('#buttons, textarea, select, input[type=text], input[type=radio], input[type=checkbox]')).toHaveCount(0); // read-only
  });

  // see _shared V2: est-delivery-date-followup disables Save on an invalid EDD (|EDD - encounter date| >= 305 days), but
  // vital-signs-widget.js re-enables it on every vitals blur. Intended: Save stays disabled while the EDD is invalid.
  // Remove test.fixme() when the shared scripts are fixed.
  test('Save stays disabled after an invalid EDD even when a vitals field is edited (_shared V2)', async ({ page }) => {
    test.fixme();
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
