import { type Page } from '@playwright/test';
import { test, expect, type SectionEncounter } from '../../core';
import { MCH_DELIVERY_ENCOUNTER_TYPE_UUID, OUTPATIENT_INITIAL_ENCOUNTER_TYPE_UUID } from '../../core/constants';
import { SectionFormPage, VisitPage } from '../../pages';

// section-prescriptions-print.xml (pihemr's file; SL has no copy): the print template of the plan sections, "Prescriptions": up to eight "Medication n"
// blocks (name, dose and unit, frequency, duration, instructions) read from "Prescription construct" obs groups, and a signature line. It is not an entry or edit
// form. encounterTypeConfig.js sets it as `printTemplateUrl` of `pihcore-plan` (outpatient initial/followup, :145) and of `pihcore-plan-medication` (MCH Delivery,
// :161); visit.js then does what a user's click on the printer icon of the section header does: GET that getAsHtml.action URL (Accept: application/json), swap the
// section's template for printPrescriptionsWithHtmlFormLong.page, which binds the returned HTML, and write `#prescriptionsDiv` into a pop-up window and print it.
// The specs do exactly that on the real visit page (window.open is replaced by a recorder, so nothing is printed), and also request the same URL directly.
// Fixture: the prescriptions are saved through section-plan-medication_v1.1.xml (SL's own legacy copy of the medication plan: it is the form that still writes
// "Prescription construct" obs, like the section-plan_v1.0 that production used before the drug-order widget) on an outpatient initial and on an MCH Delivery
// encounter; the "current" case is saved through section-plan-medication.xml with the drug-order widget. Not in the form: no patient name, id, date or prescriber.
//
// Conditions in the form, from documentation inventory (section-prescriptions-print.inv.md): none (no ifMode, includeIf, when or script).
// Data read: <obsgroup PIH:Prescription construct showIfEmpty=false> x 8 slots (`{0}` = 1..8): MEDICATION ORDERS (drug, shown by its name), CIEL:160856 dose, Dosing units
//   coded, Drug frequency for HUM, CIEL:159368 duration, TIME UNITS, Prescription instructions non-coded. Empty slots render nothing (tested).
// Side effects: none (read only).
// Visit-page display: the Plan section's header shows the printer icon only when the encounter has Prescription construct obs (defaultPlanSectionActions.gsp), which
//   is what V1 is about. The section's own VIEW (section-plan(-medication).xml) is covered by those forms' specs.
// Not covered here: the browser print dialog; more than two prescriptions; the `pihcore-plan` section of an outpatient FOLLOWUP (same section, same printTemplateUrl).
//
// Findings: see pihemr _findings.e2e.md#section-prescriptions-print (V1 Medium: the print depends on Prescription construct obs that the current plan forms no longer
//   save, TESTED below with test.fixme; V2-V4 Low).

const PRINT_URL = (encounterUuid: string) =>
  `/openmrs/htmlformentryui/htmlform/viewEncounterWithHtmlForm/getAsHtml.action?encounterId=${encounterUuid}&definitionUiResource=file:configuration/pih/htmlforms/section-prescriptions-print.xml`;

interface Rx {
  slot: number;
  drugSearch: string;
  dose: string;
  frequencyIndex: number;
  duration: string;
  instructions: string;
}
const RX1: Rx = { slot: 1, drugSearch: 'Acetylsalicylic', dose: '500', frequencyIndex: 2, duration: '5', instructions: 'After meals' };
const RX2: Rx = { slot: 2, drugSearch: 'Paracetamol', dose: '2', frequencyIndex: 3, duration: '7', instructions: 'Before sleep' };

// Saves prescriptions through the legacy medication plan form (Prescription construct obs); returns the drug names as saved.
const saveLegacy = async (page: Page, section: SectionEncounter, rxs: Rx[]): Promise<string[]> => {
  await page.goto(SectionFormPage.editUrl('section-plan-medication_v1.1.xml', section));
  await expect(page.locator('#buttons input.submitButton')).toBeVisible();
  const names: string[] = [];
  for (const rx of rxs) {
    if (!(await page.locator(`#medication-${rx.slot}`).isVisible())) {
      await page.locator('#show-more-medications-button').click(); // the form shows the next medication row on request
    }
    const m = page.locator(`#medication-${rx.slot}`);
    await m.locator('input.ui-autocomplete-input').fill(rx.drugSearch);
    const item = page.locator('ul.ui-autocomplete li:visible').first();
    await expect(item, `a drug matching ${rx.drugSearch}`).toBeVisible();
    names.push((await item.innerText()).trim());
    await item.click();
    await m.locator(`#dose${rx.slot} input`).fill(rx.dose);
    await m.locator(`#doseUnit${rx.slot} select`).selectOption({ label: 'Milligram (mg)' });
    await m.locator(`#frequencyCoded${rx.slot} select`).selectOption({ index: rx.frequencyIndex });
    await m.locator(`#duration${rx.slot} input`).fill(rx.duration);
    await m.locator(`#durationUnit${rx.slot} select`).selectOption({ label: 'Days' });
    await m.locator(`#instructions${rx.slot} input, #instructions${rx.slot} textarea`).first().fill(rx.instructions);
  }
  await page.locator('#buttons input.submitButton').click();
  await new SectionFormPage(page, 'section-plan-medication_v1.1.xml').expectSaved();
  return names;
};

// Saves one medication through the current drug-order widget (a drug order, no Prescription construct obs).
const saveCurrentOrder = async (page: Page, section: SectionEncounter) => {
  await page.goto(SectionFormPage.editUrl('section-plan-medication.xml', section));
  await expect(page.locator('#buttons input.submitButton')).toBeVisible();
  await page.locator('#order-action-button-NEW').click();
  const row = page.locator('#drug-orders .orderwidget-order-form:visible');
  await row.locator('.order-drug input.orderwidget-autocomplete-textbox').fill('Acetylsalicylic');
  await page.locator('.ui-autocomplete .ui-menu-item').first().click();
  await row.locator('.order-dose input').fill('1');
  await row.locator('.order-frequency select').selectOption({ index: 1 });
  await row.locator('.order-duration input').fill('5');
  await row.locator('.order-quantity input').fill('10');
  await page.locator('#buttons input.submitButton').click();
  await new SectionFormPage(page, 'section-plan-medication.xml').expectSaved();
};

// The print form as the visit page requests it, loaded into the page for locator assertions.
const renderPrint = async (page: Page, encounterUuid: string) => {
  const res = await page.request.get(PRINT_URL(encounterUuid), { headers: { Accept: 'application/json, text/plain, */*' } });
  expect(res.ok(), `print: ${res.status()}`).toBeTruthy();
  const html = ((await res.json()) as { html?: string }).html;
  expect(html, 'the print form rendered').toBeTruthy();
  await page.setContent(`<html><body>${html}</body></html>`);
};

// Replaces window.open by a recorder: what visit.js writes into the print pop-up, and whether it printed.
const recordPrint = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __print: { written: string; printed: boolean } };
    w.__print = { written: '', printed: false };
    window.open = () =>
      ({
        document: { write: (s: string) => (w.__print.written += s), close: () => undefined },
        focus: () => undefined,
        print: () => (w.__print.printed = true),
        close: () => undefined,
      }) as unknown as Window;
  });
const printed = (page: Page) => page.evaluate(() => (window as unknown as { __print: { written: string; printed: boolean } }).__print);

const printIcon = (plan: ReturnType<Page['locator']>) => plan.locator('.overall-actions a.delete-encounter:has(i.icon-print)');

test.describe('section-prescriptions-print', () => {
  test('prints one block per saved prescription (name, dose, unit, frequency, duration, instructions), no empty blocks, and the signature line', async ({
    page,
    createSectionEncounter,
  }) => {
    const section = await createSectionEncounter({
      encounterTypeUuid: OUTPATIENT_INITIAL_ENCOUNTER_TYPE_UUID,
      patient: { givenName: 'AutoRx', familyName: 'Tester', gender: 'M' },
    });
    const names = await saveLegacy(page, section, [RX1, RX2]);
    await renderPrint(page, section.encounter.uuid);

    await expect(page.locator('#prescriptionsDiv')).toBeVisible();
    await expect(page.locator('#drug-orders legend')).toHaveText('Medication orders');
    // showIfEmpty=false: the two saved groups give two blocks, not eight
    const blocks = page.locator('#drug-orders div[style*="page-break-inside"]');
    await expect(blocks).toHaveCount(2);
    await expect(blocks.locator('h3').first()).toContainText('Medication');
    // HFE binds the groups to the blocks in no fixed order: compare per medication, whichever block holds it
    const texts = (await blocks.allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
    for (const [rx, name] of [
      [RX1, names[0]],
      [RX2, names[1]],
    ] as Array<[Rx, string]>) {
      const block = texts.find((t) => t.includes(rx.instructions));
      expect(block, `a block with "${rx.instructions}"`).toBeTruthy();
      expect(block).toContain(name.split(',')[0]); // the drug name without its strength
      expect(block).toMatch(new RegExp(`Dose\\s+${rx.dose}\\s+Milligram \\(mg\\)`));
      expect(block).toMatch(new RegExp(`Duration\\s+${rx.duration}\\s+Days`));
    }
    expect(texts.join(' ')).toMatch(/Frequency\s+BID/); // RX1: option 2
    expect(texts.join(' ')).toMatch(/Frequency\s+TID/); // RX2: option 3
    await expect(page.locator('#prescriptionsDiv')).toContainText('Signature:');
  });

  for (const parent of [
    { name: 'outpatient initial', encounterTypeUuid: OUTPATIENT_INITIAL_ENCOUNTER_TYPE_UUID, sectionId: 'pihcore-plan', gender: 'M' as const },
    { name: 'MCH delivery', encounterTypeUuid: MCH_DELIVERY_ENCOUNTER_TYPE_UUID, sectionId: 'pihcore-plan-medication', gender: 'F' as const },
  ]) {
    test(`visit page, ${parent.name}: the printer icon of the ${parent.sectionId} section prints the prescriptions`, async ({ page, createSectionEncounter }) => {
      const section = await createSectionEncounter({
        encounterTypeUuid: parent.encounterTypeUuid,
        patient: { givenName: 'AutoRx', familyName: 'Tester', gender: parent.gender },
      });
      const names = await saveLegacy(page, section, [RX1]);

      const visit = await VisitPage.openOfEncounter(page, section.encounter.uuid);
      const plan = await visit.expandableSection(parent.sectionId);
      await expect(plan).toHaveCount(1);
      await visit.expand(plan);
      await recordPrint(page);
      await expect(printIcon(plan)).toBeVisible();
      await printIcon(plan).click();

      // the section now shows the print template, then visit.js writes #prescriptionsDiv into the pop-up and prints
      await expect(plan.locator('#prescriptionsDiv')).toBeVisible();
      await expect.poll(async () => (await printed(page)).printed).toBe(true);
      const { written } = await printed(page);
      expect(written).toContain('Print Prescriptions');
      expect(written).toContain(names[0].split(',')[0]);
      expect(written).toContain('After meals');
      expect(written).toContain('Signature:');
    });
  }

  test.describe('a medication entered with the current plan form (drug order, no Prescription construct obs)', () => {
    let section: SectionEncounter;

    test.beforeEach(async ({ page, createSectionEncounter }) => {
      section = await createSectionEncounter({
        encounterTypeUuid: MCH_DELIVERY_ENCOUNTER_TYPE_UUID,
        patient: { givenName: 'AutoRx', familyName: 'Tester', gender: 'F' },
      });
      await saveCurrentOrder(page, section);
    });

    // The two icon/block assertions pin the V1 bug: invert them (or delete this test and keep the fixme below) when V1 is fixed.
    test('V1 documented: the section lists the medication but has no printer icon, and the print template has no medication block', async ({
      page,
      api,
    }) => {
      const visit = await VisitPage.openOfEncounter(page, section.encounter.uuid);
      await visit.expand(visit.encounterOfType(MCH_DELIVERY_ENCOUNTER_TYPE_UUID)); // shows the sections' collapsed headings
      const plan = visit.section('pihcore-plan-medication');
      // the heading lists the drug order's concept
      const orders = await api.get(`order?patient=${section.patient.uuid}&v=custom:(concept:(display))`);
      const drug = ((await orders.json()).results as Array<{ concept: { display: string } }>).map((o) => o.concept.display);
      expect(drug).toHaveLength(1);
      await expect(plan.locator('.header:visible').first()).toContainText(drug[0]);
      await expect(printIcon(plan)).toHaveCount(1);
      await expect(printIcon(plan)).toBeHidden(); // ng-show: no Prescription construct obs

      await renderPrint(page, section.encounter.uuid);
      await expect(page.locator('#prescriptionsDiv')).toBeVisible();
      await expect(page.locator('#drug-orders div[style*="page-break-inside"]')).toHaveCount(0);
      await expect(page.locator('#prescriptionsDiv')).toContainText('Signature:');
    });

    // V1. Intended: an encounter whose medication was ordered with the current form can be printed. Remove test.fixme() when fixed.
    test.fixme('V1 the section has a printer icon and the print template lists the medication', async ({ page }) => {
      const visit = await VisitPage.openOfEncounter(page, section.encounter.uuid);
      const plan = await visit.expandableSection('pihcore-plan-medication');
      await visit.expand(plan);
      await expect(printIcon(plan)).toBeVisible({ timeout: 3000 });
      await renderPrint(page, section.encounter.uuid);
      await expect(page.locator('#prescriptionsDiv')).toContainText('Medication 1');
    });
  });
});
