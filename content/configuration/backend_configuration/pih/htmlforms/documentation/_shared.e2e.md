# Shared subforms & scripts — E2E notes
- Sources: merged tree `distro/target/distro/web/openmrs_config/pih/{subforms,scripts/global}/`; SL-owned copies in `content/configuration/backend_configuration/pih/subforms/` (+ `scripts/global/sl.js`). The merged tree is stale for `pregnancy-group-widget.xml` (repo copy, SL-1443, is documented here; `pregnancy-group-view-only-widget.xml` no longer exists in the repo).
- These files are included by forms/sections, never offered on their own. Per-form notes link here (`_shared.e2e.md`) instead of repeating. Counts = current `htmlforms/*.xml` (no `_v*`; `section-*` counted as forms).
- Loading: `<subform path=*.js>` is wrapped in an inline `<script>` and `*.css` in a page-global `<style>` (HtmlFormEntryGenerator.java:482-486); every `scripts/global/*.js` loads on every UI page, so their top-level functions/consts exist everywhere.
- Header forms (`ancIntake`, `ancFollowup`, `delivery`, `ncd-*`, `outpatient-*`, `postnatalFollowup`) contain only `encounter-with-sections`; their content lives in separate `section-*` forms reached via Next (`goToNext`).

## Index
| File | Used by (current forms) | subform-parameters | Purpose |
|---|---|---|---|
| encounter-with-sections.xml | 12: ancFollowup, ancIntake, delivery, ncd-initial(-part-1/2), ncd-followup(-part-1/2), outpatient-initial/-followup, postnatalFollowup | `encounter-type-name`, `encounter-provider-location-date-section` | Header-form shell: title, who/when/where, Next/Save/Cancel; ENTER auto-saves |
| encounter-provider-location-date.xml | 44 (all 12 above + e.g. triage, vitals, mentalHealth, newborn*, laborProgress) | `encounter-provider-label/-widget`, `encounter-location-label/-widget`, `encounter-date-label/-widget` (42 forms override widget; gainMaternalRegister blanks the date widget) | Provider, location (by tag), date with privilege-based editability |
| drug-order-widget.xml (+.css) | 13: ayfs*, cervicalCancerScreening, gynecology*, maternalDischarge(-print), section-anc-*, section-ncd-plan, section-plan(-medication), section-postnatal-followup | `drug-order-{drug,doseUnits,frequency,route,quantityUnits}-selector` (none overridden directly by forms) | Drug order entry (NEW/REVISE/RENEW/DISCONTINUE) + auto quantity |
| drug-order-widget-mental-health.xml | 2: mentalHealth, mentalHealthFollowup | overrides `-drug-selector` (27 drug uuids, all in drugs.csv) | Drug list limited to MH drugs |
| drug-order-widget-newborn.xml | 1: newbornDischarge | overrides `-route-selector` (Oral, IV, Both eyes, Topical, Rectal) | Newborn routes |
| drug-order-widget-obgyn / -with-non-coded | 0: not referenced by current forms | route override (Oral, Topical, Vaginal) / adds free-text dosing | Unused variants |
| rapid-tests-widget.xml/.js/.css | 8 direct (ayfs*, cervicalCancerScreening, gynecology*, section-anc-*, section-postnatal-followup) + 4 via lab-results-section (ancProgress, laborDeliverySummary, laborProgress, triage) | – | HIV / syphilis / Hep B rapid tests with latest prior result |
| lab-results-section.xml | 4 (above) | – | Fieldset "Lab results" wrapping rapid-tests-widget |
| prior-vital-signs-widget.xml/.js | 8: cervicalCancerScreening, familyPlanning*, gynecology*, section-anc-*, section-postnatal-followup | – | Read-only "most recent vitals" of the same visit (REST) |
| pregnancy-group-widget.xml | 8: ancProgress, laborDeliverySummary, laborProgress, maternalDischarge, pacuFollowup, postpartumDailyProgress, section-anc-followup, surgicalPostOpNote | velocity flag `$pregGroupViewOnly` (set before include) | Pregnancy cohort group A/B/C (PIH:21747) + previous group |
| vital-signs-widget.xml/.js/.css | 5: inpatientVitals, laborProgress, postpartumDailyProgress, section-postnatal-followup, triage | – | Vitals with colour/priority scoring (pregnancy ranges) |
| vital-signs-infant-widget.xml/.js | 6: inpatientNewbornVitals, newbornAssessment/DailyProgress/Discharge/Initial, nicuTriage | – | Infant vitals, infant ranges |
| vital-signs-anc-widget.xml | 2: section-anc-intake/-followup | – | Weight, height, BP, fundal height, FHR (uses vital-signs-widget.js) |
| vital-signs-basic-widget.xml | 2: ancProgress, pacuFollowup | – | BP, HR, RR, temp, SpO2 (uses vital-signs-widget.js) |
| vital-signs-wt-ht-bp-widget.xml | 4: familyPlanning*, gynecology* | – | BP, weight, height; no JS scoring |
| mental-health-phq2.xml | 5: laborDeliverySummary, postpartumDailyProgress, section-anc-*, triage | – | PHQ-2 total (PIH:PHQ-2) |
| mental-health-phq9-gad7-widget.xml/.js | 2: mentalHealth, mentalHealthFollowup | – | PHQ-9 (9 questions) and GAD-7 (7 questions) as selects; the script adds the answers into the total boxes (`#phq9-score`, `#gad7-score`) and shows a safety-plan alert for PHQ-9 question 9 (replaced mental-health-phq9-gad7-scores.xml, SL-434) |
| tb-symptom-screening-widget.xml/.js | 3: section-anc-intake/-followup, triage (forms include the .js separately, before the .xml) | – | 4 TB symptom yes/no radios + isolation message |
| save-and-print-button.xml/.js | 1: maternalDischarge (button itself is `maternalDischarge.xml:256`) | – | Save then auto-print on visit page |
| est-delivery-date-ga-initial.xml + est-delivery-date-ga.js/.css + edd.js | 1: section-anc-intake | – | LMP known? → LMP / EDD / GA, calculated EDD and GA |
| est-delivery-date-followup.xml/.js (+ .css, edd.js) | 1: section-anc-followup | – | Prior LMP/GA/EDD captions, EDD/GA entry, EDD validation |
| prior-procedure-widget.xml/.js | 1: gynecologyIntake | – | Lists earlier sterilization procedures (REST) |
| scripts: nextAndSubmitButtons.js | 36 (section-* ×22, anc/ayfs/gyn/familyPlanning/newborn/labor/postpartum intake+followup forms) | – | `setUpNextAndSubmitButtons()` |
| scripts: hideIfEmpty.js / renderOrderWidgetAsCheckboxes.js | 1 each: section-exam (VIEW) / section-ncd-plan (`onLoadFunction`) | – | Hide empty sections in VIEW / lab orders as checkboxes |
| scripts: setupDrugOrderQuantityCalculations.js | via drug-order-widget (`onLoadFunction`) | – | Order widget init + quantity calculator |
| scripts: sl.js | 1: section-heart-failure (`updateLastCheckboxRequired`) | – | "At least one checkbox" required rule |
| scripts: mch.js | 2 call it: mentalHealth(Followup) (`setUpEdd`, `validateEstimatedDeliveryDate`, `eddCannotBeOlderThanTwoWeeks`); globals `dateFromString`, `daysBetweenUTCDates`, `calculateGestationalDays` also used by est-delivery-date-followup, ancProgress, laborProgress, section-delivery | – | EDD/GA helpers; page-load handler runs on every page (no-op on SL forms) |
| scripts: checkboxRadio.js, expandable.js, setRequiredIfVisible.js, htmlFormFunctions.js, pihServices.js | not referenced by current forms (setRequiredIfVisible only from mch.js:288; HtmlFormFunctions/PihServices are classes nobody instantiates) | – | Unused |

## Conditional display
| Kind | Where | Trigger → effect | Test fixture / action |
|---|---|---|---|
| ifMode | encounter-with-sections.xml:12 | ENTER: all `#who-when-where :input` have a value → `submitHtmlForm()` (encounter saved with provider/location/date only, redirect to section form); else hide `#next`, show `.htmlform` | ENTER with default provider + session location carrying the form's tag (auto-saves) vs session location lacking the tag (form shown) |
| ifMode | encounter-with-sections.xml:28 | EDIT: show `.htmlform`, bind Next/Save buttons | open saved header encounter in EDIT |
| ifMode | encounter-with-sections.xml:39,47 | VIEW excluded: `<h2>` and `#next/#submit/#cancel`; in VIEW `.htmlform` stays `display:none` (V19) | open VIEW |
| ifMode | encounter-provider-location-date.xml:30 | VIEW excluded: whole provider/location/date block | ENTER/EDIT vs VIEW |
| includeIf | encounter-provider-location-date.xml:67 | `$user.hasPrivilege('Task: emr.retroConsultNote')` → date and provider enabled; otherwise both selects disabled (re-enabled on submit) | user with privilege (roles physician, sysAdmin) vs one without |
| includeIf | encounter-provider-location-date.xml:73 | `'Task: retroConsultNoteThisProviderOnly'` → date enabled (misspelled, V8) | – |
| js | encounter-provider-location-date.xml:101-103 | non-retro user whose provider select is empty → show `#invalid-user` "User is not valid provider for this form" | user lacking the provider role in the form's `providerRoles` |
| when | rapid-tests-widget.xml:27 | PIH:11522 group, CIEL:163722 = CIEL:160737 → show `#hrt-reason-not-done` (CIEL:165182) | select "Not performed" |
| when | rapid-tests-widget.xml:87 | CIEL:165303 = CIEL:160737 → show `#syph-reason-not-done` | select "Not performed" |
| excludeIf | rapid-tests-widget.xml:22,61 | latest earlier HIV result (before current encounter) = Positive CIEL:703 → HIV radio and reason not rendered | patient with earlier positive HIV rapid test (other encounter) |
| includeIf+ifMode | rapid-tests-widget.xml:6-14,31-59,104-129,141-163 | ENTER/EDIT only: earlier result of CIEL:163722/165303/159430 exists → "Latest test date / Result" line | prior obs per answer value |
| ifMode | rapid-tests-widget.js:3 | VIEW only: `#rapid-tests-widget p` forced to `display:block` | open VIEW |
| includeIf | prior-vital-signs-widget.xml:149 | `13 > $patient.getAge($encounter.getEncounterDatetime())` → MUAC cell (ENTER: age as of today) | patient < 13 years vs adult |
| js | prior-vital-signs-widget.js:49,93 | vitals encounter (type 2fd151a2-…) on same visit with obs → show `#lastVitals`; RBG obs swaps `#fbg_span`/`#rbg_span` label (see V3) | vitals encounter in the visit first |
| ifMode+includeIf | pregnancy-group-widget.xml:5,14,35 | `$pregGroupViewOnly` hides the A/B/C radio; ENTER/EDIT show "previous group (assigned on date, from form)" only if latest earlier PIH:21747 is on/after `dateEnrolled` of the pregnancy-program state active at encounter/visit date | enrol patient in pregnancy program; earlier PIH:21747 obs |
| ifMode | vital-signs-*-widget.xml (:19/:39/:17) | VIEW excluded: `<br>` after diastolic | – |
| js | vital-signs-widget.js:211-222; vital-signs-infant-widget.js:170-181 | summed score ≥ 2 (1 RED, 1 ORANGE or 2 YELLOW) → show `#confirmMsg`, disable Save until `#contactDr` ticked; else hide + enable; also on load (EDIT) | SBP 160 / SpO2 90 etc. |
| js | vital-signs-widget.js:234-241 | ENTER/EDIT: session location uuid in {Postnatal Ward, MCOE Post Op, Kangaroo Care, Quiet Ward} → hide `#fhrDiv` | log in at that location |
| js | tb-symptom-screening-widget.js:5-31 | `#isolationMsg` shown only when all four rows = "yes" (V15); no msg in VIEW (ifMode xml:19) | answer 4× yes / 3× yes |
| js | est-delivery-date-ga.js:146-182 | `#knowing_period_question`: yes → LMP, calculated EDD, EDD, calculated GA; no → estimated GA + EDD; switching clears EDD and the other branch's value | toggle yes/no |
| ifMode | est-delivery-date-ga.js:192-201 | non-VIEW: `setUpEdd` only if `patient.gender == 'F'`; VIEW: groups follow the saved answer | female vs male patient |
| js | est-delivery-date-followup.js:23-100 | non-VIEW: earlier LMP shown if ≤ 305 days before encounter; "last GA/EDD" captions only if this encounter has no own GA/EDD; earlier EDD prefilled if ≤ 305 days | earlier ANC intake obs CIEL:1427/1438/5596 |
| js | setupDrugOrderQuantityCalculations.js:46,59-167 | `.calculated-quantity-section` shown when drug, dose(+units), frequency (frequencyPerDay), duration(+units) and quantity units = drug dosage form allow a calculation; not for DISCONTINUE | drug with one ingredient strength, dose = multiple of it |
| ifMode | mental-health-phq9-gad7-widget.xml | VIEW excluded: the `#phq9-suicide-alert` label | VIEW |
| ifMode | mental-health-phq2.xml:4, tb-symptom-screening-widget.xml:19 | VIEW excluded: PHQ-2 explanation table / `#isolationMsg` | VIEW |

## JavaScript
| Kind | Where | What it does |
|---|---|---|
| navigation | nextAndSubmitButtons.js:1-44 | `#next` → `returnUrl + &goToNext=true` then submit; `.nextSection[id]` → adds `nextSection=<id>&goToNext=true` (deduped) then submit; `#submit` → submit |
| navigation/default | encounter-with-sections.xml:13-35 | ENTER auto-submit rule (above); EDIT calls `setUpNextAndSubmitButtons()` (ENTER form relies on native Save) |
| validation | encounter-provider-location-date.xml:60-105 | disables date/provider selects for non-privileged users; `beforeSubmit` re-enables them so values post; `afterSubmitFailure` disables again |
| derived | vital-signs-widget.js:1-300 | per-vital scores (RED 3, ORANGE 2, YELLOW 1, summed; 0 Normal, 1 Prompt, 2 Urgent, ≥3 STAT) on blur and on load; pregnancy ranges: SBP ≤79 RED, 140-159 Y, ≥160 RED; DBP ≤50 RED, 90-109 Y, ≥110 RED; HR ≤39 RED, 40-49 and 120-130 O, ≥131 RED; RR <12 or >26 O; Temp ≤34.9 or ≥40 RED, 38-38.2 Y, >38.2 O; SpO2 ≤93 RED, <96 O; FHR ≤109 or ≥161 RED (FHR and 2nd FHR). Matches `conceptreferencerange/vitalsRanges.csv`. Sets `#sticky` class and `#statusMessage` (triage), calls `calculateTriagePriority()` if defined, exports `window.drContactRequiredAndMissing` |
| derived | vital-signs-infant-widget.js:43-152 | infant ranges: HR ≤79 / ≥175 RED, 80-99 / 160-174 Y; RR ≤25 / ≥80 RED, 26-29 / 60-79 Y; Temp ≤36 / ≥38 RED, 36-36.5 / 37.5-37.9 Y; SpO2 ≤89 RED, 90-94 Y; glucose (CIEL:1458, mmol/L) <2.6 or >8.3 RED; BP not scored; same Save-disable/`#contactDr` rule |
| prefill | prior-vital-signs-widget.js:28-108 | `GET ws/rest/v1/visit/<visit>?v=custom:(…encounters…obs)`; visit uuid from `encounter.getVisit()` or `?visitId=`; first vitals encounter with obs fills `#last_*`; BMI = kg / (cm/100)², 1 decimal |
| prefill | prior-procedure-widget.js:16-40 | REST `concept/46cbbdd9-…` set members, then `obs?patient=&concept=1651AAAA…&answers=` → `#whProceduresDiv` list "- <procedure> on <date>" (no date limit) |
| derived | est-delivery-date-ga.js:63-126 | LMP change → EDD = LMP + 280 days, GA text "N M/7 weeks"; skipped if LMP > 305 days before encounter; existing EDD/GA preserved on load/unchanged LMP |
| derived | est-delivery-date-ga.js:184-190, edd.js:37 | GA (weeks.days, e.g. 37.4) edited → EDD = encounter date + (280 − days) |
| validation | edd.js:70-91 (used by followup.js:103) | EDD change: error `pihcore.errors.eddField.invalidDate` ("Estimated Delivery Date should not be greater than 10 months from encounter date") and `disableSubmitButton()` when \|EDD − encounter date\| ≥ 305 days; else re-enables |
| prefill | est-delivery-date-followup.js:23-100 | `<lookup>` of latest earlier CIEL:1427/1438/5596 with form name, location, providers → captions; EDD datepicker prefilled (≤ 305 days); encounter date from `encounter.getEncounterDatetime()` else datepicker |
| derived | setupDrugOrderQuantityCalculations.js:6-172 | `orderWidget.initialize` then quantity = units/dose × doses/day × days (days×1, weeks×7, months×30, years×365); sets quantity units to drug dosage form; translates "Calculate Quantity"/"Clear" buttons |
| derived | renderOrderWidgetAsCheckboxes.js:9-83 | one checkbox per concept; checked = order exists in this encounter; check → action NEW, uncheck existing → DISCONTINUE; VIEW shows "[X]/[  ] label" |
| validation | sl.js:13-57 | `updateLastCheckboxRequired(container, msgId, msg)`: no checkbox ticked → msg shown, focus last box, `beforeSubmit` returns false (blocks save) |
| validation | mch.js:120-164 | `eddCannotBeOlderThanTwoWeeks` (EDD > 14 days before encounter), `validateEstimatedDeliveryDate` (> 305 days) |
| default/derived | mch.js:53-118, 210-242 | `setUpEdd` (LMP→EDD/GA), `setUpGestationalAgeAtBirth`; mentalHealth forms only |
| navigation | save-and-print-button.js:1-37 | `#save-and-print-button` click → flag + submit; `beforeSubmit` appends `printForm=true` to returnUrl (plain Save clears flag) → visit page prints |
| default | hideIfEmpty.js:1-9 | VIEW: hides `.emptyValue` and every selector match without `.value` |
| validation | setRequiredIfVisible.js:2-14 | shows "*Required" in sibling `.field-error` if element visible and empty; returns bool (only mch.js calls it) |
| prefill/derived | pihServices.js, htmlFormFunctions.js, checkboxRadio.js, expandable.js | not referenced by current forms (REST concept/condition lookups; `showSectionBasedOnCondition`; mutually exclusive `.checkbox-radio-option`; `setUpExpandableSection`) |

## Verify findings
| ID | Severity | Location | Problem | User-visible consequence | Fix |
|---|---|---|---|---|---|
| V1 | High (**FIXED**, SL-1457, superseded by SL-434) | mental-health-phq9-gad7-scores.xml:162 (and :88), replaced by mental-health-phq9-gad7-widget.xml | "Total GAD-7 score" used `CIEL:165137` (= PHQ-9 score); GAD-7 is `CIEL:165185` | GAD-7 was saved as a second PHQ-9 obs; GAD-7 never stored; edit pre-fill could show one value in both boxes | the widget saves PHQ-9 under PIH:11586 (= CIEL:165137) and GAD-7 under PIH:11733 (= CIEL:165185) |
| V2 | Medium | vital-signs-widget.js:217,221; vital-signs-infant-widget.js:176,180; edd.js:73,85 (called from est-delivery-date-followup.js:103) | `calculatePriority()` calls `htmlForm.enableSubmitButton()` on every vitals blur/load, undoing any other `disableSubmitButton()` validator | section-anc-followup (vital-signs-anc-widget + followup EDD check): invalid EDD (≥ 305 days) disables Save, then any vitals blur re-enables it; error text stays but Save works (section-anc-intake is not affected: its LMP check uses `getBeforeValidation`) | have validators set flags and let one function decide enable/disable (cf. triage.xml `validateForm`) |
| V3 | Medium | est-delivery-date-ga.css:156 vs prior-vital-signs-widget.js:49, .xml:6 | page-global `.hidden{display:none !important}`; `#lastVitals.hidden` revealed with `.show()` (inline style) | in section-anc-intake/-followup (both widgets on page) the "most recent vitals" box never appears | `removeClass('hidden')` in the JS, or scope CSS to `#edd-and-ga-widget .hidden` |
| V4 | Medium | vital-signs-widget.js:222; vital-signs-infant-widget.js:181; vital-signs-*.xml `#contactDr` | `#confirmMsg` is only hidden when vitals normalise; `#contactDr` stays ticked | stale PIH:20925 = Yes ("clinician notified") saved with normal vitals | in the else branch `jq('#contactDr input').prop('checked', false)` |
| V5 | Medium | rapid-tests-widget.xml:135 | label "Hepatitis B (HbsAb)" (antibody) but obs `id="HBsAg"`, concept CIEL:159430 = Hepatitis B surface antigen test | clinician may record an antibody result as antigen | label "HBsAg" (or change concept) |
| V6 | Low | sl.js:36-56; section-heart-failure.xml:36-40 | helper has no mode guard and focuses the last checkbox on init; caller is not inside `ifMode` | VIEW shows a "Required" error (no checkboxes exist); ENTER/EDIT scroll-jump to `#hf-main-dx` on load | wrap call in `ifMode VIEW include="false"`; drop focus on first call |
| V7 | Low | encounter-with-sections.xml:15 | `jq(this).val().trim()` throws TypeError when `.val()` is null (select with no options, e.g. no location with the form's tag) (unconfirmed in browser) | handler aborts, `.htmlform` stays hidden in ENTER: blank page | `(jq(this).val() \|\| '').toString().trim()` |
| V8 | Low | encounter-provider-location-date.xml:73 | privilege `Task: retroConsultNoteThisProviderOnly` lacks `emr.` (real: `Task: emr.retroConsultNoteThisProviderOnly`, privileges.csv:75) | latent: only roles that also hold `emr.retroConsultNote` have it, so no current user affected | add `emr.` |
| V9 | Low | vital-signs-widget.js:1-4, 7-141 | pregnancy-only ranges (TODO SL-1153) applied to every patient of the 5 forms incl. inpatientVitals, triage | non-pregnant/male patients get colour scores and the Save-blocking `#contactDr` rule | per-patient ranges or restrict to pregnant patients |
| V10 | Low | vital-signs-infant-widget.xml:81 vs newbornDailyProgress.xml:425, newbornDischarge.xml:339, newbornInitial.xml:493; encounter-provider-location-date.xml:143 vs newbornAssessment.xml:100, newbornDailyProgress.xml:265, newbornDischarge.xml:153, postpartumDailyProgress.xml:243, maternalDischarge.xml:131, gainMaternalRegister.xml:286, gainNewbornRegister.xml:87 | duplicate `id="glucose"` (CIEL:1458 mmol/L vs form CIEL:887) and duplicate `id="when"` | `#glucose` / `#when` locators match two elements; two glucose fields | rename form-level ids |
| V11 | Low | edd.js:83 (`>= 305`), mch.js:156 (`> 305`), est-delivery-date-followup.js:38,88 (`<= 305`), est-delivery-date-ga.js:85 (`< 305`), section-anc-intake.xml:46 (`> 305`) | inconsistent 305-day boundary | at exactly 305 days EDD is prefilled yet invalid, or LMP accepted but no EDD computed; mch.js version wins on mentalHealth forms | one shared constant/comparison |
| V12 | Low | est-delivery-date-ga.js:184-188; est-delivery-date-followup.js:105-109; edd.js:37-48 | `Number('')`=0 → clearing GA sets EDD = encounter + 280 days; fraction > .6 (e.g. 37.7) read as 7 days | wrong EDD after clearing/typo | ignore empty; validate 0-6 days |
| V13 | Low | est-delivery-date-followup.js:25-35,50-63,80-83 | `<lookup>` output (form/location/provider names, fr encounter-type names) placed inside single-quoted JS strings (unconfirmed escaping) | an apostrophe breaks the script: no prefill, no EDD validation | JSON-escape or `.replace` before output |
| V14 | Low | est-delivery-date-ga-initial.xml:69-75; est-delivery-date-ga.js:66,104-106; edd.js:54 | `#manualEddGroup` never unhidden; `getField("gestationalAge.value")` targets a `<div>` (no obs) so the GA write is a no-op; `calculateEddFromLmp` unused | dead code, misleading for test authors | remove |
| V15 | Low | tb-symptom-screening-widget.js:6-10, :23 | isolation message needs ALL four "yes" (AND), copy in triage.xml; `.isolation` selector matches nothing (intent unconfirmed) | message hidden when 1-3 symptoms present | confirm rule; likely "any yes" |
| V16 | Low | prior-procedure-widget.js:16,30,37 | REST `custom:(…` strings miss a closing `)` (unconfirmed server tolerance); `.append('<li>')…append('</li>')` leaves empty `<li>` with text outside; top-level `const contextPath/apiBaseUrl/patientUuid` are page-global | list may not load; ugly bullets; clash if another script declares same names | balance parens; build `<li>` with text |
| V17 | Low | maternalDischarge.xml:256 vs save-and-print-button.xml:1; save-and-print-button.js:25-33 | two elements `id="save-and-print-button"` (works because the button is first in DOM); `printForm=true` is appended after any `#hash` in returnUrl (unconfirmed) | locator ambiguity; print flag lost if returnUrl has a hash | rename wrapper; insert before `#` |
| V18 | Low | nextAndSubmitButtons.js:3; :1-6 vs :8-32 | `#next` uses `split('#')[1]` (→ `#undefined` without hash) and does not dedupe `goToNext` / clear a leftover `nextSection` (unconfirmed) | after a failed `.nextSection` submit, Next may go to the wrong section | reuse the dedupe logic of `.nextSection` |
| V19 | Info | encounter-with-sections.xml:12-37 | header forms render nothing in VIEW; ENTER auto-saves an encounter with only provider/location/date when prefilled | test must expect redirect to the first section form, not a visible header form | – |
| V20 | Info | vital-signs-widget.js:253; vital-signs-infant-widget.js:202 | VIEW: `removeClass('value')` on filled vitals and 100 ms `setTimeout` colour classes | `.value` selectors/`hideIfEmpty` miss vitals; wait ~100 ms before asserting colours | – |
| V21 | Low (**mitigated**, SL-434) | mental-health-phq9-gad7-scores.xml (replaced) | the GAD-7 total accepted 0-27 (the PHQ-9 range) while its label said 0-21 | an out-of-range GAD-7 total (22-27) was accepted and saved | the widget calculates the total from seven 0-3 answers (max 21); the input itself still has no max, so a typed value is only bounded by the concept's range |

## Confirmed by the e2e specs (against the KGH test server, 2026-10-23)
Per-form bugs live in the header of each spec (`e2e/specs/<form>/<form>.spec.ts`); only what concerns the shared code is recorded here. Findings not listed were not exercised.

| ID | Status | Where |
|---|---|---|
| V1 | **Fixed** (SL-434): the former `test.fail()`s are now normal tests: PHQ-9 = 9 and GAD-7 = 21 (calculated from the answers) are saved under CIEL:165137 and CIEL:165185, a GAD-7 saved alone saves no PHQ-9 and reopens in the GAD-7 box; also the totals' calculation and the question 9 alert | `mentalHealth.spec.ts` |
| V2 | **Confirmed** twice: an invalid EDD disables Save, then a vitals blur re-enables it (`section-anc-followup`); Save is enabled after tabbing out of a vital with no disposition chosen, only on a keyboard Tab (`triage`). Both asserted with `test.fail()` (remove the marker when fixed) | `section-anc-followup.spec.ts`, `triage.spec.ts` |
| V3 | Observed: the "most recent vitals" box never appears in the ANC followup section. Not asserted | `section-anc-followup.spec.ts` header |
| V6 | Partly exercised: the "Required" message from `sl.js` with no main diagnosis ticked. The VIEW and focus effects are not asserted (VIEW cannot be opened for an encounter created over REST) | `section-heart-failure.spec.ts` |
| V10 | **Confirmed**: duplicate `id="when"` and `id="glucose"` are in the rendered newborn forms, so a locator by that id matches two elements | `newborn*` and `postpartumDailyProgress` specs (referenced in their headers) |
| V11 | Referenced only: the 305-day boundary differs between `edd.js` and the section's widget (LMP > 305 days is not tested) | `section-anc-intake.spec.ts` header |
| V19 | **Confirmed**: opening `ancIntake.xml` in ENTER with the default provider and the session location (MCH OPD) saves an encounter with no obs and redirects to the return URL | `ancIntake.spec.ts` |
| V15 | Behaviour confirmed: `#isolationMsg` shows only when all four TB radios are "yes"; with 1, 2 or 3 "yes" it stays hidden, and 3 yes + 1 no hides it again. Whether "any yes" was intended cannot be settled from the code | `triage.spec.ts` |
| V17 | Referenced: Save&Print adds `printForm=true` to the return URL (asserted); the duplicate id itself is not asserted | `maternalDischarge.spec.ts` |

Facts about the shared code learned while writing the specs:
- `vitals.xml` and `vitalsWithGlucose.xml` include only `encounter-provider-location-date`; the `vital-signs-*` widgets are not part of them.
- A form using the HFE `<submit>` tag renders `input.submitButton` inside `#buttons`, not `#submit`; `nextAndSubmitButtons.js` is not involved there.
