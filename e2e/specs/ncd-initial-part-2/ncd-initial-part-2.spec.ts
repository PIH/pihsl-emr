import { test, expect, birthdateYearsAgo } from "../../core";
import { VISIT_PAGE_URL } from '../../pages';
import { NCD_INITIAL_2_ENCOUNTER_TYPE_UUID } from "../../core/constants";
import { getEncounterObs, getPatientEncounters } from "../../commands";
import { EntryFormPage, VisitPage, selectDefaultProvider } from "../../pages";

// ncd-initial-part-2.xml: header form ("NCD Initial (Part 2)"), only the shared encounter-with-sections shell (documentation/_shared.e2e.md);
// its content is in the section-* forms reached via Next. The specs open enterHtmlFormWithStandardUi inside a visit
// they create, so availability (documentation/_availability.e2e.md: retro privilege, no NCD encounter of the conflicting kinds in the visit, NCD Consult Location) is not exercised.
//
// Conditions: ifMode ENTER (encounter-with-sections.xml:12) auto-submits only when provider, location and date all have a value.
// The provider defaults to the current user, but the location select is tagged "NCD Consult Location" and the session location (MCH OPD) lacks it,
// so the form is shown: Next (#next) hidden, Save (#submit) visible, location required (encounter-provider-location-date).
// Side effects on save: none.
// Visit-page display: the visit page does NOT show this form's VIEW (the shell renders nothing anyway: the who/when/where block, the
// heading and the buttons are ifMode VIEW include=false). The "NCD Initial (Part 2)" entry of encounterTypeConfig.js (// For SL, NCD Initial Part 2, sierra_leone)
// has `shortTemplate`/`longTemplate: defaultEncounterShort.page` and no templateModelUrl of its own: it lists the encounter with its
// `sections`, each with the VIEW of its own section form (see the section-* specs). The VIEW test asserts that list; the form's own
// VIEW is therefore not tested.
// Not covered: Next to the section forms, EDIT mode, shared provider/location/date behaviour.

const FORM = "ncd-initial-part-2.xml";
const LOCATION_SELECT = "#w3";

test.describe("ncd-initial-part-2", () => {
  test("ENTER shows the form (no auto-submit) and Save without a location does not save", async ({
    page,
    api,
    createEntryContext,
  }) => {
    const context = await createEntryContext({
      givenName: "AutoNcdInitialPart2",
      familyName: "Tester",
      gender: "M",
      birthdate: birthdateYearsAgo(40),
    });

    const form = await EntryFormPage.open(
      page,
      FORM,
      context,
    );

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

  test("Save after picking a location creates an NCD Initial (Part 2) encounter and redirects", async ({
    page,
    api,
    createEntryContext,
  }) => {
    const context = await createEntryContext({
      givenName: "AutoNcdInitialPart2",
      familyName: "Tester",
      gender: "M",
      birthdate: birthdateYearsAgo(40),
    });

    const form = await EntryFormPage.open(
      page,
      FORM,
      context,
    );
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
      .toEqual([NCD_INITIAL_2_ENCOUNTER_TYPE_UUID]);
  });

  test("the visit page lists the saved encounter with its sections (the shell form has no VIEW of its own)", async ({
    page,
    api,
    createEntryContext,
  }) => {
    const context = await createEntryContext({
      givenName: "AutoNcdInitialPart2",
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

    const visit = await VisitPage.open(page, context.visitUuid);
    const entry = visit.encounterOfType(NCD_INITIAL_2_ENCOUNTER_TYPE_UUID);
    await expect(entry).toHaveCount(1);
    await visit.expand(entry);
    for (const section of ["pihcore-ncd-overview", "pihcore-diabetes", "pihcore-hypertension", "pihcore-heart-failure", "pihcore-lung", "pihcore-kidney", "pihcore-liver", "pihcore-palliative", "pihcore-sickle-cell", "pihcore-other-ncds", "pihcore-diagnosis", "pihcore-ncd-plan"]) {
      await expect(visit.section(section), `section ${section} of the NCD Initial (Part 2) entry`).toBeVisible();
    }
  });
});
