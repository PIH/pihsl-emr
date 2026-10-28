import { test, expect, birthdateYearsAgo } from '../../core';
import { ANC_INTAKE_ENCOUNTER_TYPE_UUID } from '../../core/constants';
import { getEncounterObs, getPatientEncounters } from '../../commands';
import { EntryFormPage, ViewFormPage } from '../../pages';

// ancIntake.xml: header form ("ANC First Visit (Initial)"), only the shared encounter-with-sections shell
// (documentation/_shared.e2e.md). Its content is section-anc-intake.xml, reached via Next (see that spec).
// The specs open enterHtmlFormWithStandardUi inside a visit they create, so availability (documentation/
// _availability.e2e.md: component flag, privilege, "Maternal and Child Location" session tag, female >= 10,
// no ANC intake yet in the visit) is not exercised. The harness session is at MCH OPD, which has the tag.
//
// Conditions: ifMode ENTER (encounter-with-sections.xml:12) auto-submits when provider, location and date
// all have a value. The provider defaults to the current user and the location to the session location
// (tags="Maternal and Child Location"), so a fresh ENTER saves an encounter with no obs and redirects.
// Side effects on save: none. VIEW (last test): the shell renders nothing at all: the who/when/where block, the heading and the buttons are ifMode VIEW include=false,
// and the .htmlform wrapper stays display:none because the script that shows it runs only in ENTER/EDIT. The saved data is rendered by section-anc-intake (see its spec).
// Not covered here: the "form shown" path (needs a session location without the tag), Next to section-anc-intake.

test.describe('ancIntake', () => {
  test('opening the form in ENTER mode saves an ANC intake encounter with the defaults and redirects', async ({
    page,
    api,
    createEntryContext,
  }) => {
    // ifMode ENTER (encounter-with-sections.xml:12): all #who-when-where inputs have a value -> submitHtmlForm()
    const context = await createEntryContext({
      givenName: 'AutoAnc',
      familyName: 'Tester',
      gender: 'F',
      birthdate: birthdateYearsAgo(25),
    });
    expect(await getPatientEncounters(api, context.patient.uuid)).toHaveLength(0);

    await EntryFormPage.open(page, 'ancIntake.xml', context);
    await expect(page).toHaveURL(/referenceapplication\/home\.page/);

    await expect
      .poll(async () => (await getPatientEncounters(api, context.patient.uuid)).map((e) => e.encounterType.uuid))
      .toEqual([ANC_INTAKE_ENCOUNTER_TYPE_UUID]);
  });

  test('VIEW: the shell renders no values, no fields and no buttons', async ({ page, api, createEntryContext }) => {
    const context = await createEntryContext({
      givenName: 'AutoAnc',
      familyName: 'Tester',
      gender: 'F',
      birthdate: birthdateYearsAgo(25),
    });
    await EntryFormPage.open(page, 'ancIntake.xml', context);
    await expect(page).toHaveURL(/referenceapplication\/home\.page/);
    await expect.poll(async () => (await getPatientEncounters(api, context.patient.uuid)).length).toBe(1);
    const [encounter] = await getPatientEncounters(api, context.patient.uuid);
    expect(await getEncounterObs(api, encounter.uuid)).toHaveLength(0);

    // the VIEW renders (getAsHtml answers 200 with the form's HTML) but there is nothing to show: no obs, and the provider,
    // location and date block, the heading and the buttons are all ENTER/EDIT only
    const view = await ViewFormPage.open(page, 'ancIntake.xml', encounter.uuid);
    expect(await view.valueTexts()).toEqual([]);
    await expect(page.locator('span.emptyValue')).toHaveCount(0);
    await expect(page.locator('#who-when-where, select, input, button, h2')).toHaveCount(0);
    await expect(page.locator('.htmlform')).toBeHidden();
  });
});
