import { test, expect, type SectionEncounter } from '../../core';
import { NCD_FOLLOWUP_ENCOUNTER_TYPE_UUID } from '../../core/constants';
import { SectionFormPage } from '../../pages';

// section-hospital.xml: hospitalizations since the last visit (followup) or in the previous 12 months
// (initial), up to three blocks. The specs use an NCD followup encounter, so the "since last visit"
// variant renders.
//
// Conditions in the form, from documentation inventory (section-hospital.inv.md):
//   includeIf initial / part 1   :57, :91, :101, :174   previous-12-months variants (not rendered for followup)
//   includeIf followup / part 1  :72   "Hospitalization since last visit" radio, required
//   when radio = Yes             :80   show #hospital-details
//   when {diagnosis} checked     :137-145  show #{nickname}-plus-{n} (repeat: 8 diagnoses x 3 blocks)
//   ifMode VIEW include=false    :41, :550  script and #buttons-section in ENTER/EDIT only
//   includeIf full types         :551, :577  jump-button row and #next only for the full followup/initial

// Structure: <repeat with="['1'],['2'],['3']"> renders three hospitalization blocks (#hospitalization-1..3,
// obsgroups with showIfEmpty="false", so empty blocks are not rendered in VIEW); {0} becomes 1/2/3 in every id.
// Script: setUpNextAndSubmitButtons() (#next saves and opens the next section, each .nextSection button saves and
// opens the section whose id it carries, #submit saves and returns); no validation, message or default.
//
// Findings:
//   V1 Medium :137-145 vs :199,244,280,324,368,414,453,493  thenDisplay="#{nickname}-plus-{0}" expands to
//                      #dm-plus-1 etc., but the rows are id="dm-plus-t-{0}", and the Sickle-cell row (:453) has
//                      no id: all 192 targets resolve to nothing, so ticking a diagnosis shows or hides nothing and
//                      every disease row is always visible. Fix: ids <nick>-plus-{0}. TESTED below (test.fail).
//   V2 Low    :137-145 each checkbox lists all 8 <when> values but only its own can match: 168 of 192 are dead.
//   V3 Low    :258,:470  PIH:14921 answer CIEL:111103 (Stroke) is a checkbox in both the Hypertension and Sickle-cell
//                      rows of the same obsgroup (unconfirmed how HFE binds the saved obs). Fix: offer it in one row.
//   V4 Low    :519     "Other" row has id="other-htn-t-{0}", naming hypertension. Fix: other-t-{0}.
//   V5 Low    :124,194-196  hard-coded English instead of uimessage (not translated).

const FORM = 'section-hospital.xml';

test.describe('section-hospital', () => {
  let section: SectionEncounter;

  test.beforeEach(async ({ page, createSectionEncounter }) => {
    section = await createSectionEncounter({
      encounterTypeUuid: NCD_FOLLOWUP_ENCOUNTER_TYPE_UUID,
      patient: { givenName: 'AutoHosp', familyName: 'Tester', gender: 'M' },
    });
    await SectionFormPage.openEdit(page, FORM, section);
  });

  test('the hospitalization details show only when "Hospitalization since last visit" is Yes', async ({ page }) => {
    // when :80
    const details = page.locator('#hospital-details');
    await expect(details).toBeHidden();
    await page.locator('#w2_0').check(); // Yes
    await expect(details).toBeVisible();
    await page.locator('#w2_1').check(); // No
    await expect(details).toBeHidden();
    await page.locator('#w2_2').check(); // Unknown
    await expect(details).toBeHidden();
  });

  test('saving with the hospitalization question unanswered does not save', async ({ page }) => {
    // required="true" on #hospital-stay (:72)
    const form = new SectionFormPage(page, FORM);
    await form.save();
    await expect(page).not.toHaveURL(/referenceapplication\/home\.page/);
    await expect(page.locator('span.field-error', { hasText: 'Required' }).first()).toBeVisible();
  });

  test('saves "No hospitalization"', async ({ page }) => {
    await page.locator('#w2_1').check();
    const form = new SectionFormPage(page, FORM);
    await form.save();
    await form.expectSaved();
  });

  // V1 (Medium): thenDisplay="#{nickname}-plus-{0}" expands to #dm-plus-1 etc., but the rows are
  // id="dm-plus-t-{0}", so the targets do not exist. Intended behaviour: a diagnosis's disease row is
  // hidden until its diagnosis checkbox is ticked. Remove test.fail() when the ids are fixed.
  test('ticking a diagnosis shows its disease row (V1)', async ({ page }) => {
    test.fail();
    await page.locator('#w2_0').check();
    const diseaseRow = page.locator('#dm-plus-t-1');
    await expect(diseaseRow).toBeHidden();
    await page.locator('#dm-q-1').check(); // Diabetes mellitus (DM), hospitalization 1
    await expect(diseaseRow).toBeVisible();
  });
});
