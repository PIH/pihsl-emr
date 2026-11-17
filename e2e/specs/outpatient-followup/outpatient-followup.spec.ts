import { test, expect, birthdateYearsAgo } from "../../core";
import { VISIT_PAGE_URL } from '../../pages';
import { OUTPATIENT_FOLLOWUP_ENCOUNTER_TYPE_UUID } from "../../core/constants";
import { getPatientEncounters } from "../../commands";
import { EntryFormPage, VisitPage, selectDefaultProvider } from "../../pages";

// outpatient-followup.xml: header form ("Outpatient Followup"), only the shared encounter-with-sections shell (documentation/_shared.e2e.md);
// its content is in the section-* forms reached via Next. The specs open enterHtmlFormWithStandardUi inside a visit
// they create, so availability (documentation/_availability.e2e.md: no outpatient initial or followup in the visit, Consult Note Location) is not exercised.
//
// Conditions: ifMode ENTER (encounter-with-sections.xml:12) auto-submits only when provider, location and date all have a value.
// The provider defaults to the current user, but the form has no location override: the shared default widget starts empty here (2 options),
// so the form is shown: Next (#next) hidden, Save (#submit) visible, location required (encounter-provider-location-date).
// Side effects on save: none.
// Visit-page display: the visit page does NOT show this form's VIEW (the shell renders nothing anyway: the who/when/where block, the
// heading and the buttons are ifMode VIEW include=false). The "Outpatient Followup" entry of encounterTypeConfig.js (// sierraLeoneOutpatientFollowup)
// has `shortTemplate`/`longTemplate: defaultEncounterShort.page` and no templateModelUrl of its own: it lists the encounter with its
// `sections` (pihcore-chief-complaint, physical-exam, pihcore-diagnosis, pihcore-plan), each with the VIEW of its own section form (see the section-* specs).
// The VIEW test asserts that list; the form's own VIEW is therefore not tested.
// Not covered: Next to the section form(s), EDIT mode, shared provider/location/date behaviour.

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
    await expect(page).not.toHaveURL(VISIT_PAGE_URL);
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
    await selectDefaultProvider(page);
    await form.save();
    await form.expectSaved();

    await expect
      .poll(async () =>
        (await getPatientEncounters(api, context.patient.uuid)).map(
          (e) => e.encounterType.uuid,
        ),
      )
      .toEqual([OUTPATIENT_FOLLOWUP_ENCOUNTER_TYPE_UUID]);

    // the visit page does not show a VIEW of this form: it lists the encounter with its sections
    const visit = await VisitPage.open(page, context.visitUuid);
    const entry = visit.encounterOfType(OUTPATIENT_FOLLOWUP_ENCOUNTER_TYPE_UUID);
    await expect(entry).toHaveCount(1);
    await visit.expand(entry);
    for (const section of ["pihcore-chief-complaint", "physical-exam", "pihcore-diagnosis", "pihcore-plan"]) {
      await expect(visit.section(section), `section ${section} of the Outpatient Followup entry`).toBeVisible();
    }
  });
});
