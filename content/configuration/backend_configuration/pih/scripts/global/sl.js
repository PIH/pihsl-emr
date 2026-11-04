// Function to check if any checkboxes are selected
function anyCheckboxesSelected(containerSelector) {
  return jq(`${containerSelector} input[type="checkbox"]:checked`).length > 0;
}

/**
 * Updates the required attribute of the last checkbox in the given container.
 * @param {string} containerSelector - The selector for the container containing checkboxes.
 * @param {string} requiredMsgId - The selector for the element to display the required message.
 * @param {string} requiredMsg - The message to display when the last checkbox is required.
 * @returns {void} - Does nothing if containerSelector is falsy or matches no elements.
 */
function updateLastCheckboxRequired(containerSelector, requiredMsgId, requiredMsg) {
  // Bail out if the container isn't present in the DOM (e.g. an includeIf section that didn't render).
  if (!containerSelector || jq(containerSelector).length === 0) {
    return;
  }

  // Initialize the flag to keep track of the last checkbox state.
  let islastCheckbox = false;

  // Function to update the required attribute of the last checkbox
  const updateLastCheckbox = function () {

    // Select the last checkbox within the container using the given selector
    let lastCheckbox = jq(`${containerSelector} input[type="checkbox"]`).last();

    // Clear and hide the required message
    jq(requiredMsgId).text('').hide()

    // Check if any checkboxes are selected within the container using the anyCheckboxesSelected function.
    if (!anyCheckboxesSelected(containerSelector)) {

      // Display the required message and focus on the last checkbox
      jq(requiredMsgId).text(requiredMsg).show()
      if (lastCheckbox.length > 0) {
        lastCheckbox.focus()
      }
      islastCheckbox = false;

    } else {
      jq(requiredMsgId).text('').hide()
      islastCheckbox = true;
    }
    return islastCheckbox;
  }

  // Initial call to updateLastCheckboxRequired to set the required attribute on page load.
  updateLastCheckbox()

  // Attach event listeners to the checkboxes in the container to update the required attribute dynamically.
  jq(`${containerSelector} input[type="checkbox"]`).change(updateLastCheckbox)
  jq(`${containerSelector} input[type="checkbox"]`).keyup(updateLastCheckbox)

  // Add the updateLastCheckboxRequired function to the beforeSubmit array to call it before form submission.
  beforeSubmit.push(updateLastCheckbox);
}

/**
 * SL-1485: when a new HTML form encounter is saved with Disposition = Death, go to the "Mark Patient Deceased" page
 * (coreapps/markPatientDead.page) so the clinician can record the cause of death.
 *
 * The <encounterDisposition/> tag renders the Death date as an obs with id "dateOfDeath" (see
 * pih-dispositions-sierraLeone*.json) and only shows it when Death is selected, so a visible
 * #dateOfDeath means Death is the selected disposition. The encounter is saved first and the
 * ApplyDispositionAction marks the patient dead; the deceased page then pre-fills that death date.
 * The date/time entered on the form is also passed as defaultDeathDate, for forms that do not run
 * the disposition actions.
 */
(function () {
  function pad(n) {
    return ('0' + n).slice(-2);
  }

  function deathDateTime() {
    var date = typeof getValue === 'function' ? getValue('dateOfDeath.value.date') : null;
    if (!date) {
      return null;
    }
    var hours = parseInt(jq('#dateOfDeath select.hfe-hours').val(), 10) || 0;
    var minutes = parseInt(jq('#dateOfDeath select.hfe-minutes').val(), 10) || 0;
    return date + ' ' + pad(hours) + ':' + pad(minutes) + ':00';
  }

  jq(function () {
    if (typeof htmlForm === 'undefined' || typeof htmlForm.getBeforeSubmit !== 'function'
      || jq('#htmlform').length === 0 || jq('#dateOfDeath').length === 0) {
      return;
    }
    // only redirect when a new encounter is entered; editing an existing encounter (the form then has
    // a hidden "encounterId" input) keeps the normal return page, even if its disposition is Death
    if (jq('#htmlform input[name="encounterId"]').val()) {
      return;
    }

    var originalReturnUrl;

    htmlForm.getBeforeSubmit().push(function () {
      if (originalReturnUrl === undefined) {
        // read lazily: the form page sets the returnUrl after this script has run
        originalReturnUrl = htmlForm.getReturnUrl();
      }
      // O3 integration: the form runs in an iframe and posts a message to its parent instead of navigating
      if (originalReturnUrl && originalReturnUrl.indexOf('post-message:') === 0) {
        return true;
      }

      var patientId = jq('#htmlform input[name="personId"]').val();
      if (patientId && jq('#dateOfDeath').is(':visible')) {
        var params = { patientId: patientId, defaultDead: true };
        var deathDate = deathDateTime();
        if (deathDate) {
          params.defaultDeathDate = deathDate;
        }
        htmlForm.setReturnUrl(emr.pageLink('coreapps', 'markPatientDead', params));
      } else {
        // the user may have switched away from Death after a failed submission
        htmlForm.setReturnUrl(originalReturnUrl);
      }
      return true;
    });
  });
})();
