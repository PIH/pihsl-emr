-- SL-1459: in the NCD heart failure section (section-heart-failure.xml), the "Rheumatic heart disease" radios
-- "Unspecified rheumatic heart disease" and "Other rheumatic heart disease" were paired with the concepts in swapped order
-- from when the answers were added (June 2024, SL-655) until this fix:
--   the "Other" radio saved       PIH:20168 Unknown rheumatic heart disease
--   the "Unspecified" radio saved PIH:20167 Other rheumatic heart disease
-- The form is fixed. This swaps the saved diagnoses back to what the clinician chose: 20168 -> 20167 and 20167 -> 20168.
--
-- Which obs: a non-voided Diagnosis (PIH:DIAGNOSIS) obs answered 20167 or 20168, inside a non-voided Visit Diagnoses
-- (PIH:Visit Diagnoses) group, on one of the four NCD encounter types that include the section.
-- The same concepts can also be chosen as a diagnosis with the encounter diagnosis widget, and those obs are correct.
-- The widget always saves a Diagnosis certainty (CIEL:159394) in the group; the section never does (its postSubmissionAction
-- CleanDiagnosisConstructAction only adds a Diagnosis order). So groups with a non-voided certainty obs are left alone.
-- Each obs is voided and replaced by a copy with the swapped answer and previous_version pointing to the old obs.

-- A code can have more than one SAME-AS concept on some servers, so match with IN on report_mapping (as SL-1458 does),
-- never with concept_from_mapping(). The new answers take the non-retired concept with the lowest id.
set @otherRhd = (select min(rm.concept_id) from report_mapping rm inner join concept c on c.concept_id = rm.concept_id
                  where rm.source = 'PIH' and rm.code = '20167' and c.retired = 0);
set @unknownRhd = (select min(rm.concept_id) from report_mapping rm inner join concept c on c.concept_id = rm.concept_id
                    where rm.source = 'PIH' and rm.code = '20168' and c.retired = 0);
-- Use daemon for creator and voided_by user
set @daemonUser = (select user_id from users where username = 'daemon');

DROP TEMPORARY TABLE IF EXISTS temp_ncd_rheumatic_obs;
CREATE TEMPORARY TABLE temp_ncd_rheumatic_obs (
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

insert into temp_ncd_rheumatic_obs
    (obs_id, person_id, concept_id, encounter_id, order_id, obs_datetime, location_id, obs_group_id, accession_number,
     value_coded, comments, form_namespace_and_path, status, interpretation)
select o.obs_id, o.person_id, o.concept_id, o.encounter_id, o.order_id, o.obs_datetime, o.location_id, o.obs_group_id,
       o.accession_number,
       case when o.value_coded in (select concept_id from report_mapping where source = 'PIH' and code = '20168') then @otherRhd
            when o.value_coded in (select concept_id from report_mapping where source = 'PIH' and code = '20167') then @unknownRhd
       end,
       o.comments, o.form_namespace_and_path, o.status, o.interpretation
  from obs o
  inner join obs g on g.obs_id = o.obs_group_id
  inner join encounter e on e.encounter_id = o.encounter_id
  inner join encounter_type et on et.encounter_type_id = e.encounter_type
 where o.concept_id in (select concept_id from report_mapping where source = 'PIH' and code = 'DIAGNOSIS')
   and o.value_coded in (select concept_id from report_mapping where source = 'PIH' and code in ('20167', '20168'))
   and o.voided = 0
   and g.voided = 0
   and g.concept_id in (select concept_id from report_mapping where source = 'PIH' and code = 'Visit Diagnoses')
   and not exists (select 1 from obs c
                    where c.obs_group_id = g.obs_id and c.voided = 0
                      and c.concept_id in (select concept_id from report_mapping where source = 'CIEL' and code = '159394'))
   and et.uuid in ('ae06d311-1866-455b-8a64-126a9bd74171',  -- NCD Initial Consult
                   '5cbfd6a2-92d9-4ad0-b526-9d29bfe1d10c',  -- NCD Followup Consult
                   '43423212-6f70-4df8-a9f7-2aef88df1ee2',  -- NCD Initial Part 2 only
                   '6a3afa6f-8f78-44a9-80c9-3f4f3b6ad8f2'); -- NCD Followup Part 2 only

-- create the new obs (value_coded_name_id is left null: it pointed to a name of the old answer)
insert into obs
    (person_id, concept_id, encounter_id, order_id, obs_datetime, location_id, obs_group_id, accession_number,
     value_coded, comments, previous_version, form_namespace_and_path, status, interpretation,
     creator, date_created, uuid)
select person_id, concept_id, encounter_id, order_id, obs_datetime, location_id, obs_group_id, accession_number,
       value_coded, comments, obs_id, form_namespace_and_path, status, interpretation,
       @daemonUser, NOW(), UUID()
  from temp_ncd_rheumatic_obs;

-- void the old obs
update obs o
 inner join temp_ncd_rheumatic_obs t on t.obs_id = o.obs_id
   set o.voided = 1, o.date_voided = NOW(), o.voided_by = @daemonUser,
       o.void_reason = 'SL-1459: swapped Other/Unknown rheumatic heart disease diagnosis';

DROP TEMPORARY TABLE IF EXISTS temp_ncd_rheumatic_obs;
