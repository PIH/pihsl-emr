import { test, expect, birthdateYearsAgo } from '../../core';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import { EntryFormPage } from '../../pages';
import type { APIRequestContext, Page } from '@playwright/test';

// cervicalCancerScreening.xml: "Cervical Cancer Screening" (reproductive history, HIV status, speculum exam, diagnosis,
// rapid tests, lab orders, integrated services, VIA quadrants and result, treatment, drug orders, referral, outcome).
// The specs open enterHtmlFormWithStandardUi in a visit they create for a 30-year-old woman (availability, see
// documentation/_availability.e2e.md: enableMCHForms, enterMCH, MCH location tag, female aged >= 10, not twice in a visit, is
// not exercised). Provider and location start filled; the form uses <submit> (#buttons input.submitButton) and has no required
// field, so a blank form saves.
//
// Conditions in the form, from documentation inventory (cervicalCancerScreening.inv.md):
//   ifMode VIEW include=false :40, :60, :408, :594  style, title, cervix image and #buttons only in ENTER/EDIT (VIEW not testable)
//   when VIA result = positive   :431   show #via+ (the four VIA follow-up questions)
//   when Referred to = Other     :529   show #other-referral (the "specify referral site" text)
// Scripts: setUpNextAndSubmitButtons() (:51): only wires #submit; nothing observable. prior-vital-signs-widget, rapid-tests-widget
//   and drug-order-widget are shared (see _shared).
// Side effects on save: ApplyDispositionAction and CleanDiagnosisConstructAction (:20-21); no enrolment.
// Not covered here: lab orders (pihLabOrder :357) and drug orders (:509; a saved order cannot be purged), the disposition,
// the diagnosis search, the prior vitals box and rapid tests (see _shared), VIEW/EDIT.
//
// Findings:
//   V1 High (FIXED, SL-1462) :449-452 the VIA rows "Entire lesion seen" and "Extends into endocervical canal/vagina" both use PIH:21498
//                      (Entire lesion visible); the extending-lesion concept is PIH:21495. The second answer is saved as the
//                      first question's concept, so the two cannot be told apart. Fixed: viaID="PIH:21495" on :451. TESTED below.
//   V2 Medium :431,:434 thenDisplay="#via+" and id="via+": "+" is not valid in a jQuery id selector, so the VIA follow-up questions
//                      are visible whatever the result. Fix: id="via-positive". TESTED below (test.fail).
//   V3 Medium :529   thenDisplay="#other-referral" matches no element, so "if other, specify referral site" (:532-536) is always
//                      visible. Fix: id="other-referral" on that <div>. TESTED below (test.fail).

const FORM = 'cervicalCancerScreening.xml';
const CERVICAL_SCREENING_ENCOUNTER_TYPE_UUID = '820a80b0-1d59-407e-acbb-56abb69abd35'; // formEncounterType, line 16
const SAVE = '#buttons input.submitButton';

const radioOf = (page: Page, rowText: string) => page.locator('p', { hasText: rowText }).locator('input[type=radio]');

// "<concept>=<value>" for each obs of the encounter (coded values by their name).
const obsSummary = async (api: APIRequestContext, encounterUuid: string): Promise<string[]> =>
  (await getEncounterObs(api, encounterUuid)).map((o) => {
    const v = o.value as { display?: string } | string | number | null;
    return `${o.concept.display}=${typeof v === 'object' && v !== null ? v.display : v}`;
  });

test.describe('cervicalCancerScreening', () => {
  const open = async (page: Page, createEntryContext: Parameters<Parameters<typeof test>[2]>[0]['createEntryContext']) => {
    const context = await createEntryContext({
      givenName: 'AutoCervical',
      familyName: 'Tester',
      gender: 'F',
      birthdate: birthdateYearsAgo(30),
    });
    await EntryFormPage.open(page, FORM, context);
    await expect(page.locator(SAVE)).toBeVisible();
    return context;
  };

  test('a blank form saves a cervical screening encounter (nothing is required)', async ({ page, api, createEntryContext }) => {
    const context = await open(page, createEntryContext);
    await page.locator(SAVE).click();
    await expect(page).toHaveURL(/referenceapplication\/home\.page/);
    await expect
      .poll(async () => (await getPatientEncounters(api, context.patient.uuid)).map((e) => e.encounterType.uuid))
      .toEqual([CERVICAL_SCREENING_ENCOUNTER_TYPE_UUID]);
  });

  test('the VIA quadrant and result answers render (the concepts resolve)', async ({ page, createEntryContext }) => {
    await open(page, createEntryContext);
    await expect(page.locator('#quads input[type=checkbox]')).toHaveCount(5);
    await expect(page.locator('#via-resultq input[type=radio]')).toHaveCount(3);
  });

  // V2 (Medium): id="via+" cannot be matched by thenDisplay="#via+", so the questions are always visible.
  // Intended: hidden until the result is "VIA positive". Remove test.fail() when fixed.
  test('the VIA follow-up questions show only for a positive result (V2)', async ({ page, createEntryContext }) => {
    test.fail();
    await open(page, createEntryContext);
    const questions = page.getByText('Entire lesion seen', { exact: true });
    await expect(questions).toBeHidden();
    await page.locator('#via-resultq input').nth(1).check(); // VIA positive
    await expect(questions).toBeVisible();
    await page.locator('#via-resultq input').nth(0).check(); // VIA negative
    await expect(questions).toBeHidden();
  });

  // V3 (Medium): #other-referral does not exist, so the specify box is always visible.
  // Intended: hidden until the referral is "Other". Remove test.fail() when fixed.
  test('the "specify referral site" box shows only when the referral is Other (V3)', async ({ page, createEntryContext }) => {
    test.fail();
    await open(page, createEntryContext);
    const label = page.getByText('if other, specify referral site', { exact: true });
    await expect(label).toBeHidden();
    await page.locator('#refer-to input').nth(3).check(); // Other
    await expect(label).toBeVisible();
    await page.locator('#refer-to input').nth(0).check();
    await expect(label).toBeHidden();
  });

  // V1 (High, fixed): "Extends into endocervical canal/vagina" used to be saved with the concept of "Entire lesion seen" (PIH:21498).
  // Each answer is now its own obs: one "Entire lesion visible" obs (PIH:21498) and one for the extending lesion (PIH:21495).
  test('"Extends into endocervical canal" is saved under its own concept (V1)', async ({ page, api, createEntryContext }) => {
    const context = await open(page, createEntryContext);
    await page.locator('#via-resultq input').nth(1).check(); // VIA positive
    await radioOf(page, 'Entire lesion seen').nth(0).check(); // yes
    await radioOf(page, 'Extends into endocervical canal').nth(1).check(); // no
    await page.locator(SAVE).click();
    await expect(page).toHaveURL(/referenceapplication\/home\.page/);
    const [encounter] = await getPatientEncounters(api, context.patient.uuid);
    const obs = await getEncounterObs(api, encounter.uuid);
    const lesion = obs.filter((o) => o.concept.display.startsWith('Entire lesion visible'));
    expect(lesion.map((o) => (o.value as { display: string }).display)).toEqual(['Yes']);
    // the "no" answer is saved under another concept (PIH:21495), not lost
    const answers = obs.filter((o) => !lesion.includes(o) && (o.value as { display?: string } | null)?.display === 'No');
    expect(answers.map((o) => o.concept.display)).toHaveLength(1);
    expect(answers[0].concept.display).not.toMatch(/Entire lesion visible/);
  });

  test('saves the history, HIV status, VIA result, treatment and referral', async ({ page, api, createEntryContext }) => {
    const context = await open(page, createEntryContext);
    await page.locator('#paraInput input').fill('3');
    await radioOf(page, 'Abnormal vaginal bleeding').nth(0).check(); // yes
    await radioOf(page, 'HIV Status').nth(1).check(); // negative
    await page.locator('#quads input[type=checkbox]').nth(0).check(); // quadrant 1
    await page.locator('#via-resultq input').nth(1).check(); // VIA positive
    await page.locator('#treatment-rx input[type=checkbox]').nth(0).check(); // Cryotherapy performed
    await page.locator('#refer-to input').nth(0).check();
    await page.locator('textarea').last().fill('Return in six months');
    await page.locator(SAVE).click();
    await expect(page).toHaveURL(/referenceapplication\/home\.page/);

    const encounters = await getPatientEncounters(api, context.patient.uuid);
    expect(encounters.map((e) => e.encounterType.uuid)).toEqual([CERVICAL_SCREENING_ENCOUNTER_TYPE_UUID]);
    const obs = await obsSummary(api, encounters[0].uuid);
    expect(obs).toEqual(
      expect.arrayContaining([
        'Parity=3',
        'Abnormal vaginal bleeding=Yes',
        'HIV status=Negative',
        'Colposcopy of cervix with acetic acid=Positive',
        'Location on uterine cervix=Left upper quadrant of uterine cervix',
        'Procedure performed=Cryotherapy of lesion of cervix',
        'Type of referral ordered=Obstetrics/Gynecology',
        'Comments at conclusion of examination=Return in six months',
      ]),
    );
  });
});
