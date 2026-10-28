import { type APIRequestContext, test as base } from '@playwright/test';
import { api } from '../fixtures';
import {
  birthdateYearsAgo,
  createPatient,
  createVisit,
  createVisitWithEncounter,
  deletePatient,
  purgeClinicalDataForPatient,
  purgeProgramEnrollments,
  type CreatePatientOptions,
  type TestEncounter,
  type TestPatient,
} from '../commands';

export interface SectionEncounterOptions {
  encounterTypeUuid: string;
  patient?: CreatePatientOptions;
}

export interface SectionEncounter {
  patient: TestPatient;
  encounter: TestEncounter;
}

export interface EntryContext {
  patient: TestPatient;
  visitUuid: string;
}

export interface CustomTestFixtures {
  // Creates a synthetic patient with a visit and an empty encounter of the given type. Everything it
  // creates is purged after the test.
  createSectionEncounter: (opts: SectionEncounterOptions) => Promise<SectionEncounter>;
  // Creates a synthetic patient with an active visit and no encounter, for the entry forms that create
  // the encounter themselves. Everything it creates is purged after the test.
  createEntryContext: (patient?: CreatePatientOptions) => Promise<EntryContext>;
}

export interface CustomWorkerFixtures {
  api: APIRequestContext;
}

export { birthdateYearsAgo };

export const test = base.extend<CustomTestFixtures, CustomWorkerFixtures>({
  api: [api, { scope: 'worker' }],

  createSectionEncounter: [
    async ({ api }, use) => {
      const created: string[] = [];

      await use(async (opts) => {
        const patient = await createPatient(api, opts.patient);
        created.push(patient.uuid);
        const encounter = await createVisitWithEncounter(api, patient.uuid, opts.encounterTypeUuid);
        return { patient, encounter };
      });

      for (const uuid of created) {
        await purgeClinicalDataForPatient(api, uuid);
        await purgeProgramEnrollments(api, uuid);
        await deletePatient(api, uuid);
      }
    },
    { scope: 'test' },
  ],

  createEntryContext: [
    async ({ api }, use) => {
      const created: string[] = [];

      await use(async (patientOpts) => {
        const patient = await createPatient(api, patientOpts);
        created.push(patient.uuid);
        const visitUuid = await createVisit(api, patient.uuid);
        return { patient, visitUuid };
      });

      for (const uuid of created) {
        await purgeClinicalDataForPatient(api, uuid);
        await purgeProgramEnrollments(api, uuid);
        await deletePatient(api, uuid);
      }
    },
    { scope: 'test' },
  ],
});

export { expect } from '@playwright/test';
