-- set @encounterId = 'some-encounter-uuid';

set @locale = global_property_value('default_locale', 'en');

select
    coalesce(drugName(do2.drug_inventory_id), do2.drug_non_coded) as drug_name,
    do2.dose                                               as dose,
    concept_name(do2.dose_units, @locale)                  as dose_units,
    concept_name(do2.route, @locale)                       as route,
    concept_name(of2.concept_id, @locale)                  as frequency,
    do2.duration                                           as duration,
    concept_name(do2.duration_units, @locale)              as duration_units
from orders o
join drug_order do2 on do2.order_id = o.order_id
left join order_frequency of2 on of2.order_frequency_id = do2.frequency
join encounter e on e.encounter_id = o.encounter_id
where e.uuid = @encounterId
  and o.order_action != 'DISCONTINUE'
  and o.voided = 0
order by o.date_activated;
