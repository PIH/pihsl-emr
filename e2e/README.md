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

Use a server with **test data only**. The specs create their own synthetic patients and purge them afterwards, but they log in as the admin user and write to the server.

A full run is about 528 tests and 27 minutes. The specs share one login session (created in `core/global-setup.ts`), so if the machine sleeps during a run the session expires and every later test fails with `create patient: 401`. Keep the machine awake, e.g. `systemd-inhibit --what=sleep:idle npx playwright test`. Run a few specs at a time while iterating (`npx playwright test specs/<form>`).

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
- Never save an order from a spec: an encounter with a lab order cannot be purged over REST.

### Known form bugs

Tests for behaviour that is currently broken assert the **intended** behaviour and are marked `test.fail()` with the finding id (e.g. `section-hospital` V1). They show as passing while the bug exists and will start failing, prompting you to remove the marker, once the form is fixed. The findings, scripts and side effects of each form are documented in the header comment of its spec; the skill for writing specs is `htmlforms/documentation/hfe-e2e-specs.skill.md`.
