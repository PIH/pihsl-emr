import { type Page, expect } from '@playwright/test';
import type { SectionEncounter } from '../core';

// Where the form sends the browser after a successful save. Any page that loads without a patient will do.
const RETURN_URL = '/openmrs/referenceapplication/home.page';

// A section-*.xml form is a standalone HTML Form Entry form that edits an existing encounter. On the
// visit page it is opened from the section's edit pencil (see scripts/visit/encounterTypeConfig.js in
// pihemr); the specs open the same URL directly, so the visit-page and app-loader gating that decides
// when a section is shown is not exercised here (see documentation/_availability.e2e.md).
export class SectionFormPage {
  constructor(
    readonly page: Page,
    readonly formFile: string,
  ) {}

  static editUrl(formFile: string, { patient, encounter }: SectionEncounter): string {
    const params = new URLSearchParams({
      patientId: patient.uuid,
      visitId: encounter.visitUuid,
      encounterId: encounter.uuid,
      definitionUiResource: `file:configuration/pih/htmlforms/${formFile}`,
      returnUrl: RETURN_URL,
    });
    return `htmlformentryui/htmlform/editHtmlFormWithStandardUi.page?${params.toString()}`;
  }

  static async openEdit(page: Page, formFile: string, section: SectionEncounter): Promise<SectionFormPage> {
    await page.goto(SectionFormPage.editUrl(formFile, section));
    const form = new SectionFormPage(page, formFile);
    await expect(form.submitButton).toBeVisible();
    return form;
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
