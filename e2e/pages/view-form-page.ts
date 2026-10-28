import { type APIRequestContext, type Page, expect } from '@playwright/test';

// VIEW mode of a form, rendered the way the visit page does it: the encounter and the form go to
// viewEncounterWithHtmlForm/getAsHtml.action, which returns the form's HTML with every saved value in a
// span.value and every unanswered or unselected one in a span.emptyValue. (There is no standalone VIEW page
// in htmlformentryui, so the HTML is loaded into the test page with setContent.)
export class ViewFormPage {
  constructor(readonly page: Page) {}

  static async open(page: Page, formFile: string, encounterUuid: string): Promise<ViewFormPage> {
    const url =
      `/openmrs/htmlformentryui/htmlform/viewEncounterWithHtmlForm/getAsHtml.action?encounterId=${encounterUuid}` +
      `&definitionUiResource=file:configuration/pih/htmlforms/${formFile}`;
    const res = await page.request.get(url, { headers: { Accept: 'application/json, text/plain, */*' } });
    expect(res.ok(), `view ${formFile}: ${res.status()}`).toBeTruthy();
    const body = (await res.json()) as { html?: string };
    expect(body.html, `the VIEW of ${formFile} rendered`).toBeTruthy();
    await page.setContent(`<html><body>${body.html}</body></html>`);
    return new ViewFormPage(page);
  }

  // Every saved value shown by the form.
  get values() {
    return this.page.locator('span.value');
  }

  // The text of every saved value, whitespace collapsed ("[X] yes" for a selected radio or checkbox).
  async valueTexts(): Promise<string[]> {
    return (await this.values.allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
  }
}

interface ViewObs {
  display: string;
  concept: { display: string };
  value: unknown;
}

// A date or datetime as the REST API returns it ("2025-03-10" or "2025-03-10T09:30:00.000+0000").
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T|$)/;

// The diagnosis widget (encounterDiagnosesByObs) prints diagnoses as plain text, not in a span.value, so these obs
// (the diagnosis, its order and certainty, the Visit Diagnoses construct) are not looked for. Assert the printed text itself.
const NOT_IN_A_VALUE = /^(Diagnosis|Visit Diagnoses)\b/;

// Answers nearly every form labels the same way.
const DEFAULT_LABELS: Record<string, string> = { 'Disposition categories: Discharged': 'Discharge' };

// A short expected text ("2", "No", "F") is a substring of far too much, so it must be a whole value (a selected
// radio or checkbox shows as "[X] <label>", a number may carry decimals: "3" is shown as "3.0"); a longer one only has
// to appear in some value. An empty label means "do not look for this obs", and "[X]" any selected answer.
const isShown = (shown: string[], expected: string): boolean => {
  const want = expected.toLowerCase();
  if (want === '') {
    return true;
  }
  if (want.length > 3) {
    return shown.some((t) => t.toLowerCase().includes(want));
  }
  return shown.some((t) => {
    const text = t.toLowerCase();
    const bare = text.replace(/^\[x\]\s*/, '');
    return text === want || bare === want || (want === '[x]' && text.startsWith('[x]')) || (/^-?\d+(\.\d+)?$/.test(want) && Number(bare) === Number(want));
  });
};

// The saved obs the VIEW does not show. Text and number values must appear in a span.value as they were
// saved; a coded answer must appear by its concept name, ignoring case (a form that labels the answer differently with
// answerCodes / answerLabels is listed in `labels`: obs display -> text shown). Dates, datetimes, groups and the
// diagnosis obs are not compared (their rendering is the form's choice): assert them with a targeted locator.
export const viewMismatches = async (
  api: APIRequestContext,
  view: ViewFormPage,
  encounterUuid: string,
  givenLabels: Record<string, string> = {},
): Promise<string[]> => {
  const labels = { ...DEFAULT_LABELS, ...givenLabels };
  const res = await api.get(`obs?encounter=${encounterUuid}&v=custom:(display,concept:(display),value)&limit=200`);
  expect(res.ok(), `get obs: ${res.status()}`).toBeTruthy();
  const obs = (await res.json()).results as ViewObs[];
  const shown = await view.valueTexts();
  const missing: string[] = [];
  for (const o of obs) {
    if (NOT_IN_A_VALUE.test(o.display) && labels[o.display] === undefined) {
      continue;
    }
    let expected: string | undefined;
    if (labels[o.display] !== undefined) {
      expected = labels[o.display];
    } else if (typeof o.value === 'number') {
      expected = String(o.value);
    } else if (typeof o.value === 'string' && !ISO_DATE.test(o.value)) {
      expected = o.value;
    } else if (o.value && typeof o.value === 'object' && 'display' in o.value) {
      expected = String((o.value as { display: string }).display);
    }
    if (expected !== undefined && !isShown(shown, expected)) {
      missing.push(`${o.display} (looked for "${expected}")`);
    }
  }
  return missing;
};

// Opens the VIEW of the saved encounter and checks it shows what was saved.
export const expectViewShowsSavedObs = async (
  page: Page,
  api: APIRequestContext,
  formFile: string,
  encounterUuid: string,
  labels: Record<string, string> = {},
): Promise<ViewFormPage> => {
  const view = await ViewFormPage.open(page, formFile, encounterUuid);
  expect(await view.values.count(), 'the VIEW shows at least one saved value').toBeGreaterThan(0);
  expect(await viewMismatches(api, view, encounterUuid, labels), 'saved obs missing from the VIEW').toEqual([]);
  return view;
};
