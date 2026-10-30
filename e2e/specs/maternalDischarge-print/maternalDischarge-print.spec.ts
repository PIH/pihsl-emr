import type { Page } from '@playwright/test';
import { test, expect, birthdateYearsAgo, type EntryContext } from '../../core';
import { MCH_DELIVERY_ENCOUNTER_TYPE_UUID, MCH_OPD_LOCATION_UUID } from '../../core/constants';
import { getPatientEncounters } from '../../commands';
import { EntryFormPage, selectDefaultProvider } from '../../pages';

// maternalDischarge-print.xml: print-only rendering of a Maternal Discharge encounter ("Maternity Discharge Form"). It is NOT an entry form and
// cannot be entered: the visit page renders it in VIEW mode for a saved encounter (encounterTypeConfig.js printFormUrl ->
// /htmlformentryui/htmlform/viewEncounterWithHtmlForm/getAsHtml.action?encounterId=..&definitionUiResource=..maternalDischarge-print.xml, then the print
// dialog). The specs therefore (1) save a real discharge through maternalDischarge.xml (Home disposition: closes the visit, enrols the patient as
// Delivered; see that spec), (2) request the same getAsHtml.action URL with the browser session (it needs the Accept: application/json header the
// visit page's $http sends, else it throws "Don't know what to use as success url") and (3) load the returned HTML into the page and assert it.
// The print dialog itself, printing and the visit-page button are not covered. availability: documentation/_availability.e2e.md (an existing
// Maternal Discharge encounter).
//
// Conditions in the form, from documentation inventory (maternalDischarge-print.inv.md): none (no ifMode/includeIf/when, no scripts).
// Data read: patient details, encounter location/date, "Date of Admission" = latest earlier CIEL:1640 obs (:299, both states tested), diagnoses,
// CIEL:160221 clinical history, CIEL:165399 twice (:330, :337), disposition and its comment, next appointment, provider/date signature.
// Side effects: none (read only). The inventory's [macro-undefined?] lead ($ui in the :299 lookup) is the UI utilities object, available in the view
// session: the admission date renders (tested).
// Not covered here: drug orders (never saved), appointment, provider name (staff name: not asserted), print dialog.
//
// Findings:
//   V1 Low :334-337  the comment "only one stored value exists for these two fields" is stale: maternalDischarge.xml stores two CIEL:165399 obs
//        (see maternalDischarge V1) and the print shows both (tested), but HFE matches them to the two blocks in no fixed order: on some encounters
//        the investigation and management texts come out swapped (maternalDischarge VW2; the test compares them sorted). Fix: with distinct concepts, update.
//   V2 Low :343     the disposition widget in VIEW also prints the empty "Sites" (transfer destination) and "Death Date" fields for a Home discharge
//        ("Disposition Home Sites ____ Death Date ____"), which a paper form would not carry. Fix: hide them with CSS in the print form.

const FORM = 'maternalDischarge.xml';
const DISCHARGE_ENCOUNTER_TYPE = '2110a810-db62-4914-ba95-604b96010164';
const PRINT_RESOURCE = 'file:configuration/pih/htmlforms/maternalDischarge-print.xml';
const DATE = /\d{2} [A-Z][a-z]{2} \d{4}/;

// Saves a Home discharge (no appointment) through the entry form and returns the new encounter's uuid.
const saveDischarge = async (page: Page, context: EntryContext, api: Parameters<typeof getPatientEncounters>[0]): Promise<string> => {
  await EntryFormPage.open(page, FORM, context);
  await expect(page.locator('#buttons input.submitButton')).toBeVisible();
  await selectDefaultProvider(page);
  await page.locator('#encounterLocation select').selectOption({ index: 1 });
  await page.locator('#encounter-disposition select').selectOption({ label: 'Home' });
  await page.locator('#disposition-section input[type=radio][value=no]').check();
  await page.locator('#diagnosis-search').fill('malaria');
  await page.locator('.ui-autocomplete li').first().click();
  await expect(page.locator('#encounter-diagnoses-target > *')).toHaveCount(1);
  await page.locator('#history textarea').fill('Normal delivery');
  await page.locator('#test-summary textarea').fill('Hb 11');
  await page.locator('#hospital-mgmt textarea').fill('Oxytocin given');
  await page.locator('#disposition-section textarea').first().fill('Review at 6 weeks');
  await page.locator('#buttons input.submitButton').click();
  await expect(page).toHaveURL(/referenceapplication\/home\.page/);
  const discharge = (await getPatientEncounters(api, context.patient.uuid)).filter((e) => e.encounterType.uuid === DISCHARGE_ENCOUNTER_TYPE);
  expect(discharge).toHaveLength(1);
  return discharge[0].uuid;
};

// Renders the print form for the encounter the way the visit page does and loads the HTML into the page.
const renderPrint = async (page: Page, encounterUuid: string) => {
  const url = `/openmrs/htmlformentryui/htmlform/viewEncounterWithHtmlForm/getAsHtml.action?encounterId=${encounterUuid}&definitionUiResource=${PRINT_RESOURCE}`;
  const res = await page.request.get(url, { headers: { Accept: 'application/json, text/plain, */*' } });
  expect(res.ok(), `print: ${res.status()}`).toBeTruthy();
  const body = (await res.json()) as { html?: string };
  expect(body.html, 'the print form rendered').toBeTruthy();
  await page.setContent(`<html><body>${body.html}</body></html>`);
  await expect(page.locator('#maternity-discharge-print')).toBeVisible();
};

const field = (page: Page, label: string) =>
  page.locator('#maternity-discharge-print .field', { has: page.locator('label', { hasText: new RegExp(`^${label}$`) }) }).locator('.value');
const block = (page: Page, label: string) => page.locator('#maternity-discharge-print .block', { has: page.locator('label', { hasText: label }) });

test.describe('maternalDischarge-print', () => {
  let ctx: EntryContext;

  test.beforeEach(async ({ createEntryContext }) => {
    ctx = await createEntryContext({ givenName: 'AutoPrint', familyName: 'Tester', gender: 'F', birthdate: birthdateYearsAgo(25) });
  });

  test('prints the patient details, diagnosis, summaries, disposition and recommendation of the saved discharge', async ({ page, api }) => {
    await renderPrint(page, await saveDischarge(page, ctx, api));

    await expect(page.locator('#maternity-discharge-print .form-title')).toHaveText('Maternity Discharge Form');
    await expect(field(page, 'Name:')).toContainText('AutoPrint');
    await expect(field(page, 'Name:')).toContainText('Tester');
    await expect(field(page, 'Age:')).toHaveText('25');
    await expect(field(page, 'EMR ID:')).not.toBeEmpty();
    await expect(field(page, 'Discharge Ward:')).not.toBeEmpty();
    await expect(field(page, 'Date of Discharge:')).toHaveText(DATE);
    await expect(field(page, 'Date of Admission:')).toBeEmpty(); // no earlier CIEL:1640 obs

    await expect(block(page, 'Diagnoses:')).toContainText('Malaria');
    await expect(block(page, 'Clinical History:').locator('.obs-value')).toHaveText('Normal delivery');
    // V1: the two summaries are obs of one concept, which HFE binds to the two blocks in no fixed order (the print shows them swapped on some
    // encounters), so only check that both texts are printed, one in each block
    const summaries = [
      ...(await block(page, 'Summary of investigation:').locator('.obs-value').allInnerTexts()),
      ...(await block(page, 'Summary of management in the hospital:').locator('.obs-value').allInnerTexts()),
    ].map((t) => t.trim());
    expect(summaries.sort()).toEqual(['Hb 11', 'Oxytocin given']);
    await expect(block(page, 'Discharge recommendations:').locator('.obs-value')).toHaveText('Review at 6 weeks');
    await expect(page.locator('#disposition')).toContainText('Home');
    await expect(page.locator('.signature .field')).toHaveCount(2);
  });

  test('"Date of Admission" shows the latest earlier CIEL:1640 obs', async ({ page, api }) => {
    const prior = await api.post('encounter', {
      data: {
        patient: ctx.patient.uuid,
        encounterType: MCH_DELIVERY_ENCOUNTER_TYPE_UUID,
        location: MCH_OPD_LOCATION_UUID,
        encounterDatetime: new Date().toISOString(),
        visit: ctx.visitUuid,
        obs: [{ concept: 'CIEL:1640', value: new Date(Date.now() - 26 * 3600 * 1000).toISOString() }],
      },
    });
    expect(prior.ok(), `admission date: ${prior.status()}`).toBeTruthy();

    await renderPrint(page, await saveDischarge(page, ctx, api));
    await expect(field(page, 'Date of Admission:')).toHaveText(DATE);
  });
});
