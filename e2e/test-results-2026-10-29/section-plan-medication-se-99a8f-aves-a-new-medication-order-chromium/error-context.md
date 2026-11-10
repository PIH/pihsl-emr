# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: section-plan-medication/section-plan-medication.spec.ts >> section-plan-medication >> saves a new medication order
- Location: specs/section-plan-medication/section-plan-medication.spec.ts:60:7

# Error details

```
TimeoutError: locator.click: Timeout 10000ms exceeded.
Call log:
  - waiting for locator('.ui-autocomplete .ui-menu-item').first()
    - locator resolved to <li role="presentation" class="ui-menu-item">…</li>
  - attempting click action
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling
    - <div class="order-field-label order-frequency"></div> from <div id="body-wrapper">…</div> subtree intercepts pointer events
  - retrying click action
    - waiting for element to be visible, enabled and stable
    - element is not visible
  - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is not visible
    - retrying click action
      - waiting 100ms
    19 × waiting for element to be visible, enabled and stable
       - element is not visible
     - retrying click action
       - waiting 500ms

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - banner [ref=e2]:
    - navigation [ref=e3]:
      - link [ref=e5] [cursor=pointer]:
        - /url: /openmrs
      - list [ref=e8]:
        - listitem [ref=e9]:
          - link " cho" [ref=e10] [cursor=pointer]:
            - /url: /openmrs/authenticationui/account/userAccount.page
            - generic [ref=e11]: 
            - text: cho
        - listitem [ref=e12]:
          - link " MCH OPD" [ref=e13] [cursor=pointer]:
            - /url: /openmrs/pihapps/loginLocation.page
            - generic [ref=e14]: 
            - text: MCH OPD
        - listitem [ref=e15]:
          - link "Logout " [ref=e16] [cursor=pointer]:
            - /url: /openmrs/appui/header/logout.action?successUrl=openmrs
            - text: Logout
            - generic [ref=e17]: 
  - list [ref=e18]:
    - listitem [ref=e19]:
      - link "" [ref=e20] [cursor=pointer]:
        - /url: /openmrs/index.htm
    - listitem [ref=e22]:
      - generic [ref=e23]: 
      - link "Tester, AutoPlanMed" [ref=e24] [cursor=pointer]:
        - /url: /openmrs/referenceapplication/home.page
    - listitem [ref=e25]:
      - generic [ref=e26]: 
      - text: "Edit: Plan Medication"
  - generic [ref=e27]:
    - generic:  
    - generic:  
    - generic [ref=e28]:
      - generic [ref=e29]:
        - generic [ref=e31]:
          - heading [level=1] [ref=e33] [cursor=pointer]:
            - generic [ref=e34]:
              - text: Tester,
              - emphasis [ref=e35]: Surname
            - generic [ref=e36]:
              - text: AutoPlanMed
              - emphasis [ref=e37]: Given Name
          - generic [ref=e38]: Female 36 year(s) ( 01 Jan 1990)
          - link "Show Contact Info " [ref=e40] [cursor=pointer]:
            - /url: "#"
            - text: Show Contact Info
            - generic [ref=e41]: 
            - text: 
        - generic [ref=e42]:
          - generic [ref=e43]:
            - emphasis [ref=e44]: KGH EMR ID
            - generic [ref=e45]: E2E-1793305320932-4642
          - generic [ref=e46]:
            - emphasis [ref=e47]: Wellbody EMR ID
            - link "" [ref=e49] [cursor=pointer]:
              - /url: "#4"
          - generic [ref=e51]:
            - emphasis [ref=e52]: NCD ID
            - link "" [ref=e54] [cursor=pointer]:
              - /url: "#6"
          - generic [ref=e56]:
            - emphasis [ref=e57]: National ID Number
            - link "" [ref=e59] [cursor=pointer]:
              - /url: "#7"
      - generic [ref=e61]:
        - generic [ref=e62]: 
        - text: KGH
      - generic [ref=e64]:
        - generic [ref=e65]: 
        - text: 29 Oct 2026 4:22 PM
        - generic [ref=e66]: (Active)
      - generic [ref=e69]:
        - heading "Plan" [level=1] [ref=e70]
        - group "Counseling and Testing (CT)" [ref=e71]:
          - paragraph [ref=e74]:
            - text: "Counselled for HIV testing:"
            - radio "yes" [ref=e75]
            - text: "yes"
            - radio "no" [ref=e76]
            - text: "no"
            - radio "unknown" [ref=e77]
            - text: unknown
        - group "Medication orders" [ref=e78]:
          - generic [ref=e82]:
            - generic [ref=e83]:
              - generic [ref=e84]:
                - generic [ref=e85]: Active Orders
                - generic [ref=e86]: No Orders
              - generic [ref=e87]:
                - generic [ref=e88]: New Orders
                - generic [ref=e90]:
                  - generic [ref=e92]:
                    - generic [ref=e93]: Medication
                    - generic [ref=e94]:
                      - textbox [active] [ref=e95]: Acetylsalicylic
                      - generic [ref=e96] [cursor=pointer]: Clear
                  - generic [ref=e97]:
                    - generic [ref=e98]:
                      - generic [ref=e99]: Dose
                      - textbox [ref=e101]
                    - combobox [ref=e105]:
                      - option
                      - option "Ampule(s)"
                      - option "Application"
                      - option "Bar"
                      - option "Biscuit wafer"
                      - option "Bottle"
                      - option "Can"
                      - option "Capsule"
                      - option "Container"
                      - option "Drop"
                      - option "Enema"
                      - option "Fluid ounce"
                      - option "Gallon"
                      - option "Gram"
                      - option "Gum"
                      - option "Implant"
                      - option "Inch"
                      - option "International units"
                      - option "Intra uterine device (IUD)"
                      - option "Kilogram"
                      - option "Liter"
                      - option "Lozenge"
                      - option "Milliequivalent"
                      - option "Metric drop"
                      - option "Microgram"
                      - option "Milligram"
                      - option "Milligram per square meter"
                      - option "Milliliter"
                      - option "Million units"
                      - option "Nebulizer"
                      - option "Pad"
                      - option "Patch"
                      - option "Pint"
                      - option "Puff"
                      - option "Pump"
                      - option "Ring pessary"
                      - option "Sachet"
                      - option "Scoopful"
                      - option "Spray"
                      - option "Suppository"
                      - option "Syringe"
                      - option "Tablet" [selected]
                      - option "Tablespoon"
                      - option "Teaspoon"
                      - option "Tube"
                      - option "Unit"
                      - option "Vial"
                    - combobox [ref=e109]:
                      - option [selected]
                      - option "OD (once daily)"
                      - option "OM (morning)"
                      - option "ON (night)"
                      - option "BID (twice daily)"
                      - option "TID (thrice daily)"
                      - option "QID (four times daily)"
                      - option "5D (five daily)"
                      - option "6D (six daily)"
                      - option "7D (seven daily)"
                      - option "8D (eight daily)"
                      - option "9D (nine daily)"
                      - option "Q2H (every 2 hours)"
                      - option "Q3H (every 3 hours)"
                      - option "Q4H (every 4 hours)"
                      - option "Q6H (every 6 hours)"
                      - option "Q12H (every 12 hours)"
                      - option "PRN (as required)"
                      - option "STAT (immediately)"
                      - option "Weekly"
                    - combobox [ref=e113]:
                      - option
                      - option "Oral" [selected]
                      - option "IV"
                      - option "IM"
                      - option "Subcutaneous"
                      - option "Topical"
                      - option "Sublingual"
                      - option "Optical"
                      - option "Ear(s)"
                      - option "Inhalation"
                      - option "Intra-articular"
                      - option "Intra-rectal"
                      - option "Intra-vaginal"
                  - generic [ref=e114]:
                    - generic [ref=e115]: Starting
                    - generic [ref=e118]:
                      - generic [ref=e119]: For
                      - textbox [ref=e121]
                    - combobox [ref=e125]:
                      - option
                      - option "Hours"
                      - option "Days" [selected]
                      - option "Months"
                      - option "Weeks"
                  - generic [ref=e126]:
                    - generic [ref=e127]:
                      - generic [ref=e128]: Quantity
                      - textbox [ref=e130]
                    - combobox [ref=e134]:
                      - option
                      - option "Bag"
                      - option "Box"
                      - option "Cartridge"
                      - option "Dose pack"
                      - option "Each"
                      - option "Inhaler"
                      - option "Kit"
                      - option "Packets"
                      - option "Ampule(s)"
                      - option "Application"
                      - option "Bar"
                      - option "Biscuit wafer"
                      - option "Bottle"
                      - option "Can"
                      - option "Capsule"
                      - option "Container"
                      - option "Drop"
                      - option "Enema"
                      - option "Fluid ounce"
                      - option "Gallon"
                      - option "Gram"
                      - option "Gum"
                      - option "Implant"
                      - option "Inch"
                      - option "International units"
                      - option "Intra uterine device (IUD)"
                      - option "Kilogram"
                      - option "Liter"
                      - option "Lozenge"
                      - option "Milliequivalent"
                      - option "Metric drop"
                      - option "Microgram"
                      - option "Milligram"
                      - option "Milligram per square meter"
                      - option "Milliliter"
                      - option "Million units"
                      - option "Nebulizer"
                      - option "Pad"
                      - option "Patch"
                      - option "Pint"
                      - option "Puff"
                      - option "Pump"
                      - option "Ring pessary"
                      - option "Sachet"
                      - option "Scoopful"
                      - option "Spray"
                      - option "Suppository"
                      - option "Syringe"
                      - option "Tablet" [selected]
                      - option "Tablespoon"
                      - option "Teaspoon"
                      - option "Tube"
                      - option "Unit"
                      - option "Vial"
                    - generic [ref=e135]:
                      - generic [ref=e136]: Refills
                      - textbox [ref=e138]: "0"
                  - generic [ref=e139]: Cancel Changes
            - generic [ref=e141]: Add Medication
          - generic [ref=e143]:
            - generic [ref=e144]: Comments
            - paragraph [ref=e145]:
              - textbox [ref=e146]
        - generic [ref=e147]:
          - button "Save" [ref=e148] [cursor=pointer]
          - button "Cancel" [ref=e149] [cursor=pointer]
```

# Test source

```ts
  1  | import { test, expect, type SectionEncounter } from '../../core';
  2  | import { MCH_DELIVERY_ENCOUNTER_TYPE_UUID } from '../../core/constants';
  3  | import { getEncounterObs } from '../../commands';
  4  | import { SectionFormPage, expectViewShowsSavedObs } from '../../pages';
  5  | 
  6  | // section-plan-medication.xml: HIV counselling, medication orders and remarks of an MCH delivery encounter (it is
  7  | // the "Plan medication" section of the SL delivery visit; also used for ANC 1.1/2.0, documentation/_availability.e2e.md).
  8  | // The specs open the form URL directly. The form uses the HFE <submit> tag, so it has no #submit button
  9  | // (SectionFormPage.openEdit waits for it): the spec opens and saves through a local helper.
  10 | //
  11 | // Conditions in the form, from documentation inventory (section-plan-medication.inv.md):
  12 | //   ifMode VIEW include=false  :28, :60   "Plan" heading and #buttons (Save, Cancel) in ENTER/EDIT only
  13 | // No <when>, <includeIf>, <script> or required field of its own.
  14 | // Shared: drug-order-widget.xml (:49, see _shared.e2e.md): "Add Medication" opens a new-order row.
  15 | // Side effects on save (pihcore classes, not read here): ApplyDispositionAction, SetOrderAutoExpireDateAction (:7-8).
  16 | // Not covered here: revising, renewing or discontinuing an order and the quantity calculator (they need an active
  17 | // order in an earlier encounter).
  18 | // VIEW is covered for the counselling answer and the remarks. The drug-order widget draws its orders in VIEW with JavaScript (it reads
  19 | // them over REST from the page), which the VIEW harness (setContent, no page scripts) does not run, so a saved order is not checked in VIEW.
  20 | // Findings: none.
  21 | 
  22 | const FORM = 'section-plan-medication.xml';
  23 | 
  24 | test.describe('section-plan-medication', () => {
  25 |   let section: SectionEncounter;
  26 | 
  27 |   test.beforeEach(async ({ page, createSectionEncounter }) => {
  28 |     section = await createSectionEncounter({
  29 |       encounterTypeUuid: MCH_DELIVERY_ENCOUNTER_TYPE_UUID,
  30 |       patient: { givenName: 'AutoPlanMed', familyName: 'Tester', gender: 'F' },
  31 |     });
  32 |     await page.goto(SectionFormPage.editUrl(FORM, section));
  33 |     // ifMode VIEW include=false :60 renders the buttons in EDIT mode
  34 |     await expect(page.locator('#buttons input.submitButton')).toBeVisible();
  35 |   });
  36 | 
  37 |   test('saves with nothing filled in (no required field)', async ({ page }) => {
  38 |     await page.locator('#buttons input.submitButton').click();
  39 |     await new SectionFormPage(page, FORM).expectSaved();
  40 |   });
  41 | 
  42 |   test('saves HIV counselling and the medication remarks', async ({ page, api }) => {
  43 |     await page.locator('#hiv-counselling input[type=radio]').first().check(); // Counselled for HIV testing: yes
  44 |     await page.locator('#drug-orders textarea').fill('Take with food');
  45 |     await page.locator('#buttons input.submitButton').click();
  46 |     await new SectionFormPage(page, FORM).expectSaved();
  47 | 
  48 |     const displays = (await getEncounterObs(api, section.encounter.uuid)).map((o) => o.display.toLowerCase());
  49 |     expect(displays.some((d) => d.includes('yes'))).toBeTruthy();
  50 |     expect(displays.some((d) => d.includes('take with food'))).toBeTruthy();
  51 | 
  52 |     // VIEW: the counselling answer and the remarks are shown, and the Save / Cancel buttons are not (ifMode :60)
  53 |     const view = await expectViewShowsSavedObs(page, api, FORM, section.encounter.uuid);
  54 |     expect(await view.valueTexts()).toEqual(['[X] yes', 'Take with food']);
  55 |     await expect(view.page.locator('#hiv-counselling .value')).toHaveText('[X] yes');
  56 |     await expect(view.page.locator('#drug-orders .value')).toHaveText('Take with food');
  57 |     await expect(view.page.locator('#buttons')).toHaveCount(0);
  58 |   });
  59 | 
  60 |   test('saves a new medication order', async ({ page, api }) => {
  61 |     // "Add Medication" (shared drug-order-widget) opens a new-order row
  62 |     await page.locator('#order-action-button-NEW').click();
  63 |     const row = page.locator('#drug-orders .orderwidget-order-form:visible');
  64 |     await row.locator('.order-drug input.orderwidget-autocomplete-textbox').fill('Acetylsalicylic');
> 65 |     await page.locator('.ui-autocomplete .ui-menu-item').first().click();
     |                                                                  ^ TimeoutError: locator.click: Timeout 10000ms exceeded.
  66 |     await row.locator('.order-dose input').fill('1');
  67 |     await row.locator('.order-frequency select').selectOption({ index: 1 });
  68 |     await row.locator('.order-duration input').fill('5'); // days (default unit)
  69 |     await row.locator('.order-quantity input').fill('10');
  70 |     await page.locator('#buttons input.submitButton').click();
  71 |     await new SectionFormPage(page, FORM).expectSaved();
  72 | 
  73 |     const res = await api.get(`order?patient=${section.patient.uuid}&v=custom:(uuid,action)`);
  74 |     expect(res.ok()).toBeTruthy();
  75 |     const orders = (await res.json()).results as Array<{ uuid: string; action: string }>;
  76 |     expect(orders.map((o) => o.action)).toEqual(['NEW']);
  77 |   });
  78 | });
  79 | 
```