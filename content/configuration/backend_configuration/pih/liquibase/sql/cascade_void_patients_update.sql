-- ============================================================
-- Cascade void: ensure voided data does not have non-voided child data
-- ============================================================
-- Created for SL-1397.  Can be re-run whenever data gets out of sync
-- (see "Re-running" below).  ../scripts/cascade_void_patients_report.sql
-- reports, per table, the non-voided rows with a voided parent that this
-- addresses, and the rows changed by each run.
--
-- Works top-down, one level at a time.  At each level, voided rows
-- of the parent table are collected into a temp table (_void_xxx),
-- and non-voided rows of its child tables are voided from it.
-- Each level selects ALL voided parent rows, not only those voided
-- here, so children of anything voided in the past are also caught.
--
-- Void metadata:
--   Children copy voided_by and date_voided from their parent.  This
--   matches what the OpenMRS API does when voiding, and is required
--   for unvoid to work: core only unvoids children whose
--   date_voided (and, for encounters and orders, voided_by) match
--   those of the parent.  void_reason is also copied from the parent, with
--   a tag appended so rows changed by a run can be identified, eg.
--   "Merged with patient #123 [Cascade void: 2026-10-03.15:36]".
--   If a parent has no voided_by / date_voided, the daemon user and
--   the time of this run are used instead.
--
-- Re-running:
--   This can be run again whenever data gets out of sync.  Rows that are
--   already voided are never changed, so a repeat run only voids new
--   rows.  If a parent was voided by an earlier run, its tag is replaced
--   by the tag of the current run when copied to its children, rather
--   than tags accumulating.
--
-- Precedence:
--   A row reachable from several parents (eg. an encounter via its
--   patient and via its visit) is voided by the first level that
--   reaches it, so it takes the metadata of its highest ancestor.
--
-- Patient mismatches:
--   When cascading from a parent other than person/patient, the child
--   is only voided if it belongs to the same patient as the parent.
--   Rows linked to a different patient than their parent (eg. after a
--   faulty merge) are left alone rather than voiding data of a patient
--   that may be active.
--
-- Scope of the cascade:
--   Based on the foreign keys between voidable tables.  Every foreign
--   key where the child is owned by the parent is followed.  Not followed:
--   - versioning: obs.previous_version, conditions.previous_version,
--     orders.previous_order_id, order_group.previous_order_group.
--     The current version references the voided previous version.
--   - references to metadata (concept_name, bed, appointment service,
--     time slot, etc) and person_merge_log.
--   - references between independent patient data, where voiding the
--     parent does not invalidate the child:
--     obs.order_id (results of an order are owned by the encounter),
--     patient_state.encounter_id (would leave a gap in program history),
--     patient_identifier.patient_program_id (identifier may still be in use),
--     appointmentscheduling_appointment.visit_id (appointment predates visit),
--     patient_appointment.related_appointment_id,
--     encounter_diagnosis.condition_id.
--   Tables without a voided column that reference these tables
--   (eg. note, drug_order, allergy_reaction) cannot be voided.
--
--   person rows are not voided if the person is a user or provider.
--   Their names, addresses and attributes are then also kept, as an
--   active person with no non-voided name has no display name.
-- ============================================================

SET @fallback_date = NOW();
SET @tag_prefix = '[Cascade void';
SET @tag = CONCAT(@tag_prefix, ': ', DATE_FORMAT(@fallback_date, '%Y-%m-%d.%H:%i'), ']');
-- longest parent void_reason that fits in varchar(255) along with a space and the tag
SET @max_reason_length = 254 - CHAR_LENGTH(@tag);
-- daemon user
SET @fallback_user = COALESCE((SELECT user_id FROM users WHERE uuid = 'A4F30A1B-5EB9-11DF-A648-37A07F9C90FB'), 1);


-- ============================================================
-- 1. PERSON
-- ============================================================

-- Void the person of each voided patient, unless they are a user or provider
UPDATE person p
INNER JOIN patient pt ON pt.patient_id = p.person_id
SET    p.voided = 1,
       p.voided_by = COALESCE(pt.voided_by, @fallback_user),
       p.date_voided = COALESCE(pt.date_voided, @fallback_date),
       p.void_reason = TRIM(CONCAT(LEFT(TRIM(SUBSTRING_INDEX(COALESCE(pt.void_reason, ''), @tag_prefix, 1)), @max_reason_length), ' ', @tag))
WHERE  pt.voided = 1
  AND  p.voided = 0
  AND  NOT EXISTS (SELECT 1 FROM users u WHERE u.person_id = p.person_id)
  AND  NOT EXISTS (SELECT 1 FROM provider pr WHERE pr.person_id = p.person_id);

DROP TEMPORARY TABLE IF EXISTS _void_person;
CREATE TEMPORARY TABLE _void_person (
    person_id INT NOT NULL PRIMARY KEY,
    voided_by INT NOT NULL,
    date_voided DATETIME NOT NULL,
    void_reason VARCHAR(255) NOT NULL
)
SELECT person_id,
       COALESCE(voided_by, @fallback_user) AS voided_by,
       COALESCE(date_voided, @fallback_date) AS date_voided,
       TRIM(CONCAT(LEFT(TRIM(SUBSTRING_INDEX(COALESCE(void_reason, ''), @tag_prefix, 1)), @max_reason_length), ' ', @tag)) AS void_reason
FROM   person
WHERE  voided = 1;

UPDATE patient pt
INNER JOIN _void_person v ON pt.patient_id = v.person_id
SET    pt.voided = 1, pt.voided_by = v.voided_by, pt.date_voided = v.date_voided, pt.void_reason = v.void_reason
WHERE  pt.voided = 0;

UPDATE person_name t
INNER JOIN _void_person v ON t.person_id = v.person_id
SET    t.voided = 1, t.voided_by = v.voided_by, t.date_voided = v.date_voided, t.void_reason = v.void_reason
WHERE  t.voided = 0;

UPDATE person_address t
INNER JOIN _void_person v ON t.person_id = v.person_id
SET    t.voided = 1, t.voided_by = v.voided_by, t.date_voided = v.date_voided, t.void_reason = v.void_reason
WHERE  t.voided = 0;

UPDATE person_attribute t
INNER JOIN _void_person v ON t.person_id = v.person_id
SET    t.voided = 1, t.voided_by = v.voided_by, t.date_voided = v.date_voided, t.void_reason = v.void_reason
WHERE  t.voided = 0;

-- Separate statements for each side, as MySQL cannot reference a temporary table twice in one query
UPDATE relationship t
INNER JOIN _void_person v ON t.person_a = v.person_id
SET    t.voided = 1, t.voided_by = v.voided_by, t.date_voided = v.date_voided, t.void_reason = v.void_reason
WHERE  t.voided = 0;

UPDATE relationship t
INNER JOIN _void_person v ON t.person_b = v.person_id
SET    t.voided = 1, t.voided_by = v.voided_by, t.date_voided = v.date_voided, t.void_reason = v.void_reason
WHERE  t.voided = 0;

-- Covers all obs of the person, including obs group members at any depth
UPDATE obs t
INNER JOIN _void_person v ON t.person_id = v.person_id
SET    t.voided = 1, t.voided_by = v.voided_by, t.date_voided = v.date_voided, t.void_reason = v.void_reason
WHERE  t.voided = 0;

DROP TEMPORARY TABLE IF EXISTS _void_person;


-- ============================================================
-- 2. PATIENT
-- ============================================================
-- Includes patients that are voided but whose person is not (users and providers)

DROP TEMPORARY TABLE IF EXISTS _void_patient;
CREATE TEMPORARY TABLE _void_patient (
    patient_id INT NOT NULL PRIMARY KEY,
    voided_by INT NOT NULL,
    date_voided DATETIME NOT NULL,
    void_reason VARCHAR(255) NOT NULL
)
SELECT patient_id,
       COALESCE(voided_by, @fallback_user) AS voided_by,
       COALESCE(date_voided, @fallback_date) AS date_voided,
       TRIM(CONCAT(LEFT(TRIM(SUBSTRING_INDEX(COALESCE(void_reason, ''), @tag_prefix, 1)), @max_reason_length), ' ', @tag)) AS void_reason
FROM   patient
WHERE  voided = 1;

UPDATE obs t
INNER JOIN _void_patient v ON t.person_id = v.patient_id
SET    t.voided = 1, t.voided_by = v.voided_by, t.date_voided = v.date_voided, t.void_reason = v.void_reason
WHERE  t.voided = 0;

UPDATE patient_identifier t
INNER JOIN _void_patient v ON t.patient_id = v.patient_id
SET    t.voided = 1, t.voided_by = v.voided_by, t.date_voided = v.date_voided, t.void_reason = v.void_reason
WHERE  t.voided = 0;

UPDATE visit t
INNER JOIN _void_patient v ON t.patient_id = v.patient_id
SET    t.voided = 1, t.voided_by = v.voided_by, t.date_voided = v.date_voided, t.void_reason = v.void_reason
WHERE  t.voided = 0;

UPDATE encounter t
INNER JOIN _void_patient v ON t.patient_id = v.patient_id
SET    t.voided = 1, t.voided_by = v.voided_by, t.date_voided = v.date_voided, t.void_reason = v.void_reason
WHERE  t.voided = 0;

UPDATE orders t
INNER JOIN _void_patient v ON t.patient_id = v.patient_id
SET    t.voided = 1, t.voided_by = v.voided_by, t.date_voided = v.date_voided, t.void_reason = v.void_reason
WHERE  t.voided = 0;

UPDATE order_group t
INNER JOIN _void_patient v ON t.patient_id = v.patient_id
SET    t.voided = 1, t.voided_by = v.voided_by, t.date_voided = v.date_voided, t.void_reason = v.void_reason
WHERE  t.voided = 0;

UPDATE encounter_diagnosis t
INNER JOIN _void_patient v ON t.patient_id = v.patient_id
SET    t.voided = 1, t.voided_by = v.voided_by, t.date_voided = v.date_voided, t.void_reason = v.void_reason
WHERE  t.voided = 0;

UPDATE conditions t
INNER JOIN _void_patient v ON t.patient_id = v.patient_id
SET    t.voided = 1, t.voided_by = v.voided_by, t.date_voided = v.date_voided, t.void_reason = v.void_reason
WHERE  t.voided = 0;

UPDATE allergy t
INNER JOIN _void_patient v ON t.patient_id = v.patient_id
SET    t.voided = 1, t.voided_by = v.voided_by, t.date_voided = v.date_voided, t.void_reason = v.void_reason
WHERE  t.voided = 0;

UPDATE patient_program t
INNER JOIN _void_patient v ON t.patient_id = v.patient_id
SET    t.voided = 1, t.voided_by = v.voided_by, t.date_voided = v.date_voided, t.void_reason = v.void_reason
WHERE  t.voided = 0;

UPDATE cohort_member t
INNER JOIN _void_patient v ON t.patient_id = v.patient_id
SET    t.voided = 1, t.voided_by = v.voided_by, t.date_voided = v.date_voided, t.void_reason = v.void_reason
WHERE  t.voided = 0;

UPDATE medication_dispense t
INNER JOIN _void_patient v ON t.patient_id = v.patient_id
SET    t.voided = 1, t.voided_by = v.voided_by, t.date_voided = v.date_voided, t.void_reason = v.void_reason
WHERE  t.voided = 0;

UPDATE emrapi_procedure t
INNER JOIN _void_patient v ON t.patient_id = v.patient_id
SET    t.voided = 1, t.voided_by = v.voided_by, t.date_voided = v.date_voided, t.void_reason = v.void_reason
WHERE  t.voided = 0;

UPDATE bed_patient_assignment_map t
INNER JOIN _void_patient v ON t.patient_id = v.patient_id
SET    t.voided = 1, t.voided_by = v.voided_by, t.date_voided = v.date_voided, t.void_reason = v.void_reason
WHERE  t.voided = 0;

UPDATE fhir_diagnostic_report t
INNER JOIN _void_patient v ON t.subject_id = v.patient_id
SET    t.voided = 1, t.voided_by = v.voided_by, t.date_voided = v.date_voided, t.void_reason = v.void_reason
WHERE  t.voided = 0;

UPDATE queue_entry t
INNER JOIN _void_patient v ON t.patient_id = v.patient_id
SET    t.voided = 1, t.voided_by = v.voided_by, t.date_voided = v.date_voided, t.void_reason = v.void_reason
WHERE  t.voided = 0;

UPDATE patient_appointment t
INNER JOIN _void_patient v ON t.patient_id = v.patient_id
SET    t.voided = 1, t.voided_by = v.voided_by, t.date_voided = v.date_voided, t.void_reason = v.void_reason
WHERE  t.voided = 0;

UPDATE appointmentscheduling_appointment t
INNER JOIN _void_patient v ON t.patient_id = v.patient_id
SET    t.voided = 1, t.voided_by = v.voided_by, t.date_voided = v.date_voided, t.void_reason = v.void_reason
WHERE  t.voided = 0;

UPDATE appointmentscheduling_appointment_request t
INNER JOIN _void_patient v ON t.patient_id = v.patient_id
SET    t.voided = 1, t.voided_by = v.voided_by, t.date_voided = v.date_voided, t.void_reason = v.void_reason
WHERE  t.voided = 0;

DROP TEMPORARY TABLE IF EXISTS _void_patient;


-- ============================================================
-- 3. PATIENT PROGRAM
-- ============================================================

DROP TEMPORARY TABLE IF EXISTS _void_patient_program;
CREATE TEMPORARY TABLE _void_patient_program (
    patient_program_id INT NOT NULL PRIMARY KEY,
    voided_by INT NOT NULL,
    date_voided DATETIME NOT NULL,
    void_reason VARCHAR(255) NOT NULL
)
SELECT patient_program_id,
       COALESCE(voided_by, @fallback_user) AS voided_by,
       COALESCE(date_voided, @fallback_date) AS date_voided,
       TRIM(CONCAT(LEFT(TRIM(SUBSTRING_INDEX(COALESCE(void_reason, ''), @tag_prefix, 1)), @max_reason_length), ' ', @tag)) AS void_reason
FROM   patient_program
WHERE  voided = 1;

UPDATE patient_state t
INNER JOIN _void_patient_program v ON t.patient_program_id = v.patient_program_id
SET    t.voided = 1, t.voided_by = v.voided_by, t.date_voided = v.date_voided, t.void_reason = v.void_reason
WHERE  t.voided = 0;

UPDATE patient_program_attribute t
INNER JOIN _void_patient_program v ON t.patient_program_id = v.patient_program_id
SET    t.voided = 1, t.voided_by = v.voided_by, t.date_voided = v.date_voided, t.void_reason = v.void_reason
WHERE  t.voided = 0;

DROP TEMPORARY TABLE IF EXISTS _void_patient_program;


-- ============================================================
-- 4. PATIENT APPOINTMENT
-- ============================================================

DROP TEMPORARY TABLE IF EXISTS _void_patient_appointment;
CREATE TEMPORARY TABLE _void_patient_appointment (
    patient_appointment_id INT NOT NULL PRIMARY KEY,
    voided_by INT NOT NULL,
    date_voided DATETIME NOT NULL,
    void_reason VARCHAR(255) NOT NULL
)
SELECT patient_appointment_id,
       COALESCE(voided_by, @fallback_user) AS voided_by,
       COALESCE(date_voided, @fallback_date) AS date_voided,
       TRIM(CONCAT(LEFT(TRIM(SUBSTRING_INDEX(COALESCE(void_reason, ''), @tag_prefix, 1)), @max_reason_length), ' ', @tag)) AS void_reason
FROM   patient_appointment
WHERE  voided = 1;

UPDATE patient_appointment_provider t
INNER JOIN _void_patient_appointment v ON t.patient_appointment_id = v.patient_appointment_id
SET    t.voided = 1, t.voided_by = v.voided_by, t.date_voided = v.date_voided, t.void_reason = v.void_reason
WHERE  t.voided = 0;

UPDATE patient_appointment_reason t
INNER JOIN _void_patient_appointment v ON t.patient_appointment_id = v.patient_appointment_id
SET    t.voided = 1, t.voided_by = v.voided_by, t.date_voided = v.date_voided, t.void_reason = v.void_reason
WHERE  t.voided = 0;

UPDATE patient_appointment_audit t
INNER JOIN _void_patient_appointment v ON t.appointment_id = v.patient_appointment_id
SET    t.voided = 1, t.voided_by = v.voided_by, t.date_voided = v.date_voided, t.void_reason = v.void_reason
WHERE  t.voided = 0;

DROP TEMPORARY TABLE IF EXISTS _void_patient_appointment;


-- ============================================================
-- 5. VISIT
-- ============================================================

DROP TEMPORARY TABLE IF EXISTS _void_visit;
CREATE TEMPORARY TABLE _void_visit (
    visit_id INT NOT NULL PRIMARY KEY,
    patient_id INT NOT NULL,
    voided_by INT NOT NULL,
    date_voided DATETIME NOT NULL,
    void_reason VARCHAR(255) NOT NULL
)
SELECT visit_id,
       patient_id,
       COALESCE(voided_by, @fallback_user) AS voided_by,
       COALESCE(date_voided, @fallback_date) AS date_voided,
       TRIM(CONCAT(LEFT(TRIM(SUBSTRING_INDEX(COALESCE(void_reason, ''), @tag_prefix, 1)), @max_reason_length), ' ', @tag)) AS void_reason
FROM   visit
WHERE  voided = 1;

UPDATE visit_attribute t
INNER JOIN _void_visit v ON t.visit_id = v.visit_id
SET    t.voided = 1, t.voided_by = v.voided_by, t.date_voided = v.date_voided, t.void_reason = v.void_reason
WHERE  t.voided = 0;

UPDATE encounter t
INNER JOIN _void_visit v ON t.visit_id = v.visit_id AND t.patient_id = v.patient_id
SET    t.voided = 1, t.voided_by = v.voided_by, t.date_voided = v.date_voided, t.void_reason = v.void_reason
WHERE  t.voided = 0;

UPDATE queue_entry t
INNER JOIN _void_visit v ON t.visit_id = v.visit_id AND t.patient_id = v.patient_id
SET    t.voided = 1, t.voided_by = v.voided_by, t.date_voided = v.date_voided, t.void_reason = v.void_reason
WHERE  t.voided = 0;

DROP TEMPORARY TABLE IF EXISTS _void_visit;


-- ============================================================
-- 6. ENCOUNTER
-- ============================================================

DROP TEMPORARY TABLE IF EXISTS _void_encounter;
CREATE TEMPORARY TABLE _void_encounter (
    encounter_id INT NOT NULL PRIMARY KEY,
    patient_id INT NOT NULL,
    voided_by INT NOT NULL,
    date_voided DATETIME NOT NULL,
    void_reason VARCHAR(255) NOT NULL
)
SELECT encounter_id,
       patient_id,
       COALESCE(voided_by, @fallback_user) AS voided_by,
       COALESCE(date_voided, @fallback_date) AS date_voided,
       TRIM(CONCAT(LEFT(TRIM(SUBSTRING_INDEX(COALESCE(void_reason, ''), @tag_prefix, 1)), @max_reason_length), ' ', @tag)) AS void_reason
FROM   encounter
WHERE  voided = 1;

UPDATE encounter_provider t
INNER JOIN _void_encounter v ON t.encounter_id = v.encounter_id
SET    t.voided = 1, t.voided_by = v.voided_by, t.date_voided = v.date_voided, t.void_reason = v.void_reason
WHERE  t.voided = 0;

-- Covers all obs of the encounter, including obs group members at any depth
UPDATE obs t
INNER JOIN _void_encounter v ON t.encounter_id = v.encounter_id AND t.person_id = v.patient_id
SET    t.voided = 1, t.voided_by = v.voided_by, t.date_voided = v.date_voided, t.void_reason = v.void_reason
WHERE  t.voided = 0;

UPDATE orders t
INNER JOIN _void_encounter v ON t.encounter_id = v.encounter_id AND t.patient_id = v.patient_id
SET    t.voided = 1, t.voided_by = v.voided_by, t.date_voided = v.date_voided, t.void_reason = v.void_reason
WHERE  t.voided = 0;

UPDATE encounter_diagnosis t
INNER JOIN _void_encounter v ON t.encounter_id = v.encounter_id AND t.patient_id = v.patient_id
SET    t.voided = 1, t.voided_by = v.voided_by, t.date_voided = v.date_voided, t.void_reason = v.void_reason
WHERE  t.voided = 0;

UPDATE conditions t
INNER JOIN _void_encounter v ON t.encounter_id = v.encounter_id AND t.patient_id = v.patient_id
SET    t.voided = 1, t.voided_by = v.voided_by, t.date_voided = v.date_voided, t.void_reason = v.void_reason
WHERE  t.voided = 0;

UPDATE allergy t
INNER JOIN _void_encounter v ON t.encounter_id = v.encounter_id AND t.patient_id = v.patient_id
SET    t.voided = 1, t.voided_by = v.voided_by, t.date_voided = v.date_voided, t.void_reason = v.void_reason
WHERE  t.voided = 0;

UPDATE order_group t
INNER JOIN _void_encounter v ON t.encounter_id = v.encounter_id AND t.patient_id = v.patient_id
SET    t.voided = 1, t.voided_by = v.voided_by, t.date_voided = v.date_voided, t.void_reason = v.void_reason
WHERE  t.voided = 0;

UPDATE medication_dispense t
INNER JOIN _void_encounter v ON t.encounter_id = v.encounter_id AND t.patient_id = v.patient_id
SET    t.voided = 1, t.voided_by = v.voided_by, t.date_voided = v.date_voided, t.void_reason = v.void_reason
WHERE  t.voided = 0;

UPDATE emrapi_procedure t
INNER JOIN _void_encounter v ON t.encounter_id = v.encounter_id AND t.patient_id = v.patient_id
SET    t.voided = 1, t.voided_by = v.voided_by, t.date_voided = v.date_voided, t.void_reason = v.void_reason
WHERE  t.voided = 0;

UPDATE bed_patient_assignment_map t
INNER JOIN _void_encounter v ON t.encounter_id = v.encounter_id AND t.patient_id = v.patient_id
SET    t.voided = 1, t.voided_by = v.voided_by, t.date_voided = v.date_voided, t.void_reason = v.void_reason
WHERE  t.voided = 0;

UPDATE fhir_diagnostic_report t
INNER JOIN _void_encounter v ON t.encounter_id = v.encounter_id AND t.subject_id = v.patient_id
SET    t.voided = 1, t.voided_by = v.voided_by, t.date_voided = v.date_voided, t.void_reason = v.void_reason
WHERE  t.voided = 0;

DROP TEMPORARY TABLE IF EXISTS _void_encounter;


-- ============================================================
-- 7. ENCOUNTER DIAGNOSIS
-- ============================================================

DROP TEMPORARY TABLE IF EXISTS _void_diagnosis;
CREATE TEMPORARY TABLE _void_diagnosis (
    diagnosis_id INT NOT NULL PRIMARY KEY,
    voided_by INT NOT NULL,
    date_voided DATETIME NOT NULL,
    void_reason VARCHAR(255) NOT NULL
)
SELECT diagnosis_id,
       COALESCE(voided_by, @fallback_user) AS voided_by,
       COALESCE(date_voided, @fallback_date) AS date_voided,
       TRIM(CONCAT(LEFT(TRIM(SUBSTRING_INDEX(COALESCE(void_reason, ''), @tag_prefix, 1)), @max_reason_length), ' ', @tag)) AS void_reason
FROM   encounter_diagnosis
WHERE  voided = 1;

UPDATE diagnosis_attribute t
INNER JOIN _void_diagnosis v ON t.diagnosis_id = v.diagnosis_id
SET    t.voided = 1, t.voided_by = v.voided_by, t.date_voided = v.date_voided, t.void_reason = v.void_reason
WHERE  t.voided = 0;

DROP TEMPORARY TABLE IF EXISTS _void_diagnosis;


-- ============================================================
-- 8. ORDER GROUP
-- ============================================================
-- _void_order_group is built twice.  A temp table is a snapshot of the voided
-- order groups at the time it is created, so order groups voided by an UPDATE
-- after that are not in it.  To cascade from those as well, the temp table is
-- dropped and rebuilt.  (MySQL cannot insert into a temp table from a select on
-- the same temp table, so it is rebuilt rather than appended to.)
-- This handles one level of nested order groups.

-- Step 1: from all voided order groups, void their nested child order groups
-- (order_group.parent_order_group) belonging to the same patient.

DROP TEMPORARY TABLE IF EXISTS _void_order_group;
CREATE TEMPORARY TABLE _void_order_group (
    order_group_id INT NOT NULL PRIMARY KEY,
    patient_id INT NOT NULL,
    voided_by INT NOT NULL,
    date_voided DATETIME NOT NULL,
    void_reason VARCHAR(255) NOT NULL
)
SELECT order_group_id,
       patient_id,
       COALESCE(voided_by, @fallback_user) AS voided_by,
       COALESCE(date_voided, @fallback_date) AS date_voided,
       TRIM(CONCAT(LEFT(TRIM(SUBSTRING_INDEX(COALESCE(void_reason, ''), @tag_prefix, 1)), @max_reason_length), ' ', @tag)) AS void_reason
FROM   order_group
WHERE  voided = 1;

UPDATE order_group t
INNER JOIN _void_order_group v ON t.parent_order_group = v.order_group_id AND t.patient_id = v.patient_id
SET    t.voided = 1, t.voided_by = v.voided_by, t.date_voided = v.date_voided, t.void_reason = v.void_reason
WHERE  t.voided = 0;

-- Step 2: rebuild, now including the nested order groups voided in step 1,
-- and void the attributes and orders of all voided order groups.

DROP TEMPORARY TABLE IF EXISTS _void_order_group;
CREATE TEMPORARY TABLE _void_order_group (
    order_group_id INT NOT NULL PRIMARY KEY,
    patient_id INT NOT NULL,
    voided_by INT NOT NULL,
    date_voided DATETIME NOT NULL,
    void_reason VARCHAR(255) NOT NULL
)
SELECT order_group_id,
       patient_id,
       COALESCE(voided_by, @fallback_user) AS voided_by,
       COALESCE(date_voided, @fallback_date) AS date_voided,
       TRIM(CONCAT(LEFT(TRIM(SUBSTRING_INDEX(COALESCE(void_reason, ''), @tag_prefix, 1)), @max_reason_length), ' ', @tag)) AS void_reason
FROM   order_group
WHERE  voided = 1;

UPDATE order_group_attribute t
INNER JOIN _void_order_group v ON t.order_group_id = v.order_group_id
SET    t.voided = 1, t.voided_by = v.voided_by, t.date_voided = v.date_voided, t.void_reason = v.void_reason
WHERE  t.voided = 0;

UPDATE orders t
INNER JOIN _void_order_group v ON t.order_group_id = v.order_group_id AND t.patient_id = v.patient_id
SET    t.voided = 1, t.voided_by = v.voided_by, t.date_voided = v.date_voided, t.void_reason = v.void_reason
WHERE  t.voided = 0;

DROP TEMPORARY TABLE IF EXISTS _void_order_group;


-- ============================================================
-- 9. ORDERS
-- ============================================================

DROP TEMPORARY TABLE IF EXISTS _void_order;
CREATE TEMPORARY TABLE _void_order (
    order_id INT NOT NULL PRIMARY KEY,
    voided_by INT NOT NULL,
    date_voided DATETIME NOT NULL,
    void_reason VARCHAR(255) NOT NULL
)
SELECT order_id,
       COALESCE(voided_by, @fallback_user) AS voided_by,
       COALESCE(date_voided, @fallback_date) AS date_voided,
       TRIM(CONCAT(LEFT(TRIM(SUBSTRING_INDEX(COALESCE(void_reason, ''), @tag_prefix, 1)), @max_reason_length), ' ', @tag)) AS void_reason
FROM   orders
WHERE  voided = 1;

UPDATE order_attribute t
INNER JOIN _void_order v ON t.order_id = v.order_id
SET    t.voided = 1, t.voided_by = v.voided_by, t.date_voided = v.date_voided, t.void_reason = v.void_reason
WHERE  t.voided = 0;

DROP TEMPORARY TABLE IF EXISTS _void_order;


-- ============================================================
-- 10. OBS GROUPS
-- ============================================================
-- Remaining case: a voided obs group with non-voided members, in an encounter that is not voided.
-- (Obs of voided persons, patients and encounters were already voided above at any depth.)
--
-- _void_obs_group is built once per pass.  Each pass collects the voided obs groups that still
-- have non-voided members, and voids those members.  Members that are themselves obs groups are
-- voided by that UPDATE, but are not in the temp table, which is a snapshot taken before it.  So
-- their own members are only reached by the next pass, after the temp table is rebuilt.  (As in
-- the other sections, the temp table holds the void metadata of each parent.  MySQL cannot insert
-- into a temp table from a select on the same temp table, so it is rebuilt rather than appended to.)
--
-- Obs groups in SL forms nest at most 2 levels deep, so 3 passes are run.  A pass with nothing
-- left to do changes nothing.

-- Pass 1: members of obs groups that were already voided, either before this
-- script or by an earlier section.

DROP TEMPORARY TABLE IF EXISTS _void_obs_group;
CREATE TEMPORARY TABLE _void_obs_group (
    obs_id INT NOT NULL PRIMARY KEY,
    person_id INT NOT NULL,
    voided_by INT NOT NULL,
    date_voided DATETIME NOT NULL,
    void_reason VARCHAR(255) NOT NULL
)
SELECT DISTINCT p.obs_id,
       p.person_id,
       COALESCE(p.voided_by, @fallback_user) AS voided_by,
       COALESCE(p.date_voided, @fallback_date) AS date_voided,
       TRIM(CONCAT(LEFT(TRIM(SUBSTRING_INDEX(COALESCE(p.void_reason, ''), @tag_prefix, 1)), @max_reason_length), ' ', @tag)) AS void_reason
FROM   obs p
INNER JOIN obs c ON c.obs_group_id = p.obs_id
WHERE  p.voided = 1
  AND  c.voided = 0;

UPDATE obs t
INNER JOIN _void_obs_group v ON t.obs_group_id = v.obs_id AND t.person_id = v.person_id
SET    t.voided = 1, t.voided_by = v.voided_by, t.date_voided = v.date_voided, t.void_reason = v.void_reason
WHERE  t.voided = 0;

-- Pass 2: rebuild to include the obs groups voided in pass 1 (groups nested inside
-- a voided group), and void their members.

DROP TEMPORARY TABLE IF EXISTS _void_obs_group;
CREATE TEMPORARY TABLE _void_obs_group (
    obs_id INT NOT NULL PRIMARY KEY,
    person_id INT NOT NULL,
    voided_by INT NOT NULL,
    date_voided DATETIME NOT NULL,
    void_reason VARCHAR(255) NOT NULL
)
SELECT DISTINCT p.obs_id,
       p.person_id,
       COALESCE(p.voided_by, @fallback_user) AS voided_by,
       COALESCE(p.date_voided, @fallback_date) AS date_voided,
       TRIM(CONCAT(LEFT(TRIM(SUBSTRING_INDEX(COALESCE(p.void_reason, ''), @tag_prefix, 1)), @max_reason_length), ' ', @tag)) AS void_reason
FROM   obs p
INNER JOIN obs c ON c.obs_group_id = p.obs_id
WHERE  p.voided = 1
  AND  c.voided = 0;

UPDATE obs t
INNER JOIN _void_obs_group v ON t.obs_group_id = v.obs_id AND t.person_id = v.person_id
SET    t.voided = 1, t.voided_by = v.voided_by, t.date_voided = v.date_voided, t.void_reason = v.void_reason
WHERE  t.voided = 0;

-- Pass 3: rebuild to include the obs groups voided in pass 2 and void their members.
-- This is one level deeper than any nesting in SL forms, as a margin.

DROP TEMPORARY TABLE IF EXISTS _void_obs_group;
CREATE TEMPORARY TABLE _void_obs_group (
    obs_id INT NOT NULL PRIMARY KEY,
    person_id INT NOT NULL,
    voided_by INT NOT NULL,
    date_voided DATETIME NOT NULL,
    void_reason VARCHAR(255) NOT NULL
)
SELECT DISTINCT p.obs_id,
       p.person_id,
       COALESCE(p.voided_by, @fallback_user) AS voided_by,
       COALESCE(p.date_voided, @fallback_date) AS date_voided,
       TRIM(CONCAT(LEFT(TRIM(SUBSTRING_INDEX(COALESCE(p.void_reason, ''), @tag_prefix, 1)), @max_reason_length), ' ', @tag)) AS void_reason
FROM   obs p
INNER JOIN obs c ON c.obs_group_id = p.obs_id
WHERE  p.voided = 1
  AND  c.voided = 0;

UPDATE obs t
INNER JOIN _void_obs_group v ON t.obs_group_id = v.obs_id AND t.person_id = v.person_id
SET    t.voided = 1, t.voided_by = v.voided_by, t.date_voided = v.date_voided, t.void_reason = v.void_reason
WHERE  t.voided = 0;

DROP TEMPORARY TABLE IF EXISTS _void_obs_group;


-- ============================================================
-- 11. COHORT
-- ============================================================

DROP TEMPORARY TABLE IF EXISTS _void_cohort;
CREATE TEMPORARY TABLE _void_cohort (
    cohort_id INT NOT NULL PRIMARY KEY,
    voided_by INT NOT NULL,
    date_voided DATETIME NOT NULL,
    void_reason VARCHAR(255) NOT NULL
)
SELECT cohort_id,
       COALESCE(voided_by, @fallback_user) AS voided_by,
       COALESCE(date_voided, @fallback_date) AS date_voided,
       TRIM(CONCAT(LEFT(TRIM(SUBSTRING_INDEX(COALESCE(void_reason, ''), @tag_prefix, 1)), @max_reason_length), ' ', @tag)) AS void_reason
FROM   cohort
WHERE  voided = 1;

UPDATE cohort_member t
INNER JOIN _void_cohort v ON t.cohort_id = v.cohort_id
SET    t.voided = 1, t.voided_by = v.voided_by, t.date_voided = v.date_voided, t.void_reason = v.void_reason
WHERE  t.voided = 0;

DROP TEMPORARY TABLE IF EXISTS _void_cohort;
