import type { ExternalEvidence } from '../types';
import { condition } from './evidenceTypes';

/**
 * Condition education and trial lookups.
 *
 * Only the MedlinePlus topic URLs that were verified to resolve are used; every
 * other entry links to the source's own search page instead of a guessed URL.
 */
export const CONDITION_EVIDENCE: ExternalEvidence[] = [
  condition(
    'ev_t2d',
    'Type 2 diabetes',
    'type 2 diabetes',
    ['condition:type-2-diabetes', 'condition:diabetes', 'condition:prediabetes'],
    'Type 2 diabetes is a disorder of glucose regulation in which insulin resistance and reduced insulin secretion lead to raised blood glucose. Diagnosis and monitoring commonly use A1c and glucose testing.',
    'https://medlineplus.gov/diabetes.html',
  ),
  condition(
    'ev_hypertension',
    'Hypertension',
    'hypertension',
    ['condition:hypertension', 'vital:systolic-blood-pressure', 'vital:diastolic-blood-pressure'],
    'Hypertension is persistently raised arterial blood pressure. It is usually asymptomatic and is diagnosed from repeated measurements over separate occasions.',
    'https://medlineplus.gov/highbloodpressure.html',
  ),
  condition(
    'ev_hyperlipidemia',
    'High cholesterol',
    'hyperlipidemia',
    ['condition:hyperlipidemia', 'measurement:ldl-cholesterol'],
    'Hyperlipidemia refers to raised circulating lipids, most often LDL cholesterol or triglycerides. It is generally managed with lifestyle measures and, where indicated, lipid-lowering medication.',
  ),
  condition(
    'ev_obesity',
    'Obesity',
    'obesity',
    ['condition:obesity', 'condition:overweight', 'vital:bmi'],
    'Obesity is classified using body mass index and additional measures such as waist circumference. It is associated with increased risk of type 2 diabetes, cardiovascular disease and sleep apnoea.',
  ),
  condition(
    'ev_ckd',
    'Chronic kidney disease',
    'chronic kidney disease',
    ['condition:chronic-kidney-disease', 'measurement:egfr', 'measurement:creatinine'],
    'Chronic kidney disease is a sustained reduction in kidney function or evidence of kidney damage. It is staged using estimated GFR and markers such as urine albumin.',
  ),
  condition(
    'ev_hypothyroidism',
    'Hypothyroidism',
    'hypothyroidism',
    ['condition:hypothyroidism', 'measurement:tsh'],
    'Hypothyroidism is underactive thyroid function, which reduces metabolic rate. It is typically diagnosed and monitored with thyroid function tests.',
  ),
  condition(
    'ev_gerd',
    'GERD',
    'gastroesophageal reflux disease',
    ['condition:gerd', 'condition:gastritis'],
    'Gastroesophageal reflux disease is the backflow of stomach contents into the oesophagus, causing symptoms such as heartburn. Persistent symptoms may be investigated with endoscopy.',
  ),
  condition(
    'ev_asthma',
    'Asthma',
    'asthma',
    ['condition:asthma', 'medication:albuterol', 'medication:fluticasone'],
    'Asthma is a chronic inflammatory airway disease causing variable airflow obstruction. It is generally assessed with symptom history and lung function testing.',
  ),
  condition(
    'ev_gout',
    'Gout',
    'gout',
    ['condition:gout', 'measurement:uric-acid'],
    'Gout is inflammatory arthritis caused by deposition of urate crystals in joints. It is associated with raised uric acid and is treated with anti-inflammatory therapy and, where indicated, urate lowering.',
  ),
  condition(
    'ev_anemia',
    'Anaemia and iron deficiency',
    'iron deficiency anemia',
    ['condition:anemia', 'condition:iron-deficiency-anemia', 'measurement:hemoglobin'],
    'Anaemia is a reduction in haemoglobin or red cell mass. Iron deficiency is a common cause and is evaluated with iron studies alongside the blood count.',
  ),
  condition(
    'ev_vitd_def',
    'Vitamin D deficiency',
    'vitamin D deficiency',
    ['condition:vitamin-d-deficiency', 'measurement:vitamin-d-25-oh'],
    'Vitamin D deficiency is a low level of 25-hydroxyvitamin D. It is generally treated with supplementation, with the dose and target level set by the treating clinician.',
  ),
  condition(
    'ev_sleep_apnea',
    'Obstructive sleep apnoea',
    'obstructive sleep apnea',
    ['condition:sleep-apnea', 'procedure:sleep-study'],
    'Obstructive sleep apnoea is repeated upper airway obstruction during sleep. It is generally diagnosed with a sleep study and is associated with hypertension and cardiovascular risk.',
  ),
  condition(
    'ev_masld',
    'Fatty liver disease (MASLD)',
    'metabolic dysfunction-associated steatotic liver disease',
    ['condition:fatty-liver', 'measurement:alt', 'measurement:ast'],
    'Metabolic dysfunction-associated steatotic liver disease describes fat accumulation in the liver linked to metabolic risk factors. It is often first suspected from mildly raised liver enzymes or imaging.',
  ),
  condition(
    'ev_cholelithiasis',
    'Gallstones',
    'cholelithiasis',
    ['condition:cholelithiasis', 'procedure:cholecystectomy', 'procedure:ultrasound'],
    'Gallstones are solid deposits in the gallbladder. They are commonly identified on ultrasound, and symptomatic disease is frequently treated by removing the gallbladder.',
  ),
];
