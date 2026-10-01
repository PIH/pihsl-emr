-- ============================================================
-- OpenMRS Cascade Void — v4
-- ============================================================
-- Cascades voids to all child records of voided patients.
--
-- Starting point:
--   Step 0 first promotes any voided person → voided patient,
--   so that the rest of the script only needs to look at
--   patient.voided = 1 as its single anchor.
--
--   person records are never voided by this script.
--   A person may still be active as a provider or user even
--   when their patient record is voided.
--
-- Architecture: each dependency temp table is built immediately
-- before the statements that use it. Tables are dropped at the
-- end of each section so names can be reused safely if this
-- script is ever run more than once in the same session.
--
-- Sections:
--   0. Promote voided persons → void their patient record
--   1. Patient level   (_vp)
--   2. Visit level     (_vv)
--   3. Encounter level (_ve)
--   4. Order level     (_vo)
--   5. Obs level       (_vob)
--
-- No transaction wrapper. Run against a backup or non-production
-- instance before applying to production.
-- ============================================================

SET @voiding_user_id = 1;
SET @void_reason     = 'Cascade void: parent patient record was previously voided';
SET @now             = NOW();


-- ============================================================
-- 0. PROMOTE VOIDED PERSONS → VOID THEIR PATIENT RECORD
-- ============================================================
-- If person.voided = 1 but patient.voided = 0, close that gap now.
-- After this step, patient.voided = 1 is the single cascade anchor.

UPDATE patient pt
INNER JOIN person pr ON pt.patient_id = pr.person_id
SET    pt.voided = 1, pt.voided_by = @voiding_user_id,
       pt.date_voided = @now, pt.void_reason = @void_reason
WHERE  pr.voided = 1
  AND  pt.voided = 0;


-- ============================================================
-- 1. PATIENT LEVEL
-- ============================================================

DROP TEMPORARY TABLE IF EXISTS _vp;
CREATE TEMPORARY TABLE _vp (person_id INT NOT NULL PRIMARY KEY)
SELECT patient_id AS person_id
FROM   patient
WHERE  voided = 1;

-- person_name
UPDATE person_name pn
INNER JOIN _vp v ON pn.person_id = v.person_id
SET    pn.voided = 1, pn.voided_by = @voiding_user_id,
       pn.date_voided = @now, pn.void_reason = @void_reason
WHERE  pn.voided = 0;

-- person_address
UPDATE person_address pa
INNER JOIN _vp v ON pa.person_id = v.person_id
SET    pa.voided = 1, pa.voided_by = @voiding_user_id,
       pa.date_voided = @now, pa.void_reason = @void_reason
WHERE  pa.voided = 0;

-- person_attribute
UPDATE person_attribute pa
INNER JOIN _vp v ON pa.person_id = v.person_id
SET    pa.voided = 1, pa.voided_by = @voiding_user_id,
       pa.date_voided = @now, pa.void_reason = @void_reason
WHERE  pa.voided = 0;

-- relationship — person_a side
-- (two separate updates: MySQL cannot reference the same temp table
--  twice in one query)
UPDATE relationship r
INNER JOIN _vp v ON r.person_a = v.person_id
SET    r.voided = 1, r.voided_by = @voiding_user_id,
       r.date_voided = @now, r.void_reason = @void_reason
WHERE  r.voided = 0;

-- relationship — person_b side
UPDATE relationship r
INNER JOIN _vp v ON r.person_b = v.person_id
SET    r.voided = 1, r.voided_by = @voiding_user_id,
       r.date_voided = @now, r.void_reason = @void_reason
WHERE  r.voided = 0;

-- patient_identifier
UPDATE patient_identifier pi
INNER JOIN _vp v ON pi.patient_id = v.person_id
SET    pi.voided = 1, pi.voided_by = @voiding_user_id,
       pi.date_voided = @now, pi.void_reason = @void_reason
WHERE  pi.voided = 0;

-- allergy
UPDATE allergy a
INNER JOIN _vp v ON a.patient_id = v.person_id
SET    a.voided = 1, a.voided_by = @voiding_user_id,
       a.date_voided = @now, a.void_reason = @void_reason
WHERE  a.voided = 0;

-- cohort_member
UPDATE cohort_member cm
INNER JOIN _vp v ON cm.patient_id = v.person_id
SET    cm.voided = 1, cm.voided_by = @voiding_user_id,
       cm.date_voided = @now, cm.void_reason = @void_reason
WHERE  cm.voided = 0;

-- patient_state (via patient_program — void before patient_program)
UPDATE patient_state ps
INNER JOIN patient_program pp ON ps.patient_program_id = pp.patient_program_id
INNER JOIN _vp v              ON pp.patient_id         = v.person_id
SET    ps.voided = 1, ps.voided_by = @voiding_user_id,
       ps.date_voided = @now, ps.void_reason = @void_reason
WHERE  ps.voided = 0;

-- patient_program_attribute (via patient_program — void before patient_program)
UPDATE patient_program_attribute ppa
INNER JOIN patient_program pp ON ppa.patient_program_id = pp.patient_program_id
INNER JOIN _vp v              ON pp.patient_id          = v.person_id
SET    ppa.voided = 1, ppa.voided_by = @voiding_user_id,
       ppa.date_voided = @now, ppa.void_reason = @void_reason
WHERE  ppa.voided = 0;

-- patient_program
UPDATE patient_program pp
INNER JOIN _vp v ON pp.patient_id = v.person_id
SET    pp.voided = 1, pp.voided_by = @voiding_user_id,
       pp.date_voided = @now, pp.void_reason = @void_reason
WHERE  pp.voided = 0;

-- patient_appointment_audit (via patient_appointment — void before patient_appointment)
UPDATE patient_appointment_audit paa
INNER JOIN patient_appointment pa ON paa.appointment_id = pa.patient_appointment_id
INNER JOIN _vp v                  ON pa.patient_id      = v.person_id
SET    paa.voided = 1, paa.voided_by = @voiding_user_id,
       paa.date_voided = @now, paa.void_reason = @void_reason
WHERE  paa.voided = 0;

-- patient_appointment
UPDATE patient_appointment pa
INNER JOIN _vp v ON pa.patient_id = v.person_id
SET    pa.voided = 1, pa.voided_by = @voiding_user_id,
       pa.date_voided = @now, pa.void_reason = @void_reason
WHERE  pa.voided = 0;

-- appointmentscheduling_appointment
UPDATE appointmentscheduling_appointment asa
INNER JOIN _vp v ON asa.patient_id = v.person_id
SET    asa.voided = 1, asa.voided_by = @voiding_user_id,
       asa.date_voided = @now, asa.void_reason = @void_reason
WHERE  asa.voided = 0;

-- appointmentscheduling_appointment_request
UPDATE appointmentscheduling_appointment_request asar
INNER JOIN _vp v ON asar.patient_id = v.person_id
SET    asar.voided = 1, asar.voided_by = @voiding_user_id,
       asar.date_voided = @now, asar.void_reason = @void_reason
WHERE  asar.voided = 0;

-- queue_entry
UPDATE queue_entry qe
INNER JOIN _vp v ON qe.patient_id = v.person_id
SET    qe.voided = 1, qe.voided_by = @voiding_user_id,
       qe.date_voided = @now, qe.void_reason = @void_reason
WHERE  qe.voided = 0;

-- conditions (has direct patient_id)
UPDATE conditions c
INNER JOIN _vp v ON c.patient_id = v.person_id
SET    c.voided = 1, c.voided_by = @voiding_user_id,
       c.date_voided = @now, c.void_reason = @void_reason
WHERE  c.voided = 0;

-- medication_dispense (has direct patient_id)
UPDATE medication_dispense md
INNER JOIN _vp v ON md.patient_id = v.person_id
SET    md.voided = 1, md.voided_by = @voiding_user_id,
       md.date_voided = @now, md.void_reason = @void_reason
WHERE  md.voided = 0;

DROP TEMPORARY TABLE IF EXISTS _vp;


-- ============================================================
-- 2. VISIT LEVEL
-- ============================================================

DROP TEMPORARY TABLE IF EXISTS _vv;
CREATE TEMPORARY TABLE _vv (visit_id INT NOT NULL PRIMARY KEY)
SELECT v.visit_id
FROM   visit v
INNER JOIN (SELECT patient_id AS person_id FROM patient WHERE voided = 1) p
        ON v.patient_id = p.person_id;

-- visit_attribute
UPDATE visit_attribute va
INNER JOIN _vv v ON va.visit_id = v.visit_id
SET    va.voided = 1, va.voided_by = @voiding_user_id,
       va.date_voided = @now, va.void_reason = @void_reason
WHERE  va.voided = 0;

-- visit
UPDATE visit vi
INNER JOIN _vv v ON vi.visit_id = v.visit_id
SET    vi.voided = 1, vi.voided_by = @voiding_user_id,
       vi.date_voided = @now, vi.void_reason = @void_reason
WHERE  vi.voided = 0;

DROP TEMPORARY TABLE IF EXISTS _vv;


-- ============================================================
-- 3. ENCOUNTER LEVEL
-- ============================================================

DROP TEMPORARY TABLE IF EXISTS _ve;
CREATE TEMPORARY TABLE _ve (encounter_id INT NOT NULL PRIMARY KEY)
SELECT e.encounter_id
FROM   encounter e
WHERE  e.patient_id IN (SELECT patient_id FROM patient WHERE voided = 1)
    OR e.visit_id   IN (SELECT v.visit_id
                        FROM   visit v
                        INNER JOIN (SELECT patient_id FROM patient WHERE voided = 1) p
                                ON v.patient_id = p.patient_id);

-- encounter_provider
UPDATE encounter_provider ep
INNER JOIN _ve v ON ep.encounter_id = v.encounter_id
SET    ep.voided = 1, ep.voided_by = @voiding_user_id,
       ep.date_voided = @now, ep.void_reason = @void_reason
WHERE  ep.voided = 0;

-- diagnosis_attribute (2-hop: via encounter_diagnosis)
UPDATE diagnosis_attribute da
INNER JOIN encounter_diagnosis ed ON da.diagnosis_id = ed.diagnosis_id
INNER JOIN _ve v                  ON ed.encounter_id = v.encounter_id
SET    da.voided = 1, da.voided_by = @voiding_user_id,
       da.date_voided = @now, da.void_reason = @void_reason
WHERE  da.voided = 0;

-- encounter_diagnosis
UPDATE encounter_diagnosis ed
INNER JOIN _ve v ON ed.encounter_id = v.encounter_id
SET    ed.voided = 1, ed.voided_by = @voiding_user_id,
       ed.date_voided = @now, ed.void_reason = @void_reason
WHERE  ed.voided = 0;

-- emrapi_procedure
UPDATE emrapi_procedure ep
INNER JOIN _ve v ON ep.encounter_id = v.encounter_id
SET    ep.voided = 1, ep.voided_by = @voiding_user_id,
       ep.date_voided = @now, ep.void_reason = @void_reason
WHERE  ep.voided = 0;

-- bed_patient_assignment_map
UPDATE bed_patient_assignment_map bpam
INNER JOIN _ve v ON bpam.encounter_id = v.encounter_id
SET    bpam.voided = 1, bpam.voided_by = @voiding_user_id,
       bpam.date_voided = @now, bpam.void_reason = @void_reason
WHERE  bpam.voided = 0;

-- fhir_diagnostic_report
UPDATE fhir_diagnostic_report fdr
INNER JOIN _ve v ON fdr.encounter_id = v.encounter_id
SET    fdr.voided = 1, fdr.voided_by = @voiding_user_id,
       fdr.date_voided = @now, fdr.void_reason = @void_reason
WHERE  fdr.voided = 0;

-- order_group_attribute (2-hop: via order_group)
UPDATE order_group_attribute oga
INNER JOIN order_group og ON oga.order_group_id = og.order_group_id
INNER JOIN _ve v          ON og.encounter_id    = v.encounter_id
SET    oga.voided = 1, oga.voided_by = @voiding_user_id,
       oga.date_voided = @now, oga.void_reason = @void_reason
WHERE  oga.voided = 0;

-- order_group
UPDATE order_group og
INNER JOIN _ve v ON og.encounter_id = v.encounter_id
SET    og.voided = 1, og.voided_by = @voiding_user_id,
       og.date_voided = @now, og.void_reason = @void_reason
WHERE  og.voided = 0;

-- encounter
UPDATE encounter e
INNER JOIN _ve v ON e.encounter_id = v.encounter_id
SET    e.voided = 1, e.voided_by = @voiding_user_id,
       e.date_voided = @now, e.void_reason = @void_reason
WHERE  e.voided = 0;

DROP TEMPORARY TABLE IF EXISTS _ve;


-- ============================================================
-- 4. ORDER LEVEL
-- ============================================================

DROP TEMPORARY TABLE IF EXISTS _vo;
CREATE TEMPORARY TABLE _vo (order_id INT NOT NULL PRIMARY KEY)
SELECT o.order_id
FROM   orders o
WHERE  o.patient_id   IN (SELECT patient_id FROM patient WHERE voided = 1)
    OR o.encounter_id IN (SELECT e.encounter_id
                          FROM   encounter e
                          WHERE  e.patient_id IN (SELECT patient_id FROM patient WHERE voided = 1));

-- order_attribute
UPDATE order_attribute oa
INNER JOIN _vo v ON oa.order_id = v.order_id
SET    oa.voided = 1, oa.voided_by = @voiding_user_id,
       oa.date_voided = @now, oa.void_reason = @void_reason
WHERE  oa.voided = 0;

-- orders
UPDATE orders o
INNER JOIN _vo v ON o.order_id = v.order_id
SET    o.voided = 1, o.voided_by = @voiding_user_id,
       o.date_voided = @now, o.void_reason = @void_reason
WHERE  o.voided = 0;

DROP TEMPORARY TABLE IF EXISTS _vo;


-- ============================================================
-- 5. OBS LEVEL
-- ============================================================

DROP TEMPORARY TABLE IF EXISTS _vob;
CREATE TEMPORARY TABLE _vob (obs_id INT NOT NULL PRIMARY KEY)
SELECT ob.obs_id
FROM   obs ob
WHERE  ob.person_id    IN (SELECT patient_id FROM patient WHERE voided = 1)
    OR ob.encounter_id IN (SELECT e.encounter_id
                           FROM   encounter e
                           WHERE  e.patient_id IN (SELECT patient_id FROM patient WHERE voided = 1));

-- child obs (their obs_group_id points to a voided obs in _vob)
-- Note: handles one level of obs_group nesting. If groups nest deeper,
-- repeat this UPDATE before the final obs void below.
UPDATE obs o
INNER JOIN _vob v ON o.obs_group_id = v.obs_id
SET    o.voided = 1, o.voided_by = @voiding_user_id,
       o.date_voided = @now, o.void_reason = @void_reason
WHERE  o.voided = 0;

-- obs (group obs and standalone obs)
UPDATE obs o
INNER JOIN _vob v ON o.obs_id = v.obs_id
SET    o.voided = 1, o.voided_by = @voiding_user_id,
       o.date_voided = @now, o.void_reason = @void_reason
WHERE  o.voided = 0;

DROP TEMPORARY TABLE IF EXISTS _vob;
