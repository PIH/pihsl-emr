import { test, expect, birthdateYearsAgo } from "../../core";
import { MCH_DELIVERY_ENCOUNTER_TYPE_UUID } from "../../core/constants";
import { getPatientEncounters } from "../../commands";
import { EntryFormPage } from "../../pages";

// delivery.xml: header form ("MCH Delivery"), only the shared encounter-with-sections shell (documentation/_shared.e2e.md);
// its content is in the section-* forms reached via Next. The specs open enterHtmlFormWithStandardUi inside a visit
// they create, so availability (documentation/_availability.e2e.md: female, age >= 10, no delivery in the visit) is not exercised.
//
// Conditions: ifMode ENTER (encounter-with-sections.xml:12) auto-submits when provider, location and date all have a value.
// The provider defaults to the current user and the location to the session location (tags="Maternal and Child Location", present on MCH OPD),
// so a fresh ENTER saves an encounter with no obs and redirects.
// Side effects on save: none. Not covered: Next to the section form, VIEW/EDIT modes, shared provider/location/date behaviour.

test.describe("delivery", () => {
  test("opening the form in ENTER mode saves a MCH Delivery encounter with the defaults and redirects", async ({
    page,
    api,
    createEntryContext,
  }) => {
    // ifMode ENTER (encounter-with-sections.xml:12): all #who-when-where inputs have a value -> submitHtmlForm()
    const context = await createEntryContext({
      givenName: "AutoDelivery",
      familyName: "Tester",
      gender: "F",
      birthdate: birthdateYearsAgo(25),
    });
    expect(await getPatientEncounters(api, context.patient.uuid)).toHaveLength(
      0,
    );

    await EntryFormPage.open(page, "delivery.xml", context);
    await expect(page).toHaveURL(/referenceapplication\/home\.page/);

    await expect
      .poll(async () =>
        (await getPatientEncounters(api, context.patient.uuid)).map(
          (e) => e.encounterType.uuid,
        ),
      )
      .toEqual([MCH_DELIVERY_ENCOUNTER_TYPE_UUID]);
  });
});
