import type { APIRequestContext, Page } from '@playwright/test';
import { type EntryContext, test, expect } from '../../core';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import { EntryFormPage, expectViewShowsSavedObs } from '../../pages';

// nicuTriage.xml: NICU triage for an infant (vitals, labs, reasons for presentation, delivery history, emergency and
// priority signs, resuscitation, birth injury, disposition). A top-level form: the specs open
// enterHtmlFormWithStandardUi inside a visit they create for an infant born 3 days ago, so availability
// (documentation/_availability.e2e.md: mcoeForms + infantProgram, "MCH Triage Location" session tag, enterMCH, age < 42
// days, no duplicate check) is not exercised. The session location (MCH OPD) is not tagged for this form, so the
// location select starts empty and every save test picks one (the first option).
//
// Conditions in the form, from documentation inventory (nicuTriage.inv.md):
//   ifMode VIEW include=false  :34, :42, :83, :397  style, script, heading and #buttons exist in ENTER/EDIT only
//   when #congenital-q = Congenital malformation        :217  show #malformation-details
//   when #d-location = other                            :246  show #delivery-location-other
//   when #tox-t = Toxicity                              :309  show #tox
//   when #resuscitation = Yes                           :330  show #type-resuscitation
//   when #birthInjury = Yes                             :363  show #birthInjury-details
// Sub-forms (documentation/_shared.e2e.md): encounter-provider-location-date, vital-signs-infant-widget (+ .js scoring).
//
// Scripts: :44-69 (ENTER/EDIT) holds a before-validation rule: when the delivery location radio is "other" (concept id
// looked up with <lookup>) and the "specify" text is empty, the save is blocked and the page scrolls to the field;
// clicking a location radio while "other" is chosen writes "Required" into the specify field's .field-error.
// Side effects on save: ApplyDispositionAction and CleanDiagnosisConstructAction (:7-8); no program enrollment, no order.
// VIEW is covered by the last test (a filled form saved, then rendered with viewEncounterWithHtmlForm): every saved value is shown
// ("[X] other" for the delivery location, which the form labels with answerCodes), the other options are empty, the conditional details
// (malformation, toxicity, birth injury) are shown with their values, and the ENTER-only content (:34, :42, :83, :397) is absent. The "when"
// show/hide controls are JavaScript and cannot be checked in the loaded HTML.
// Not covered here: vitals scoring and the Save block (shared, _shared.e2e.md), the disposition (Admit and the other
// actions have side effects), EDIT mode.
//
// Findings:
//   V1 Low  :56-62  the "required" text written on clicking "other" is never cleared: it stays after the specify text is
//                   typed (the save then works). Fix: hide .field-error on input in #delivery-location-other.

const FORM = 'nicuTriage.xml';

// Birthdate (yyyy-mm-dd) of an infant who is `days` days old today (the harness helper only does whole years).
const birthdateDaysAgo = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
};

// The tagged location list does not contain the session location, so the select starts on "Choose a Location...".
const chooseLocation = async (page: Page) => {
  await page.locator('#encounterLocation select').selectOption({ index: 1 });
};

// The form uses the HFE <submit> tag: there is no #submit.
// "<concept>=<value>" for each obs of the encounter (coded values by their name).
const obsSummary = async (api: APIRequestContext, encounterUuid: string): Promise<string[]> =>
  (await getEncounterObs(api, encounterUuid)).map((o) => {
    const v = o.value as { display?: string } | string | number;
    return `${o.concept.display}=${typeof v === 'object' && v !== null ? v.display : v}`;
  });

const save = async (page: Page) => {
  await page.locator('#buttons input.submitButton').click();
};

test.describe('nicuTriage', () => {
  let context: EntryContext;

  test.beforeEach(async ({ page, createEntryContext }) => {
    context = await createEntryContext({
      givenName: 'AutoNicu',
      familyName: 'Tester',
      gender: 'F',
      birthdate: birthdateDaysAgo(3),
    });
    await EntryFormPage.open(page, FORM, context);
    await expect(page.locator('#buttons input.submitButton')).toBeVisible();
  });

  // Each row: the answer control, the answer that shows the target, the target, and an answer that hides it again.
  const whens: Array<{ line: string; name: string; show: (p: Page) => Promise<void>; hide?: (p: Page) => Promise<void>; target: string }> = [
    {
      line: ':217',
      name: 'Congenital malformation shows the malformation details',
      target: '#malformation-details',
      show: async (p) => {
        await p.locator('#congenital-q input[type=checkbox]').check();
      },
      hide: async (p) => {
        await p.locator('#congenital-q input[type=checkbox]').uncheck();
      },
    },
    {
      line: ':246',
      name: 'delivery location "other" shows the specify field',
      target: '#delivery-location-other',
      show: async (p) => {
        await p.locator('#d-location').getByLabel('other', { exact: true }).check();
      },
      hide: async (p) => {
        await p.locator('#d-location').getByLabel('home', { exact: true }).check();
      },
    },
    {
      line: ':309',
      name: 'Toxicity shows the toxicity details',
      target: '#tox',
      show: async (p) => {
        await p.locator('#tox-t input[type=checkbox]').check();
      },
      hide: async (p) => {
        await p.locator('#tox-t input[type=checkbox]').uncheck();
      },
    },
    {
      line: ':330',
      name: 'resuscitation Yes shows the methods',
      target: '#type-resuscitation',
      show: async (p) => {
        await p.locator('#resuscitation').getByLabel('Yes').check();
      },
      hide: async (p) => {
        await p.locator('#resuscitation').getByLabel('No').check();
      },
    },
    {
      line: ':363',
      name: 'birth injury Yes shows the details',
      target: '#birthInjury-details',
      show: async (p) => {
        await p.locator('#birthInjury').getByLabel('Yes').check();
      },
      hide: async (p) => {
        await p.locator('#birthInjury').getByLabel('No').check();
      },
    },
  ];

  for (const w of whens) {
    test(`when ${w.line}: ${w.name}`, async ({ page }) => {
      await expect(page.locator(w.target)).toBeHidden();
      await w.show(page);
      await expect(page.locator(w.target)).toBeVisible();
      await w.hide?.(page);
      await expect(page.locator(w.target)).toBeHidden();
    });
  }

  test('saving without the delivery location is refused with "Required"', async ({ page, api }) => {
    // required="true" on #d-location (:246)
    await chooseLocation(page);
    await save(page);
    await expect(page.locator('.field-error:visible').first()).toHaveText('Required');
    await expect(page).not.toHaveURL(/referenceapplication\/home\.page/);
    expect(await getPatientEncounters(api, context.patient.uuid)).toHaveLength(0);
  });

  test('"other" delivery location needs the specify text: Required on click, save blocked until it is filled', async ({
    page,
    api,
  }) => {
    // script :44-69
    await chooseLocation(page);
    await page.locator('#d-location').getByLabel('other', { exact: true }).check();
    const required = page.locator('#delivery-location-other .field-error');
    await expect(required).toHaveText(/required/i); // written by the click handler
    await save(page);
    await expect(page).not.toHaveURL(/referenceapplication\/home\.page/);
    expect(await getPatientEncounters(api, context.patient.uuid)).toHaveLength(0);

    await page.locator('#delivery-location-other input[type=text]').fill('Roadside');
    // (V1, Low, not asserted): the "required" text stays although the field is filled.
    await save(page);
    await new EntryFormPage(page, FORM).expectSaved();
    const [encounter] = await getPatientEncounters(api, context.patient.uuid);
    expect(await obsSummary(api, encounter.uuid)).toEqual(expect.arrayContaining(['Location of birth=Other', 'Delivery location (text)=Roadside']));
  });

  test('saves the reasons for presentation, delivery location and priority signs', async ({ page, api }) => {
    await chooseLocation(page);
    await page.locator('input[type=checkbox]').and(page.getByLabel('Jaundice', { exact: true })).check();
    await page.locator('#d-location').getByLabel('KGH/MCOE', { exact: true }).check();
    await page.locator('#avpu').getByLabel('Awake').check();
    await page.locator('#hemoglobin input').fill('14');
    await page.getByLabel('Low birth weight', { exact: true }).check();
    await save(page);
    await new EntryFormPage(page, FORM).expectSaved();

    const encounters = await getPatientEncounters(api, context.patient.uuid);
    expect(encounters).toHaveLength(1);
    expect(await obsSummary(api, encounters[0].uuid)).toEqual(
      expect.arrayContaining([
        'Reason for visit=Jaundice',
        'Location of birth=Koidu Government Hospital',
        'Level of consciousness=Awake',
        'Hemoglobin=14',
        'Danger signs, baby=Low birth weight',
      ]),
    );
  });

  const fillTriage = async (page: Page) => {
    await chooseLocation(page);
    await page.locator('#heart_rate input').fill('150');
    await page.locator('#respiratory_rate input').fill('55');
    await page.locator('#temperature_c input').fill('37.2');
    await page.locator('#o2_sat input').fill('96');
    await page.locator('#avpu').getByLabel('Awake').check();
    await page.locator('#hemoglobin input').fill('14');
    await page.locator('#hematocrit input').fill('42');
    await page.locator('input[type=checkbox]').and(page.getByLabel('Jaundice', { exact: true })).check(); // reason for presentation
    await page.locator('#congenital-q input[type=checkbox]').check();
    await page.locator('#malformation-details input[type=text]').fill('Cleft palate');
    await page.locator('#d-location').getByLabel('other', { exact: true }).check();
    await page.locator('#delivery-location-other input[type=text]').fill('Roadside');
    await page.locator('.two-columns').filter({ hasText: 'Emergency signs' }).last().locator('input[type=checkbox]').first().check(); // Hypoglycemia
    await page.getByLabel('Low birth weight', { exact: true }).check(); // priority sign
    await page.locator('#tox-t input[type=checkbox]').check();
    await page.locator('#tox input[type=text]').fill('Lead');
    await page.locator('#resuscitation').getByLabel('Yes').check();
    await page.locator('#type-resuscitation input[type=checkbox]').nth(1).check();
    await page.locator('#birthInjury').getByLabel('Yes').check();
    await page.locator('#birthInjury-details textarea').fill('Bruise on the left shoulder');
    await page.locator('#destination textarea').fill('Referred to the ward');
  };

  // VIEW (viewEncounterWithHtmlForm): saved values are span.value, unselected options span.emptyValue ("[X] other" / "[  ] home").
  test('VIEW: shows the saved vitals, presentation, delivery location, signs and resuscitation, and not what was left empty', async ({ page, api }) => {
    await fillTriage(page);
    await save(page);
    await new EntryFormPage(page, FORM).expectSaved();
    const [encounter] = await getPatientEncounters(api, context.patient.uuid);

    const view = await expectViewShowsSavedObs(page, api, FORM, encounter.uuid);
    const shown = await view.valueTexts();
    for (const expected of [
      '150',
      '37.2',
      '[X] Awake',
      '14',
      '[X] Jaundice',
      '[X] Congenital malformation',
      'Cleft palate',
      '[X] other', // delivery location, labelled by answerCodes ("Other" is the concept name)
      'Roadside',
      '[X] Hypoglycemia',
      '[X] Low birth weight',
      '[X] Toxicity',
      'Lead',
      '[X] Yes', // resuscitation
      '[X] Bag valve mask ventilation',
      'Bruise on the left shoulder',
      'Referred to the ward',
    ]) {
      expect(shown, expected).toContain(expected);
    }
    // the delivery location is one selected radio, and the other answers (labelled by answerCodes) are empty options
    await expect(page.locator('#d-location .value')).toHaveText(['[X] other']);
    await expect(page.locator('#d-location .emptyValue')).toHaveText([/home/, /in-transit/, /health clinic/, /KGH\/MCOE/]);
    await expect(page.locator('#delivery-location-other .value')).toHaveText('Roadside');
    await expect(page.locator('#malformation-details .value')).toHaveText('Cleft palate');
    await expect(page.locator('#tox .value')).toHaveText('Lead');
    await expect(page.locator('#birthInjury .value')).toHaveText('[X] Yes');
    await expect(page.locator('#birthInjury .emptyValue')).toHaveText(/\[\s+\]\s*No/);
    // what was not filled is shown as empty options or blanks, never as a value: the other levels of consciousness, the malaria
    // test, the other reasons for presentation, and the priority signs other than Low birth weight and Toxicity
    await expect(page.locator('#avpu .value')).toHaveCount(1);
    await expect(page.locator('#avpu .emptyValue')).toHaveCount(3);
    await expect(page.locator('#labTests .value')).toHaveText(['[X] Awake', '14', '42']);
    await expect(page.locator('#assessment .value')).toHaveCount(13); // exactly what was ticked or typed in the Assessment section
    // ENTER-only content is absent: the heading, the buttons and every field
    await expect(page.locator('h2, #buttons, input, select, textarea, button')).toHaveCount(0);
  });
});
