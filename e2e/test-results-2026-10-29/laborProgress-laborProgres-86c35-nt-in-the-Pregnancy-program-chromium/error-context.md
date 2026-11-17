# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: laborProgress/laborProgress.spec.ts >> laborProgress >> saves the labour note and enrolls the patient in the Pregnancy program
- Location: specs/laborProgress/laborProgress.spec.ts:221:7

# Error details

```
TimeoutError: locator.click: Timeout 10000ms exceeded.
Call log:
  - waiting for locator('#buttons input.submitButton')
    - locator resolved to <input value="Save" type="button" disabled="disabled" onclick="submitHtmlForm()" autocomplete="new-password" class="submitButton confirm right disabled"/>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is not enabled
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is not enabled
    - retrying click action
      - waiting 100ms
    19 × waiting for element to be visible, enabled and stable
       - element is not enabled
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
      - link "Tester, AutoLaborProgress" [ref=e24] [cursor=pointer]:
        - /url: /openmrs/referenceapplication/home.page
    - listitem [ref=e25]:
      - generic [ref=e26]: 
      - text: Labour Progress
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
              - text: AutoLaborProgress
              - emphasis [ref=e37]: Given Name
          - generic [ref=e38]: Female 25 year(s) ( 27 Oct 2001)
          - link "Show Contact Info " [ref=e40] [cursor=pointer]:
            - /url: "#"
            - text: Show Contact Info
            - generic [ref=e41]: 
            - text: 
        - generic [ref=e42]:
          - generic [ref=e43]:
            - emphasis [ref=e44]: KGH EMR ID
            - generic [ref=e45]: E2E-1793304972293-1425
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
        - text: 29 Oct 2026 4:16 PM
        - generic [ref=e66]: (Active)
      - generic [ref=e69]:
        - heading "Labour Progress" [level=2] [ref=e70]
        - generic [ref=e73]:
          - paragraph [ref=e74]:
            - generic [ref=e75]: Provider (required)
            - combobox [ref=e77]:
              - option "Choose a Provider"
              - option "Account, Testing"
              - option "Advanced Practice Nurse, regression"
              - option "Anderson, Fiona"
              - option "Banda, Pilirani"
              - option "Bediri, Khaled"
              - option "Clinician, Clinician"
              - option "Clinician, March23"
              - option "Gbetuwa, Fatmata"
              - option "Ho, Chi Bong" [selected]
              - option "Jallah, Alphonso"
              - option "Kakala, Bernard"
              - option "karera, Innocent"
              - option "Keimbay, Umu"
              - option "Lolleh, Vamba"
              - option "Marrah-de-Mangola, Abubakarr"
              - option "Marta, Patino"
              - option "Medical Student, November2024"
              - option "Munson, Debbie"
              - option "Nurse Accompagnateur, 2024"
              - option "Nurse Auxiliary, may2024"
              - option "Nurse Midwife, january24"
              - option "Nurse RN, May2023"
              - option "Nurse RN, October2023"
              - option "Physician, Regression"
              - option "regression, jan24part2"
              - option "Regression, March25"
              - option "Sesay, Alieu test"
              - option "Turay, Hawanatu Alusine"
          - paragraph [ref=e78]:
            - generic [ref=e79]: Location (required)
            - combobox [ref=e82]:
              - option "Choose a Location..."
              - option "Antenatal Ward" [selected]
              - option "Labour and Delivery"
              - option "Staff Ward"
              - option "Triage | MCOE"
          - paragraph [ref=e83]:
            - generic [ref=e84]: Date
            - generic [ref=e86]:
              - textbox [ref=e87]: 29 Oct 2026
              - generic "clear" [ref=e88] [cursor=pointer]
        - group "Intake" [ref=e89]:
          - generic [ref=e91]:
            - generic [ref=e92]:
              - paragraph [ref=e94]:
                - generic [ref=e95]: Admission date/time
                - textbox [ref=e96]
                - generic "clear" [ref=e97] [cursor=pointer]
                - combobox [disabled] [ref=e98]:
                  - option "00" [selected]
                  - option "01"
                  - option "02"
                  - option "03"
                  - option "04"
                  - option "05"
                  - option "06"
                  - option "07"
                  - option "08"
                  - option "09"
                  - option "10"
                  - option "11"
                  - option "12"
                  - option "13"
                  - option "14"
                  - option "15"
                  - option "16"
                  - option "17"
                  - option "18"
                  - option "19"
                  - option "20"
                  - option "21"
                  - option "22"
                  - option "23"
                - text: ":"
                - combobox [disabled] [ref=e99]:
                  - option "00" [selected]
                  - option "01"
                  - option "02"
                  - option "03"
                  - option "04"
                  - option "05"
                  - option "06"
                  - option "07"
                  - option "08"
                  - option "09"
                  - option "10"
                  - option "11"
                  - option "12"
                  - option "13"
                  - option "14"
                  - option "15"
                  - option "16"
                  - option "17"
                  - option "18"
                  - option "19"
                  - option "20"
                  - option "21"
                  - option "22"
                  - option "23"
                  - option "24"
                  - option "25"
                  - option "26"
                  - option "27"
                  - option "28"
                  - option "29"
                  - option "30"
                  - option "31"
                  - option "32"
                  - option "33"
                  - option "34"
                  - option "35"
                  - option "36"
                  - option "37"
                  - option "38"
                  - option "39"
                  - option "40"
                  - option "41"
                  - option "42"
                  - option "43"
                  - option "44"
                  - option "45"
                  - option "46"
                  - option "47"
                  - option "48"
                  - option "49"
                  - option "50"
                  - option "51"
                  - option "52"
                  - option "53"
                  - option "54"
                  - option "55"
                  - option "56"
                  - option "57"
                  - option "58"
                  - option "59"
              - paragraph [ref=e101]:
                - generic [ref=e102]: Pregnancy group
                - radio "A" [ref=e103]
                - generic [ref=e104]: A
                - radio "B" [checked] [ref=e105]
                - generic [ref=e106]: B
                - radio "C" [ref=e107]
                - generic [ref=e108]: C
            - generic [ref=e109]:
              - generic [ref=e110]:
                - paragraph [ref=e111]:
                  - generic [ref=e112]: Gravida (G)
                  - textbox [ref=e113]: "2"
                - paragraph [ref=e114]:
                  - generic [ref=e115]: Parity (P)
                  - textbox [ref=e116]: "1"
              - generic [ref=e117]:
                - paragraph [ref=e118]:
                  - generic [ref=e119]: Gestational age (GA)
                  - textbox [ref=e120]
                  - generic [ref=e121]: Decimal represents number of days. For example, 37.4 = 37 weeks + 4 days.
                - paragraph [ref=e122]:
                  - generic [ref=e123]: "Gestational age based on:"
                  - radio "Ultrasound" [ref=e124]
                  - generic [ref=e125]: Ultrasound
                  - radio "Last menstrual date" [checked] [ref=e126]
                  - generic [ref=e127]: Last menstrual date
                  - radio "Expected due date" [ref=e128]
                  - generic [ref=e129]: Expected due date
                  - radio "Physical exam" [ref=e130]
                  - generic [ref=e131]: Physical exam
        - group "Vital signs" [ref=e132]:
          - generic [ref=e135]:
            - generic [ref=e136]:
              - generic [ref=e138]:
                - generic [ref=e139]: BP
                - generic [ref=e140]:
                  - textbox [ref=e143]: "120"
                  - generic [ref=e144]: /
                  - textbox [ref=e147]: "80"
                  - generic [ref=e148]: mm/Hg
              - generic [ref=e150]:
                - generic [ref=e151]: HR
                - generic [ref=e153]:
                  - textbox [ref=e154]
                  - generic [ref=e155]: /min
              - generic [ref=e157]:
                - generic [ref=e158]: RR
                - generic [ref=e160]:
                  - textbox [ref=e161]: "80"
                  - generic [ref=e162]: /min
              - generic [ref=e164]:
                - generic [ref=e165]: Temp
                - generic [ref=e167]:
                  - textbox [ref=e168]
                  - generic [ref=e169]: °C
              - generic [ref=e171]:
                - generic [ref=e172]:
                  - text: O
                  - subscript [ref=e173]: "2"
                  - text: Sat
                - generic [ref=e175]:
                  - textbox [ref=e176]
                  - generic [ref=e177]: "%"
              - generic [ref=e179]:
                - generic [ref=e180]: HB
                - generic [ref=e182]:
                  - textbox [ref=e183]
                  - generic [ref=e184]: g/dL
              - generic [ref=e186]:
                - generic [ref=e187]: Glucose
                - generic [ref=e189]:
                  - textbox [ref=e190]
                  - generic [ref=e191]: mmol/L
              - generic [ref=e192]:
                - generic [ref=e193]:
                  - generic [ref=e194]: FHR
                  - generic [ref=e196]:
                    - textbox [ref=e197]
                    - generic [ref=e198]: beats/min
                - generic [ref=e199]:
                  - generic [ref=e200]: Second FHR
                  - generic [ref=e202]:
                    - textbox [ref=e203]
                    - generic [ref=e204]: beats/min
            - generic [ref=e206]:
              - text: Contact doctor about early intervention due to 1 red, 1 orange, or 2 yellow vital score(s).
              - checkbox [ref=e207]
        - group "Lab results" [ref=e208]:
          - generic [ref=e211]:
            - paragraph [ref=e214]:
              - generic [ref=e215]: HIV rapid test
              - generic [ref=e216]:
                - radio "Positive" [ref=e217]
                - generic [ref=e218]: Positive
                - radio "Negative" [ref=e219]
                - generic [ref=e220]: Negative
                - radio "Indeterminate" [ref=e221]
                - generic [ref=e222]: Indeterminate
                - radio "Not performed" [ref=e223]
                - generic [ref=e224]: Not performed
            - paragraph [ref=e227]:
              - generic [ref=e228]: Syphilis rapid test
              - generic [ref=e229]:
                - radio "Positive" [ref=e230]
                - generic [ref=e231]: Positive
                - radio "Negative" [ref=e232]
                - generic [ref=e233]: Negative
                - radio "Indeterminate" [ref=e234]
                - generic [ref=e235]: Indeterminate
                - radio "Not performed" [ref=e236]
                - generic [ref=e237]: Not performed
            - paragraph [ref=e240]:
              - generic [ref=e241]: Hepatitis B (HbsAb)
              - generic [ref=e242]:
                - radio "Positive" [ref=e243]
                - generic [ref=e244]: Positive
                - radio "Negative" [ref=e245]
                - generic [ref=e246]: Negative
                - radio "Indeterminate" [ref=e247]
                - generic [ref=e248]: Indeterminate
        - group "Labour complications" [ref=e250]:
          - generic [ref=e252]:
            - checkbox "Postpartum haemorrhage" [ref=e253]
            - generic [ref=e254]: Postpartum haemorrhage
            - checkbox "Prolonged labour" [checked] [ref=e255]: ✔
            - generic [ref=e256]: Prolonged labour
            - checkbox "Rupture of uterus" [ref=e257]
            - generic [ref=e258]: Rupture of uterus
            - checkbox "Retained placenta" [ref=e259]
            - generic [ref=e260]: Retained placenta
            - checkbox "Multiple gestation" [ref=e261]
            - generic [ref=e262]: Multiple gestation
            - checkbox "Abnormal foetal presentation" [ref=e263]
            - generic [ref=e264]: Abnormal foetal presentation
            - checkbox "Signs of foetal distress" [ref=e265]
            - generic [ref=e266]: Signs of foetal distress
            - checkbox "other" [ref=e267]
            - generic [ref=e268]: other
            - generic [ref=e269]: "if other, specify:"
            - textbox [ref=e270]
        - group "Labour onset" [ref=e271]:
          - generic [ref=e273]:
            - paragraph [ref=e274]:
              - generic [ref=e275]: Labour start date/time
              - generic [ref=e276]:
                - textbox [ref=e277]
                - generic "clear" [ref=e278] [cursor=pointer]
                - combobox [disabled] [ref=e279]:
                  - option "00" [selected]
                  - option "01"
                  - option "02"
                  - option "03"
                  - option "04"
                  - option "05"
                  - option "06"
                  - option "07"
                  - option "08"
                  - option "09"
                  - option "10"
                  - option "11"
                  - option "12"
                  - option "13"
                  - option "14"
                  - option "15"
                  - option "16"
                  - option "17"
                  - option "18"
                  - option "19"
                  - option "20"
                  - option "21"
                  - option "22"
                  - option "23"
                - text: ":"
                - combobox [disabled] [ref=e280]:
                  - option "00" [selected]
                  - option "01"
                  - option "02"
                  - option "03"
                  - option "04"
                  - option "05"
                  - option "06"
                  - option "07"
                  - option "08"
                  - option "09"
                  - option "10"
                  - option "11"
                  - option "12"
                  - option "13"
                  - option "14"
                  - option "15"
                  - option "16"
                  - option "17"
                  - option "18"
                  - option "19"
                  - option "20"
                  - option "21"
                  - option "22"
                  - option "23"
                  - option "24"
                  - option "25"
                  - option "26"
                  - option "27"
                  - option "28"
                  - option "29"
                  - option "30"
                  - option "31"
                  - option "32"
                  - option "33"
                  - option "34"
                  - option "35"
                  - option "36"
                  - option "37"
                  - option "38"
                  - option "39"
                  - option "40"
                  - option "41"
                  - option "42"
                  - option "43"
                  - option "44"
                  - option "45"
                  - option "46"
                  - option "47"
                  - option "48"
                  - option "49"
                  - option "50"
                  - option "51"
                  - option "52"
                  - option "53"
                  - option "54"
                  - option "55"
                  - option "56"
                  - option "57"
                  - option "58"
                  - option "59"
            - paragraph [ref=e281]:
              - generic [ref=e282]: Membranes
              - generic [ref=e283]:
                - radio "Intact" [ref=e284]
                - generic [ref=e285]: Intact
                - radio "Ruptured" [checked] [ref=e286]
                - generic [ref=e287]: Ruptured
                - radio "Unknown" [ref=e288]
                - generic [ref=e289]: Unknown
            - generic [ref=e290]:
              - paragraph
              - generic [ref=e291]:
                - generic [ref=e292]: Rupture date/time
                - textbox [ref=e293]
                - generic "clear" [ref=e294] [cursor=pointer]
                - combobox [disabled] [ref=e295]:
                  - option "00"
                  - option "01"
                  - option "02"
                  - option "03"
                  - option "04"
                  - option "05"
                  - option "06"
                  - option "07"
                  - option "08"
                  - option "09"
                  - option "10"
                  - option "11"
                  - option "12"
                  - option "13"
                  - option "14"
                  - option "15"
                  - option "16"
                  - option "17"
                  - option "18"
                  - option "19"
                  - option "20"
                  - option "21"
                  - option "22"
                  - option "23"
                - text: ":"
                - combobox [disabled] [ref=e296]:
                  - option "00"
                  - option "01"
                  - option "02"
                  - option "03"
                  - option "04"
                  - option "05"
                  - option "06"
                  - option "07"
                  - option "08"
                  - option "09"
                  - option "10"
                  - option "11"
                  - option "12"
                  - option "13"
                  - option "14"
                  - option "15"
                  - option "16"
                  - option "17"
                  - option "18"
                  - option "19"
                  - option "20"
                  - option "21"
                  - option "22"
                  - option "23"
                  - option "24"
                  - option "25"
                  - option "26"
                  - option "27"
                  - option "28"
                  - option "29"
                  - option "30"
                  - option "31"
                  - option "32"
                  - option "33"
                  - option "34"
                  - option "35"
                  - option "36"
                  - option "37"
                  - option "38"
                  - option "39"
                  - option "40"
                  - option "41"
                  - option "42"
                  - option "43"
                  - option "44"
                  - option "45"
                  - option "46"
                  - option "47"
                  - option "48"
                  - option "49"
                  - option "50"
                  - option "51"
                  - option "52"
                  - option "53"
                  - option "54"
                  - option "55"
                  - option "56"
                  - option "57"
                  - option "58"
                  - option "59"
              - paragraph
              - paragraph [ref=e297]:
                - generic [ref=e298]: Membrane color
                - radio "Clear" [checked] [ref=e299]
                - generic [ref=e300]: Clear
                - radio "Green-brown color" [ref=e301]
                - generic [ref=e302]: Green-brown color
              - paragraph [ref=e303]:
                - generic [ref=e304]: Meconium classification
                - radio "Grade I (translucent, light green or yellow flesh)" [ref=e305]
                - generic [ref=e306]: Grade I (translucent, light green or yellow flesh)
                - radio "Grade II (opalescent, deep green and light yellow, brown)" [ref=e307]
                - generic [ref=e308]: Grade II (opalescent, deep green and light yellow, brown)
                - radio "Grade III (opaque and deep green)" [ref=e309]
                - generic [ref=e310]: Grade III (opaque and deep green)
        - group "Physical exam" [ref=e311]:
          - generic [ref=e313]:
            - text: Obstetrical Exam
            - generic [ref=e314]:
              - generic [ref=e315]:
                - generic [ref=e316]: Fundal height
                - textbox [ref=e317]
                - generic [ref=e318]: cm
              - paragraph [ref=e320]:
                - generic [ref=e321]: UC
                - radio "Absent" [ref=e322]
                - generic [ref=e323]: Absent
                - radio "Present" [ref=e324]
                - generic [ref=e325]: Present
                - textbox "comment" [ref=e326]
              - paragraph [ref=e328]:
                - generic [ref=e329]: Foetal heart rate method
                - generic [ref=e330]:
                  - radio "Pinard" [ref=e331]
                  - generic [ref=e332]: Pinard
                  - radio "Doppler" [ref=e333]
                  - generic [ref=e334]: Doppler
                  - radio "Moyo" [ref=e335]
                  - generic [ref=e336]: Moyo
                  - radio "Janitri" [ref=e337]
                  - generic [ref=e338]: Janitri
                  - radio "CTG" [ref=e339]
                  - generic [ref=e340]: CTG
                  - radio "other" [ref=e341]
                  - generic [ref=e342]: other
            - generic [ref=e343]:
              - heading "------- 1 -------" [level=6] [ref=e344]
              - generic [ref=e345]:
                - paragraph [ref=e347]:
                  - generic [ref=e348]: Foetal presentation
                  - generic [ref=e349]:
                    - radio "Breech presentation" [ref=e350]
                    - generic [ref=e351]: Breech presentation
                    - radio "Brow presentation" [ref=e352]
                    - generic [ref=e353]: Brow presentation
                    - radio "Cephalic or vertex presentation" [checked] [ref=e354]
                    - generic [ref=e355]: Cephalic or vertex presentation
                    - radio "Compound presentation" [ref=e356]
                    - generic [ref=e357]: Compound presentation
                    - radio "Face or brow presentation" [ref=e358]
                    - generic [ref=e359]: Face or brow presentation
                    - radio "Face presentation" [ref=e360]
                    - generic [ref=e361]: Face presentation
                    - radio "Frank breech presentation" [ref=e362]
                    - generic [ref=e363]: Frank breech presentation
                    - radio "Mentum or chin presentation" [ref=e364]
                    - generic [ref=e365]: Mentum or chin presentation
                    - radio "Occiput anterior position" [ref=e366]
                    - generic [ref=e367]: Occiput anterior position
                    - radio "Occiput posterior presentation" [ref=e368]
                    - generic [ref=e369]: Occiput posterior presentation
                    - radio "Other" [ref=e370]
                    - generic [ref=e371]: Other
                    - radio "Prolapsed umbilical cord" [ref=e372]
                    - generic [ref=e373]: Prolapsed umbilical cord
                    - radio "Transverse or oblique presentation" [ref=e374]
                    - generic [ref=e375]: Transverse or oblique presentation
                - paragraph [ref=e377]:
                  - generic [ref=e378]: Foetal position
                  - generic [ref=e379]:
                    - radio "Right" [ref=e380]
                    - generic [ref=e381]: Right
                    - radio "Left" [ref=e382]
                    - generic [ref=e383]: Left
                - generic [ref=e384]:
                  - generic [ref=e385]: Foetal heart rate
                  - generic [ref=e386]:
                    - textbox [ref=e387]: "140"
                    - generic [ref=e388]: beats/min
            - button "Show More" [ref=e389] [cursor=pointer]
            - paragraph [ref=e390]:
              - generic [ref=e391]: Induced labor
              - generic [ref=e392]:
                - radio "Yes" [checked] [ref=e393]
                - generic [ref=e394]: "Yes"
                - radio "No" [ref=e395]
                - generic [ref=e396]: "No"
            - generic [ref=e397]:
              - generic [ref=e398]:
                - generic [ref=e399]: Induction date/time
                - textbox [ref=e400]
                - generic "clear" [ref=e401] [cursor=pointer]
                - combobox [disabled] [ref=e402]:
                  - option "00"
                  - option "01"
                  - option "02"
                  - option "03"
                  - option "04"
                  - option "05"
                  - option "06"
                  - option "07"
                  - option "08"
                  - option "09"
                  - option "10"
                  - option "11"
                  - option "12"
                  - option "13"
                  - option "14"
                  - option "15"
                  - option "16"
                  - option "17"
                  - option "18"
                  - option "19"
                  - option "20"
                  - option "21"
                  - option "22"
                  - option "23"
                - text: ":"
                - combobox [disabled] [ref=e403]:
                  - option "00"
                  - option "01"
                  - option "02"
                  - option "03"
                  - option "04"
                  - option "05"
                  - option "06"
                  - option "07"
                  - option "08"
                  - option "09"
                  - option "10"
                  - option "11"
                  - option "12"
                  - option "13"
                  - option "14"
                  - option "15"
                  - option "16"
                  - option "17"
                  - option "18"
                  - option "19"
                  - option "20"
                  - option "21"
                  - option "22"
                  - option "23"
                  - option "24"
                  - option "25"
                  - option "26"
                  - option "27"
                  - option "28"
                  - option "29"
                  - option "30"
                  - option "31"
                  - option "32"
                  - option "33"
                  - option "34"
                  - option "35"
                  - option "36"
                  - option "37"
                  - option "38"
                  - option "39"
                  - option "40"
                  - option "41"
                  - option "42"
                  - option "43"
                  - option "44"
                  - option "45"
                  - option "46"
                  - option "47"
                  - option "48"
                  - option "49"
                  - option "50"
                  - option "51"
                  - option "52"
                  - option "53"
                  - option "54"
                  - option "55"
                  - option "56"
                  - option "57"
                  - option "58"
                  - option "59"
              - paragraph [ref=e404]:
                - generic [ref=e405]: Method of induction
                - radio "Mechanical induction" [ref=e406]
                - generic [ref=e407]: Mechanical induction
                - radio "Oxytocin" [checked] [ref=e408]
                - generic [ref=e409]: Oxytocin
                - radio "Misoprostol" [ref=e410]
                - generic [ref=e411]: Misoprostol
            - paragraph
            - paragraph [ref=e412]:
              - generic [ref=e413]: Palpation of abdomen
              - radio "Tender uterus" [ref=e414]
              - generic [ref=e415]: Tender uterus
              - radio "Uterus not sensitive" [ref=e416]
              - generic [ref=e417]: Uterus not sensitive
              - generic [ref=e418]: Previous abdominal scar
              - generic [ref=e419]:
                - radio "Yes" [ref=e420]
                - generic [ref=e421]: "Yes"
                - radio "No" [checked] [ref=e422]
                - generic [ref=e423]: "No"
            - paragraph
        - group "Outcome" [ref=e424]:
          - generic [ref=e426]:
            - paragraph [ref=e427]:
              - generic [ref=e428]: Overall condition
              - generic [ref=e429]:
                - radio "satisfactory" [checked] [ref=e430]
                - generic [ref=e431]: satisfactory
                - radio "deteriorated" [ref=e432]
                - generic [ref=e433]: deteriorated
                - radio "unsatisfactory" [ref=e434]
                - generic [ref=e435]: unsatisfactory
            - generic [ref=e436]:
              - generic [ref=e437]: Disposition
              - combobox [ref=e439]:
                - option [selected]
                - option "Admission"
                - option "Observation"
                - option "Discharge"
                - option "Active"
                - option "Transfer within hospital"
                - option "Transfer out of hospital"
                - option "Medication prescribed"
                - option "Laboratory tests outstanding"
                - option "No action taken"
                - option "Death"
            - paragraph
            - paragraph [ref=e440]:
              - generic [ref=e441]: Notes
              - textbox [active] [ref=e442]: Labour note
            - paragraph [ref=e443]:
              - generic [ref=e444]: Upload partogram
              - button "Choose File" [ref=e445]
        - generic [ref=e446]:
          - button "Save" [disabled] [ref=e447]
          - button "Cancel" [ref=e448] [cursor=pointer]
```

# Test source

```ts
  1   | import type { APIRequestContext, Page } from '@playwright/test';
  2   | import { test, expect, birthdateYearsAgo, type EntryContext } from '../../core';
  3   | import { ANC_INTAKE_ENCOUNTER_TYPE_UUID, MCH_OPD_LOCATION_UUID } from '../../core/constants';
  4   | import { getEncounterObs, getPatientEncounters } from '../../commands';
  5   | import { EntryFormPage, SectionFormPage, expectViewShowsSavedObs, selectDefaultProvider } from '../../pages';
  6   | 
  7   | // laborProgress.xml: "Labour Progress" (MCOE labour ward note): intake, vitals, lab results, labour complications,
  8   | // labour onset and membranes, physical exam (up to 4 foetuses), induction, abdominal scar and outcome. The specs open
  9   | // enterHtmlFormWithStandardUi inside a visit they create, so availability (documentation/_availability.e2e.md: mcoeForms,
  10  | // enterMCH, session location tag "Antenatal Location", female >= 10) is not exercised. The session location (MCH OPD)
  11  | // lacks that tag, so the Location select starts blank and is required: every save below picks "Antenatal Ward" and the default provider.
  12  | //
  13  | // Conditions in the form, from documentation inventory (laborProgress.inv.md):
  14  | //   when #membrane-state = Ruptured    :229  show #rupture-details (rupture date/time, membrane colour, meconium class)
  15  | //   when #fetus-presentation-N = Other :359  show #other-presentation (id repeated for the 4 foetuses, V1)
  16  | //   when #induced = Yes                :409  show #induced-details (induction date/time, method)
  17  | //   when #ab-scar = Yes                :449  show #ab-scar-details (# of previous c-sections, scar description)
  18  | //   ifMode VIEW include=false          :33, :69, :267, :507  scripts, heading, Save/Cancel buttons (ENTER/EDIT only)
  19  | //   (32 more in shared subforms: see _shared.e2e.md; pregnancy-group-widget, vital-signs-widget, lab-results-section)
  20  | // Scripts:
  21  | //   :35-54   EDD/GA: latest CIEL:1427 (LMP) of the patient (any encounter) -> #calculated-edd-and-gestational shown with
  22  | //            EDD = LMP + 280 days and GA "<w> <d>/7 weeks" (mch.js helpers, computed at encounter date); hidden without LMP.
  23  | //   :268-301 foetus 2-4 are hidden on load; "Show more" shows them, "Show less" hides them again; the buttons swap.
  24  | // Side effects on save: postSubmissionActions CleanDiagnosisConstructAction, ApplyDispositionAction and
  25  | //   PregnancyProgramEnrollmentAction (patient is enrolled in the Pregnancy program, asserted below).
  26  | // VIEW is covered by the save test (every section) and one test with two foetuses; the EDD/GA block is ENTER/EDIT only (script :35-54).
  27  | // Not covered here: disposition (ApplyDispositionAction; transfer/death side effects), partogram upload (complex obs),
  28  | //   lab results and vitals scoring (shared widgets, _shared.e2e.md), other session locations.
  29  | //
  30  | // Findings:
  31  | //   V1 Medium :359, :363  <div id="other-presentation"> sits inside the 4-foetus <repeat> without {0}, and every <when>
  32  | //                    targets "#other-presentation". jQuery resolves an id to its first element only, so the specify fields
  33  | //                    of foetus 2-4 are never hidden (visible after "Show more" whatever the answer) and choosing "Other"
  34  | //                    for foetus 2-4 reveals foetus 1's field. Fix: id="other-presentation-{0}" and the same in thenDisplay.
  35  | //                    (TESTED below with test.fixme)
  36  | //   V2 Medium :273   hasValue() looks for '.fetus-name input' (copied from section-delivery); no such class exists here, so on
  37  | //                    load foetus 2-4 are always hidden: a reopened (EDIT) encounter with data for foetus 2-4 hides it until
  38  | //                    "Show more" is clicked. Fix: look at the foetus inputs, e.g. '#fetus-hr-N input'. Saved groups carry no
  39  | //                    foetus number, so HFE binds them to the slots in obs order.   (TESTED below with test.fixme)
  40  | //   V3 Low    :37-43 the LMP date is formatted as 'yyyy-MM-dd' and parsed with new Date(), i.e. as UTC midnight, then shown
  41  | //                    in the browser's time zone: EDD is one day early in time zones west of UTC (not Sierra Leone).
  42  | //   VW1 Medium :340-342  the foetus obsgroups (CIEL:165381) carry no foetus number, and HFE binds them to the four slots in the reverse of the entry
  43  | //                    order: with two foetuses saved, VIEW (and the reopened EDIT form) show foetus 2's heart rate and presentation under
  44  | //                    "------- 1 -------" and foetus 1's under "------- 2 -------" (140/150 bpm came back as 150/140, 6 of 6 runs). A save from
  45  | //                    EDIT then writes the swapped data back. Fix: store the foetus number in the group (a hidden obs per slot), or bind the slots
  46  | //                    in saved order.   (TESTED below with test.fixme)
  47  | //   VW2 Info :229,:359,:409,:449  VIEW does not run the <when>/thenDisplay controls (the generated script is ENTER/EDIT only), so the conditional blocks
  48  | //                   (#rupture-details, #other-presentation, #induced-details, #ab-scar-details) are always rendered in VIEW, blank when not applicable (same as gainNewbornRegister VW1; not tested).
  49  | 
  50  | const FORM = 'laborProgress.xml';
  51  | const DAY_MS = 86400000;
  52  | 
  53  | const saveForm = async (page: Page) => {
  54  |   // <submit> tag: the button has no #submit (hfe-e2e-specs.skill.md "Harness gotchas")
> 55  |   await page.locator('#buttons input.submitButton').click();
      |                                                     ^ TimeoutError: locator.click: Timeout 10000ms exceeded.
  56  | };
  57  | 
  58  | const openForm = async (page: Page, context: EntryContext) => {
  59  |   await EntryFormPage.open(page, FORM, context);
  60  |   await expect(page.locator('#buttons input.submitButton')).toBeVisible();
  61  | };
  62  | 
  63  | // The Location select is blank and required because the session location has no "Antenatal Location" tag.
  64  | // The Provider select is blank too when the logged-in user has no Provider account.
  65  | const pickProviderAndLocation = async (page: Page) => {
  66  |   await selectDefaultProvider(page);
  67  |   await page.locator('#encounterLocation select').selectOption({ label: 'Antenatal Ward' });
  68  | };
  69  | 
  70  | const pregnancyEnrollments = async (api: APIRequestContext, patientUuid: string): Promise<string[]> => {
  71  |   const res = await api.get(`programenrollment?patient=${patientUuid}&v=custom:(program:(name),dateCompleted)`);
  72  |   expect(res.ok()).toBeTruthy();
  73  |   const results = (await res.json()).results as Array<{
  74  |     program: { name: string };
  75  |     dateCompleted: string | null;
  76  |   }>;
  77  |   return results.filter((e) => e.dateCompleted === null).map((e) => e.program.name);
  78  | };
  79  | 
  80  | // An earlier encounter of the patient with an LMP obs (CIEL:1427); the purge removes it with the patient.
  81  | const createPriorLmp = async (api: APIRequestContext, patientUuid: string, daysAgo: number): Promise<string> => {
  82  |   const lmp = new Date(Date.now() - daysAgo * DAY_MS).toISOString().slice(0, 10);
  83  |   const res = await api.post('encounter', {
  84  |     data: {
  85  |       patient: patientUuid,
  86  |       encounterType: ANC_INTAKE_ENCOUNTER_TYPE_UUID,
  87  |       location: MCH_OPD_LOCATION_UUID,
  88  |       encounterDatetime: new Date(Date.now() - 3600000).toISOString(),
  89  |       obs: [{ concept: 'CIEL:1427', value: lmp }],
  90  |     },
  91  |   });
  92  |   expect(res.ok(), `create LMP encounter: ${res.status()}`).toBeTruthy();
  93  |   return lmp;
  94  | };
  95  | 
  96  | test.describe('laborProgress', () => {
  97  |   let context: EntryContext;
  98  | 
  99  |   test.beforeEach(async ({ page, createEntryContext }) => {
  100 |     context = await createEntryContext({
  101 |       givenName: 'AutoLaborProgress',
  102 |       familyName: 'Tester',
  103 |       gender: 'F',
  104 |       birthdate: birthdateYearsAgo(25),
  105 |     });
  106 |     await openForm(page, context);
  107 |   });
  108 | 
  109 |   test('membrane details show only when Membranes is Ruptured', async ({ page }) => {
  110 |     // when :229
  111 |     const details = page.locator('#rupture-details');
  112 |     await expect(details).toBeHidden();
  113 |     await page.locator('#membrane-state').getByLabel('Ruptured').check();
  114 |     await expect(details).toBeVisible();
  115 |     for (const other of ['Intact', 'Unknown']) {
  116 |       await page.locator('#membrane-state').getByLabel(other).check();
  117 |       await expect(details).toBeHidden();
  118 |       await page.locator('#membrane-state').getByLabel('Ruptured').check();
  119 |       await expect(details).toBeVisible();
  120 |     }
  121 |   });
  122 | 
  123 |   test('induction date and method show only when Induced labor is Yes', async ({ page }) => {
  124 |     // when :409
  125 |     const details = page.locator('#induced-details');
  126 |     await expect(details).toBeHidden();
  127 |     await page.locator('#induced').getByLabel('Yes').check();
  128 |     await expect(details).toBeVisible();
  129 |     await page.locator('#induced').getByLabel('No').check();
  130 |     await expect(details).toBeHidden();
  131 |   });
  132 | 
  133 |   test('"Previous abdominal scar" Yes shows the c-section count and scar description', async ({ page }) => {
  134 |     // when :449
  135 |     const details = page.locator('#ab-scar-details');
  136 |     await expect(details).toBeHidden();
  137 |     await page.locator('#ab-scar').getByLabel('Yes').check();
  138 |     await expect(details).toBeVisible();
  139 |     await page.locator('#ab-scar').getByLabel('No').check();
  140 |     await expect(details).toBeHidden();
  141 |   });
  142 | 
  143 |   test('foetus 1: "Other" presentation shows the specify field, another answer hides it', async ({ page }) => {
  144 |     // when :359 (foetus 1 is the first #other-presentation, the one jQuery resolves, so it works)
  145 |     const specify = page.locator('[id="other-presentation"]').first();
  146 |     await expect(specify).toBeHidden();
  147 |     await page.locator('#fetus-presentation-1').getByLabel('Other', { exact: true }).check();
  148 |     await expect(specify).toBeVisible();
  149 |     await page.locator('#fetus-presentation-1').getByLabel('Cephalic or vertex presentation').check();
  150 |     await expect(specify).toBeHidden();
  151 |   });
  152 | 
  153 |   // V1 (Medium): the four specify fields share one id. Intended: each foetus has its own specify field, hidden until that
  154 |   // foetus' presentation is Other. Remove test.fixme() when :359-363 are fixed.
  155 |   test('foetus 2: "Other" presentation shows foetus 2\'s own specify field only (V1)', async ({ page }) => {
```