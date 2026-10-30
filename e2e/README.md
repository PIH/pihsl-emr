# End-to-end tests

Playwright tests for the Sierra Leone HTML forms. The layout follows `pihmalawi-emr/e2e` (`core/`, `fixtures/`, `commands/`, `pages/`, `specs/`); some fixtures and commands are duplicated for now and can move to a shared package later.

## Running locally

Needs a running Sierra Leone OpenMRS server (the default is `http://localhost:7070/openmrs`) and Node.js 22+ (`nvm use`).

```bash
cd e2e
npm install
npx playwright install chromium
cp .env.example .env    # then edit: URL and admin credentials of your server; quote values containing spaces
npx playwright test
```

Use a server with **test data only**. The specs create their own synthetic patients and void them afterwards (nothing is purged, so the user does not need the Purge privileges; the voided patients stay in the database), but they log in as the admin user and write to the server.

A full run is about 614 tests: about 16 minutes with `E2E_WORKERS=3` (`E2E_WORKERS=3 npx playwright test`), and roughly twice that with the default single worker. Each test has its own synthetic patient, so workers do not share data, but they share the server: raise the count only if it keeps up. Several `npx playwright test` processes at once (e.g. parallel agents) must each pass their own `--output <dir>`, or they overwrite each other's `test-results`. The specs share one login session (created in `core/global-setup.ts`), so if the machine sleeps during a run the session expires and every later test fails with `create patient: 401`. Keep the machine awake, e.g. `systemd-inhibit --what=sleep:idle npx playwright test`. Run a few specs at a time while iterating (`npx playwright test specs/<form>`).

## Forms tested

One spec per form, in `specs/<xml file name without .xml>/`. *Form name*, *Form version*, *Form uuid* and *Encounter uuid* are the `formName`, `formVersion`, `formUuid` and `formEncounterType` of the form's `<htmlform>` element; *Encounter* is the name of that encounter type. Keep a row here when you add, rename or remove a spec, and update it when the form's version or uuid changes.

### Top-level (entry) forms

| XML file | Form name | Form version | Form uuid | Encounter | Encounter uuid |
|---|---|---|---|---|---|
| `ancFollowup.xml` | Prenatal Followup | 3.1 | `0ad6338a-086d-4fb8-9926-332753b0cf19` | ANC Followup | `00e5e946-90ec-11e8-9eb6-529269fb1459` |
| `ancIntake.xml` | ANC First Visit (Initial) | 3.1 | `a3b04938-1da7-4582-8b66-c9575790b63b` | ANC Intake | `00e5e810-90ec-11e8-9eb6-529269fb1459` |
| `ancProgress.xml` | ANC Progress | 1.0 | `abec7eeb-3db4-450e-a254-3d6c01515976` | ANC Progress | `ce67f875-726f-4314-abd5-6bcaec10d273` |
| `ayfsFollowup.xml` | AYFS Followup | 1.0 | `2db3e8df-f950-493f-85b2-90a9477cd02f` | AYFS Followup | `73399721-644e-494b-86c9-5dd345072db3` |
| `ayfsIntake.xml` | AYFS Initial | 1.0 | `c225bf8c-40ff-4911-83e0-44c876bc3865` | AYFS Initial | `1f3375af-fd9e-42a9-954e-99533ee15de9` |
| `ballardScore.xml` | Ballard Score | 1.0 | `ca499bac-1a8d-4d92-8b36-8b30ab771f12` | Ballard Score | `8e027b32-13de-491b-9f29-534d21a48f0d` |
| `cervicalCancerScreening.xml` | Cervical Cancer Screening | 1.0 | `6a25ba50-cba6-44c2-a132-9fad31e01f17` | Cervical Cancer Screening | `820a80b0-1d59-407e-acbb-56abb69abd35` |
| `checkin.xml` | Check-In | 3.0 | `c233ca6a-ebe2-4d5a-8f79-466c3aced2a0` | Check-In | `55a0d3ea-a4d7-4e88-8f01-5aceb2d3c61b` |
| `checkinMaternal.xml` | Maternal Check-In | 1.0 | `9a5a5d5b-4e99-43a0-8b66-8c9b97963354` | Sierra Leone Maternal Check-in | `251c03fa-a9dc-4157-855f-b016f4fae9ab` |
| `delivery.xml` | MCH Delivery | 4.0 | `4d90fcbb-0b2e-4667-bd57-7571d44ac086` | MCH Delivery | `00e5ebb2-90ec-11e8-9eb6-529269fb1459` |
| `familyPlanningFollowup.xml` | Family Planning Initial | 1.0 | `dffa9543-2cf0-4b9e-9306-0aebeb7a1835` | Family Planning Followup | `5a1d1710-98b0-4e5f-8f6b-c9cef0c8cf05` |
| `familyPlanningIntake.xml` | Family Planning Initial | 1.0 | `dffa9543-2cf0-4b9e-9306-0aebeb7a1835` | Family Planning Initial | `52fe1a29-678d-49cb-9ccd-7296d634284d` |
| `gainMaternalRegister.xml` | Maternity and Delivery Register | 1.0 | `e8bdd24e-0fba-4fe9-969f-316f70722c39` | Maternity and Delivery Register | `9cc89b83-e32f-410a-947d-aeb3bda37571` |
| `gainNewbornRegister.xml` | SCBU Newborn Register | 1.0 | `a165541e-9745-4891-b6d7-b8374575e63e` | SCBU Newborn Register | `3790ecc6-bc63-48f8-9104-f81dc90ee21c` |
| `gynecologyFollowup.xml` | Gynecology Followup | 1.0 | `c1303824-0fba-4e08-932a-c10990956d00` | Gynecology Followup | `9b973514-7799-41b6-85f1-1ebc752d01f0` |
| `gynecologyIntake.xml` | Gynecology Initial | 1.0 | `b456c65f-4d3b-4d1d-b1f5-952e78fa0121` | Gynecology Initial | `34700f4f-c3df-4cfc-863a-bd8b92a0a485` |
| `inpatientNewbornVitals.xml` | Vital Signs Newborn Inpatient | 1.0 | `e1e64fc8-ccf2-40ee-8ebb-7cb659d1d236` | Inpatient Vitals | `6b1c3929-f23c-423f-8cad-64b17cf10b99` |
| `inpatientVitals.xml` | Vital Signs Inpatient | 1.0 | `ce487212-2263-4a5d-a1c1-3879a3e9a141` | Inpatient Vitals | `6b1c3929-f23c-423f-8cad-64b17cf10b99` |
| `laborDeliverySummary.xml` | Labour and Delivery Summary | 1.0 | `51f7451f-1d27-4907-aafb-a20ba3894048` | Labor and Delivery Summary | `fec2cc56-e35f-42e1-8ae3-017142c1ca59` |
| `laborProgress.xml` | Labour Progress | 1.0 | `837fec21-38f2-4deb-aa3a-d93a79a5a7ab` | Labour Progress | `ac5ec970-31b7-4659-9141-284bfbc13c69` |
| `maternalAdmission.xml` | Maternal Admission | 1.0 | `2eceee55-4308-41b5-8d76-d5197cf57818` | Admission | `260566e1-c909-4d61-a96f-c1019291a09d` |
| `maternalDeath.xml` | Maternal Death | 1.0 | `25485cdd-5cb3-4d91-abc4-029718254954` | Maternal Death | `415b342e-9e4d-4496-bac4-7b6ffb8619f0` |
| `maternalDischarge.xml` | Maternal Discharge | 1.1 | `ccd256b4-a861-4ec2-88f8-6d56927a09b2` | Maternal Discharge | `2110a810-db62-4914-ba95-604b96010164` |
| `maternalDischarge-print.xml` | Maternal Discharge (Print) | 1.0 | `a5377e3a-228e-4186-b6f5-a86d0ba0d136` | Maternal Discharge | `2110a810-db62-4914-ba95-604b96010164` |
| `mentalHealth.xml` | Mental Health Intake | 2.0 | `55399407-F739-4647-B940-A68CC45483F4` | Mental Health Consult | `a8584ab8-cc2a-11e5-9956-625662870761` |
| `mentalHealthFollowup.xml` | Mental Health Follow-up | 2.0 | `55DA9EF7-DCBE-4B9F-9A77-C905862BD565` | Mental Health Follow-up | `9d701a81-bb83-40ea-9efc-af50f05575f2` |
| `ncd-followup.xml` | NCD Followup | 2.0 | `4969ab47-6212-46dd-ac49-11c75b2e04d9` | NCD Followup Consult | `5cbfd6a2-92d9-4ad0-b526-9d29bfe1d10c` |
| `ncd-followup-part-1.xml` | NCD Followup (Part 1) | 2.0 | `ab30cec8-b1f9-4383-90a7-03411337ebfb` | NCD Followup Part 1 only | `e02a8c32-4f14-4ff7-a4e9-2f087d9a1cf7` |
| `ncd-followup-part-2.xml` | NCD Followup (Part 2) | 1.0 | `4daeb7ca-6ba5-48fc-8a92-478a67f75ad5` | NCD Followup Part 2 only | `6a3afa6f-8f78-44a9-80c9-3f4f3b6ad8f2` |
| `ncd-initial.xml` | NCD Initial | 2.0 | `c5ccc0dd-a15c-408c-98dd-97b696a6465a` | NCD Initial Consult | `ae06d311-1866-455b-8a64-126a9bd74171` |
| `ncd-initial-part-1.xml` | NCD Initial (Part 1) | 2.0 | `94371e9b-69dc-4c34-a2f0-290cd5070187` | NCD Initial Part 1 only | `48c413c4-e7f6-491a-8431-900451fe8a32` |
| `ncd-initial-part-2.xml` | NCD Initial (Part 2) | 2.0 | `7179edaf-9006-49cd-8f12-862ec494f75b` | NCD Initial Part 2 only | `43423212-6f70-4df8-a9f7-2aef88df1ee2` |
| `newbornAdmissionNote.xml` | Newborn Admission | 1.0 | `AA165115-CAB7-46DA-9B49-917091EE5540` | Admission | `260566e1-c909-4d61-a96f-c1019291a09d` |
| `newbornAssessment.xml` | Newborn Assessment | 1.0 | `17e93a76-32d1-4435-a5e3-3068e305c2d7` | Newborn Assessment | `6444b8d4-407d-444d-aa15-d6dff204ed83` |
| `newbornDailyProgress.xml` | Newborn Daily Progress | 1.1 | `3eddc127-3417-4878-9210-88c55040535f` | Newborn Daily Progress | `7e42e652-89e7-4559-80fd-41f42826c98c` |
| `newbornDischarge.xml` | Newborn Discharge | 1.1 | `edb9d20b-6537-4593-9002-152bd3b61605` | Newborn Discharge | `153d3182-c76f-4047-b7f2-d83cf967b206` |
| `newbornInitial.xml` | Newborn Initial | 1.1 | `18e9f245-c4c5-4af7-8a72-4bd8b67dcd86` | Newborn Initial | `093b6ffc-e55a-461a-85cc-c6acf7714a23` |
| `nicuTriage.xml` | NICU Triage | 1.0 | `83acacb4-eba6-4573-83e7-5d2e468deb50` | NICU Triage | `fb4318dd-cca9-4d20-bb31-0d4eba947d74` |
| `outpatient-followup.xml` | Outpatient Followup | 2.0 | `4CE4BA22-16B2-4C85-9B07-5E3696490BC8` | Sierra Leone Outpatient Followup | `d8a038b5-90d2-43dc-b94b-8338b76674f3` |
| `outpatient-initial.xml` | Outpatient Initial | 2.0 | `C5B788D4-223D-430A-9A90-ADBE63C4A3E8` | Sierra Leone Outpatient Initial | `7d5853d4-67b7-4742-8492-fcf860690ed5` |
| `pacuFollowup.xml` | PACU Followup | 1.0 | `43b275f0-6e20-4538-ba94-19df332d4f76` | PACU Followup | `6f2df970-6e3e-4898-9a34-9d9e8955c3eb` |
| `postnatalFollowup.xml` | Postnatal Followup | 1.1 | `929df787-1236-4cb8-a3a2-5aa7a7600d8c` | Postnatal Followup | `b7a7c300-f7e5-4d38-a388-fc178ab02e78` |
| `postpartumDailyProgress.xml` | Postpartum Daily Progress | 1.0 | `569f6534-fb05-4d8d-aa2e-1b832223e1b8` | Postpartum progress | `37f04ddf-9653-4a02-98b4-1c23734c2f15` |
| `surgicalPostOpNote.xml` | Surgical Note | 2.5 | `3fd75be3-2c5b-40be-8b6e-f00cb0ecda22` | Surgery Note | `c4941dee-7a9b-4c1c-aa6f-8193e9e5e4e5` |
| `triage.xml` | MCOE Triage | 1.0 | `ae39663d-c248-4cee-b48e-5eb226f74e47` | Sierra Leone MCH Triage | `41911448-71a1-43d7-bba8-dc86339850da` |
| `vitals.xml` | Vitals | 2.2 | `68728aa6-4985-11e2-8815-657001b58a90` | Vital Signs | `4fb47712-34a6-40d2-8ed3-e153abbd25b7` |
| `vitalsWithGlucose.xml` | Vitals with glucose | 1.0 | `e867a9a5-e5d4-4e9f-b6ab-2abcd152d35d` | Vitals with Glucose | `2fd151a2-fbef-43e3-b82d-c3f70f1d7333` |

`maternalDischarge-print.xml` is the print view of `maternalDischarge.xml`; both are tested (`specs/maternalDischarge` and `specs/maternalDischarge-print`). The form name in `familyPlanningFollowup.xml` is "Family Planning Initial" in the XML itself.

### Section forms

A section form has no `formEncounterType`: it edits an encounter that another form created. The Encounter and Encounter uuid columns list the encounter type(s) of the encounter its spec creates over REST and opens (a section used by several parents lists them all).

| XML file | Form name | Form version | Form uuid | Encounter | Encounter uuid |
|---|---|---|---|---|---|
| `section-anc-followup.xml` | Prenatal followup section | 4.0 | `d7ed025a-7d8f-46ae-abc6-03de835ef903` | ANC Followup | `00e5e946-90ec-11e8-9eb6-529269fb1459` |
| `section-anc-intake.xml` | ANC First (Initial) section | 4.0 | `e046d2df-1b46-4a7c-94ad-9d3bdeabac86` | ANC Intake | `00e5e810-90ec-11e8-9eb6-529269fb1459` |
| `section-chief-complaint.xml` | Chief Complaint | 1.0 | `71ee5c0c-d8ae-4777-af9f-bb57f563503a` | Sierra Leone Outpatient Followup | `d8a038b5-90d2-43dc-b94b-8338b76674f3` |
| `section-delivery.xml` | MCH Delivery section | 4.0 | `adf7fa6e-6302-4cdf-bdae-fe3426e1eea2` | MCH Delivery | `00e5ebb2-90ec-11e8-9eb6-529269fb1459` |
| `section-diabetes.xml` | Diabetes | 1.0 | `d26b1ddf-d410-4a9f-be0f-b516e7c26c40` | NCD Followup Consult<br>NCD Initial Consult | `5cbfd6a2-92d9-4ad0-b526-9d29bfe1d10c`<br>`ae06d311-1866-455b-8a64-126a9bd74171` |
| `section-dx.xml` | Diagnostic | 1.0 | `3498f204-a6fa-4df0-b7fd-a94eb03a43c9` | Sierra Leone Outpatient Initial | `7d5853d4-67b7-4742-8492-fcf860690ed5` |
| `section-exam.xml` | Physical exam | 2.0 | `b34b71f4-03f1-11e5-8418-1697f925ec7b` | Sierra Leone Outpatient Initial | `7d5853d4-67b7-4742-8492-fcf860690ed5` |
| `section-heart-failure.xml` | Heart Failure | 1.0 | `8301277b-1062-4c15-8701-9771ac95e599` | NCD Followup Consult<br>NCD Initial Consult | `5cbfd6a2-92d9-4ad0-b526-9d29bfe1d10c`<br>`ae06d311-1866-455b-8a64-126a9bd74171` |
| `section-history.xml` | History | 1.0 | `162091b1-0060-4e56-8c17-7015aeddf608` | NCD Initial Consult<br>Sierra Leone Outpatient Initial | `ae06d311-1866-455b-8a64-126a9bd74171`<br>`7d5853d4-67b7-4742-8492-fcf860690ed5` |
| `section-hospital.xml` | NCD hospitalization | 2.0 | `0b98d2c7-716d-44c1-b343-6a8b41b09580` | NCD Followup Consult | `5cbfd6a2-92d9-4ad0-b526-9d29bfe1d10c` |
| `section-hypertension.xml` | Hypertension | 1.0 | `3a1d79fe-9aa0-4289-bcea-c70aae516234` | NCD Followup Consult<br>NCD Initial Consult | `5cbfd6a2-92d9-4ad0-b526-9d29bfe1d10c`<br>`ae06d311-1866-455b-8a64-126a9bd74171` |
| `section-kidney.xml` | Chronic Kidney Disease | 1.0 | `1a66029d-0e0c-410b-9fa6-8ea26f697cb8` | NCD Followup Consult<br>NCD Initial Consult | `5cbfd6a2-92d9-4ad0-b526-9d29bfe1d10c`<br>`ae06d311-1866-455b-8a64-126a9bd74171` |
| `section-liver.xml` | Liver Disease | 1.0 | `4357b34b-ab3a-4404-ab33-a73104b26fdb` | NCD Followup Consult<br>NCD Initial Consult | `5cbfd6a2-92d9-4ad0-b526-9d29bfe1d10c`<br>`ae06d311-1866-455b-8a64-126a9bd74171` |
| `section-lung.xml` | Chronic Lung Disease | 1.0 | `add648f7-7d24-47ce-9456-8006021e074e` | NCD Followup Consult<br>NCD Initial Consult | `5cbfd6a2-92d9-4ad0-b526-9d29bfe1d10c`<br>`ae06d311-1866-455b-8a64-126a9bd74171` |
| `section-ncd-followup.xml` | NCD Visit Information | 1.0 | `1d764c06-ebdc-42fa-b75a-d5b789e3f630` | NCD Followup Consult | `5cbfd6a2-92d9-4ad0-b526-9d29bfe1d10c` |
| `section-ncd-history.xml` | NCD History | 2.0 | `a29c13c8-1d46-4f58-bb09-c9b71e6bc5bf` | NCD Followup Consult<br>NCD Initial Consult<br>NCD Initial Part 1 only | `5cbfd6a2-92d9-4ad0-b526-9d29bfe1d10c`<br>`ae06d311-1866-455b-8a64-126a9bd74171`<br>`48c413c4-e7f6-491a-8431-900451fe8a32` |
| `section-ncd-notes.xml` | NCD Overview | 2.0 | `9f84ab34-73ef-46d3-951c-af29c589abc4` | NCD Initial Part 2 only | `43423212-6f70-4df8-a9f7-2aef88df1ee2` |
| `section-ncd-plan.xml` | NCD Plan | 1.0 | `aa8d9374-f343-4818-8433-66f4e6145a7f` | NCD Followup Consult | `5cbfd6a2-92d9-4ad0-b526-9d29bfe1d10c` |
| `section-other-ncd.xml` | Other NCD | 1.0 | `2cfad355-c6e9-4466-8c11-860f10c8a270` | NCD Followup Consult | `5cbfd6a2-92d9-4ad0-b526-9d29bfe1d10c` |
| `section-palliative.xml` | Palliative Care | 1.0 | `226796bc-24b0-4af7-98b3-f07b26e390cf` | NCD Followup Consult<br>NCD Initial Consult | `5cbfd6a2-92d9-4ad0-b526-9d29bfe1d10c`<br>`ae06d311-1866-455b-8a64-126a9bd74171` |
| `section-peds.xml` | Pediatrics feeding and supplements | 1.0 | `c278f802-57be-11e9-8647-d663bd873d93` | Sierra Leone Outpatient Initial | `7d5853d4-67b7-4742-8492-fcf860690ed5` |
| `section-plan.xml` | Plan | 2.0 | `589508A0-BD24-484B-B8FE-E81E28ED982D` | Sierra Leone Outpatient Initial | `7d5853d4-67b7-4742-8492-fcf860690ed5` |
| `section-plan-medication.xml` | Plan Medication | 2.0 | `8DF0DB24-B0F2-4786-9585-00F730516F02` | MCH Delivery | `00e5ebb2-90ec-11e8-9eb6-529269fb1459` |
| `section-postnatal-followup.xml` | Postnatal followup section | 2.0 | `6f7fcbfb-6e42-400a-9f9c-cbc7f26c07c6` | Postnatal Followup | `b7a7c300-f7e5-4d38-a388-fc178ab02e78` |
| `section-sickle-cell.xml` | Sickle Cell | 1.0 | `23afe1ed-76c4-4642-b37b-44944a9dbed9` | NCD Followup Consult<br>NCD Initial Consult | `5cbfd6a2-92d9-4ad0-b526-9d29bfe1d10c`<br>`ae06d311-1866-455b-8a64-126a9bd74171` |

## Section specs

`specs/section-<x>/` tests `htmlforms/section-<x>.xml`. A section is a standalone form that edits an existing encounter (on the visit page it opens from the section's edit pencil). Each spec:

1. creates a patient, a visit and an empty encounter of the section's encounter type over REST (`createSectionEncounter`),
2. opens `editHtmlFormWithStandardUi.page?...definitionUiResource=file:configuration/pih/htmlforms/section-<x>.xml` directly (`SectionFormPage`), so the visit-page gating documented in `htmlforms/documentation/_availability.e2e.md` is not exercised,
3. asserts the form's conditions and scripts, and the obs saved on the encounter.

The conditions each spec covers are listed in a comment at the top, taken from the inventory (`htmlforms/documentation/inventory.py`), together with the form's scripts, side effects and Verify findings.

## Top-level (entry form) specs

`specs/<form>/` for a top-level form (`ancIntake`, `vitals`, `laborProgress`, ...) tests a form that **creates** the encounter. The spec creates a patient with an active visit and no encounter (`createEntryContext`), opens `enterHtmlFormWithStandardUi.page?...definitionUiResource=file:configuration/pih/htmlforms/<form>.xml` (`EntryFormPage`), and reads the new encounter back with `getPatientEncounters` / `getEncounterObs`. The visit-page gating in `_availability.e2e.md` is not exercised. Notes from writing them:

- Most of these forms use the HFE `<submit>` tag, which renders `input.submitButton` inside `#buttons`, not `#submit`. The session location (MCH OPD) often lacks the form's location tag, so the Location select starts empty and each save test picks one.
- `vitals` and `vitalsWithGlucose` are opened in production with the Simple UI (`enterHtmlFormWithSimpleUi.page`); the Standard UI does not define `ExitHandlers`, so some scripts only run there.

### VIEW mode

Every spec that saves also opens the read-only rendering of what it saved (`pages/view-form-page.ts`). VIEW is loaded the way the visit page does it, through `viewEncounterWithHtmlForm/getAsHtml.action`, into the test page with `setContent` (htmlformentryui has no standalone VIEW page, and `viewEncounterWithHtmlForm.page` throws for an encounter created over REST). `expectViewShowsSavedObs(page, api, form, encounterUuid, labels?)` checks that every saved text, number and coded obs appears in a `span.value`; the specs add targeted assertions on top (obs groups, custom answer labels, dates, what was left empty must not show). Things to know:

- Saved values are `span.value` (`[X] label` for a selected radio or checkbox), unanswered ones `span.emptyValue`. The shell entry forms of the NCD, ANC and delivery encounters render nothing in VIEW by design (their sections do): the specs assert that.
- `setContent` runs no jQuery, so show/hide (`when`, `toggle`) and the VIEW scripts (vitals colouring, BMI, the Aldrete total) do not run. A few specs (`pacuFollowup`, `vitals`, `vitalsWithGlucose`) start from a page that has `jq` to run them.
- The diagnosis widget prints plain text, not `span.value`, so diagnosis obs are not matched by the helper; the specs assert the printed text.
- Findings only visible in VIEW are numbered `VW<n>` in the spec headers and marked `test.fixme()` like the others.

### Known form bugs

Tests for behaviour that is currently broken assert the **intended** behaviour and are marked `test.fixme()` with the finding id (e.g. `section-hospital` V1). They are skipped, so a run stays green and fast; remove the marker when the form is fixed and the test should pass. Temporarily change `test.fixme()` to `test.fail()` to check whether a bug is still there (it fails the run once the bug is fixed). The findings, scripts and side effects of each form are documented in the header comment of its spec; the skill for writing specs is `htmlforms/documentation/hfe-e2e-specs.skill.md`.
