# Form availability — Sierra Leone (KGH, Wellbody)

When is each form of the merged Sierra Leone htmlforms directory (128 forms: `pihsl-emr`'s own plus those inherited from `pihemr`) offered to a user, and on which profile? Written once for all forms; specs cite the form's row. Rebuilt on 2026-11-06 from pihcore **master** (the 2026-10-22 version covered only the forms that had a spec and read an older pihcore).

**Result:** 78 reachable (76 with a spec, 2 not covered: `edNote`, `echocardiogram`) + 50 not reachable = 128 forms. All six forms that were to be specced now have specs (labResults, the four registration widget forms, section-prescriptions-print).

**Sources (local checkouts, read 2026-11-06):**
- `openmrs-module-pihcore` **master** `d2f3370a3f71c92babe329934086e205aefd7a15` (2026-11-06 11:40 -0500, "UHM-9527: bump up htmlformentryui version"; scratch checkout `.../scratchpad/pihcore-master`): `api/.../apploader/{CustomAppLoaderFactory,RequireUtil,CustomAppLoaderUtil}.java`, `config/{Components,Config,ConfigLoader}.java`, `PihEmrConfigConstants.java`. Line numbers below are `CustomAppLoaderFactory.java` of this commit unless stated. The SL distro depends on a SNAPSHOT of pihcore, so a deployed server may differ from this commit.
- `pihemr` `0e852f67b7e574922b0f3bf2aa2baf3e9420d6cb` (2026-11-06 12:03, "Update PIH OCL export to 1.8.51 (#777)"): the checkout is on the local branch `UHM-9592-e2e-skill`, which is the same commit as `origin/master` (`git diff origin/master 0e852f67` is empty; the local `master` is behind at `62e59087`). Files: `scripts/visit/encounterTypeConfig.js`, `htmlforms/`. `pihsl-emr/distro/pom.xml` pins `pihemr-content` `3.6.0-SNAPSHOT`; whether that snapshot equals this commit is unverified.
- `pihsl-emr` HEAD `ce7a712` (2026-10-31) plus uncommitted changes under `e2e/` and `documentation/`: `pih-config-sierraLeone*.json`, `htmlforms/`, `e2e/specs/`, `*.env`.
- **Merged directory** `distro/target/distro/web/openmrs_config/pih/htmlforms` (128 forms, built 2026-10-29 11:35) is **older than pihemr master**. Differences found: `deathCertificate.xml` is still in `htmlforms/` (master: `retired/`, UHM-9646 `50d9f997`, 2026-11-03), which is why the coverage guard counts it; `edNote.xml` and `outpatientConsult.xml` still carry the `deathCertificate` post-submission redirect that master removed; `labResults.xml` is the version before pihemr `cd7788cf` (HAI-1249: new answer, troponin concepts, layout); the merged `encounterTypeConfig.js` has `templateModelUrl` **commented out** for `section-dx` and `section-dx-obgyn` (master: active), so there the diagnosis block is drawn by `dxLong.page` from the REST encounter, with no HFE VIEW of the section; a section-dx spec must say which one it tests. `pihsl-emr`'s own forms equal the merged copies apart from expanded `${providerGroup.*}` placeholders (checked by diff on every own form). Everything else in `htmlforms/` and `encounterTypeConfig.js` is identical to master. Rebuild the distro before writing specs for the forms named here.
- **Configs:** `pih-config-sierraLeone*.json` (this repo). Stacks (`*.env`, `OPENMRS_PIH_CONFIG`): **kgh-ci** = `sierraLeone,sierraLeone-kgh,sierraLeone-kgh-ci` (the server the specs run on); `kgh` = `sierraLeone,sierraLeone-kgh`; `wellbody` = `sierraLeone,sierraLeone-wellbody`; `wellbody-ci` = `sierraLeone,sierraLeone-wellbody,sierraLeone-wellbody-ci`. `sierraLeone-wellbody-demo` is in **no** env file. Composition is **replacement, not union**: `ConfigLoader.merge` recurses into JSON objects and *replaces* arrays and scalars, so a later file's `components` replaces the earlier one's. In every stack above exactly one file sets `components` (`sierraLeone` sets none; `-kgh-ci` is `{}`), so the effective list is that of the site file, except `wellbody-ci`, whose own list replaces `wellbody`'s (it is `wellbody` plus `spaPreview`, which adds no form).

## Which profile offers what

Components per profile column (from the JSON; effective list as just described):

| Column | Stack(s) | `components` that gate forms |
|---|---|---|
| **KGH** | kgh-ci (spec server), kgh | `checkIn`, `vitals`, `programs`, `ncd`, `mentalHealth`, `primaryCare`, `patientRegistration`, `mchForms`, `mchGynecologyForms`, `mcoeForms`, `mchTriage`, `adtO3`, `surgery`, `labResults`, `infantProgram`, `pregnancyProgram` (+ `ayfsProgram`, `familyPlanningProgram`, `gynecologyProgram`, `pmtctProgram`, `pregnancyMentalHealthProgram`: dashboards only). **No** `mchBasicDeliveryForm`. `kgh-ci` adds nothing |
| **Wellbody** | wellbody, wellbody-ci | `checkIn`, `vitals`, `programs`, `ncd`, `mentalHealth`, `primaryCare`, `patientRegistration`, `mchForms`, `mchBasicDeliveryForm`, `infantProgram`, `pregnancyProgram`. No `mchGynecologyForms`, `mcoeForms`, `mchTriage`, `adtO3`, `surgery`, `labResults` |
| **Wellbody-demo** | no env file; `sierraLeone-wellbody-demo.json` | as Wellbody **minus** `infantProgram`, `pregnancyProgram`, **plus** `echocardiogram`, `edConsult`, `spaPreview`. How it is deployed (stacked on `sierraLeone-wellbody`, which keeps `site: WELLBODY`, or alone, which sets no `site`) is unverified; the app loader never reads the site for SL forms (see below) |

`components` that **no** SL profile lists (and which gate forms): `adt`, `chemotherapy`, `oncology`, `commentForm`, `covid19`, `covid19IntakeForm`, `dispensing`, `dispensingForm`, `medicationOrder`, `drugRehab`, `consult`, `consultInitial`, `nurseConsult`, `ovc`, `vaccination`, `socioEconomics`, `obgyn`, `mchGAINMaternal`, `mchGAINNewborn`, `mch`, `mchProgram`, `hiv*`, `pmtct`, `prep`, `exposedInfant`, `tb`, `epilepsy`, `vct`, `prescription`, `familyMedicine`, `physicalRehab`. SL uses the SPA `medicationDispensing` instead of the legacy dispensing form.

## Shared layers (apply to every row below)

1. **Entry point = visit action** (`visitAction(...)`, shown on the visit page) unless the row says otherwise. Launch URL shapes (`CustomAppLoaderUtil` :553-575): `enterStandardHtmlFormLink` = `htmlformentryui/htmlform/enterHtmlFormWithStandardUi.page?patientId={{patient.uuid}}&visitId={{visit.id}}&definitionUiResource=file:configuration/pih/htmlforms/<form>.xml`; `enterSimpleHtmlFormLink` = the same with `enterHtmlFormWithSimpleUi.page`; `...WithoutVisit` drops `visitId`; `andCreateVisit()` appends `&createVisit=true` (registration actions); edit links use `editHtmlFormWith{Simple,Standard}Ui.page?patientId=&encounterId=&definitionUiResource=`. Most MCH/NCD/mental health/outpatient links append `&returnUrl=/openmrs/<visit page of the visit>`. The **Simple UI** forms are `checkin`, `checkinMaternal`, `vitals`, `vitalsWithGlucose` and `labResults`; every other form uses the Standard UI.
2. **Component flag, two layers.** *Top level* (`loadAppsAndExtensions`, dispatcher :210-520): `checkIn` :242, `mchTriage` :246, `vitals` :250, `consult` :255, `edConsult` :267, `adt` :271, `adtO3` :275, `dispensing` :287, `dispensingForm` :291, `medicationOrder` :299, `surgery` :307, `labResults` :311, `patientRegistration` :349, `primaryCare` :374, `socioEconomics` :438, `mchForms` :454, `mchGAINMaternal` :462, `mchGAINNewborn` :466, `mcoeForms` :470, `covid19` :474, `covid19IntakeForm` :478, `commentForm` :494, `drugRehab` :506. *Inside `enablePrograms`* (:4131, called :490, **needs `programs`**): `mentalHealth` :4224, `ncd` :4248 (**`echocardiogram` is nested inside `ncd`**, :4252, so it needs `programs` + `ncd` + `echocardiogram`), `ovc` :4257, `vaccination` :4262, `oncology` :4268, `infantProgram` :4188, `pregnancyProgram` :4279. All three SL columns list `programs`, so that wrapper never separates them. Inside `enableMCHForms` (:2266, SL block :2354) three more flags: `mchGynecologyForms` :2393, `mchBasicDeliveryForm` :2456, `obgyn` :2471.
3. **Country branch** = `SIERRA_LEONE` (`sierraLeone` sets `country`). The SL branch is picked inside `enableMCHTriage` (:605), `enableCheckIn` (:672), `enableVitals` (:755), `enableNCDs` (:2167), `enableMCHForms` (:2354), the GAIN methods, `enableMCOEForms` (:2514), `enableMentalHealthForm` (:2702), `enablePrimaryCare` (:2987), `enablePatientRegistration` (:1788, :1803). **The app loader never reads the site (`isSite`, `isKgh`, `isWellbody`) for any form offered in SL**, and `encounterTypeConfig.js` has no `KGH`/`WELLBODY` key: the KGH and Wellbody columns differ only in components and in which locations carry which tag.
4. **Privilege** (`PihEmrConfigConstants`): `Task: emr.enterMCH` for MCH/MCOE forms; `Task: emr.enterNCDConsultNote`, `Task: emr.enterMentalHealthNote`, `Task: emr.enterSurgicalNote`, `Task: emr.enterLabResults`, `Task: emr.triage`, `Task: mirebalais.checkinForm`; vitals and outpatient forms have none on the action itself (the `retro` expression carries them for vitals). The e2e admin user has them all.
5. **Session location tag.** The user must be logged in at a location carrying the tag (`sessionLocationHasTag`). The e2e harness logs in at **MCH OPD** (KGH). MCH OPD carries `Maternal and Child Location`, `Check-In Location`, `Vitals Glucose Location`, `Maternal Death Location` (plus Appointment, Archives, Dispensing, Infant/Pregnancy Program Dashboard, Labs Component and Login), per `locationtagmaps-site-kgh.csv`. Other tags live on other KGH locations (named per row). Wellbody locations: Clinic, MCH, Triage, NCD, Mental Health, Laboratory, Pharmacy; **no Wellbody location carries** `Check-In Maternal`, `Vitals Inpatient`, `MCH Triage`, `NICU`, `Antenatal`, `Delivery`, `Postnatal`, `Maternal Admission`, `Newborn *`, `Surgery Note` or `Transfer`; **neither KGH nor Wellbody carries** `ED Note Location` or `Echocardiogram Location` (the tags exist in `locationtags.csv`, no map uses them).
6. **Visit/patient `require` expressions** (from `RequireUtil`, resolved):

| Helper | Expression |
|---|---|
| `patientIsFemale()` | `patient.person.gender == 'F'` |
| `patientIsReproductiveAge()` | `patient.person.age >= 10` |
| `patientIsAdolescentYouth()` | `patient.person.age >= 10 && patient.person.age < 25` (any sex; AYFS) |
| `patientDead()` | `patient.person.dead` |
| `patientAgeInDaysLessThanAtVisitStart(n)` / `...OlderThan...(n)` | `visit && patient && daysBetweenDates(patient.person.birthdate, visit.startDatetimeInMilliseconds) < n` / `> n` (newborn forms 42, Ballard 31, inpatient newborn vitals 42, inpatient vitals `> 41`) |
| `visitDoesNotHaveEncounterOfType(t)` | `visit && (!visit.encounters \|\| !some(visit.encounters, e => e.encounterType.uuid === t))`: no such encounter in the *current visit* |
| `patientHasPreviousEncounter(t)` | `encounters && some(encounters, e => e.encounterTypeUuid === t)`; always used as `not(...)`: the patient has no earlier encounter of type `t` in **any** visit |
| `patientDoesNotHaveEncounterOfTypeDuringProgramEnrollment(t, p)` | `!patientHasEncounterOfTypeDuringProgramEnrollmentThatIsActiveOnVisitDate(patientPrograms, p, encounters, t, visit)`; true when the patient is **not** enrolled, so ANC intake needs no enrolment |
| `patientHasActiveVisit()` | `typeof visit !== 'undefined' && visit != null && visit.stopDatetime == null` |
| **`retro`** (vitals, glucose vitals, NCD; not a helper, the same `or(...)` written out in each action) | `or( and(hasPriv(the form's enter privilege: "Task: emr.enterVitalsNote", for NCD "Task: emr.enterNCDConsultNote"), patientHasActiveVisit()), hasPriv("Task: emr.retroConsultNote"), and(hasPriv("Task: emr.retroConsultNoteThisProviderOnly"), visit ended < 30 days ago) )`. Outpatient, MCH and mental health forms have no `retro` |

7. **Extra entry points (clones).** `cloneAsPregnancyVisitAction` / `cloneAsInfantVisitAction` re-register the same action (same privilege + `require`) on the Pregnancy / Infant **program dashboard** visit page; they need `pregnancyProgram` / `infantProgram` (KGH and Wellbody yes, `wellbody-demo` no). `cloneAsMchVisitAction` clones (check-in, vitals) go to the MCH program dashboard, which no SL profile enables (`mch`/`mchProgram`), so they never show.
8. **View / edit / print** of a saved encounter is configured separately, in `encounterTypeConfig.js` (see "Visit-page configuration").

Fixture shorthand: "female, age>=10" = `gender F` and `age >= 10` at the time the visit page renders (current age, not visit-start age, for these helpers).

## Forms

`KGH` / `Wellbody` / `Demo` = yes/no from resolving the enclosing `isComponentEnabled` blocks against that profile's list (nested flags resolved, see the shared layers). A `yes` does not guarantee that a location carries the tag; the notes say where none does. **Spec** = the form has a spec, or is in `## To spec` / `## Not covered`. "No-visit-dup" = `visitDoesNotHaveEncounterOfType(own type)`.

### Top-level (entry) forms

| Form file | Offered by (method, entry point) | Component | Privilege | Session location tag | Patient / visit requirement | KGH | Wellbody | Demo | Spec / notes |
|---|---|---|---|---|---|---|---|---|---|
| `ancIntake.xml` | `enableMCHForms` :2266, `MCH_ANC_INTAKE` :2329 (+ pregnancy clone) | `mchForms` | enterMCH | Maternal and Child Location (KGH: MCH OPD; WB: Clinic, MCH) | female, age>=10; visit has neither ANC intake nor ANC followup; patient has no ANC intake in a Pregnancy enrolment active on the visit date | yes | yes | yes | spec |
| `ancFollowup.xml` | `enableMCHForms`, `MCH_ANC_FOLLOWUP` :2343 (+ pregnancy clone) | `mchForms` | enterMCH | Maternal and Child Location | female, age>=10; visit has neither ANC intake nor ANC followup | yes | yes | yes | spec |
| `postnatalFollowup.xml` | `enableMCHForms` SL block :2359 (+ pregnancy) | `mchForms` | enterMCH | Maternal and Child Location | female, age>=10; no-visit-dup | yes | yes | yes | spec |
| `familyPlanningIntake.xml`, `familyPlanningFollowup.xml` | `enableMCHForms` :2371, :2384 (+ pregnancy) | `mchForms` | enterMCH | Maternal and Child Location | female, age>=10; visit has neither FP intake nor FP followup | yes | yes | yes | spec (both). Share one `formUuid`, bound to two encounter types (`52fe1a29` intake, `5a1d1710` followup) |
| `gynecologyIntake.xml`, `gynecologyFollowup.xml` | `enableMCHForms` :2399, :2411 | `mchForms` **and** `mchGynecologyForms` | enterMCH | Maternal and Child Location | female, age>=10; visit has neither gyn intake nor gyn followup | yes | no | no | spec (both) |
| `ayfsIntake.xml`, `ayfsFollowup.xml` | `enableMCHForms` :2424, :2436 | `mchForms` | enterMCH | Maternal and Child Location | age 10-24, any sex; visit has neither AYFS intake nor followup | yes | yes | yes | spec (both) |
| `cervicalCancerScreening.xml` | `enableMCHForms` :2448 (+ pregnancy) | `mchForms` | enterMCH | Maternal and Child Location | female, age>=10; no-visit-dup | yes | yes | yes | spec |
| `delivery.xml` | `enableMCHForms` :2461, `MCH_DELIVERY` (+ pregnancy), only `if mchBasicDeliveryForm` :2456 | `mchForms` **and** `mchBasicDeliveryForm` | enterMCH | Maternal and Child Location | female, age>=10; no-visit-dup | no | yes | yes | spec. "For Wellbody only ... KGH has L&D and other forms" (comment :2353) |
| `triage.xml` | `enableMCHTriage` :604 SL branch, `MCH_TRIAGE` :607 | `mchTriage` | `Task: emr.triage` | MCH Triage Location (KGH: MCOE Triage, NICU; not MCH OPD) | female, age>=10; no SL MCH-triage encounter in visit | yes | no | no | spec. The method also adds a SPA triage-queue home app (tag Queue Location) |
| `newbornInitial.xml` | `enableMCOEForms` :2513 (+ infant) | `mcoeForms` | enterMCH | NICU Location (KGH: NICU) | age < 42 days at visit start; no-visit-dup | yes | no | no | spec |
| `newbornAssessment.xml` | `enableMCOEForms` :2532 (+ infant) | `mcoeForms` | enterMCH | Newborn Assessment Location (KGH: Labour and Delivery, MCOE PACU, Postnatal Ward, Staff Ward) | age < 42 days; no-visit-dup | yes | no | no | spec |
| `newbornDailyProgress.xml` | `enableMCOEForms` :2544 (+ infant) | `mcoeForms` | enterMCH | Newborn Daily Progress Location (KGH: NICU, MCOE PACU, Postnatal Ward) | age < 42 days (repeatable) | yes | no | no | spec |
| `newbornDischarge.xml` | `enableMCOEForms` :2555 (+ infant) | `mcoeForms` | enterMCH | Newborn Discharge Location | age < 42 days (no dup check) | yes | no | no | spec |
| `nicuTriage.xml` | `enableMCOEForms` :2566 (+ infant) | `mcoeForms` | enterMCH | MCH Triage Location (KGH: MCOE Triage, NICU) | age < 42 days (no dup check) | yes | no | no | spec |
| `ballardScore.xml` | `enableMCOEForms` :2577 (+ infant) | `mcoeForms` | enterMCH | NICU Location | age < 31 days at visit start | yes | no | no | spec |
| `pacuFollowup.xml` | `enableMCOEForms` :2588 (+ pregnancy) | `mcoeForms` | enterMCH | PACU Location (KGH: MCOE PACU) | female, age>=10 | yes | no | no | spec |
| `ancProgress.xml` | `enableMCOEForms` :2599 (+ pregnancy) | `mcoeForms` | enterMCH | Antenatal Progress Location (KGH: MCOE Triage, Antenatal Ward) | female, age>=10 | yes | no | no | spec |
| `laborProgress.xml` | `enableMCOEForms` :2610 (+ pregnancy) | `mcoeForms` | enterMCH | Antenatal Location (KGH: MCOE Triage, Labour and Delivery, Antenatal Ward, Staff Ward) | female, age>=10 | yes | no | no | spec |
| `laborDeliverySummary.xml` | `enableMCOEForms` :2621 (+ pregnancy) | `mcoeForms` | enterMCH | Delivery Location (KGH: MCOE Triage, Labour and Delivery, Antenatal Ward, MCOE Pre-Op, Staff Ward) | female, age>=10; no-visit-dup | yes | no | no | spec |
| `postpartumDailyProgress.xml` | `enableMCOEForms` :2633 (+ pregnancy) | `mcoeForms` | enterMCH | Postnatal Location | female, age>=10 | yes | no | no | spec |
| `maternalAdmission.xml` | `enableMCOEForms` :2644 (+ pregnancy) | `mcoeForms` | enterMCH | Maternal Admission Location | female, age>=10; visit has neither a maternal-admission nor a generic Admission encounter | yes | no | no | spec. Uses the **Admission** encounter type (same as `newbornAdmissionNote`) |
| `maternalDischarge.xml` | `enableMCOEForms` :2657 (+ pregnancy) | `mcoeForms` | enterMCH | Maternal Discharge Location | female, age>=10; no-visit-dup | yes | no | no | spec |
| `maternalDeath.xml` | `enableMCOEForms` :2669 (+ pregnancy) | `mcoeForms` | enterMCH | Maternal Death Location (KGH: MCH OPD and the wards) | `patient.person.dead`; no-visit-dup | yes | no | no | spec |
| `newbornAdmissionNote.xml` | `enableADTO3` :977, `ADMISSION_NOTE` :992 | `adtO3` | enterMCH | Newborn Admission Note Location (KGH: Labour and Delivery, NICU, Postnatal Ward, Staff Ward) | age < 42 days; visit has no Admission encounter | yes | no | no | spec. `adtO3` also adds the SPA inpatient-ward home app |
| `checkin.xml` | `enableCheckIn` :627: visit action :652 and registration action :663 (`&createVisit=true`); edit link registered :700; also the registration-summary "most recent check-in" widget :1802 | `checkIn` | `Task: mirebalais.checkinForm` | Check-In Location (KGH: MCH OPD and 14 others; WB: all clinical locations) | none beyond the tag | yes | yes | yes | spec. Simple UI. SL keeps `checkin.xml` (Haiti non-HSN sites switch to `checkin_v3.5`) |
| `checkinMaternal.xml` | `enableCheckIn` SL block :672: visit action :678 (+ pregnancy, + infant clones) and registration action :691 | `checkIn` | `Task: mirebalais.checkinForm` | Check-In Maternal Location (KGH: MCOE Triage, MCOE Inpatient Registration) | visit has no maternal check-in (visit action only) | yes | yes | yes | spec. **No Wellbody location carries the tag**, so it is not usable there |
| `vitals.xml` | `enableVitals` :703, `VITALS_CAPTURE` :743 (+ pregnancy, infant clones); Simple UI | `vitals` | none on the action | Vitals Location **and not** Vitals Inpatient Location (KGH: of the 12 locations with Vitals Location only **KGH Mental Health** lacks Vitals Inpatient Location, the 11 MCOE wards carry both; WB: Clinic, Mental Health) | `retro` | yes | yes | yes | spec. Not offered at MCH OPD or KGH NCD (neither has the tag) |
| `inpatientVitals.xml` | `enableVitals` SL block :755, action :785; Standard UI | `vitals` | none; `retro` | Vitals Inpatient Location (KGH: MCOE wards; none at WB) | age > 41 days at visit start | yes | yes | yes | spec. No Wellbody location carries the tag |
| `inpatientNewbornVitals.xml` | `enableVitals` SL block, action :797 | `vitals` | none; `retro` | Vitals Inpatient Location | age < 42 days at visit start | yes | yes | yes | spec. Same tag note |
| `vitalsWithGlucose.xml` | `enableNCDs` SL block :2167; Simple UI | `programs` + `ncd` | none; `retro` | Vitals Glucose Location (KGH: **MCH OPD**, KGH NCD; WB: MCH, NCD) | `retro` | yes | yes | yes | spec |
| `ncd-initial.xml` | `enableNCDs` :2116, `NCD_INITIAL` :2125 | `programs` + `ncd` | `Task: emr.enterNCDConsultNote` | NCD Consult Location (KGH: KGH NCD; WB: Wellbody NCD) | `retro`; visit has no NCD initial, part-1, part-2, followup, followup part-1/part-2; patient has no earlier initial, part-1 or part-2 | yes | yes | yes | spec |
| `ncd-initial-part-1.xml` | `enableNCDs` SL block :2183 | `programs` + `ncd` | enterNCDConsultNote | NCD Consult Location | `retro`; visit lacks initial, own part and every followup variant (not part-2); patient has no earlier initial or part-1 | yes | yes | yes | spec |
| `ncd-initial-part-2.xml` | `enableNCDs` SL block :2201 | `programs` + `ncd` | enterNCDConsultNote | NCD Consult Location | as part-1 with part-2 in place of part-1 | yes | yes | yes | spec |
| `ncd-followup.xml` | `enableNCDs`, `NCD_FOLLOWUP` :2150 | `programs` + `ncd` | enterNCDConsultNote | NCD Consult Location | `retro`; visit has none of the six NCD initial/followup types | yes | yes | yes | spec |
| `ncd-followup-part-1.xml` | `enableNCDs` SL block :2219 | `programs` + `ncd` | enterNCDConsultNote | NCD Consult Location | `retro`; visit has no initial of any variant, no full followup, no followup part-1 | yes | yes | yes | spec |
| `ncd-followup-part-2.xml` | `enableNCDs` SL block :2235 | `programs` + `ncd` | enterNCDConsultNote | NCD Consult Location | `retro`; visit has no initial of any variant, no full followup, no followup part-2 | yes | yes | yes | spec |
| `mentalHealth.xml` | `enableMentalHealthForm` :2695 SL branch, `MENTAL_HEALTH` (`&returnUrl`) | `programs` + `mentalHealth` | `Task: emr.enterMentalHealthNote` | Mental Health Location (KGH: KGH Mental Health; WB: Clinic, Mental Health) | **first assessment only**: patient has no earlier assessment (any visit); visit has neither assessment nor followup | yes | yes | yes | spec |
| `mentalHealthFollowup.xml` | `enableMentalHealthForm` SL branch :2718 | `programs` + `mentalHealth` | enterMentalHealthNote | Mental Health Location | visit has neither assessment nor followup (no need for a prior assessment) | yes | yes | yes | spec |
| `outpatient-initial.xml`, `outpatient-followup.xml` | `enablePrimaryCare` :2907 SL branch :2993, :3004 | `primaryCare` | none | Consult Note Location (KGH: KGH Triage; WB: Clinic, MCH, Triage) | visit has neither outpatient initial nor followup | yes | yes | yes | spec (both). The Haiti branch of the same method offers `primary-care-*` instead |
| `surgicalPostOpNote.xml` | `enableSurgery` :1240, `SURGICAL_NOTE` :1246 | `surgery` | `Task: emr.enterSurgicalNote` | Surgery Note Location (KGH: Labour and Delivery, MCOE PACU, MCOE Pre-Op, Staff Ward) | none | yes | no | no | spec |
| `labResults.xml` | `enableLabResults` :2089: **overall action** :2091 (`enterSimpleHtmlFormLinkWithoutVisit`, **no visit needed**) and a circular home app :2100 (`enterHtmlFormWithSimpleUi.page`); edit link :2112 | `labResults` | `Task: emr.enterLabResults` | Lab Results Location (KGH: **KGH NCD** only; Wellbody has locations but not the component) | none | yes | no | no | **To spec.** Simple UI. pihemr's file, no SL copy; master is newer than the merged copy (HAI-1249) |
| `edNote.xml` | `enableEDConsult` :905, `ED_CONSULT_NOTE` :911 | `edConsult` | `Task: emr.enterEDNote` (or retro) | ED Note Location: **no SL location carries it** | active visit (or retro privileges) | no | no | yes | **Not covered**: needs `wellbody-demo` |
| `echocardiogram.xml` | `enableEcho` :2249, `ECHO_VISIT_ACTION` :2253 | `programs` + `ncd` + `echocardiogram` | enterNCDConsultNote | Echocardiogram Location: **no SL location carries it** | `retro` (NCD privilege) | no | no | yes | **Not covered**: needs `wellbody-demo` |
| `patientRegistration-rs.xml` | `enablePatientRegistration` :1655: summary widget `MOST_RECENT_REGISTRATION_SUMMARY` :1677, `coreapps/encounter/mostRecentEncounter`, **editable and creatable** | `patientRegistration` | `App: registrationapp.registerPatient` | none on the widget (the registration app itself: Registration Location) | an existing registration encounter (edit) or none (create via the widget) | yes | yes | yes | Spec: `e2e/specs/patientRegistration-rs`. Encounter type Patient Registration (`873f968a`), listed on the visit page (`defaultEncounterLong`); the form's VIEW is its registration summary page widget |
| `patientRegistration-contact.xml` | same method: widget :1761, editable; skipped only in Liberia | `patientRegistration` | `App: registrationapp.registerPatient` | none | an existing registration encounter | yes | yes | yes | Spec: `e2e/specs/patientRegistration-contact`. Second-column widget; VIEW on the registration summary page |
| `patientRegistration-social.xml` | same method: widget :1747, editable (SL's own copy, shadows pihemr's: religion question removed) | `patientRegistration` | `App: registrationapp.registerPatient` | none | an existing registration encounter | yes | yes | yes | Spec: `e2e/specs/patientRegistration-social` (a registration encounter is created and the form's edit URL opened; VIEW on the registration summary page) |
| `patientRegistration-localAddress.xml` | same method: widget :1789, `if SIERRA_LEONE` only (SL-only form) | `patientRegistration` | `App: registrationapp.registerPatient` | none | an existing registration encounter | yes | yes | yes | Spec: `e2e/specs/patientRegistration-localAddress` (same method; VIEW on the registration summary page) |
| `maternalDischarge-print.xml` | not an entry form: `printFormUrl` of the Maternal Discharge encounter type in `encounterTypeConfig.js` (:2644, print action on the saved encounter) | `mcoeForms` (the encounter must exist) | - | - | an existing Maternal Discharge encounter | yes | no | no | spec (view-only; see "Confirmed by the e2e specs") |

Registration-summary widgets are drawn on `registrationapp/registrationSummary.page`; the check-in widget (:1802, SL branch :1803) lists both check-in encounter types.

### Sections and print templates (`section-*`)

The SL `section-*.xml` forms are **not** subforms of the entry forms (`grep 'path=".*section-' htmlforms/*.xml` finds nothing): `encounterTypeConfig.js` wires each as the **view template (`templateModelUrl`) and edit pencil (`editUrl`) of a section** of a visit-page encounter card. They need no tag or privilege; a spec creates the parent encounter over REST and opens the edit URL (`SectionFormPage`), which skips the visit-page gating. The profile columns say whether an entry form of that profile creates the parent encounter. Visit-page behaviour per encounter type is in the next section.

| Form file | Parent encounter type(s) and section id | KGH | Wellbody | Demo | Spec / notes |
|---|---|---|---|---|---|
| `section-anc-intake.xml` | ANC Intake (`ancIntake`): `section-anc-intake`, all versions | yes | yes | yes | spec |
| `section-anc-followup.xml` | ANC Followup: `section-anc-followup`, all versions | yes | yes | yes | spec |
| `section-postnatal-followup.xml` | Postnatal Followup: `section-postnatal-followup` | yes | yes | yes | spec |
| `section-delivery.xml` | MCH Delivery (SL branch): `pihcore-delivery` | no | yes | yes | spec. Only `delivery.xml` creates it (needs `mchBasicDeliveryForm`) |
| `section-plan-medication.xml` | MCH Delivery (SL): `pihcore-plan-medication`; ANC Intake/Followup form versions 1.0, 1.1, 2.0 only (current 3.1 resolves to `DEFAULT`, which has none) | no | yes | yes | spec. KGH only for old ANC encounters |
| `section-dx.xml` | outpatient initial/followup, NCD initial/followup/initial part-2/followup part-2, MCH Delivery (SL): `pihcore-diagnosis` | yes | yes | yes | spec. The merged build has no HFE VIEW for it (see Sources) |
| `section-history.xml` | outpatient initial: `pihcore-history` | yes | yes | yes | spec |
| `section-chief-complaint.xml` | outpatient followup: `pihcore-chief-complaint` | yes | yes | yes | spec |
| `section-peds.xml` | outpatient initial/followup: `pihcore-peds`, only if the patient is < 15 years at visit start | yes | yes | yes | spec |
| `section-exam.xml` | outpatient initial/followup: `physical-exam` | yes | yes | yes | spec |
| `section-plan.xml` | outpatient initial/followup: `pihcore-plan`; the section also has `printTemplateUrl` = the prescriptions print form (see To spec) | yes | yes | yes | spec |
| `section-ncd-history.xml` | NCD initial, initial part-1: `pihcore-ncd-history` | yes | yes | yes | spec |
| `section-ncd-notes.xml` | NCD initial part-2 (`DEFAULT` version only): `pihcore-ncd-overview` | yes | yes | yes | spec |
| `section-ncd-followup.xml` | NCD followup, followup part-1: `pihcore-ncd-followup` | yes | yes | yes | spec |
| `section-hospital.xml` | NCD initial, initial part-1, followup, followup part-1: `pihcore-hospital` | yes | yes | yes | spec |
| `section-diabetes.xml`, `section-hypertension.xml`, `section-heart-failure.xml`, `section-lung.xml`, `section-kidney.xml`, `section-liver.xml`, `section-palliative.xml`, `section-sickle-cell.xml` | the four full/part-2 NCD types (initial, followup, initial part-2, followup part-2) | yes | yes | yes | spec (each) |
| `section-other-ncd.xml` | as above, but **not** initial part-2 version `1.0` | yes | yes | yes | spec |
| `section-ncd-plan.xml` | NCD initial, followup, initial part-2, followup part-2: `pihcore-ncd-plan` | yes | yes | yes | spec |
| `section-prescriptions-print.xml` | `printTemplateUrl` of the `primaryCarePlan` section (`section-plan`, outpatient initial/followup) and of `primaryCarePlanMedication` (`section-plan-medication`, MCH Delivery) in `encounterTypeConfig.js` :145, :161 (`printTemplate` = `printPrescriptionsWithHtmlFormLong.page`) | yes | yes | yes | **To spec** (print template) |

## Visit-page configuration (`encounterTypeConfig.js`)

Resolved with `EncounterTypeConfig.get(encounter, country='sierra_leone', site)`: `encounterTypes[uuid]` -> `[country]` (only if that key exists) -> `[site]` else `DEFAULT` else the object itself, then `versions[encounter.form.version]` else `versions.DEFAULT`. No encounter type has a `KGH` or `WELLBODY` branch, so both sites resolve identically. A *card* shows `shortTemplate` and, expanded, `longTemplate`; a *sectioned card* (type-level `templateModelUrl` absent) shows `defaultEncounterShort.page` for both and, expanded, one block per section (`viewSectionWithHtmlFormLong.page` over the section's own `templateModelUrl`, edit pencil = the section's `editUrl`). `include-section` entries (`vaccinations.page`) have no form and no edit link. "HFE VIEW (own form)" = `templateModelUrl` without `definitionUiResource`: the view of the form the encounter was saved with. Encounter type names are from `encountertypes/*.csv`.

| Encounter type (uuid prefix) | Forms of this repo that create it | Form-version variants | Type-level `templateModelUrl` | Edit pencil | Sections (id -> form, in order) | What the visit page shows |
|---|---|---|---|---|---|---|
| Check-In `55a0d3ea`; SL Maternal Check-in `251c03fa` | `checkin`; `checkinMaternal` | none | present: `/module/htmlformentry/encounter.json` (not an HFE VIEW) | Simple UI | - | `checkInShort.page`; long `defaultHtmlFormEncounterLong.page`; **not listed** (`showOnVisitList` false) |
| Patient Registration `873f968a` | `patientRegistration-*` | none | absent | absent | - | listed on the visit page (verified on zl-ci: `showOnVisitList` false only affects the visit list's type summary), rendered with `defaultEncounterLong` (one `p.aligned` row per obs); each form's VIEW is its registration summary page widget (`RegistrationSummaryPage`), which owns the edit link |
| SL MCH Triage `41911448` | `triage` | none | present: HFE VIEW (own form) | Standard UI | - | `mchTriageShort.page`; long `viewEncounterWithHtmlFormLong.page` |
| Vital Signs `4fb47712` | `vitals` | none for SL (`DEFAULT`; only Haiti has version branches) | present: HFE VIEW (own form) | **Simple UI** | - | `vitalsShort.page`; long HFE VIEW |
| Vitals with Glucose `2fd151a2` | `vitalsWithGlucose` | none | present: HFE VIEW (own form) | Simple UI | - | `vitalsShort.page`; long HFE VIEW |
| Inpatient Vitals `6b1c3929` | `inpatientVitals`, `inpatientNewbornVitals` | none | present: HFE VIEW (own form) | Standard UI | - | `vitalsShort.page`; long HFE VIEW |
| Family Planning Initial `52fe1a29`, Followup `5a1d1710`; Gynecology Initial `34700f4f`, Followup `9b973514`; Cervical Cancer Screening `820a80b0`; AYFS Initial `1f3375af`, Followup `73399721` | the form of the same name | none | present, **names its own form** (`definitionUiResource` = that form) | Standard UI, that form | - | `defaultEncounterShort.page`; long = HFE VIEW |
| ANC Intake `00e5e810` | `ancIntake` (form version 3.1) | `DEFAULT`, `2.0`, `1.1`, `1.0` (3.1 -> `DEFAULT`) | absent | Standard UI | `DEFAULT`: `section-anc-intake` + `vaccinations` (only if female). `2.0`/`1.1`/`1.0`: `section-anc-intake` + `vaccinations` (no condition) + `pihcore-plan-medication` -> `section-plan-medication` | sectioned card |
| ANC Followup `00e5e946` | `ancFollowup` (3.1) | `DEFAULT`, `2.0`, `1.1`, `1.0` | absent | Standard UI | `DEFAULT`: `section-anc-followup` + `vaccinations`. Older versions: + `section-plan-medication` | sectioned card |
| Postnatal Followup `b7a7c300` | `postnatalFollowup` | `DEFAULT` only | absent | Standard UI | `section-postnatal-followup` + `vaccinations` (only if female) | sectioned card |
| MCH Delivery `00e5ebb2` | `delivery` | none (SL key, no versions) | absent | Standard UI | `pihcore-delivery` -> `section-delivery`, `pihcore-diagnosis` -> `section-dx`, `pihcore-plan-medication` -> `section-plan-medication` | sectioned card. (The non-SL default also has `section-c-section`) |
| SL Outpatient Initial `7d5853d4` | `outpatient-initial` | none | absent | Standard UI | `pihcore-history` -> `section-history`; `vaccinations` (< 15 years at visit start); `pihcore-peds` -> `section-peds` (< 15 years); `physical-exam` -> `section-exam`; `pihcore-diagnosis` -> `section-dx`; `pihcore-plan` -> `section-plan` (+ print template) | sectioned card |
| SL Outpatient Followup `d8a038b5` | `outpatient-followup` | none | absent | Standard UI | as initial with `pihcore-chief-complaint` -> `section-chief-complaint` in place of history | sectioned card |
| NCD Initial Consult `ae06d311` | `ncd-initial` | none | absent | Standard UI | `pihcore-ncd-history`, `pihcore-hospital`, then 9 disease sections (`diabetes`, `hypertension`, `heart-failure`, `lung`, `kidney`, `liver`, `palliative`, `sickle-cell`, `other-ncds`), `pihcore-diagnosis`, `vaccinations`, `pihcore-ncd-plan` | sectioned card |
| NCD Followup Consult `5cbfd6a2` | `ncd-followup` | none | absent | Standard UI | as initial with `pihcore-ncd-followup` -> `section-ncd-followup` in place of `pihcore-ncd-history` | sectioned card |
| NCD Initial Part 1 only `48c413c4` | `ncd-initial-part-1` | none | absent | Standard UI | `pihcore-ncd-history`, `pihcore-hospital` | sectioned card |
| NCD Initial Part 2 only `43423212` | `ncd-initial-part-2` (2.0) | `DEFAULT`, `1.0` (2.0 -> `DEFAULT`) | absent | Standard UI | `DEFAULT`: `pihcore-ncd-overview` -> `section-ncd-notes`, the 9 disease sections, `pihcore-diagnosis`, `vaccinations`, `pihcore-ncd-plan`. `1.0`: no overview, no `other-ncds` | sectioned card |
| NCD Followup Part 1 only `e02a8c32` | `ncd-followup-part-1` | none | absent | Standard UI | `pihcore-ncd-followup`, `pihcore-hospital` | sectioned card |
| NCD Followup Part 2 only `6a3afa6f` | `ncd-followup-part-2` | none | absent | Standard UI | the 9 disease sections, `pihcore-diagnosis`, `vaccinations`, `pihcore-ncd-plan` | sectioned card |
| Mental Health Consult `a8584ab8`, Follow-up `9d701a81` | `mentalHealth`, `mentalHealthFollowup` | none | present, **names its own form** | Standard UI, that form | - | `defaultEncounterShort.page`; long = HFE VIEW |
| Surgery Note `c4941dee` | `surgicalPostOpNote` | none | present: HFE VIEW (own form) | Standard UI | - | default short; long = HFE VIEW |
| Laboratory Results `4d77916a` | `labResults` | none | present: HFE VIEW (own form) | Simple UI | - | default short; long = HFE VIEW |
| Admission `260566e1` | `maternalAdmission`, `newbornAdmissionNote` (and `admissionNote`, not offered) | none | **absent** | Standard UI | - | own `admissionLong.page`; `showOnVisitList` unset |
| Newborn Initial `093b6ffc`, Assessment `6444b8d4`, Discharge `153d3182`, Daily Progress `7e42e652`; ANC Progress `ce67f875`; Labour Progress `ac5ec970`; Labor and Delivery Summary `fec2cc56`; Postpartum progress `37f04ddf`; PACU Followup `6f2df970`; Maternal Death `415b342e`; NICU Triage `fb4318dd`; Ballard Score `8e027b32` | the form of the same name | none | present: HFE VIEW (own form) | Standard UI | - | default short; long = HFE VIEW |
| Maternal Discharge `2110a810` | `maternalDischarge` | none | present: HFE VIEW (own form) | Standard UI | - | as above, plus `printFormUrl` = `maternalDischarge-print.xml` (print action) |
| Consultation `92fd09b4` | `edNote` (and `outpatientConsult`, not offered) | none | **absent** | Standard UI | - | own `clinicConsultLong.page` (wellbody-demo only) |
| Echocardiogram `fdee591e` | `echocardiogram` | none | present: HFE VIEW (own form) | Standard UI | - | default short; long = HFE VIEW (wellbody-demo only) |
| Maternity and Delivery Register `9cc89b83`, SCBU Newborn Register `3790ecc6` | `gainMaternalRegister`, `gainNewbornRegister` | none | present: HFE VIEW (own form) | Standard UI | - | default short; long = HFE VIEW (encounters can exist only from direct URLs: the forms are not offered) |

## Fixture recipes

- **KGH header forms** (`ancIntake`, `ancFollowup`, `postnatalFollowup`, `familyPlanning*`, `gynecology*`, `ayfs*`, `cervicalCancerScreening`): patient `gender F`, age >= 10 (AYFS: 10-24, any sex), an active visit at KGH, session MCH OPD, user with `Task: emr.enterMCH`. ANC intake: no ANC intake in an active Pregnancy enrolment.
- **MCOE forms**: log in at the ward carrying the tag (Forms table); newborn forms need a patient aged < 42 days at visit start (Ballard < 31).
- **NCD**: location KGH NCD (or Wellbody NCD), `Task: emr.enterNCDConsultNote`, active visit; initial forms only for a patient with no earlier NCD initial.
- **Forms without a spec yet**: see `## To spec`.

## Confirmed by the e2e specs (KGH test server, 2026-10-23)

What the specs showed about reaching the forms. The harness logs in with the session location MCH OPD and the admin user.

- **Direct URLs skip the gating.** Both `editHtmlFormWithStandardUi.page` (section forms, on an encounter created over REST) and `enterHtmlFormWithStandardUi.page` (top-level forms, in a visit created over REST) open without the component, privilege or visit-page requirements in the rows above. The gating itself is not tested.
- **Session location vs the form's location tag.** MCH OPD carries "Maternal and Child Location", so the header forms (`ancIntake`, ...) auto-submit with the default provider and location. For the forms below the tag is missing and the Location select starts empty (and is required), so a test must pick one: the newborn forms ("MCH Triage Location": NICU, Triage | MCOE), `ancProgress` / `laborProgress` (Antenatal Ward), `laborDeliverySummary` (Labour and Delivery), `postpartumDailyProgress` (Postnatal Ward), `vitals` (Vitals Location). `vitalsWithGlucose` presets one.
- **Simple UI.** `vitals.xml` and `vitalsWithGlucose.xml` are launched with `enterHtmlFormWithSimpleUi.page` in production; only that UI defines `ExitHandlers` / `NavigatorController`, so their cm/mm conversion, glucose toggle and required-fieldset enforcement run only there.
- **Redirect after save.** Most forms return to the `returnUrl`; `laborDeliverySummary.xml` goes to `pihcore/children/children.page`.
- **Program side effects of a save** (asserted in the specs): Infant program on `newbornInitial`, `newbornDailyProgress`, `newbornAssessment`, `newbornDischarge`; Pregnancy program on `section-anc-followup`, `section-postnatal-followup`, `ancProgress`, `laborProgress`; NCD program on `section-ncd-followup`, `section-ncd-history`, `section-ncd-plan`. `laborDeliverySummary` and `postpartumDailyProgress` move an Antenatal enrolment to Delivered, or enrol directly in Delivered when there is none (the enrolment must start before the delivery date, or a separate historic one is created).
- **Orders and registrations.** A saved lab order (`testorder`) cannot be purged over REST, and saving an Alive infant in `laborDeliverySummary` registers a baby patient; the specs avoid both.
- **Location select, by form.** Preselected by MCH OPD (no pick needed): the header forms (`ancIntake`, `ancFollowup`, `delivery`, `postnatalFollowup`), `maternalDeath`, `familyPlanning*`, `gynecology*`, `gainMaternalRegister`, `gainNewbornRegister`. Empty and required (a test picks an option by index): `outpatient-*` and `ncd-*` (these show the form instead of auto-submitting), `maternalAdmission`, `maternalDischarge`, `checkin`, `checkinMaternal`, `inpatientVitals`, `inpatientNewbornVitals`, `triage`, `pacuFollowup`, `surgicalPostOpNote` (provider too), plus the forms listed above.
- **GAIN registers.** `gainMaternalRegister` and `gainNewbornRegister` have specs (direct URL) although no profile offers them (see `## Not reachable`). Their specs carry the `// UNREACHABLE` header and the `@unreachable` tag.
- **Forms with no spec.** The previous version of this file recorded the registration widget forms `patientRegistration-localAddress` and `patientRegistration-social` as "not enterable through the standard entry page" and `dispensing` as legacy and not offered, all without a spec. The two registration forms now have specs (a Patient Registration encounter is created and the form's edit URL opened; the values are checked on the registration summary page and the visit dashboard); `dispensing` still has none. `maternalDischarge-print.xml` is view-only: its spec saves a real discharge, then requests `getAsHtml.action` with an `Accept: application/json` header (without it the server throws "Don't know what to use as success url") and asserts the returned HTML.
- **Effects of a save found while testing.** `maternalDischarge` with Home closes the visit and enrols the patient in Delivered (an Antenatal enrolment moves to Delivered); the Death disposition marks the patient dead through core handling and is deliberately not saved. `maternalDeath` does not mark the patient dead or close the visit. `checkinMaternal` with "Refer to MCOE triage" ticked may create a queue entry that cannot be purged, so the checkbox is only toggled.

## Not reachable

78 reachable + 50 not reachable = 128 forms in the merged directory (versioned `_v*` copies: 55, `retired/` directory: 4, counted by the guard and not listed). Reasons use the skill's vocabulary. `non-production profile only` is **not used**: forms that only `wellbody-demo` offers are counted as reachable (it is a profile this repo ships and has its own column) and sit in `## Not covered`. Sections are listed as `section or subform` with the parent's status in Detail, because they have no entry of their own. `gainMaternalRegister.xml` and `gainNewbornRegister.xml` have a spec.

| Form file | Defined in | Reason | Detail |
|---|---|---|---|
| `admissionNote.xml` | pihemr | component off | `adt`: `enableADT` :919 (visit action :956, awaiting-admission link :940), dispatcher :271; no SL profile lists `adt` (KGH has `adtO3`, which offers only the newborn admission note) |
| `cancelAdmission.xml` | pihemr | component off | `adt` (`enableADT`, link :948) |
| `chemotherapyTreatment.xml` | pihemr | component off | `oncology`: `enableOncology` :1985 (visit action :2031, tag Chemotherapy Location), called from `enablePrograms` :4268; no SL profile lists `oncology` |
| `comment.xml` | pihemr | component off | `commentForm`: `enableCommentForm` :4572, dispatcher :494; not listed |
| `covid19Discharge.xml` | pihemr | component off | `covid19`: `enableCovid19` :3530 (action :3548), dispatcher :474; not listed |
| `covid19Followup.xml` | pihemr | component off | `covid19` (`enableCovid19`, action :3539) |
| `covid19Intake.xml` | pihemr | component off | `covid19IntakeForm`: `enableCovid19IntakeForm` :3555, dispatcher :478; not listed |
| `dispensing.xml` | pihemr | component off | `dispensing` (`enableDispensing` :1096, dispatcher :287) or `dispensingForm` (`enableDispensingForm` :1137, :291); neither is listed. SL uses the SPA `medicationDispensing` (:295) |
| `drugOrder.xml` | pihemr | component off | `medicationOrder`: `enableMedicationOrder` :1189, dispatcher :299; not listed |
| `drugRehab.xml` | pihemr | component off | `drugRehab`: `enableDrugRehab` :3625, dispatcher :506; not listed |
| `gainMaternalRegister.xml` | pihsl-emr | component off | `mchGAINMaternal`: `enableMCHGainMaternal` :2485 (SL branch only), dispatcher :462; **no SL profile lists it**. **Has a spec** (direct URL) |
| `gainNewbornRegister.xml` | pihsl-emr | component off | `mchGAINNewborn`: `enableMCHGainNewborn` :2499, dispatcher :466; no profile lists it. **Has a spec** |
| `obGyn.xml` | pihemr | component off | `obgyn`, a flag inside `enableMCHForms` :2471 (needs `mchForms` and `obgyn`; SL lists only the first). Its encounter type still has a visit-page view for encounters from elsewhere |
| `obGyn_1.0.xml` | pihemr | component off | older copy of `obGyn.xml`, named `_1.0` so the guard does not skip it as a `_v*` copy; no entry of its own |
| `oncologyIntakeConsult.xml` | pihemr | component off | `oncology` (`enableOncology`, action :2042) |
| `oncologyTreatment.xml` | pihemr | component off | `oncology` (`enableOncology`, action :2013) |
| `outpatientConsult.xml` | pihemr | component off | `consult`: `enableConsult` :852, dispatcher :255; not listed. Same encounter type as `edNote.xml` |
| `ovcFollowup.xml` | pihemr | component off | `ovc`: `enableOvc` :3576 (action :3593), inside `enablePrograms` :4257; not listed |
| `ovcIntake.xml` | pihemr | component off | `ovc` (`enableOvc`, action :3583) |
| `socio-econ.xml` | pihemr | component off | `socioEconomics`: `enableSocioEconomics` :2828, dispatcher :438; not listed |
| `vaccination-only.xml` | pihemr | component off | `vaccination`: `enableVaccinationOnly` :2680, inside `enablePrograms` :4262; not listed |
| `primary-care-adult-followup.xml` | pihemr | other country | `enablePrimaryCare` :2907, Haiti branch :2909 (action :2959); SL gets `outpatient-*` from the SL branch :2987. `primaryCare` is on in all SL profiles |
| `primary-care-adult-initial.xml` | pihemr | other country | same Haiti branch (action :2944) |
| `primary-care-peds-followup.xml` | pihemr | other country | same Haiti branch (action :2930) |
| `primary-care-peds-initial.xml` | pihemr | other country | same Haiti branch (action :2915) |
| `section-c-section.xml` | pihemr | other country | `cSection` section of MCH Delivery in the non-SL `DEFAULT` config only (`encounterTypeConfig.js` :514, :2280); SL resolves its own `sierra_leone` key, whose list has no c-section |
| `section-ncd.xml` | pihemr | other country | `ncd` section (:167) of NCD Initial/Followup in the `DEFAULT` and Haiti configs; SL resolves its own section list (`pihsl-emr` also keeps a copy under `retired/`) |
| `deathCertificate.xml` | merged dir only | retired | pihemr master moved it to `retired/` (UHM-9646 `50d9f997`, 2026-11-03); no app-loader entry in any case. The merged directory (built 2026-10-29) still has it in `htmlforms/`. `encounterTypeConfig.js` keeps a view entry for its type |
| `oncologyConsult.xml` | pihemr | retired | its visit action is commented out in `enableOncology` (:1989-:2002, "Removed Feb 2023 per Lormil. This form is no longer used"); `oncology` is off anyway |
| `section-comments.xml` | pihemr | section or subform | section of the home-assessment encounter types (prenatal, pediatric, postpartum, follow-up home assessment; `encounterTypeConfig.js` :750-:810); no form of the merged directory creates those types and none is in the SL encounter type CSVs |
| `section-dx-obgyn.xml` | pihemr | section or subform | `pihcore-diagnosis-obgyn` section of the OB/GYN encounter type; parent `obGyn.xml` is `component off` |
| `section-education-subjects.xml` | pihemr | section or subform | home-assessment types, as `section-comments.xml` |
| `section-family-planning-simple.xml` | pihemr | section or subform | `maternal-family-planning` section of the home-assessment types |
| `section-maternal-danger-signs.xml` | pihemr | section or subform | home-assessment types |
| `section-maternal-vital-signs.xml` | pihemr | section or subform | home-assessment types |
| `section-mch-referral.xml` | pihemr | section or subform | home-assessment types |
| `section-obgyn-initial.xml` | pihemr | section or subform | OB/GYN encounter type; parent `obGyn.xml` is `component off` |
| `section-obgyn-plan.xml` | pihemr | section or subform | same |
| `section-oncology-history.xml` | pihemr | section or subform | Oncology Initial Consult; parent `oncologyIntakeConsult.xml` is `component off` |
| `section-oncology-plan.xml` | pihemr | section or subform | same |
| `section-postpartum-counsel.xml` | pihemr | section or subform | home-assessment types (`section-postpartum-training`) |
| `section-return-visit-date.xml` | pihemr | section or subform | home-assessment types |
| `dischargeNote.xml` | pihemr | unreferenced | no `getFormResource`, no `encounterTypeConfig.js` form entry, no include in pihcore (api, omod), pihemr content or pihsl-emr content; the only hits are message codes (`mirebalais.dischargeNote.*`). Its encounter type (Exit from Inpatient Care) has a visit-page entry; a launch from the O2 ADT module is unverified |
| `infantDocumentation.xml` | pihemr | unreferenced | no hit in pihcore, pihemr or pihsl-emr; encounter type "HIV Infant Documentation" is not an SL type |
| `patientRegistration.xml` | pihemr | unreferenced | no `getFormResource` or other reference; the file says "TODO are we still using this??". Same encounter type as the widget forms |
| `section-family-planning.xml` | pihemr | unreferenced | `encounterTypeConfig.js` defines the section (`familyPlanningHistory`, :413) but no encounter type lists it |
| `section-lab-order.xml` | pihemr | unreferenced | defined as `labRadOrder` (:390) and listed by no encounter type; a comment in `section-plan_v1.0` calls it a duplicate |
| `section-peds-feeding.xml` | pihemr | unreferenced | no reference anywhere (searched htmlforms, subforms, scripts, pihcore) |
| `section-peds-supplements.xml` | pihemr | unreferenced | same |
| `transferNote.xml` | pihemr | unreferenced | same searches as `dischargeNote.xml`; encounter type Transfer has a visit-page entry; a launch from the O2 ADT module is unverified |

## Not covered

Reachable forms that no spec can show on `kgh-ci` (the server the specs run on), or that were excluded on purpose, **each by name**.

| Form file | Reason |
|---|---|
| `edNote.xml` | needs profile `wellbody-demo` (`edConsult`, `enableEDConsult` :905); no profile used by an env file offers it. Also, no location of either SL tag map carries `ED Note Location`, so even there the visit action needs a tagged location (unverified how demo is deployed). Not `non-production profile only` by decision (see `## Not reachable`) |
| `echocardiogram.xml` | needs profile `wellbody-demo` (`echocardiogram`, nested in `ncd`, `enableEcho` :2249); no location carries `Echocardiogram Location` either |

## To spec

None: every reachable form of this repo has a spec or is listed under Not covered (checked with `inventory.py --check-coverage`: 0 UNACCOUNTED).
