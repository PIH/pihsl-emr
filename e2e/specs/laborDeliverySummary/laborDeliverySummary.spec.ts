import type { APIRequestContext, Page } from '@playwright/test';
import { test, expect, birthdateYearsAgo, type EntryContext } from '../../core';
import { MCH_OPD_LOCATION_UUID } from '../../core/constants';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import { EntryFormPage, SectionFormPage, expectViewShowsSavedObs } from '../../pages';

// laborDeliverySummary.xml: "Labour and Delivery Summary" (labour onset, up to three infants, third stage, placenta, cord,
// breastfeeding, uterotonics, HCW cadre, perineum, rapid tests, PHQ-2). The specs open enterHtmlFormWithStandardUi inside a visit
// they create with a 25-year-old female (documentation/_availability.e2e.md: enableMCOEForms, enterMCH, Delivery Location
// session tag, female >= 10), so the app-loader gating is not exercised. The session location (MCH OPD) has no Delivery Location
// tag, so every save picks "Labour and Delivery" in the location select. The form ends with <submit> (no #submit: use
// #buttons input.submitButton) and a successful save redirects to pihcore/children/children.page, not to the returnUrl.
//
// Conditions in the form, from documentation inventory (laborDeliverySummary.inv.md):
//   ifMode VIEW include=false :27,:81,:292,:455,:463,:505,:537,:680,:1226  CSS, scripts, "last labour progress" box, heading, buttons: ENTER/EDIT only
//   ifMode ENTER :51                 script that auto-answers "registered in EMR" per outcome
//   includeIf $fn.getObs($encounter,'CIEL:151750') :326  inside the :293 script: EDIT with an own induced obs skips the prefill (tested, EDIT)
//   when induced = Yes :648          show #induced-details          when placenta abnormality = Yes :1017  show #placentaAbDesc
//   when breastfeeding = Yes :1051   show #breastDate               when uterotonic = Yes :1084            show #uteroDate
//   when HCW cadre = Other :1146     show #other-ba (CIEL:5622 and the answer PIH:5622 are the same concept, id 6)
//   when presentation = Other :904   show #other-presentation: no such id (V1)
// Scripts:
//   :44-48   concept ids (via <lookup>) used by the other scripts.
//   :52-79   ENTER: outcome Alive -> "registered in EMR" = No; FSB/MSB -> "Do not register" (the radios are disabled, :207; beforeSubmit enables them).
//   :83-290  per-infant validation (getBeforeValidation :194): once an infant has date, sex, outcome, method or all inputs, all five
//            are required ("*Required"); outcome toggles #preFhrDiv (alive hides), #apgarDiv (FSB hides), #inputFieldsDiv (MSB hides);
//            totals of the stage durations (.labor_stage_hours/.labor_stage_minutes -> #totalDuration_*, :255); setUpNextAndSubmitButtons.
//   :293-450 prefill: REST Labour Progress encounter of the same visit -> #lastOnset box (start, induced, method), hides #enter_labour_progress.
//   :465-490 placenta abnormality = Yes with an empty description blocks the save; #placentaAbDesc shows "Required" on click.
//   :681-733 twins/triplets: #fetus-2/#fetus-3 hidden unless filled or #twins ticked; show more/less buttons.
// Side effects on save: CleanDiagnosisConstructAction, RegisterBabyAction (:22), PregnancyProgramPostpartumTransitionAction (:23): tested.
// VIEW is covered by the save test (the delivery with a stillbirth: labels, the date/time pair, totals, empty infants and sections) and by a
// twins test (two stillbirths: each infant keeps its own values).
// Not covered here: an Alive infant saved (RegisterBabyAction would create a baby patient that the cleanup cannot find), twins/triplets
// saved, EDIT mode, the pregnancy-group, lab-results (rapid tests) and PHQ-2 sub-forms (_shared.e2e.md), the partogram upload.
//
// Findings:
//   V1 Medium :904,:908   <when value=Other thenDisplay="#other-presentation"> but the divs are id="other-presentation-{0}": the "if other,
//                         specify" field is always visible. Fix: thenDisplay="#other-presentation-{0}" and hide it initially. TESTED (test.fail).
//   V2 Medium :145-165,:182-192  hasInputFields() is true only when ALL visible inputs are filled, yet it is the "has anything been entered?"
//                         test: an infant with just a birth weight skips the required date/sex/outcome/method check and saves a Newborn details group.
//                         Fix: use "any input filled". TESTED (test.fail).
//   V3 Medium :226-235    MSB hides #inputFieldsDiv but the values already typed stay in the form and are saved (birth weight on a macerated
//                         stillbirth). Fix: clear the hidden inputs when hiding. TESTED (test.fail).
//   V4 Low    :255-274    minutes carry into hours only when total hours is non-zero: 0 h + 90 min stays "0 h 90 min".
//   V5 Low    :486        "Required" on #placentaAbDesc is shown on every Yes click and never cleared when the description is typed.
//   V6 Low    :807,:808,:834,:848  id="inputFieldsDiv", "birthFieldsDiv", "preFhrDiv", "apgarDiv" repeated for each infant (not templated with {0}).
//   V7 Info   :22         a successful save redirects to /pihcore/children/children.page?patientId=..., ignoring the returnUrl.
//   VW1 Info :648,:904,:1017,:1051,:1084,:1146  VIEW does not run the <when>/thenDisplay controls (the generated script is ENTER/EDIT only), so the conditional blocks
//                   (#induced-details, #other-presentation-N, #placentaAbDesc, #breastDate, #uteroDate, #other-ba) are always rendered in VIEW, blank when not applicable (same as gainNewbornRegister VW1; not tested).

const FORM = 'laborDeliverySummary.xml';
const LD_ENCOUNTER_TYPE = 'fec2cc56-e35f-42e1-8ae3-017142c1ca59';
const LABOUR_PROGRESS_ENCOUNTER_TYPE = 'ac5ec970-31b7-4659-9141-284bfbc13c69';
const PREGNANCY_PROGRAM = '6a5713c2-3fd5-46e7-8f25-36a0f7871e12';
const ANTENATAL_STATE = 'a83896bf-9094-4a3c-b843-e75509a52b32';
const SAVE = '#buttons input.submitButton';
const SAVED_URL = /pihcore\/children\/children\.page/;

// ---- local helpers ----
const openForm = async (page: Page, context: EntryContext) => {
  await EntryFormPage.open(page, FORM, context);
  await expect(page.locator(SAVE)).toBeVisible(); // handlers are bound on document.ready
  await page.locator('#encounterLocation select').selectOption({ label: 'Labour and Delivery' });
};

// Clicks Save; true when the form was saved (redirect to the children page), false when it stayed on the form.
const trySave = async (page: Page): Promise<boolean> => {
  await page.locator(SAVE).click();
  return page
    .waitForURL(SAVED_URL, { timeout: 6000 })
    .then(() => true)
    .catch(() => false);
};

// The datepickers are read-only jQuery UI widgets: set the date through the widget and fire change (the handlers listen to it).
const setDate = (page: Page, wrapper: string, date: Date) =>
  page.evaluate(
    ([w, ms]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const input = (window as any).jq(`${w} input.hasDatepicker`);
      input.datepicker('setDate', new Date(ms as number));
      input.change();
    },
    [wrapper, date.getTime()],
  );

const fillText = async (page: Page, selector: string, value: string) => {
  await page.locator(selector).fill(value);
  await page.keyboard.press('Tab'); // jQuery change fires on blur
};

const conceptUuid = async (api: APIRequestContext, ref: string): Promise<string> => {
  const res = await api.get(`concept/${ref}?v=custom:(uuid)`);
  expect(res.ok(), `concept ${ref}: ${res.status()}`).toBeTruthy();
  return (await res.json()).uuid;
};

// Active Pregnancy program enrollment in the Antenatal state, 30 days ago (before the delivery date the specs enter).
const enrollPregnancy = async (api: APIRequestContext, patientUuid: string) => {
  const start = new Date(Date.now() - 30 * 86400000).toISOString();
  const res = await api.post('programenrollment', {
    data: { patient: patientUuid, program: PREGNANCY_PROGRAM, dateEnrolled: start, states: [{ state: ANTENATAL_STATE, startDate: start }] },
  });
  expect(res.ok(), `enroll: ${res.status()}`).toBeTruthy();
};

// A Labour Progress encounter in the visit with labour start, induced = Yes and induction method = oxytocin.
const createLabourProgress = async (api: APIRequestContext, patientUuid: string, visitUuid: string) => {
  const now = new Date().toISOString();
  const res = await api.post('encounter', {
    data: {
      patient: patientUuid,
      encounterType: LABOUR_PROGRESS_ENCOUNTER_TYPE,
      location: MCH_OPD_LOCATION_UUID,
      encounterDatetime: now,
      visit: visitUuid,
      obs: [
        { concept: await conceptUuid(api, 'CIEL:163444'), value: now },
        { concept: await conceptUuid(api, 'CIEL:151750'), value: await conceptUuid(api, 'CIEL:1065') },
        { concept: await conceptUuid(api, 'CIEL:168751'), value: await conceptUuid(api, 'CIEL:168753') },
      ],
    },
  });
  expect(res.ok(), `labour progress: ${res.status()}`).toBeTruthy();
};

const newContext = (createEntryContext: (p: { givenName: string; familyName: string; gender: 'F'; birthdate: string }) => Promise<EntryContext>) =>
  createEntryContext({ givenName: 'AutoLabour', familyName: 'Tester', gender: 'F', birthdate: birthdateYearsAgo(25) });

// Answers the two required placenta radios (completeness, abnormality = No).
const answerPlacenta = async (page: Page) => {
  await page.getByLabel('Complete', { exact: true }).check();
  await page.locator('#placentaAbQ input').nth(1).check();
};

// Fills everything an infant needs to pass the per-infant validation, as a fresh stillbirth (FSB: no APGAR, so three inputs).
const fillFetus1 = async (page: Page, outcomeIndex: number) => {
  await page.locator('#dead-or-alive-1 input').nth(outcomeIndex).check();
  await setDate(page, '#fetus-1 .fetusDeliveryTime', new Date());
  await page.locator('#fetus-1 .fetusGender input').nth(1).check();
  await page.locator('#fetus-1 .deliveryMethod input').nth(0).check();
  const inputs = page.locator('#fetus-1 .inputField input');
  for (let i = 0; i < (await inputs.count()); i++) {
    if (await inputs.nth(i).isVisible()) {
      await fillText(page, `#fetus-1 .inputField >> nth=${i} >> input`, '2');
    }
  }
};

test.describe('laborDeliverySummary', () => {
  let ctx: EntryContext;

  test.beforeEach(async ({ createEntryContext }) => {
    ctx = await newContext(createEntryContext);
  });

  // ---- conditional display ----
  const whens = [
    // [name, trigger wrapper, answer index that shows, answer index that hides, target]
    ['induced (:648)', '#induced', 0, 1, '#induced-details'],
    ['placenta abnormality (:1017)', '#placentaAbQ', 0, 1, '#placentaAbDesc'],
    ['breastfeeding initiated (:1051)', '#breast', 0, 1, '#breastDate'],
    ['uterotonic provided (:1084)', '#uterotonic', 0, 1, '#uteroDate'],
    ['HCW cadre Other (:1146)', '#birth-attendant', 4, 0, '#other-ba'],
  ] as const;

  for (const [name, trigger, showIndex, hideIndex, target] of whens) {
    test(`${name}: ${target} shows for the trigger answer only`, async ({ page }) => {
      await openForm(page, ctx);
      await expect(page.locator(target)).toBeHidden();
      await page.locator(`${trigger} input`).nth(showIndex).check();
      await expect(page.locator(target)).toBeVisible();
      await page.locator(`${trigger} input`).nth(hideIndex).check();
      await expect(page.locator(target)).toBeHidden();
    });
  }

  // V1 (Medium): <when value=Other thenDisplay="#other-presentation"> (:904) matches nothing: the divs are other-presentation-{0}.
  // Intended: hidden until "Other" is chosen. Remove test.fail() when :904 targets #other-presentation-{0}.
  test('the other-presentation field is hidden until "Other" is chosen (V1)', async ({ page }) => {
    test.fail();
    await openForm(page, ctx);
    await expect(page.locator('#other-presentation-1')).toBeHidden({ timeout: 3000 });
    await page.locator('#fetus-presentation-1 input').nth(10).check(); // Other
    await expect(page.locator('#other-presentation-1')).toBeVisible();
  });

  test('ENTER shows the Save/Cancel buttons and the labour-progress entry, not the last-labour box', async ({ page }) => {
    // ifMode VIEW include=false :455,:1226 (both present outside VIEW); :293 box stays hidden without a labour progress encounter
    await openForm(page, ctx);
    await expect(page.locator('#buttons .cancel')).toBeVisible();
    await expect(page.locator('#enter_labour_progress')).toBeVisible();
    await expect(page.locator('#lastOnset')).toBeHidden();
  });

  // ---- scripts ----
  const outcomes = [
    // [outcome, index, register-baby radio index set by :52, preFhr, apgar, inputFields (visible)]
    ['alive', 0, 0, false, true, true],
    ['FSB', 1, 2, true, false, true],
    ['MSB', 2, 2, false, false, false],
  ] as const;

  for (const [outcome, index, registerIndex, preFhr, apgar, inputs] of outcomes) {
    test(`outcome ${outcome} sets the registered-in-EMR answer and the visible infant fields`, async ({ page }) => {
      // script :52 (ENTER) and :217-235
      await openForm(page, ctx);
      await page.locator('#dead-or-alive-1 input').nth(index).check();
      await expect(page.locator('#register-baby-1 input').nth(registerIndex)).toBeChecked(); // No / Do not register
      await expect(page.locator('#register-baby-1 input').first()).toBeDisabled();
      await expect(page.locator('#fetus-1 #preFhrDiv')).toBeVisible({ visible: preFhr });
      await expect(page.locator('#fetus-1 #apgarDiv')).toBeVisible({ visible: apgar });
      await expect(page.locator('#fetus-1 #inputFieldsDiv')).toBeVisible({ visible: inputs });
    });
  }

  test('switching the outcome back re-shows the fields hidden by the previous one', async ({ page }) => {
    await openForm(page, ctx);
    await page.locator('#dead-or-alive-1 input').nth(2).check(); // MSB hides everything
    await expect(page.locator('#fetus-1 #inputFieldsDiv')).toBeHidden();
    await page.locator('#dead-or-alive-1 input').nth(1).check(); // FSB
    await expect(page.locator('#fetus-1 #inputFieldsDiv')).toBeVisible();
    await expect(page.locator('#fetus-1 #apgarDiv')).toBeHidden();
  });

  test('infants 2 and 3 are hidden until "show more" or the twins/triplets box', async ({ page }) => {
    // script :681-733
    await openForm(page, ctx);
    await expect(page.locator('#fetus-1')).toBeVisible();
    for (const hidden of ['#fetus-2', '#fetus-3', '#show-less-fetus-button']) {
      await expect(page.locator(hidden)).toBeHidden();
    }
    await page.locator('#show-more-fetus-button').click();
    await expect(page.locator('#fetus-2')).toBeVisible();
    await expect(page.locator('#fetus-3')).toBeVisible();
    await expect(page.locator('#show-more-fetus-button')).toBeHidden();
    await page.locator('#show-less-fetus-button').click();
    await expect(page.locator('#fetus-2')).toBeHidden();
    await expect(page.locator('#show-more-fetus-button')).toBeVisible();

    await page.locator('#twins input[type=checkbox]').check();
    await expect(page.locator('#fetus-3')).toBeVisible();
    await expect(page.locator('#show-less-fetus-button')).toBeVisible();
    await page.locator('#twins input[type=checkbox]').uncheck();
    await expect(page.locator('#fetus-2')).toBeHidden();
  });

  test('the total duration of labour adds the three stages and carries minutes into hours', async ({ page }) => {
    // script :255-282: stage 1, 2, 3 hours/minutes -> #totalDuration_hours / _minutes
    await openForm(page, ctx);
    const hours = page.locator('.labor_stage_hours input');
    const minutes = page.locator('.labor_stage_minutes input');
    await fillText(page, '.labor_stage_hours >> nth=0 >> input', '1');
    await fillText(page, '.labor_stage_minutes >> nth=0 >> input', '50');
    await fillText(page, '.labor_stage_hours >> nth=1 >> input', '2');
    await fillText(page, '.labor_stage_minutes >> nth=1 >> input', '20');
    expect(await hours.count()).toBe(3);
    expect(await minutes.count()).toBe(3);
    await expect(page.locator('#totalDuration_hours input')).toHaveValue('4');
    await expect(page.locator('#totalDuration_minutes input')).toHaveValue('10');
  });

  const priorLabour = [
    ['with a Labour Progress encounter in the visit', true],
    ['without one', false],
  ] as const;

  for (const [name, hasPrior] of priorLabour) {
    test(`the last labour progress box ${hasPrior ? 'shows' : 'stays hidden'} ${name}`, async ({ page, api }) => {
      // script :293-450 (ENTER): REST lookup of the visit's Labour Progress encounter
      if (hasPrior) {
        await createLabourProgress(api, ctx.patient.uuid, ctx.visitUuid);
      }
      await openForm(page, ctx);
      await expect(page.locator('#lastOnset')).toBeVisible({ visible: hasPrior });
      await expect(page.locator('#enter_labour_progress')).toBeVisible({ visible: !hasPrior });
      if (hasPrior) {
        await expect(page.locator('#yes_induction')).toHaveText(/\[X\]\s*Yes/);
        await expect(page.locator('#oxy_induction')).toContainText('[X] Oxytocin');
        await expect(page.locator('#last_labor_start_date')).toHaveText(/\d{1,2} \w{3} \d{4}/);
      }
    });
  }

  // ---- validation ----
  test('saving with the required placenta answers blank shows "Required" and saves nothing', async ({ page, api }) => {
    // HFE required="true" on placenta completeness (:989) and placenta abnormality (:1015)
    await openForm(page, ctx);
    expect(await trySave(page)).toBe(false);
    await expect(page.locator('#placentaAbQ .field-error')).toHaveText('Required');
    await expect(page.locator('.field-error:visible', { hasText: /^Required$/ })).toHaveCount(2);
    expect(await getPatientEncounters(api, ctx.patient.uuid)).toHaveLength(0);
  });

  test('placenta abnormality "Yes" with an empty description blocks the save', async ({ page, api }) => {
    // script :465-490
    await openForm(page, ctx);
    await answerPlacenta(page);
    await page.locator('#placentaAbQ input').nth(0).check();
    await expect(page.locator('#placentaAbDesc .field-error')).toBeVisible();
    expect(await trySave(page)).toBe(false);
    expect(await getPatientEncounters(api, ctx.patient.uuid)).toHaveLength(0);
  });

  test('an infant with an outcome needs date, sex, delivery method and all visible measurements', async ({ page, api }) => {
    // script :145-205: choosing an outcome starts the infant's validation
    await openForm(page, ctx);
    await answerPlacenta(page);
    await page.locator('#dead-or-alive-1 input').nth(1).check(); // FSB: weight, length, head circumference (no APGAR)
    await expect(page.locator('#fetus-1 .field-error:visible', { hasText: '*Required' })).toHaveCount(6);
    expect(await trySave(page)).toBe(false);
    expect(await getPatientEncounters(api, ctx.patient.uuid)).toHaveLength(0);
  });

  // V2 (Medium): hasInputFields() (:145) is "all visible inputs filled", also used as "anything entered" (:184, :196).
  // Intended: any entered infant value triggers the required checks. Remove test.fail() when fixed.
  test('an infant with only a birth weight does not save (V2)', async ({ page, api }) => {
    test.fail();
    await openForm(page, ctx);
    await answerPlacenta(page);
    await fillText(page, '#fetus-1 .inputField >> nth=0 >> input', '3');
    expect(await trySave(page)).toBe(false);
    expect(await getPatientEncounters(api, ctx.patient.uuid)).toHaveLength(0);
  });

  // V3 (Medium): MSB only hides #inputFieldsDiv (:233); the typed birth weight is still submitted.
  // Intended: no birth weight on a macerated stillbirth. Remove test.fail() when the hidden inputs are cleared.
  test('a birth weight typed before choosing MSB is not saved (V3)', async ({ page, api }) => {
    test.fail();
    await openForm(page, ctx);
    await answerPlacenta(page);
    await fillText(page, '#fetus-1 .inputField >> nth=0 >> input', '3');
    await page.locator('#dead-or-alive-1 input').nth(2).check(); // MSB
    await setDate(page, '#fetus-1 .fetusDeliveryTime', new Date());
    await page.locator('#fetus-1 .fetusGender input').nth(1).check();
    await page.locator('#fetus-1 .deliveryMethod input').nth(0).check();
    expect(await trySave(page)).toBe(true);
    const encounter = (await getPatientEncounters(api, ctx.patient.uuid))[0];
    const displays = (await getEncounterObs(api, encounter.uuid)).map((o) => o.display.toLowerCase());
    expect(displays.some((d) => d.startsWith('birth weight'))).toBe(false);
  });

  // ---- EDIT ----
  const editCases = [
    ['without its own induced obs the last labour progress box shows', false],
    ['with its own induced obs the box is skipped (includeIf :326)', true],
  ] as const;

  for (const [name, ownObs] of editCases) {
    test(`EDIT: ${name}`, async ({ page, api, createSectionEncounter }) => {
      const section = await createSectionEncounter({
        encounterTypeUuid: LD_ENCOUNTER_TYPE,
        patient: { givenName: 'AutoLabourEdit', familyName: 'Tester', gender: 'F', birthdate: birthdateYearsAgo(25) },
      });
      await createLabourProgress(api, section.patient.uuid, section.encounter.visitUuid);
      if (ownObs) {
        const res = await api.post('obs', {
          data: {
            person: section.patient.uuid,
            encounter: section.encounter.uuid,
            obsDatetime: new Date().toISOString(),
            concept: await conceptUuid(api, 'CIEL:151750'),
            value: await conceptUuid(api, 'CIEL:1066'),
          },
        });
        expect(res.ok(), `obs: ${res.status()}`).toBeTruthy();
      }
      await page.goto(SectionFormPage.editUrl(FORM, section));
      await expect(page.locator(SAVE)).toBeVisible();
      await expect(page.locator('#lastOnset')).toBeVisible({ visible: !ownObs });
    });
  }

  // ---- save ----
  test('saves a delivery with a fresh stillbirth, and moves the Pregnancy program from Antenatal to Delivered', async ({ page, api }) => {
    await enrollPregnancy(api, ctx.patient.uuid);
    await openForm(page, ctx);

    await page.locator('#group input[type=radio]').nth(1).check(); // pregnancy cohort: B (pregnancy-group-widget)
    await page.locator('#induced input').nth(0).check();
    await page.locator('#methodOfInduction input').nth(1).check(); // oxytocin
    await page.getByLabel('Companion present', { exact: true }).check();
    await fillText(page, '.labor_stage_hours >> nth=0 >> input', '2');
    await fillText(page, '.labor_stage_minutes >> nth=0 >> input', '30');
    await fillFetus1(page, 1); // FSB (never Alive: RegisterBabyAction would register a baby patient)
    await answerPlacenta(page);
    await page.locator('#breast input').nth(0).check();
    await page.locator('#birth-attendant input').nth(4).check();
    await fillText(page, '#other-ba input', 'Traditional birth attendant');
    await page.locator('#perineal\\ tear input').nth(1).check(); // 2nd degree
    await page.getByLabel('episiotomy', { exact: true }).check();

    expect(await trySave(page)).toBe(true);

    const encounters = await getPatientEncounters(api, ctx.patient.uuid);
    expect(encounters.map((e) => e.encounterType.uuid)).toEqual([LD_ENCOUNTER_TYPE]);
    const displays = (await getEncounterObs(api, encounters[0].uuid)).map((o) => o.display.toLowerCase());
    for (const expected of ['team b', 'fresh stillbirth', 'oxytocin', 'complete placenta', 'placental abnormality: no', 'birth weight', 'traditional birth attendant', 'episiotomy']) {
      expect(displays.some((d) => d.includes(expected)), expected).toBeTruthy();
    }
    expect(displays.some((d) => d.includes('2nd degree') || d.includes('second degree') || d.includes('perineal')), 'perineal tear').toBeTruthy();

    // PregnancyProgramPostpartumTransitionAction (:23): the open Antenatal state ends and Delivered starts on the delivery date
    const res = await api.get(`programenrollment?patient=${ctx.patient.uuid}&v=custom:(dateCompleted,states:(state:(concept:(display)),endDate))`);
    const enrollments = (await res.json()).results as Array<{ states: Array<{ state: { concept: { display: string } }; endDate: string | null }> }>;
    expect(enrollments).toHaveLength(1);
    const states = Object.fromEntries(enrollments[0].states.map((s) => [s.state.concept.display, s.endDate]));
    expect(states['Delivered']).toBeNull();
    expect(states['Antenatal']).not.toBeNull();

    // the stillborn infant is not registered (RegisterBabyAction): the mother has no relationship
    const rel = await api.get(`relationship?person=${ctx.patient.person.uuid}&v=custom:(uuid)`);
    expect((await rel.json()).results).toHaveLength(0);
    // VIEW: every saved value is shown, the coded answers with the form's own labels (answerLabels)
    const view = await expectViewShowsSavedObs(page, api, FORM, encounters[0].uuid, {
      'Delivery order number: 1': '', // hidden birth-order marker
      'Antenatal and postnatal care team: Team B': '[X] B',
      'Method of labor induction: Administration of oxytocin': '[X] Oxytocin',
      'Child gender: Female': '[X] F',
      'Qualitative birth outcome: Fresh stillbirth': '[X] FSB',
      'Perineal tear: Perineal laceration, second degree': '[X] 2nd degree',
      'Patient referred or escorted: Patient escorted': '[X] Companion present',
      'Patient exists in EMR: Not applicable': '[X] Do not register', // the radio the script set (:52) and beforeSubmit saved
      'Visual examination of placenta completeness: Complete placenta at delivery': '[X] Complete',
    });
    const at = (selector: string) => view.page.locator(`${selector} .value`);
    await expect(at('#group')).toHaveText('[X] B');
    await expect(at('#induced')).toHaveText('[X] yes');
    await expect(at('#methodOfInduction')).toHaveText('[X] Oxytocin');
    await expect(at('.labor_stage_hours').first()).toHaveText('2');
    await expect(at('.labor_stage_minutes').first()).toHaveText('30');
    await expect(at('#totalDuration_hours')).toHaveText('2'); // the total is a saved obs, not recomputed in VIEW
    await expect(at('#totalDuration_minutes')).toHaveText('30');
    await expect(at('#dead-or-alive-1')).toHaveText('[X] FSB');
    await expect(at('#fetus-1 .fetusDeliveryTime')).toHaveText([/^\d{2} [A-Z][a-z]{2} \d{4}$/, /^\d{1,2}:\d{2} (AM|PM)$/]); // date and time shown apart
    await expect(at('#fetus-1 .fetusGender')).toHaveText('[X] F');
    await expect(at('#fetus-1 .deliveryMethod')).toHaveText('[X] Spontaneous vaginal delivery');
    await expect(at('#fetus-1 .inputField')).toHaveText(['2', '2', '2']); // weight, length, head circumference (FSB: no APGAR)
    await expect(at('#fetus-1 #apgarDiv')).toHaveCount(0);
    await expect(at('#register-baby-1')).toHaveText('[X] Do not register');
    await expect(at('#placentaAbQ')).toHaveText('[X] no');
    await expect(at('#placentaAbDesc')).toHaveCount(0);
    await expect(at('#breast')).toHaveText('[X] yes');
    await expect(at('#other-ba')).toHaveText('Traditional birth attendant');
    await expect(at('[id="perineal tear"]')).toHaveText('[X] 2nd degree');
    // not filled: the other two infants, uterotonic and the breastfeeding/uterotonic times, the rapid tests, PHQ-2, perineum comments
    await expect(view.page.locator('#fetus-2 .value, #fetus-3 .value')).toHaveCount(0);
    await expect(view.page.locator('#uterotonic .value, #breastDate .value, #uteroDate .value')).toHaveCount(0);
    await expect(view.page.locator('#rapid-tests-widget .value, #mh-phq2 .value, #perineum .value, #labourStartDateTime .value')).toHaveCount(0);
    await expect(view.page.locator('#buttons')).toHaveCount(0); // ifMode VIEW include=false :1226
  });

  // Twins, both fresh stillbirths (an Alive infant would register a baby patient): infant 1 is a girl with 2 in every measurement, infant 2 a boy with 3.
  const fillFetus = async (page: Page, n: number, genderIndex: number, size: string) => {
    await page.locator(`#dead-or-alive-${n} input`).nth(1).check(); // FSB
    await setDate(page, `#fetus-${n} .fetusDeliveryTime`, new Date());
    await page.locator(`#fetus-${n} .fetusGender input`).nth(genderIndex).check();
    await page.locator(`#fetus-${n} .deliveryMethod input`).nth(0).check();
    const inputs = page.locator(`#fetus-${n} .inputField input`);
    for (let i = 0; i < (await inputs.count()); i++) {
      if (await inputs.nth(i).isVisible()) {
        await fillText(page, `#fetus-${n} .inputField >> nth=${i} >> input`, size);
      }
    }
  };

  test('VIEW: twins show infant 1 and infant 2 each with their own values', async ({ page, api }) => {
    await openForm(page, ctx);
    await page.locator('#group input[type=radio]').nth(1).check();
    await page.locator('#show-more-fetus-button').click();
    await fillFetus(page, 1, 1, '2');
    await fillFetus(page, 2, 0, '3');
    await answerPlacenta(page);
    expect(await trySave(page)).toBe(true);

    const [encounter] = await getPatientEncounters(api, ctx.patient.uuid);
    const view = await expectViewShowsSavedObs(page, api, FORM, encounter.uuid, {
      'Delivery order number: 1': '', // hidden birth-order marker
      'Antenatal and postnatal care team: Team B': '[X] B',
      'Child gender: Female': '[X] F',
      'Child gender: Male': '[X] M',
      'Qualitative birth outcome: Fresh stillbirth': '[X] FSB',
      'Patient exists in EMR: Not applicable': '[X] Do not register',
      'Visual examination of placenta completeness: Complete placenta at delivery': '[X] Complete',
    });
    const at = (selector: string) => view.page.locator(`${selector} .value`);
    await expect(at('#fetus-1 .fetusGender')).toHaveText('[X] F');
    await expect(at('#fetus-1 .inputField')).toHaveText(['2', '2', '2']);
    await expect(at('#fetus-2 .fetusGender')).toHaveText('[X] M');
    await expect(at('#fetus-2 .inputField')).toHaveText(['3', '3', '3']);
    await expect(view.page.locator('#fetus-3 .value')).toHaveCount(0);
  });
});
