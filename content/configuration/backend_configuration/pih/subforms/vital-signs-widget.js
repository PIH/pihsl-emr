
// Note that is currently customized with vital ranges for *pregnancy* patients as defined here:
//  https://github.com/PIH/openmrs-config-pihsl/blob/master/configuration/conceptreferencerange/vitalsRanges.csv
// TODO: figure out to pull in the values from the concept reference range table so that we can support other patient types.  We will also need to handle the "yellow" range which is not supported in the reference range table
// TODO: see https://pihemr.atlassian.net/browse/SL-1153

    const priorities = {
        GREEN: {
            value: 0,
            message: "Normal",
            className: "triage-label-green"
        },
        YELLOW: {
            value: 1,
            message: "Prompt",
            className: "triage-label-yellow"
        },
        ORANGE: {
            value: 2,
            message: "Urgent",
            className: "triage-label-orange"
        },
        RED: {
            value: 3,
            message: "STAT",
            className: "triage-label-red",
            triageClassName: "triage-dark-red"
        }
    };

    function getPrioritiesClasses() {
        let classNames = [];
        for (const priority in priorities) {
            classNames.push(priorities[priority].className);
            if (priorities[priority].triageClassName) {
                classNames.push(priorities[priority].triageClassName);
            }
        }
        return classNames.join(" ");
    }

    const classNames = getPrioritiesClasses();

    function evaluateBpSystolic(value) {
        let retValue = priorities.GREEN;
        if (value != null &amp;&amp; !(Number.isNaN(value))) {
            let numericValue = Number(value);
            if (numericValue &lt;= 79) {
                return priorities.RED;
            } else if ((numericValue &gt; 139) &amp;&amp; (numericValue &lt; 160)) {
                return priorities.YELLOW;
            } else if (numericValue &gt;= 160) {
                return priorities.RED;
            }
        }
        return retValue;
    }

    function evaluateBpDiastolic(value) {
        let retValue = priorities.GREEN;
        if (value != null &amp;&amp; !(Number.isNaN(value))) {
            let numericValue = Number(value);
            if (numericValue &lt;= 50) {
                return priorities.RED;
            } else if ((numericValue &gt; 89) &amp;&amp; (numericValue &lt; 110)) {
                return priorities.YELLOW;
            } else if (numericValue &gt;= 110) {
                return priorities.RED;
            }
        }
        return retValue;
    }

    function evaluateHeartRate(value) {
        let retValue = priorities.GREEN;
        if (value != null &amp;&amp; !(Number.isNaN(value))) {
            let numericValue = Number(value);
            if (numericValue &lt;= 39) {
                return priorities.RED;
            } if (numericValue &lt; 50) {
                return priorities.ORANGE;
            } else if ((numericValue &gt; 119) &amp;&amp; (numericValue &lt; 131)) {
                return priorities.ORANGE;
            } else if (numericValue &gt;= 131) {
                return priorities.RED;
            }
        }
        return retValue;
    }

    function evaluateRespiratoryRate(value) {
        let retValue = priorities.GREEN;
        if (value != null &amp;&amp; !(Number.isNaN(value))) {
            let numericValue = Number(value);
            if (numericValue &lt; 12) {
                return priorities.ORANGE;
            } else if (numericValue &gt; 26) {
                return priorities.ORANGE;
            }
        }
        return retValue;
    }

    function evaluateTemperature(value) {
        let retValue = priorities.GREEN;
        if (value != null &amp;&amp; !(Number.isNaN(value))) {
            let numericValue = Number(value);
            if ((numericValue &lt;= 34.9) || (numericValue &gt;= 40)) {
                return priorities.RED;
            } else if ((numericValue &gt;= 38) &amp;&amp; (numericValue &lt;= 38.2)) {
                return priorities.YELLOW;
            } else if ((numericValue &gt; 38.2) &amp;&amp; (numericValue &lt; 40)) {
                return priorities.ORANGE;
            }
        }
        return retValue;
    }

    function evaluateFhr(value) {
        let retValue = priorities.GREEN;
        if (value != null &amp;&amp; !(Number.isNaN(value))) {
            let numericValue = Number(value);
            if ((numericValue &lt;= 109 ) || (numericValue &gt;= 161)) {
                return priorities.RED;
            }
        }
        return retValue;
    }

    function evaluateOxygenSaturation(value) {
        let retValue = priorities.GREEN;
        if (value != null &amp;&amp; !(Number.isNaN(value))) {
            let numericValue = Number(value);
            if (numericValue &lt;= 93) {
                return priorities.RED;
            } else if (numericValue &lt; 96) {
                return priorities.ORANGE;
            }
        }
        return retValue;
    }

    // SL-1520: Mean arterial pressure, calculated from BP (only on forms that pass the #map field, eg. inpatientVitals.xml)
    function evaluateMap(value) {
        if (value != null &amp;&amp; value !== '' &amp;&amp; !(Number.isNaN(Number(value))) &amp;&amp; Number(value) &lt; 65) {
            return priorities.RED;
        }
        return priorities.GREEN;
    }

    // MAP = DBP + (SBP - DBP) / 3, rounded to a whole number (PIH:20662 allows no decimals); empty unless both BP values are numbers
    function calculateMap() {
        const systolic = jq('#bp_systolic input').val();
        const diastolic = jq('#bp_diastolic input').val();
        if (!systolic || !diastolic || Number.isNaN(Number(systolic)) || Number.isNaN(Number(diastolic))) {
            return '';
        }
        return String(Math.round(Number(diastolic) + (Number(systolic) - Number(diastolic)) / 3));
    }

    // Sets the read-only MAP field, colors it and recalculates the priority. Not via trigger('blur'): that would also run
    // the HFE checkNumber() onblur, which resets the input's classes.
    function updateMap() {
        const mapInput = jq('#map input');
        if (mapInput.length) {
            mapInput.val(calculateMap());
            colorVitalInput(mapInput);
            calculatePriority();
        }
    }

    // Stores the input's value in vitalsInfo and colors it by its priority (white legalValue when empty). The class is set
    // after a short delay, so that it is applied after the HFE checkNumber() onblur; the delayed call removes every
    // priority class first, so when an input is evaluated several times in a row (eg. MAP on each BP change) only the
    // latest evaluation's color stays.
    function colorVitalInput(inputElement) {
        const vitalsId = jq(inputElement).closest("span").attr('id');
        jq(inputElement).removeClass('legalValue').removeClass(classNames);
        if (!vitalsId || !vitalsInfo[vitalsId]) {
            return;
        }
        const vitalValue = jq(inputElement).val();
        vitalsInfo[vitalsId].value = vitalValue ? vitalValue : null;
        const className = vitalValue ? vitalsInfo[vitalsId].evaluate(vitalValue).className : 'legalValue';
        setTimeout(() => {
            jq(inputElement).removeClass('legalValue').removeClass(classNames).addClass(className);
        }, 100);
    }

    let vitalsInfo = {
        bp_systolic: {
            evaluate: evaluateBpSystolic,
            value: null
        },
        bp_diastolic: {
            evaluate: evaluateBpDiastolic,
            value: null
        },
        // not part of the summed score: a red MAP only requires the "contact doctor" confirmation (see contactDrRequired)
        map: {
            evaluate: evaluateMap,
            value: null,
            scored: false
        },
        heart_rate: {
            evaluate: evaluateHeartRate,
            value: null
        },
        respiratory_rate: {
            evaluate: evaluateRespiratoryRate,
            value: null
        },
        temperature_c: {
            evaluate: evaluateTemperature,
            value: null
        },
        o2_sat: {
            evaluate: evaluateOxygenSaturation,
            value: null
        },
        fhr: {
            evaluate: evaluateFhr,
            value: null
        },
        fhr_second: {
            evaluate: evaluateFhr,
            value: null
        }
    };

    function evaluateVitals() {
        let priority = priorities.GREEN;
        let priorityValue = 0;
        for (const obj in vitalsInfo) {
            if (vitalsInfo[obj].scored === false) {
                continue;
            }
            let vitalValue = vitalsInfo[obj].value;
            let evalPriority = vitalsInfo[obj].evaluate(vitalValue);
            priorityValue = priorityValue + evalPriority.value;
        }
        switch ( priorityValue ) {
            case 0:
                priority = priorities.GREEN;
                break;
            case 1:
                priority = priorities.YELLOW;
                break;
            case 2:
                priority = priorities.ORANGE;
                break;
                default:
                  priority = priorities.RED;
        }

        return priority;
    }

    // Exposed globally so that form-level validation (eg. the document-wide validateForm() in triage.xml)
    // can honour this guard instead of racing with it and re-enabling the submit button.
    // The doctor must be contacted when the summed score is 2 or more, or when MAP is below 65 (SL-1520)
    function contactDrRequired() {
        return evaluateVitals().value &gt;= 2
            || evaluateMap(vitalsInfo.map.value) === priorities.RED;
    }

    function drContactRequiredAndMissing() {
        return contactDrRequired()
            &amp;&amp; !jq('#contactDr input[type="checkbox"]').is(':checked');
    }
    window.drContactRequiredAndMissing = drContactRequiredAndMissing;

    // htmlForm (and the Save button) only exist when entering or editing the form; in view mode (eg. on the
    // visit page) calling it would throw and stop the scripts that follow, such as the order widget's
    function setSubmitButtonEnabled(enabled) {
        if (typeof htmlForm === "undefined") {
            return;
        }
        if (enabled) {
            htmlForm.enableSubmitButton();
        } else {
            htmlForm.disableSubmitButton();
        }
    }

    function calculatePriority() {
        let globalPriority = evaluateVitals();
        if (contactDrRequired()) {
            setSubmitButtonEnabled(!drContactRequiredAndMissing());
            jq("#confirmMsg").show();
        } else {
            setSubmitButtonEnabled(true);
            jq("#confirmMsg").hide();
        }
        if (typeof calculateTriagePriority === "function") {
            globalPriority = calculateTriagePriority();
        }
        jq('#sticky').removeClass(classNames).addClass(globalPriority.triageClassName ? globalPriority.triageClassName : globalPriority.className);
        jq('#statusMessage').text(globalPriority.message);
        return globalPriority;
    }

jq(document).ready( function() {

    <ifMode mode="VIEW" include="false">
        //Postnatal Ward,  MCOE Post Op ward, Kangaroo Care, Quiet Ward
        const noFhrLocations = ["ff0d5e73-3fe0-437f-90ba-7d605ac03dc0", "a39ec469-d1f9-11f0-9d46-169316be6a48", "81080213-d1f9-11f0-9d46-169316be6a48", "28660b7f-3450-4b86-b840-9670ec68235f"];
        const locationUuid = '<lookup complexExpression="$sessionContext.sessionLocation.uuid"/>';
        const isFound = noFhrLocations.some( location => location.toLowerCase() === locationUuid.toLowerCase());
        if (isFound) {
            jq("#fhrDiv").hide()};

    </ifMode>

    jq('#contactDr input[type="checkbox"]').on('change', function() {
        calculatePriority();
    });

    // the following calculations happen only in the view mode
    jq(".vitals-values").find('.value').each( function() {
        const vitalsId = jq(this).parent("span").attr('id');
        const vitalValue = jq(this).text();
        let inputElement = jq(this);
        jq(inputElement).removeClass('value');
        jq(inputElement).removeClass(classNames);
        let colorCodingDiv = jq("#" + vitalsId).closest(".colorCodingValue");
        if (vitalsId &amp;&amp; vitalsInfo[vitalsId]) {
            if (vitalValue) {
                vitalsInfo[vitalsId].value = vitalValue;
                let vitalsPriority = vitalsInfo[vitalsId].evaluate(vitalsInfo[vitalsId].value);
                if ( vitalsPriority &amp;&amp; colorCodingDiv) {
                    setTimeout(() => {
                        jq(colorCodingDiv).addClass(vitalsPriority.className);
                    }, 100);
                }
            } else {
                vitalsInfo[vitalsId].value = null;
                setTimeout(() => {
                    jq(inputElement).addClass('value');
                }, 100);
            }
        }
    });

    jq(".vitals-values").find('input').on("blur", function() {
        colorVitalInput(jq(this));
        calculatePriority();
    });

    // MAP is calculated, never typed: read-only (still submitted, unlike disabled) and skipped when tabbing
    jq('#map input').attr('readonly', 'readonly').attr('tabindex', '-1');
    jq('#bp_systolic input, #bp_diastolic input').on('blur', updateMap);

    jq(".vitals-values").find('input').attr('autocomplete', 'off');
    jq(".vitals-values").find('input').trigger("blur");
    calculatePriority();

});