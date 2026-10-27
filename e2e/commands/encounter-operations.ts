import { type APIRequestContext, expect } from '@playwright/test';
import {
  CLINIC_OR_HOSPITAL_VISIT_TYPE_UUID,
  KGH_VISIT_LOCATION_UUID,
  MCH_OPD_LOCATION_UUID,
} from '../core/constants';

export interface TestEncounter {
  uuid: string;
  visitUuid: string;
}

// Starts a visit for the patient. Entry forms (the ones that create the encounter) open inside a visit.
export const createVisit = async (api: APIRequestContext, patientUuid: string): Promise<string> => {
  const res = await api.post('visit', {
    data: {
      patient: patientUuid,
      visitType: CLINIC_OR_HOSPITAL_VISIT_TYPE_UUID,
      location: KGH_VISIT_LOCATION_UUID,
      startDatetime: new Date().toISOString(),
    },
  });
  expect(res.ok(), `create visit: ${res.status()}`).toBeTruthy();
  return (await res.json()).uuid;
};

export interface PatientEncounter {
  uuid: string;
  encounterType: { uuid: string };
}

// Encounters of one test patient (never call this with a patient the test did not create).
export const getPatientEncounters = async (api: APIRequestContext, patientUuid: string): Promise<PatientEncounter[]> => {
  const res = await api.get(`encounter?patient=${patientUuid}&v=custom:(uuid,encounterType:(uuid))&limit=100`);
  expect(res.ok(), `get encounters: ${res.status()}`).toBeTruthy();
  return (await res.json()).results;
};

// Starts a visit for the patient and records an empty encounter of the given type in it. The section
// forms are edit forms for an existing encounter, so the encounter has to exist before the form opens.
export const createVisitWithEncounter = async (
  api: APIRequestContext,
  patientUuid: string,
  encounterTypeUuid: string,
): Promise<TestEncounter> => {
  const now = new Date().toISOString();

  const visitRes = await api.post('visit', {
    data: {
      patient: patientUuid,
      visitType: CLINIC_OR_HOSPITAL_VISIT_TYPE_UUID,
      location: KGH_VISIT_LOCATION_UUID,
      startDatetime: now,
    },
  });
  expect(visitRes.ok(), `create visit: ${visitRes.status()}`).toBeTruthy();
  const visit = await visitRes.json();

  const encRes = await api.post('encounter', {
    data: {
      patient: patientUuid,
      encounterType: encounterTypeUuid,
      location: MCH_OPD_LOCATION_UUID,
      encounterDatetime: now,
      visit: visit.uuid,
    },
  });
  expect(encRes.ok(), `create encounter: ${encRes.status()}`).toBeTruthy();
  const encounter = await encRes.json();

  return { uuid: encounter.uuid, visitUuid: visit.uuid };
};

export interface EncounterObs {
  display: string;
  concept: { uuid: string; display: string };
  value: unknown;
}

// Obs recorded on one encounter (the encounter belongs to a patient this test created).
export const getEncounterObs = async (api: APIRequestContext, encounterUuid: string): Promise<EncounterObs[]> => {
  const res = await api.get(`obs?encounter=${encounterUuid}&v=custom:(display,concept:(uuid,display),value)&limit=200`);
  expect(res.ok(), `get obs: ${res.status()}`).toBeTruthy();
  return (await res.json()).results;
};

// Removes everything the test created for the patient so the patient itself can be purged:
// orders, obs, then encounters, then visits (purging a patient with any of them left fails on a foreign key).
// Saving a section form twice voids the first save's obs; those still block purging the encounter, so
// the obs are listed with includeAll.
export const purgeClinicalDataForPatient = async (api: APIRequestContext, patientUuid: string): Promise<void> => {
  // Orders (e.g. a lab or drug order saved by a form) block purging their encounter. The default listing
  // returns the active ones.
  const orderRes = await api.get(`order?patient=${patientUuid}&limit=100`);
  expect(orderRes.ok()).toBeTruthy();
  for (const order of (await orderRes.json()).results) {
    expect((await api.delete(`order/${order.uuid}?purge=true`)).ok()).toBeTruthy();
  }

  const encRes = await api.get(`encounter?patient=${patientUuid}&limit=100`);
  expect(encRes.ok()).toBeTruthy();
  for (const encounter of (await encRes.json()).results) {
    const obsRes = await api.get(`obs?encounter=${encounter.uuid}&includeAll=true&limit=200`);
    expect(obsRes.ok()).toBeTruthy();
    for (const o of (await obsRes.json()).results) {
      expect((await api.delete(`obs/${o.uuid}?purge=true`)).ok()).toBeTruthy();
    }
    expect((await api.delete(`encounter/${encounter.uuid}?purge=true`)).ok()).toBeTruthy();
  }

  const visitRes = await api.get(`visit?patient=${patientUuid}&includeInactive=true&limit=100`);
  expect(visitRes.ok()).toBeTruthy();
  for (const visit of (await visitRes.json()).results) {
    expect((await api.delete(`visit/${visit.uuid}?purge=true`)).ok()).toBeTruthy();
  }
};
