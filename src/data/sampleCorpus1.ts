import type { DocumentInput } from '../engine/ingest';
import type { Patient } from '../engine/types';

export const SAMPLE_PATIENT: Patient = {
  id: 'synthetic-alex-morgan',
  name: 'Alex Morgan',
  dateOfBirth: '1979-04-12',
  sex: 'male',
  synthetic: true,
};

/**
 * A synthetic patient record spanning March 2022 to September 2026.
 *
 * It is deliberately not clean. It contains a medication that is stopped and
 * then listed again, a prescription written against a recorded allergy, two
 * different blood types, a decimal-shift typo in a lab value, a repeated event
 * with two dates, and a condition that is resolved and then re-documented.
 *
 * Every one of those is a pattern the engines are supposed to catch, and none of
 * them were added to make the demo look clever — they are the ordinary failure
 * modes of real longitudinal records.
 */
export const SAMPLE_DOCUMENTS_A: DocumentInput[] = [
  {
    title: 'Annual physical examination',
    kind: 'visit_note',
    date: '2022-03-14',
    facility: 'Riverbend Family Medicine',
    author: 'Dana Whitfield, MD',
    origin: 'sample',
    text: `Riverbend Family Medicine
Annual Physical Examination

Patient: Alex Morgan
Date of Birth: 04/12/1979
Sex: Male
Date of Service: 03/14/2022

Chief Complaint
Routine annual examination.

History of Present Illness
52-year-old male presenting for annual physical. Reports intermittent fatigue and occasional heartburn. Denies chest pain, shortness of breath, or palpitations.

Past Medical History
Hyperlipidemia, diagnosed 2019.
Hypertension, diagnosed 2018.

Vital Signs
Blood pressure 138/86 mmHg
Heart rate 78 bpm
Respiratory rate 16
Temperature 98.4 F
Weight 198 lb
Height 70 in
BMI 29.4

Current Medications
Lisinopril 10 mg once daily
Atorvastatin 20 mg at bedtime

Allergies
Penicillin - rash

Social History
Former smoker, quit 2015, 12 pack-year history. Alcohol use 2 drinks per week. Physical activity: sedentary.

Assessment
1. Hyperlipidemia, LDL above goal.
2. Prediabetes, impaired fasting glucose documented 2021.
3. Hypertension, above goal today.
4. Obesity class I.

Plan
Order lipid panel and hemoglobin A1c.
Continue lisinopril 10 mg daily.
Continue atorvastatin 20 mg nightly.
Counsel on diet and exercise.
Follow up in 3 months.`,
  },
  {
    title: 'Lipid panel and hemoglobin A1c',
    kind: 'lab_report',
    date: '2022-03-21',
    facility: 'Northside Clinical Laboratories',
    author: 'Laboratory Medicine',
    origin: 'sample',
    text: `Northside Clinical Laboratories
Final Report

Patient: Alex Morgan
Date of Birth: 04/12/1979
Collection Date: 03/21/2022
Ordering Provider: Dana Whitfield, MD

LIPID PANEL
Total Cholesterol        214      mg/dL     (<200)
LDL Cholesterol          142   H  mg/dL     (<100)
HDL Cholesterol           41      mg/dL     (>40)
Triglycerides            168   H  mg/dL     (<150)
Non-HDL Cholesterol      173   H  mg/dL     (<130)

GLYCEMIC
Hemoglobin A1c           5.9   H  %         (4.0-5.6)
Fasting Glucose          104   H  mg/dL     (70-99)

CHEMISTRY
Sodium                   140      mmol/L    (135-145)
Potassium                4.2      mmol/L    (3.5-5.1)
Chloride                 103      mmol/L    (98-107)
Creatinine               1.00     mg/dL     (0.60-1.30)
eGFR                     88       mL/min/1.73m2
ALT                      32       U/L       (7-56)
AST                      24       U/L       (10-40)

Impression
LDL cholesterol above goal. Triglycerides mildly elevated. A1c consistent with prediabetes.`,
  },
  {
    title: 'Lipid panel, hepatic panel and chemistry',
    kind: 'lab_report',
    date: '2022-09-08',
    facility: 'Northside Clinical Laboratories',
    origin: 'sample',
    text: `Northside Clinical Laboratories
Final Report

Patient: Alex Morgan
Collection Date: 09/08/2022

LIPID PANEL
Total Cholesterol        198      mg/dL     (<200)
LDL Cholesterol          128   H  mg/dL     (<100)
HDL Cholesterol           43      mg/dL     (>40)
Triglycerides            152   H  mg/dL     (<150)

GLYCEMIC
Hemoglobin A1c           5.8   H  %         (4.0-5.6)
Fasting Glucose           98      mg/dL     (70-99)

CHEMISTRY
Sodium                   139      mmol/L    (135-145)
Potassium                4.4      mmol/L    (3.5-5.1)
Creatinine               0.98     mg/dL     (0.60-1.30)
eGFR                     89       mL/min/1.73m2
ALT                      30       U/L       (7-56)
AST                      22       U/L       (10-40)

Impression
LDL improved on atorvastatin 20 mg. Continue current therapy.`,
  },
];
