import type { Page } from '@playwright/test';
import { type EntryContext, test, expect } from '../../core';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import { EntryFormPage, ViewFormPage, expectViewShowsSavedObs } from '../../pages';

// ballardScore.xml: Ballard score of a newborn: six neuromuscular and six (male) / six (female) physical maturity signs,
// each scored by clicking a cell of the score table, with totals, the maturity rating total and the gestational age by
// maturity. A top-level form: the specs open enterHtmlFormWithStandardUi inside a visit they create for an infant born
// 3 days ago, so availability (documentation/_availability.e2e.md: mcoeForms + infantProgram, "NICU Location" session
// tag, enterMCH, age < 31 days at visit start) is not exercised. The session location (MCH OPD) is not tagged for this
// form, so the location select starts empty and the save tests pick one (the only option, NICU).
//
// Conditions in the form, from documentation inventory (ballardScore.inv.md):
//   ifMode VIEW include=false  :11, :106, :238, :917  CSS, script, provider/location/date block and #buttons, ENTER/EDIT only
//   ifMode VIEW include=true   :72                    script that highlights the saved scores, VIEW only
//   includeIf patient is male    :755  "Genitals (Male)" row (PIH:21382, #mat-genitals-male-score)
//   includeIf patient is female  :791  "Genitals (Female)" row (PIH:21383, #mat-genitals-female-score)
// Sub-forms (documentation/_shared.e2e.md): encounter-provider-location-date (date widget overridden, with time).
//
// Scripts: (1) :73-104 (VIEW) highlights the saved score cell of each row. (2) :107-234 (ENTER/EDIT):
//   selectScore(sign, score, cell): the clicked cell fills the row's read-only "<sign>-score" input and is highlighted;
//     the sign totals (#total-neuro-score, #total-mat-score) are the sum of the filled rows (empty when none);
//   updateMaturityRatingTotalScore: #maturityRatingTotalScore = neuromuscular total + physical total;
//   updateGestationalAgeByMaturity: #gestationalAgeByMaturity = round((2 * total + 120) / 5) weeks, empty when both
//     totals are empty (it can still be typed over: the field is not read-only);
//   before-validation (SL-1243): the neuromuscular total is required, else "*Select score from the table above" appears
//     under it and the save is blocked; the message is removed once a score is chosen.
// Side effects on save: none (no program, no order). The save button is a plain <button onclick="submitHtmlForm()">:
// there is no #submit (use #buttons button.submitButton).
// VIEW (:72-104, last test and the end of the save test): every saved score and total is shown, the unscored rows are blank, only the genitals row of the
// patient's sex is rendered, and the highlight script marks the saved cell of each scored row. The script needs jq, which the VIEW test page (the HTML
// loaded with setContent) does not have: the test loads the server's jQuery and runs highlightSavedScores itself.
// Not covered here: EDIT re-highlighting.
//
// Findings (the duplicate id="encounterDate" in the inventory is not real: the parameter replaces the shared widget):
//   V1 Medium :161-170  selectScore clears the row whenever a score exists, whichever cell is clicked: changing a score
//                       takes two clicks (the first clears, the second selects). Fix: clear only when the clicked cell is
//                       the one already selected (compare with the existing value), else set the new score. TESTED (test.fail)
//   V2 Low    :109-122  the page-load call updateTotalScore() (:222) ends in updateMaturityRatingTotalScore, which writes 0
//                       into #maturityRatingTotalScore on a blank form (and 0 again whenever all scores are cleared), so a
//                       maturity total of 0 is shown (and saved) although nothing was scored. Fix: leave it empty when both
//                       totals are empty.
//   V3 Low    :124-136  the gestational age is computed from the neuromuscular score alone as soon as it is chosen (the
//                       physical maturity score is optional), e.g. posture 4 alone gives 26 weeks. Intent unconfirmed.

const FORM = 'ballardScore.xml';
const BALLARD_ENCOUNTER_TYPE_UUID = '8e027b32-13de-491b-9f29-534d21a48f0d';

// Birthdate (yyyy-mm-dd) of an infant who is `days` days old today (the harness helper only does whole years).
const birthdateDaysAgo = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
};

// The only NICU-tagged location is not the session location, so the select starts on "Choose a Location...".
const chooseLocation = async (page: Page) => {
  await page.locator('#encounterLocation select').selectOption({ index: 1 });
};

// Clicks the cell of a score table row: <td class="clickable-td" onclick="selectScore('<sign>', <score>, this);">.
const pick = async (page: Page, sign: string, score: number) => {
  await page.locator(`td.clickable-td[onclick="selectScore('${sign}', ${score}, this);"]`).click();
};

const value = (page: Page, id: string) => page.locator(`#${id} input`);

test.describe('ballardScore', () => {
  let context: EntryContext;

  const open = async (page: Page, createEntryContext: (p: { givenName: string; familyName: string; gender: 'M' | 'F'; birthdate: string }) => Promise<EntryContext>, gender: 'M' | 'F' = 'M') => {
    context = await createEntryContext({
      givenName: 'AutoBallard',
      familyName: 'Tester',
      gender,
      birthdate: birthdateDaysAgo(3),
    });
    await EntryFormPage.open(page, FORM, context);
    await expect(page.locator('#buttons button.submitButton')).toBeVisible();
  };

  test('the male genitals row shows for a boy and the female row for a girl', async ({ page, createEntryContext }) => {
    // includeIf :755 (male) and :791 (female)
    await open(page, createEntryContext, 'M');
    await expect(page.locator('#mat-genitals-male-score')).toHaveCount(1);
    await expect(page.locator('#mat-genitals-female-score')).toHaveCount(0);

    await open(page, createEntryContext, 'F');
    await expect(page.locator('#mat-genitals-male-score')).toHaveCount(0);
    await expect(page.locator('#mat-genitals-female-score')).toHaveCount(1);
  });

  test('score inputs and totals are read-only, and start empty', async ({
    page,
    createEntryContext,
  }) => {
    await open(page, createEntryContext);
    for (const id of ['posture-score', 'total-neuro-score', 'total-mat-score', 'maturityRatingTotalScore']) {
      await expect(value(page, id)).toHaveAttribute('readonly', 'readonly');
    }
    await expect(value(page, 'total-neuro-score')).toHaveValue('');
    await expect(value(page, 'total-mat-score')).toHaveValue('');
    await expect(value(page, 'gestationalAgeByMaturity')).toHaveValue('');
  });

  test('clicking a cell fills the sign score, the totals, the maturity rating total and the gestational age', async ({
    page,
    createEntryContext,
  }) => {
    // selectScore :161-190, updateTotalScore :139-157, updateGestationalAgeByMaturity :124-136
    await open(page, createEntryContext);
    const steps: Array<{ clicks: Array<[string, number]>; neuro: string; mat: string; total: string; ga: string }> = [
      // GA = round((2 * total + 120) / 5)
      { clicks: [['posture', 4]], neuro: '4', mat: '', total: '4', ga: '26' },
      { clicks: [['square-window', 3], ['arm-recoil', 2], ['pop', 1], ['scarf-sign', 4], ['heel-to-ear', 2]], neuro: '16', mat: '', total: '16', ga: '30' },
      { clicks: [['mat-skin', 3], ['mat-lanugo', 2], ['mat-plantar', 1], ['mat-breast', 2], ['mat-eye-ear', 3]], neuro: '16', mat: '11', total: '27', ga: '35' },
      { clicks: [['mat-genitals-male', 2]], neuro: '16', mat: '13', total: '29', ga: '36' },
    ];
    for (const step of steps) {
      for (const [sign, score] of step.clicks) {
        await pick(page, sign, score);
      }
      await expect(value(page, 'total-neuro-score')).toHaveValue(step.neuro);
      await expect(value(page, 'total-mat-score')).toHaveValue(step.mat);
      await expect(value(page, 'maturityRatingTotalScore')).toHaveValue(step.total);
      await expect(value(page, 'gestationalAgeByMaturity')).toHaveValue(step.ga);
    }
    await expect(value(page, 'posture-score')).toHaveValue('4');
    await expect(page.locator(`td.clickable-td[onclick="selectScore('posture', 4, this);"]`)).toHaveCSS(
      'background-color',
      'rgb(255, 243, 224)',
    );
  });

  test('clicking the selected cell again clears the sign and its totals', async ({ page, createEntryContext }) => {
    await open(page, createEntryContext);
    await pick(page, 'posture', 2);
    await expect(value(page, 'total-neuro-score')).toHaveValue('2');
    await pick(page, 'posture', 2);
    await expect(value(page, 'posture-score')).toHaveValue('');
    await expect(value(page, 'total-neuro-score')).toHaveValue('');
    await expect(value(page, 'gestationalAgeByMaturity')).toHaveValue('');
  });

  // V1 (Medium): clicking another cell of a scored row only clears it. Intended: the row takes the new score.
  // Remove test.fail() when selectScore (:161-170) is fixed.
  test('clicking another cell in a scored row replaces the score (V1)', async ({ page, createEntryContext }) => {
    test.fail();
    await open(page, createEntryContext);
    await pick(page, 'posture', 1);
    await expect(value(page, 'posture-score')).toHaveValue('1');
    await pick(page, 'posture', 3);
    await expect(value(page, 'posture-score')).toHaveValue('3', { timeout: 3000 });
  });

  test('saving without a neuromuscular score is blocked until one is chosen', async ({ page, api, createEntryContext }) => {
    // before-validation :206-213 (SL-1243)
    await open(page, createEntryContext);
    await chooseLocation(page);
    await page.locator('#buttons button.submitButton').click();
    const error = page.locator('#total-neuro-score .field-error');
    await expect(error).toContainText('Select score from');
    await expect(page).not.toHaveURL(/referenceapplication\/home\.page/);
    expect(await getPatientEncounters(api, context.patient.uuid)).toHaveLength(0);

    await pick(page, 'posture', 2);
    await expect(error).toBeEmpty();
  });

  test('saves the scores, totals and gestational age in one Ballard score encounter', async ({
    page,
    api,
    createEntryContext,
  }) => {
    await open(page, createEntryContext);
    await chooseLocation(page);
    for (const [sign, score] of [['posture', 4], ['square-window', 3], ['arm-recoil', 2], ['pop', 1], ['scarf-sign', 4], ['heel-to-ear', 2], ['mat-skin', 3]] as const) {
      await pick(page, sign, score);
    }
    await page.locator('.gestationByDateSpan input').first().fill('36');
    await page.locator('#buttons button.submitButton').click();
    await new EntryFormPage(page, FORM).expectSaved();

    const encounters = await getPatientEncounters(api, context.patient.uuid);
    expect(encounters.map((e) => e.encounterType.uuid)).toEqual([BALLARD_ENCOUNTER_TYPE_UUID]);
    const obs = (await getEncounterObs(api, encounters[0].uuid)).map((o) => `${o.concept.display}=${JSON.stringify(o.value)}`);
    expect(obs).toEqual(
      expect.arrayContaining([
        'Posture score=4',
        'Square window score=3',
        'Arm recoil score=2',
        'Popliteal angle score=1',
        'Scarf sign score=4',
        'Heel to ear score=2',
        'Total neuromuscular maturity score=16',
        'Skin score=3',
        'Total physical maturity score=3',
        'Ballard score=19', // maturity rating total: 16 + 3
        'Gestational age by maturity rating range="32"', // round((2 * 19 + 120) / 5), a text obs
        'Estimated gestational age (weeks)=36', // gestation by dates, typed
      ]),
    );
    const view = await expectViewShowsSavedObs(page, api, FORM, encounters[0].uuid);
    // (the scores are short numbers: check them in the order of the form too)
    expect(await view.valueTexts()).toEqual(['4', '3', '2', '1', '4', '2', '16', '3', '3', '36', '19', '32']);
  });

  // VIEW: the saved scores (script :72-104 marks the saved cell in each row, :755 / :791 render the genitals row of the patient's sex).
  test('VIEW: shows the saved scores and totals, highlights the saved cells, and leaves the unscored rows blank', async ({ page, api, createEntryContext }) => {
    await open(page, createEntryContext, 'F');
    await chooseLocation(page);
    for (const [sign, score] of [['posture', 4], ['square-window', 3], ['arm-recoil', 2], ['pop', 1], ['scarf-sign', 4], ['heel-to-ear', 2], ['mat-skin', 3], ['mat-genitals-female', 1]] as const) {
      await pick(page, sign, score);
    }
    await page.locator('#buttons button.submitButton').click();
    await new EntryFormPage(page, FORM).expectSaved();
    const [encounter] = await getPatientEncounters(api, context.patient.uuid);

    const view = await expectViewShowsSavedObs(page, api, FORM, encounter.uuid);
    // scores and totals (neuromuscular 16, physical 3 + 1, maturity rating 20, gestational age round((2 * 20 + 120) / 5) = 32)
    for (const [id, expected] of [
      ['posture-score', '4'],
      ['square-window-score', '3'],
      ['arm-recoil-score', '2'],
      ['pop-score', '1'],
      ['scarf-sign-score', '4'],
      ['heel-to-ear-score', '2'],
      ['total-neuro-score', '16'],
      ['mat-skin-score', '3'],
      ['mat-genitals-female-score', '1'],
      ['total-mat-score', '4'],
      ['maturityRatingTotalScore', '20'],
      ['gestationalAgeByMaturity', '32'],
    ]) {
      await expect(view.page.locator(`#${id} .value`), id).toHaveText(expected);
    }
    // rows that were not scored, and the gestation by dates that was not typed, are blank
    for (const id of ['mat-lanugo-score', 'mat-plantar-score', 'mat-breast-score', 'mat-eye-ear-score']) {
      await expect(view.page.locator(`#${id} .value`), id).toHaveCount(0);
      await expect(view.page.locator(`#${id} .emptyValue`), id).toHaveCount(1);
    }
    expect(await view.valueTexts()).toHaveLength(12);
    // the genitals row of the other sex is not rendered at all
    await expect(view.page.locator('#mat-genitals-male-score')).toHaveCount(0);

    // the highlight script: it needs jq (not loaded in this page), so load the server's jQuery and run its row highlighter
    await view.page.addScriptTag({ url: `${process.env.E2E_BASE_URL}/ms/uiframework/resource/uicommons/scripts/jquery-1.12.4.min.js` });
    await view.page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any;
      w.jq = w.jQuery;
      w.highlightSavedScores('neuro-score', 'neuro-score-input');
      w.highlightSavedScores('mat-score', 'mat-score-input');
    });
    const cell = (sign: string, score: number) => view.page.locator(`td.clickable-td[onclick="selectScore('${sign}', ${score}, this);"]`);
    for (const [sign, score] of [['posture', 4], ['square-window', 3], ['mat-skin', 3], ['mat-genitals-female', 1]] as const) {
      await expect(cell(sign, score), `${sign} ${score}`).toHaveCSS('background-color', 'rgb(255, 243, 224)');
    }
    await expect(cell('posture', 3)).not.toHaveCSS('background-color', 'rgb(255, 243, 224)'); // another cell of a scored row
    await expect(cell('mat-lanugo', 2)).not.toHaveCSS('background-color', 'rgb(255, 243, 224)'); // an unscored row
  });
});
