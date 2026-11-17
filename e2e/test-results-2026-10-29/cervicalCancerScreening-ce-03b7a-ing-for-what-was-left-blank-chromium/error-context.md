# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: cervicalCancerScreening/cervicalCancerScreening.spec.ts >> cervicalCancerScreening >> VIEW: shows the saved history, HIV status, VIA, referral and notes, and nothing for what was left blank
- Location: specs/cervicalCancerScreening/cervicalCancerScreening.spec.ts:214:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: expect(locator).toHaveText(expected) failed

Locator:  locator('p').filter({ hasText: 'Entire lesion seen' }).locator('.value')
Expected: "[X] yes"
Received: "[X] no"

Call log:
  - Expect "toHaveText" locator('p').filter({ hasText: 'Entire lesion seen' }).locator('.value') with timeout 10000ms
  - waiting for locator('p').filter({ hasText: 'Entire lesion seen' }).locator('.value')
    20 × locator resolved to <span class="value">[X] no</span>
       - unexpected value "[X] no"
  - Test timeout of 30000ms exceeded.

```

```yaml
- text: "[X] no"
```

# Test source

```ts
  157 |         'Location on uterine cervix=Left upper quadrant of uterine cervix',
  158 |         'Procedure performed=Cryotherapy of lesion of cervix',
  159 |         'Type of referral ordered=Obstetrics/Gynecology',
  160 |         'Comments at conclusion of examination=Return in six months',
  161 |       ]),
  162 |     );
  163 |   });
  164 | 
  165 |   // EDIT round-trip (SL-1462): the two VIA answers come back each in its own row, and changing one leaves the other alone.
  166 |   // Skipped: the form fix (SL-1462, PR #363) is not on kgh-demo yet. Remove test.fixme() once it is released.
  167 |   test('EDIT: reopening shows both VIA answers in their own rows, and changing one does not touch the other', async ({
  168 |     page,
  169 |     api,
  170 |     createEntryContext,
  171 |   }) => {
  172 |     test.fixme();
  173 |     const context = await open(page, createEntryContext);
  174 |     await page.locator('#via-resultq input').nth(1).check(); // VIA positive
  175 |     await radioOf(page, 'Entire lesion seen').nth(0).check(); // yes
  176 |     await radioOf(page, 'Extends into endocervical canal').nth(1).check(); // no
  177 |     await selectDefaultProvider(page);
  178 |     await page.locator(SAVE).click();
  179 |     await expect(page).toHaveURL(/referenceapplication\/home\.page/);
  180 |     const [encounter] = await getPatientEncounters(api, context.patient.uuid);
  181 | 
  182 |     await page.goto(
  183 |       SectionFormPage.editUrl(FORM, { patient: context.patient, encounter: { uuid: encounter.uuid, visitUuid: context.visitUuid } }),
  184 |     );
  185 |     await expect(page.locator(SAVE)).toBeVisible();
  186 |     await expect(page.locator('#via-resultq input').nth(1)).toBeChecked();
  187 |     const lesion = radioOf(page, 'Entire lesion seen');
  188 |     const extends_ = radioOf(page, 'Extends into endocervical canal');
  189 |     await expect(lesion.nth(0)).toBeChecked();
  190 |     await expect(lesion.nth(1)).not.toBeChecked();
  191 |     await expect(extends_.nth(1)).toBeChecked();
  192 |     await expect(extends_.nth(0)).not.toBeChecked();
  193 | 
  194 |     await extends_.nth(0).check(); // change "Extends" to yes
  195 |     await page.locator(SAVE).click();
  196 |     await expect(page).toHaveURL(/referenceapplication\/home\.page/);
  197 | 
  198 |     const obs = await getEncounterObs(api, encounter.uuid);
  199 |     const answer = (o: (typeof obs)[number]) => (o.value as { display?: string } | null)?.display;
  200 |     const lesionObs = obs.filter((o) => o.concept.display.startsWith('Entire lesion visible'));
  201 |     expect(lesionObs.map(answer)).toEqual(['Yes']);
  202 |     const yesNo = obs.filter((o) => !lesionObs.includes(o) && ['Yes', 'No'].includes(answer(o) ?? ''));
  203 |     expect(yesNo.map((o) => `${o.concept.display}=${answer(o)}`)).toHaveLength(1);
  204 |     expect(answer(yesNo[0])).toBe('Yes'); // the "Extends" answer, now yes; the old "No" is gone
  205 |     expect(yesNo[0].concept.display).not.toMatch(/Entire lesion visible/);
  206 | 
  207 |     // VIEW shows the second save: each VIA answer in its own row
  208 |     const view = await expectViewShowsSavedObs(page, api, FORM, encounter.uuid);
  209 |     await expect(view.page.locator('p', { hasText: 'Entire lesion seen' }).locator('.value')).toHaveText('[X] yes');
  210 |     await expect(view.page.locator('p', { hasText: 'Extends into endocervical canal' }).locator('.value')).toHaveText('[X] yes');
  211 |   });
  212 | 
  213 |   // VIEW: every saved value is shown, the VIA follow-up answers each in their own row, and what was not filled is not shown.
  214 |   test('VIEW: shows the saved history, HIV status, VIA, referral and notes, and nothing for what was left blank', async ({
  215 |     page,
  216 |     api,
  217 |     createEntryContext,
  218 |   }) => {
  219 |     const context = await open(page, createEntryContext);
  220 |     await page.locator('#paraInput input').fill('2');
  221 |     await setDate(page.locator('#lmp input.hasDatepicker'), 2026, 4, 3);
  222 |     await radioOf(page, 'Abnormal vaginal bleeding').nth(0).check(); // yes
  223 |     await radioOf(page, 'Screened for cervical cancer before').nth(1).check(); // no
  224 |     await radioOf(page, 'Age at first coitus').nth(0).check(); // less than 15
  225 |     await radioOf(page, 'HIV Status').nth(0).check(); // positive
  226 |     await radioOf(page, 'ART Status').nth(0).check(); // on ART
  227 |     await page.locator('#cc-visit-reason input').nth(0).check();
  228 |     await page.locator('#quads input[type=checkbox]').nth(0).check(); // Q1
  229 |     await page.locator('#quads input[type=checkbox]').nth(2).check(); // Q3
  230 |     await page.locator('#via-resultq input').nth(1).check(); // VIA positive
  231 |     await radioOf(page, 'Entire lesion seen').nth(0).check(); // yes
  232 |     await radioOf(page, 'Extends into endocervical canal').nth(1).check(); // no
  233 |     await radioOf(page, 'Eligible for cryotherapy').nth(0).check(); // yes
  234 |     await page.locator('#refer-to input').nth(0).check();
  235 |     await page.locator('#referral-section input[type=checkbox]').nth(1).check(); // reason: Cryotherapy
  236 |     await setDate(page.locator('#apptDate input.hasDatepicker'), new Date().getFullYear() + 1, 3, 9);
  237 |     await page.locator('#disposition-section textarea').fill('Return in 12 months');
  238 |     await selectDefaultProvider(page);
  239 |     await page.locator(SAVE).click();
  240 |     await expect(page).toHaveURL(/referenceapplication\/home\.page/);
  241 |     const [encounter] = await getPatientEncounters(api, context.patient.uuid);
  242 | 
  243 |     // dates are shown as "dd MMM yyyy"; the quadrants and the referral reason carry the form's own labels
  244 |     const apptYear = new Date().getFullYear() + 1;
  245 |     const view = await expectViewShowsSavedObs(page, api, FORM, encounter.uuid, {
  246 |       'Date of last menstrual period: 2026-05-03': '03 May 2026',
  247 |       'Location on uterine cervix: Left upper quadrant of uterine cervix': 'Q1',
  248 |       'Location on uterine cervix: Right lower quadrant of uterine cervix': 'Q3',
  249 |       'Reasons for referral (coded): Cryotherapy of lesion of cervix': 'Cryotherapy',
  250 |       [`Return visit date: ${apptYear}-04-09`]: `09 Apr ${apptYear}`,
  251 |     });
  252 |     const shown = await view.valueTexts();
  253 |     for (const expected of ['2', '03 May 2026', '[X] positive', '[X] on ART', '[X] Q1', '[X] Q3', '[X] VIA positive', '[X] Cryotherapy', 'Return in 12 months', `09 Apr ${apptYear}`]) {
  254 |       expect(shown, expected).toContain(expected);
  255 |     }
  256 |     // the VIA answers: "Entire lesion seen" and "Extends into endocervical canal" are separate obs (V1), "Covers more than 75%" was not answered
> 257 |     await expect(view.page.locator('p', { hasText: 'Entire lesion seen' }).locator('.value')).toHaveText('[X] yes');
      |                                                                                               ^ Error: expect(locator).toHaveText(expected) failed
  258 |     await expect(view.page.locator('p', { hasText: 'Extends into endocervical canal' }).locator('.value')).toHaveText('[X] no');
  259 |     await expect(view.page.locator('p', { hasText: 'Covers more than 75% of cervix' }).locator('.value')).toHaveCount(0);
  260 |     // nothing was ticked for the other quadrants, the HIV answers, the treatment or the other referrals
  261 |     for (const unexpected of ['[X] negative', '[X] unknown', '[X] Q2', '[X] Q4', '[X] not on ART']) {
  262 |       expect(shown, unexpected).not.toContain(unexpected);
  263 |     }
  264 |     await expect(view.page.locator('#treatment-rx .value')).toHaveCount(0);
  265 |   });
  266 | });
  267 | 
```