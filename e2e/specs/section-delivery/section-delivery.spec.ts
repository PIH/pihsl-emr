import { test, expect, type SectionEncounter } from '../../core';
import { MCH_DELIVERY_ENCOUNTER_TYPE_UUID } from '../../core/constants';
import { SectionFormPage } from '../../pages';

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
//                      "specify" boxes. Fix: presentation-{0} / other-presentation-{0}. TESTED below (test.fail).
//   V2 Medium :103,111-119  hasValue looks for a `.fetus-name input` that does not exist, and the second `if` also
//                      hides infant 2 when only infant 3 is empty: saved data for infants 2/3 is hidden on reopen
//                      until Show more is clicked. TESTED below (test.fail).
//   V3 Low    :371     id="perineal tear" contains a space. Fix: perineal-tear.
//   V4 Low    :141,324,359,394,449  literal English used as uimessage code or plain text; <h7> is not a valid element.
//   V5 Low    :79      LMP is the patient's latest CIEL:1427 obs, not limited to the current pregnancy (unconfirmed).
//   V6 Info   :73-95   the GA/EDD block exists only in ENTER/EDIT (ifMode VIEW excluded).

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
  // Intended behaviour: only that infant's box shows. Remove test.fail() when the ids are templated.
  test('choosing "Other" presentation for infant 1 shows only infant 1\'s "specify" box (V1)', async ({ page }) => {
    test.fail();
    await page.locator('#show-more-fetus-button').click();
    await page.locator('#fetus-1').getByLabel('Other', { exact: true }).first().check();
    await expect(page.locator('#fetus-1 #other-presentation')).toBeVisible();
    await expect(page.locator('#fetus-2 #other-presentation')).toBeHidden();
  });

  // V2 (Medium): the "has a value" check looks for a `.fetus-name input` that does not exist and the second
  // `if` also hides infant 2 when only infant 3 is empty, so saved infant 2/3 data is hidden when the form is
  // reopened. Intended behaviour: an infant with saved data is shown. Remove test.fail() when fixed.
  test('reopening the form shows infant 2 when it has saved data (V2)', async ({ page }) => {
    test.fail();
    await page.locator('#show-more-fetus-button').click();
    // text inputs of infant 2: [0] delivery date display, [1] birth weight (kg)
    await page.locator('#fetus-2 input[type=text]').nth(1).fill('3.1');

    const form = new SectionFormPage(page, FORM);
    await form.save();
    await form.expectSaved();

    await SectionFormPage.openEdit(page, FORM, section);
    await expect(page.locator('#fetus-2')).toBeVisible();
  });
});
