import { test, expect, type SectionEncounter } from '../../core';
import { OUTPATIENT_INITIAL_ENCOUNTER_TYPE_UUID } from '../../core/constants';
import { getEncounterObs } from '../../commands';
import { SectionFormPage, expectViewShowsSavedObs } from '../../pages';

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
// EDIT/ENTER and VIEW are both covered by the save test (the VIEW lists exactly the saved answers; an order is never saved from a spec).
//
// Findings:
//   V1 Medium :108    Ultrasound "Other" checkbox saves PIH:Other (US) but has answerLabel="Other (XRay)", so the X-ray
//                     and ultrasound "Other" boxes read alike and the ultrasound one claims to be an X-ray.
//                     Fix: answerLabel="Other (US)". TESTED below (test.fixme).
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
  // the ultrasound. Remove test.fixme() when the label is fixed.
  test('the ultrasound "Other" checkbox is not labelled as an X-ray (V1)', async ({ page }) => {
    test.fixme();
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
    await page.locator('#drug-orders textarea').fill('Compare with last film');
    await page.locator('#encounter-disposition select').selectOption({ label: 'Discharge' });
    await page.locator('#disposition-section input[type=text]:visible').first().fill('Home with family');
    // the date input is a read-only datepicker: set the date through the widget (the return visit date is a future date)
    await page.evaluate(() => (window as any).jq('#apptDate input.hasDatepicker').first().datepicker('setDate', new Date(2030, 5, 20)));
    await page.locator('#buttons input.submitButton').click();
    await new SectionFormPage(page, FORM).expectSaved();

    const displays = (await getEncounterObs(api, section.encounter.uuid)).map((o) => o.display.toLowerCase());
    expect(displays.some((d) => d.includes('review in two weeks'))).toBeTruthy();
    expect(displays.some((d) => d.includes('chest'))).toBeTruthy();
    expect(displays.some((d) => d.includes('obstetric'))).toBeTruthy();
    expect(displays.some((d) => d.includes('discharge'))).toBeTruthy();

    // VIEW: exactly the saved answers; the radiology tick uses the form's own label (Chest, not "Chest, 1 view (X-ray)"), the disposition
    // shows as a plain value, the return visit date as dd MMM yyyy, and no buttons are rendered
    const view = await expectViewShowsSavedObs(page, api, FORM, section.encounter.uuid, {
      'Radiology image order (coded): Chest, 1 view (X-ray)': '[X] Chest',
      'Radiology image order (coded): Obstetric (US)': '[X] Obstetric',
      'Disposition categories: Discharged': 'Discharge',
      'Return visit date: 2030-06-20': '20 Jun 2030', // a date-only value: the helper compares only text, number and coded values
    });
    expect(await view.valueTexts()).toEqual([
      'Review in two weeks',
      '[X] yes', // HIV counselling
      '[X] Yes', // family planning
      '[X] Chest',
      '[X] Obstetric',
      'Compare with last film',
      'Discharge',
      'Home with family',
      '20 Jun 2030',
    ]);
    await expect(view.page.locator('#clinical-management-plan .value')).toHaveText('Review in two weeks');
    await expect(view.page.locator('#hiv-counselling .value')).toHaveText('[X] yes');
    await expect(view.page.locator('#family-planning .value')).toHaveText('[X] Yes');
    await expect(view.page.locator('#radiology-orders .value')).toHaveText(['[X] Chest', '[X] Obstetric']);
    await expect(view.page.locator('#drug-orders .value')).toHaveText('Compare with last film'); // the remarks
    await expect(view.page.locator('#encounter-disposition .value')).toHaveText('Discharge');
    await expect(view.page.locator('#apptDate .value')).toHaveText('20 Jun 2030');
    await expect(view.page.locator('#buttons')).toHaveCount(0);
  });
});
