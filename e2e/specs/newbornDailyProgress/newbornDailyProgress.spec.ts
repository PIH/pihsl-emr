import type { APIRequestContext, Locator, Page } from '@playwright/test';
import { test, expect, type EntryContext } from '../../core';
import { MCH_OPD_LOCATION_UUID } from '../../core/constants';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import { EntryFormPage, ViewFormPage, expectViewShowsSavedObs } from '../../pages';

// newbornDailyProgress.xml: "Newborn Daily Progress" (one per day of the NICU stay): read-only overview of the birth data
// recorded earlier in the visit, infant vitals, condition, labs, exam, scores, diagnoses, inputs (feeding, IV, respiration,
// resuscitation, blood), outputs, treatment support, outcome. The specs open enterHtmlFormWithStandardUi inside a visit they
// create, for an infant born 3 days ago, so availability (documentation/_availability.e2e.md: enableMCOEForms, enterMCH,
// "Newborn Daily Progress Location", age < 42 days at visit start, repeatable) is not exercised. The "earlier data"
// conditions get an earlier encounter in the same visit, created over REST (recordEarlierEncounter, local helper).
//
// Conditions in the form, from documentation inventory (newbornDailyProgress.inv.md):
//   includeIf $deliveryDate     :270  delivery date and time of the latest CIEL:5599 before this encounter
//   includeIf $deliveryType     :276  type of delivery (PIH:11663);   $apgarOne :294, $apgarFive :305, $apgarTen :317 (APGAR 1/5/10)
//   includeIf $neoResusc        :328  resuscitated at birth (CIEL:162131) with its date
//   includeIf $priorEyeDrops    :982, $priorSupplement :995 (Vitamin K), $priorCordCare :1015  "[ x ] <date>" when given earlier in the visit
//   toggle CIEL:165995 (IV)     :684  show #ivf;   when #air = CPAP :774 -> #cpap, = Supplemental oxygen :775 -> #oxy2
//   when apnea checkbox         :814  show #apnea-duration;   when #resuscitation = Yes :839 -> #type-resuscitation
//   when #transfusion-q = Yes   :888  show #transfusion-details (value CIEL:1065 although the answers are PIH:YES/NO, see below)
//   ifMode ENTER :51; ifMode VIEW include=false :73, :239, :261, :360, :980, :993, :1005, :1013, :1058  scripts, heading,
//     Overview, prior-value spans, buttons (ENTER renders them; the VIEW test asserts none of them is rendered, although the visit holds
//     the data they look up)
// Scripts: :52-70 (ENTER) retrospective date -> set the time widgets to 00:00, runs once on load (not covered). :74-224
//   (ENTER/EDIT): .normalObs/.abnormalObs mutual exclusion inside one .exam block; setUpNextAndSubmitButtons(); REST GET of the
//   encounters in the same visit -> #birthWeightBox / #birthLengthBox / #lastWeightKg; on change of #weight_kg, if birth weight
//   exists and weight / birth weight <= 90% show "Weight is 10% less than birth weight" in the field's .field-error (does not
//   block Save).
// Side effects on save: enrollInProgram Infant (:259, locationTag "Program Location "), CleanDiagnosisConstructAction and
//   ApplyDispositionAction (:21-22). No order. Provider and location are required (shared subform).
// VIEW is covered by 'VIEW: ...' (a filled form saved, then rendered with viewEncounterWithHtmlForm): every saved value is shown with the
//   labels of answerCode/answerCodes/aLabel ("[X] breastfed", "[X] Normal saline (NS) 0.9%"), the IV date as "dd MMM yyyy", each obsgroup
//   (IVF, transfusion fluid) with its own volume, the CPAP pressure without the oxygen flow rate, and no value for what was left empty.
//   The "when"/toggle show/hide controls are JavaScript and cannot be checked in the loaded HTML.
// Not covered here: disposition (ApplyDispositionAction), infant vitals scoring and the Save block (_shared.e2e.md), diagnosis
//   search, the retrospective-time script, EDIT mode.
//
// Findings (the duplicate ids "glucose" (:426) and "when" (:265) are see _shared V10):
//   V1 Low  :455, :482  CIEL:168722 is used for both "Comments about umbilical cord" and "Comments about eyes": two inputs of one
//                       concept, saved as indistinguishable obs (unconfirmed how EDIT re-binds them). Fix: separate concept.
//   V2 Low  :645, :1053 CIEL:161011 ("Summary") is offered twice, in Diagnoses and in Outcome.
//   V3 Low  :124        `Number.isNaN(weight)` is on a string, so it is never true and "Not a valid number" can never show
//                       (the numeric widget validates anyway). Fix: isNaN(Number(weight)).
//   V4 Low  :52-70      the retrospective-time default runs once on load (as in newbornInitial V3); picking a past date later
//                       keeps the current time, and `currentEncounterDate` is an undeclared global.
//   V5 Low  :854-860    <render aLabel=...> of the resuscitation methods is unused (the template has no answerCode), and CIEL:165995
//                       is the concept of both "Intravenous (IV) access" and the resuscitation methods (works, but one concept
//                       carries two unrelated questions).
//   V6 Info :888        <when value="CIEL:1065"> although the answers are PIH:YES/PIH:NO: the mechanical lead is a false alarm,
//                       both codes are the same concept (tested: Yes shows #transfusion-details).
//   VW1 Medium :455, :482  (V1 in VIEW) the cord comment and the eye comment are one concept: a saved obs is bound to the first input of
//                       its concept, so a lone eye comment is shown as the umbilical cord comment. TESTED below (test.fail).
//                       Fix: a separate concept for one of them.
//   VW2 Medium :645, :1053 (V2 in VIEW) the same for the two summaries: a lone Outcome summary is shown in Diagnoses (with both filled the
//                       two texts are swapped). TESTED below (test.fail). Fix: a separate concept for one of them.
//   VW3 Low  :811 (and :927, same structure, not tested)  "Apnea of newborn" is a checkbox in an obsgroup of PIH:Visit Diagnoses that comes
//                       after the diagnosis picker (:629). In VIEW the picker takes the group ("Secondary Diagnosis (Presumed) Apnea of newborn
//                       [P28.4]" under Diagnoses) and the checkbox (showIfEmpty="false") is not rendered, so Respiration shows the
//                       apnea duration without the ticked box. TESTED below for apnea (test.fail). Fix: put these checkboxes before the picker
//                       (as the checkboxes of newbornInitial) or render their diagnoses explicitly.

const FORM = 'newbornDailyProgress.xml';
const NEWBORN_INITIAL_ENCOUNTER_TYPE_UUID = '093b6ffc-e55a-461a-85cc-c6acf7714a23';

// A newborn: the form is only offered for patients younger than 42 days at visit start.
const daysAgo = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

// Records an earlier encounter in the visit with the given obs (concept mappings and numbers/codes as REST accepts them).
const recordEarlierEncounter = async (api: APIRequestContext, context: EntryContext, obs: Array<{ concept: string; value: unknown }>) => {
  const res = await api.post('encounter', {
    data: {
      patient: context.patient.uuid,
      encounterType: NEWBORN_INITIAL_ENCOUNTER_TYPE_UUID,
      location: MCH_OPD_LOCATION_UUID,
      encounterDatetime: new Date().toISOString(),
      visit: context.visitUuid,
      obs,
    },
  });
  expect(res.ok(), `create encounter: ${res.status()}`).toBeTruthy();
};

const saveButton = (page: Page) => page.locator('#buttons input.submitButton');

test.describe('newbornDailyProgress', () => {
  let context: EntryContext;

  test.beforeEach(async ({ createEntryContext }) => {
    context = await createEntryContext({ givenName: 'AutoNbDaily', familyName: 'Tester', gender: 'F', birthdate: daysAgo(3) });
  });

  const open = async (page: Page) => {
    await EntryFormPage.open(page, FORM, context);
    await expect(page.locator('#vitals')).toBeVisible();
  };

  // Table-driven show/hide: [name, trigger, how to switch it off again, target]
  type Row = [string, (p: Page) => Locator, (p: Page) => Locator | null, string];
  const showHide: Row[] = [
    ['IV access checkbox (toggle :684)', (p) => p.getByLabel('Intravenous (IV) access', { exact: true }), () => null, '#ivf'],
    ['air supply CPAP (:774)', (p) => p.locator('#air').getByLabel('CPAP', { exact: true }), (p) => p.locator('#air').getByLabel('Room air', { exact: true }), '#cpap'],
    [
      'air supply oxygen (:775)',
      (p) => p.locator('#air').getByLabel('Supplemental oxygen therapy', { exact: true }),
      (p) => p.locator('#air').getByLabel('Room air', { exact: true }),
      '#oxy2',
    ],
    ['apnea checkbox (:814)', (p) => p.locator('#apnea-q').getByLabel('Apnea of newborn', { exact: true }), () => null, '#apnea-duration'],
    [
      'neonatal resuscitation yes (:839)',
      (p) => p.locator('#resuscitation').getByLabel('yes', { exact: true }),
      (p) => p.locator('#resuscitation').getByLabel('no', { exact: true }),
      '#type-resuscitation',
    ],
    [
      'blood transfusion yes (:888)',
      (p) => p.locator('#transfusion-q').getByLabel('yes', { exact: true }),
      (p) => p.locator('#transfusion-q').getByLabel('no', { exact: true }),
      '#transfusion-details',
    ],
  ];
  for (const [name, trigger, off, target] of showHide) {
    test(`${name} shows ${target} only while selected`, async ({ page }) => {
      await open(page);
      await expect(page.locator(target)).toBeHidden();
      await trigger(page).check();
      await expect(page.locator(target)).toBeVisible();
      const offControl = off(page);
      if (offControl) {
        await offControl.check();
      } else {
        await trigger(page).uncheck();
      }
      await expect(page.locator(target)).toBeHidden();
    });
  }

  test('CPAP shows the CPAP fields and not the oxygen flow rate, and the other way round', async ({ page }) => {
    // when :774 vs :775
    await open(page);
    await page.locator('#air').getByLabel('CPAP', { exact: true }).check();
    await expect(page.locator('#cpap')).toBeVisible();
    await expect(page.locator('#oxy2')).toBeHidden();
    await page.locator('#air').getByLabel('Supplemental oxygen therapy', { exact: true }).check();
    await expect(page.locator('#oxy2')).toBeVisible();
    await expect(page.locator('#cpap')).toBeHidden();
  });

  // script :74 normal/abnormal exclusion, one .exam block per row: [name, block index, normal, abnormal]
  const exams: Array<[string, number, string, string]> = [
    ['umbilical cord', 0, 'Clean', 'Moist'],
    ['eyes', 1, 'Clear', 'Red eyes'],
    ['skin colour', 2, 'Normal (pink)', 'Jaundice'],
  ];
  for (const [name, index, normal, abnormal] of exams) {
    test(`${name}: a normal and an abnormal finding exclude each other`, async ({ page }) => {
      await open(page);
      const block = page.locator('.exam').nth(index);
      await block.getByLabel(normal, { exact: true }).check();
      await block.getByLabel(abnormal, { exact: true }).check();
      await expect(block.getByLabel(normal, { exact: true })).not.toBeChecked();
      await block.getByLabel(normal, { exact: true }).check();
      await expect(block.getByLabel(abnormal, { exact: true })).not.toBeChecked();
    });
  }

  // Overview includeIf rows :270-328: [name, earlier obs, locator in the Overview, text it must contain]
  const overviewRows: Array<[string, { concept: string; value: unknown }, string, RegExp]> = [
    ['delivery date (:270)', { concept: 'CIEL:5599', value: `${daysAgo(2)}T12:00:00.000Z` }, '#Overview #when', /\d{2} \w{3} \d{4}/],
    ['type of delivery (:276)', { concept: 'PIH:11663', value: 'CIEL:155884' }, '#Overview', /Delivery by cesarean section/i],
    ['APGAR 1 minute (:294)', { concept: 'PIH:14419', value: 7 }, '.apgar >> nth=0', /\b7\b/],
    ['APGAR 5 minutes (:305)', { concept: 'CIEL:159604', value: 8 }, '.apgar >> nth=1', /\b8\b/],
    ['APGAR 10 minutes (:317)', { concept: 'PIH:14785', value: 9 }, '.apgar >> nth=2', /\b9\b/],
    ['resuscitation at birth (:328)', { concept: 'CIEL:162131', value: 'CIEL:1065' }, '#Overview', /Yes/],
  ];
  for (const [name, obs, where, text] of overviewRows) {
    test(`overview shows the ${name} only when it was recorded earlier in the visit`, async ({ page, api }) => {
      await open(page);
      await expect(page.locator(where)).not.toContainText(text);

      await recordEarlierEncounter(api, context, [obs]);
      await page.reload();
      await expect(page.locator('#vitals')).toBeVisible();
      await expect(page.locator(where)).toContainText(text);
    });
  }

  // Birth plan includeIf rows :982, :995, :1015: [name, earlier obs, label]
  const planRows: Array<[string, { concept: string; value: unknown }, string]> = [
    ['eye drops (:982)', { concept: 'CIEL:1651', value: 'CIEL:168724' }, 'Prophylactic eye drops'],
    ['vitamin K (:995)', { concept: 'PIH:SUPPLEMENT RECEIVED', value: 'CIEL:86352' }, 'Vitamin K'],
    ['umbilical cord care (:1015)', { concept: 'CIEL:1651', value: 'CIEL:168725' }, 'Umbilical cord care'],
  ];
  for (const [name, obs, label] of planRows) {
    test(`birth plan marks ${name} as given earlier only when it was`, async ({ page, api }) => {
      const cell = (p: Page) => p.locator('#treatment-support .four-columns > div').filter({ has: p.getByLabel(label, { exact: true }) });
      await open(page);
      await expect(cell(page).locator('.prior-obs-value')).toHaveCount(0);

      await recordEarlierEncounter(api, context, [obs]);
      await page.reload();
      await expect(page.locator('#vitals')).toBeVisible();
      await expect(cell(page).locator('.prior-obs-value')).toContainText('[ x ]');
      // the other two boxes stay unmarked
      await expect(page.locator('#treatment-support .prior-obs-value')).toHaveCount(1);
    });
  }

  test('a weight 10% or more below the birth weight shows a warning, a higher weight does not', async ({ page, api }) => {
    // script :74 on change of #weight_kg (birth weight from the earlier encounter in the visit)
    await recordEarlierEncounter(api, context, [
      { concept: 'CIEL:5916', value: 3.0 },
      { concept: 'CIEL:163554', value: 50 },
    ]);
    await open(page);
    await expect(page.locator('#birthWeightInfo')).toContainText('3kg');
    await expect(page.locator('#birthLengthInfo')).toContainText('50cm');

    const weight = page.locator('#weight_kg input[type=text]');
    const warning = page.locator('#weight_kg .field-error');
    await weight.fill('2.5');
    await weight.blur();
    await expect(warning).toContainText('Weight is 10% less than birth weight');
    await weight.fill('2.9');
    await weight.blur();
    await expect(warning).toBeHidden();
  });

  test('without an earlier birth weight no warning is shown', async ({ page }) => {
    await open(page);
    await expect(page.locator('#birthWeightBox')).toBeHidden();
    const weight = page.locator('#weight_kg input[type=text]');
    await weight.fill('1.0');
    await weight.blur();
    await page.waitForTimeout(500); // the warning, when it applies, is set after 100 ms
    await expect(page.locator('#weight_kg .field-error')).toBeHidden();
  });

  test('saving without a location does not save', async ({ page }) => {
    // required location widget (shared subform; the session location MCH OPD is not an option, so none is preselected)
    await open(page);
    await expect(page.locator('#encounterLocation select')).toHaveValue('');
    await saveButton(page).click();
    await expect(page.locator('span.field-error:visible', { hasText: /required/i }).first()).toBeVisible();
    await expect(page).not.toHaveURL(/referenceapplication\/home\.page/);
  });

  test('saves weight, exam, apnea, feeding, IV access and outcome, and enrolls the infant in the Infant program', async ({ page, api }) => {
    const enrollmentsUrl = `programenrollment?patient=${context.patient.uuid}&v=custom:(program:(name),dateCompleted)`;
    expect(((await (await api.get(enrollmentsUrl)).json()).results as unknown[]).length).toBe(0);

    await open(page);
    await page.locator('#encounterLocation select').selectOption({ index: 1 });
    await page.locator('#weight_kg input[type=text]').fill('2.9');
    await page.locator('.exam').nth(2).getByLabel('Jaundice', { exact: true }).check();
    await page.locator('#apnea-q').getByLabel('Apnea of newborn', { exact: true }).check();
    await page.locator('#apnea-duration input').fill('20');
    await page.getByLabel('breastfed', { exact: true }).check();
    await page.getByLabel('Intravenous (IV) access', { exact: true }).check();
    await page.locator('#ivf').getByLabel('Hand', { exact: true }).check();
    await page.locator('#treatment-support').getByLabel('Vitamin D', { exact: true }).check();
    await page.locator('#outcome-condition').getByLabel('Satisfactory', { exact: true }).check();
    await saveButton(page).click();
    await new EntryFormPage(page, FORM).expectSaved();

    const encounters = await getPatientEncounters(api, context.patient.uuid);
    expect(encounters).toHaveLength(1);
    const displays = (await getEncounterObs(api, encounters[0].uuid)).map((o) => o.display.toLowerCase());
    for (const expected of ['weight', 'jaundice', 'apnea', 'breast', 'intravenous', 'hand', 'vitamin d', 'satisfactory']) {
      expect(displays.some((d) => d.includes(expected)), `an obs mentions "${expected}"`).toBeTruthy();
    }

    // enrollInProgram Infant :259
    const enrollments = (await (await api.get(enrollmentsUrl)).json()).results as Array<{ program: { name: string } }>;
    expect(enrollments.some((e) => /infant/i.test(e.program.name))).toBeTruthy();
  });

  const fillDaily = async (page: Page) => {
    await page.locator('#encounterLocation select').selectOption({ index: 1 });
    await page.locator('#heart_rate input').fill('150');
    await page.locator('#weight_kg input[type=text]').fill('2.9');
    await page.locator('#labs input[type=text]').fill('4.2');
    await page.locator('.exam').nth(0).getByLabel('Clean', { exact: true }).check();
    await page.locator('.exam').nth(0).locator('input[type=text]').fill('Cord comment'); // (the eye comment is the same concept, see V1 and VW1)
    await page.locator('.exam').nth(1).getByLabel('Clear', { exact: true }).check();
    await page.locator('.exam').nth(2).getByLabel('Jaundice', { exact: true }).check();
    await page.locator('#scores input[type=text]').nth(0).fill('3');
    await page.locator('#dx textarea[id^=w]').fill('Dx summary text'); // (the Outcome summary is the same concept, see V2 and VW2)
    await page.getByLabel('breastfed', { exact: true }).check();
    await page.getByLabel('Tube', { exact: true }).check();
    await page.getByLabel('Intravenous (IV) access', { exact: true }).check();
    await page.locator('#ivf').getByLabel('Hand', { exact: true }).check();
    await page // date of IV placement: a read-only datepicker, set it through the widget
      .locator('#ivf input.hasDatepicker')
      .evaluate((el) => {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        (window as any).jQuery(el).datepicker('setDate', d);
        (window as any).jQuery(el).trigger('change');
      });
    await page.locator('#ivf input[type=text]').nth(1).fill('4'); // days with IV
    await page.locator('#ivf input[type=checkbox]').nth(1).check(); // IVF: normal saline
    await page.locator('#ivf input[type=text]').nth(2).fill('100'); // IVF volume
    await page.locator('#air').getByLabel('CPAP', { exact: true }).check();
    await page.locator('#cpap input[type=text]').nth(0).fill('6');
    await page.locator('#resuscitation').getByLabel('yes', { exact: true }).check();
    await page.locator('#type-resuscitation input[type=checkbox]').nth(1).check();
    await page.locator('#transfusion-q').getByLabel('yes', { exact: true }).check();
    await page.locator('#transfusion-details').getByLabel('exchange', { exact: true }).check();
    await page.locator('#transfusion-details .four-columns > div').nth(1).locator('input[type=checkbox]').check();
    await page.locator('#transfusion-details .four-columns > div').nth(1).locator('input[type=text]').fill('40');
    await page.locator('#outputs input[type=text]').nth(0).fill('55');
    await page.locator('#treatment-support').getByLabel('Vitamin D', { exact: true }).check();
    await page.locator('#treatment-support').getByLabel('Prophylactic eye drops', { exact: true }).check();
    await page.locator('#treatment-support textarea').fill('Continue phototherapy');
    await page.locator('#outcome-condition').getByLabel('Satisfactory', { exact: true }).check();
  };

  // VIEW (viewEncounterWithHtmlForm): saved values are span.value, unselected options span.emptyValue ("[X] yes" / "[  ] no").
  test('VIEW: shows the saved inputs, respiration, transfusion and treatment, and none of the ENTER-only lookups', async ({ page, api }) => {
    // data recorded earlier in the visit, which the Overview (:261) and the prior-value markers (:980-1017) show in ENTER only
    await recordEarlierEncounter(api, context, [
      { concept: 'CIEL:5599', value: `${daysAgo(2)}T12:00:00.000Z` },
      { concept: 'PIH:11663', value: 'CIEL:155884' },
      { concept: 'CIEL:5916', value: 3.0 },
      { concept: 'CIEL:1651', value: 'CIEL:168725' },
    ]);
    await open(page);
    await fillDaily(page);
    await saveButton(page).click();
    await new EntryFormPage(page, FORM).expectSaved();
    const [encounter] = (await getPatientEncounters(api, context.patient.uuid)).filter((e) => e.encounterType.uuid !== NEWBORN_INITIAL_ENCOUNTER_TYPE_UUID);

    // Answers the form labels differently from the concept (answerCode / answerCodes / aLabel), and the hidden diagnosis order.
    const view = await expectViewShowsSavedObs(page, api, FORM, encounter.uuid, {
      'Neonatal umbilical stump status: Neonatal umbilical stump clean': 'Clean',
      'Type of blood transfusion: Neonatal exchange transfusion': 'exchange',
      'Supportive care: Intravenous fluid administration': 'Intravenous (IV) access',
      'Feeding technique for newborn: Tube feeding of infant': 'Tube',
      'Infant feeding method: Breastfeeding child': 'breastfed',
      'Intravenous fluids administered: Sodium Chloride 0.9%': 'Normal saline (NS) 0.9%',
      'Skin exam findings: Neonatal jaundice': 'Jaundice',
      'Procedure performed: Administration of prophylactic antibiotics to neonatal eyes': 'Prophylactic eye drops',
      'Supplement received: Vitamin D / vitamin D2': 'Vitamin D',
    });
    const shown = await view.valueTexts();
    for (const expected of [
      '150',
      '2.9',
      '4.2',
      '[X] Clean',
      'Cord comment',
      '[X] Clear',
      '[X] Jaundice',
      '3',
      'Dx summary text',
      '[X] breastfed',
      '[X] Tube',
      '[X] Intravenous (IV) access',
      '[X] Hand',
      '[X] Normal saline (NS) 0.9%',
      '[X] CPAP',
      '[X] yes',
      '[X] Bag valve mask ventilation',
      '[X] exchange',
      '[X] Packed red blood cells',
      '55',
      '[X] Prophylactic eye drops',
      '[X] Vitamin D',
      'Continue phototherapy',
      '[X] Satisfactory',
    ]) {
      expect(shown, expected).toContain(expected);
    }

    // the IV block: the placement date ("dd MMM yyyy", without time), site, days, and the IVF group with its own volume
    const placed = new Date();
    placed.setDate(placed.getDate() - 1);
    const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][placed.getMonth()];
    await expect(page.locator('#ivf .value')).toHaveText([
      `${`${placed.getDate()}`.padStart(2, '0')} ${month} ${placed.getFullYear()}`,
      '[X] Hand',
      '4',
      '[X] Normal saline (NS) 0.9%',
      '100',
    ]);
    // the transfusion groups: the volume is shown with the fluid it was given with (Packed red blood cells, the second of the four)
    await expect(page.locator('#transfusion-details .four-columns > div').nth(1).locator('.value')).toHaveText(['[X] Packed red blood cells', '40']);
    for (const other of [0, 2, 3]) {
      await expect(page.locator('#transfusion-details .four-columns > div').nth(other).locator('.value')).toHaveCount(0);
    }
    // CPAP shows its pressure and the oxygen flow rate stays empty; only the ticked resuscitation method is a value
    await expect(page.locator('#cpap .value')).toHaveText(['6']);
    await expect(page.locator('#oxy2 .value')).toHaveCount(0);
    await expect(page.locator('#type-resuscitation .value')).toHaveText(['[X] Bag valve mask ventilation']);
    // the surgery question and the other birth-plan boxes were left empty
    await expect(page.locator('#treatment-support .value')).toHaveText(['[X] Prophylactic eye drops', '[X] Vitamin D', 'Continue phototherapy']);
    await expect(page.locator('#treatment-support .emptyValue').filter({ hasText: 'Umbilical cord care' })).toHaveCount(1); // given earlier in the visit, not now
    // ENTER-only content is absent although the visit holds the data: the Overview, the "[ x ] <date>" markers, the heading, the buttons
    await expect(page.locator('#Overview, #treatment-support .prior-obs-value, .apgar, #lastWeightKg')).toHaveCount(0);
    await expect(page.locator('h2, #buttons, input, select, textarea, button')).toHaveCount(0);
  });

  // VW1 (Medium): the umbilical cord comment (:455) and the eye comment (:482) are two inputs of one concept (CIEL:168722; V1). A saved obs
  // is bound to the first input of its concept, so a lone eye comment is shown as the cord comment. Intended: shown with the eyes.
  // Remove test.fail() when the concepts differ.
  test('VW1: an eye comment is shown with the eyes, not with the umbilical cord', async ({ page, api }) => {
    test.fail();
    await open(page);
    await page.locator('#encounterLocation select').selectOption({ index: 1 });
    await page.locator('.exam').nth(1).locator('input[type=text]').fill('Discharge from the left eye');
    await saveButton(page).click();
    await new EntryFormPage(page, FORM).expectSaved();
    const [encounter] = (await getPatientEncounters(api, context.patient.uuid)).filter((e) => e.encounterType.uuid !== NEWBORN_INITIAL_ENCOUNTER_TYPE_UUID);

    await ViewFormPage.open(page, FORM, encounter.uuid);
    await expect(page.locator('.exam').nth(0).locator('.value')).toHaveCount(0);
    await expect(page.locator('.exam').nth(1).locator('.value')).toHaveText(['Discharge from the left eye']);
  });

  // VW2 (Medium): the summary in Diagnoses (:645) and the one in Outcome (:1053) are the same concept (CIEL:161011; V2): a lone Outcome
  // summary is shown in the Diagnoses section. Intended: shown in Outcome. Remove test.fail() when the concepts differ.
  test('VW2: an Outcome summary is shown in the Outcome section, not in Diagnoses', async ({ page, api }) => {
    test.fail();
    await open(page);
    await page.locator('#encounterLocation select').selectOption({ index: 1 });
    await page.locator('#outcome textarea[id^=w]').fill('Discharged to the ward');
    await saveButton(page).click();
    await new EntryFormPage(page, FORM).expectSaved();
    const [encounter] = (await getPatientEncounters(api, context.patient.uuid)).filter((e) => e.encounterType.uuid !== NEWBORN_INITIAL_ENCOUNTER_TYPE_UUID);

    await ViewFormPage.open(page, FORM, encounter.uuid);
    await expect(page.locator('#dx .value')).toHaveCount(0);
    await expect(page.locator('#outcome .value')).toHaveText(['Discharged to the ward']);
  });

  // VW3 (Low): "Apnea of newborn" (:811) is a checkbox inside a PIH:Visit Diagnoses obsgroup, like the diagnosis picker's own rows
  // (:629). The picker comes first in the form, so in VIEW it takes the group as an encounter diagnosis ("Secondary Diagnosis (Presumed)
  // Apnea of newborn [P28.4]" under Diagnoses) and the checkbox, hidden by showIfEmpty="false", is not rendered: only the apnea duration
  // is left in Respiration. The same holds for the blood-reaction checkbox (:927, not tested). In newbornInitial the checkboxes
  // come before the picker and are shown. Intended: the ticked box is shown where it was ticked. Remove test.fail() when it is.
  test('VW3: a ticked apnea checkbox is shown in Respiration', async ({ page, api }) => {
    test.fail();
    await open(page);
    await page.locator('#encounterLocation select').selectOption({ index: 1 });
    await page.locator('#apnea-q').getByLabel('Apnea of newborn', { exact: true }).check();
    await page.locator('#apnea-duration input').fill('20');
    await saveButton(page).click();
    await new EntryFormPage(page, FORM).expectSaved();
    const [encounter] = (await getPatientEncounters(api, context.patient.uuid)).filter((e) => e.encounterType.uuid !== NEWBORN_INITIAL_ENCOUNTER_TYPE_UUID);

    const view = await ViewFormPage.open(page, FORM, encounter.uuid);
    expect(await view.valueTexts()).toContain('[X] Apnea of newborn');
  });
});
