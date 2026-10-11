import type { DocumentInput } from '../engine/ingest';

/** 2024-2025: therapy escalation, then a hospital admission. */
export const SAMPLE_DOCUMENTS_D: DocumentInput[] = [
  {
    title: 'Annual visit, diabetes risk review',
    kind: 'visit_note',
    date: '2024-11-14',
    facility: 'Riverbend Family Medicine',
    author: 'Dana Whitfield, MD',
    origin: 'sample',
    text: `Riverbend Family Medicine
Annual Visit Note

Patient: Alex Morgan
Date of Service: 11/14/2024

History of Present Illness
Reports fatigue and intermittent nasal congestion. Denies chest pain, dyspnea, palpitations, or edema. Has gained approximately 8 pounds over the past year.

Vital Signs
Blood pressure 134/84 mmHg
Heart rate 76 bpm
Weight 202 lb
BMI 30.0

Current Medications
Lisinopril 20 mg once daily
Atorvastatin 40 mg at bedtime
Metformin 500 mg twice daily
Vitamin D3 2000 units once daily
Montelukast 10 mg at bedtime

Allergies
Penicillin - rash.
Amoxicillin - rash.

Problem List
Hyperlipidemia.
Prediabetes.
Hypertension.
Obesity class I.
Sinusitis.

Immunizations
Influenza vaccine administered 11/02/2023.

Assessment
1. Prediabetes, A1c 6.4 in June, now on metformin 500 mg twice daily.
2. Hypertension, improved on lisinopril 20 mg daily.
3. Hyperlipidemia, LDL 118, atorvastatin increased to 40 mg nightly.
4. Obesity class I.
5. Recurrent sinusitis.

Plan
Continue lisinopril 20 mg daily.
Continue atorvastatin 40 mg nightly.
Continue metformin 500 mg twice daily.
Continue montelukast 10 mg nightly.
Repeat A1c and lipid panel in 6 months.
Referral to nutrition for weight management.`,
  },
  {
    title: 'Pharmacy medication list',
    kind: 'medication_list',
    date: '2025-01-20',
    facility: 'Corner Pharmacy',
    origin: 'sample',
    text: `Corner Pharmacy
Medication List
Generated 01/20/2025

Patient: Alex Morgan
Date of Birth: 04/12/1979

Current Medications
Lisinopril 20 mg once daily
Atorvastatin 40 mg at bedtime
Metformin 500 mg twice daily
Vitamin D3 2000 units once daily
Semaglutide 0.25 mg weekly, started 01/06/2025

Discontinued Medications
Amoxicillin-clavulanate 875 mg twice daily, discontinued 02/14/2024.

Allergies on file
Penicillin.
Amoxicillin.

Notes
Patient counselled on injection technique for semaglutide.`,
  },
  {
    title: 'Hospital discharge summary, laparoscopic cholecystectomy',
    kind: 'discharge_summary',
    date: '2025-03-11',
    facility: 'St. Catherine Regional Hospital',
    author: 'J. Alvarez, MD',
    origin: 'sample',
    text: `St. Catherine Regional Hospital
Discharge Summary

Patient: Alex Morgan
Date of Birth: 04/12/1979
Blood type: O positive
Admission Date: 03/09/2025
Discharge Date: 03/11/2025

Chief Complaint
Right upper quadrant pain.

Hospital Course
Admitted with biliary colic. Ultrasound demonstrated cholelithiasis without ductal dilatation. Underwent laparoscopic cholecystectomy on 03/10/2025 without complication. Tolerated diet on postoperative day one.

Procedures Performed
Laparoscopic cholecystectomy performed 03/10/2025.
Abdominal ultrasound performed 03/09/2025.

Vital Signs
Blood pressure 128/76 mmHg
Heart rate 82 bpm
Temperature 98.6 F
Oxygen saturation 96 %

Results
Creatinine               1.20     mg/dL     (0.60-1.30)
Potassium                4.6      mmol/L    (3.5-5.1)
Hemoglobin               12.8     g/dL      (13.5-17.5)
White blood cell count   11.2     H  10^3/µL (4.0-11.0)
ALT                      52       U/L       (7-56)

Discontinued Medications
Atorvastatin 40 mg at bedtime, discontinued 03/09/2025 due to myalgias.

Discharge Medications
Lisinopril 20 mg once daily
Metformin 500 mg twice daily
Vitamin D3 2000 units once daily
Semaglutide 0.5 mg weekly

Allergies
Penicillin - rash.
Amoxicillin - rash.

Assessment
1. Symptomatic cholelithiasis, status post laparoscopic cholecystectomy.
2. Hyperlipidemia, statin discontinued due to myalgias.
3. Prediabetes, on metformin.
4. Hypertension, controlled.

Plan
Follow up with primary care in two weeks.
Continue lisinopril 20 mg daily.
Continue metformin 500 mg twice daily.
Avoid statins pending discussion of alternatives.
Consider lipid-lowering alternatives at follow-up.`,
  },
];
