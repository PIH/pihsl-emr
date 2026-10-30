import { test, expect, birthdateYearsAgo } from "../../core";
import { NCD_FOLLOWUP_ENCOUNTER_TYPE_UUID } from "../../core/constants";
import { getEncounterObs, getPatientEncounters } from "../../commands";
import { EntryFormPage, ViewFormPage, selectDefaultProvider } from "../../pages";

// ncd-followup.xml: header form ("NCD Followup"), only the shared encounter-with-sections shell (documentation/_shared.e2e.md);
// its content is in the section-* forms reached via Next. The specs open enterHtmlFormWithStandardUi inside a visit
// they create, so availability (documentation/_availability.e2e.md: retro privilege, no NCD encounter of the conflicting kinds in the visit, NCD Consult Location) is not exercised.
//
// Conditions: ifMode ENTER (encounter-with-sections.xml:12) auto-submits only when provider, location and date all have a value.
// The provider defaults to the current user, but the location select is tagged "NCD Consult Location" and the session location (MCH OPD) lacks it,
// so the form is shown: Next (#next) hidden, Save (#submit) visible, location required (encounter-provider-location-date).
// Side effects on save: none. VIEW (last test): the entry form shows nothing at all. Its only content is the shared who/when/where block,
// which is ifMode VIEW include=false (encounter-provider-location-date.xml), the buttons and the heading are too, and the wrapper stays
// display:none because the script that shows it runs only in ENTER/EDIT. The saved data is rendered by the section forms (see their specs).
// Not covered: Next to the section forms, EDIT mode, shared provider/location/date behaviour.

const FORM = "ncd-followup.xml";
const LOCATION_SELECT = "#w3";

test.describe("ncd-followup", () => {
  test("ENTER shows the form (no auto-submit) and Save without a location does not save", async ({
    page,
    api,
    createEntryContext,
  }) => {
    const context = await createEntryContext({
      givenName: "AutoNcdFollowup",
      familyName: "Tester",
      gender: "M",
      birthdate: birthdateYearsAgo(40),
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

  test("Save after picking a location creates an NCD Followup encounter and redirects", async ({
    page,
    api,
    createEntryContext,
  }) => {
    const context = await createEntryContext({
      givenName: "AutoNcdFollowup",
      familyName: "Tester",
      gender: "M",
      birthdate: birthdateYearsAgo(40),
    });

    const form = await EntryFormPage.open(page, FORM, context);
    await selectDefaultProvider(page);
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
      .toEqual([NCD_FOLLOWUP_ENCOUNTER_TYPE_UUID]);
  });

  test("VIEW: the entry form renders no values, no fields and no buttons", async ({
    page,
    api,
    createEntryContext,
  }) => {
    const context = await createEntryContext({
      givenName: "AutoNcdFollowup",
      familyName: "Tester",
      gender: "M",
      birthdate: birthdateYearsAgo(40),
    });

    const form = await EntryFormPage.open(page, FORM, context);
    await selectDefaultProvider(page);
    await page.locator(LOCATION_SELECT).selectOption({ index: 1 });
    await form.save();
    await form.expectSaved();
    const [encounter] = await getPatientEncounters(api, context.patient.uuid);
    expect(await getEncounterObs(api, encounter.uuid)).toHaveLength(0);

    // the VIEW renders (getAsHtml answers 200 with the form's HTML) but there is nothing to show: no obs, and the
    // provider, location and date block, the heading and the buttons are all ENTER/EDIT only
    const view = await ViewFormPage.open(page, FORM, encounter.uuid);
    expect(await view.valueTexts()).toEqual([]);
    await expect(page.locator("span.emptyValue")).toHaveCount(0);
    await expect(page.locator("#who-when-where, select, input, button, h2")).toHaveCount(0);
    await expect(page.locator(".htmlform")).toBeHidden();
  });
});
