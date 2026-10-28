# Form availability — Sierra Leone (KGH, Wellbody)

When is each form offered to a user? Written once for all forms; per-form notes link here.

**Sources (local checkouts, 2026-10-22):** `openmrs-module-pihcore` HEAD `55815f8a` (2026-10-20) `api/.../apploader/CustomAppLoaderFactory.java`, `RequireUtil.java`, `CustomAppLoaderUtil.java`, `PihEmrConfigConstants.java`; `pihemr` parent config HEAD `9feda2c2` `scripts/visit/encounterTypeConfig.js`; this repo (`pihsl-emr`) `pih-config-sierraLeone*.json`. The distro depends on `pihemr-distro 3.4.0-SNAPSHOT` (pihcore is a SNAPSHOT), so a deployed server may differ from these commits.
**Not covered:** O3 / SPA forms (`content/configuration/frontend_configuration/config.json` contains no HFE form references); Haiti/Liberia/Mexico branches; versioned `_v*` copies (no app-loader entry).

## Shared layers (apply to every row below)

1. **Entry point = visit action** (`visitAction(...)`) on the visit page, unless the row says otherwise. Standard UI link: `htmlformentryui/htmlform/enterHtmlFormWithStandardUi.page?patientId=<uuid>&visitId=<id>&definitionUiResource=file:<form dir>/<form>.xml` (Simple UI: `enterHtmlFormWithSimpleUi.page`). Many MCH/NCD/outpatient links append `&returnUrl=/<context>/<visit page for the visit>` (redirect after save). Registration actions append `&createVisit=true`.
2. **Component flag** — the `Components.X` string must be in the `"components"` list of the site config (`pih-config-sierraLeone.json` sets `country: SIERRA_LEONE`; the site file `-kgh` / `-wellbody` supplies components; `-kgh-ci` is an empty overlay; `-wellbody-ci` and `-wellbody-demo` have their own lists, differing mainly in `infantProgram`/`pregnancyProgram`/`spaPreview`).
3. **Country branch** — SIERRA_LEONE (`config.isCountry(SIERRA_LEONE)`), or the generic `else` where noted.
4. **Privilege** — `Task: emr.enterMCH` for MCH/MCOE forms; others per row. Vitals/NCD also accept the retro privileges (see helper table).
5. **Session location tag** — user must be logged in at a location carrying the tag.
6. **Visit/patient `require` expression** — the visit action is evaluated in the visit page context. Helpers (from `RequireUtil`):

| Helper | Expression |
|---|---|
| `patientIsFemale()` | `patient.person.gender == 'F'` |
| `patientIsReproductiveAge()` | `patient.person.age >= 10` |
| `patientIsAdolescentYouth()` | `age >= 10 && age < 25` |
| `patientDead()` | `patient.person.dead` |
| `patientAgeInDaysLessThanAtVisitStart(n)` / `...OlderThan...(n)` | days between birthdate and *visit start* `< n` / `> n` (newborn forms use 42, Ballard 31, inpatient vitals 41) |
| `visitDoesNotHaveEncounterOfType(t)` | no encounter of type `t` in the *current visit* |
| `patientHasPreviousEncounter(t)` | `not(...)` ⇒ patient has no earlier encounter of type `t` (any visit) |
| `patientDoesNotHaveEncounterOfTypeDuringProgramEnrollment(t, p)` | no `t` encounter inside the enrollment in `p` that is active on the visit date |
| `retro` (vitals/NCD) | `or(and(hasPriv(enter note), patientHasActiveVisit()), hasPriv("Task: emr.retroConsultNote"), and(hasPriv("Task: emr.retroConsultNoteThisProviderOnly"), visit ended < 30 days ago))` |

7. **Extra entry points (clones)** — `cloneAsPregnancyVisitAction` / `cloneAsInfantVisitAction` re-register the same action (same privilege + `require`) on the Pregnancy / Infant program visit page. Pregnancy needs `pregnancyProgram`, Infant `infantProgram` (both in KGH and Wellbody; not in `wellbody-demo`).
8. **View / edit / print** of a saved encounter is configured separately, in `encounterTypeConfig.js` (see "Visit-page sections").

## Site components that gate forms

| Component | KGH | Wellbody | Gates |
|---|---|---|---|
| `mchForms` | yes | yes | ANC, delivery(WB), postnatal, family planning, AYFS, cervical cancer |
| `mchGynecologyForms` | yes | no | gynecology intake/followup |
| `mchBasicDeliveryForm` | no | yes | `delivery.xml` |
| `mcoeForms` | yes | no | newborn, NICU, Ballard, PACU, labor/delivery, maternal admission/discharge/death, ANC progress, postpartum |
| `mchTriage` | yes | no | `triage.xml` |
| `adtO3` | yes | no | `newbornAdmissionNote.xml` |
| `checkIn` | yes | yes | check-in |
| `vitals` | yes | yes | vitals (+ inpatient vitals) |
| `programs` + `ncd` | yes | yes | NCD forms, `vitalsWithGlucose` |
| `programs` + `mentalHealth` | yes | yes | mental health |
| `primaryCare` | yes | yes | outpatient initial/followup |
| `surgery` | yes | no | `surgicalPostOpNote.xml` |
| `patientRegistration` | yes | yes | registration summary widgets |
| `dispensing` / `dispensingForm` | no | no | legacy `dispensing.xml` (both sites use SPA `medicationDispensing`) |
| `mchGAINMaternal` / `mchGAINNewborn` | no | no | GAIN registers |

## Forms

`Sites`: KGH / WB / both / none. "No-visit-dup" = `visitDoesNotHaveEncounterOfType(own type)`.

| Form file | Offered by (method / action) | Sites | Privilege | Location tag | Patient / visit requirement |
|---|---|---|---|---|---|
| `ancIntake.xml` | `enableMCHForms` / `MCH_ANC_INTAKE` (+pregnancy clone) | both | enterMCH | Maternal and Child Location | female, age≥10; no ANC intake **or** followup in visit; no ANC intake in active Pregnancy enrollment |
| `ancFollowup.xml` | `enableMCHForms` / `MCH_ANC_FOLLOWUP` (+pregnancy clone) | both | enterMCH | Maternal and Child Location | female, age≥10; no ANC intake or followup in visit |
| `postnatalFollowup.xml` | `enableMCHForms` SL block (+pregnancy) | both | enterMCH | Maternal and Child Location | female, age≥10; no-visit-dup |
| `familyPlanningIntake.xml` / `familyPlanningFollowup.xml` | `enableMCHForms` (+pregnancy) | both | enterMCH | Maternal and Child Location | female, age≥10; neither FP intake nor followup in visit |
| `gynecologyIntake.xml` / `gynecologyFollowup.xml` | `enableMCHForms` (needs `mchGynecologyForms`) | KGH | enterMCH | Maternal and Child Location | female, age≥10; neither gyn intake nor followup in visit |
| `ayfsIntake.xml` / `ayfsFollowup.xml` | `enableMCHForms` | both | enterMCH | Maternal and Child Location | age 10–24 (any sex); neither AYFS intake nor followup in visit. `ayfsFollowup` has no CSV |
| `cervicalCancerScreening.xml` | `enableMCHForms` (+pregnancy) | both | enterMCH | Maternal and Child Location | female, age≥10; no-visit-dup |
| `delivery.xml` | `enableMCHForms` / `MCH_DELIVERY`, only if `mchBasicDeliveryForm` (+pregnancy) | WB | enterMCH | Maternal and Child Location | female, age≥10; no-visit-dup. (Haiti branch also uses this file; not SL) |
| `triage.xml` | `enableMCHTriage` / `MCH_TRIAGE` | KGH | `Task: emr.triage` | MCH Triage Location | female, age≥10; no SL MCH-triage encounter in visit |
| `newbornInitial.xml` | `enableMCOEForms` (+infant) | KGH | enterMCH | NICU Location | age < 42 days at visit start; no-visit-dup |
| `newbornAssessment.xml` | `enableMCOEForms` (+infant) | KGH | enterMCH | Newborn Assessment Location | age < 42 days; no-visit-dup |
| `newbornDailyProgress.xml` | `enableMCOEForms` (+infant) | KGH | enterMCH | Newborn Daily Progress Location | age < 42 days (repeatable) |
| `newbornDischarge.xml` | `enableMCOEForms` (+infant) | KGH | enterMCH | Newborn Discharge Location | age < 42 days (no dup check) |
| `nicuTriage.xml` | `enableMCOEForms` (+infant) | KGH | enterMCH | MCH Triage Location | age < 42 days (no dup check) |
| `ballardScore.xml` | `enableMCOEForms` (+infant) | KGH | enterMCH | NICU Location | age < 31 days at visit start |
| `pacuFollowup.xml` | `enableMCOEForms` (+pregnancy) | KGH | enterMCH | PACU Location | female, age≥10 |
| `ancProgress.xml` | `enableMCOEForms` (+pregnancy) | KGH | enterMCH | Antenatal Progress Location | female, age≥10 |
| `laborProgress.xml` | `enableMCOEForms` (+pregnancy) | KGH | enterMCH | Antenatal Location | female, age≥10 |
| `laborDeliverySummary.xml` | `enableMCOEForms` (+pregnancy) | KGH | enterMCH | Delivery Location | female, age≥10; no-visit-dup |
| `postpartumDailyProgress.xml` | `enableMCOEForms` (+pregnancy) | KGH | enterMCH | Postnatal Location | female, age≥10 |
| `maternalAdmission.xml` | `enableMCOEForms` (+pregnancy) | KGH | enterMCH | Maternal Admission Location | female, age≥10; no maternal-admission **and** no generic Admission encounter in visit |
| `maternalDischarge.xml` | `enableMCOEForms` (+pregnancy) | KGH | enterMCH | Maternal Discharge Location | female, age≥10; no-visit-dup |
| `maternalDischarge-print.xml` | not an entry form: `printFormUrl` of the Maternal Discharge encounter type in `encounterTypeConfig.js` (print action on the saved encounter) | KGH | – | – | an existing Maternal Discharge encounter |
| `maternalDeath.xml` | `enableMCOEForms` (+pregnancy) | KGH | enterMCH | Maternal Death Location | `patient.person.dead`; no-visit-dup |
| `newbornAdmissionNote.xml` | `enableADTO3` / `ADMISSION_NOTE` | KGH | enterMCH | Newborn Admission Note Location | age < 42 days; no Admission encounter in visit |
| `gainMaternalRegister.xml` / `gainNewbornRegister.xml` | `enableMCHGainMaternal/Newborn` | none | enterMCH | Maternal and Child Location | female, age≥10. **Not offered**: no site lists `mchGAINMaternal`/`mchGAINNewborn` |
| `checkin.xml` | `enableCheckIn`: visit action + registration action (`&createVisit=true`) | both | `Task: mirebalais.checkinForm` | Check-In Location | none beyond location. Simple UI. Edit link registered for the Check-in encounter type |
| `checkinMaternal.xml` | `enableCheckIn` SL block: visit action (+pregnancy, +infant clones) + registration action | both | `Task: mirebalais.checkinForm` | Check-In Maternal Location | no maternal check-in in visit (visit action only) |
| `vitals.xml` | `enableVitals` / `VITALS_CAPTURE` (+MCH, pregnancy, infant clones); Simple UI | both | none on action; `retro` expression | Vitals Location **and not** Vitals Inpatient Location | `retro` helper above |
| `inpatientVitals.xml` | `enableVitals` SL | both | none; `retro` | Vitals Inpatient Location | age > 41 days at visit start |
| `inpatientNewbornVitals.xml` | `enableVitals` SL | both | none; `retro` | Vitals Inpatient Location | age < 42 days at visit start |
| `vitalsWithGlucose.xml` | `enableNCDs` SL; Simple UI | both | none; `retro` | Vitals Glucose Location | `retro` helper |
| `ncd-initial.xml` | `enableNCDs` / `NCD_INITIAL` | both | `Task: emr.enterNCDConsultNote` | NCD Consult Location | `retro`; no NCD initial/part-1/part-2/followup/part-1/part-2 encounter in visit; patient has no earlier NCD initial (any of the three types) |
| `ncd-initial-part-1.xml` / `-part-2.xml` | `enableNCDs` SL | both | enterNCDConsultNote | NCD Consult Location | `retro`; visit lacks initial + the own part + any followup; no earlier initial or own part |
| `ncd-followup.xml` | `enableNCDs` / `NCD_FOLLOWUP` | both | enterNCDConsultNote | NCD Consult Location | `retro`; no NCD initial/followup of any variant in visit |
| `ncd-followup-part-1.xml` / `-part-2.xml` | `enableNCDs` SL | both | enterNCDConsultNote | NCD Consult Location | `retro`; no initial of any variant, no full followup, no own part in visit |
| `mentalHealth.xml` | `enableMentalHealthForm` SL / `MENTAL_HEALTH` (`&returnUrl`) | both | `Task: emr.enterMentalHealthNote` | Mental Health Location | **first assessment only**: no earlier assessment (any visit) and none/followup in this visit |
| `mentalHealthFollowup.xml` | `enableMentalHealthForm` SL / `MENTAL_HEALTH_FOLLOWUP` | both | enterMentalHealthNote | Mental Health Location | no assessment and no followup in this visit (no requirement of a prior assessment) |
| `outpatient-initial.xml` / `outpatient-followup.xml` | `enablePrimaryCare` SL branch | both | none | Consult Note Location | neither outpatient initial nor followup in visit |
| `surgicalPostOpNote.xml` | `enableSurgery` / `SURGICAL_NOTE` | KGH | `Task: emr.enterSurgicalNote` | Surgery Note Location | none |
| `patientRegistration-social.xml` | `enablePatientRegistration`: "most recent registration" summary widget, editable | both | `App: registrationapp.registerPatient` | – | patient with a registration encounter; opened via the edit link in the registration summary |
| `patientRegistration-localAddress.xml` | same, SL-only widget | both | `App: registrationapp.registerPatient` | – | same |
| `dispensing.xml` | `enableDispensing` / `enableDispensingForm` | none | `Task: mirebalais.dispensing` | Dispensing Location | **Not offered** in SL (neither component is set) |

Fixture shorthand: "female, age≥10" = patient `gender F`, `age ≥ 10` at the time of the visit page render (current age, not visit-start age, for these helpers).

## Visit-page sections (`section-*.xml`)

`section-*.xml` are **not** included by the entry forms (`grep 'path=".*section-' htmlforms/*.xml` finds nothing). They are standalone HFE forms used as the **view template and edit link of an "encounter section"** on the visit page, wired in `pihemr` `scripts/visit/encounterTypeConfig.js` (`templateModelUrl` / `editUrl` per section, `sections: [...]` per encounter type). Resolution: `EncounterTypeConfig.get(encounter, country, site)` → country (`sierra_leone`) → site → `versions[encounter.form.version]`, falling back to `versions.DEFAULT`.

Test access: open the visit page, expand the encounter, click the section's edit pencil (opens `editHtmlFormWithStandardUi.page?...definitionUiResource=file:configuration/pih/htmlforms/section-<x>.xml`).

| Encounter type (Sierra Leone) | Sections shown (section file) |
|---|---|
| NCD initial / initial-part-2 | `section-ncd-history` (initial only), `section-ncd-notes` (part 2 only), `section-hospital` (initial & part 1), `section-diabetes`, `section-hypertension`, `section-heart-failure`, `section-lung`, `section-kidney`, `section-liver`, `section-palliative`, `section-sickle-cell`, `section-other-ncd`, `section-dx`, `section-ncd-plan` (part 1: history + hospital only) |
| NCD followup / followup-part-1 / part-2 | `section-ncd-followup` (full followup & part 1), `section-hospital` (full & part 1), then the same disease sections, `section-dx`, `section-ncd-plan` (full & part 2) |
| ANC intake (form version without an explicit key, e.g. `ancIntake.xml` 3.1 → `versions.DEFAULT`) | `section-anc-intake` + vaccinations widget |
| ANC followup (3.x → DEFAULT) | `section-anc-followup` + vaccinations |
| MCH delivery (SL) | `section-delivery`, diagnoses (`section-dx`), `section-plan-medication` |
| Postnatal followup | `section-postnatal-followup` + vaccinations |
| Outpatient initial | `section-history`, vaccinations widget, `section-peds` (food & supplements; only if patient < 15 years at visit start), `section-exam`, `section-dx`, `section-plan` |
| Outpatient followup | `section-chief-complaint` instead of `section-history`; otherwise as outpatient initial |
| `section-plan-medication` | shown as "Plan medication" for MCH delivery (SL) and ANC versions 1.1/2.0 |

Unverified: the exact `versions` key per form version (read only for ANC intake/followup, delivery, postnatal and NCD). Sections not in the list above (`section-anc-*` older versions, oncology, etc.) are not Sierra Leone entry points.

## Per-form facts that tests commonly need

- Mode: forms are opened in ENTER from the visit action, EDIT via the visit-page edit link (standard or simple UI by encounter type), VIEW via the encounter template.
- `familyPlanningIntake.xml` and `familyPlanningFollowup.xml` share one `formUuid` but are bound to two encounter types (`52fe1a29…` intake, `5a1d1710…` followup).

## Confirmed by the e2e specs (KGH test server, 2026-10-23)
What the specs showed about reaching the forms. The harness logs in with the session location MCH OPD and the admin user.

- **Direct URLs skip the gating.** Both `editHtmlFormWithStandardUi.page` (section forms, on an encounter created over REST) and `enterHtmlFormWithStandardUi.page` (top-level forms, in a visit created over REST) open without the component, privilege or visit-page requirements in the rows above. The gating itself is not tested.
- **Session location vs the form's location tag.** MCH OPD carries "Maternal and Child Location", so the header forms (`ancIntake`, ...) auto-submit with the default provider and location. For the forms below the tag is missing and the Location select starts empty (and is required), so a test must pick one: the newborn forms ("MCH Triage Location": NICU, Triage | MCOE), `ancProgress` / `laborProgress` (Antenatal Ward), `laborDeliverySummary` (Labour and Delivery), `postpartumDailyProgress` (Postnatal Ward), `vitals` (Vitals Location). `vitalsWithGlucose` presets one.
- **Simple UI.** `vitals.xml` and `vitalsWithGlucose.xml` are launched with `enterHtmlFormWithSimpleUi.page` in production; only that UI defines `ExitHandlers` / `NavigatorController`, so their cm/mm conversion, glucose toggle and required-fieldset enforcement run only there.
- **Redirect after save.** Most forms return to the `returnUrl`; `laborDeliverySummary.xml` goes to `pihcore/children/children.page`.
- **Program side effects of a save** (asserted in the specs): Infant program on `newbornInitial`, `newbornDailyProgress`, `newbornAssessment`, `newbornDischarge`; Pregnancy program on `section-anc-followup`, `section-postnatal-followup`, `ancProgress`, `laborProgress`; NCD program on `section-ncd-followup`, `section-ncd-history`, `section-ncd-plan`. `laborDeliverySummary` and `postpartumDailyProgress` move an Antenatal enrolment to Delivered, or enrol directly in Delivered when there is none (the enrolment must start before the delivery date, or a separate historic one is created).
- **Orders and registrations.** A saved lab order (`testorder`) cannot be purged over REST, and saving an Alive infant in `laborDeliverySummary` registers a baby patient; the specs avoid both.
- **Location select, by form.** Preselected by MCH OPD (no pick needed): the header forms (`ancIntake`, `ancFollowup`, `delivery`, `postnatalFollowup`), `maternalDeath`, `familyPlanning*`, `gynecology*`, `gainMaternalRegister`, `gainNewbornRegister`. Empty and required (a test picks an option by index): `outpatient-*` and `ncd-*` (these show the form instead of auto-submitting), `maternalAdmission`, `maternalDischarge`, `checkin`, `checkinMaternal`, `inpatientVitals`, `inpatientNewbornVitals`, `triage`, `pacuFollowup`, `surgicalPostOpNote` (provider too), plus the forms listed above.
- **Not enterable through the standard entry page, so no spec:** `patientRegistration-localAddress` and `patientRegistration-social` (fragments of the registration app) and `dispensing.xml` (legacy, "Not offered" in Sierra Leone, launched from the dispensing queue, its save creates drug orders). `maternalDischarge-print.xml` is view-only: its spec saves a real discharge, then requests `getAsHtml.action` with an `Accept: application/json` header (without it the server throws "Don't know what to use as success url") and asserts the returned HTML.
- **Effects of a save found while testing.** `maternalDischarge` with Home closes the visit and enrols the patient in Delivered (an Antenatal enrolment moves to Delivered); the Death disposition marks the patient dead through core handling and is deliberately not saved. `maternalDeath` does not mark the patient dead or close the visit. `checkinMaternal` with "Refer to MCOE triage" ticked may create a queue entry that cannot be purged, so the checkbox is only toggled.
