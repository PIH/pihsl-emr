import { type Page } from '@playwright/test';
import { test, expect, birthdateYearsAgo, type SectionEncounter, type SectionEncounterOptions } from '../../core';
import { NCD_INITIAL_ENCOUNTER_TYPE_UUID, OUTPATIENT_INITIAL_ENCOUNTER_TYPE_UUID } from '../../core/constants';
import { getEncounterObs } from '../../commands';
import { SectionFormPage, expectViewShowsSavedObs } from '../../pages';

// section-history.xml: history of an outpatient initial encounter (chief complaint, presenting history, family and past
// medical history, blood type, hospitalizations, medications). On the visit page it hangs only under Outpatient initial
// (documentation/_availability.e2e.md); the specs open the form URL directly, so that gating is not exercised. The
// includeIf branches below are for other encounter types (NCD initial, Haiti primary-care adult), so they are tested
// with those fixtures, created over REST like the outpatient one.
//
// Conditions in the form, from documentation inventory (section-history.inv.md):
//   ifMode VIEW include=false  :51, :58, :119, :615  style, script, h1 and #buttons in ENTER/EDIT only
//   includeIf age>13 && F      :272   Pregnant / Lactating past-history items (age at the encounter date)
//   includeIf NCD initial      :144, :302, :374   referral section, habits section, sexual-activities/family-planning section
//   includeIf NCD initial      :279   extra HIV / gestational hypertension / sickle cell past-history items
//   includeIf primary-care adult initial or followup  :351   "sexually active" + family planning method section
//   includeIf gender F (NCD)   :378   Pregnant checkbox
//   toggle CIEL:5272           :381   Pregnant ticks shows #pregnant (LMP, EDD)
//   toggle {id,style:dim}      :442   family-planning method ticked enables/undims its start/end dates (repeat of 8 methods)
//
// Script (:59-116, jq(function) on load, ENTER/EDIT only): validateFamHistoryText runs on change of the checkbox / text
//   inputs of every .medicalHistoryText row (Cancer, Other family history; Surgery, Trauma, STI, Congenital malformation,
//   Other past history): text without a ticked relative / box -> "Select family member(s)" (family) or the
//   checkWithoutComments message (past history); a ticked relative / box without text -> "Please specify". The same
//   check runs in beforeSubmit and blocks the save. setUpNextAndSubmitButtons() wires #next / #submit (see _shared).
// Side effects on save: none (no program enrollment, orders or post-submission action).
// EDIT is covered by the NCD Pregnant round-trip; VIEW by that test (the Pregnant tick) and by the last test (the saved items only,
//   nothing for the rest).
// EDIT is covered by the NCD Pregnant round-trip; VIEW by that test (the Pregnant tick) and by the last test (the saved items only,
//   nothing for the rest).
// Not covered here: the hospitalization table, current medications, diagnostic tests and the other NCD-only fields (plain obs).
//
// Findings:
//   V1 Medium :442  toggle id/class "{comment}-date" is "Tubal ligation-date": the space makes it two classes, so the
//                   selector matches nothing and the Tubal ligation start/end dates are never dimmed or disabled (the
//                   other seven methods are). Same root cause for id="Tubal ligation-fp" (:438). Fix: use a space-free
//                   token (e.g. tubal-ligation) for the id/class. TESTED below (test.fixme).
//   V2 Low    :256, :280, :282  under NCD initial, HIV (CIEL:138405 twice) and Sickle cell disease (:251 "PIH:
//                   Sickle-Cell Anemia" and :282 CIEL:117703, both concept 498) each render as two past-history
//                   checkboxes bound to the same concept. Fix: drop :280 and :282.
//   V3 Low    :134, :145  two sections with id="complaint" under NCD initial (the first is the presenting history).
//   V4 Info   :144-:375  the NCD-initial and primary-care branches are not reachable from the visit page in Sierra Leone
//                   (NCD initial uses section-ncd-history; the primary-care types are Haiti types).

type CreateSection = (o: SectionEncounterOptions) => Promise<SectionEncounter>;
const FORM = 'section-history.xml';
// ENCOUNTERTYPE_PRIMARY_CARE_ADULT_INITIAL_CONSULT_UUID / _FOLLOWUP_ in PihEmrConfigConstants (:351)
const PRIMARY_CARE_ADULT_INITIAL_UUID = '27d3a180-031b-11e6-a837-0800200c9a66';
const PRIMARY_CARE_ADULT_FOLLOWUP_UUID = '27d3a181-031b-11e6-a837-0800200c9a66';

interface Fixture {
  encounterTypeUuid: string;
  gender: 'M' | 'F';
  age: number;
}
const OPD_F30: Fixture = { encounterTypeUuid: OUTPATIENT_INITIAL_ENCOUNTER_TYPE_UUID, gender: 'F', age: 30 };
const NCD_F30: Fixture = { encounterTypeUuid: NCD_INITIAL_ENCOUNTER_TYPE_UUID, gender: 'F', age: 30 };

test.describe('section-history', () => {
  let section: SectionEncounter;

  const open = async (page: Page, createSectionEncounter: CreateSection, f: Fixture) => {
    section = await createSectionEncounter({
      encounterTypeUuid: f.encounterTypeUuid,
      patient: { givenName: 'AutoHist', familyName: 'Tester', gender: f.gender, birthdate: birthdateYearsAgo(f.age) },
    });
    await SectionFormPage.openEdit(page, FORM, section);
  };
  const pastItem = (page: Page, name: string) => page.locator('.past-medical-history-item', { hasText: name });
  const famRow = (page: Page, id: string) => page.locator(`#${id}`);
  const stayed = async (page: Page) => {
    await page.locator('#submit').click();
    await expect(page.locator('#submit')).toBeVisible();
    await expect(page).not.toHaveURL(/referenceapplication\/home\.page/);
  };

  test('EDIT shows the heading and the Next/Save/Cancel buttons', async ({ page, createSectionEncounter }) => {
    // ifMode VIEW include=false :119, :615
    await open(page, createSectionEncounter, OPD_F30);
    await expect(page.locator('#htmlform h1')).toBeVisible();
    await expect(page.locator('#next')).toBeVisible();
    await expect(page.locator('#submit')).toBeVisible();
    await expect(page.locator('#cancel')).toBeVisible();
  });

  for (const [label, f, shown] of [
    ['a woman over 13', OPD_F30, true],
    ['a man', { ...OPD_F30, gender: 'M' as const }, false],
    ['a girl of 10', { ...OPD_F30, age: 10 }, false],
  ] as const) {
    test(`Pregnant / Lactating past-history items for ${label}: ${shown ? 'shown' : 'hidden'}`, async ({
      page,
      createSectionEncounter,
    }) => {
      // includeIf :272
      await open(page, createSectionEncounter, f);
      await expect(pastItem(page, 'Pregnant')).toHaveCount(shown ? 1 : 0);
      await expect(pastItem(page, 'Lactating')).toHaveCount(shown ? 1 : 0);
    });
  }

  for (const [label, f, expected] of [
    ['outpatient initial', OPD_F30, { ncd: false, primary: false }],
    ['NCD initial', NCD_F30, { ncd: true, primary: false }],
    ['primary-care adult initial', { ...OPD_F30, encounterTypeUuid: PRIMARY_CARE_ADULT_INITIAL_UUID }, { ncd: false, primary: true }],
    ['primary-care adult followup', { ...OPD_F30, encounterTypeUuid: PRIMARY_CARE_ADULT_FOLLOWUP_UUID }, { ncd: false, primary: true }],
  ] as const) {
    test(`encounter-type sections under ${label}`, async ({ page, createSectionEncounter }) => {
      // includeIf :144, :279, :302, :374 (NCD initial) and :351 (primary-care adult)
      await open(page, createSectionEncounter, f);
      const form = page.locator('#htmlform');
      const check = async (text: string | RegExp, present: boolean) => {
        if (present) {
          await expect(form).toContainText(text);
        } else {
          await expect(form).not.toContainText(text);
        }
      };
      await check('Date of referral', expected.ncd);
      await check('Smokes tobacco?', expected.ncd);
      await expect(pastItem(page, 'Gestational hypertension')).toHaveCount(expected.ncd ? 1 : 0);
      await expect(page.locator('#sexual-activities')).toHaveCount(expected.ncd || expected.primary ? 1 : 0);
      if (expected.primary) {
        await expect(page.locator('#sexual-activities')).toContainText(/sexually active/i);
      } else {
        await expect(form).not.toContainText(/sexually active/i);
      }
    });
  }

  test('NCD initial: the Pregnant checkbox shows #pregnant and is saved ticked on reopen (EDIT) and shown in VIEW', async ({
    page,
    createSectionEncounter,
    api,
  }) => {
    // toggle :381; includeIf F :378
    await open(page, createSectionEncounter, NCD_F30);
    const pregnant = page.locator('#pregnant');
    const box = page.locator('#sexual-activities').getByLabel('Pregnant');
    await expect(pregnant).toBeHidden();
    await box.check();
    await expect(pregnant).toBeVisible();
    await box.uncheck();
    await expect(pregnant).toBeHidden();
    await box.check();
    await page.locator('#submit').click();
    await expect(page).toHaveURL(/referenceapplication\/home\.page/);

    await SectionFormPage.openEdit(page, FORM, section);
    await expect(page.locator('#sexual-activities').getByLabel('Pregnant')).toBeChecked();
    await expect(page.locator('#pregnant')).toBeVisible();

    // VIEW: the ticked Pregnant is shown in the sexual-activities section, and no family-planning method is
    const view = await expectViewShowsSavedObs(page, api, FORM, section.encounter.uuid, { 'Pregnancy status: Yes': '[X] Pregnant' });
    await expect(view.page.locator('#sexual-activities .value')).toHaveText(['[X] Pregnant']);
    await expect(view.page.locator('[id="Pill-fp"] .value')).toHaveCount(0);
  });

  test('NCD initial: a man has no Pregnant checkbox', async ({ page, createSectionEncounter }) => {
    // includeIf :378
    await open(page, createSectionEncounter, { ...NCD_F30, gender: 'M' });
    await expect(page.locator('#sexual-activities')).toBeVisible();
    await expect(page.locator('#sexual-activities').getByLabel('Pregnant')).toHaveCount(0);
  });

  test('NCD initial: ticking a family-planning method enables its dates (Pill)', async ({
    page,
    createSectionEncounter,
  }) => {
    // toggle dim :442 (works for Pill; Tubal ligation is V1 below)
    await open(page, createSectionEncounter, NCD_F30);
    const dates = page.locator('tr', { has: page.locator('[id="Pill-fp"]') }).locator('input.hasDatepicker');
    await expect(dates.first()).toBeDisabled();
    await page.locator('[id="Pill-fp"] input[type=checkbox]').check();
    await expect(dates.first()).toBeEnabled();
    await page.locator('[id="Pill-fp"] input[type=checkbox]').uncheck();
    await expect(dates.first()).toBeDisabled();
  });

  // V1 (Medium): "Tubal ligation-date" is two class names, so the dim toggle finds no target and the dates are always
  // enabled. Intended behaviour: disabled until the method is ticked. Remove test.fixme() when the id/class is fixed.
  test('Tubal ligation dates are disabled until the method is ticked (V1)', async ({ page, createSectionEncounter }) => {
    test.fixme();
    await open(page, createSectionEncounter, NCD_F30);
    const dates = page.locator('tr', { has: page.locator('[id="Tubal ligation-fp"]') }).locator('input.hasDatepicker');
    await expect(dates.first()).toBeDisabled();
    await page.locator('[id="Tubal ligation-fp"] input[type=checkbox]').check();
    await expect(dates.first()).toBeEnabled();
  });

  test('family history: text and relatives must go together', async ({ page, createSectionEncounter }) => {
    // js :59-116 (family rows)
    await open(page, createSectionEncounter, OPD_F30);
    const cancer = famRow(page, 'familyCancer');
    const error = cancer.locator('.field-error');
    await cancer.locator('input[type=text]').fill('Lung');
    await cancer.locator('input[type=text]').blur();
    await expect(error).toHaveText('Select family member(s)');
    await cancer.getByLabel('Father').check();
    await expect(error).toBeHidden();

    const other = famRow(page, 'familyOther');
    await other.getByLabel('Mother').check();
    await expect(other.locator('.field-error')).toHaveText('Please specify');
    await other.locator('input[type=text]').fill('Glaucoma');
    await other.locator('input[type=text]').blur();
    await expect(other.locator('.field-error')).toBeHidden();
  });

  test('past history: Surgery / Trauma / STI / Congenital / Other need a box and text together', async ({
    page,
    createSectionEncounter,
  }) => {
    // js :59-116 (patientHistory rows)
    await open(page, createSectionEncounter, OPD_F30);
    for (const name of ['Surgery', 'Trauma', 'STI', 'Congenital malformation', 'Other']) {
      const row = pastItem(page, name).filter({ has: page.locator('input[type=text]') });
      await row.locator('input[type=checkbox]').check();
      await expect(row.locator('.field-error'), name).toHaveText('Please specify');
      await row.locator('input[type=text]').fill('x');
      await row.locator('input[type=text]').blur();
      await expect(row.locator('.field-error'), name).toBeHidden();
      await row.locator('input[type=checkbox]').uncheck();
      await expect(row.locator('.field-error'), name).toBeVisible();
      await row.locator('input[type=text]').fill('');
      await row.locator('input[type=text]').blur();
      await expect(row.locator('.field-error'), name).toBeHidden();
    }
  });

  test('a row with text but no relative blocks the save', async ({ page, createSectionEncounter, api }) => {
    // beforeSubmit :102-109
    await open(page, createSectionEncounter, OPD_F30);
    await page.locator('#chief-complaint textarea').fill('Cough');
    await famRow(page, 'familyCancer').locator('input[type=text]').fill('Lung');
    await stayed(page);
    await expect(famRow(page, 'familyCancer').locator('.field-error')).toBeVisible();
    expect(await getEncounterObs(api, section.encounter.uuid)).toHaveLength(0);
  });

  test('saves complaint, history, family and past history, and blood type', async ({
    page,
    createSectionEncounter,
    api,
  }) => {
    await open(page, createSectionEncounter, OPD_F30);
    await page.locator('#chief-complaint textarea').fill('Cough for two weeks');
    await page.locator('#presenting-history textarea').fill('Worse at night');
    await page.locator('.family-history-item', { hasText: 'Asthma' }).getByLabel('Mother').check();
    await pastItem(page, 'Malaria').locator('input[type=checkbox]').check();
    const surgery = pastItem(page, 'Surgery').filter({ has: page.locator('input[type=text]') });
    await surgery.locator('input[type=checkbox]').check();
    await surgery.locator('input[type=text]').fill('Appendectomy');
    await page.getByLabel('A+', { exact: true }).check();

    await page.locator('#submit').click();
    await expect(page).toHaveURL(/referenceapplication\/home\.page/);

    const displays = (await getEncounterObs(api, section.encounter.uuid)).map((o) => o.display.toLowerCase());
    const has = (s: string) => displays.some((d) => d.includes(s));
    expect(has('chief complaint (text): cough for two weeks')).toBeTruthy();
    expect(has('presenting history: worse at night')).toBeTruthy();
    // the order of the answers inside a display varies between runs
    const hasAll = (prefix: string, ...parts: string[]) =>
      displays.some((d) => d.startsWith(prefix) && parts.every((p) => d.includes(p)));
    expect(hasAll("patient's family history list:", 'mother', 'asthma')).toBeTruthy();
    expect(hasAll('past medical history:', 'malaria', 'yes')).toBeTruthy();
    expect(hasAll('past medical history:', 'surgery', 'appendectomy', 'yes')).toBeTruthy();
    expect(has('blood group: a+')).toBeTruthy();

    // VIEW: each ticked item is shown by its own label (the coded "Yes" answers are written by the form's tags and a ticked item shows as
    // "[X] label", so they are looked for by that); items that were not ticked hold no value.
    const view = await expectViewShowsSavedObs(page, api, FORM, section.encounter.uuid, {
      'Sign/symptom present: Yes': '[X]',
      'Family history diagnosis: Asthma': '[X] Mother', // the diagnosis is the row's static label; its value is the ticked relative
    });
    const v = view.page;
    await expect(v.locator('#chief-complaint .value')).toHaveText('Cough for two weeks');
    await expect(v.locator('#presenting-history .value')).toHaveText('Worse at night');
    const asthma = v.locator('.family-history-item', { hasText: 'Asthma' });
    await expect(asthma).toHaveCount(1);
    await expect(asthma.locator('.value')).toHaveText(['[X] Mother']);
    await expect(v.locator('.family-history-item', { hasText: 'Heart disease' }).locator('.value')).toHaveCount(0);
    await expect(v.locator('#familyCancer .value, #familyOther .value')).toHaveCount(0);
    await expect(pastItem(v, 'Malaria').locator('.value')).toHaveText(['[X] Malaria']);
    await expect(pastItem(v, 'Surgery').filter({ has: v.locator('.value') }).locator('.value')).toHaveText(['[X] Surgery', 'Appendectomy']);
    await expect(pastItem(v, 'Trauma').locator('.value')).toHaveCount(0);
    await expect(v.locator('#patient-history .value')).toHaveCount(3);
    expect((await view.valueTexts()).filter((t) => /^\[X\] (A|B|AB|O)[+-]$/.test(t))).toEqual(['[X] A+']); // blood group: only the chosen one
  });
});
