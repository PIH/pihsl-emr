import { test, expect, type SectionEncounter } from '../../core';
import { MCH_DELIVERY_ENCOUNTER_TYPE_UUID } from '../../core/constants';
import { getEncounterObs } from '../../commands';
import { SectionFormPage, expectViewShowsSavedObs } from '../../pages';

// section-plan-medication.xml: HIV counselling, medication orders and remarks of an MCH delivery encounter (it is
// the "Plan medication" section of the SL delivery visit; also used for ANC 1.1/2.0, documentation/_availability.e2e.md).
// The specs open the form URL directly. The form uses the HFE <submit> tag, so it has no #submit button
// (SectionFormPage.openEdit waits for it): the spec opens and saves through a local helper.
//
// Conditions in the form, from documentation inventory (section-plan-medication.inv.md):
//   ifMode VIEW include=false  :28, :60   "Plan" heading and #buttons (Save, Cancel) in ENTER/EDIT only
// No <when>, <includeIf>, <script> or required field of its own.
// Shared: drug-order-widget.xml (:49, see _shared.e2e.md): "Add Medication" opens a new-order row.
// Side effects on save (pihcore classes, not read here): ApplyDispositionAction, SetOrderAutoExpireDateAction (:7-8).
// Not covered here: revising, renewing or discontinuing an order and the quantity calculator (they need an active
// order in an earlier encounter).
// The order test purges its own order: the fixture's purge (commands/encounter-operations.ts) cannot delete an
// encounter that still has an order, so a spec that saves an order has to remove it itself.
// VIEW is covered for the counselling answer and the remarks. The drug-order widget draws its orders in VIEW with JavaScript (it reads
// them over REST from the page), which the VIEW harness (setContent, no page scripts) does not run, so a saved order is not checked in VIEW.
// Findings: none.

const FORM = 'section-plan-medication.xml';

test.describe('section-plan-medication', () => {
  let section: SectionEncounter;

  test.beforeEach(async ({ page, createSectionEncounter }) => {
    section = await createSectionEncounter({
      encounterTypeUuid: MCH_DELIVERY_ENCOUNTER_TYPE_UUID,
      patient: { givenName: 'AutoPlanMed', familyName: 'Tester', gender: 'F' },
    });
    await page.goto(SectionFormPage.editUrl(FORM, section));
    // ifMode VIEW include=false :60 renders the buttons in EDIT mode
    await expect(page.locator('#buttons input.submitButton')).toBeVisible();
  });

  test('saves with nothing filled in (no required field)', async ({ page }) => {
    await page.locator('#buttons input.submitButton').click();
    await new SectionFormPage(page, FORM).expectSaved();
  });

  test('saves HIV counselling and the medication remarks', async ({ page, api }) => {
    await page.locator('#hiv-counselling input[type=radio]').first().check(); // Counselled for HIV testing: yes
    await page.locator('#drug-orders textarea').fill('Take with food');
    await page.locator('#buttons input.submitButton').click();
    await new SectionFormPage(page, FORM).expectSaved();

    const displays = (await getEncounterObs(api, section.encounter.uuid)).map((o) => o.display.toLowerCase());
    expect(displays.some((d) => d.includes('yes'))).toBeTruthy();
    expect(displays.some((d) => d.includes('take with food'))).toBeTruthy();

    // VIEW: the counselling answer and the remarks are shown, and the Save / Cancel buttons are not (ifMode :60)
    const view = await expectViewShowsSavedObs(page, api, FORM, section.encounter.uuid);
    expect(await view.valueTexts()).toEqual(['[X] yes', 'Take with food']);
    await expect(view.page.locator('#hiv-counselling .value')).toHaveText('[X] yes');
    await expect(view.page.locator('#drug-orders .value')).toHaveText('Take with food');
    await expect(view.page.locator('#buttons')).toHaveCount(0);
  });

  test('saves a new medication order', async ({ page, api }) => {
    // "Add Medication" (shared drug-order-widget) opens a new-order row
    await page.locator('#order-action-button-NEW').click();
    const row = page.locator('#drug-orders .orderwidget-order-form:visible');
    await row.locator('.order-drug input.orderwidget-autocomplete-textbox').fill('Acetylsalicylic');
    await page.locator('.ui-autocomplete .ui-menu-item').first().click();
    await row.locator('.order-dose input').fill('1');
    await row.locator('.order-frequency select').selectOption({ index: 1 });
    await row.locator('.order-duration input').fill('5'); // days (default unit)
    await row.locator('.order-quantity input').fill('10');
    await page.locator('#buttons input.submitButton').click();
    await new SectionFormPage(page, FORM).expectSaved();

    const res = await api.get(`order?patient=${section.patient.uuid}&v=custom:(uuid,action)`);
    expect(res.ok()).toBeTruthy();
    const orders = (await res.json()).results as Array<{ uuid: string; action: string }>;
    // the fixture purges the encounter after the test, which fails while it still has orders: purge them here
    for (const o of orders) {
      expect((await api.delete(`order/${o.uuid}?purge=true`)).ok()).toBeTruthy();
    }
    expect(orders.map((o) => o.action)).toEqual(['NEW']);
  });
});
