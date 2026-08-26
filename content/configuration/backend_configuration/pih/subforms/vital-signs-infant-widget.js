// Note that is currently customized with vital ranges for *infants* as defined here:
//  https://github.com/PIH/openmrs-config-pihsl/blob/master/configuration/conceptreferencerange/vitalsRanges.csv
// TODO: figure out to pull in the values from the concept reference range table.  We will also need to handle the "yellow" range which is not supported in the reference range table
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

function evaluateHeartRate(value) {
    let retValue = priorities.GREEN;
    if (value != null &amp;&amp; !(Number.isNaN(value))) {
        let numericValue = Number(value);
        if (numericValue &lt;= 79) {
            return priorities.RED;
        } else if ((numericValue &gt;= 80) &amp;&amp; (numericValue &lt;= 99)) {
            return priorities.YELLOW;
        } else if ((numericValue &gt;= 100) &amp;&amp; (numericValue &lt;= 159)) {
            return priorities.GREEN;
        } else if ((numericValue &gt;= 160) &amp;&amp; (numericValue &lt;= 174)) {
            return priorities.YELLOW;
        } else if (numericValue &gt;= 175) {
            return priorities.RED;
        }
    }
    return retValue;
}

function evaluateRespiratoryRate(value) {
    let retValue = priorities.GREEN;
    if (value != null &amp;&amp; !(Number.isNaN(value))) {
        let numericValue = Number(value);
        if ((numericValue &lt;= 25) || (numericValue &gt;= 80)) {
            return priorities.RED;
        } else if ((numericValue &gt;= 30) &amp;&amp; (numericValue &lt;= 59)) {
            return priorities.GREEN;
        } else if (((numericValue &gt;= 26) &amp;&amp; (numericValue &lt;= 29)) || ((numericValue &gt;= 60) &amp;&amp; (numericValue &lt;= 79))) {
            return priorities.YELLOW;
        }
    }
    return retValue;
}

function evaluateTemperature(value) {
    let retValue = priorities.GREEN;
    if (value != null &amp;&amp; !(Number.isNaN(value))) {
        let numericValue = Number(value);
        if ((numericValue &lt;= 36) || (numericValue &gt;= 38)) {
            return priorities.RED;
        } else if (((numericValue &gt;= 36) &amp;&amp; (numericValue &lt;= 36.5)) || ((numericValue &gt;= 37.5) &amp;&amp; (numericValue &lt;= 37.9))) {
            return priorities.YELLOW;
        }
    }
    return retValue;
}

function evaluateOxygenSaturation(value) {
    let retValue = priorities.GREEN;
    if (value != null &amp;&amp; !(Number.isNaN(value))) {
        let numericValue = Number(value);
        if (numericValue &lt;= 89) {
            return priorities.RED;
        } else if ((numericValue &gt;= 90) &amp;&amp; (numericValue &lt;= 94)) {
            return priorities.YELLOW;
        }
    }
    return retValue;
}

function evaluateGlucose(value) {
    let retValue = priorities.GREEN;
    if (value != null &amp;&amp; !(Number.isNaN(value))) {
        let numericValue = Number(value);
        if ( (numericValue &lt; 2.6) || (numericValue &gt; 8.3)) {
            return priorities.RED;
        }
    }
    return retValue;
}

let vitalsInfo = {
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
    glucose: {
        evaluate: evaluateGlucose,
        value: null
    }
};

function evaluateVitals() {
    let priority = priorities.GREEN;
    let priorityValue = 0;
    for (const obj in vitalsInfo) {
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

// Exposed globally so that form-level validation (eg. a document-wide validateForm()) can honour
// this guard instead of racing with it and re-enabling the submit button.
function drContactRequiredAndMissing() {
    return evaluateVitals().value &gt;= 2
        &amp;&amp; !jq('#contactDr input[type="checkbox"]').is(':checked');
}
window.drContactRequiredAndMissing = drContactRequiredAndMissing;

function calculatePriority() {
    let globalPriority = evaluateVitals();
    if (globalPriority.value &gt;= 2) {
        if ( drContactRequiredAndMissing() ) {
            htmlForm.disableSubmitButton();
        } else {
            htmlForm.enableSubmitButton();
        }
        jq("#confirmMsg").show();
    } else {
        htmlForm.enableSubmitButton();
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
        if (vitalsId) {
            if (vitalValue) {
                if (vitalsInfo[vitalsId] ) {
                    vitalsInfo[vitalsId].value = vitalValue;
                    let vitalsPriority = vitalsInfo[vitalsId].evaluate(vitalsInfo[vitalsId].value);
                    if (vitalsPriority &amp;&amp; colorCodingDiv) {
                        setTimeout(() => {
                            jq(colorCodingDiv).addClass(vitalsPriority.className);
                        }, 100);
                    }
                }
            } else {
                if (vitalsInfo[vitalsId] ) {
                    vitalsInfo[vitalsId].value = null;
                }
                setTimeout(() => {
                    jq(inputElement).addClass('value');
                }, 100);
            }
        }
    });

    jq(".vitals-values").find('input').on("blur", function() {
        const vitalsId = jq(this).closest("span").attr('id');
        const vitalValue = jq(this).val();
        let inputElement = jq(this);
        jq(inputElement).removeClass('legalValue');
        jq(inputElement).removeClass(classNames);
        if (vitalsId) {
            if (vitalValue) {
                if (vitalsInfo[vitalsId] ) {
                    vitalsInfo[vitalsId].value = vitalValue;

                    let vitalsPriority = vitalsInfo[vitalsId].evaluate(vitalsInfo[vitalsId].value);
                    if (vitalsPriority) {
                        setTimeout(() => {
                            jq(inputElement).removeClass('legalValue').addClass(vitalsPriority.className);
                        }, 100);
                    }
                }
            } else {
                if (vitalsInfo[vitalsId] ) {
                    vitalsInfo[vitalsId].value = null;
                }
                setTimeout(() => {
                    jq(inputElement).addClass('legalValue');
                }, 100);
            }
        }
        calculatePriority();
    });

    jq(".vitals-values").find('input').attr('autocomplete', 'off');
    jq(".vitals-values").find('input').trigger("blur");
    calculatePriority();

});