-- set @encounterId = 'some-encounter-uuid';

set @locale = global_property_value('default_locale', 'en');

-- coded diagnoses
select
    concept_name(coded.value_coded, @locale)                                                      as diagnosis_name,
    obs_from_group_id_value_coded_list(coded.obs_group_id, 'PIH', '7537', @locale)               as dx_order,
    obs_from_group_id_value_coded_list(coded.obs_group_id, 'PIH', '1379', @locale)               as certainty
from obs coded
join encounter e on e.encounter_id = coded.encounter_id
where coded.concept_id = concept_from_mapping('PIH', '3064')
  and e.uuid = @encounterId
  and coded.voided = 0

union all

-- non-coded diagnoses (also in a group, with dx_order and certainty siblings)
select
    noncoded.value_text                                                                           as diagnosis_name,
    obs_from_group_id_value_coded_list(noncoded.obs_group_id, 'PIH', '7537', @locale)            as dx_order,
    obs_from_group_id_value_coded_list(noncoded.obs_group_id, 'PIH', '1379', @locale)            as certainty
from obs noncoded
join encounter e on e.encounter_id = noncoded.encounter_id
where noncoded.concept_id = concept_from_mapping('PIH', 'Diagnosis or problem, non-coded')
  and noncoded.obs_group_id is not null
  and e.uuid = @encounterId
  and noncoded.voided = 0;
