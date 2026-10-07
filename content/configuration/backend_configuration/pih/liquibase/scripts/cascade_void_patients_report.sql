-- ============================================================
-- Cascade void report
-- ============================================================
-- Counts, per table, of non-voided rows that have a voided parent, along
-- the foreign keys followed by ../sql/cascade_void_patients_update.sql.
-- Created for SL-1397.
--
-- Reference script, not run by liquibase.  Read-only, and only outputs
-- counts per table.  It can be run at any time to check whether data has
-- gotten out of sync, and whether the cascade void script should be re-run.
-- To test the cascade void script on a backup or test
-- server, run this report, then ../sql/cascade_void_patients_update.sql,
-- then this report again.  For the time taken by each statement, run the
-- cascade void script with a client that reports it, eg. mysql -vvv.
--
-- 1. Followed paths: for each foreign key that the cascade void script
--    follows, the number of non-voided rows whose parent is voided.
--    Before a run, this shows the inconsistencies that are visible now.
--    A run also cascades from the rows it voids itself, so it can void more
--    rows than this shows.  After a run, every row should be 0.
--
-- 2. Not followed, for information:
--    - patient mismatch: rows not voided because they belong to a different
--      patient than their voided parent (eg. after a faulty merge)
--    - voided patients whose person is kept active as a user or provider
--    - foreign keys the cascade void script deliberately does not follow
--
-- 3. Rows changed by each run of the cascade void script, per table,
--    identified by the [Cascade void: yyyy-mm-dd.hh:mm] tag in void_reason.
-- ============================================================

-- 1. Followed paths: non-voided rows with a voided parent (should be 0 after a run)
SELECT 'followed' AS section, table_name, via, num_rows FROM (
SELECT 0 AS seq, 'person' AS table_name, 'person_id -> patient (not a user or provider)' AS via, COUNT(*) AS num_rows
FROM   person c INNER JOIN patient p ON c.person_id = p.patient_id
WHERE  p.voided = 1 AND c.voided = 0
  AND  NOT EXISTS (SELECT 1 FROM users u WHERE u.person_id = c.person_id)
  AND  NOT EXISTS (SELECT 1 FROM provider pr WHERE pr.person_id = c.person_id)
UNION ALL
SELECT 1 AS seq, 'patient' AS table_name, 'patient_id -> person' AS via, COUNT(*) AS num_rows
FROM   patient c INNER JOIN person p ON c.patient_id = p.person_id
WHERE  p.voided = 1 AND c.voided = 0
UNION ALL
SELECT 2 AS seq, 'person_name' AS table_name, 'person_id -> person' AS via, COUNT(*) AS num_rows
FROM   person_name c INNER JOIN person p ON c.person_id = p.person_id
WHERE  p.voided = 1 AND c.voided = 0
UNION ALL
SELECT 3 AS seq, 'person_address' AS table_name, 'person_id -> person' AS via, COUNT(*) AS num_rows
FROM   person_address c INNER JOIN person p ON c.person_id = p.person_id
WHERE  p.voided = 1 AND c.voided = 0
UNION ALL
SELECT 4 AS seq, 'person_attribute' AS table_name, 'person_id -> person' AS via, COUNT(*) AS num_rows
FROM   person_attribute c INNER JOIN person p ON c.person_id = p.person_id
WHERE  p.voided = 1 AND c.voided = 0
UNION ALL
SELECT 5 AS seq, 'relationship' AS table_name, 'person_a -> person' AS via, COUNT(*) AS num_rows
FROM   relationship c INNER JOIN person p ON c.person_a = p.person_id
WHERE  p.voided = 1 AND c.voided = 0
UNION ALL
SELECT 6 AS seq, 'relationship' AS table_name, 'person_b -> person' AS via, COUNT(*) AS num_rows
FROM   relationship c INNER JOIN person p ON c.person_b = p.person_id
WHERE  p.voided = 1 AND c.voided = 0
UNION ALL
SELECT 7 AS seq, 'obs' AS table_name, 'person_id -> person' AS via, COUNT(*) AS num_rows
FROM   obs c INNER JOIN person p ON c.person_id = p.person_id
WHERE  p.voided = 1 AND c.voided = 0
UNION ALL
SELECT 8 AS seq, 'obs' AS table_name, 'person_id -> patient' AS via, COUNT(*) AS num_rows
FROM   obs c INNER JOIN patient p ON c.person_id = p.patient_id
WHERE  p.voided = 1 AND c.voided = 0
UNION ALL
SELECT 9 AS seq, 'patient_identifier' AS table_name, 'patient_id -> patient' AS via, COUNT(*) AS num_rows
FROM   patient_identifier c INNER JOIN patient p ON c.patient_id = p.patient_id
WHERE  p.voided = 1 AND c.voided = 0
UNION ALL
SELECT 10 AS seq, 'visit' AS table_name, 'patient_id -> patient' AS via, COUNT(*) AS num_rows
FROM   visit c INNER JOIN patient p ON c.patient_id = p.patient_id
WHERE  p.voided = 1 AND c.voided = 0
UNION ALL
SELECT 11 AS seq, 'encounter' AS table_name, 'patient_id -> patient' AS via, COUNT(*) AS num_rows
FROM   encounter c INNER JOIN patient p ON c.patient_id = p.patient_id
WHERE  p.voided = 1 AND c.voided = 0
UNION ALL
SELECT 12 AS seq, 'orders' AS table_name, 'patient_id -> patient' AS via, COUNT(*) AS num_rows
FROM   orders c INNER JOIN patient p ON c.patient_id = p.patient_id
WHERE  p.voided = 1 AND c.voided = 0
UNION ALL
SELECT 13 AS seq, 'order_group' AS table_name, 'patient_id -> patient' AS via, COUNT(*) AS num_rows
FROM   order_group c INNER JOIN patient p ON c.patient_id = p.patient_id
WHERE  p.voided = 1 AND c.voided = 0
UNION ALL
SELECT 14 AS seq, 'encounter_diagnosis' AS table_name, 'patient_id -> patient' AS via, COUNT(*) AS num_rows
FROM   encounter_diagnosis c INNER JOIN patient p ON c.patient_id = p.patient_id
WHERE  p.voided = 1 AND c.voided = 0
UNION ALL
SELECT 15 AS seq, 'conditions' AS table_name, 'patient_id -> patient' AS via, COUNT(*) AS num_rows
FROM   conditions c INNER JOIN patient p ON c.patient_id = p.patient_id
WHERE  p.voided = 1 AND c.voided = 0
UNION ALL
SELECT 16 AS seq, 'allergy' AS table_name, 'patient_id -> patient' AS via, COUNT(*) AS num_rows
FROM   allergy c INNER JOIN patient p ON c.patient_id = p.patient_id
WHERE  p.voided = 1 AND c.voided = 0
UNION ALL
SELECT 17 AS seq, 'patient_program' AS table_name, 'patient_id -> patient' AS via, COUNT(*) AS num_rows
FROM   patient_program c INNER JOIN patient p ON c.patient_id = p.patient_id
WHERE  p.voided = 1 AND c.voided = 0
UNION ALL
SELECT 18 AS seq, 'cohort_member' AS table_name, 'patient_id -> patient' AS via, COUNT(*) AS num_rows
FROM   cohort_member c INNER JOIN patient p ON c.patient_id = p.patient_id
WHERE  p.voided = 1 AND c.voided = 0
UNION ALL
SELECT 19 AS seq, 'medication_dispense' AS table_name, 'patient_id -> patient' AS via, COUNT(*) AS num_rows
FROM   medication_dispense c INNER JOIN patient p ON c.patient_id = p.patient_id
WHERE  p.voided = 1 AND c.voided = 0
UNION ALL
SELECT 20 AS seq, 'emrapi_procedure' AS table_name, 'patient_id -> patient' AS via, COUNT(*) AS num_rows
FROM   emrapi_procedure c INNER JOIN patient p ON c.patient_id = p.patient_id
WHERE  p.voided = 1 AND c.voided = 0
UNION ALL
SELECT 21 AS seq, 'bed_patient_assignment_map' AS table_name, 'patient_id -> patient' AS via, COUNT(*) AS num_rows
FROM   bed_patient_assignment_map c INNER JOIN patient p ON c.patient_id = p.patient_id
WHERE  p.voided = 1 AND c.voided = 0
UNION ALL
SELECT 22 AS seq, 'fhir_diagnostic_report' AS table_name, 'subject_id -> patient' AS via, COUNT(*) AS num_rows
FROM   fhir_diagnostic_report c INNER JOIN patient p ON c.subject_id = p.patient_id
WHERE  p.voided = 1 AND c.voided = 0
UNION ALL
SELECT 23 AS seq, 'queue_entry' AS table_name, 'patient_id -> patient' AS via, COUNT(*) AS num_rows
FROM   queue_entry c INNER JOIN patient p ON c.patient_id = p.patient_id
WHERE  p.voided = 1 AND c.voided = 0
UNION ALL
SELECT 24 AS seq, 'patient_appointment' AS table_name, 'patient_id -> patient' AS via, COUNT(*) AS num_rows
FROM   patient_appointment c INNER JOIN patient p ON c.patient_id = p.patient_id
WHERE  p.voided = 1 AND c.voided = 0
UNION ALL
SELECT 25 AS seq, 'appointmentscheduling_appointment' AS table_name, 'patient_id -> patient' AS via, COUNT(*) AS num_rows
FROM   appointmentscheduling_appointment c INNER JOIN patient p ON c.patient_id = p.patient_id
WHERE  p.voided = 1 AND c.voided = 0
UNION ALL
SELECT 26 AS seq, 'appointmentscheduling_appointment_request' AS table_name, 'patient_id -> patient' AS via, COUNT(*) AS num_rows
FROM   appointmentscheduling_appointment_request c INNER JOIN patient p ON c.patient_id = p.patient_id
WHERE  p.voided = 1 AND c.voided = 0
UNION ALL
SELECT 27 AS seq, 'patient_state' AS table_name, 'patient_program_id -> patient_program' AS via, COUNT(*) AS num_rows
FROM   patient_state c INNER JOIN patient_program p ON c.patient_program_id = p.patient_program_id
WHERE  p.voided = 1 AND c.voided = 0
UNION ALL
SELECT 28 AS seq, 'patient_program_attribute' AS table_name, 'patient_program_id -> patient_program' AS via, COUNT(*) AS num_rows
FROM   patient_program_attribute c INNER JOIN patient_program p ON c.patient_program_id = p.patient_program_id
WHERE  p.voided = 1 AND c.voided = 0
UNION ALL
SELECT 29 AS seq, 'patient_appointment_provider' AS table_name, 'patient_appointment_id -> patient_appointment' AS via, COUNT(*) AS num_rows
FROM   patient_appointment_provider c INNER JOIN patient_appointment p ON c.patient_appointment_id = p.patient_appointment_id
WHERE  p.voided = 1 AND c.voided = 0
UNION ALL
SELECT 30 AS seq, 'patient_appointment_reason' AS table_name, 'patient_appointment_id -> patient_appointment' AS via, COUNT(*) AS num_rows
FROM   patient_appointment_reason c INNER JOIN patient_appointment p ON c.patient_appointment_id = p.patient_appointment_id
WHERE  p.voided = 1 AND c.voided = 0
UNION ALL
SELECT 31 AS seq, 'patient_appointment_audit' AS table_name, 'appointment_id -> patient_appointment' AS via, COUNT(*) AS num_rows
FROM   patient_appointment_audit c INNER JOIN patient_appointment p ON c.appointment_id = p.patient_appointment_id
WHERE  p.voided = 1 AND c.voided = 0
UNION ALL
SELECT 32 AS seq, 'visit_attribute' AS table_name, 'visit_id -> visit' AS via, COUNT(*) AS num_rows
FROM   visit_attribute c INNER JOIN visit p ON c.visit_id = p.visit_id
WHERE  p.voided = 1 AND c.voided = 0
UNION ALL
SELECT 33 AS seq, 'encounter' AS table_name, 'visit_id -> visit' AS via, COUNT(*) AS num_rows
FROM   encounter c INNER JOIN visit p ON c.visit_id = p.visit_id
WHERE  p.voided = 1 AND c.voided = 0 AND c.patient_id = p.patient_id
UNION ALL
SELECT 34 AS seq, 'queue_entry' AS table_name, 'visit_id -> visit' AS via, COUNT(*) AS num_rows
FROM   queue_entry c INNER JOIN visit p ON c.visit_id = p.visit_id
WHERE  p.voided = 1 AND c.voided = 0 AND c.patient_id = p.patient_id
UNION ALL
SELECT 35 AS seq, 'encounter_provider' AS table_name, 'encounter_id -> encounter' AS via, COUNT(*) AS num_rows
FROM   encounter_provider c INNER JOIN encounter p ON c.encounter_id = p.encounter_id
WHERE  p.voided = 1 AND c.voided = 0
UNION ALL
SELECT 36 AS seq, 'obs' AS table_name, 'encounter_id -> encounter' AS via, COUNT(*) AS num_rows
FROM   obs c INNER JOIN encounter p ON c.encounter_id = p.encounter_id
WHERE  p.voided = 1 AND c.voided = 0 AND c.person_id = p.patient_id
UNION ALL
SELECT 37 AS seq, 'orders' AS table_name, 'encounter_id -> encounter' AS via, COUNT(*) AS num_rows
FROM   orders c INNER JOIN encounter p ON c.encounter_id = p.encounter_id
WHERE  p.voided = 1 AND c.voided = 0 AND c.patient_id = p.patient_id
UNION ALL
SELECT 38 AS seq, 'encounter_diagnosis' AS table_name, 'encounter_id -> encounter' AS via, COUNT(*) AS num_rows
FROM   encounter_diagnosis c INNER JOIN encounter p ON c.encounter_id = p.encounter_id
WHERE  p.voided = 1 AND c.voided = 0 AND c.patient_id = p.patient_id
UNION ALL
SELECT 39 AS seq, 'conditions' AS table_name, 'encounter_id -> encounter' AS via, COUNT(*) AS num_rows
FROM   conditions c INNER JOIN encounter p ON c.encounter_id = p.encounter_id
WHERE  p.voided = 1 AND c.voided = 0 AND c.patient_id = p.patient_id
UNION ALL
SELECT 40 AS seq, 'allergy' AS table_name, 'encounter_id -> encounter' AS via, COUNT(*) AS num_rows
FROM   allergy c INNER JOIN encounter p ON c.encounter_id = p.encounter_id
WHERE  p.voided = 1 AND c.voided = 0 AND c.patient_id = p.patient_id
UNION ALL
SELECT 41 AS seq, 'order_group' AS table_name, 'encounter_id -> encounter' AS via, COUNT(*) AS num_rows
FROM   order_group c INNER JOIN encounter p ON c.encounter_id = p.encounter_id
WHERE  p.voided = 1 AND c.voided = 0 AND c.patient_id = p.patient_id
UNION ALL
SELECT 42 AS seq, 'medication_dispense' AS table_name, 'encounter_id -> encounter' AS via, COUNT(*) AS num_rows
FROM   medication_dispense c INNER JOIN encounter p ON c.encounter_id = p.encounter_id
WHERE  p.voided = 1 AND c.voided = 0 AND c.patient_id = p.patient_id
UNION ALL
SELECT 43 AS seq, 'emrapi_procedure' AS table_name, 'encounter_id -> encounter' AS via, COUNT(*) AS num_rows
FROM   emrapi_procedure c INNER JOIN encounter p ON c.encounter_id = p.encounter_id
WHERE  p.voided = 1 AND c.voided = 0 AND c.patient_id = p.patient_id
UNION ALL
SELECT 44 AS seq, 'bed_patient_assignment_map' AS table_name, 'encounter_id -> encounter' AS via, COUNT(*) AS num_rows
FROM   bed_patient_assignment_map c INNER JOIN encounter p ON c.encounter_id = p.encounter_id
WHERE  p.voided = 1 AND c.voided = 0 AND c.patient_id = p.patient_id
UNION ALL
SELECT 45 AS seq, 'fhir_diagnostic_report' AS table_name, 'encounter_id -> encounter' AS via, COUNT(*) AS num_rows
FROM   fhir_diagnostic_report c INNER JOIN encounter p ON c.encounter_id = p.encounter_id
WHERE  p.voided = 1 AND c.voided = 0 AND c.subject_id = p.patient_id
UNION ALL
SELECT 46 AS seq, 'diagnosis_attribute' AS table_name, 'diagnosis_id -> encounter_diagnosis' AS via, COUNT(*) AS num_rows
FROM   diagnosis_attribute c INNER JOIN encounter_diagnosis p ON c.diagnosis_id = p.diagnosis_id
WHERE  p.voided = 1 AND c.voided = 0
UNION ALL
SELECT 47 AS seq, 'order_group' AS table_name, 'parent_order_group -> order_group' AS via, COUNT(*) AS num_rows
FROM   order_group c INNER JOIN order_group p ON c.parent_order_group = p.order_group_id
WHERE  p.voided = 1 AND c.voided = 0 AND c.patient_id = p.patient_id
UNION ALL
SELECT 48 AS seq, 'order_group_attribute' AS table_name, 'order_group_id -> order_group' AS via, COUNT(*) AS num_rows
FROM   order_group_attribute c INNER JOIN order_group p ON c.order_group_id = p.order_group_id
WHERE  p.voided = 1 AND c.voided = 0
UNION ALL
SELECT 49 AS seq, 'orders' AS table_name, 'order_group_id -> order_group' AS via, COUNT(*) AS num_rows
FROM   orders c INNER JOIN order_group p ON c.order_group_id = p.order_group_id
WHERE  p.voided = 1 AND c.voided = 0 AND c.patient_id = p.patient_id
UNION ALL
SELECT 50 AS seq, 'order_attribute' AS table_name, 'order_id -> orders' AS via, COUNT(*) AS num_rows
FROM   order_attribute c INNER JOIN orders p ON c.order_id = p.order_id
WHERE  p.voided = 1 AND c.voided = 0
UNION ALL
SELECT 51 AS seq, 'obs' AS table_name, 'obs_group_id -> obs' AS via, COUNT(*) AS num_rows
FROM   obs c INNER JOIN obs p ON c.obs_group_id = p.obs_id
WHERE  p.voided = 1 AND c.voided = 0 AND c.person_id = p.person_id
UNION ALL
SELECT 52 AS seq, 'cohort_member' AS table_name, 'cohort_id -> cohort' AS via, COUNT(*) AS num_rows
FROM   cohort_member c INNER JOIN cohort p ON c.cohort_id = p.cohort_id
WHERE  p.voided = 1 AND c.voided = 0
) x ORDER BY seq;

-- 2. Not followed, for information
SELECT 'not followed' AS section, table_name, via, num_rows FROM (
SELECT 1 AS seq, 'encounter' AS table_name, 'visit_id -> visit (patient mismatch)' AS via, COUNT(*) AS num_rows
FROM   encounter c INNER JOIN visit p ON c.visit_id = p.visit_id
WHERE  p.voided = 1 AND c.voided = 0 AND c.patient_id <> p.patient_id
UNION ALL
SELECT 2 AS seq, 'queue_entry' AS table_name, 'visit_id -> visit (patient mismatch)' AS via, COUNT(*) AS num_rows
FROM   queue_entry c INNER JOIN visit p ON c.visit_id = p.visit_id
WHERE  p.voided = 1 AND c.voided = 0 AND c.patient_id <> p.patient_id
UNION ALL
SELECT 3 AS seq, 'obs' AS table_name, 'encounter_id -> encounter (patient mismatch)' AS via, COUNT(*) AS num_rows
FROM   obs c INNER JOIN encounter p ON c.encounter_id = p.encounter_id
WHERE  p.voided = 1 AND c.voided = 0 AND c.person_id <> p.patient_id
UNION ALL
SELECT 4 AS seq, 'orders' AS table_name, 'encounter_id -> encounter (patient mismatch)' AS via, COUNT(*) AS num_rows
FROM   orders c INNER JOIN encounter p ON c.encounter_id = p.encounter_id
WHERE  p.voided = 1 AND c.voided = 0 AND c.patient_id <> p.patient_id
UNION ALL
SELECT 5 AS seq, 'encounter_diagnosis' AS table_name, 'encounter_id -> encounter (patient mismatch)' AS via, COUNT(*) AS num_rows
FROM   encounter_diagnosis c INNER JOIN encounter p ON c.encounter_id = p.encounter_id
WHERE  p.voided = 1 AND c.voided = 0 AND c.patient_id <> p.patient_id
UNION ALL
SELECT 6 AS seq, 'conditions' AS table_name, 'encounter_id -> encounter (patient mismatch)' AS via, COUNT(*) AS num_rows
FROM   conditions c INNER JOIN encounter p ON c.encounter_id = p.encounter_id
WHERE  p.voided = 1 AND c.voided = 0 AND c.patient_id <> p.patient_id
UNION ALL
SELECT 7 AS seq, 'allergy' AS table_name, 'encounter_id -> encounter (patient mismatch)' AS via, COUNT(*) AS num_rows
FROM   allergy c INNER JOIN encounter p ON c.encounter_id = p.encounter_id
WHERE  p.voided = 1 AND c.voided = 0 AND c.patient_id <> p.patient_id
UNION ALL
SELECT 8 AS seq, 'order_group' AS table_name, 'encounter_id -> encounter (patient mismatch)' AS via, COUNT(*) AS num_rows
FROM   order_group c INNER JOIN encounter p ON c.encounter_id = p.encounter_id
WHERE  p.voided = 1 AND c.voided = 0 AND c.patient_id <> p.patient_id
UNION ALL
SELECT 9 AS seq, 'medication_dispense' AS table_name, 'encounter_id -> encounter (patient mismatch)' AS via, COUNT(*) AS num_rows
FROM   medication_dispense c INNER JOIN encounter p ON c.encounter_id = p.encounter_id
WHERE  p.voided = 1 AND c.voided = 0 AND c.patient_id <> p.patient_id
UNION ALL
SELECT 10 AS seq, 'emrapi_procedure' AS table_name, 'encounter_id -> encounter (patient mismatch)' AS via, COUNT(*) AS num_rows
FROM   emrapi_procedure c INNER JOIN encounter p ON c.encounter_id = p.encounter_id
WHERE  p.voided = 1 AND c.voided = 0 AND c.patient_id <> p.patient_id
UNION ALL
SELECT 11 AS seq, 'bed_patient_assignment_map' AS table_name, 'encounter_id -> encounter (patient mismatch)' AS via, COUNT(*) AS num_rows
FROM   bed_patient_assignment_map c INNER JOIN encounter p ON c.encounter_id = p.encounter_id
WHERE  p.voided = 1 AND c.voided = 0 AND c.patient_id <> p.patient_id
UNION ALL
SELECT 12 AS seq, 'fhir_diagnostic_report' AS table_name, 'encounter_id -> encounter (patient mismatch)' AS via, COUNT(*) AS num_rows
FROM   fhir_diagnostic_report c INNER JOIN encounter p ON c.encounter_id = p.encounter_id
WHERE  p.voided = 1 AND c.voided = 0 AND c.subject_id <> p.patient_id
UNION ALL
SELECT 13 AS seq, 'order_group' AS table_name, 'parent_order_group -> order_group (patient mismatch)' AS via, COUNT(*) AS num_rows
FROM   order_group c INNER JOIN order_group p ON c.parent_order_group = p.order_group_id
WHERE  p.voided = 1 AND c.voided = 0 AND c.patient_id <> p.patient_id
UNION ALL
SELECT 14 AS seq, 'orders' AS table_name, 'order_group_id -> order_group (patient mismatch)' AS via, COUNT(*) AS num_rows
FROM   orders c INNER JOIN order_group p ON c.order_group_id = p.order_group_id
WHERE  p.voided = 1 AND c.voided = 0 AND c.patient_id <> p.patient_id
UNION ALL
SELECT 15 AS seq, 'obs' AS table_name, 'obs_group_id -> obs (patient mismatch)' AS via, COUNT(*) AS num_rows
FROM   obs c INNER JOIN obs p ON c.obs_group_id = p.obs_id
WHERE  p.voided = 1 AND c.voided = 0 AND c.person_id <> p.person_id
UNION ALL
SELECT 16 AS seq, 'person' AS table_name, 'person_id -> patient (user or provider)' AS via, COUNT(*) AS num_rows
FROM   person c INNER JOIN patient p ON c.person_id = p.patient_id
WHERE  p.voided = 1 AND c.voided = 0
  AND  (EXISTS (SELECT 1 FROM users u WHERE u.person_id = c.person_id)
        OR EXISTS (SELECT 1 FROM provider pr WHERE pr.person_id = c.person_id))
UNION ALL
SELECT 17 AS seq, 'obs' AS table_name, 'order_id -> orders (not followed)' AS via, COUNT(*) AS num_rows
FROM   obs c INNER JOIN orders p ON c.order_id = p.order_id
WHERE  p.voided = 1 AND c.voided = 0
UNION ALL
SELECT 18 AS seq, 'patient_state' AS table_name, 'encounter_id -> encounter (not followed)' AS via, COUNT(*) AS num_rows
FROM   patient_state c INNER JOIN encounter p ON c.encounter_id = p.encounter_id
WHERE  p.voided = 1 AND c.voided = 0
UNION ALL
SELECT 19 AS seq, 'patient_identifier' AS table_name, 'patient_program_id -> patient_program (not followed)' AS via, COUNT(*) AS num_rows
FROM   patient_identifier c INNER JOIN patient_program p ON c.patient_program_id = p.patient_program_id
WHERE  p.voided = 1 AND c.voided = 0
UNION ALL
SELECT 20 AS seq, 'appointmentscheduling_appointment' AS table_name, 'visit_id -> visit (not followed)' AS via, COUNT(*) AS num_rows
FROM   appointmentscheduling_appointment c INNER JOIN visit p ON c.visit_id = p.visit_id
WHERE  p.voided = 1 AND c.voided = 0
UNION ALL
SELECT 21 AS seq, 'patient_appointment' AS table_name, 'related_appointment_id -> patient_appointment (not followed)' AS via, COUNT(*) AS num_rows
FROM   patient_appointment c INNER JOIN patient_appointment p ON c.related_appointment_id = p.patient_appointment_id
WHERE  p.voided = 1 AND c.voided = 0
UNION ALL
SELECT 22 AS seq, 'encounter_diagnosis' AS table_name, 'condition_id -> conditions (not followed)' AS via, COUNT(*) AS num_rows
FROM   encounter_diagnosis c INNER JOIN conditions p ON c.condition_id = p.condition_id
WHERE  p.voided = 1 AND c.voided = 0
) x ORDER BY seq;

-- 3. Rows changed by each run of the cascade void script
SELECT table_name, run, num_rows FROM (
SELECT 0 AS seq, 'allergy' AS table_name, SUBSTRING(void_reason, LOCATE('[Cascade void: ', void_reason)) AS run, COUNT(*) AS num_rows
FROM   allergy WHERE voided = 1 AND void_reason LIKE '%[Cascade void: %' GROUP BY run
UNION ALL
SELECT 1 AS seq, 'appointmentscheduling_appointment' AS table_name, SUBSTRING(void_reason, LOCATE('[Cascade void: ', void_reason)) AS run, COUNT(*) AS num_rows
FROM   appointmentscheduling_appointment WHERE voided = 1 AND void_reason LIKE '%[Cascade void: %' GROUP BY run
UNION ALL
SELECT 2 AS seq, 'appointmentscheduling_appointment_request' AS table_name, SUBSTRING(void_reason, LOCATE('[Cascade void: ', void_reason)) AS run, COUNT(*) AS num_rows
FROM   appointmentscheduling_appointment_request WHERE voided = 1 AND void_reason LIKE '%[Cascade void: %' GROUP BY run
UNION ALL
SELECT 3 AS seq, 'bed_patient_assignment_map' AS table_name, SUBSTRING(void_reason, LOCATE('[Cascade void: ', void_reason)) AS run, COUNT(*) AS num_rows
FROM   bed_patient_assignment_map WHERE voided = 1 AND void_reason LIKE '%[Cascade void: %' GROUP BY run
UNION ALL
SELECT 4 AS seq, 'cohort_member' AS table_name, SUBSTRING(void_reason, LOCATE('[Cascade void: ', void_reason)) AS run, COUNT(*) AS num_rows
FROM   cohort_member WHERE voided = 1 AND void_reason LIKE '%[Cascade void: %' GROUP BY run
UNION ALL
SELECT 5 AS seq, 'conditions' AS table_name, SUBSTRING(void_reason, LOCATE('[Cascade void: ', void_reason)) AS run, COUNT(*) AS num_rows
FROM   conditions WHERE voided = 1 AND void_reason LIKE '%[Cascade void: %' GROUP BY run
UNION ALL
SELECT 6 AS seq, 'diagnosis_attribute' AS table_name, SUBSTRING(void_reason, LOCATE('[Cascade void: ', void_reason)) AS run, COUNT(*) AS num_rows
FROM   diagnosis_attribute WHERE voided = 1 AND void_reason LIKE '%[Cascade void: %' GROUP BY run
UNION ALL
SELECT 7 AS seq, 'emrapi_procedure' AS table_name, SUBSTRING(void_reason, LOCATE('[Cascade void: ', void_reason)) AS run, COUNT(*) AS num_rows
FROM   emrapi_procedure WHERE voided = 1 AND void_reason LIKE '%[Cascade void: %' GROUP BY run
UNION ALL
SELECT 8 AS seq, 'encounter' AS table_name, SUBSTRING(void_reason, LOCATE('[Cascade void: ', void_reason)) AS run, COUNT(*) AS num_rows
FROM   encounter WHERE voided = 1 AND void_reason LIKE '%[Cascade void: %' GROUP BY run
UNION ALL
SELECT 9 AS seq, 'encounter_diagnosis' AS table_name, SUBSTRING(void_reason, LOCATE('[Cascade void: ', void_reason)) AS run, COUNT(*) AS num_rows
FROM   encounter_diagnosis WHERE voided = 1 AND void_reason LIKE '%[Cascade void: %' GROUP BY run
UNION ALL
SELECT 10 AS seq, 'encounter_provider' AS table_name, SUBSTRING(void_reason, LOCATE('[Cascade void: ', void_reason)) AS run, COUNT(*) AS num_rows
FROM   encounter_provider WHERE voided = 1 AND void_reason LIKE '%[Cascade void: %' GROUP BY run
UNION ALL
SELECT 11 AS seq, 'fhir_diagnostic_report' AS table_name, SUBSTRING(void_reason, LOCATE('[Cascade void: ', void_reason)) AS run, COUNT(*) AS num_rows
FROM   fhir_diagnostic_report WHERE voided = 1 AND void_reason LIKE '%[Cascade void: %' GROUP BY run
UNION ALL
SELECT 12 AS seq, 'medication_dispense' AS table_name, SUBSTRING(void_reason, LOCATE('[Cascade void: ', void_reason)) AS run, COUNT(*) AS num_rows
FROM   medication_dispense WHERE voided = 1 AND void_reason LIKE '%[Cascade void: %' GROUP BY run
UNION ALL
SELECT 13 AS seq, 'obs' AS table_name, SUBSTRING(void_reason, LOCATE('[Cascade void: ', void_reason)) AS run, COUNT(*) AS num_rows
FROM   obs WHERE voided = 1 AND void_reason LIKE '%[Cascade void: %' GROUP BY run
UNION ALL
SELECT 14 AS seq, 'order_attribute' AS table_name, SUBSTRING(void_reason, LOCATE('[Cascade void: ', void_reason)) AS run, COUNT(*) AS num_rows
FROM   order_attribute WHERE voided = 1 AND void_reason LIKE '%[Cascade void: %' GROUP BY run
UNION ALL
SELECT 15 AS seq, 'order_group' AS table_name, SUBSTRING(void_reason, LOCATE('[Cascade void: ', void_reason)) AS run, COUNT(*) AS num_rows
FROM   order_group WHERE voided = 1 AND void_reason LIKE '%[Cascade void: %' GROUP BY run
UNION ALL
SELECT 16 AS seq, 'order_group_attribute' AS table_name, SUBSTRING(void_reason, LOCATE('[Cascade void: ', void_reason)) AS run, COUNT(*) AS num_rows
FROM   order_group_attribute WHERE voided = 1 AND void_reason LIKE '%[Cascade void: %' GROUP BY run
UNION ALL
SELECT 17 AS seq, 'orders' AS table_name, SUBSTRING(void_reason, LOCATE('[Cascade void: ', void_reason)) AS run, COUNT(*) AS num_rows
FROM   orders WHERE voided = 1 AND void_reason LIKE '%[Cascade void: %' GROUP BY run
UNION ALL
SELECT 18 AS seq, 'patient' AS table_name, SUBSTRING(void_reason, LOCATE('[Cascade void: ', void_reason)) AS run, COUNT(*) AS num_rows
FROM   patient WHERE voided = 1 AND void_reason LIKE '%[Cascade void: %' GROUP BY run
UNION ALL
SELECT 19 AS seq, 'patient_appointment' AS table_name, SUBSTRING(void_reason, LOCATE('[Cascade void: ', void_reason)) AS run, COUNT(*) AS num_rows
FROM   patient_appointment WHERE voided = 1 AND void_reason LIKE '%[Cascade void: %' GROUP BY run
UNION ALL
SELECT 20 AS seq, 'patient_appointment_audit' AS table_name, SUBSTRING(void_reason, LOCATE('[Cascade void: ', void_reason)) AS run, COUNT(*) AS num_rows
FROM   patient_appointment_audit WHERE voided = 1 AND void_reason LIKE '%[Cascade void: %' GROUP BY run
UNION ALL
SELECT 21 AS seq, 'patient_appointment_provider' AS table_name, SUBSTRING(void_reason, LOCATE('[Cascade void: ', void_reason)) AS run, COUNT(*) AS num_rows
FROM   patient_appointment_provider WHERE voided = 1 AND void_reason LIKE '%[Cascade void: %' GROUP BY run
UNION ALL
SELECT 22 AS seq, 'patient_appointment_reason' AS table_name, SUBSTRING(void_reason, LOCATE('[Cascade void: ', void_reason)) AS run, COUNT(*) AS num_rows
FROM   patient_appointment_reason WHERE voided = 1 AND void_reason LIKE '%[Cascade void: %' GROUP BY run
UNION ALL
SELECT 23 AS seq, 'patient_identifier' AS table_name, SUBSTRING(void_reason, LOCATE('[Cascade void: ', void_reason)) AS run, COUNT(*) AS num_rows
FROM   patient_identifier WHERE voided = 1 AND void_reason LIKE '%[Cascade void: %' GROUP BY run
UNION ALL
SELECT 24 AS seq, 'patient_program' AS table_name, SUBSTRING(void_reason, LOCATE('[Cascade void: ', void_reason)) AS run, COUNT(*) AS num_rows
FROM   patient_program WHERE voided = 1 AND void_reason LIKE '%[Cascade void: %' GROUP BY run
UNION ALL
SELECT 25 AS seq, 'patient_program_attribute' AS table_name, SUBSTRING(void_reason, LOCATE('[Cascade void: ', void_reason)) AS run, COUNT(*) AS num_rows
FROM   patient_program_attribute WHERE voided = 1 AND void_reason LIKE '%[Cascade void: %' GROUP BY run
UNION ALL
SELECT 26 AS seq, 'patient_state' AS table_name, SUBSTRING(void_reason, LOCATE('[Cascade void: ', void_reason)) AS run, COUNT(*) AS num_rows
FROM   patient_state WHERE voided = 1 AND void_reason LIKE '%[Cascade void: %' GROUP BY run
UNION ALL
SELECT 27 AS seq, 'person' AS table_name, SUBSTRING(void_reason, LOCATE('[Cascade void: ', void_reason)) AS run, COUNT(*) AS num_rows
FROM   person WHERE voided = 1 AND void_reason LIKE '%[Cascade void: %' GROUP BY run
UNION ALL
SELECT 28 AS seq, 'person_address' AS table_name, SUBSTRING(void_reason, LOCATE('[Cascade void: ', void_reason)) AS run, COUNT(*) AS num_rows
FROM   person_address WHERE voided = 1 AND void_reason LIKE '%[Cascade void: %' GROUP BY run
UNION ALL
SELECT 29 AS seq, 'person_attribute' AS table_name, SUBSTRING(void_reason, LOCATE('[Cascade void: ', void_reason)) AS run, COUNT(*) AS num_rows
FROM   person_attribute WHERE voided = 1 AND void_reason LIKE '%[Cascade void: %' GROUP BY run
UNION ALL
SELECT 30 AS seq, 'person_name' AS table_name, SUBSTRING(void_reason, LOCATE('[Cascade void: ', void_reason)) AS run, COUNT(*) AS num_rows
FROM   person_name WHERE voided = 1 AND void_reason LIKE '%[Cascade void: %' GROUP BY run
UNION ALL
SELECT 31 AS seq, 'queue_entry' AS table_name, SUBSTRING(void_reason, LOCATE('[Cascade void: ', void_reason)) AS run, COUNT(*) AS num_rows
FROM   queue_entry WHERE voided = 1 AND void_reason LIKE '%[Cascade void: %' GROUP BY run
UNION ALL
SELECT 32 AS seq, 'relationship' AS table_name, SUBSTRING(void_reason, LOCATE('[Cascade void: ', void_reason)) AS run, COUNT(*) AS num_rows
FROM   relationship WHERE voided = 1 AND void_reason LIKE '%[Cascade void: %' GROUP BY run
UNION ALL
SELECT 33 AS seq, 'visit' AS table_name, SUBSTRING(void_reason, LOCATE('[Cascade void: ', void_reason)) AS run, COUNT(*) AS num_rows
FROM   visit WHERE voided = 1 AND void_reason LIKE '%[Cascade void: %' GROUP BY run
UNION ALL
SELECT 34 AS seq, 'visit_attribute' AS table_name, SUBSTRING(void_reason, LOCATE('[Cascade void: ', void_reason)) AS run, COUNT(*) AS num_rows
FROM   visit_attribute WHERE voided = 1 AND void_reason LIKE '%[Cascade void: %' GROUP BY run
) x ORDER BY run, seq;
