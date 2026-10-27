import { test, expect, type SectionEncounter } from '../../core';
import { POSTNATAL_FOLLOWUP_ENCOUNTER_TYPE_UUID } from '../../core/constants';
import { getEncounterObs } from '../../commands';
import { SectionFormPage } from '../../pages';

// section-postnatal-followup.xml: postnatal followup visit (delivery date, danger signs, risk factors, vitals, tests,
// treatment, diagnoses, orders, prevention and family planning, counselling, disposition, appointment). On the visit page
// it is the section of a postnatal followup encounter; the specs open the form URL directly with a female patient
// (documentation/_availability.e2e.md).
//
// Conditions in the form, from documentation inventory (section-postnatal-followup.inv.md):
//   ifMode VIEW include=true   :30, :94, :458  VIEW-only CSS, #fhrDiv script, "view/edit appointments" link
//   ifMode VIEW include=false  :102, :474      script and #buttons (#next, #submit, #cancel) in ENTER/EDIT only
//   when #accepts-fp = Yes     :373            show #family-method (family planning methods + #implant-date)
//   when method = Implant      :391, IUD :392  show #implant-date (every method checkbox carries both <when>s)
// Sub-forms (behaviour in documentation/_shared.e2e.md): prior-vital-signs-widget, vital-signs-widget (+ .js scoring),
// rapid-tests-widget, drug-order-widget.
//
// Scripts: :95-99 (VIEW) and :104-108 (ENTER/EDIT) hide #fhrDiv, so the fetal heart rate inputs of the shared vitals
// widget never show (tested); the second also calls setUpNextAndSubmitButtons() (#next/#submit). No validation or default.
// Side effects on save: PregnancyProgramEnrollmentAction (:7) enrolls the patient in the Pregnancy program (tested),
// CleanDiagnosisConstructAction and ApplyDispositionAction (:6, :8). No required field.
// Not covered here: vitals scoring and the Save block (shared, _shared.e2e.md), orders, the appointment widget, the
// disposition, the last-vitals box (see _shared V3).
//
// Findings:
//   V1 Medium :391-392  every family-planning checkbox carries both <when>s and hides #implant-date whenever it changes
//                       and is not Implant/IUD. So ticking Implant then any other method hides the date although
//                       Implant is still ticked, and on load (EDIT) the later boxes hide it again, so a saved Implant
//                       or IUD never shows its date. Fix: one handler on the group that shows #implant-date while
//                       Implant or IUD is ticked. TESTED below (two test.fail).
//   V2 Low    :184      render answerCode="pihcore.lab.hiv.title" is ignored (template uses answerCode="{hint}"), so the
//                       HIV risk-factor label is the untranslated "HIV" (same as section-anc-intake V2).
//   V3 Info   :392,:411-416 IUD also shows the "Date of implant placement" field (the shared #implant-date); intent unconfirmed.

const FORM = 'section-postnatal-followup.xml';

test.describe('section-postnatal-followup', () => {
  let section: SectionEncounter;

  test.beforeEach(async ({ page, createSectionEncounter }) => {
    section = await createSectionEncounter({
      encounterTypeUuid: POSTNATAL_FOLLOWUP_ENCOUNTER_TYPE_UUID,
      patient: { givenName: 'AutoPostnatal', familyName: 'Tester', gender: 'F' },
    });
    await SectionFormPage.openEdit(page, FORM, section);
  });

  test('the family planning methods show only when "Accepts and receives family planning" is Yes', async ({ page }) => {
    // when :373
    const methods = page.locator('#family-method');
    await expect(methods).toBeHidden();
    await page.locator('#accepts-fp input[type=radio]').first().check(); // yes
    await expect(methods).toBeVisible();
    await page.locator('#accepts-fp input[type=radio]').nth(1).check(); // no
    await expect(methods).toBeHidden();
  });

  test('the implant date shows for Implant and IUD, not for other methods', async ({ page }) => {
    // when :391 (Implant) and :392 (IUD)
    await page.locator('#accepts-fp input[type=radio]').first().check();
    const date = page.locator('#implant-date');
    await expect(date).toBeHidden();
    for (const [method, shown] of [
      ['Combined oral contraceptive (COC)', false],
      ['Implant', true],
      ['IUD', true],
    ] as const) {
      const box = page.getByLabel(method, { exact: true });
      await box.check();
      if (shown) {
        await expect(date).toBeVisible();
      } else {
        await expect(date).toBeHidden();
      }
      await box.uncheck();
      await expect(date).toBeHidden();
    }
  });

  // V1 (Medium): a later change of another method checkbox hides #implant-date although Implant is still ticked.
  // Intended: the date stays visible while Implant (or IUD) is ticked. Remove test.fail() when :391-392 are fixed.
  test('the implant date stays visible when another method is ticked after Implant (V1)', async ({ page }) => {
    test.fail();
    await page.locator('#accepts-fp input[type=radio]').first().check();
    await page.getByLabel('Implant', { exact: true }).check();
    await expect(page.locator('#implant-date')).toBeVisible();
    await page.getByLabel('Combined oral contraceptive (COC)').check();
    await expect(page.locator('#implant-date')).toBeVisible({ timeout: 3000 });
  });

  test('the fetal heart rate inputs of the vitals widget are hidden', async ({ page }) => {
    // script :104-108 hides #fhrDiv (postnatal patients have no FHR)
    await expect(page.locator('#fhrDiv')).toBeHidden();
    await expect(page.locator('#vitals input.legalValue').first()).toBeVisible(); // the other vitals are there
  });

  test('a saved family planning answer shows its methods when the form is reopened (EDIT)', async ({ page, api }) => {
    // when :373, EDIT starts from the saved value
    await page.locator('#accepts-fp input[type=radio]').first().check();
    await page.getByLabel('IUD', { exact: true }).check();
    await page.locator('#submit').click();
    await new SectionFormPage(page, FORM).expectSaved();

    await SectionFormPage.openEdit(page, FORM, section);
    await expect(page.locator('#family-method')).toBeVisible();
    await expect(page.getByLabel('IUD', { exact: true })).toBeChecked();
    const displays = (await getEncounterObs(api, section.encounter.uuid)).map((o) => o.display.toLowerCase());
    expect(displays.some((d) => d.includes('intra uterine device'))).toBeTruthy();
  });

  // V1 (Medium), EDIT variant: the <when> handlers run in order on load and the last family-planning checkboxes (not
  // Implant/IUD) hide #implant-date again, so a saved IUD or Implant never shows its date in EDIT mode.
  // Intended: the date is visible when the saved method is Implant or IUD. Remove test.fail() when :391-392 are fixed.
  test('a saved IUD shows the implant date when the form is reopened (V1)', async ({ page }) => {
    test.fail();
    await page.locator('#accepts-fp input[type=radio]').first().check();
    await page.getByLabel('IUD', { exact: true }).check();
    await page.locator('#submit').click();
    await new SectionFormPage(page, FORM).expectSaved();

    await SectionFormPage.openEdit(page, FORM, section);
    await expect(page.getByLabel('IUD', { exact: true })).toBeChecked();
    await expect(page.locator('#implant-date')).toBeVisible({ timeout: 3000 });
  });

  test('saves danger signs, risk factors and counselling, and enrolls the patient in the Pregnancy program', async ({
    page,
    api,
  }) => {
    const enrollmentsUrl = `programenrollment?patient=${section.patient.uuid}&v=custom:(program:(name),dateCompleted)`;
    expect(((await (await api.get(enrollmentsUrl)).json()).results as unknown[]).length).toBe(0);

    await page.getByLabel('Abnormal vaginal bleeding', { exact: true }).check(); // danger sign
    await page.getByLabel('Postpartum haemorrhage', { exact: true }).check(); // risk factor
    await page.locator('#fefol input[type=radio]').first().check(); // FeFol: yes
    await page.locator('#lab-treatment textarea').last().fill('Breast pain'); // Other complaints
    await page.locator('#submit').click();
    await new SectionFormPage(page, FORM).expectSaved();

    const displays = (await getEncounterObs(api, section.encounter.uuid)).map((o) => o.display.toLowerCase());
    expect(displays.some((d) => d.includes('vaginal bleeding'))).toBeTruthy();
    expect(displays.some((d) => d.includes('postpartum'))).toBeTruthy();
    expect(displays.some((d) => d.includes('breast pain'))).toBeTruthy();

    // PregnancyProgramEnrollmentAction :7
    const enrollments = (await (await api.get(enrollmentsUrl)).json()).results as Array<{ program: { name: string } }>;
    expect(enrollments.some((e) => /pregnancy/i.test(e.program.name))).toBeTruthy();
  });
});
