import type { DocumentInput } from '../engine/ingest';

/* ------------------------------------------------------------------ */
/* Third synthetic subject                                             */
/*                                                                    */
/* Deliberately the opposite of the second: few documents, long gaps,   */
/* two drugs of the same class, and a stopped medication never          */
/* revisited. The point of the cohort layer is that these two records   */
/* behave differently under the same rules.                             */
/* ------------------------------------------------------------------ */

export const SUBJECT_C_DOCUMENTS: DocumentInput[] = [
  {
    title: 'Emergency department note, back pain',
    kind: 'visit_note',
    date: '2023-02-09',
    facility: 'Metro General Emergency',
    author: 'R. Osei, MD',
    origin: 'sample',
    text: `Metro General Emergency
Emergency Department Note

Patient: Tomas Vidal
Date of Service: 02/09/2023

Chief Complaint
Lower back pain after lifting.

History of Present Illness
Three days of lower back pain radiating to the left leg. Denies numbness, weakness, or loss of bladder control. Reports longstanding anxiety.

Vital Signs
Blood pressure 142/88 mmHg
Heart rate 92 bpm
Temperature 98.9 F
Weight 231 lb

Current Medications
Ibuprofen 600 mg three times daily
Naproxen 500 mg twice daily
Sertraline 50 mg once daily

Allergies
No known drug allergies.

Assessment
1. Mechanical low back pain.
2. Anxiety.
3. Obesity.

Plan
Ibuprofen 600 mg three times daily as needed.
Naproxen 500 mg twice daily as needed.
Cyclobenzaprine 10 mg at night.
Return if weakness or incontinence develops.`,
  },
  {
    title: 'Primary care new patient visit',
    kind: 'visit_note',
    date: '2024-09-30',
    facility: 'Northgate Family Practice',
    author: 'L. Bennett, MD',
    origin: 'sample',
    text: `Northgate Family Practice
New Patient Visit

Patient: Tomas Vidal
Date of Service: 09/30/2024

History of Present Illness
New to the practice. Reports intermittent low back pain and occasional heartburn. Denies chest pain, dyspnea or palpitations. Has not taken the medications prescribed in the emergency department for over a year.

Vital Signs
Blood pressure 148/92 mmHg
Heart rate 88 bpm
Weight 244 lb
BMI 34.6

Current Medications
Sertraline 50 mg once daily
Omeprazole 20 mg once daily

Allergies
No known drug allergies.

Problem List
Low back pain.
Anxiety.
Obesity.
Hypertension.

Assessment
1. Hypertension, newly documented, above goal.
2. Obesity class II.
3. Anxiety, stable on sertraline.
4. Low back pain, mechanical.

Plan
Start lisinopril 10 mg once daily.
Start hydrochlorothiazide 12.5 mg once daily.
Baseline laboratory studies ordered.
Follow up in three months.`,
  },
  {
    title: 'Baseline laboratory panel',
    kind: 'lab_report',
    date: '2024-10-14',
    facility: 'Northgate Laboratory Services',
    origin: 'sample',
    text: `Northgate Laboratory Services
Final Report

Patient: Tomas Vidal
Collection Date: 10/14/2024

CHEMISTRY
Sodium                   141      mmol/L    (135-145)
Potassium                4.4      mmol/L    (3.5-5.1)
Creatinine               1.02     mg/dL     (0.60-1.30)
eGFR                     86       mL/min/1.73m2
ALT                      58    H  U/L       (7-56)
AST                      42    H  U/L       (10-40)
Albumin                  4.5      g/dL      (3.5-5.0)

GLYCEMIC
Hemoglobin A1c           5.6      %         (4.0-5.6)
Fasting Glucose           98      mg/dL     (70-99)

LIPID PANEL
Total Cholesterol        212   H  mg/dL     (<200)
LDL Cholesterol          138   H  mg/dL     (<100)
HDL Cholesterol           38   L  mg/dL     (>40)
Triglycerides            218   H  mg/dL     (<150)

Impression
Mildly elevated transaminases. Dyslipidemia.`,
  },
];
