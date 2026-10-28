import { test, expect, birthdateYearsAgo } from "../../core";
import { POSTNATAL_FOLLOWUP_ENCOUNTER_TYPE_UUID } from "../../core/constants";
import { getPatientEncounters } from "../../commands";
import { EntryFormPage, ViewFormPage } from "../../pages";

// postnatalFollowup.xml: header form ("Postnatal Followup"), only the shared encounter-with-sections shell (documentation/_shared.e2e.md);
// its content is in the section-* forms reached via Next. The specs open enterHtmlFormWithStandardUi inside a visit
// they create, so availability (documentation/_availability.e2e.md: female, age >= 10, no postnatal followup in the visit) is not exercised.
//
// Conditions: ifMode ENTER (encounter-with-sections.xml:12) auto-submits when provider, location and date all have a value.
// The provider defaults to the current user and the location to the session location (tags="Maternal and Child Location", present on MCH OPD),
// so a fresh ENTER saves an encounter with no obs and redirects.
// Side effects on save: none. VIEW is covered by the test below (the header has no content of its own in VIEW: ifMode VIEW include=false on the
// title, the provider/location/date block and the buttons, so the saved encounter renders blank). Not covered: Next to the section form, EDIT mode,
// shared provider/location/date behaviour.

const FORM = "postnatalFollowup.xml";

test.describe("postnatalFollowup", () => {
  test("opening the form in ENTER mode saves a Postnatal Followup encounter with the defaults and redirects", async ({
    page,
    api,
    createEntryContext,
  }) => {
    // ifMode ENTER (encounter-with-sections.xml:12): all #who-when-where inputs have a value -> submitHtmlForm()
    const context = await createEntryContext({
      givenName: "AutoPostnatalFollowup",
      familyName: "Tester",
      gender: "F",
      birthdate: birthdateYearsAgo(25),
    });
    expect(await getPatientEncounters(api, context.patient.uuid)).toHaveLength(
      0,
    );

    await EntryFormPage.open(page, FORM, context);
    await expect(page).toHaveURL(/referenceapplication\/home\.page/);

    await expect
      .poll(async () =>
        (await getPatientEncounters(api, context.patient.uuid)).map(
          (e) => e.encounterType.uuid,
        ),
      )
      .toEqual([POSTNATAL_FOLLOWUP_ENCOUNTER_TYPE_UUID]);

    // VIEW: nothing but the (empty) shell: no saved value, and none of the ENTER/EDIT widgets or buttons
    const [encounter] = await getPatientEncounters(api, context.patient.uuid);
    const view = await ViewFormPage.open(page, FORM, encounter.uuid);
    await expect(view.values).toHaveCount(0);
    await expect(page.locator("#who-when-where, #buttons, input, select, textarea, button")).toHaveCount(0);
    await expect(page.locator("h2")).toHaveCount(0);
  });
});
