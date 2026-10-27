import { test, expect, type SectionEncounter } from '../../core';
import { OUTPATIENT_INITIAL_ENCOUNTER_TYPE_UUID } from '../../core/constants';
import { getEncounterObs } from '../../commands';
import { SectionFormPage } from '../../pages';

// section-plan.xml: outpatient Plan section (clinical management plan, HIV counselling, family planning, X-ray and
// ultrasound orders, medication orders, disposition and return visit date). The specs use an outpatient initial
// encounter and open the form URL directly (documentation/_availability.e2e.md). The form uses the HFE <submit> tag,
// so it has no #submit button (SectionFormPage.openEdit waits for it): the spec opens and saves through a local helper.
//
// Conditions in the form, from documentation inventory (section-plan.inv.md):
//   ifMode VIEW include=false  :28, :150   "Plan" heading and #buttons (Save, Cancel) in ENTER/EDIT only
// No <when>, <includeIf> or <script> of its own. Required: HIV counselling (:51), family planning (:64),
// disposition (:131).
// Shared: drug-order-widget.xml (:116, see _shared.e2e.md; its orders are covered in section-plan-medication.spec.ts).
// Side effects on save (pihcore classes, not read here): ApplyDispositionAction, SetOrderAutoExpireDateAction (:7-8).
// Not covered here: the "Other" X-ray / ultrasound comment fields (the REST obs display does not show comments).
//
// Findings:
//   V1 Medium :108    Ultrasound "Other" checkbox saves PIH:Other (US) but has answerLabel="Other (XRay)", so the X-ray
//                     and ultrasound "Other" boxes read alike and the ultrasound one claims to be an X-ray.
//                     Fix: answerLabel="Other (US)". TESTED below (test.fail).
//   V2 Low    :34,:38 duplicate id="clinical-management-plan" on the <section> and the <obs> wrapper span.
//                     Fix: rename one (e.g. the section to clinical-management-plan-section).
//   V3 Low    :76-80,:95-99 hard-coded English labels ("X-ray", "Chest", "Abdominal", ...) and answerLabels, so the
//                     Radiology block is not translated (not tested).

const FORM = 'section-plan.xml';

test.describe('section-plan', () => {
  let section: SectionEncounter;

  test.beforeEach(async ({ page, createSectionEncounter }) => {
    section = await createSectionEncounter({
      encounterTypeUuid: OUTPATIENT_INITIAL_ENCOUNTER_TYPE_UUID,
      patient: { givenName: 'AutoPlan', familyName: 'Tester', gender: 'M' },
    });
    await page.goto(SectionFormPage.editUrl(FORM, section));
    // ifMode VIEW include=false :150 renders the buttons in EDIT mode
    await expect(page.locator('#buttons input.submitButton')).toBeVisible();
  });

  test('saving with the required questions blank does not save', async ({ page }) => {
    // required="true" on HIV counselling :51, family planning :64, disposition :131
    await page.locator('#buttons input.submitButton').click();
    await expect(page).not.toHaveURL(/referenceapplication\/home\.page/);
    const errors = page.locator('span.field-error:visible', { hasText: 'Required' });
    await expect(errors).toHaveCount(3);
  });

  // V1 (Medium): the ultrasound "Other" checkbox (:107-108) is labelled "Other (XRay)". Intended: the label names
  // the ultrasound. Remove test.fail() when the label is fixed.
  test('the ultrasound "Other" checkbox is not labelled as an X-ray (V1)', async ({ page }) => {
    test.fail();
    const ultrasound = page.locator('fieldset#radiology-orders .two-columns-without-divs');
    await expect(ultrasound).toContainText('Ultrasound');
    const others = ultrasound.locator('label', { hasText: /^Other \(/ });
    await expect(others).toHaveCount(2);
    await expect(others.nth(1)).not.toHaveText(/XRay/, { timeout: 3000 });
  });

  test('saves the plan, counselling, orders and disposition', async ({ page, api }) => {
    await page.locator('#clinical-management-plan textarea').fill('Review in two weeks');
    await page.locator('#hiv-counselling input[type=radio]').first().check(); // Counselled for HIV testing: yes
    await page.locator('#family-planning input[type=radio]').first().check(); // Offered family planning: Yes
    await page.getByLabel('Chest', { exact: true }).check(); // X-ray: chest
    await page.getByLabel('Obstetric', { exact: true }).check(); // Ultrasound: obstetric
    await page.locator('#encounter-disposition select').selectOption({ label: 'Discharge' });
    await page.locator('#buttons input.submitButton').click();
    await new SectionFormPage(page, FORM).expectSaved();

    const displays = (await getEncounterObs(api, section.encounter.uuid)).map((o) => o.display.toLowerCase());
    expect(displays.some((d) => d.includes('review in two weeks'))).toBeTruthy();
    expect(displays.some((d) => d.includes('chest'))).toBeTruthy();
    expect(displays.some((d) => d.includes('obstetric'))).toBeTruthy();
    expect(displays.some((d) => d.includes('discharge'))).toBeTruthy();
  });
});
