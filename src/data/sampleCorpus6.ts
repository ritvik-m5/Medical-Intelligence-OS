import type { DocumentInput } from '../engine/ingest';

/** 2026: the final annual visit and the most recent laboratory panel. */
export const SAMPLE_DOCUMENTS_F: DocumentInput[] = [
  {
    title: 'Annual visit, diabetes and weight review',
    kind: 'visit_note',
    date: '2026-02-18',
    facility: 'Riverbend Family Medicine',
    author: 'Dana Whitfield, MD',
    origin: 'sample',
    text: `Riverbend Family Medicine
Annual Visit Note

Patient: Alex Morgan
Date of Service: 02/18/2026

History of Present Illness
Reports improved energy and a 23 pound weight loss since starting semaglutide. Denies myalgias since stopping atorvastatin. Reports occasional nausea after dose increases. Denies chest pain, dyspnea, or palpitations.

Vital Signs
Blood pressure 126/74 mmHg
Heart rate 68 bpm
Weight 179 lb
BMI 26.6

Current Medications
Lisinopril 20 mg once daily
Metformin 1000 mg twice daily
Semaglutide 1 mg weekly
Vitamin D3 2000 units once daily

Discontinued Medications
Atorvastatin 40 mg at bedtime, discontinued 03/09/2025 due to myalgias.

Allergies
Penicillin - rash.
Amoxicillin - rash.

Problem List
Type 2 diabetes.
Hypertension.
Hyperlipidemia.
Obesity.
Vitamin D deficiency.

Assessment
1. Type 2 diabetes, A1c 6.6, metformin increased to 1000 mg twice daily.
2. Hypertension, at goal on lisinopril 20 mg daily.
3. Hyperlipidemia, statin discontinued, LDL rising.
4. Obesity, improving on semaglutide.
5. Vitamin D deficiency, resolved.

Plan
Increase metformin to 1000 mg twice daily.
Increase semaglutide to 1 mg weekly.
Discuss non-statin lipid lowering at next visit.
Repeat A1c, lipid panel, and comprehensive metabolic panel in 6 months.
Continue lisinopril 20 mg daily.`,
  },
  {
    title: 'Lipid panel and comprehensive metabolic panel',
    kind: 'lab_report',
    date: '2026-09-15',
    facility: 'Northside Clinical Laboratories',
    origin: 'sample',
    text: `Northside Clinical Laboratories
Final Report

Patient: Alex Morgan
Collection Date: 09/15/2026

LIPID PANEL
Total Cholesterol        218   H  mg/dL     (<200)
LDL Cholesterol          132   H  mg/dL     (<100)
HDL Cholesterol           46      mg/dL     (>40)
Triglycerides            148      mg/dL     (<150)
Non-HDL Cholesterol      172   H  mg/dL     (<130)

GLYCEMIC
Hemoglobin A1c           6.6   H  %         (4.0-5.6)
Fasting Glucose          122   H  mg/dL     (70-99)

CHEMISTRY
Sodium                   141      mmol/L    (135-145)
Potassium                4.3      mmol/L    (3.5-5.1)
Creatinine               1.10     mg/dL     (0.60-1.30)
eGFR                     78       mL/min/1.73m2
ALT                      35       U/L       (7-56)
AST                      26       U/L       (10-40)
Uric acid                6.8      mg/dL     (3.4-7.0)

INFLAMMATION
hs-CRP                   2.4      mg/L      (<3.0)

VITAMINS AND THYROID
Vitamin D, 25-OH         41       ng/mL     (30-100)
TSH                      2.8      mIU/L     (0.4-4.0)

Vital Signs
Blood pressure 130/80 mmHg
Weight 176 lb

Impression
LDL cholesterol has risen since statin discontinuation. A1c stable on metformin and semaglutide. Potassium within normal limits.`,
  },
];
