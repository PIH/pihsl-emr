-- SL-1460: in the NCD heart failure section (section-heart-failure.xml), the "if other rheumatic heart disease, specify"
-- text box and the "if other cardiomyopathy, specify" box both saved PIH:14754 "Other cardiomyopathy (text)".
-- On edit, HFE bound the saved obs to the cardiomyopathy box, which is hidden and cleared when Cardiomyopathy is not
-- ticked, so the next save voided the rheumatic text (void_reason 'htmlformentry') and saved nothing in its place.
-- The form now saves the rheumatic text as PIH:20167 "Other rheumatic heart disease" (datatype Text).
--
-- Which encounters: one of the four NCD encounter types that include the section, "rheumatic only", meaning:
--   - a non-voided Diagnosis (PIH:DIAGNOSIS) obs answered Rheumatic heart disease (CIEL:113227)
--   - no Diagnosis obs answered Cardiomyopathy (CIEL:5016), voided or not: if Cardiomyopathy was ever ticked, the
--     14754 text may be cardiomyopathy text
--   - no PIH:14752 obs, voided or not (the cardiomyopathy question of the retired section-ncd.xml, which also used 14754)
--   - no non-voided PIH:20167 text obs yet (saved with the fixed form, or by an earlier run)
-- What is done:
--   A. exactly one non-voided 14754 obs: copy it as PIH:20167 and void it
--   B. no non-voided 14754 obs, but 14754 obs voided by htmlformentry (the bug): restore the latest one as PIH:20167
--      (the voided obs stay as they are)
-- New obs have previous_version = the obs they copy. Encounters with two non-voided 14754 obs are left alone.

-- A code can have more than one SAME-AS concept on some servers, so match with IN on report_mapping (as SL-1458 does).
-- The new obs take the non-retired PIH:20167 concept with the lowest id.
set @rhdText = (select min(rm.concept_id) from report_mapping rm inner join concept c on c.concept_id = rm.concept_id
                 where rm.source = 'PIH' and rm.code = '20167' and c.retired = 0);
-- Use daemon for creator and voided_by user
set @daemonUser = (select user_id from users where username = 'daemon');

DROP TEMPORARY TABLE IF EXISTS temp_ncd_rhd_encounters;
CREATE TEMPORARY TABLE temp_ncd_rhd_encounters (
    `encounter_id` int(11) PRIMARY KEY,
    `current_count` int(11),
    `source_obs_id` int(11),
    `source_voided` tinyint(1));

insert into temp_ncd_rhd_encounters (encounter_id)
select e.encounter_id
  from encounter e
  inner join encounter_type et on et.encounter_type_id = e.encounter_type
 where et.uuid in ('ae06d311-1866-455b-8a64-126a9bd74171',  -- NCD Initial Consult
                   '5cbfd6a2-92d9-4ad0-b526-9d29bfe1d10c',  -- NCD Followup Consult
                   '43423212-6f70-4df8-a9f7-2aef88df1ee2',  -- NCD Initial Part 2 only
                   '6a3afa6f-8f78-44a9-80c9-3f4f3b6ad8f2')  -- NCD Followup Part 2 only
   and exists (select 1 from obs t where t.encounter_id = e.encounter_id
                  and t.concept_id in (select concept_id from report_mapping where source = 'PIH' and code = '14754'))
   and exists (select 1 from obs d where d.encounter_id = e.encounter_id and d.voided = 0
                  and d.concept_id in (select concept_id from report_mapping where source = 'PIH' and code = 'DIAGNOSIS')
                  and d.value_coded in (select concept_id from report_mapping where source = 'CIEL' and code = '113227'))
   and not exists (select 1 from obs d where d.encounter_id = e.encounter_id
                  and d.concept_id in (select concept_id from report_mapping where source = 'PIH' and code = 'DIAGNOSIS')
                  and d.value_coded in (select concept_id from report_mapping where source = 'CIEL' and code = '5016'))
   and not exists (select 1 from obs q where q.encounter_id = e.encounter_id
                  and q.concept_id in (select concept_id from report_mapping where source = 'PIH' and code = '14752'))
   and not exists (select 1 from obs r where r.encounter_id = e.encounter_id and r.voided = 0
                  and r.concept_id in (select concept_id from report_mapping where source = 'PIH' and code = '20167'));

update temp_ncd_rhd_encounters t
   set t.current_count = (select count(*) from obs o where o.encounter_id = t.encounter_id and o.voided = 0
                             and o.concept_id in (select concept_id from report_mapping where source = 'PIH' and code = '14754'));

-- A. the one current 14754 obs
update temp_ncd_rhd_encounters t
   set t.source_obs_id = (select max(o.obs_id) from obs o where o.encounter_id = t.encounter_id and o.voided = 0
                             and o.concept_id in (select concept_id from report_mapping where source = 'PIH' and code = '14754')),
       t.source_voided = 0
 where t.current_count = 1;

-- B. the latest 14754 obs voided by htmlformentry
update temp_ncd_rhd_encounters t
   set t.source_obs_id = (select max(o.obs_id) from obs o where o.encounter_id = t.encounter_id and o.voided = 1
                             and o.void_reason = 'htmlformentry'
                             and o.concept_id in (select concept_id from report_mapping where source = 'PIH' and code = '14754')),
       t.source_voided = 1
 where t.current_count = 0;

-- create the new obs
insert into obs
    (person_id, concept_id, encounter_id, order_id, obs_datetime, location_id, obs_group_id, accession_number,
     value_text, comments, previous_version, form_namespace_and_path, status, interpretation,
     creator, date_created, uuid)
select o.person_id, @rhdText, o.encounter_id, o.order_id, o.obs_datetime, o.location_id, o.obs_group_id, o.accession_number,
       o.value_text, o.comments, o.obs_id, o.form_namespace_and_path, o.status, o.interpretation,
       @daemonUser, NOW(), UUID()
  from obs o
  inner join temp_ncd_rhd_encounters t on t.source_obs_id = o.obs_id;

-- void the old current obs (case A only)
update obs o
 inner join temp_ncd_rhd_encounters t on t.source_obs_id = o.obs_id and t.source_voided = 0
   set o.voided = 1, o.date_voided = NOW(), o.voided_by = @daemonUser,
       o.void_reason = 'SL-1460: moved rheumatic heart disease specify text to PIH:20167';

DROP TEMPORARY TABLE IF EXISTS temp_ncd_rhd_encounters;
