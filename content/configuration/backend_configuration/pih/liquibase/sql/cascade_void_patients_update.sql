-- ============================================================
-- OpenMRS: Cascade Void — APPLY UPDATES
-- ============================================================
-- PURPOSE : Voids all unvoided child rows for patients where
--           voided=1 (person_name, encounter, obs, orders, etc.)
--
-- USAGE   :
--   1. Run openmrs_cascade_void_patients_dryrun.sql first and
--      review the row counts and date ranges.
--   2. Take a full database backup before running this script.
--   3. Set @voiding_user_id to a valid admin users.user_id.
--   4. Run this script. The transaction will ROLLBACK by default.
--      Review the row counts printed after each UPDATE, then
--      comment out ROLLBACK and uncomment COMMIT and re-run.
--
-- REQUIRES: MySQL 5.7+ / MariaDB 10.2+
-- ============================================================

-- ---- CONFIGURATION ----------------------------------------
SET @voiding_user_id = 1;          -- replace with your admin users.user_id
SET @void_reason     = 'Cascade void: patient record was previously voided';
-- -----------------------------------------------------------

-- Snapshot the current time once so all rows share the same date_voided
SET @now = NOW();

-- ============================================================
-- STEP 0: Build a temp table of voided patient person_ids
-- ============================================================
DROP TEMPORARY TABLE IF EXISTS _voided_persons;
CREATE TEMPORARY TABLE _voided_persons (person_id INT PRIMARY KEY)
  SELECT p.patient_id AS person_id
  FROM   patient p
  WHERE  p.voided = 1;

SELECT CONCAT('Voided patients found: ', COUNT(*)) AS info
FROM   _voided_persons;

-- ============================================================
-- UPDATES — wrapped in a transaction
-- Default behaviour is ROLLBACK. Review the row counts, then
-- comment out ROLLBACK and uncomment COMMIT and re-run.
-- ============================================================
START TRANSACTION;

-- ---- 1. person_name ----------------------------------------
UPDATE person_name pn
  JOIN _voided_persons v ON pn.person_id = v.person_id
SET pn.voided      = 1,
    pn.voided_by   = @voiding_user_id,
    pn.date_voided = @now,
    pn.void_reason = @void_reason
WHERE pn.voided = 0;
SELECT CONCAT('person_name rows voided: ', ROW_COUNT()) AS result;

-- ---- 2. person_address -------------------------------------
UPDATE person_address pa
  JOIN _voided_persons v ON pa.person_id = v.person_id
SET pa.voided      = 1,
    pa.voided_by   = @voiding_user_id,
    pa.date_voided = @now,
    pa.void_reason = @void_reason
WHERE pa.voided = 0;
SELECT CONCAT('person_address rows voided: ', ROW_COUNT()) AS result;

-- ---- 3. person_attribute ------------------------------------
UPDATE person_attribute pa
  JOIN _voided_persons v ON pa.person_id = v.person_id
SET pa.voided      = 1,
    pa.voided_by   = @voiding_user_id,
    pa.date_voided = @now,
    pa.void_reason = @void_reason
WHERE pa.voided = 0;
SELECT CONCAT('person_attribute rows voided: ', ROW_COUNT()) AS result;

-- ---- 4. patient_identifier ----------------------------------
UPDATE patient_identifier pi
  JOIN _voided_persons v ON pi.patient_id = v.person_id
SET pi.voided      = 1,
    pi.voided_by   = @voiding_user_id,
    pi.date_voided = @now,
    pi.void_reason = @void_reason
WHERE pi.voided = 0;
SELECT CONCAT('patient_identifier rows voided: ', ROW_COUNT()) AS result;

-- ---- 5. obs -------------------------------------------------
-- Covers obs linked to encounters AND obs linked directly to visits.
-- obs has a self-referential obs_group_id but voiding by person_id
-- in one pass catches all of them.
UPDATE obs o
  JOIN _voided_persons v ON o.person_id = v.person_id
SET o.voided      = 1,
    o.voided_by   = @voiding_user_id,
    o.date_voided = @now,
    o.void_reason = @void_reason
WHERE o.voided = 0;
SELECT CONCAT('obs rows voided: ', ROW_COUNT()) AS result;

-- ---- 6. orders ----------------------------------------------
-- drug_order and test_order share the orders PK so voiding
-- orders is sufficient for the subtype tables.
UPDATE orders ord
  JOIN _voided_persons v ON ord.patient_id = v.person_id
SET ord.voided      = 1,
    ord.voided_by   = @voiding_user_id,
    ord.date_voided = @now,
    ord.void_reason = @void_reason
WHERE ord.voided = 0;
SELECT CONCAT('orders rows voided: ', ROW_COUNT()) AS result;

-- ---- 7. encounter_provider ----------------------------------
UPDATE encounter_provider ep
  JOIN encounter e ON ep.encounter_id = e.encounter_id
  JOIN _voided_persons v ON e.patient_id = v.person_id
SET ep.voided      = 1,
    ep.voided_by   = @voiding_user_id,
    ep.date_voided = @now,
    ep.void_reason = @void_reason
WHERE ep.voided = 0;
SELECT CONCAT('encounter_provider rows voided: ', ROW_COUNT()) AS result;

-- ---- 8. encounter_diagnosis ---------------------------------
UPDATE encounter_diagnosis ed
  JOIN encounter e ON ed.encounter_id = e.encounter_id
  JOIN _voided_persons v ON e.patient_id = v.person_id
SET ed.voided      = 1,
    ed.voided_by   = @voiding_user_id,
    ed.date_voided = @now,
    ed.void_reason = @void_reason
WHERE ed.voided = 0;
SELECT CONCAT('encounter_diagnosis rows voided: ', ROW_COUNT()) AS result;

-- ---- 9. encounter -------------------------------------------
UPDATE encounter e
  JOIN _voided_persons v ON e.patient_id = v.person_id
SET e.voided      = 1,
    e.voided_by   = @voiding_user_id,
    e.date_voided = @now,
    e.void_reason = @void_reason
WHERE e.voided = 0;
SELECT CONCAT('encounter rows voided: ', ROW_COUNT()) AS result;

-- ---- 10. visit ----------------------------------------------
UPDATE visit vis
  JOIN _voided_persons v ON vis.patient_id = v.person_id
SET vis.voided      = 1,
    vis.voided_by   = @voiding_user_id,
    vis.date_voided = @now,
    vis.void_reason = @void_reason
WHERE vis.voided = 0;
SELECT CONCAT('visit rows voided: ', ROW_COUNT()) AS result;

-- ---- 11. patient_state (before patient_program) -------------
UPDATE patient_state ps
  JOIN patient_program pp ON ps.patient_program_id = pp.patient_program_id
  JOIN _voided_persons v ON pp.patient_id = v.person_id
SET ps.voided      = 1,
    ps.voided_by   = @voiding_user_id,
    ps.date_voided = @now,
    ps.void_reason = @void_reason
WHERE ps.voided = 0;
SELECT CONCAT('patient_state rows voided: ', ROW_COUNT()) AS result;

-- ---- 12. patient_program ------------------------------------
UPDATE patient_program pp
  JOIN _voided_persons v ON pp.patient_id = v.person_id
SET pp.voided      = 1,
    pp.voided_by   = @voiding_user_id,
    pp.date_voided = @now,
    pp.void_reason = @void_reason
WHERE pp.voided = 0;
SELECT CONCAT('patient_program rows voided: ', ROW_COUNT()) AS result;

-- ---- 13. relationship ---------------------------------------
-- Void if EITHER side of the relationship is a voided patient.
UPDATE relationship r
  JOIN _voided_persons v ON (r.person_a = v.person_id OR r.person_b = v.person_id)
SET r.voided      = 1,
    r.voided_by   = @voiding_user_id,
    r.date_voided = @now,
    r.void_reason = @void_reason
WHERE r.voided = 0;
SELECT CONCAT('relationship rows voided: ', ROW_COUNT()) AS result;

-- ---- 14. allergy --------------------------------------------
-- Note: allergy_reaction has no voided column and is omitted;
-- its rows are implicitly covered by voiding the parent allergy.
UPDATE allergy a
  JOIN _voided_persons v ON a.patient_id = v.person_id
SET a.voided      = 1,
    a.voided_by   = @voiding_user_id,
    a.date_voided = @now,
    a.void_reason = @void_reason
WHERE a.voided = 0;
SELECT CONCAT('allergy rows voided: ', ROW_COUNT()) AS result;

-- ---- 15. person (base record — do this last) ----------------
UPDATE person p
  JOIN _voided_persons v ON p.person_id = v.person_id
SET p.voided      = 1,
    p.voided_by   = @voiding_user_id,
    p.date_voided = @now,
    p.void_reason = @void_reason
WHERE p.voided = 0;
SELECT CONCAT('person rows voided: ', ROW_COUNT()) AS result;

-- ============================================================
-- SAFETY ROLLBACK (default behaviour)
-- Review the row counts above. If everything looks correct,
-- comment out ROLLBACK and uncomment COMMIT, then re-run.
-- ============================================================
ROLLBACK;
-- COMMIT;

SELECT 'Transaction rolled back — review counts above, then COMMIT to apply.' AS status;

-- ============================================================
-- CLEANUP
-- ============================================================
DROP TEMPORARY TABLE IF EXISTS _voided_persons;
