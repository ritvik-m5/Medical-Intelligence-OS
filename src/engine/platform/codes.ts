import type { ConceptCode } from '../types';

/**
 * Terminology mappings.
 *
 * A curated, deliberately partial table. Every entry here is a mapping the
 * platform is willing to assert; concepts outside it stay text-only, and the FHIR
 * export reports exactly which concepts were coded and which were not. A silently
 * guessed code is worse than an honest gap, because a wrong code propagates into
 * other systems as though it had been verified.
 *
 * Codes should be validated against a terminology server before any clinical use.
 */

type Mapping = [shortKey: string, system: string, code: string, display: string];

export const LAB_MAP: Mapping[] = [
  ['hemoglobin-a1c', 'LOINC', '4548-4', 'Hemoglobin A1c/Hemoglobin.total in Blood'],
  ['fasting-glucose', 'LOINC', '1558-6', 'Glucose [Mass/volume] in Serum or Plasma --fasting'],
  ['random-glucose', 'LOINC', '2339-0', 'Glucose [Mass/volume] in Blood'],
  ['total-cholesterol', 'LOINC', '2093-3', 'Cholesterol [Mass/volume] in Serum or Plasma'],
  ['ldl-cholesterol', 'LOINC', '13457-7', 'Cholesterol in LDL [Mass/volume] in Serum or Plasma by calculation'],
  ['hdl-cholesterol', 'LOINC', '2085-9', 'Cholesterol in HDL [Mass/volume] in Serum or Plasma'],
  ['triglycerides', 'LOINC', '2571-8', 'Triglyceride [Mass/volume] in Serum or Plasma'],
  ['non-hdl-cholesterol', 'LOINC', '43396-1', 'Cholesterol non HDL [Mass/volume] in Serum or Plasma'],
  ['apolipoprotein-b', 'LOINC', '1884-6', 'Apolipoprotein B [Mass/volume] in Serum or Plasma'],
  ['lipoprotein-a', 'LOINC', '10835-7', 'Lipoprotein a [Mass/volume] in Serum or Plasma'],
  ['creatinine', 'LOINC', '2160-0', 'Creatinine [Mass/volume] in Serum or Plasma'],
  ['egfr', 'LOINC', '33914-3', 'Glomerular filtration rate/1.73 sq M.predicted'],
  ['bun', 'LOINC', '3094-0', 'Urea nitrogen [Mass/volume] in Serum or Plasma'],
  ['sodium', 'LOINC', '2951-2', 'Sodium [Moles/volume] in Serum or Plasma'],
  ['potassium', 'LOINC', '2823-3', 'Potassium [Moles/volume] in Serum or Plasma'],
  ['chloride', 'LOINC', '2075-0', 'Chloride [Moles/volume] in Serum or Plasma'],
  ['bicarbonate', 'LOINC', '1963-8', 'Bicarbonate [Moles/volume] in Serum or Plasma'],
  ['calcium', 'LOINC', '17861-6', 'Calcium [Mass/volume] in Serum or Plasma'],
  ['magnesium', 'LOINC', '19123-9', 'Magnesium [Mass/volume] in Serum or Plasma'],
  ['albumin', 'LOINC', '1751-7', 'Albumin [Mass/volume] in Serum or Plasma'],
  ['alt', 'LOINC', '1742-6', 'Alanine aminotransferase [Enzymatic activity/volume] in Serum or Plasma'],
  ['ast', 'LOINC', '1920-8', 'Aspartate aminotransferase [Enzymatic activity/volume] in Serum or Plasma'],
  ['alp', 'LOINC', '6768-6', 'Alkaline phosphatase [Enzymatic activity/volume] in Serum or Plasma'],
  ['total-bilirubin', 'LOINC', '1975-2', 'Bilirubin.total [Mass/volume] in Serum or Plasma'],
  ['wbc', 'LOINC', '6690-2', 'Leukocytes [#/volume] in Blood by Automated count'],
  ['rbc', 'LOINC', '789-8', 'Erythrocytes [#/volume] in Blood by Automated count'],
  ['hemoglobin', 'LOINC', '718-7', 'Hemoglobin [Mass/volume] in Blood'],
  ['hematocrit', 'LOINC', '4544-3', 'Hematocrit [Volume Fraction] of Blood by Automated count'],
  ['platelets', 'LOINC', '777-3', 'Platelets [#/volume] in Blood by Automated count'],
  ['mcv', 'LOINC', '787-2', 'MCV [Entitic volume] by Automated count'],
  ['tsh', 'LOINC', '3016-3', 'Thyrotropin [Units/volume] in Serum or Plasma'],
  ['free-t4', 'LOINC', '3024-7', 'Thyroxine (T4) free [Mass/volume] in Serum or Plasma'],
  ['vitamin-d-25-oh', 'LOINC', '1989-3', '25-Hydroxyvitamin D3 [Mass/volume] in Serum or Plasma'],
  ['vitamin-b12', 'LOINC', '2132-9', 'Cobalamin (Vitamin B12) [Mass/volume] in Serum or Plasma'],
  ['ferritin', 'LOINC', '2276-4', 'Ferritin [Mass/volume] in Serum or Plasma'],
  ['iron', 'LOINC', '2498-4', 'Iron [Mass/volume] in Serum or Plasma'],
  ['tibc', 'LOINC', '2500-7', 'Iron binding capacity [Moles/volume] in Serum or Plasma'],
  ['uric-acid', 'LOINC', '3084-1', 'Urate [Mass/volume] in Serum or Plasma'],
  ['crp', 'LOINC', '1988-5', 'C reactive protein [Mass/volume] in Serum or Plasma'],
  ['hs-crp', 'LOINC', '30522-7', 'C reactive protein [Mass/volume] in Serum or Plasma by High sensitivity method'],
  ['esr', 'LOINC', '4537-7', 'Erythrocyte sedimentation rate by Westergren method'],
  ['nt-probnp', 'LOINC', '33762-6', 'NT-proBNP [Mass/volume] in Serum or Plasma'],
  ['troponin', 'LOINC', '10839-9', 'Troponin I.cardiac [Mass/volume] in Serum or Plasma'],
  ['inr', 'LOINC', '6301-6', 'INR in Platelet poor plasma by Coagulation assay'],
  ['psa', 'LOINC', '2857-1', 'Prostate specific Ag [Mass/volume] in Serum or Plasma'],
  ['lipase', 'LOINC', '3040-3', 'Lipase [Enzymatic activity/volume] in Serum or Plasma'],
  ['uacr', 'LOINC', '14959-1', 'Microalbumin/Creatinine [Mass Ratio] in Urine'],
  ['ck', 'LOINC', '2157-6', 'Creatine kinase [Enzymatic activity/volume] in Serum or Plasma'],
];

export const VITAL_MAP: Mapping[] = [
  ['systolic-blood-pressure', 'LOINC', '8480-6', 'Systolic blood pressure'],
  ['diastolic-blood-pressure', 'LOINC', '8462-4', 'Diastolic blood pressure'],
  ['heart-rate', 'LOINC', '8867-4', 'Heart rate'],
  ['respiratory-rate', 'LOINC', '9279-1', 'Respiratory rate'],
  ['body-temperature', 'LOINC', '8310-5', 'Body temperature'],
  ['oxygen-saturation', 'LOINC', '2708-6', 'Oxygen saturation in Arterial blood'],
  ['weight', 'LOINC', '29463-7', 'Body weight'],
  ['height', 'LOINC', '8302-2', 'Body height'],
  ['bmi', 'LOINC', '39156-5', 'Body mass index (BMI) [Ratio]'],
];

export const DRUG_MAP: Mapping[] = [
  ['atorvastatin', 'RxNorm', '83367', 'atorvastatin'],
  ['rosuvastatin', 'RxNorm', '301542', 'rosuvastatin'],
  ['simvastatin', 'RxNorm', '36567', 'simvastatin'],
  ['pravastatin', 'RxNorm', '42463', 'pravastatin'],
  ['ezetimibe', 'RxNorm', '341248', 'ezetimibe'],
  ['lisinopril', 'RxNorm', '29046', 'lisinopril'],
  ['enalapril', 'RxNorm', '3827', 'enalapril'],
  ['ramipril', 'RxNorm', '35296', 'ramipril'],
  ['losartan', 'RxNorm', '52175', 'losartan'],
  ['valsartan', 'RxNorm', '69749', 'valsartan'],
  ['amlodipine', 'RxNorm', '17767', 'amlodipine'],
  ['nifedipine', 'RxNorm', '7417', 'nifedipine'],
  ['metoprolol', 'RxNorm', '6918', 'metoprolol'],
  ['atenolol', 'RxNorm', '1202', 'atenolol'],
  ['carvedilol', 'RxNorm', '20352', 'carvedilol'],
  ['hydrochlorothiazide', 'RxNorm', '5487', 'hydrochlorothiazide'],
  ['furosemide', 'RxNorm', '4603', 'furosemide'],
  ['spironolactone', 'RxNorm', '9997', 'spironolactone'],
  ['metformin', 'RxNorm', '6809', 'metformin'],
  ['levothyroxine', 'RxNorm', '10582', 'levothyroxine'],
  ['omeprazole', 'RxNorm', '7646', 'omeprazole'],
  ['pantoprazole', 'RxNorm', '40790', 'pantoprazole'],
  ['sertraline', 'RxNorm', '36437', 'sertraline'],
  ['escitalopram', 'RxNorm', '321988', 'escitalopram'],
  ['bupropion', 'RxNorm', '42347', 'bupropion'],
  ['gabapentin', 'RxNorm', '25480', 'gabapentin'],
  ['acetaminophen', 'RxNorm', '161', 'acetaminophen'],
  ['ibuprofen', 'RxNorm', '5640', 'ibuprofen'],
  ['naproxen', 'RxNorm', '7258', 'naproxen'],
  ['aspirin', 'RxNorm', '1191', 'aspirin'],
  ['clopidogrel', 'RxNorm', '32968', 'clopidogrel'],
  ['warfarin', 'RxNorm', '11289', 'warfarin'],
  ['apixaban', 'RxNorm', '1364430', 'apixaban'],
  ['prednisone', 'RxNorm', '8640', 'prednisone'],
  ['albuterol', 'RxNorm', '435', 'albuterol'],
  ['montelukast', 'RxNorm', '88249', 'montelukast'],
  ['allopurinol', 'RxNorm', '519', 'allopurinol'],
  ['amoxicillin', 'RxNorm', '723', 'amoxicillin'],
  ['amoxicillin-clavulanate', 'RxNorm', '19711', 'amoxicillin / clavulanate'],
  ['azithromycin', 'RxNorm', '18631', 'azithromycin'],
  ['doxycycline', 'RxNorm', '3640', 'doxycycline'],
  ['cephalexin', 'RxNorm', '2231', 'cephalexin'],
  ['nitrofurantoin', 'RxNorm', '7454', 'nitrofurantoin'],
  ['trimethoprim-sulfamethoxazole', 'RxNorm', '10180', 'sulfamethoxazole / trimethoprim'],
  ['cholecalciferol', 'RxNorm', '2418', 'cholecalciferol'],
  ['cyanocobalamin', 'RxNorm', '11248', 'cyanocobalamin'],
  ['ferrous-sulfate', 'RxNorm', '4290', 'ferrous sulfate'],
];


export const CONDITION_MAP: Mapping[] = [
  ['type-2-diabetes', 'SNOMED', '44054006', 'Diabetes mellitus type 2'],
  ['type-2-diabetes', 'ICD-10', 'E11.9', 'Type 2 diabetes mellitus without complications'],
  ['prediabetes', 'SNOMED', '714628002', 'Prediabetes'],
  ['hypertension', 'SNOMED', '38341003', 'Hypertensive disorder, systemic arterial'],
  ['hypertension', 'ICD-10', 'I10', 'Essential (primary) hypertension'],
  ['hyperlipidemia', 'SNOMED', '55822004', 'Hyperlipidemia'],
  ['hyperlipidemia', 'ICD-10', 'E78.5', 'Hyperlipidemia, unspecified'],
  ['obesity', 'SNOMED', '414916001', 'Obesity'],
  ['obesity', 'ICD-10', 'E66.9', 'Obesity, unspecified'],
  ['chronic-kidney-disease', 'SNOMED', '709044004', 'Chronic kidney disease'],
  ['chronic-kidney-disease', 'ICD-10', 'N18.9', 'Chronic kidney disease, unspecified'],
  ['hypothyroidism', 'SNOMED', '40930008', 'Hypothyroidism'],
  ['hypothyroidism', 'ICD-10', 'E03.9', 'Hypothyroidism, unspecified'],
  ['gerd', 'SNOMED', '235595009', 'Gastroesophageal reflux disease'],
  ['gerd', 'ICD-10', 'K21.9', 'GERD without esophagitis'],
  ['asthma', 'SNOMED', '195967001', 'Asthma'],
  ['asthma', 'ICD-10', 'J45.909', 'Unspecified asthma, uncomplicated'],
  ['gout', 'SNOMED', '90560007', 'Gout'],
  ['gout', 'ICD-10', 'M10.9', 'Gout, unspecified'],
  ['iron-deficiency-anemia', 'SNOMED', '87522002', 'Iron deficiency anemia'],
  ['iron-deficiency-anemia', 'ICD-10', 'D50.9', 'Iron deficiency anemia, unspecified'],
  ['vitamin-d-deficiency', 'SNOMED', '34713006', 'Vitamin D deficiency'],
  ['vitamin-d-deficiency', 'ICD-10', 'E55.9', 'Vitamin D deficiency, unspecified'],
  ['coronary-artery-disease', 'SNOMED', '53741008', 'Coronary arteriosclerosis'],
  ['coronary-artery-disease', 'ICD-10', 'I25.10', 'Atherosclerotic heart disease of native coronary artery'],
  ['atrial-fibrillation', 'SNOMED', '49436004', 'Atrial fibrillation'],
  ['atrial-fibrillation', 'ICD-10', 'I48.91', 'Unspecified atrial fibrillation'],
  ['heart-failure', 'SNOMED', '84114007', 'Heart failure'],
  ['heart-failure', 'ICD-10', 'I50.9', 'Heart failure, unspecified'],
  ['sinusitis', 'SNOMED', '36971009', 'Sinusitis'],
  ['sinusitis', 'ICD-10', 'J01.90', 'Acute sinusitis, unspecified'],
  ['urinary-tract-infection', 'SNOMED', '68566005', 'Urinary tract infectious disease'],
  ['depression', 'SNOMED', '35489007', 'Depressive disorder'],
  ['anxiety', 'SNOMED', '48694002', 'Anxiety'],
  ['gastritis', 'SNOMED', '4556007', 'Gastritis'],
  ['diverticular-disease', 'SNOMED', '398036000', 'Diverticular disease'],
  ['fatty-liver', 'SNOMED', '197321007', 'Steatosis of liver'],
  ['migraine', 'SNOMED', '37796009', 'Migraine'],
  ['osteoarthritis', 'SNOMED', '396275006', 'Osteoarthritis'],
  ['sleep-apnea', 'SNOMED', '78275009', 'Obstructive sleep apnea syndrome'],
];

export const IMMUNIZATION_MAP: Mapping[] = [
  ['influenza-vaccine', 'CVX', '88', 'Influenza, unspecified formulation'],
  ['covid19-vaccine', 'CVX', '208', 'COVID-19, mRNA, LNP-S, PF, 30 mcg/0.3 mL dose'],
  ['tdap', 'CVX', '115', 'Tdap'],
  ['hepatitis-b-vaccine', 'CVX', '43', 'Hepatitis B, adult dosage'],
  ['mmr-vaccine', 'CVX', '03', 'MMR'],
  ['varicella-vaccine', 'CVX', '21', 'Varicella'],
  ['zoster-vaccine', 'CVX', '187', 'Recombinant zoster vaccine'],
];

export const PROCEDURE_MAP: Mapping[] = [
  ['colonoscopy', 'SNOMED', '73761001', 'Colonoscopy'],
  ['upper-endoscopy', 'SNOMED', '44441009', 'Upper gastrointestinal endoscopy'],
  ['mri', 'SNOMED', '113091000', 'Magnetic resonance imaging'],
  ['ct-scan', 'SNOMED', '77477000', 'Computed tomography'],
  ['x-ray', 'SNOMED', '363680008', 'Radiographic imaging procedure'],
  ['ultrasound', 'SNOMED', '16310003', 'Ultrasonography'],
  ['mammogram', 'SNOMED', '71651007', 'Mammography'],
  ['ecg', 'SNOMED', '29303009', 'Electrocardiographic procedure'],
  ['echocardiogram', 'SNOMED', '40701008', 'Echocardiography'],
  ['cholecystectomy', 'SNOMED', '38102005', 'Cholecystectomy'],
  ['sleep-study', 'SNOMED', '23208003', 'Polysomnography'],
];


const KIND_BY_MAP: Array<[Mapping[], string]> = [
  [LAB_MAP, 'measurement'],
  [VITAL_MAP, 'vital'],
  [DRUG_MAP, 'medication'],
  [CONDITION_MAP, 'condition'],
  [IMMUNIZATION_MAP, 'immunization'],
  [PROCEDURE_MAP, 'procedure'],
];

/** entityKey → standard codes. Static and deterministic. */
export const CODES_BY_ENTITY_KEY: Map<string, ConceptCode[]> = (() => {
  const map = new Map<string, ConceptCode[]>();
  for (const [table, kind] of KIND_BY_MAP) {
    for (const [short, system, code, display] of table) {
      const key = `${kind}:${short}`;
      const entry: ConceptCode = { system: system as ConceptCode['system'], code, display };
      const list = map.get(key);
      if (list) list.push(entry);
      else map.set(key, [entry]);
    }
  }
  return map;
})();

export function codesFor(entityKey: string): ConceptCode[] {
  return CODES_BY_ENTITY_KEY.get(entityKey) ?? [];
}

export function primaryCodeFor(entityKey: string): ConceptCode | undefined {
  return codesFor(entityKey)[0];
}

export interface CodingCoverage {
  total: number;
  coded: number;
  bySystem: Record<string, number>;
  uncodedKeys: string[];
  note: string;
}

/**
 * How much of the graph carries standard codes.
 *
 * Reported rather than assumed, because an export that silently drops codes is
 * the kind of thing discovered in production rather than in review.
 */
export function codingCoverage(entityKeys: string[]): CodingCoverage {
  const bySystem: Record<string, number> = {};
  const uncodedKeys: string[] = [];
  let coded = 0;
  for (const key of entityKeys) {
    const codes = codesFor(key);
    if (codes.length === 0) {
      uncodedKeys.push(key);
      continue;
    }
    coded += 1;
    for (const code of codes) bySystem[code.system] = (bySystem[code.system] ?? 0) + 1;
  }
  return {
    total: entityKeys.length,
    coded,
    bySystem,
    uncodedKeys,
    note: 'Mappings are curated and partial. Unmapped concepts are exported as text so nothing is lost, and are listed here so the gap stays visible.',
  };
}

