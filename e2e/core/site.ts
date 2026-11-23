import type { SiteSettings } from '@pih/pihemr-e2e/src/site';
// (`@pih/pihemr-e2e/src/site`, not the package root: the config imports this file, and only that entry loads no Playwright code. See pihemr/e2e/README.md.)
import {
  KGH_EMR_ID_IDENTIFIER_SOURCE_UUID,
  KGH_EMR_ID_IDENTIFIER_TYPE_UUID,
  KGH_VISIT_LOCATION_UUID,
  MCH_OPD_LOCATION_UUID,
  OUTPATIENT_FOLLOWUP_ENCOUNTER_TYPE_UUID,
} from './constants';

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set (see .env.example)`);
  }
  return value;
};

// What makes the shared fixtures of pihemr (@pih/pihemr-e2e) Sierra Leone's. playwright.config.ts passes it as `use: { siteConfig: { getSite } }`; it is called when the
// first test of a worker needs it, so a missing setting fails that test and does not break `playwright test --list`.
export const getSite = (): SiteSettings => ({
  api: {
    baseUrl: requireEnv('E2E_BASE_URL'),
    username: requireEnv('E2E_USER_ADMIN_USERNAME'),
    password: requireEnv('E2E_USER_ADMIN_PASSWORD'),
  },
  patientIdentifier: { typeUuid: KGH_EMR_ID_IDENTIFIER_TYPE_UUID, sourceUuid: KGH_EMR_ID_IDENTIFIER_SOURCE_UUID },
  visitLocationUuid: KGH_VISIT_LOCATION_UUID,
  // "MCH OPD": the session location of the run and the location of the encounters the harness creates
  sessionLocationUuid: MCH_OPD_LOCATION_UUID,
  defaultProviderName: process.env.E2E_DEFAULT_PROVIDER_NAME,
  // What the shared specs that depend on the site's encounter types need (see SiteSpecFacts in @pih/pihemr-e2e). Not given: section-prescriptions-print, which this site
  // leaves out (specs/shared/shared.spec.ts): its plan section has its own form and print flow, tested by its own spec.
  specs: {
    'section-chief-complaint': {
      parents: [{ name: 'outpatient followup', encounterTypeUuid: OUTPATIENT_FOLLOWUP_ENCOUNTER_TYPE_UUID }],
    },
  },
});
