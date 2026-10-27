import { test, expect, type SectionEncounter } from '../../core';
import { ANC_INTAKE_ENCOUNTER_TYPE_UUID } from '../../core/constants';
import { getEncounterObs } from '../../commands';
import { SectionFormPage } from '../../pages';

// section-anc-intake.xml: ANC intake history, high-risk factors, vitals, tests and orders. On the visit
// page it is the "section" of an ANC intake encounter; the specs open the form URL directly
// (documentation/_availability.e2e.md).
//
// Conditions in the form, from documentation inventory (section-anc-intake.inv.md):
//   ifMode VIEW include=false  :31, :598  script and #buttons in ENTER/EDIT only
//   when risk factor = Previous c-section  :183  show #c-section-details
//   when #us-performed checked             :368  show #us-findings
//   ifMode VIEW                :582  "view/edit appointments" link above the appointment widget
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
    await expect(page).not.toHaveURL(/referenceapplication\/home\.page/);
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
  });
});
