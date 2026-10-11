import type { DocumentInput } from '../engine/ingest';

/** 2024: a prescription written against a recorded allergy, and its aftermath. */
export const SAMPLE_DOCUMENTS_C: DocumentInput[] = [
  {
    title: 'Urgent care visit, acute sinusitis',
    kind: 'visit_note',
    date: '2024-02-11',
    facility: 'Lakeshore Urgent Care',
    author: 'Priya Raman, MD',
    origin: 'sample',
    text: `Lakeshore Urgent Care
Urgent Visit Note

Patient: Alex Morgan
Date of Service: 02/11/2024

Chief Complaint
Facial pain and congestion.

History of Present Illness
Five days of nasal congestion, facial pressure, and cough. Symptoms worsening over the past two days. Reports fever of 100.6 F at home last night. Denies chest pain or shortness of breath.

Vital Signs
Blood pressure 132/82 mmHg
Heart rate 88 bpm
Temperature 100.4 F
Oxygen saturation 97 %

Allergies
Penicillin - rash

Assessment
1. Acute sinusitis, bacterial, clinically diagnosed.
2. Hypertension, stable.

Plan
Start amoxicillin-clavulanate 875 mg twice daily for 7 days.
Acetaminophen 500 mg every 6 hours as needed for pain.
Saline nasal irrigation.
Return if symptoms worsen or do not improve within 72 hours.`,
  },
  {
    title: 'Nurse telephone follow-up, medication reaction',
    kind: 'visit_note',
    date: '2024-02-20',
    facility: 'Riverbend Family Medicine',
    author: 'M. Okafor, RN',
    origin: 'sample',
    text: `Riverbend Family Medicine
Telephone Encounter Note

Patient: Alex Morgan
Date of Service: 02/20/2024

History of Present Illness
Patient reports a rash after starting Augmentin on 02/12/2024; medication discontinued on 02/14/2024. Rash described as diffuse, itchy, and improving. Denies swelling of the lips, tongue, or throat. Denies difficulty breathing.

Discontinued Medications
Amoxicillin-clavulanate 875 mg twice daily, discontinued 02/14/2024.

Allergies
Penicillin - rash.
Amoxicillin - rash.

Assessment
1. Acute sinusitis, resolved.
2. Adverse drug reaction to amoxicillin-clavulanate, documented.

Plan
Avoid penicillins and amoxicillin.
Start doxycycline 100 mg twice daily for 5 days for sinusitis.
Follow up if the rash does not resolve within one week.`,
  },
  {
    title: 'Comprehensive laboratory panel',
    kind: 'lab_report',
    date: '2024-06-05',
    facility: 'Northside Clinical Laboratories',
    origin: 'sample',
    text: `Northside Clinical Laboratories
Final Report

Patient: Alex Morgan
Date of Birth: 04/12/1979
Blood type: A positive
Collection Date: 06/05/2024

LIPID PANEL
Total Cholesterol        196      mg/dL     (<200)
LDL Cholesterol          118   H  mg/dL     (<100)
HDL Cholesterol           45      mg/dL     (>40)
Triglycerides            138      mg/dL     (<150)

GLYCEMIC
Hemoglobin A1c           6.4   H  %         (4.0-5.6)
Fasting Glucose          118   H  mg/dL     (70-99)

CHEMISTRY
Sodium                   140      mmol/L    (135-145)
Potassium                4.5      mmol/L    (3.5-5.1)
Creatinine               1.05     mg/dL     (0.60-1.30)
eGFR                     82       mL/min/1.73m2
ALT                      44       U/L       (7-56)
AST                      30       U/L       (10-40)
Uric acid                6.2      mg/dL     (3.4-7.0)

HEMATOLOGY
Hemoglobin               15.2     g/dL      (13.5-17.5)
White blood cell count   6.4      10^3/µL   (4.0-11.0)
Platelet count           232      10^3/µL   (150-450)
Ferritin                 88       ng/mL     (24-336)

VITAMINS
Vitamin D, 25-OH         32       ng/mL     (30-100)

THYROID
TSH                      2.4      mIU/L     (0.4-4.0)

Impression
A1c has risen to 6.4 percent. LDL above goal on atorvastatin 20 mg. Hepatic panel mildly elevated.`,
  },
];
