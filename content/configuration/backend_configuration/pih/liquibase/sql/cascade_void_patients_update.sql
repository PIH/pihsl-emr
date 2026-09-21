-- ============================================================
-- OpenMRS: Cascade Void — APPLY UPDATES (v2)
-- ============================================================
-- PURPOSE : Three-pass cascade void:
--
--   Pass 1 (person.voided = 1)
--     → person_name, person_address, person_attribute,
--       patient_identifier, relationship, allergy
--
--   Pass 2 (patient.voided = 1)
--     → obs (by person_id), orders, visit,
--       encounter_provider, encounter_diagnosis,
--       encounter, patient_state, patient_program, person
--
--   Pass 3 (encounter.voided = 1)
--     → obs (by encounter_id), orders,
--       encounter_provider, encounter_diagnosis
--     Catches child rows under encounters that were voided
--     independently (e.g. "Entered in error") on patients
--     who are NOT themselves voided. For encounters of voided
--     patients, pass 2 already handled these rows; the
--     WHERE voided = 0 guard makes pass 3 safe to run in
--     all cases — no row is double-voided.
--
-- USAGE   :
--   1. Run openmrs_cascade_void_patients_dryrun.sql first and
--      review the row counts and date ranges.
--   2. Take a full database backup before running this script.
--   3. Set @voiding_user_id to a valid admin users.user_id.
--   4. Run this script. 
--  
--   To test, uncomment all of the SELECT row counts and switch the COMMIT to ROLLBACK
--
-- ============================================================

-- ---- CONFIGURATION ----------------------------------------
SET @voiding_user_id = 1;         
SET @void_reason     = 'Cascade void: parent record was previously voided';
-- -----------------------------------------------------------

SET @now = NOW();

-- ============================================================
-- TEMP TABLES
-- ============================================================
DROP TEMPORARY TABLE IF EXISTS _voided_patients;
CREATE TEMPORARY TABLE _voided_patients (person_id INT PRIMARY KEY)
  SELECT p.patient_id AS person_id
  FROM   patient p
  WHERE  p.voided = 1;

-- SELECT CONCAT('Voided patients found: ', COUNT(*)) AS info
-- FROM   _voided_patients;

-- Captures all encounters already voided before this script runs,
-- including encounters on non-voided patients (the pass-3 gap case).
DROP TEMPORARY TABLE IF EXISTS _voided_encounters;
CREATE TEMPORARY TABLE _voided_encounters (encounter_id INT PRIMARY KEY)
  SELECT e.encounter_id
  FROM   encounter e
  WHERE  e.voided = 1;

-- SELECT CONCAT('Voided encounters found: ', COUNT(*)) AS info
-- FROM   _voided_encounters;

-- ============================================================
-- UPDATES — wrapped in a transaction
-- Default behaviour is ROLLBACK. Review the row counts, then
-- comment out ROLLBACK and uncomment COMMIT and re-run.
-- ============================================================
START TRANSACTION;

-- ============================================================
-- PASS 1: Records linked directly to the voided person
-- ============================================================

-- ---- 1. person_name ----------------------------------------
UPDATE person_name pn
  INNER JOIN _voided_patients v ON pn.person_id = v.person_id
SET pn.voided      = 1,
    pn.voided_by   = @voiding_user_id,
    pn.date_voided = @now,
    pn.void_reason = @void_reason
WHERE pn.voided = 0;
-- SELECT CONCAT('person_name rows voided: ', ROW_COUNT()) AS result;

-- ---- 2. person_address -------------------------------------
UPDATE person_address pa
  INNER JOIN _voided_patients v ON pa.person_id = v.person_id
SET pa.voided      = 1,
    pa.voided_by   = @voiding_user_id,
    pa.date_voided = @now,
    pa.void_reason = @void_reason
WHERE pa.voided = 0;
-- SELECT CONCAT('person_address rows voided: ', ROW_COUNT()) AS result;

-- ---- 3. person_attribute ------------------------------------
UPDATE person_attribute pat
  INNER JOIN _voided_patients v ON pat.person_id = v.person_id
SET pat.voided      = 1,
    pat.voided_by   = @voiding_user_id,
    pat.date_voided = @now,
    pat.void_reason = @void_reason
WHERE pat.voided = 0;
-- SELECT CONCAT('person_attribute rows voided: ', ROW_COUNT()) AS result;

-- ---- 4. patient_identifier ----------------------------------
UPDATE patient_identifier pi
  INNER JOIN _voided_patients v ON pi.patient_id = v.person_id
SET pi.voided      = 1,
    pi.voided_by   = @voiding_user_id,
    pi.date_voided = @now,
    pi.void_reason = @void_reason
WHERE pi.voided = 0;
-- SELECT CONCAT('patient_identifier rows voided: ', ROW_COUNT()) AS result;

-- ---- 5. relationship ----------------------------------------
-- Void if EITHER side of the relationship is a voided patient.
UPDATE relationship r
  INNER JOIN _voided_patients v ON (r.person_a = v.person_id OR r.person_b = v.person_id)
SET r.voided      = 1,
    r.voided_by   = @voiding_user_id,
    r.date_voided = @now,
    r.void_reason = @void_reason
WHERE r.voided = 0;
-- SELECT CONCAT('relationship rows voided: ', ROW_COUNT()) AS result;

-- ---- 6. allergy ---------------------------------------------
-- Note: allergy_reaction has no voided column; voiding the
-- parent allergy record implicitly covers its reactions.
UPDATE allergy a
  INNER JOIN _voided_patients v ON a.patient_id = v.person_id
SET a.voided      = 1,
    a.voided_by   = @voiding_user_id,
    a.date_voided = @now,
    a.void_reason = @void_reason
WHERE a.voided = 0;
-- SELECT CONCAT('allergy rows voided: ', ROW_COUNT()) AS result;

-- ============================================================
-- PASS 2: Records linked to the voided patient
-- ============================================================

-- ---- 7. obs (by person_id) ----------------------------------
-- Voiding by person_id in one pass catches all obs for the
-- patient, including obs under voided encounters (covered again
-- by pass 3 but harmlessly — WHERE voided=0 is the guard).
UPDATE obs o
  INNER JOIN _voided_patients v ON o.person_id = v.person_id
SET o.voided      = 1,
    o.voided_by   = @voiding_user_id,
    o.date_voided = @now,
    o.void_reason = @void_reason
WHERE o.voided = 0;
-- SELECT CONCAT('obs rows voided (pass 2, by patient): ', ROW_COUNT()) AS result;

-- ---- 8. orders (by patient_id) ------------------------------
-- drug_order and test_order share the orders PK so voiding
-- orders is sufficient for the subtype tables.
UPDATE orders ord
  INNER JOIN _voided_patients v ON ord.patient_id = v.person_id
SET ord.voided      = 1,
    ord.voided_by   = @voiding_user_id,
    ord.date_voided = @now,
    ord.void_reason = @void_reason
WHERE ord.voided = 0;
-- SELECT CONCAT('orders rows voided (pass 2, by patient): ', ROW_COUNT()) AS result;

-- ---- 9. visit -----------------------------------------------
UPDATE visit vis
  INNER JOIN _voided_patients v ON vis.patient_id = v.person_id
SET vis.voided      = 1,
    vis.voided_by   = @voiding_user_id,
    vis.date_voided = @now,
    vis.void_reason = @void_reason
WHERE vis.voided = 0;
-- SELECT CONCAT('visit rows voided: ', ROW_COUNT()) AS result;

-- ---- 10. encounter_provider (before encounter) --------------
UPDATE encounter_provider ep
  INNER JOIN encounter e ON ep.encounter_id = e.encounter_id
  INNER JOIN _voided_patients v ON e.patient_id = v.person_id
SET ep.voided      = 1,
    ep.voided_by   = @voiding_user_id,
    ep.date_voided = @now,
    ep.void_reason = @void_reason
WHERE ep.voided = 0;
-- SELECT CONCAT('encounter_provider rows voided (pass 2, by patient): ', ROW_COUNT()) AS result;

-- ---- 11. encounter_diagnosis (before encounter) -------------
UPDATE encounter_diagnosis ed
  INNER JOIN encounter e ON ed.encounter_id = e.encounter_id
  INNER JOIN _voided_patients v ON e.patient_id = v.person_id
SET ed.voided      = 1,
    ed.voided_by   = @voiding_user_id,
    ed.date_voided = @now,
    ed.void_reason = @void_reason
WHERE ed.voided = 0;
-- SELECT CONCAT('encounter_diagnosis rows voided (pass 2, by patient): ', ROW_COUNT()) AS result;

-- ---- 12. encounter ------------------------------------------
UPDATE encounter e
  INNER JOIN _voided_patients v ON e.patient_id = v.person_id
SET e.voided      = 1,
    e.voided_by   = @voiding_user_id,
    e.date_voided = @now,
    e.void_reason = @void_reason
WHERE e.voided = 0;
-- SELECT CONCAT('encounter rows voided: ', ROW_COUNT()) AS result;

-- ---- 13. patient_state (before patient_program) -------------
UPDATE patient_state ps
  INNER JOIN patient_program pp ON ps.patient_program_id = pp.patient_program_id
  INNER JOIN _voided_patients v ON pp.patient_id = v.person_id
SET ps.voided      = 1,
    ps.voided_by   = @voiding_user_id,
    ps.date_voided = @now,
    ps.void_reason = @void_reason
WHERE ps.voided = 0;
-- SELECT CONCAT('patient_state rows voided: ', ROW_COUNT()) AS result;

-- ---- 14. patient_program ------------------------------------
UPDATE patient_program pp
  INNER JOIN _voided_patients v ON pp.patient_id = v.person_id
SET pp.voided      = 1,
    pp.voided_by   = @voiding_user_id,
    pp.date_voided = @now,
    pp.void_reason = @void_reason
WHERE pp.voided = 0;
-- SELECT CONCAT('patient_program rows voided: ', ROW_COUNT()) AS result;

-- ---- 15. person (base record — last in pass 2) --------------
UPDATE person p
  INNER JOIN _voided_patients v ON p.person_id = v.person_id
SET p.voided      = 1,
    p.voided_by   = @voiding_user_id,
    p.date_voided = @now,
    p.void_reason = @void_reason
WHERE p.voided = 0;
-- SELECT CONCAT('person rows voided: ', ROW_COUNT()) AS result;

-- ============================================================
-- PASS 3: Records linked to voided encounters
-- _voided_encounters was built before the transaction, so it
-- contains encounters already voided prior to this script.
-- Encounters voided in pass 2 (step 12) are not in this set,
-- but their children were handled in steps 10–11 above.
-- Pass 3 is primarily for the gap case: encounters voided
-- independently (e.g. "Entered in error") on non-voided patients.
-- ============================================================

-- ---- 16. obs (by encounter_id) ------------------------------
UPDATE obs o
  INNER JOIN _voided_encounters ve ON o.encounter_id = ve.encounter_id
SET o.voided      = 1,
    o.voided_by   = @voiding_user_id,
    o.date_voided = @now,
    o.void_reason = @void_reason
WHERE o.voided = 0;
-- SELECT CONCAT('obs rows voided (pass 3, by encounter): ', ROW_COUNT()) AS result;

-- ---- 17. orders (by encounter_id) --------------------------
UPDATE orders ord
  INNER JOIN _voided_encounters ve ON ord.encounter_id = ve.encounter_id
SET ord.voided      = 1,
    ord.voided_by   = @voiding_user_id,
    ord.date_voided = @now,
    ord.void_reason = @void_reason
WHERE ord.voided = 0;
-- SELECT CONCAT('orders rows voided (pass 3, by encounter): ', ROW_COUNT()) AS result;

-- ---- 18. encounter_provider (by encounter_id) ---------------
UPDATE encounter_provider ep
  INNER JOIN _voided_encounters ve ON ep.encounter_id = ve.encounter_id
SET ep.voided      = 1,
    ep.voided_by   = @voiding_user_id,
    ep.date_voided = @now,
    ep.void_reason = @void_reason
WHERE ep.voided = 0;
-- SELECT CONCAT('encounter_provider rows voided (pass 3, by encounter): ', ROW_COUNT()) AS result;

-- ---- 19. encounter_diagnosis (by encounter_id) --------------
UPDATE encounter_diagnosis ed
  INNER JOIN _voided_encounters ve ON ed.encounter_id = ve.encounter_id
SET ed.voided      = 1,
    ed.voided_by   = @voiding_user_id,
    ed.date_voided = @now,
    ed.void_reason = @void_reason
WHERE ed.voided = 0;
-- SELECT CONCAT('encounter_diagnosis rows voided (pass 3, by encounter): ', ROW_COUNT()) AS result;

-- ============================================================
-- For testing, uncomment ROLLBACK and comment out COMMIT
-- ============================================================
-- ROLLBACK;
COMMIT;

-- SELECT 'Transaction rolled back — review counts above, then COMMIT to apply.' AS status;

-- ============================================================
-- CLEANUP
-- ============================================================
DROP TEMPORARY TABLE IF EXISTS _voided_encounters;
DROP TEMPORARY TABLE IF EXISTS _voided_patients;
