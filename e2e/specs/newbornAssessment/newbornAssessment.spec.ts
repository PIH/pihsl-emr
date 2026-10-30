import type { APIRequestContext, Page } from '@playwright/test';
import { type EntryContext, test, expect } from '../../core';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import { EntryFormPage, expectViewShowsSavedObs, selectDefaultProvider, VISIT_PAGE_URL } from '../../pages';

// newbornAssessment.xml: assessment of a newborn at birth (pregnancy complications, delivery, outcome, birth weight,
// APGAR, vitals, resuscitation, diagnoses at birth, birth injury, overall condition, disposition). A top-level form: the
// specs open enterHtmlFormWithStandardUi inside a visit they create for an infant born 3 days ago, so availability
// (documentation/_availability.e2e.md: mcoeForms + infantProgram, "Newborn Assessment Location" session tag, enterMCH,
// age < 42 days, one per visit) is not exercised. The session location (MCH OPD) is not tagged for this form, so the
// location select starts empty and the save tests pick one (the first option).
//
// Conditions in the form, from documentation inventory (newbornAssessment.inv.md):
//   ifMode VIEW include=false  :44, :115, :224, :463  heading, helper texts, APGAR table and #buttons in ENTER/EDIT only
//   when #dead-or-alive = Alive                        :148  show #alive-details (birth weight/length, head, APGAR, breastfeeding)
//   when #multipleBabies = Twins or multiple           :302  show #baby-number
//   when #resuscitation = Yes                          :339  show #type-resuscitation
//   when #malformation-q = Congenital malformation     :401  show #malformation-details
//   when #birthInjury = Yes                            :423  show #birthInjury-details
// Sub-forms (documentation/_shared.e2e.md): encounter-provider-location-date, vital-signs-infant-widget (+ .js scoring).
//
// Scripts: none of its own.
// Side effects on save: enrollInProgram Infant (:65, tested), CleanDiagnosisConstructAction and ApplyDispositionAction
// (:7-8). No order, no appointment.
// VIEW is covered by the last test (a fully filled form saved, then rendered with viewEncounterWithHtmlForm): every saved value is
// shown, the answers labelled by answerCodes show their label ("[X] M", "[X] Alive", "[X] Twins or multiple"), the delivery date and time are
// two values, unticked diagnoses (obsgroup showIfEmpty=false) are not listed, and the ENTER-only content (:44, :115, :224, :463) is absent.
// The hidden "Diagnosis order" marker of the diagnosis groups and the "when" show/hide controls (JavaScript) cannot be checked in the
// loaded HTML; a ticked "Confirmed doctor contacted" (shared vitals widget) is in a #confirmMsg that only the vitals script shows.
// Not covered here: vitals scoring and the Save block (shared, _shared.e2e.md), the disposition (Admit and the other
// actions have side effects), EDIT mode.
//
// Findings: none (the duplicate id="when" at :100 is _shared V10).

const FORM = 'newbornAssessment.xml';

// Birthdate (yyyy-mm-dd) of an infant who is `days` days old today (the harness helper only does whole years).
const birthdateDaysAgo = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
};

// The tagged location list does not contain the session location, so the select starts on "Choose a Location...".
// The provider select is blank too when the logged-in user has no Provider account.
const pickProviderAndLocation = async (page: Page) => {
  await selectDefaultProvider(page);
  await page.locator('#encounterLocation select').selectOption({ index: 1 });
};

// The form uses the HFE <submit> tag: there is no #submit.
const save = async (page: Page) => {
  await page.locator('#buttons input.submitButton').click();
};

// "<concept>=<value>" for each obs of the encounter (coded values by their name).
const obsSummary = async (api: APIRequestContext, encounterUuid: string): Promise<string[]> =>
  (await getEncounterObs(api, encounterUuid)).map((o) => {
    const v = o.value as { display?: string } | string | number;
    return `${o.concept.display}=${typeof v === 'object' && v !== null ? v.display : v}`;
  });

test.describe('newbornAssessment', () => {
  let context: EntryContext;

  test.beforeEach(async ({ page, createEntryContext }) => {
    context = await createEntryContext({
      givenName: 'AutoNewbornA',
      familyName: 'Tester',
      gender: 'M',
      birthdate: birthdateDaysAgo(3),
    });
    await EntryFormPage.open(page, FORM, context);
    await expect(page.locator('#buttons input.submitButton')).toBeVisible();
  });

  // Each row: the answer that shows the target, the target, and an answer (or unticking) that hides it again.
  const whens: Array<{ line: string; name: string; show: (p: Page) => Promise<void>; hide: (p: Page) => Promise<void>; target: string }> = [
    {
      line: ':148',
      name: 'outcome Alive shows the birth measurements and APGAR',
      target: '#alive-details',
      show: async (p) => {
        await p.locator('#dead-or-alive').getByLabel('Alive').check();
      },
      hide: async (p) => {
        await p.locator('#dead-or-alive').getByLabel('FSB').check();
      },
    },
    {
      line: ':302',
      name: 'Twins or multiple shows the baby number',
      target: '#baby-number',
      show: async (p) => {
        await p.locator('#multipleBabies input[type=checkbox]').check();
      },
      hide: async (p) => {
        await p.locator('#multipleBabies input[type=checkbox]').uncheck();
      },
    },
    {
      line: ':339',
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
      line: ':401',
      name: 'Congenital malformation shows the malformation details',
      target: '#malformation-details',
      show: async (p) => {
        await p.locator('#malformation-q input[type=checkbox]').check();
      },
      hide: async (p) => {
        await p.locator('#malformation-q input[type=checkbox]').uncheck();
      },
    },
    {
      line: ':423',
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
      await w.hide(page);
      await expect(page.locator(w.target)).toBeHidden();
    });
  }

  test('saving without choosing a location is refused', async ({ page, api }) => {
    // the tagged location select has no default for this session (location required, encounter-provider-location-date)
    await save(page);
    await expect(page.locator('.field-error:visible').first()).toBeVisible();
    await expect(page).not.toHaveURL(VISIT_PAGE_URL);
    expect(await getPatientEncounters(api, context.patient.uuid)).toHaveLength(0);
  });

  test('saves the delivery, outcome, measurements and diagnoses, and enrolls the infant in the Infant program', async ({
    page,
    api,
  }) => {
    const enrollmentsUrl = `programenrollment?patient=${context.patient.uuid}&v=custom:(program:(name),location:(name),dateCompleted)`;
    expect(((await (await api.get(enrollmentsUrl)).json()).results as unknown[]).length).toBe(0);

    await pickProviderAndLocation(page);
    await page.locator('p', { hasText: 'Gestation age' }).locator('input[type=text]').first().fill('37.4');
    await page.getByLabel('Spontaneous vaginal delivery').check();
    await page.locator('#dead-or-alive').getByLabel('Alive').check();
    await page.getByLabel('M', { exact: true }).check();
    // :148 targets: birth weight, birth length, head circumference, APGAR 1 / 5 / 10 minutes
    const alive = page.locator('#alive-details input[type=text]');
    await alive.nth(0).fill('2.9');
    await alive.nth(3).fill('8');
    await alive.nth(4).fill('9');
    await page.getByLabel('Premature birth', { exact: true }).check();
    await page.locator('#resuscitation').getByLabel('Yes').check();
    await page.getByLabel('Supplemental oxygen therapy').check();
    await page.locator('#outcome-condition').getByLabel('Satisfactory').check();
    await save(page);
    await new EntryFormPage(page, FORM).expectSaved();

    const encounters = await getPatientEncounters(api, context.patient.uuid);
    expect(encounters).toHaveLength(1);
    expect(await obsSummary(api, encounters[0].uuid)).toEqual(
      expect.arrayContaining([
        'Gestational age at delivery, abortion or miscarriage (weeks)=37.4',
        'Type of delivery=Spontaneous vaginal delivery',
        'Qualitative birth outcome=Livebirth',
        'Child gender=Male',
        'Birth weight (kg)=2.9',
        'APGAR score at 1 minute=8',
        'APGAR score at 5 minutes=9',
        'Diagnosis=Premature birth',
        'Neonatal resuscitation=Yes',
        'Supportive care=Supplemental oxygen therapy',
        'Overall condition=Satisfactory',
      ]),
    );

    // <enrollInProgram programId="Infant" locationTag="Program Location "> at :65
    const res = await api.get(enrollmentsUrl);
    expect(res.ok()).toBeTruthy();
    const enrollments = (await res.json()).results as Array<{ program: { name: string }; dateCompleted: string | null }>;
    expect(enrollments.map((e) => e.program.name)).toEqual(['Infant']);
    expect(enrollments[0].dateCompleted).toBeNull();
  });

  const fillFullAssessment = async (page: Page) => {
    await pickProviderAndLocation(page);
    // delivery date and time: the date input is a read-only datepicker, set it through the widget
    await page
      .locator('#treatment p.date-one-line')
      .first()
      .locator('input.hasDatepicker')
      .evaluate((el) => {
        const d = new Date();
        d.setDate(d.getDate() - 2);
        (window as any).jQuery(el).datepicker('setDate', d);
        (window as any).jQuery(el).trigger('change');
      });
    await page.locator('#treatment p.date-one-line').first().locator('select.hfe-hours').selectOption('14');
    await page.locator('#treatment p.date-one-line').first().locator('select.hfe-minutes').selectOption('30');
    await page.locator('p', { hasText: 'Gestation age' }).locator('input[type=text]').first().fill('37.4');
    await page.getByLabel('Spontaneous vaginal delivery').check();
    await page.locator('#dead-or-alive').getByLabel('Alive').check();
    await page.getByLabel('M', { exact: true }).check();
    const alive = page.locator('#alive-details input[type=text]');
    await alive.nth(0).fill('2.9'); // birth weight
    await alive.nth(1).fill('48'); // birth length
    await alive.nth(2).fill('34'); // head circumference
    await alive.nth(3).fill('8'); // APGAR 1 minute
    await alive.nth(4).fill('9'); // APGAR 5 minutes
    await page.locator('#alive-details').getByLabel('Yes').check(); // breastfeeding within 1 hour
    await page.locator('#multipleBabies input[type=checkbox]').check();
    await page.locator('#baby-number input[type=text]').fill('2');
    await page.locator('#heart_rate input').fill('140');
    await page.locator('#respiratory_rate input').fill('50');
    await page.locator('#temperature_c input').fill('36.8');
    await page.locator('#o2_sat input').fill('97');
    await page.locator('#resuscitation').getByLabel('Yes').check();
    await page.locator('#type-resuscitation input[type=checkbox]').nth(1).check(); // Ventilation bag
    await page.locator('#type-resuscitation input[type=checkbox]').nth(3).check(); // Heart massage
    await page.getByLabel('Premature birth', { exact: true }).check();
    await page.getByLabel('Low birth weight', { exact: true }).check();
    await page.locator('#malformation-q input[type=checkbox]').check();
    await page.locator('#malformation-details input[type=text]').fill('Cleft palate');
    await page.locator('#birthInjury').getByLabel('Yes').check();
    await page.locator('#birthInjury-details textarea').fill('Bruise on the left shoulder');
    await page.locator('#outcome-condition').getByLabel('Satisfactory').check();
    await page.locator('#outcome textarea').fill('Stable, to the ward');
  };

  // VIEW (viewEncounterWithHtmlForm): saved values are span.value, unselected options span.emptyValue ("[X] M" / "[  ] F").
  test('VIEW: shows the saved birth data, outcome, vitals, resuscitation and diagnoses, and nothing that was left empty', async ({ page, api }) => {
    await fillFullAssessment(page);
    await page.locator('#contactDr input[type=checkbox]').evaluate((el: HTMLInputElement) => el.click()); // hidden until a vitals score is red
    await save(page);
    await new EntryFormPage(page, FORM).expectSaved();
    const [encounter] = await getPatientEncounters(api, context.patient.uuid);

    // Answers the form labels differently from the concept (answerCodes / answerLabel). The hidden "Diagnosis order" marker of the
    // diagnosis groups is not shown by the form (an empty label only requires that the VIEW shows something).
    const view = await expectViewShowsSavedObs(page, api, FORM, encounter.uuid, {
      'Child gender: Male': '[X] M',
      'Qualitative birth outcome: Livebirth': '[X] Alive',
      'Diagnosis: Multiple gestation': 'Twins or multiple',
      'Diagnosis order: Secondary': '',
    });
    const shown = await view.valueTexts();
    for (const expected of [
      '37.4',
      '[X] Spontaneous vaginal delivery',
      '[X] Alive',
      '[X] M',
      '2.9',
      '[X] Twins or multiple',
      '[X] Yes', // breastfeeding within 1 hour (CIEL:161543 has no answerCodes: the concept name)
      '[X] Bag valve mask ventilation',
      '[X] Cardiopulmonary resuscitation (CPR)',
      '[X] Premature birth',
      '[X] Low birth weight',
      '[X] Congenital malformation',
      'Cleft palate',
      'Bruise on the left shoulder',
      '[X] Satisfactory',
      'Stable, to the ward',
    ]) {
      expect(shown, expected).toContain(expected);
    }

    // the delivery date and time are two values: "dd MMM yyyy" and "h:mm a"
    const delivered = new Date();
    delivered.setDate(delivered.getDate() - 2);
    const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][delivered.getMonth()];
    const day = `${delivered.getDate()}`.padStart(2, '0');
    await expect(page.locator('#treatment p.date-one-line').first().locator('.value')).toHaveText([`${day} ${month} ${delivered.getFullYear()}`, '2:30 PM']);

    // the unselected answers are shown as empty options, not as values
    const empty = (await page.locator('span.emptyValue').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
    for (const expected of ['[ ] F', '[ ] FSB', '[ ] MSB', '[ ] No', '[ ] Adrenaline administered']) {
      expect(empty, expected).toContain(expected);
    }
    // nothing was ticked in the pregnancy complications; the diagnoses (obsgroup showIfEmpty=false) that were not ticked are not listed
    await expect(page.locator('#preg-complications .value')).toHaveCount(0);
    await expect(page.locator('#preg-complications .emptyValue').first()).toBeVisible();
    for (const dx of ['Placental abnormality', 'Birth asphyxia', 'Meconium aspiration', 'Intra-uterine foetal demise']) {
      await expect(page.getByText(dx)).toHaveCount(0);
    }
    // ENTER-only content is absent: the heading, the helper text, the APGAR table and the buttons
    await expect(page.locator('h2, #alive-details table, #buttons, input, select, textarea, button')).toHaveCount(0);
    await expect(page.getByText('Decimal represents number of days')).toHaveCount(0);
  });
});
