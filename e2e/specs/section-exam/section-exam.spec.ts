import { type Locator, type Page } from '@playwright/test';
import { test, expect, birthdateYearsAgo, type SectionEncounter, type SectionEncounterOptions } from '../../core';
import { OUTPATIENT_INITIAL_ENCOUNTER_TYPE_UUID } from '../../core/constants';
import { getEncounterObs } from '../../commands';
import { SectionFormPage } from '../../pages';

// section-exam.xml: physical exam of the outpatient encounter (11 body-system blocks of Normal / abnormal findings plus a
// Pediatric Assessment block). Under the Outpatient initial type it hangs next to section-history; it is also used for the
// NCD and primary-care encounter types. The specs open the form URL directly, so the visit-page gating is not exercised
// (documentation/_availability.e2e.md). Fixtures: outpatient initial for patients of different age/gender, and the Haiti
// primary-care peds types for the encounter-type branch.
//
// Conditions in the form, from documentation inventory (section-exam.inv.md):
//   ifMode VIEW include=false  :21, :64, :543  layout style, h3 + script, #buttons in ENTER/EDIT only
//   ifMode VIEW include=true   :36, :105       VIEW-only style and hideIfEmpty(".section-container") (not covered)
//   includeIf age>13 && F      :368   "Chronic pelvic pain" in the Urogenital block (age at the encounter date)
//   includeIf peds             :446   Pediatric Assessment block (gross/fine motor, language, social) when the encounter type is
//                                     primary-care peds initial or followup, or $patient.age < 12 (age today)
//
// Script (:69-102, ENTER/EDIT): inside each .exam block, ticking a .normalObs checkbox unticks that block's .abnormalObs
//   checkboxes, and ticking an abnormal one unticks Normal (handlers on change, prop only; the other blocks are untouched).
//   Duration / Units (:126-127) are .abnormalObs but are not checkboxes, so Normal does not clear them. Then
//   setUpNextAndSubmitButtons() (see _shared.e2e.md). :105-109 hideIfEmpty runs in VIEW only.
// Side effects on save: none (obs only).
// Not covered here: VIEW mode (REST-created encounters have no form; hideIfEmpty); the free-text comment fields and the
//   "Other" comment fields of each block (plain obs).
//
// Findings:
//   V1 Low  :126-127  ticking Normal in the General block unticks "Weight loss" but leaves its Duration / Units filled; the
//                     saved obsgroup then holds a duration for a finding that is no longer ticked. Fix: clear them too.
//   V2 Low  :303      "Tachypneic" in the Pulmonary block is saved as an answer of GENERAL EXAM FINDINGS, so the Pulmonary
//                     handlers do not see General "Normal" (and vice versa): Normal + Tachypneic can be saved together.
//   V3 Low  :446      the peds branch tests $patient.age (today) whereas :368 uses the age at the encounter date, so a
//                     retrospective encounter of a child who has since turned 12 loses the block. Fix: getAge($encounter...).

type CreateSection = (o: SectionEncounterOptions) => Promise<SectionEncounter>;
const FORM = 'section-exam.xml';
// ENCOUNTERTYPE_PRIMARY_CARE_PEDS_INITIAL_CONSULT_UUID / _FOLLOWUP_ in PihEmrConfigConstants (:446)
const PRIMARY_CARE_PEDS_INITIAL_UUID = '5b812660-0262-11e6-a837-0800200c9a66';
const PRIMARY_CARE_PEDS_FOLLOWUP_UUID = '229e5160-031b-11e6-a837-0800200c9a66';

// body-system block id (the .toggle-div heading) -> one abnormal finding label in it
const BLOCKS: Array<[string, string]> = [
  ['general', 'Obesity'],
  ['mental', 'Depression'],
  ['skin', 'Rash'],
  ['heent', 'Dysphagia'],
  ['lymph', 'Axillary lymphadenopathy'],
  ['cardio', 'Tachycardia'],
  ['chest', 'Wheeze'],
  ['abs', 'Ascites'],
  ['uro', 'Candidiasis'],
  ['neuro', 'Seizure'],
  ['musculo', 'Oedema'],
];

test.describe('section-exam', () => {
  let section: SectionEncounter;

  const open = async (
    page: Page,
    createSectionEncounter: CreateSection,
    f: { gender: 'M' | 'F'; age: number; encounterTypeUuid?: string },
  ) => {
    section = await createSectionEncounter({
      encounterTypeUuid: f.encounterTypeUuid ?? OUTPATIENT_INITIAL_ENCOUNTER_TYPE_UUID,
      patient: { givenName: 'AutoExam', familyName: 'Tester', gender: f.gender, birthdate: birthdateYearsAgo(f.age) },
    });
    await SectionFormPage.openEdit(page, FORM, section);
  };
  const block = (page: Page, id: string) => page.locator(`#${id} + .exam`);
  const box = (page: Page, id: string, label: string) => block(page, id).getByLabel(label, { exact: true });
  // The sticky block heading (.toggle-div) can cover the checkbox after Playwright scrolls it into view, so click via the DOM.
  const tick = (checkbox: Locator) => checkbox.evaluate((e) => (e as HTMLInputElement).click());

  test('EDIT shows the heading and the Next/Save/Cancel buttons', async ({ page, createSectionEncounter }) => {
    // ifMode VIEW include=false :64, :543
    await open(page, createSectionEncounter, { gender: 'F', age: 30 });
    await expect(page.locator('#htmlform h3').first()).toBeVisible();
    await expect(page.locator('#next')).toBeVisible();
    await expect(page.locator('#submit')).toBeVisible();
    await expect(page.locator('#cancel')).toBeVisible();
  });

  for (const [id, abnormal] of BLOCKS) {
    test(`${id}: Normal and "${abnormal}" exclude each other`, async ({ page, createSectionEncounter }) => {
      // js :73-96
      await open(page, createSectionEncounter, { gender: 'F', age: 30 });
      const normal = box(page, id, 'Normal');
      const finding = box(page, id, abnormal);
      await tick(normal);
      await tick(finding);
      await expect(finding).toBeChecked();
      await expect(normal).not.toBeChecked();
      await tick(normal);
      await expect(normal).toBeChecked();
      await expect(finding).not.toBeChecked();
    });
  }

  test('the blocks are independent: Normal in one block does not clear findings in another', async ({
    page,
    createSectionEncounter,
  }) => {
    // js :73-96 closest('.exam')
    await open(page, createSectionEncounter, { gender: 'F', age: 30 });
    await tick(box(page, 'skin', 'Rash'));
    await tick(box(page, 'cardio', 'Normal'));
    await expect(box(page, 'skin', 'Rash')).toBeChecked();
  });

  test('General: Normal unticks Weight loss but keeps its Duration (V1)', async ({ page, createSectionEncounter, api }) => {
    // js :73-96; V1 observed behaviour
    await open(page, createSectionEncounter, { gender: 'F', age: 30 });
    await tick(box(page, 'general', 'Weight loss'));
    const duration = block(page, 'general').locator('.indented input[type=text]').first();
    await duration.fill('3');
    await tick(box(page, 'general', 'Normal'));
    await expect(box(page, 'general', 'Weight loss')).not.toBeChecked();
    await expect(duration).toHaveValue('3');
    await new SectionFormPage(page, FORM).save();
    await expect(page).toHaveURL(/referenceapplication\/home\.page/);
    const saved = (await getEncounterObs(api, section.encounter.uuid)).map((o) => o.display.toLowerCase());
    expect(saved).toContain('sign/symptom duration: 3'); // the duration is saved ...
    expect(saved.some((d) => d.includes('weight loss'))).toBeFalsy(); // ... without the finding
  });

  for (const [label, f, shown] of [
    ['a woman over 13', { gender: 'F' as const, age: 30 }, true],
    ['a man', { gender: 'M' as const, age: 30 }, false],
    ['a girl of 10', { gender: 'F' as const, age: 10 }, false],
  ] as const) {
    test(`"Chronic pelvic pain" for ${label}: ${shown ? 'shown' : 'hidden'}`, async ({ page, createSectionEncounter }) => {
      // includeIf :368
      await open(page, createSectionEncounter, f);
      await expect(block(page, 'uro').getByLabel('Chronic pelvic pain', { exact: true })).toHaveCount(shown ? 1 : 0);
    });
  }

  for (const [label, f, shown] of [
    ['outpatient initial, adult', { gender: 'M' as const, age: 30 }, false],
    ['outpatient initial, child of 11', { gender: 'M' as const, age: 11 }, true],
    ['outpatient initial, child of 12', { gender: 'M' as const, age: 12 }, false],
    ['primary-care peds initial, adult', { gender: 'M' as const, age: 30, encounterTypeUuid: PRIMARY_CARE_PEDS_INITIAL_UUID }, true],
    ['primary-care peds followup, adult', { gender: 'M' as const, age: 30, encounterTypeUuid: PRIMARY_CARE_PEDS_FOLLOWUP_UUID }, true],
  ] as const) {
    test(`Pediatric Assessment, ${label}: ${shown ? 'shown' : 'hidden'}`, async ({ page, createSectionEncounter }) => {
      // includeIf :446
      await open(page, createSectionEncounter, f);
      await expect(page.locator('#peds-dev')).toHaveCount(shown ? 1 : 0);
      if (shown) {
        // the same Normal / abnormal handlers apply inside the peds blocks (js :73-96)
        const gross = page.locator('#gross').locator('xpath=ancestor::div[contains(@class,"exam")][1]');
        await tick(gross.getByLabel('Normal', { exact: true }));
        await tick(gross.getByLabel('Abnormal', { exact: true }));
        await expect(gross.getByLabel('Normal', { exact: true })).not.toBeChecked();
      }
    });
  }

  test('saves the ticked findings (including "Abdominal mass" and the Pulmonary "Tachypneic")', async ({
    page,
    createSectionEncounter,
    api,
  }) => {
    await open(page, createSectionEncounter, { gender: 'F', age: 30 });
    await tick(box(page, 'general', 'Normal'));
    await tick(box(page, 'cardio', 'Tachycardia'));
    await tick(box(page, 'abs', 'Abdominal mass'));
    await tick(box(page, 'chest', 'Tachypneic')); // V2: saved under GENERAL EXAM FINDINGS
    await tick(box(page, 'uro', 'Chronic pelvic pain'));

    const form = new SectionFormPage(page, FORM);
    await form.save();
    await form.expectSaved();

    const displays = (await getEncounterObs(api, section.encounter.uuid)).map((o) => o.display.toLowerCase());
    expect(displays).toContain('general exam findings: normal');
    expect(displays).toContain('cardiac exam findings: tachycardia');
    expect(displays).toContain('abdominal exam findings: abdominal mass');
    expect(displays).toContain('urogenital exam findings: chronic pelvic pain in female');
    // V2: Pulmonary "Tachypneic" is saved under GENERAL EXAM FINDINGS, next to General "Normal"
    expect(displays).toContain('general exam findings: tachypneic');
  });
});
