// Metadata uuids for the Sierra Leone (KGH) configuration. Encounter types and visit type come from
// openmrs-module-pihcore's PihEmrConfigConstants; locations and the identifier type are the KGH
// metadata packages. Verify against the target server's REST metadata endpoints if a spec cannot create
// its fixtures.

export const KGH_EMR_ID_IDENTIFIER_TYPE_UUID = 'c09a1d24-7162-11eb-8aa6-0242ac110002';

// "KGH": has the Visit Location tag, so visits are created here.
export const KGH_VISIT_LOCATION_UUID = '074b2ab0-716a-11eb-8aa6-0242ac110002';
// "MCH OPD": a Login Location with the Maternal and Child Location tag; used as session and encounter location.
export const MCH_OPD_LOCATION_UUID = '5981f962-6eec-453d-89ce-2f9ac48d096f';

export const CLINIC_OR_HOSPITAL_VISIT_TYPE_UUID = 'f01c54cb-2225-471a-9cd5-d348552c337c';

export const ANC_INTAKE_ENCOUNTER_TYPE_UUID = '00e5e810-90ec-11e8-9eb6-529269fb1459';
export const MCH_DELIVERY_ENCOUNTER_TYPE_UUID = '00e5ebb2-90ec-11e8-9eb6-529269fb1459';
export const NCD_INITIAL_ENCOUNTER_TYPE_UUID = 'ae06d311-1866-455b-8a64-126a9bd74171';
export const NCD_FOLLOWUP_ENCOUNTER_TYPE_UUID = '5cbfd6a2-92d9-4ad0-b526-9d29bfe1d10c';
// formEncounterType of outpatient-initial.xml
export const OUTPATIENT_INITIAL_ENCOUNTER_TYPE_UUID = '7d5853d4-67b7-4742-8492-fcf860690ed5';
export const ANC_FOLLOWUP_ENCOUNTER_TYPE_UUID = '00e5e946-90ec-11e8-9eb6-529269fb1459';
export const POSTNATAL_FOLLOWUP_ENCOUNTER_TYPE_UUID = 'b7a7c300-f7e5-4d38-a388-fc178ab02e78';
export const OUTPATIENT_FOLLOWUP_ENCOUNTER_TYPE_UUID = 'd8a038b5-90d2-43dc-b94b-8338b76674f3';
// NCD parts: initial part 1/2 and followup part 1/2 (PihEmrConfigConstants)
export const NCD_INITIAL_1_ENCOUNTER_TYPE_UUID = '48c413c4-e7f6-491a-8431-900451fe8a32';
export const NCD_INITIAL_2_ENCOUNTER_TYPE_UUID = '43423212-6f70-4df8-a9f7-2aef88df1ee2';
export const NCD_FOLLOWUP_1_ENCOUNTER_TYPE_UUID = 'e02a8c32-4f14-4ff7-a4e9-2f087d9a1cf7';
export const NCD_FOLLOWUP_2_ENCOUNTER_TYPE_UUID = '6a3afa6f-8f78-44a9-80c9-3f4f3b6ad8f2';
