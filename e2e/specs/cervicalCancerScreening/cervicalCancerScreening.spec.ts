import { test, expect, birthdateYearsAgo } from '../../core';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import { EntryFormPage, SectionFormPage, expectViewShowsSavedObs, selectDefaultProvider } from '../../pages';
import type { APIRequestContext, Locator, Page } from '@playwright/test';

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
// the diagnosis search, the prior vitals box and rapid tests (see _shared). EDIT: one save, reopen, change, save round-trip (SL-1462). VIEW: the
// last test saves a filled form and checks every saved value is shown (expectViewShowsSavedObs) under the form's own labels, and the EDIT round-trip
// ends with a VIEW of the second save.
//
// Findings:
//   V1 High (fixed in PR #363, SL-1462; not on kgh-demo yet) :449-452 the VIA rows "Entire lesion seen" and "Extends into endocervical canal/vagina" both use PIH:21498
//                      (Entire lesion visible); the extending-lesion concept is PIH:21495. The second answer is saved as the
//                      first question's concept, so the two cannot be told apart. Fixed: viaID="PIH:21495" on :451. TESTED below.
//   V2 Medium :431,:434 thenDisplay="#via+" and id="via+": "+" is not valid in a jQuery id selector, so the VIA follow-up questions
//                      are visible whatever the result. Fix: id="via-positive". TESTED below (test.fixme).
//   V3 Medium :529   thenDisplay="#other-referral" matches no element, so "if other, specify referral site" (:532-536) is always
//                      visible. Fix: id="other-referral" on that <div>. TESTED below (test.fixme).

const FORM = 'cervicalCancerScreening.xml';
const CERVICAL_SCREENING_ENCOUNTER_TYPE_UUID = '820a80b0-1d59-407e-acbb-56abb69abd35'; // formEncounterType, line 16
const SAVE = '#buttons input.submitButton';

const radioOf = (page: Page, rowText: string) => page.locator('p', { hasText: rowText }).locator('input[type=radio]');

// The date widgets are read-only jQuery UI datepickers; setDate also updates the hidden field that is submitted.
const setDate = (display: Locator, year: number, monthIndex: number, day: number) =>
  display.evaluate(
    (el, [y, m, d]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).jq(el).datepicker('setDate', new Date(y, m, d));
    },
    [year, monthIndex, day],
  );

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
    await selectDefaultProvider(page);
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
  // Intended: hidden until the result is "VIA positive". Remove test.fixme() when fixed.
  test('the VIA follow-up questions show only for a positive result (V2)', async ({ page, createEntryContext }) => {
    test.fixme();
    await open(page, createEntryContext);
    const questions = page.getByText('Entire lesion seen', { exact: true });
    await expect(questions).toBeHidden();
    await page.locator('#via-resultq input').nth(1).check(); // VIA positive
    await expect(questions).toBeVisible();
    await page.locator('#via-resultq input').nth(0).check(); // VIA negative
    await expect(questions).toBeHidden();
  });

  // V3 (Medium): #other-referral does not exist, so the specify box is always visible.
  // Intended: hidden until the referral is "Other". Remove test.fixme() when fixed.
  test('the "specify referral site" box shows only when the referral is Other (V3)', async ({ page, createEntryContext }) => {
    test.fixme();
    await open(page, createEntryContext);
    const label = page.getByText('if other, specify referral site', { exact: true });
    await expect(label).toBeHidden();
    await page.locator('#refer-to input').nth(3).check(); // Other
    await expect(label).toBeVisible();
    await page.locator('#refer-to input').nth(0).check();
    await expect(label).toBeHidden();
  });

  // V1 (High, fixed in PR #363, not on kgh-demo yet): "Extends into endocervical canal/vagina" used to be saved with the concept of "Entire lesion seen" (PIH:21498).
  // Each answer is now its own obs: one "Entire lesion visible" obs (PIH:21498) and one for the extending lesion (PIH:21495).
  // Skipped: the form fix (SL-1462, PR #363) is not on kgh-demo yet. Remove test.fixme() once it is released.
  test('"Extends into endocervical canal" is saved under its own concept (V1)', async ({ page, api, createEntryContext }) => {
    test.fixme();
    const context = await open(page, createEntryContext);
    await page.locator('#via-resultq input').nth(1).check(); // VIA positive
    await radioOf(page, 'Entire lesion seen').nth(0).check(); // yes
    await radioOf(page, 'Extends into endocervical canal').nth(1).check(); // no
    await selectDefaultProvider(page);
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
    await selectDefaultProvider(page);
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

  // EDIT round-trip (SL-1462): the two VIA answers come back each in its own row, and changing one leaves the other alone.
  // Skipped: the form fix (SL-1462, PR #363) is not on kgh-demo yet. Remove test.fixme() once it is released.
  test('EDIT: reopening shows both VIA answers in their own rows, and changing one does not touch the other', async ({
    page,
    api,
    createEntryContext,
  }) => {
    test.fixme();
    const context = await open(page, createEntryContext);
    await page.locator('#via-resultq input').nth(1).check(); // VIA positive
    await radioOf(page, 'Entire lesion seen').nth(0).check(); // yes
    await radioOf(page, 'Extends into endocervical canal').nth(1).check(); // no
    await selectDefaultProvider(page);
    await page.locator(SAVE).click();
    await expect(page).toHaveURL(/referenceapplication\/home\.page/);
    const [encounter] = await getPatientEncounters(api, context.patient.uuid);

    await page.goto(
      SectionFormPage.editUrl(FORM, { patient: context.patient, encounter: { uuid: encounter.uuid, visitUuid: context.visitUuid } }),
    );
    await expect(page.locator(SAVE)).toBeVisible();
    await expect(page.locator('#via-resultq input').nth(1)).toBeChecked();
    const lesion = radioOf(page, 'Entire lesion seen');
    const extends_ = radioOf(page, 'Extends into endocervical canal');
    await expect(lesion.nth(0)).toBeChecked();
    await expect(lesion.nth(1)).not.toBeChecked();
    await expect(extends_.nth(1)).toBeChecked();
    await expect(extends_.nth(0)).not.toBeChecked();

    await extends_.nth(0).check(); // change "Extends" to yes
    await page.locator(SAVE).click();
    await expect(page).toHaveURL(/referenceapplication\/home\.page/);

    const obs = await getEncounterObs(api, encounter.uuid);
    const answer = (o: (typeof obs)[number]) => (o.value as { display?: string } | null)?.display;
    const lesionObs = obs.filter((o) => o.concept.display.startsWith('Entire lesion visible'));
    expect(lesionObs.map(answer)).toEqual(['Yes']);
    const yesNo = obs.filter((o) => !lesionObs.includes(o) && ['Yes', 'No'].includes(answer(o) ?? ''));
    expect(yesNo.map((o) => `${o.concept.display}=${answer(o)}`)).toHaveLength(1);
    expect(answer(yesNo[0])).toBe('Yes'); // the "Extends" answer, now yes; the old "No" is gone
    expect(yesNo[0].concept.display).not.toMatch(/Entire lesion visible/);

    // VIEW shows the second save: each VIA answer in its own row
    const view = await expectViewShowsSavedObs(page, api, FORM, encounter.uuid);
    await expect(view.page.locator('p', { hasText: 'Entire lesion seen' }).locator('.value')).toHaveText('[X] yes');
    await expect(view.page.locator('p', { hasText: 'Extends into endocervical canal' }).locator('.value')).toHaveText('[X] yes');
  });

  // VIEW: every saved value is shown, the VIA follow-up answers each in their own row, and what was not filled is not shown.
  test('VIEW: shows the saved history, HIV status, VIA, referral and notes, and nothing for what was left blank', async ({
    page,
    api,
    createEntryContext,
  }) => {
    const context = await open(page, createEntryContext);
    await page.locator('#paraInput input').fill('2');
    await setDate(page.locator('#lmp input.hasDatepicker'), 2026, 4, 3);
    await radioOf(page, 'Abnormal vaginal bleeding').nth(0).check(); // yes
    await radioOf(page, 'Screened for cervical cancer before').nth(1).check(); // no
    await radioOf(page, 'Age at first coitus').nth(0).check(); // less than 15
    await radioOf(page, 'HIV Status').nth(0).check(); // positive
    await radioOf(page, 'ART Status').nth(0).check(); // on ART
    await page.locator('#cc-visit-reason input').nth(0).check();
    await page.locator('#quads input[type=checkbox]').nth(0).check(); // Q1
    await page.locator('#quads input[type=checkbox]').nth(2).check(); // Q3
    await page.locator('#via-resultq input').nth(1).check(); // VIA positive
    await radioOf(page, 'Entire lesion seen').nth(0).check(); // yes
    await radioOf(page, 'Extends into endocervical canal').nth(1).check(); // no
    await radioOf(page, 'Eligible for cryotherapy').nth(0).check(); // yes
    await page.locator('#refer-to input').nth(0).check();
    await page.locator('#referral-section input[type=checkbox]').nth(1).check(); // reason: Cryotherapy
    await setDate(page.locator('#apptDate input.hasDatepicker'), new Date().getFullYear() + 1, 3, 9);
    await page.locator('#disposition-section textarea').fill('Return in 12 months');
    await selectDefaultProvider(page);
    await page.locator(SAVE).click();
    await expect(page).toHaveURL(/referenceapplication\/home\.page/);
    const [encounter] = await getPatientEncounters(api, context.patient.uuid);

    // dates are shown as "dd MMM yyyy"; the quadrants and the referral reason carry the form's own labels
    const apptYear = new Date().getFullYear() + 1;
    const view = await expectViewShowsSavedObs(page, api, FORM, encounter.uuid, {
      'Date of last menstrual period: 2026-05-03': '03 May 2026',
      'Location on uterine cervix: Left upper quadrant of uterine cervix': 'Q1',
      'Location on uterine cervix: Right lower quadrant of uterine cervix': 'Q3',
      'Reasons for referral (coded): Cryotherapy of lesion of cervix': 'Cryotherapy',
      [`Return visit date: ${apptYear}-04-09`]: `09 Apr ${apptYear}`,
    });
    const shown = await view.valueTexts();
    for (const expected of ['2', '03 May 2026', '[X] positive', '[X] on ART', '[X] Q1', '[X] Q3', '[X] VIA positive', '[X] Cryotherapy', 'Return in 12 months', `09 Apr ${apptYear}`]) {
      expect(shown, expected).toContain(expected);
    }
    // the VIA answers: "Entire lesion seen" and "Extends into endocervical canal" are separate obs (V1), "Covers more than 75%" was not answered
    await expect(view.page.locator('p', { hasText: 'Entire lesion seen' }).locator('.value')).toHaveText('[X] yes');
    await expect(view.page.locator('p', { hasText: 'Extends into endocervical canal' }).locator('.value')).toHaveText('[X] no');
    await expect(view.page.locator('p', { hasText: 'Covers more than 75% of cervix' }).locator('.value')).toHaveCount(0);
    // nothing was ticked for the other quadrants, the HIV answers, the treatment or the other referrals
    for (const unexpected of ['[X] negative', '[X] unknown', '[X] Q2', '[X] Q4', '[X] not on ART']) {
      expect(shown, unexpected).not.toContain(unexpected);
    }
    await expect(view.page.locator('#treatment-rx .value')).toHaveCount(0);
  });
});
