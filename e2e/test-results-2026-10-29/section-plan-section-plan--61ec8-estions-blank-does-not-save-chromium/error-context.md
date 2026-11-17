# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: section-plan/section-plan.spec.ts >> section-plan >> saving with the required questions blank does not save
- Location: specs/section-plan/section-plan.spec.ts:44:7

# Error details

```
Error: create visit: 400

expect(received).toBeTruthy()

Received: false
```

```
Error: expect(received).toBeTruthy()

Received: false
```

# Test source

```ts
  1   | import { type APIRequestContext, expect } from '@playwright/test';
  2   | import {
  3   |   CLINIC_OR_HOSPITAL_VISIT_TYPE_UUID,
  4   |   KGH_VISIT_LOCATION_UUID,
  5   |   MCH_OPD_LOCATION_UUID,
  6   | } from '../core/constants';
  7   | 
  8   | export interface TestEncounter {
  9   |   uuid: string;
  10  |   visitUuid: string;
  11  | }
  12  | 
  13  | // Starts a visit for the patient. Entry forms (the ones that create the encounter) open inside a visit.
  14  | export const createVisit = async (api: APIRequestContext, patientUuid: string): Promise<string> => {
  15  |   const res = await api.post('visit', {
  16  |     data: {
  17  |       patient: patientUuid,
  18  |       visitType: CLINIC_OR_HOSPITAL_VISIT_TYPE_UUID,
  19  |       location: KGH_VISIT_LOCATION_UUID,
  20  |       startDatetime: new Date().toISOString(),
  21  |     },
  22  |   });
  23  |   expect(res.ok(), `create visit: ${res.status()}`).toBeTruthy();
  24  |   return (await res.json()).uuid;
  25  | };
  26  | 
  27  | export interface PatientEncounter {
  28  |   uuid: string;
  29  |   encounterType: { uuid: string };
  30  | }
  31  | 
  32  | // Encounters of one test patient (never call this with a patient the test did not create).
  33  | export const getPatientEncounters = async (api: APIRequestContext, patientUuid: string): Promise<PatientEncounter[]> => {
  34  |   const res = await api.get(`encounter?patient=${patientUuid}&v=custom:(uuid,encounterType:(uuid))&limit=100`);
  35  |   expect(res.ok(), `get encounters: ${res.status()}`).toBeTruthy();
  36  |   return (await res.json()).results;
  37  | };
  38  | 
  39  | // Starts a visit for the patient and records an empty encounter of the given type in it. The section
  40  | // forms are edit forms for an existing encounter, so the encounter has to exist before the form opens.
  41  | export const createVisitWithEncounter = async (
  42  |   api: APIRequestContext,
  43  |   patientUuid: string,
  44  |   encounterTypeUuid: string,
  45  | ): Promise<TestEncounter> => {
  46  |   const now = new Date().toISOString();
  47  | 
  48  |   const visitRes = await api.post('visit', {
  49  |     data: {
  50  |       patient: patientUuid,
  51  |       visitType: CLINIC_OR_HOSPITAL_VISIT_TYPE_UUID,
  52  |       location: KGH_VISIT_LOCATION_UUID,
  53  |       startDatetime: now,
  54  |     },
  55  |   });
  56  |   expect(visitRes.ok(), `create visit: ${visitRes.status()}`).toBeTruthy();
  57  |   const visit = await visitRes.json();
  58  | 
  59  |   const encRes = await api.post('encounter', {
  60  |     data: {
  61  |       patient: patientUuid,
  62  |       encounterType: encounterTypeUuid,
  63  |       location: MCH_OPD_LOCATION_UUID,
  64  |       encounterDatetime: now,
  65  |       visit: visit.uuid,
  66  |     },
  67  |   });
  68  |   expect(encRes.ok(), `create encounter: ${encRes.status()}`).toBeTruthy();
  69  |   const encounter = await encRes.json();
  70  | 
  71  |   return { uuid: encounter.uuid, visitUuid: visit.uuid };
  72  | };
  73  | 
  74  | export interface EncounterObs {
  75  |   display: string;
  76  |   concept: { uuid: string; display: string };
  77  |   value: unknown;
  78  | }
  79  | 
  80  | // Obs recorded on one encounter (the encounter belongs to a patient this test created).
  81  | export const getEncounterObs = async (api: APIRequestContext, encounterUuid: string): Promise<EncounterObs[]> => {
  82  |   const res = await api.get(`obs?encounter=${encounterUuid}&v=custom:(display,concept:(uuid,display),value)&limit=200`);
  83  |   expect(res.ok(), `get obs: ${res.status()}`).toBeTruthy();
  84  |   return (await res.json()).results;
  85  | };
  86  | 
  87  | // Voids what the test created for the patient: encounters (which voids their obs and orders), then visits.
  88  | // Nothing is purged, so the user does not need the Purge privileges. Saving a section form twice voids the first save's
  89  | // obs, so listing the encounters and visits is enough; there is no foreign key to work around.
  90  | export const voidClinicalDataForPatient = async (api: APIRequestContext, patientUuid: string): Promise<void> => {
  91  |   const encRes = await api.get(`encounter?patient=${patientUuid}&limit=100`);
  92  |   expect(encRes.ok()).toBeTruthy();
  93  |   for (const encounter of (await encRes.json()).results) {
  94  |     const res = await api.delete(`encounter/${encounter.uuid}`);
  95  |     expect(res.ok(), `void encounter ${encounter.uuid}: ${res.status()} ${await res.text()}`).toBeTruthy();
  96  |   }
  97  | 
  98  |   const visitRes = await api.get(`visit?patient=${patientUuid}&includeInactive=true&limit=100`);
> 99  |   expect(visitRes.ok()).toBeTruthy();
      |                         ^ Error: expect(received).toBeTruthy()
  100 |   for (const visit of (await visitRes.json()).results) {
  101 |     const res = await api.delete(`visit/${visit.uuid}`);
  102 |     expect(res.ok(), `void visit ${visit.uuid}: ${res.status()} ${await res.text()}`).toBeTruthy();
  103 |   }
  104 | };
  105 | 
```