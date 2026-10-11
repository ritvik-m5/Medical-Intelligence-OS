import type { DocumentInput } from '../engine/ingest';

/** 2025-2026: the reconciliation failure, and where the record ends. */
export const SAMPLE_DOCUMENTS_E: DocumentInput[] = [
  {
    title: 'Medication reconciliation with recent results',
    kind: 'medication_list',
    date: '2025-06-24',
    facility: 'Riverbend Family Medicine',
    origin: 'sample',
    text: `Riverbend Family Medicine
Medication Reconciliation

Patient: Alex Morgan
Date of Service: 06/24/2025

Current Medications
Lisinopril 20 mg once daily
Atorvastatin 40 mg at bedtime
Metformin 500 mg twice daily
Vitamin D3 2000 units once daily
Semaglutide 0.5 mg weekly

Allergies
Penicillin - rash.
Amoxicillin - rash.

Results
Results reviewed from 06/24/2025.
Potassium                4.1      mmol/L    (3.5-5.1)
Creatinine               1.08     mg/dL     (0.60-1.30)
Hemoglobin A1c           6.1      %         (4.0-5.6)
LDL Cholesterol          96       mg/dL     (<100)

Assessment
1. Prediabetes, improved on metformin.
2. Hypertension, controlled.
3. Hyperlipidemia, LDL at goal.
4. Vitamin D deficiency, corrected.

Plan
Continue all current medications.
Repeat laboratory studies in 6 months.`,
  },
  {
    title: 'Lipid panel, chemistry and inflammation markers',
    kind: 'lab_report',
    date: '2025-06-24',
    facility: 'Northside Clinical Laboratories',
    origin: 'sample',
    text: `Northside Clinical Laboratories
Final Report

Patient: Alex Morgan
Collection Date: 06/24/2025

LIPID PANEL
Total Cholesterol        182      mg/dL     (<200)
LDL Cholesterol           96      mg/dL     (<100)
HDL Cholesterol           48      mg/dL     (>40)
Triglycerides            122      mg/dL     (<150)

GLYCEMIC
Hemoglobin A1c           6.1   H  %         (4.0-5.6)
Fasting Glucose          108   H  mg/dL     (70-99)

CHEMISTRY
Sodium                   141      mmol/L    (135-145)
Potassium                45    L  mmol/L    (3.5-5.1)
Chloride                 104      mmol/L    (98-107)
Creatinine               1.08     mg/dL     (0.60-1.30)
eGFR                     80       mL/min/1.73m2
ALT                      41       U/L       (7-56)
AST                      29       U/L       (10-40)
Uric acid                6.4      mg/dL     (3.4-7.0)

VITAMINS AND THYROID
Vitamin D, 25-OH         38       ng/mL     (30-100)
TSH                      2.6      mIU/L     (0.4-4.0)

Impression
A1c improved to 6.1 percent on metformin and semaglutide. LDL at goal. Potassium result requires verification against the specimen.`,
  },
  {
    title: 'Wearable summary, third quarter 2025',
    kind: 'wearable_summary',
    date: '2025-09-30',
    periodStart: '2025-07-01',
    periodEnd: '2025-09-30',
    facility: 'Wearable device export',
    origin: 'sample',
    text: `Wearable Device Export
Quarterly Summary
Period: 07/01/2025 to 09/30/2025

Patient: Alex Morgan

Activity
Average daily steps 6840.
Resting heart rate 62 bpm.
VO2 max 34 mL/kg/min.

Sleep
Average sleep duration 6.6 hours.
Average nightly awakenings 2.

Body
Weight 184 lb.
Blood pressure 128/78 mmHg (self-measured, cuff).

Notes
Device data are self-reported and not clinically validated measurements.`,
  },
];
