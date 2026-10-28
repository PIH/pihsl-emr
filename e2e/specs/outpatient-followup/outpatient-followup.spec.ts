import { test, expect, birthdateYearsAgo } from "../../core";
import { OUTPATIENT_FOLLOWUP_ENCOUNTER_TYPE_UUID } from "../../core/constants";
import { getPatientEncounters } from "../../commands";
import { EntryFormPage, ViewFormPage } from "../../pages";

// outpatient-followup.xml: header form ("Outpatient Followup"), only the shared encounter-with-sections shell (documentation/_shared.e2e.md);
// its content is in the section-* forms reached via Next. The specs open enterHtmlFormWithStandardUi inside a visit
// they create, so availability (documentation/_availability.e2e.md: no outpatient initial or followup in the visit, Consult Note Location) is not exercised.
//
// Conditions: ifMode ENTER (encounter-with-sections.xml:12) auto-submits only when provider, location and date all have a value.
// The provider defaults to the current user, but the form has no location override: the shared default widget starts empty here (2 options),
// so the form is shown: Next (#next) hidden, Save (#submit) visible, location required (encounter-provider-location-date).
// Side effects on save: none. VIEW is covered by the save test (the header has no content of its own in VIEW: ifMode VIEW include=false on the
// title, the provider/location/date block and the buttons, so the saved encounter renders blank). Not covered: Next to the section forms, EDIT mode,
// shared provider/location/date behaviour.

const FORM = "outpatient-followup.xml";
const LOCATION_SELECT = "#w3";

test.describe("outpatient-followup", () => {
  test("ENTER shows the form (no auto-submit) and Save without a location does not save", async ({
    page,
    api,
    createEntryContext,
  }) => {
    const context = await createEntryContext({
      givenName: "AutoOutpatientFollowup",
      familyName: "Tester",
      gender: "M",
      birthdate: birthdateYearsAgo(30),
    });

    const form = await EntryFormPage.open(page, FORM, context);

    // encounter-with-sections.xml:12: a blank location keeps the form shown and hides Next
    await expect(page.locator(LOCATION_SELECT)).toHaveValue("");
    await expect(form.submitButton).toBeVisible();
    await expect(page.locator("#next")).toBeHidden();

    await form.save();
    await expect(page).not.toHaveURL(/referenceapplication\/home\.page/);
    expect(await getPatientEncounters(api, context.patient.uuid)).toHaveLength(
      0,
    );
  });

  test("Save after picking a location creates an Outpatient Followup encounter and redirects", async ({
    page,
    api,
    createEntryContext,
  }) => {
    const context = await createEntryContext({
      givenName: "AutoOutpatientFollowup",
      familyName: "Tester",
      gender: "M",
      birthdate: birthdateYearsAgo(30),
    });

    const form = await EntryFormPage.open(page, FORM, context);
    // the options are real locations: pick by index, never by name
    await page.locator(LOCATION_SELECT).selectOption({ index: 1 });
    await form.save();
    await form.expectSaved();

    await expect
      .poll(async () =>
        (await getPatientEncounters(api, context.patient.uuid)).map(
          (e) => e.encounterType.uuid,
        ),
      )
      .toEqual([OUTPATIENT_FOLLOWUP_ENCOUNTER_TYPE_UUID]);

    // VIEW: nothing but the (empty) shell: no saved value, and none of the ENTER/EDIT widgets or buttons
    const [encounter] = await getPatientEncounters(api, context.patient.uuid);
    const view = await ViewFormPage.open(page, FORM, encounter.uuid);
    await expect(view.values).toHaveCount(0);
    await expect(page.locator("#who-when-where, #buttons, input, select, textarea, button")).toHaveCount(0);
    await expect(page.locator("h2")).toHaveCount(0);
  });
});
