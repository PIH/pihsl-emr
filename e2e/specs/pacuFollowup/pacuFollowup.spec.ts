import type { APIRequestContext, Page } from '@playwright/test';
import { type EntryContext, test, expect, birthdateYearsAgo } from '../../core';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import { EntryFormPage } from '../../pages';

// pacuFollowup.xml: "PACU Followup" (post-anaesthesia care unit): service team, diagnoses and procedures, type of anaesthesia, basic
// vitals, Aldrete discharge score (5 criteria, 0-2 each), PACU events (pain, nausea, vomiting, shivering, ...), blood/fluids, disposition.
// A top-level form: the specs open enterHtmlFormWithStandardUi inside a visit they create for a 25-year-old female
// (documentation/_availability.e2e.md: enableMCOEForms + pregnancy, "PACU Location" session tag, enterMCH, female >= 10), so the
// app-loader gating is not exercised. The session location (MCH OPD) lacks the tag: the location select (required) starts empty and
// every save picks the first option. The form ends with <submit> (no #submit: use #buttons input.submitButton).
//
// Conditions in the form, from documentation inventory (pacuFollowup.inv.md):
//   ifMode VIEW include=false :136,:145,:405   heading, hidden print date-stamps, buttons: ENTER/EDIT only
//   ifMode VIEW include=true + includeIf $fn.getObs($encounter, CIEL:170339/170343/170347/162643/170351) :90-124   inside the script: VIEW only,
//        fills the per-criterion scores and the total from the saved obs (cannot be opened: an encounter created over REST has no form)
// Sub-forms (documentation/_shared.e2e.md): pregnancy-group-widget (read-only here, $pregGroupViewOnly), vital-signs-basic-widget
// (+ vital-signs-widget.js scoring, #contactDr), encounterDisposition (internal / external transfer location, date of death).
//
// Scripts (:49-141): scoreMap = coded answer id -> points (2 / 1 / 0 for each criterion's three answers, in the order they are listed).
//   calculateAldreteScore() (ENTER/EDIT, on load and on each .scoreObs radio click): sums the points of the checked radios, writes each
//   criterion's points into the span next to it (#oxygenation_170339, #respiration_170343, #circulation_170347,
//   #levelOfConsciousness_162643, #activity_170351) and the sum into #totalScore. Unanswered criteria count 0, nothing is required.
// Side effects on save: ApplyDispositionAction (:19) acts on the disposition (Transfer within hospital, Death, ...): the save tests leave the
//   disposition empty, so no action runs. No program, no order.
// Not covered here: VIEW/EDIT, the Aldrete totals in VIEW, vitals colours (shared), a saved disposition (side effects), the diagnosis search.
//
// Findings:
//   V1 Info :226  the diagnosis search is captioned "Add presumed or confirmed diagnosis (required)" but encounterDiagnosesByObs has no
//                 required check: the encounter saves without any diagnosis (tested below).

const FORM = 'pacuFollowup.xml';
const SAVE = '#buttons input.submitButton';

const openForm = async (page: Page, context: EntryContext) => {
  await EntryFormPage.open(page, FORM, context);
  await expect(page.locator(SAVE)).toBeVisible(); // handlers are bound on document.ready
};

const chooseLocation = async (page: Page) => {
  await page.locator('#encounterLocation select').selectOption({ index: 1 });
};

// The five Aldrete criteria, in form order: the score cell of each and the points of its three answers (first, second, third radio).
const CRITERIA = [
  { name: 'oxygenation', cell: '#oxygenation_170339' },
  { name: 'respiration', cell: '#respiration_170343' },
  { name: 'circulation', cell: '#circulation_170347' },
  { name: 'consciousness', cell: '#levelOfConsciousness_162643' },
  { name: 'activity', cell: '#activity_170351' },
];
const POINTS = [2, 1, 0];

const aldrete = (page: Page, criterion: number, answer: number) => page.locator('.scoreObs').nth(criterion).getByRole('radio').nth(answer);

// "<concept>=<value>" for each obs of the encounter (coded values by their name).
const obsSummary = async (api: APIRequestContext, encounterUuid: string): Promise<string[]> =>
  (await getEncounterObs(api, encounterUuid)).map((o) => {
    const v = o.value as { display?: string } | string | number;
    return `${o.concept.display}=${typeof v === 'object' && v !== null ? v.display : v}`;
  });

test.describe('pacuFollowup', () => {
  let context: EntryContext;

  test.beforeEach(async ({ page, createEntryContext }) => {
    context = await createEntryContext({
      givenName: 'AutoPacu',
      familyName: 'Tester',
      gender: 'F',
      birthdate: birthdateYearsAgo(25),
    });
    await openForm(page, context);
  });

  test('script :67: every Aldrete criterion scores 2 / 1 / 0 and the total follows', async ({ page }) => {
    await expect(page.locator('#totalScore')).toHaveText('0');
    let total = 0;
    for (let c = 0; c < CRITERIA.length; c++) {
      for (let a = 0; a < POINTS.length; a++) {
        await aldrete(page, c, a).check();
        await expect(page.locator(CRITERIA[c].cell), `${CRITERIA[c].name} answer ${a + 1}`).toHaveText(String(POINTS[a]));
      }
      await aldrete(page, c, 0).check(); // leave each criterion at its best answer: 2 points
      total += 2;
      await expect(page.locator('#totalScore')).toHaveText(String(total));
    }
    expect(total).toBe(10);
  });

  test('script :67: changing an answer replaces its points instead of adding them', async ({ page }) => {
    await aldrete(page, 0, 0).check(); // 2
    await aldrete(page, 1, 1).check(); // 1
    await expect(page.locator('#totalScore')).toHaveText('3');
    await aldrete(page, 0, 2).check(); // 0
    await expect(page.locator('#oxygenation_170339')).toHaveText('0');
    await expect(page.locator('#totalScore')).toHaveText('1');
  });

  test('the disposition shows the matching extra field (internal, external transfer, death)', async ({ page }) => {
    // shared encounterDisposition widget; ApplyDispositionAction (:19) would act on a saved one, so nothing is saved here
    const disposition = page.locator('#encounter-disposition select');
    const targets = ['#transferInternalLocation', '#transferExternalLocation', '#dateOfDeath'];
    for (const t of targets) {
      await expect(page.locator(t)).toBeHidden();
    }
    const cases: Array<[string, string]> = [
      ['Transfer within hospital', '#transferInternalLocation'],
      ['Transfer out of hospital', '#transferExternalLocation'],
      ['Death', '#dateOfDeath'],
    ];
    for (const [label, shown] of cases) {
      await disposition.selectOption({ label });
      for (const t of targets) {
        await (t === shown ? expect(page.locator(t)).toBeVisible() : expect(page.locator(t)).toBeHidden());
      }
    }
    await disposition.selectOption({ label: 'Discharge' });
    for (const t of targets) {
      await expect(page.locator(t)).toBeHidden();
    }
  });

  test('saving without a location is refused with "required"', async ({ page, api }) => {
    // required location (encounterLocation, :178; the tagged list does not contain the session location)
    await page.locator(SAVE).click();
    await expect(page.locator('#encounterLocation .field-error')).toHaveText(/required/i);
    await expect(page).not.toHaveURL(/referenceapplication\/home\.page/);
    expect(await getPatientEncounters(api, context.patient.uuid)).toHaveLength(0);
  });

  test('saves with only the location: no diagnosis is needed (V1)', async ({ page, api }) => {
    await chooseLocation(page);
    await page.locator(SAVE).click();
    await new EntryFormPage(page, FORM).expectSaved();
    expect(await getPatientEncounters(api, context.patient.uuid)).toHaveLength(1);
  });

  test('saves the anaesthesia, vitals, Aldrete answers, PACU events and fluids', async ({ page, api }) => {
    await chooseLocation(page);
    await page.getByLabel('General anesthesia', { exact: true }).check();
    await page.locator('#bp_systolic input').fill('110');
    await page.locator('#bp_diastolic input').fill('70');
    await aldrete(page, 0, 0).check(); // room air > 92%
    await aldrete(page, 4, 1).check(); // moves two limbs
    await page.locator('p.list-inline', { hasText: 'Pain score' }).getByLabel('Mild').check();
    await page.locator('p.list-inline', { hasText: 'Nausea score' }).getByLabel('None').check();
    await page.locator('p.list-inline', { hasText: 'Vomiting' }).getByLabel('No', { exact: true }).check();
    await page.locator('p.list-inline', { hasText: 'Ambulation started' }).getByLabel('Yes', { exact: true }).check();
    await page.locator('.small-input input').fill('15'); // Glasgow coma scale
    await page.locator('#fluid input[type=text]').last().fill('300'); // urine output
    await expect(page.locator('#totalScore')).toHaveText('3');
    await page.locator(SAVE).click();
    await new EntryFormPage(page, FORM).expectSaved();

    const encounters = await getPatientEncounters(api, context.patient.uuid);
    expect(encounters).toHaveLength(1);
    const obs = await obsSummary(api, encounters[0].uuid);
    expect(obs).toEqual(
      expect.arrayContaining([
        'Type of anesthesia=General anesthesia',
        'Systolic=110',
        'Diastolic=70',
        expect.stringMatching(/^Urine output.*=300$/),
        expect.stringMatching(/=15$/), // GCS
      ]),
    );
    // 2 Aldrete answers + pain + nausea + vomiting + ambulation are saved as coded obs
    expect(obs.length).toBeGreaterThanOrEqual(11);
  });
});
