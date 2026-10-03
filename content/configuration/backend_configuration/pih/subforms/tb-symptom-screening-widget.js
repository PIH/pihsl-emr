jq(document).ready( function() {

    const tbSymptomPresent = `<lookup expression="fn.getConcept('PIH:11563').id"/>`;

    function evaluateTBScreening() {
        let isSymptomPresent = true;
        jq(".tbScreen").find("input[type='radio'][value='" + tbSymptomPresent + "']").each(function (index) {
            isSymptomPresent = isSymptomPresent &amp;&amp; this.checked;
        });
        return isSymptomPresent;
    }

    function evaluateIsolationStatus() {
        let status = evaluateTBScreening();
        if (status) {
            jq("#isolationMsg").show();
        } else {
            jq("#isolationMsg").hide();
        }
        return status;
    }

    jq(".isolation").find("input[type='checkbox']").change(function (event) {
        evaluateIsolationStatus();
    });

    jq(".tbScreen").find("input[type='radio']").change(function (event) {
        evaluateIsolationStatus();
    });

    evaluateIsolationStatus();

});
