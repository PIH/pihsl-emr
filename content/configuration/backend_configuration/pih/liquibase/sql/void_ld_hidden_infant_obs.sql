-- SL-1465: on the Labour and Delivery Summary (laborDeliverySummary.xml), choosing an infant outcome hides some fields
-- (SL-1263, released in 1.54.0), but values typed in them before were kept and saved:
--   MSB (macerated stillbirth, CIEL:135436): birth weight CIEL:5916, birth length CIEL:163554, head circumference CIEL:163555,
--                                            pre-delivery FHR CIEL:165377, APGAR 1/5/10 min PIH:14419, CIEL:159604, PIH:14785
--   FSB (fresh stillbirth, CIEL:159916):     APGAR 1/5/10 min
--   Alive (CIEL:151849):                     pre-delivery FHR
-- The form now empties those fields. This voids the obs saved in them: members of a non-voided Newborn details group
-- (PIH:13555) whose non-voided outcome (CIEL:159917) hides them, on Labour and Delivery Summary encounters created on or
-- after @hidingReleased (before that the fields were visible in production, so their values were entered on purpose).
-- Obs voided by an earlier run are recognised by their void_reason (see the changeset precondition).

-- When the hiding reached production: KGH and Wellbody went from 1.53.0 to 1.54.1-SNAPSHOT in mirebalais-puppet commit
-- 3f3a9d26 ("sl prod update", 2026-05-01 12:01 EDT = 16:01 UTC, Sierra Leone time). No encounter created before it can
-- have had a hidden field. (1.54.0, tagged 2026-04-27, only went to the test servers.)
set @hidingReleased = '2026-05-01 16:01:19';
-- Use daemon for voided_by
set @daemonUser = (select user_id from users where username = 'daemon');

DROP TEMPORARY TABLE IF EXISTS temp_ld_hidden_infant_obs;
CREATE TEMPORARY TABLE temp_ld_hidden_infant_obs (`obs_id` int(11) PRIMARY KEY);

-- A code can have more than one SAME-AS concept on some servers, so match with IN on report_mapping (as SL-1458 does).
insert into temp_ld_hidden_infant_obs (obs_id)
select m.obs_id
  from encounter e
  inner join encounter_type et on et.encounter_type_id = e.encounter_type
  inner join obs g on g.encounter_id = e.encounter_id and g.voided = 0
  inner join obs outcome on outcome.obs_group_id = g.obs_id and outcome.voided = 0
  inner join obs m on m.obs_group_id = g.obs_id and m.voided = 0
 where et.uuid = 'fec2cc56-e35f-42e1-8ae3-017142c1ca59'  -- Labour and Delivery Summary
   and e.voided = 0
   and e.date_created >= @hidingReleased
   and g.concept_id in (select concept_id from report_mapping where source = 'PIH' and code = '13555')
   and outcome.concept_id in (select concept_id from report_mapping where source = 'CIEL' and code = '159917')
   and (
        -- MSB: everything in #inputFieldsDiv except "Is baby registered in EMR?"
        (outcome.value_coded in (select concept_id from report_mapping where source = 'CIEL' and code = '135436')
         and m.concept_id in (select concept_id from report_mapping
                               where (source = 'CIEL' and code in ('5916', '163554', '163555', '165377', '159604'))
                                  or (source = 'PIH' and code in ('14419', '14785'))))
        -- FSB: the APGAR scores
     or (outcome.value_coded in (select concept_id from report_mapping where source = 'CIEL' and code = '159916')
         and m.concept_id in (select concept_id from report_mapping
                               where (source = 'CIEL' and code = '159604')
                                  or (source = 'PIH' and code in ('14419', '14785'))))
        -- Alive: the pre-delivery FHR
     or (outcome.value_coded in (select concept_id from report_mapping where source = 'CIEL' and code = '151849')
         and m.concept_id in (select concept_id from report_mapping where source = 'CIEL' and code = '165377'))
   );

update obs o
 inner join temp_ld_hidden_infant_obs t on t.obs_id = o.obs_id
   set o.voided = 1, o.date_voided = NOW(), o.voided_by = @daemonUser,
       o.void_reason = 'SL-1465: value of a Labour and Delivery infant field hidden by the outcome';

DROP TEMPORARY TABLE IF EXISTS temp_ld_hidden_infant_obs;
