import { test, expect, birthdateYearsAgo } from "../../core";
import { VISIT_PAGE_URL } from '../../pages';
import { ANC_FOLLOWUP_ENCOUNTER_TYPE_UUID } from "../../core/constants";
import { getEncounterObs, getPatientEncounters } from "../../commands";
import { EntryFormPage, VisitPage, submitShellForm } from "../../pages";

// ancFollowup.xml: header form ("Prenatal Followup"), only the shared encounter-with-sections shell (documentation/_shared.e2e.md);
// its content is in the section-* forms reached via Next. The specs open enterHtmlFormWithStandardUi inside a visit
// they create, so availability (documentation/_availability.e2e.md: female, age >= 10; no ANC intake or followup in the visit) is not exercised.
//
// Conditions: ifMode ENTER (encounter-with-sections.xml:12) auto-submits when provider, location and date all have a value.
// The provider defaults to the current user and the location to the session location (tags="Maternal and Child Location", present on MCH OPD),
// so a fresh ENTER saves an encounter with no obs and redirects.
// Side effects on save: none.
// Visit-page display: the visit page does NOT show this form's VIEW (the shell renders nothing anyway: the who/when/where block,
// the heading and the buttons are ifMode VIEW include=false). The Prenatal Followup entry of encounterTypeConfig.js (// ancFollowup,
// sierra_leone) has `shortTemplate`/`longTemplate: defaultEncounterShort.page` and no templateModelUrl of its own: it lists the
// encounter with its `sections` (section-anc-followup, with the VIEW of section-anc-followup.xml: see that spec).
// The VIEW test asserts that list; the form's own VIEW is therefore not tested.
// Not covered: Next to the section form, EDIT mode, shared provider/location/date behaviour.

test.describe("ancFollowup", () => {
  test("opening the form in ENTER mode saves a Prenatal Followup encounter with the defaults and redirects", async ({
    page,
    api,
    createEntryContext,
  }) => {
    // ifMode ENTER (encounter-with-sections.xml:12): all #who-when-where inputs have a value -> submitHtmlForm()
    const context = await createEntryContext({
      givenName: "AutoAncFollowup",
      familyName: "Tester",
      gender: "F",
      birthdate: birthdateYearsAgo(25),
    });
    expect(await getPatientEncounters(api, context.patient.uuid)).toHaveLength(
      0,
    );

    await EntryFormPage.open(page, "ancFollowup.xml", context);
    await submitShellForm(page);
    await expect(page).toHaveURL(VISIT_PAGE_URL);

    await expect
      .poll(async () =>
        (await getPatientEncounters(api, context.patient.uuid)).map(
          (e) => e.encounterType.uuid,
        ),
      )
      .toEqual([ANC_FOLLOWUP_ENCOUNTER_TYPE_UUID]);
  });

  test("the visit page lists the saved encounter with its sections (the shell form has no VIEW of its own)", async ({
    page,
    api,
    createEntryContext,
  }) => {
    const context = await createEntryContext({
      givenName: "AutoAncFollowup",
      familyName: "Tester",
      gender: "F",
      birthdate: birthdateYearsAgo(25),
    });
    await EntryFormPage.open(page, "ancFollowup.xml", context);
    await submitShellForm(page);
    await expect(page).toHaveURL(VISIT_PAGE_URL);
    await expect.poll(async () => (await getPatientEncounters(api, context.patient.uuid)).length).toBe(1);
    const [encounter] = await getPatientEncounters(api, context.patient.uuid);
    expect(await getEncounterObs(api, encounter.uuid)).toHaveLength(0);

    const visit = await VisitPage.open(page, context.visitUuid);
    const entry = visit.encounterOfType(ANC_FOLLOWUP_ENCOUNTER_TYPE_UUID);
    await expect(entry).toHaveCount(1);
    await visit.expand(entry);
    // the form-backed sections of the sierra_leone entry (the vaccinations include-section is not an encounter-section)
    for (const section of ["section-anc-followup"]) {
      await expect(visit.section(section), `section ${section} of the Prenatal Followup entry`).toBeVisible();
    }
  });
});
