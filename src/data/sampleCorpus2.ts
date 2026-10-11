import type { DocumentInput } from '../engine/ingest';

/** 2023: vitamin D deficiency, immunizations. */
export const SAMPLE_DOCUMENTS_B: DocumentInput[] = [
  {
    title: 'Follow-up visit, lipid and vitamin D review',
    kind: 'visit_note',
    date: '2023-03-02',
    facility: 'Riverbend Family Medicine',
    author: 'Dana Whitfield, MD',
    origin: 'sample',
    text: `Riverbend Family Medicine
Follow-up Visit

Patient: Alex Morgan
Date of Service: 03/02/2023

History of Present Illness
Reports improved energy since starting vitamin D supplementation. Denies chest pain, dyspnea, dizziness, or palpitations. Occasional heartburn after meals.

Vital Signs
Blood pressure 128/78 mmHg
Heart rate 72 bpm
Weight 194 lb
BMI 28.8

Current Medications
Lisinopril 10 mg once daily
Atorvastatin 20 mg at bedtime
Vitamin D3 2000 units once daily

Problem List
Hyperlipidemia.
Prediabetes.
Hypertension.
Vitamin D deficiency.

Assessment
1. Hyperlipidemia, improved. LDL 128 in September.
2. Prediabetes, stable.
3. Hypertension, at goal today.
4. Vitamin D deficiency, documented March 2023, started on cholecalciferol.

Plan
Repeat vitamin D and thyroid studies.
Continue current medications.
Increase physical activity to 150 minutes per week.`,
  },
  {
    title: 'Vitamin D, thyroid panel and comprehensive metabolic panel',
    kind: 'lab_report',
    date: '2023-03-09',
    facility: 'Northside Clinical Laboratories',
    origin: 'sample',
    text: `Northside Clinical Laboratories
Final Report

Patient: Alex Morgan
Collection Date: 03/09/2023

VITAMINS
Vitamin D, 25-OH         18    L  ng/mL     (30-100)
Vitamin B12              412      pg/mL     (200-900)

THYROID
TSH                      2.1      mIU/L     (0.4-4.0)
Free T4                  1.1      ng/dL     (0.8-1.8)

CHEMISTRY
Sodium                   141      mmol/L    (135-145)
Potassium                4.1      mmol/L    (3.5-5.1)
Calcium                  9.4      mg/dL     (8.6-10.2)
Creatinine               1.05     mg/dL     (0.60-1.30)
eGFR                     84       mL/min/1.73m2
ALT                      38       U/L       (7-56)
AST                      28       U/L       (10-40)
Albumin                  4.4      g/dL      (3.5-5.0)

Impression
25-OH vitamin D low at 18 ng/mL, consistent with vitamin D deficiency. Thyroid studies normal.`,
  },
  {
    title: 'Immunization record',
    kind: 'vaccination_record',
    date: '2023-10-19',
    facility: 'Riverbend Family Medicine',
    origin: 'sample',
    text: `Riverbend Family Medicine
Immunization Record

Patient: Alex Morgan
Date of Birth: 04/12/1979
Record printed 10/19/2023

Immunizations
Influenza vaccine administered 10/19/2023.
COVID-19 vaccine administered 10/19/2023.
Tdap administered 05/02/2019.
Hepatitis B vaccine series completed 2004.

No adverse reactions reported following any immunization.`,
  },
  {
    title: 'Health history questionnaire',
    kind: 'questionnaire',
    date: '2023-10-19',
    facility: 'Riverbend Family Medicine',
    origin: 'sample',
    text: `Riverbend Family Medicine
Patient Health Questionnaire

Patient: Alex Morgan
Date of Birth: 04/12/1979
Completed 10/19/2023

Blood type: A positive

Family History
Father - myocardial infarction at age 62, hypertension.
Mother - type 2 diabetes, osteoporosis.
Sibling - none reported.

Social History
Tobacco use: former smoker, quit 2015.
Alcohol use: 2 drinks per week.
Physical activity: light, 1 to 2 days per week.
Diet: mixed, frequent takeout meals.

Review of Systems
Reports occasional fatigue. Denies chest pain, shortness of breath, palpitations, edema, or unintentional weight loss.`,
  },
];
