import { test, expect, type SectionEncounter } from '../../core';
import { ANC_INTAKE_ENCOUNTER_TYPE_UUID } from '../../core/constants';
import { getEncounterObs } from '../../commands';
import { SectionFormPage, expectViewShowsSavedObs, VISIT_PAGE_URL } from '../../pages';

// section-anc-intake.xml: ANC intake history, high-risk factors, vitals, tests and orders. On the visit
// page it is the "section" of an ANC intake encounter; the specs open the form URL directly
// (documentation/_availability.e2e.md).
//
// Conditions in the form, from documentation inventory (section-anc-intake.inv.md):
//   ifMode VIEW include=false  :31, :598  script and #buttons in ENTER/EDIT only
//   when risk factor = Previous c-section  :183  show #c-section-details
//   when #us-performed checked             :368  show #us-findings
//   ifMode VIEW                :582  "view/edit appointments" link above the appointment widget
// VIEW (viewEncounterWithHtmlForm getAsHtml.action) is covered by the 'VIEW:' test and the save test; the page scripts do not run in it.
// Not covered here: the LMP > 305 days validation (V1, Medium: Save does nothing and gives no message),
// which needs the shared estimated-delivery-date widget.

// Sub-forms (behaviour in documentation/_shared.e2e.md): est-delivery-date-ga-initial.xml (+ edd.js,
// est-delivery-date-ga.js/.css), prior-vital-signs-widget.xml, vital-signs-anc-widget.xml,
// tb-symptom-screening-widget.xml, rapid-tests-widget.xml, drug-order-widget.xml, mental-health-phq2.xml.
// Side effects on save (pihcore classes, not verified here): PregnancyProgramEnrollmentAction, ApplyDispositionAction.
// Required: prior neonatal deaths, stillbirths, abortus (A), living (L) (0 is fine) and "LMP known?".
//
// Scripts: setUpNextAndSubmitButtons() wires #next/#submit. htmlForm.getBeforeValidation() (:40-53, SL-1279)
// reads the hidden #lastPeriodDate; if set and |encounter date - LMP| > 305 days it scrolls to #lastPeriodDate
// and returns false, blocking Save/Next. The encounter date is the stored one (render-time lookup).
//
// Findings:
//   V1 Medium :46-49   LMP > 305 days before the encounter date blocks Save/Next with no message (boundary also
//                      differs from the widget's `< 305`, see _shared V11). Fix: show a message next to #lastPeriodDate.
//                      Not covered here: needs the shared EDD widget.
//   V2 Low    :205     answerCode="pihcore.lab.hiv.title" is not a template variable (the template uses {hint}),
//                      so the HIV risk-factor label is the untranslated "HIV". Fix: hint="pihcore.lab.hiv.title".
//   V3 Info   :171,181,202  risk-factor checkbox ids contain colons (some spaces): `#risk-CIEL:163155` is not a
//                      valid CSS selector; use getByLabel or [id="..."].

const FORM = 'section-anc-intake.xml';

test.describe('section-anc-intake', () => {
  let section: SectionEncounter;

  test.beforeEach(async ({ page, createSectionEncounter }) => {
    section = await createSectionEncounter({
      encounterTypeUuid: ANC_INTAKE_ENCOUNTER_TYPE_UUID,
      patient: { givenName: 'AutoAnc', familyName: 'Tester', gender: 'F' },
    });
    await SectionFormPage.openEdit(page, FORM, section);
  });

  test('"previous c-section" details show only when that risk factor is ticked', async ({ page }) => {
    // when :183
    const details = page.locator('#c-section-details');
    await expect(details).toBeHidden();
    await page.getByLabel('Previous c-section').check();
    await expect(details).toBeVisible();
    await page.getByLabel('Previous c-section').uncheck();
    await expect(details).toBeHidden();
  });

  test('ultrasound findings show only when an ultrasound was performed', async ({ page }) => {
    // when :368
    const findings = page.locator('#us-findings');
    await expect(findings).toBeHidden();
    await page.locator('#us-performed input[type=checkbox]').check();
    await expect(findings).toBeVisible();
    await page.locator('#us-performed input[type=checkbox]').uncheck();
    await expect(findings).toBeHidden();
  });

  test('the obstetric history counts are required: saving with them blank does not save', async ({ page }) => {
    const form = new SectionFormPage(page, FORM);
    await form.save();
    await expect(page).not.toHaveURL(VISIT_PAGE_URL);
    await expect(page.locator('span.field-error', { hasText: 'Required' }).first()).toBeVisible();
  });

  test('saves the intake with the required counts and a high-risk factor', async ({ page, api }) => {
    await page.getByLabel('Eclampsia', { exact: true }).check();
    await page.locator('#w22').fill('0'); // prior neonatal deaths
    await page.locator('#w24').fill('0'); // prior stillbirths
    await page.locator('#w73').fill('0'); // abortus (A)
    await page.locator('#w75').fill('0'); // living (L)
    // "LMP known?" in the estimated-delivery-date widget is required too; answer No
    await page.locator('#w79_1').check();

    const form = new SectionFormPage(page, FORM);
    await form.save();
    await form.expectSaved();

    const displays = (await getEncounterObs(api, section.encounter.uuid)).map((o) => o.display.toLowerCase());
    expect(displays.some((d) => d.includes('eclampsia'))).toBeTruthy();
    await expectViewShowsSavedObs(page, api, FORM, section.encounter.uuid);
  });

  // VIEW (viewEncounterWithHtmlForm getAsHtml.action): every saved value in a span.value, every unselected option in a span.emptyValue.
  // A risk factor is labelled by the form ("Previous c-section") and not by its concept ("High risk pregnancy due to previous caesarian section").
  test('VIEW: shows what was saved (history, risk factors with their labels, tests, habits, disposition) and nothing for the unanswered questions', async ({
    page,
    api,
  }) => {
    await page.locator('p.side-by-side').first().getByRole('radio').nth(1).check(); // trimester at enrollment: second
    await page.locator('p.side-by-side', { hasText: /referred/i }).getByRole('radio').nth(0).check(); // PHU
    await page.locator('p', { hasText: 'Reason for referral' }).locator('input[type=text]').fill('Anaemia');
    await page.getByLabel('normal', { exact: true }).check(); // weight of other babies
    await page.getByLabel('Previous c-section').check();
    await page.locator('#c-section-details input').nth(0).fill('2');
    await page.locator('#c-section-details input').nth(1).fill('3');
    await page.getByLabel('Eclampsia', { exact: true }).check();
    await page.getByLabel('Syphilis', { exact: true }).check();
    await page.locator('#w22').fill('0'); // prior neonatal deaths: a saved 0 must show as 0
    await page.locator('#w24').fill('1'); // prior stillbirths
    await page.locator('#w73').fill('0');
    await page.locator('#w75').fill('2');
    await page.locator('.four-columns > div').nth(0).locator('input').fill('3'); // gravida
    await page.locator('.four-columns > div').nth(1).locator('input').fill('2'); // para
    await page.locator('#w79_1').check(); // LMP known: no
    await page.locator('#weight input').fill('62.5');
    await page.locator('#blood-type input[type=radio]').first().check(); // A+
    await page.locator('#malariaRDT input[type=radio]').nth(0).check(); // Positive
    await page.locator('#syphillis-rapid-test input[type=radio]').nth(0).check(); // Positive
    await page.locator('#us-performed input[type=checkbox]').check();
    await page.locator('#us-findings textarea').fill('Single live fetus');
    await page.locator('#unhealthy_habits').getByRole('radio').nth(1).check(); // smokes: currently
    await page.locator('#unhealthy_habits').getByRole('radio').nth(6).check(); // alcohol: never
    await page.locator('#fefol input[type=radio]').first().check(); // yes
    await page.locator('#birth-home input[type=checkbox]').check();
    await page.locator('#encounter-disposition select').selectOption({ label: 'Discharge' });
    await page.locator('#submit').click();
    await new SectionFormPage(page, FORM).expectSaved();

    const view = await expectViewShowsSavedObs(page, api, FORM, section.encounter.uuid, {
      'Risk factors for current pregnancy: High risk pregnancy due to previous caesarian section': '[X] Previous c-section',
      'Disposition categories: Discharged': 'Discharge', // the disposition select shows the option's label
    });
    const shown = await view.valueTexts();
    for (const expected of [
      '[X] Second trimester',
      '[X] Peripheral Health Unit (PHU)', // answerCodes: the form's label, not the concept's
      'Anaemia',
      '[X] normal',
      '[X] Eclampsia',
      '[X] Previous c-section',
      '[X] Syphilis',
      '62.5',
      '[X] A+',
      '[X] Positive', // malaria RDT, syphilis rapid test
      'Single live fetus',
      '[X] Currently',
      '[X] Never',
      '[X] yes', // FeFol
      '[X] no', // LMP known
      '[X] Wellbody', // the birth waiting home box (section-anc-followup V2)
      'Discharge',
    ]) {
      expect(shown, expected).toContain(expected);
    }
    // the counts: a saved 0 is a value, not a blank, and each count is shown under its own label
    const count = (label: string) => page.locator('p', { hasText: label }).locator('.value');
    await expect(count('Number of prior neonatal deaths')).toHaveText('0');
    await expect(count('Number of prior stillbirths')).toHaveText('1');
    await expect(page.locator('.four-columns > div .value')).toHaveText(['3', '2', '0', '2']); // G, P, A, L
    await expect(page.locator('#c-section-details .value')).toHaveText(['2', '3']);
    // the "≤" / "≥" of the birth weights of other babies is an entity in the code of the label: it must be rendered, not printed
    await expect(page.locator('.emptyValue', { hasText: 'birth weight' }).first()).toHaveText(/birth weight\s+≤\s*2\.5kg/);
    // the questions that were not answered show no value
    for (const label of ['IPTp-SP', 'Nutrition counselling', 'Counselled for HIV testing', 'Counselled for danger signs']) {
      await expect(page.locator('p.list-inline-wide', { hasText: label }).locator('.value'), label).toHaveCount(0);
    }
    await expect(page.locator('p.list-inline', { hasText: 'HIV rapid test' }).locator('.value')).toHaveCount(0);
    await expect(page.locator('p.list-inline', { hasText: 'Urine glucose' }).locator('.value')).toHaveCount(0);
    expect(shown).not.toContain('[X] Preeclampsia');
    await expect(page.locator('#buttons, textarea, select, input[type=text], input[type=radio], input[type=checkbox]')).toHaveCount(0); // read-only
  });
});
