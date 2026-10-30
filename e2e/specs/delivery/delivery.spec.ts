import { test, expect, birthdateYearsAgo } from "../../core";
import { VISIT_PAGE_URL } from '../../pages';
import { MCH_DELIVERY_ENCOUNTER_TYPE_UUID } from "../../core/constants";
import { getEncounterObs, getPatientEncounters } from "../../commands";
import { EntryFormPage, ViewFormPage, submitShellForm } from "../../pages";

// delivery.xml: header form ("MCH Delivery"), only the shared encounter-with-sections shell (documentation/_shared.e2e.md);
// its content is in the section-* forms reached via Next. The specs open enterHtmlFormWithStandardUi inside a visit
// they create, so availability (documentation/_availability.e2e.md: female, age >= 10, no delivery in the visit) is not exercised.
//
// Conditions: ifMode ENTER (encounter-with-sections.xml:12) auto-submits when provider, location and date all have a value.
// The provider defaults to the current user and the location to the session location (tags="Maternal and Child Location", present on MCH OPD),
// so a fresh ENTER saves an encounter with no obs and redirects.
// Side effects on save: none. VIEW (last test): the shell renders nothing at all: the who/when/where block, the heading and the buttons are ifMode VIEW include=false,
// and the .htmlform wrapper stays display:none because the script that shows it runs only in ENTER/EDIT. The saved data is rendered by section-delivery (see its spec).
// Not covered: Next to the section form, EDIT mode, shared provider/location/date behaviour.

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
    await submitShellForm(page);
    await expect(page).toHaveURL(VISIT_PAGE_URL);

    await expect
      .poll(async () =>
        (await getPatientEncounters(api, context.patient.uuid)).map(
          (e) => e.encounterType.uuid,
        ),
      )
      .toEqual([MCH_DELIVERY_ENCOUNTER_TYPE_UUID]);
  });

  test("VIEW: the shell renders no values, no fields and no buttons", async ({ page, api, createEntryContext }) => {
    const context = await createEntryContext({
      givenName: "AutoDelivery",
      familyName: "Tester",
      gender: "F",
      birthdate: birthdateYearsAgo(25),
    });
    await EntryFormPage.open(page, "delivery.xml", context);
    await submitShellForm(page);
    await expect(page).toHaveURL(VISIT_PAGE_URL);
    await expect.poll(async () => (await getPatientEncounters(api, context.patient.uuid)).length).toBe(1);
    const [encounter] = await getPatientEncounters(api, context.patient.uuid);
    expect(await getEncounterObs(api, encounter.uuid)).toHaveLength(0);

    // the VIEW renders (getAsHtml answers 200 with the form's HTML) but there is nothing to show: no obs, and the provider,
    // location and date block, the heading and the buttons are all ENTER/EDIT only
    const view = await ViewFormPage.open(page, "delivery.xml", encounter.uuid);
    expect(await view.valueTexts()).toEqual([]);
    await expect(page.locator("span.emptyValue")).toHaveCount(0);
    await expect(page.locator("#who-when-where, select, input, button, h2")).toHaveCount(0);
    await expect(page.locator(".htmlform")).toBeHidden();
  });
});
