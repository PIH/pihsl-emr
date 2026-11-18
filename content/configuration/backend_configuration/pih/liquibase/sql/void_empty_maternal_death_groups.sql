-- SL-1463: before the fix, every Maternal Death review saved the primary and secondary underlying-cause obs groups
-- (PIH:21678) and the three action-point obs groups (PIH:21673) even when nothing was entered in them, because their hidden
-- marker obs had a defaultValue: CIEL:159946 ("primary"/"secondary") in a cause group, CIEL:165416 (row number) in an
-- action-point group. The form no longer does this (SL-1463 / SL-1480).
-- This voids the junk groups that were already saved: a group is junk when its only non-voided child is that hidden marker.
-- Groups that hold any other non-voided obs (a cause, or an action, person or date) are left alone.
-- Only Maternal Death encounters (encounter type 415b342e-9e4d-4496-bac4-7b6ffb8619f0) are touched.
-- The group is voided together with its marker obs, so no voided group keeps a non-voided child.

-- A CIEL/PIH code can have more than one SAME-AS concept on some servers, so match with IN on report_mapping
-- (as SL-1458 does), never with concept_from_mapping().
set @maternalDeath = (select encounter_type_id from encounter_type where uuid = '415b342e-9e4d-4496-bac4-7b6ffb8619f0');
-- Use daemon for voided_by user
set @daemonUser = (select user_id from users where username = 'daemon');
set @voidReason = 'SL-1463: void empty Maternal Death obs group';

DROP TEMPORARY TABLE IF EXISTS temp_empty_maternal_death_groups;
CREATE TEMPORARY TABLE temp_empty_maternal_death_groups (
    `group_id` int(11) NOT NULL,
    PRIMARY KEY (`group_id`));

-- cause groups (PIH:21678) holding only the CIEL:159946 marker, and action-point groups (PIH:21673) holding only the CIEL:165416 marker
insert into temp_empty_maternal_death_groups (group_id)
select g.obs_id
  from obs g
  inner join encounter e on e.encounter_id = g.encounter_id
 where e.encounter_type = @maternalDeath
   and g.voided = 0
   and (
        (g.concept_id in (select concept_id from report_mapping where source = 'PIH' and code = '21678')
         and exists (select 1 from obs c
                      where c.obs_group_id = g.obs_id and c.voided = 0
                        and c.concept_id in (select concept_id from report_mapping where source = 'CIEL' and code = '159946'))
         and not exists (select 1 from obs c
                          where c.obs_group_id = g.obs_id and c.voided = 0
                            and c.concept_id not in (select concept_id from report_mapping where source = 'CIEL' and code = '159946')))
     or (g.concept_id in (select concept_id from report_mapping where source = 'PIH' and code = '21673')
         and exists (select 1 from obs c
                      where c.obs_group_id = g.obs_id and c.voided = 0
                        and c.concept_id in (select concept_id from report_mapping where source = 'CIEL' and code = '165416'))
         and not exists (select 1 from obs c
                          where c.obs_group_id = g.obs_id and c.voided = 0
                            and c.concept_id not in (select concept_id from report_mapping where source = 'CIEL' and code = '165416')))
   );

-- void the marker obs first, then the groups
update obs c
  inner join temp_empty_maternal_death_groups t on t.group_id = c.obs_group_id
   set c.voided = 1, c.voided_by = @daemonUser, c.date_voided = now(), c.void_reason = @voidReason
 where c.voided = 0;

update obs g
  inner join temp_empty_maternal_death_groups t on t.group_id = g.obs_id
   set g.voided = 1, g.voided_by = @daemonUser, g.date_voided = now(), g.void_reason = @voidReason
 where g.voided = 0;

DROP TEMPORARY TABLE IF EXISTS temp_empty_maternal_death_groups;
