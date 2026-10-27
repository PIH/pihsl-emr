import { type Page, expect } from '@playwright/test';
import type { EntryContext } from '../core';

// Where the form sends the browser after a successful save. Any page that loads without a patient will do.
const RETURN_URL = '/openmrs/referenceapplication/home.page';

// A top-level form (ancIntake.xml, vitals.xml, ...) creates the encounter itself. On the visit page it
// is opened from a visit action (see documentation/_availability.e2e.md); the specs open the same
// enterHtmlFormWithStandardUi URL directly inside a visit they created, so the app-loader gating
// (component flag, privilege, location tag, patient/visit requirements) is not exercised.
export class EntryFormPage {
  constructor(
    readonly page: Page,
    readonly formFile: string,
  ) {}

  static enterUrl(formFile: string, { patient, visitUuid }: EntryContext): string {
    const params = new URLSearchParams({
      patientId: patient.uuid,
      visitId: visitUuid,
      definitionUiResource: `file:configuration/pih/htmlforms/${formFile}`,
      returnUrl: RETURN_URL,
    });
    return `htmlformentryui/htmlform/enterHtmlFormWithStandardUi.page?${params.toString()}`;
  }

  static async open(page: Page, formFile: string, context: EntryContext): Promise<EntryFormPage> {
    await page.goto(EntryFormPage.enterUrl(formFile, context));
    return new EntryFormPage(page, formFile);
  }

  get submitButton() {
    return this.page.locator('#submit');
  }

  async save() {
    await this.submitButton.click();
  }

  async expectSaved() {
    await expect(this.page).toHaveURL(/referenceapplication\/home\.page/);
  }
}
