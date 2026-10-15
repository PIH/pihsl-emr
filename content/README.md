# PIH Sierra Leone Content Package

This module defines the Sierra Leone-specific [OpenMRS Initializer](https://github.com/mekomsolutions/openmrs-module-initializer) configuration. At build time, the contents of `configuration/` are assembled into a zip artifact published as `org.pih.openmrs:pihsl-content`.

This content package is merged with the shared [PIH EMR content](https://github.com/PIH/pihemr) (`org.pih.openmrs:pihemr-content`) when the distribution is built.

## Configuration Structure

Configuration files live under `configuration/`, split into two subdirectories:

| Directory | Purpose |
|---|---|
| `configuration/frontend_configuration/` | OpenMRS frontend (O3/SPA) configuration and branding (`config.json`, `logo.png`) |
| `configuration/backend_configuration/` | Everything loaded by the OpenMRS Initializer module at startup |

`backend_configuration/` contains:

| Directory | Purpose |
|---|---|
| `addresshierarchy/` | Address hierarchy entries for Sierra Leone |
| `appframework/` | App framework extension/dashboard definitions for the OpenMRS frontend |
| `appointmentservicedefinitions/` | Appointment service definitions |
| `appointmentspecialities/` | Appointment specialty definitions |
| `conceptreferencerange/` | Vitals reference range definitions (including pregnancy-specific ranges) |
| `drugs/` | Drug definitions |
| `encountertypes/` | Encounter type definitions |
| `globalproperties/` | OpenMRS global property overrides |
| `locations/` | Facility and location definitions |
| `locationtagmaps/` | Maps locations to location tags |
| `messageproperties/` | Localized message overrides |
| `patientidentifiertypes/` | Patient identifier type definitions |
| `pih/` | PIH-specific configuration (site `pih-config-*.json` profiles, HTML forms, liquibase, styles, logo) |
| `programs/` | Program definitions |
| `programworkflows/` | Program workflow definitions |
| `programworkflowstates/` | Program workflow state definitions |
| `queues/` | Queue definitions |
| `reports/` | Report descriptors |
| `roles/` | Role definitions |

## content.properties

`content.properties` provides the content package name and version (interpolated from the Maven project at build time), and defines key UUID/name constants used across the configuration:

| Property | Description |
|---|---|
| `var.patientIdentifierType.*` | UUIDs of Sierra Leone patient identifier types (`wellbodyEmrId`, `kghEmrId`, `ncdId`, `nationalId`) |
| `var.encounterType.*` | UUIDs/names of Sierra Leone-specific and shared encounter types |
| `var.concept.*` | UUIDs of concepts referenced by Sierra Leone's forms and vitals ranges — most are defined in the parent `pihemr-content` and duplicated here because constants aren't shared across content packages |
| `var.queue.*`, `var.location.*` | UUIDs of Sierra Leone-specific queues and locations |
| `var.providerGroup.*` | Comma-separated provider-role UUID lists used by app-framework privilege rules — pre-resolved from the parent's `providerRole.*` constants |
| `var.globalProperties.labworkflowowa.labResultsEncounterTypes` | Comma-separated encounter-type UUID list for the lab workflow OWA global property — pre-resolved from the parent's `encounterType.*` constants |
| `var.program.*`, `var.programWorkflow.*` | Program/program-workflow UUIDs — defined in the parent `pihemr-content`, duplicated here because this repo's configuration references them |
| `var.privilege.app_coreapps_patient_dashboard`, `var.privilege.app_coreapps_summary_dashboard` | Privilege names used by `appframework/*.json` dashboard extensions — defined in the parent `pihemr-content`, duplicated here for the same reason |
