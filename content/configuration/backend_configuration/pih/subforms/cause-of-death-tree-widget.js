// SL-1485: renders the "Cause of death" dropdown of the Death disposition
// (the disposition additionalObs with id "causeOfDeath") as the grouped radio list
// used by coreapps/markPatientDead.page: one radio per cause, and a collapsible
// +/- group for each nested set (e.g. Maternal death, Neonatal death).
// The original dropdown stays in the form, hidden, and is what gets submitted.
// Note: this file is XML-parsed as an HTML Form Entry subform, so it must not contain
// a raw ampersand or less-than character.

(function () {

    // Nested sets of PIH:20681 "Causes of death set": [{ id, label, members: [concept ids] }]
    const causeOfDeathGroups = [<lookup complexExpression="#foreach($member in $fn.getConcept('PIH:20681').setMembers)#if($member.set){ id: $member.conceptId, label: &quot;#if($member.getShortNameInLocale($locale))$member.getShortNameInLocale($locale).name#end&quot;, members: [#foreach($sub in $member.setMembers)$sub.conceptId, #end] }, #end#end"/>];

    jq(function () {
        const select = jq('#causeOfDeath select');
        if (select.length === 0) {
            return; // VIEW mode, or no disposition with a cause of death on this form
        }

        const groupsById = {};
        const groupOfMember = {};
        causeOfDeathGroups.forEach(function (group) {
            groupsById[group.id] = group;
            group.members.forEach(function (memberId) {
                groupOfMember[memberId] = group;
            });
        });

        const tree = jq('<div class="cause-of-death-tree"></div>');
        const groupContainers = {};

        function radioFor(option) {
            const input = jq('<input type="radio" name="cause-of-death-tree"/>').val(option.value);
            return jq('<div class="cause-of-death-radio"></div>')
                .append(jq('<label></label>').append(input).append(document.createTextNode(' ' + option.text)));
        }

        function setExpanded(groupId, expanded) {
            const container = groupContainers[groupId];
            container.find('.cause-of-death-subcauses').toggle(expanded);
            container.find('.cause-of-death-group-toggle span')
                .toggleClass('icon-plus', !expanded)
                .toggleClass('icon-minus', expanded);
        }

        function groupContainer(group, fallbackLabel) {
            if (!groupContainers[group.id]) {
                const toggle = jq('<a href="#" class="cause-of-death-group-toggle"></a>')
                    .append('<span class="icon-plus"></span>')
                    .append(document.createTextNode(' ' + (group.label || fallbackLabel)))
                    .on('click', function (event) {
                        event.preventDefault();
                        setExpanded(group.id, !groupContainers[group.id].find('.cause-of-death-subcauses').is(':visible'));
                    });
                groupContainers[group.id] = jq('<div class="cause-of-death-group"></div>')
                    .append(toggle)
                    .append(jq('<div class="cause-of-death-subcauses"></div>').hide());
                tree.append(groupContainers[group.id]);
            }
            return groupContainers[group.id];
        }

        // Keep HFE's option order; the set concepts themselves become group headers, not answers
        select.find('option').each(function () {
            if (!this.value) {
                return; // the empty option
            }
            if (groupsById[this.value]) {
                groupContainer(groupsById[this.value], this.text);
            } else if (groupOfMember[this.value]) {
                groupContainer(groupOfMember[this.value], '').find('.cause-of-death-subcauses').append(radioFor(this));
            } else {
                tree.append(radioFor(this));
            }
        });

        // Radios to dropdown
        tree.on('change', 'input[type=radio]', function () {
            select.val(this.value).trigger('change');
        });

        // Dropdown to radios: initial value (edit mode), and values set or cleared by other scripts
        function showSelected() {
            const value = select.val();
            tree.find('input[type=radio]').prop('checked', false);
            if (value) {
                tree.find('input[type=radio]').filter(function () { return this.value === value; }).prop('checked', true);
                if (groupOfMember[value]) {
                    setExpanded(groupOfMember[value].id, true);
                }
            }
        }
        select.on('change', showSelected);

        select.hide().after(tree);
        showSelected();
    });
})();
