import type { APIRequestContext, Page } from '@playwright/test';
import { test, expect, birthdateYearsAgo, type EntryContext } from '../../core';
import { MCH_OPD_LOCATION_UUID } from '../../core/constants';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import { EntryFormPage } from '../../pages';

// postpartumDailyProgress.xml: "Postpartum Daily Progress" (vitals, delivery overview, postpartum exam, mood/bowel/urine checklist,
// PHQ-2, family planning, health education, summary). The specs open enterHtmlFormWithStandardUi inside a visit they create with a
// 25-year-old female (documentation/_availability.e2e.md: enableMCOEForms, enterMCH, Postnatal Location session tag, female >= 10), so
// the app-loader gating is not exercised. The session location (MCH OPD) has no Postnatal Location tag, so every save picks
// "Postnatal Ward" in the location select. The form ends with <submit> (no #submit: use #buttons input.submitButton).
//
// Conditions in the form, from documentation inventory (postpartumDailyProgress.inv.md):
//   ifMode VIEW include=false :31,:75,:207,:234,:713  scripts, heading, "Overview" section (with "days since delivery"), buttons: ENTER/EDIT only
//   ifMode VIEW include=true  :67   VIEW only: show #csWoundStatus
//   when involution = abnormal :329       show #abnormal-involution
//   when complication = Postpartum haemorrhage :384  show #postpart-treatments;  = Other :391  show #otherPostpartComp
//   when accepts family planning = Yes :586   show #family-method
//   when method (one <when> per method checkbox) :605   Condoms -> #condom-count, IUD -> #iud-date, Implant -> #implant-date;
//        the other seven methods point to #fp-method-noop, which does not exist (V1)
// Sub-forms (behaviour in documentation/_shared.e2e.md): encounter-provider-location-date, vital-signs-widget (+ .js scoring, FHR),
// pregnancy-group-widget (read-only here, $pregGroupViewOnly), mental-health-phq2. Duplicate id="when" (:243): see _shared V10.
//
// Scripts:
//   :32-58   normal/abnormal exclusion for .normalObs/.abnormalObs inside .exam, then setUpNextAndSubmitButtons(); nothing in the form has
//            those classes (V2).
//   :68-72   VIEW only.
//   :76-193  ENTER/EDIT: REST lookup of a Labour and Delivery encounter in the same visit (before the encounter date + 2 days): fills
//            #timeOfDelivery and #typeOfDelivery from its "Newborn details" group (PIH:5599, PIH:11663) and shows #csWoundStatus when
//            the delivery was by caesarean (tested). In EDIT it also shows #csWoundStatus when one of its boxes is ticked.
// Side effects on save: PregnancyProgramPostpartumTransitionAction (:21): the open Antenatal state of the Pregnancy program ends and Delivered
// starts (tested); with no enrolment it enrols the patient in Delivered (observed).
// Not covered here: VIEW/EDIT, vitals scoring and PHQ-2 (shared), the pregnancy-group, FHR hiding by session location.
//
// Findings:
//   V1 Low :610-619    seven family-planning <when>s target #fp-method-noop, which is not in the form (no-op, harmless).
//   V2 Low :35-58      the .normalObs/.abnormalObs mutual-exclusion handlers are dead code (copied from the exam forms): no such classes here.
//   V3 Low :141-142    the L&D box ids #lastOnset and #enter_labour_progress (copied from laborDeliverySummary) do not exist here.
//   V4 Low :407        PPH treatment checkboxes carry ttanswerCode (typo for answerCode), so the labels fall back to the concept names
//                      ("Bimanual uterine massage", "Intrauterine tamponade with Bakri balloon") instead of the intended tName.
//   V5 Low :497        conceptId="CIEL:167099<TAB>" has a trailing tab (resolves today, fragile).

const FORM = 'postpartumDailyProgress.xml';
const LD_ENCOUNTER_TYPE = 'fec2cc56-e35f-42e1-8ae3-017142c1ca59';
const PREGNANCY_PROGRAM = '6a5713c2-3fd5-46e7-8f25-36a0f7871e12';
const ANTENATAL_STATE = 'a83896bf-9094-4a3c-b843-e75509a52b32';
const SAVE = '#buttons input.submitButton';

const openForm = async (page: Page, context: EntryContext) => {
  await EntryFormPage.open(page, FORM, context);
  await expect(page.locator(SAVE)).toBeVisible(); // handlers are bound on document.ready
  await page.locator('#encounterLocation select').selectOption({ label: 'Postnatal Ward' });
};

const fillText = async (page: Page, selector: string, value: string) => {
  await page.locator(selector).fill(value);
  await page.keyboard.press('Tab');
};

const conceptUuid = async (api: APIRequestContext, ref: string): Promise<string> => {
  const res = await api.get(`concept/${ref}?v=custom:(uuid)`);
  expect(res.ok(), `concept ${ref}: ${res.status()}`).toBeTruthy();
  return (await res.json()).uuid;
};

// A Labour and Delivery encounter in the visit with a "Newborn details" group (type of delivery, date of confinement).
const createDelivery = async (api: APIRequestContext, ctx: EntryContext, methodRef: string) => {
  const now = new Date().toISOString();
  const res = await api.post('encounter', {
    data: {
      patient: ctx.patient.uuid,
      encounterType: LD_ENCOUNTER_TYPE,
      location: MCH_OPD_LOCATION_UUID,
      encounterDatetime: now,
      visit: ctx.visitUuid,
      obs: [
        {
          concept: await conceptUuid(api, 'CIEL:1585'),
          groupMembers: [
            { concept: await conceptUuid(api, 'PIH:11663'), value: await conceptUuid(api, methodRef) },
            { concept: await conceptUuid(api, 'PIH:5599'), value: now },
          ],
        },
      ],
    },
  });
  expect(res.ok(), `delivery: ${res.status()}`).toBeTruthy();
};

test.describe('postpartumDailyProgress', () => {
  let ctx: EntryContext;

  test.beforeEach(async ({ createEntryContext }) => {
    ctx = await createEntryContext({ givenName: 'AutoPostpartum', familyName: 'Tester', gender: 'F', birthdate: birthdateYearsAgo(25) });
  });

  test('ENTER shows the Overview section (days since delivery) and the Save/Cancel buttons', async ({ page }) => {
    // ifMode VIEW include=false :234 (Overview with CIEL:1879), :713 (buttons); the pregnancy group is read-only here
    await openForm(page, ctx);
    await expect(page.locator('#Overview')).toBeVisible();
    await expect(page.locator('#Overview .small input')).toBeVisible();
    await expect(page.locator('#Overview input[type=radio]')).toHaveCount(0);
    await expect(page.locator('#buttons .cancel')).toBeVisible();
  });

  // ---- conditional display ----
  const whens = [
    // [name, "on" locator, "off" locator (null: uncheck the "on" checkbox), target]
    ['uterus involution abnormal (:329)', '#involution input >> nth=1', '#involution input >> nth=0', '#abnormal-involution'],
    ['complication Postpartum haemorrhage (:384)', '#compl-230 input[type=checkbox]', null, '#postpart-treatments'],
    ['complication Other (:391)', '#compl-other input[type=checkbox]', null, '#otherPostpartComp'],
    ['accepts family planning (:586)', '#accepts-fp input >> nth=0', '#accepts-fp input >> nth=1', '#family-method'],
  ] as const;

  for (const [name, on, off, target] of whens) {
    test(`${name}: ${target} shows for the trigger answer only`, async ({ page }) => {
      await openForm(page, ctx);
      await expect(page.locator(target)).toBeHidden();
      await page.locator(on).check();
      await expect(page.locator(target)).toBeVisible();
      if (off) {
        await page.locator(off).check();
      } else {
        await page.locator(on).uncheck();
      }
      await expect(page.locator(target)).toBeHidden();
    });
  }

  // when :605: every method checkbox has its own <when>; the three detail blocks have one controller each
  const methods = [
    ['Combined oral contraceptive (COC)', null],
    ['Progestin-only pill (POP)', null],
    ['Natural (Rhythm)', null],
    ['Condoms', '#condom-count'],
    ['Depo-provera', null],
    ['Sayana press', null],
    ['IUD', '#iud-date'],
    ['Implant', '#implant-date'],
    ['Tubal ligation', null],
    ['Exclusive breastfeeding (requires a secondary method)', null],
  ] as const;

  test('each family planning method shows its own detail block (condoms, IUD, implant) or none', async ({ page }) => {
    await openForm(page, ctx);
    await page.locator('#accepts-fp input').nth(0).check();
    const blocks = ['#condom-count', '#iud-date', '#implant-date'];
    for (const [label, block] of methods) {
      const box = page.locator('#family-method').getByLabel(label, { exact: true });
      await box.check();
      for (const b of blocks) {
        await expect(page.locator(b), `${label} -> ${b}`).toBeVisible({ visible: b === block });
      }
      await box.uncheck();
      for (const b of blocks) {
        await expect(page.locator(b)).toBeHidden();
      }
    }
  });

  test('ticking another method after Implant keeps the implant date visible', async ({ page }) => {
    // :605: unlike section-postnatal-followup V1, each checkbox here controls only its own block
    await openForm(page, ctx);
    await page.locator('#accepts-fp input').nth(0).check();
    await page.locator('#family-method').getByLabel('Implant', { exact: true }).check();
    await page.locator('#family-method').getByLabel('Combined oral contraceptive (COC)', { exact: true }).check();
    await expect(page.locator('#implant-date')).toBeVisible();
  });

  // ---- scripts ----
  const deliveries = [
    ['no Labour and Delivery encounter in the visit', null, '', false],
    ['a vaginal delivery', 'CIEL:1170', 'Spontaneous vaginal delivery', false],
    ['a caesarean delivery', 'CIEL:155884', 'Delivery by cesarean section', true],
  ] as const;

  for (const [name, methodRef, typeText, csWound] of deliveries) {
    test(`script :76-193 with ${name}: delivery overview and C/S wound status`, async ({ page, api }) => {
      if (methodRef) {
        await createDelivery(api, ctx, methodRef);
      }
      await openForm(page, ctx);
      await expect(page.locator('#csWoundStatus')).toBeVisible({ visible: csWound });
      if (methodRef) {
        await expect(page.locator('#typeOfDelivery')).toHaveText(typeText);
        await expect(page.locator('#timeOfDelivery')).toHaveText(/\d{1,2}\/\d{1,2}\/\d{4}/);
      } else {
        await expect(page.locator('#typeOfDelivery')).toBeEmpty();
        await expect(page.locator('#timeOfDelivery')).toBeEmpty();
      }
    });
  }

  // ---- save ----
  test('saves the postpartum exam and family planning, and moves the Pregnancy program from Antenatal to Delivered', async ({ page, api }) => {
    const start = new Date(Date.now() - 30 * 86400000).toISOString();
    const enroll = await api.post('programenrollment', {
      data: { patient: ctx.patient.uuid, program: PREGNANCY_PROGRAM, dateEnrolled: start, states: [{ state: ANTENATAL_STATE, startDate: start }] },
    });
    expect(enroll.ok(), `enroll: ${enroll.status()}`).toBeTruthy();

    await openForm(page, ctx);
    await page.getByLabel('Lochia rubra', { exact: true }).check();
    await page.locator('#involution input').nth(1).check();
    await fillText(page, '#abnormal-involution input', '3');
    await page.locator('#compl-230 input[type=checkbox]').check();
    await page.locator('#postpart-treatments').getByLabel('Oxytocin', { exact: true }).check();
    await page.locator('#accepts-fp input').nth(0).check();
    await page.locator('#family-method').getByLabel('Condoms', { exact: true }).check();
    await fillText(page, '#condom-count input >> nth=0', '5');
    await page.locator('#outcome-condition input').nth(0).check(); // Satisfactory
    await page.locator(SAVE).click();
    await expect(page).toHaveURL(/referenceapplication\/home\.page\?encounterId=/);

    const encounters = await getPatientEncounters(api, ctx.patient.uuid);
    expect(encounters).toHaveLength(1);
    const displays = (await getEncounterObs(api, encounters[0].uuid)).map((o) => o.display.toLowerCase());
    for (const expected of [
      'lochia rubra',
      'involution of uterus: abnormal',
      'involution (cm): 3',
      'postpartum hemorrhage',
      'oxytocin',
      'method of family planning: condoms',
      'number of female condoms: 5',
      'overall condition: satisfactory',
    ]) {
      expect(displays.some((d) => d.includes(expected)), expected).toBeTruthy();
    }

    // PregnancyProgramPostpartumTransitionAction (:21)
    const res = await api.get(`programenrollment?patient=${ctx.patient.uuid}&v=custom:(states:(state:(concept:(display)),endDate))`);
    const enrollments = (await res.json()).results as Array<{ states: Array<{ state: { concept: { display: string } }; endDate: string | null }> }>;
    expect(enrollments).toHaveLength(1);
    const states = Object.fromEntries(enrollments[0].states.map((s) => [s.state.concept.display, s.endDate]));
    expect(states['Delivered']).toBeNull();
    expect(states['Antenatal']).not.toBeNull();
  });
});
