-- set @encounterId = 'some-encounter-uuid';

set @locale = global_property_value('default_locale', 'en');

select
    person_name(e.patient_id)                                                                     as patient_name,
    age_at_enc(e.patient_id, e.encounter_id)                                                      as patient_age,
    patient_identifier(e.patient_id,
        metadata_uuid('org.openmrs.module.emrapi', 'emr.primaryIdentifierType'))                  as emr_id,
    person_address_one(e.patient_id)                                                              as address,
    person_address_city_village(e.patient_id)                                                     as city_village,
    person_address_state_province(e.patient_id)                                                   as chiefdom,
    person_address_county_district(e.patient_id)                                                  as district,
    location_name(e.location_id)                                                                  as discharge_ward,
    e.encounter_datetime                                                                          as discharge_date,
    (select o.value_datetime
     from obs o
     where o.person_id = e.patient_id
       and o.concept_id = concept_from_mapping('CIEL', '1640')
       and o.obs_datetime <= e.encounter_datetime
       and o.voided = 0
     order by o.obs_datetime desc
     limit 1)                                                                                     as admission_date,
    obs_value_text(e.encounter_id, 'CIEL', '160221')                                             as clinical_history,
    obs_value_text(e.encounter_id, 'CIEL', '165399')                                             as investigation_summary,
    obs_value_text(e.encounter_id, 'PIH', 'DISPOSITION COMMENTS')                                as discharge_recommendations,
    obs_value_datetime(e.encounter_id, 'PIH', 'RETURN VISIT DATE')                               as followup_date,
    obs_value_coded_list(e.encounter_id, 'CIEL', '1272', @locale)                                as followup_clinic,
    provider(e.encounter_id)                                                                      as provider_name,
    now()                                                                                         as print_date
from encounter e
where e.uuid = @encounterId
  and e.voided = 0;
