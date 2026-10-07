set @pregnancyProgram = program('Pregnancy');
set @pregnancyProgramId = mostRecentPatientProgramId(@patientId, @pregnancyProgram);
set @pregnancyProgramStartDate = programStartDate(@pregnancyProgramId);

select concept_name(o.value_coded, 'en') as pregnancyGroup
from obs o
where o.person_id = @patientId
  and o.voided = 0
  and o.concept_id = concept_from_mapping('PIH', '21747')
  and o.obs_datetime >= @pregnancyProgramStartDate
order by o.obs_datetime desc
limit 1;
