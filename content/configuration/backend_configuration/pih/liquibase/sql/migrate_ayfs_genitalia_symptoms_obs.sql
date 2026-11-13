-- SL-1458: on the AYFS Initial and AYFS Followup forms, "Symptoms/problems around the genitalia?" (CIEL:1126) was answered with
-- CIEL:1115 (Normal) and CIEL:1116 (Abnormal), but the radios were labelled yes,no: "yes" saved Normal and "no" saved Abnormal.
-- The forms now answer with CIEL:1065 (Yes) and CIEL:1066 (No). This migrates the saved obs to what the clinician chose:
--   Normal   (the "yes" radio) -> Yes
--   Abnormal (the "no" radio)  -> No
-- Only CIEL:1126 obs in AYFS Initial / AYFS Followup encounters are touched; CIEL:1126, 1115 and 1116 are used elsewhere.
-- Each obs is voided and replaced by a copy with the new answer and previous_version pointing to the old obs.

set @question = concept_from_mapping('CIEL', '1126');
set @normal = concept_from_mapping('CIEL', '1115');
set @abnormal = concept_from_mapping('CIEL', '1116');
set @yes = concept_from_mapping('CIEL', '1065');
set @no = concept_from_mapping('CIEL', '1066');
set @ayfsInitial = (select encounter_type_id from encounter_type where uuid = '1f3375af-fd9e-42a9-954e-99533ee15de9');
set @ayfsFollowup = (select encounter_type_id from encounter_type where uuid = '73399721-644e-494b-86c9-5dd345072db3');
-- Use daemon for creator and voided_by user
set @daemonUser = (select user_id from users where username = 'daemon');

DROP TEMPORARY TABLE IF EXISTS temp_ayfs_genitalia_obs;
CREATE TEMPORARY TABLE temp_ayfs_genitalia_obs (
    `obs_id` int(11),
    `person_id` int(11),
    `concept_id` int(11),
    `encounter_id` int(11),
    `order_id` int(11),
    `obs_datetime` datetime,
    `location_id` int(11),
    `obs_group_id` int(11),
    `accession_number` varchar(255),
    `value_coded` int(11),
    `comments` varchar(255),
    `form_namespace_and_path` varchar(255),
    `status` varchar(16) NOT NULL,
    `interpretation` varchar(32));

insert into temp_ayfs_genitalia_obs
    (obs_id, person_id, concept_id, encounter_id, order_id, obs_datetime, location_id, obs_group_id, accession_number,
     value_coded, comments, form_namespace_and_path, status, interpretation)
select o.obs_id, o.person_id, o.concept_id, o.encounter_id, o.order_id, o.obs_datetime, o.location_id, o.obs_group_id,
       o.accession_number,
       case o.value_coded when @normal then @yes when @abnormal then @no end,
       o.comments, o.form_namespace_and_path, o.status, o.interpretation
  from obs o
  inner join encounter e on e.encounter_id = o.encounter_id
 where o.concept_id = @question
   and o.value_coded in (@normal, @abnormal)
   and o.voided = 0
   and e.encounter_type in (@ayfsInitial, @ayfsFollowup);

-- create the new obs (value_coded_name_id is left null: it pointed to a name of the old answer)
insert into obs
    (person_id, concept_id, encounter_id, order_id, obs_datetime, location_id, obs_group_id, accession_number,
     value_coded, comments, previous_version, form_namespace_and_path, status, interpretation,
     creator, date_created, uuid)
select person_id, concept_id, encounter_id, order_id, obs_datetime, location_id, obs_group_id, accession_number,
       value_coded, comments, obs_id, form_namespace_and_path, status, interpretation,
       @daemonUser, NOW(), UUID()
  from temp_ayfs_genitalia_obs;

-- void the old obs
update obs o
 inner join temp_ayfs_genitalia_obs t on t.obs_id = o.obs_id
   set o.voided = 1, o.date_voided = NOW(), o.voided_by = @daemonUser,
       o.void_reason = 'SL-1458: genitalia symptoms answer migrated from Normal/Abnormal to Yes/No';

DROP TEMPORARY TABLE IF EXISTS temp_ayfs_genitalia_obs;
