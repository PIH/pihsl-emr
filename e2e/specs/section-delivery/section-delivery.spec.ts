import { test, expect, type SectionEncounter } from '../../core';
import { MCH_DELIVERY_ENCOUNTER_TYPE_UUID } from '../../core/constants';
import { SectionFormPage, expectViewShowsSavedObs } from '../../pages';

// section-delivery.xml: delivery summary, labor, up to three infants, findings and discharge. On the visit
// page it is the "section" of the MCH delivery encounter; the specs open the form URL directly
// (documentation/_availability.e2e.md).
//
// Conditions in the form, from documentation inventory (section-delivery.inv.md):
//   ifMode VIEW include=false  :73, :97, :560  scripts and #buttons in ENTER/EDIT only
//   when presentation = Other  :331  show #other-presentation (per infant, repeat at :220)
//   when HCW cadre = Other     :510  show #other-role
//   js :78,89                  GA/EDD block hidden unless the patient has an LMP obs
//   js :106-131                #fetus-2 / #fetus-3 hidden, Show more / Show less buttons
// VIEW (viewEncounterWithHtmlForm getAsHtml.action) is covered by the 'VIEW:' test: the infant groups, the form's own answer labels, no third infant.
// Not covered: the post-submission actions (program transition), which need a pregnancy enrollment.

// Sections inside the form: delivery-intake, labor, delivery-section (infants 1-3), delivery-findings, hcw,
// postpartum-fp, adt (discharge date + encounterDisposition).
// Side effects on save (pihcore classes, not verified here): CleanDiagnosisConstructAction, ApplyDispositionAction,
// PregnancyProgramPostpartumTransitionAction. A test that saves a disposition should also assert the program state.
//
// Scripts: calculateGestationalDays / calculateExpectedDeliveryDate (mch.js) and setUpNextAndSubmitButtons().
//   :75-93   derived: reads the latest LMP (CIEL:1427) and the encounter datetime (render-time constants). With an LMP:
//            #calculated-gestational-age-value = "<weeks> [<rem>/7 ]weeks", #calculated-edd = LMP + 280 days. Display
//            only: nothing is saved (the lastPeriodDate obs is in a hidden span). No validation.
//   :229     default: per-infant delivery date/time defaults to today (future dates disallowed, future times allowed).
//   :106-131 show/hide: #fetus-2/#fetus-3 hidden on load when either lacks a value; Show more / Show less buttons.
//
// Findings:
//   V1 Medium :327,335 (thenDisplay :331)  id="presentation" / id="other-presentation" inside the 3-infant repeat
//                      are not templated, so each exists three times and "Other" for one infant shows all three
//                      "specify" boxes. Fix: presentation-{0} / other-presentation-{0}. TESTED below (test.fixme).
//   V2 Medium :103,111-119  hasValue looks for a `.fetus-name input` that does not exist, and the second `if` also
//                      hides infant 2 when only infant 3 is empty: saved data for infants 2/3 is hidden on reopen
//                      until Show more is clicked. TESTED below (test.fixme).
//   V3 Low    :371     id="perineal tear" contains a space. Fix: perineal-tear.
//   V4 Low    :141,324,359,394,449  literal English used as uimessage code or plain text; <h7> is not a valid element.
//   V5 Low    :79      LMP is the patient's latest CIEL:1427 obs, not limited to the current pregnancy (unconfirmed).
//   V6 Info   :73-95   the GA/EDD block is filled and shown only in ENTER/EDIT (the script is ifMode VIEW excluded): in VIEW its markup stays
//                      hidden (class "hidden") with two blank span.value (#calculated-edd, #calculated-gestational-age-value).

const FORM = 'section-delivery.xml';

test.describe('section-delivery', () => {
  let section: SectionEncounter;

  test.beforeEach(async ({ page, createSectionEncounter }) => {
    section = await createSectionEncounter({
      encounterTypeUuid: MCH_DELIVERY_ENCOUNTER_TYPE_UUID,
      patient: { givenName: 'AutoDel', familyName: 'Tester', gender: 'F' },
    });
    await SectionFormPage.openEdit(page, FORM, section);
  });

  test('the gestational age / EDD block is hidden when the patient has no LMP', async ({ page }) => {
    // js :78, 89
    await expect(page.locator('#calculated-edd-and-gestational')).toBeHidden();
  });

  test('only infant 1 shows at first; Show more / Show less toggles infants 2 and 3', async ({ page }) => {
    // js :106-131
    await expect(page.locator('#fetus-1')).toBeVisible();
    await expect(page.locator('#fetus-2')).toBeHidden();
    await expect(page.locator('#fetus-3')).toBeHidden();

    await page.locator('#show-more-fetus-button').click();
    await expect(page.locator('#fetus-2')).toBeVisible();
    await expect(page.locator('#fetus-3')).toBeVisible();
    await expect(page.locator('#show-less-fetus-button')).toBeVisible();

    await page.locator('#show-less-fetus-button').click();
    await expect(page.locator('#fetus-2')).toBeHidden();
    await expect(page.locator('#fetus-3')).toBeHidden();
  });

  test('"if other, specify" for the health-care worker cadre shows only for Other', async ({ page }) => {
    // when :510
    const other = page.locator('#other-role');
    await expect(other).toBeHidden();
    await page.locator('#hcw').getByLabel('Other').first().check();
    await expect(other).toBeVisible();
  });

  // V1 (Medium): id="presentation" / id="other-presentation" are not templated inside the 3-infant repeat,
  // so each exists three times and choosing "Other" for one infant shows the free-text box of all three.
  // Intended behaviour: only that infant's box shows. Remove test.fixme() when the ids are templated.
  test('choosing "Other" presentation for infant 1 shows only infant 1\'s "specify" box (V1)', async ({ page }) => {
    test.fixme();
    await page.locator('#show-more-fetus-button').click();
    await page.locator('#fetus-1').getByLabel('Other', { exact: true }).first().check();
    await expect(page.locator('#fetus-1 #other-presentation')).toBeVisible();
    await expect(page.locator('#fetus-2 #other-presentation')).toBeHidden();
  });

  // V2 (Medium): the "has a value" check looks for a `.fetus-name input` that does not exist and the second
  // `if` also hides infant 2 when only infant 3 is empty, so saved infant 2/3 data is hidden when the form is
  // reopened. Intended behaviour: an infant with saved data is shown. Remove test.fixme() when fixed.
  test('reopening the form shows infant 2 when it has saved data (V2)', async ({ page }) => {
    test.fixme();
    await page.locator('#show-more-fetus-button').click();
    // text inputs of infant 2: [0] delivery date display, [1] birth weight (kg)
    await page.locator('#fetus-2 input[type=text]').nth(1).fill('3.1');

    const form = new SectionFormPage(page, FORM);
    await form.save();
    await form.expectSaved();

    await SectionFormPage.openEdit(page, FORM, section);
    await expect(page.locator('#fetus-2')).toBeVisible();
  });

  // VIEW (viewEncounterWithHtmlForm getAsHtml.action): the infants are obs groups with showIfEmpty="false", so an infant without data is not
  // shown at all; the answers the form labels itself (Alive / FSB / MSB, M / F, "2nd degree", the HCW cadre, the disposition) are not the concept names.
  test('VIEW: shows what was saved per infant (and no third infant), with the form\'s own answer labels', async ({ page, api }) => {
    const setDateTime = async (row: number, hour: string, minute: string) => {
      const line = page.locator('p.date-one-line').nth(row);
      await line.locator('input.hasDatepicker').click();
      await page.locator('#ui-datepicker-div a.ui-state-default').first().click(); // a past day (the first cell of the calendar)
      await line.locator('select.hfe-hours').selectOption(hour);
      await line.locator('select.hfe-minutes').selectOption(minute);
      return line.locator('input.hasDatepicker').inputValue(); // "dd MMM yyyy"
    };
    const admissionDate = await setDateTime(0, '9', '5');
    const labourDate = await setDateTime(1, '14', '30'); // start of labour
    await page.locator('.three-columns input[type=text]').nth(0).fill('3'); // gravida
    await page.locator('.three-columns input[type=text]').nth(1).fill('2'); // para
    await page.locator('.three-columns input[type=text]').nth(2).fill('38.4'); // gestational age
    // infant 1: the whole group
    const infant1 = page.locator('#fetus-1');
    await infant1.locator('input.hasDatepicker').click();
    await page.locator('#ui-datepicker-div a.ui-state-default').first().click(); // the delivery date/time defaults to today in ENTER only
    const deliveryDate = await infant1.locator('input.hasDatepicker').inputValue();
    await infant1.locator('select.hfe-hours').selectOption('15');
    await infant1.locator('select.hfe-minutes').selectOption('45');
    await infant1.getByRole('radio').nth(0).check(); // type: spontaneous vaginal
    await infant1.getByLabel('Alive').check();
    await infant1.getByLabel('F', { exact: true }).check();
    await infant1.locator('input[type=text]').nth(1).fill('3.1'); // [0] is the delivery date
    await infant1.locator('input[type=text]').nth(2).fill('50');
    await infant1.locator('input[type=text]').nth(3).fill('34');
    await infant1.locator('.apgar input').nth(0).fill('7');
    await infant1.locator('.apgar input').nth(1).fill('8');
    await infant1.locator('.apgar input').nth(2).fill('9');
    await infant1.locator('#presentation input[type=radio]').nth(0).check();
    // infant 2: stillbirth, presentation "Other" with its specify text
    await page.locator('#show-more-fetus-button').click();
    const infant2 = page.locator('#fetus-2');
    await infant2.getByLabel('FSB').check();
    await infant2.locator('input[type=text]').nth(1).fill('2.9');
    await infant2.locator('#presentation').getByLabel('Other', { exact: true }).check();
    await infant2.locator('#other-presentation input').fill('Oblique lie');
    await page.getByLabel('2nd degree').check();
    await page.getByLabel('Eclampsia', { exact: true }).check();
    await page.getByLabel('Prolonged labour', { exact: true }).check();
    await page.getByLabel('Birth asphyxia', { exact: true }).check();
    await page.locator('#hcw input[type=text]').first().fill('Nurse Kamara');
    await page.locator('#hcw').getByLabel('SECHN Midwife').check();
    await page.locator('#encounter-disposition select').selectOption({ label: 'Discharge' });
    await page.locator('#submit').click();
    await new SectionFormPage(page, FORM).expectSaved();

    const view = await expectViewShowsSavedObs(page, api, FORM, section.encounter.uuid, {
      'Diagnosis order: Secondary': '', // hidden metadata of the "Visit Diagnoses" construct
      'Diagnosis: Prolonged labor': '[X] Prolonged labour',
      'Child gender: Female': '[X] F',
      'Qualitative birth outcome: Livebirth': '[X] Alive',
      'Qualitative birth outcome: Fresh stillbirth': '[X] FSB',
      'Perineal tear: Perineal laceration, second degree': '[X] 2nd degree',
      'Disposition categories: Discharged': 'Discharge',
    });
    // the admission and labour dates print as "dd MMM yyyy" followed by the time as "h:mm AM/PM" (the hidden calculated GA/EDD spans are blank values)
    await expect(view.page.locator('#delivery-intake .value').filter({ hasText: /\S/ })).toHaveText([admissionDate, '9:05 AM', '3', '2', '38.4']);
    await expect(view.page.locator('#labor .value')).toHaveText([labourDate, '2:30 PM']);
    // infant 1 has its whole group, infant 2 only what was entered, infant 3 is not rendered
    await expect(view.page.locator('#fetus-1 .value')).toHaveText([
      deliveryDate,
      '3:45 PM',
      '[X] Spontaneous vaginal delivery',
      '[X] Alive',
      '[X] F',
      '3.1',
      '50',
      '34',
      '7',
      '8',
      '9',
      '[X] Breech presentation',
    ]);
    await expect(view.page.locator('#fetus-1')).toContainText('Infant 1');
    await expect(view.page.locator('#fetus-2 .value')).toHaveText(['[X] FSB', '2.9', '[X] Other', 'Oblique lie']);
    await expect(view.page.locator('#fetus-2')).toContainText('Infant 2');
    await expect(view.page.locator('#fetus-3 .value, #fetus-3 .emptyValue')).toHaveCount(0);
    await expect(view.page.locator('#fetus-3')).not.toContainText('Infant 3');
    // the findings: only the ticked ones are values
    await expect(view.page.locator('#delivery-findings .value')).toHaveText(['[X] Eclampsia', '[X] Prolonged labour', '[X] Birth asphyxia']);
    await expect(view.page.locator('#hcw .value')).toHaveText(['Nurse Kamara', '[X] SECHN Midwife']); // answerCodes: the form's label, not the concept's
    // what was not answered shows no value
    await expect(view.page.locator('#postpartum-fp .value')).toHaveCount(0);
    await expect(view.page.locator('#adt .value')).toHaveText(['Discharge']);
    await expect(view.page.locator('#buttons, textarea, select, input[type=text], input[type=radio], input[type=checkbox]')).toHaveCount(0); // read-only
  });
});
