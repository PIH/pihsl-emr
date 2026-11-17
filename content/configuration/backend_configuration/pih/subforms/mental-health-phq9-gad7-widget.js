jq(document).ready( function() {

    const valueByAnswer = {
        "Not at all": 0,
        "Several days": 1,
        "More than half the days": 2,
        "Nearly every day": 3
    };

    // returns an empty string when none of the questions are answered, so no score gets saved
    function calculateScore(questionsContainer) {
        const values = jq(questionsContainer)
            .find("select")
            .toArray()
            .map((select) => valueByAnswer[jq(select).find("option:selected").text()])
            .filter((value) => value != undefined);
        return values.length ? values.reduce((partialSum, value) => partialSum + value, 0) : "";
    }

    function updatePHQ9() {
        jq("#phq9-score input").val(calculateScore("#phq9-questions"));
    }

    function updateGAD7() {
        jq("#gad7-score input").val(calculateScore("#gad7-questions"));
    }

    function updateSuicideAlert() {
        const select = jq("#phq9-question9 select");
        if (select.val() == "" || select.find("option:selected").text() == "Not at all") {
            jq("#phq9-suicide-alert").text("");
        } else {
            jq("#phq9-suicide-alert").text("Remember to make a safety plan with this patient. If the patient has risk factors (previous attempts, little support network, substance use, etc.) and has a more developed plan and/or access to the method, confidentiality must be broken and a family member asked not to leave the patient alone for the next 24 hours.");
        }
    }

    jq("#phq9-questions").find("select").change(updatePHQ9);
    jq("#gad7-questions").find("select").change(updateGAD7);
    jq("#phq9-question9 select").change(updateSuicideAlert);

    updateSuicideAlert();

});
