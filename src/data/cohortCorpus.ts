import type { DocumentInput } from '../engine/ingest';
import type { Patient } from '../engine/types';

/* ------------------------------------------------------------------ */
/* Additional synthetic subjects                                       */
/*                                                                    */
/* Two more records, written to be genuinely different from the first:  */
/* one well-kept and tightly monitored, one sparse and disorganised.    */
/* The cohort layer is only meaningful if the subjects differ, so the   */
/* difference here is structural rather than cosmetic.                  */
/* ------------------------------------------------------------------ */

export const SUBJECT_B_PATIENT: Patient = {
  id: 'synthetic-priya-raman',
  name: 'Priya Raman',
  dateOfBirth: '1962-11-03',
  sex: 'female',
  synthetic: true,
};

export const SUBJECT_C_PATIENT: Patient = {
  id: 'synthetic-tomas-vidal',
  name: 'Tomas Vidal',
  dateOfBirth: '1985-06-21',
  sex: 'male',
  synthetic: true,
};

export const SUBJECT_B_DOCUMENTS: DocumentInput[] = [
  {
    title: 'Primary care review, thyroid and bone health',
    kind: 'visit_note',
    date: '2024-04-18',
    facility: 'Harbourview Medical Group',
    author: 'S. Chen, MD',
    origin: 'sample',
    text: `Harbourview Medical Group
Primary Care Review

Patient: Priya Raman
Date of Birth: 11/03/1962
Date of Service: 04/18/2024

History of Present Illness
Reports cold intolerance and fatigue over the past four months. Denies palpitations, chest pain or shortness of breath.

Vital Signs
Blood pressure 128/76 mmHg
Heart rate 64 bpm
Weight 148 lb
BMI 25.1

Current Medications
Levothyroxine 75 mcg once daily
Atorvastatin 20 mg at bedtime
Calcium carbonate 600 mg twice daily

Allergies
Sulfa drugs - rash.

Problem List
Hypothyroidism.
Hyperlipidemia.
Osteopenia.

Assessment
1. Hypothyroidism, symptoms suggest under-replacement.
2. Hyperlipidemia, stable.
3. Osteopenia.

Plan
Repeat TSH and free T4 in six weeks.
Repeat lipid panel in six months.
Continue levothyroxine 75 mcg daily.`,
  },
  {
    title: 'Thyroid and lipid panel',
    kind: 'lab_report',
    date: '2024-06-02',
    facility: 'Harbourview Laboratory',
    origin: 'sample',
    text: `Harbourview Laboratory
Final Report

Patient: Priya Raman
Collection Date: 06/02/2024

THYROID
TSH                      8.4   H  mIU/L     (0.4-4.0)
Free T4                  0.7   L  ng/dL     (0.8-1.8)

LIPID PANEL
Total Cholesterol        188      mg/dL     (<200)
LDL Cholesterol          104   H  mg/dL     (<100)
HDL Cholesterol           58      mg/dL     (>40)
Triglycerides            112      mg/dL     (<150)

CHEMISTRY
Sodium                   139      mmol/L    (135-145)
Potassium                4.0      mmol/L    (3.5-5.1)
Creatinine               0.82     mg/dL     (0.60-1.30)
eGFR                     76       mL/min/1.73m2
ALT                      22       U/L       (7-56)
Calcium                  9.6      mg/dL     (8.6-10.2)
Albumin                  4.3      g/dL      (3.5-5.0)

Impression
TSH elevated with low free T4, consistent with under-replacement.`,
  },
  {
    title: 'Thyroid follow-up after dose increase',
    kind: 'visit_note',
    date: '2024-08-14',
    facility: 'Harbourview Medical Group',
    author: 'S. Chen, MD',
    origin: 'sample',
    text: `Harbourview Medical Group
Follow-up Visit

Patient: Priya Raman
Date of Service: 08/14/2024

History of Present Illness
Reports improved energy since the dose change. Cold intolerance has resolved. Denies palpitations.

Vital Signs
Blood pressure 124/74 mmHg
Heart rate 70 bpm
Weight 146 lb

Current Medications
Levothyroxine 100 mcg once daily
Atorvastatin 20 mg at bedtime
Calcium carbonate 600 mg twice daily

Allergies
Sulfa drugs - rash.

Problem List
Hypothyroidism.
Hyperlipidemia.
Osteopenia.

Assessment
1. Hypothyroidism, improved on levothyroxine 100 mcg.
2. Hyperlipidemia, stable.
3. Osteopenia.

Plan
Repeat TSH in three months.
Continue current medications.`,
  },

  {
    title: 'Thyroid function and bone density review',
    kind: 'lab_report',
    date: '2024-11-20',
    facility: 'Harbourview Laboratory',
    origin: 'sample',
    text: `Harbourview Laboratory
Final Report

Patient: Priya Raman
Collection Date: 11/20/2024

THYROID
TSH                      2.6      mIU/L     (0.4-4.0)
Free T4                  1.2      ng/dL     (0.8-1.8)

VITAMINS
Vitamin D, 25-OH         34       ng/mL     (30-100)

CHEMISTRY
Creatinine               0.80     mg/dL     (0.60-1.30)
eGFR                     78       mL/min/1.73m2
Calcium                  9.5      mg/dL     (8.6-10.2)
Potassium                4.1      mmol/L    (3.5-5.1)

Impression
Thyroid function now within range on levothyroxine 100 mcg.`,
  },
  {
    title: 'Annual visit with lipid panel',
    kind: 'visit_note',
    date: '2025-05-06',
    facility: 'Harbourview Medical Group',
    author: 'S. Chen, MD',
    origin: 'sample',
    text: `Harbourview Medical Group
Annual Visit Note

Patient: Priya Raman
Date of Service: 05/06/2025

History of Present Illness
Feels well. Denies fatigue, palpitations or weight change.

Vital Signs
Blood pressure 122/72 mmHg
Heart rate 66 bpm
Weight 145 lb
BMI 24.6

Current Medications
Levothyroxine 100 mcg once daily
Atorvastatin 20 mg at bedtime
Calcium carbonate 600 mg twice daily

Allergies
Sulfa drugs - rash.

Problem List
Hypothyroidism.
Hyperlipidemia.
Osteopenia.

Immunizations
Influenza vaccine administered 10/12/2024.

Assessment
1. Hypothyroidism, stable.
2. Hyperlipidemia, at goal.
3. Osteopenia.

Plan
Repeat TSH, lipid panel and comprehensive metabolic panel.
Continue current medications.`,
  },
  {
    title: 'Lipid panel, thyroid and comprehensive metabolic panel',
    kind: 'lab_report',
    date: '2025-06-15',
    facility: 'Harbourview Laboratory',
    origin: 'sample',
    text: `Harbourview Laboratory
Final Report

Patient: Priya Raman
Collection Date: 06/15/2025

LIPID PANEL
Total Cholesterol        176      mg/dL     (<200)
LDL Cholesterol           92      mg/dL     (<100)
HDL Cholesterol           60      mg/dL     (>40)
Triglycerides            104      mg/dL     (<150)

THYROID
TSH                      2.9      mIU/L     (0.4-4.0)
Free T4                  1.3      ng/dL     (0.8-1.8)

CHEMISTRY
Sodium                   140      mmol/L    (135-145)
Potassium                4.2      mmol/L    (3.5-5.1)
Creatinine               0.79     mg/dL     (0.60-1.30)
eGFR                     79       mL/min/1.73m2
ALT                      20       U/L       (7-56)
Calcium                  9.4      mg/dL     (8.6-10.2)

Impression
All monitored parameters within range.`,
  },
];
