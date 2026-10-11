import { lab, type ConceptSpec } from './lexiconTypes';

/** Labs part 3: vitamins, inflammation, cardiac, coagulation, other. */
export const LAB_SPECS_3: ConceptSpec[] = [
  lab('vitamin-d-25-oh', 'Vitamin D, 25-OH', 'Vitamins', 'vitamin d 25-oh|25-oh vitamin d|vitamin d|25 hydroxyvitamin d|25-oh-d|vitamin d level', 'ng/mL', 30, 100, 1, 300, '30-100 ng/mL (typical)'),
  lab('vitamin-d-1-25', 'Vitamin D, 1,25-OH', 'Vitamins', 'vitamin d 1,25|1,25-dihydroxyvitamin d|calcitriol', 'pg/mL', 18, 72, 1, 300, '18-72 pg/mL (typical)'),
  lab('vitamin-b12', 'Vitamin B12', 'Vitamins', 'vitamin b12|b12|cobalamin', 'pg/mL', 200, 900, 20, 5000, '200-900 pg/mL (typical)'),
  lab('folate', 'Folate', 'Vitamins', 'folate|folic acid|serum folate', 'ng/mL', 3, 20, 0.5, 100, '3-20 ng/mL (typical)'),
  lab('crp', 'C-Reactive Protein', 'Inflammation', 'c-reactive protein|crp|c reactive protein', 'mg/L', null, 3.0, 0.01, 500, '<3.0 mg/L (typical)'),
  lab('hs-crp', 'hs-CRP', 'Inflammation', 'hs-crp|high sensitivity crp|high-sensitivity c-reactive protein', 'mg/L', null, 3.0, 0.01, 500, '<3.0 mg/L (typical)'),
  lab('esr', 'ESR', 'Inflammation', 'esr|erythrocyte sedimentation rate|sed rate', 'mm/hr', null, 20, 0.5, 200, '<20 mm/hr (typical)'),
  lab('homocysteine', 'Homocysteine', 'Inflammation', 'homocysteine|total homocysteine', 'µmol/L', null, 15, 0.5, 400, '<15 µmol/L (typical)'),
  lab('nt-probnp', 'NT-proBNP', 'Cardiac', 'nt-probnp|pro-bnp|nt probnp', 'pg/mL', null, 125, 1, 50000, '<125 pg/mL (typical)'),
  lab('troponin', 'Troponin', 'Cardiac', 'troponin|troponin i|troponin t|hs-troponin|high sensitivity troponin', 'ng/L', null, 14, 0.1, 100000, 'assay-specific; <14 ng/L often used as rule-out'),
  lab('ck', 'Creatine Kinase', 'Cardiac / muscle', 'creatine kinase|ck total|cpk|creatine kinase total', 'U/L', 30, 200, 1, 100000, '30-200 U/L (typical)'),
  lab('uric-acid', 'Uric Acid', 'Metabolic', 'uric acid|serum uric acid|urate', 'mg/dL', 3.4, 7.0, 0.5, 30, '3.4-7.0 mg/dL (typical)'),
  lab('lipase', 'Lipase', 'GI', 'lipase|serum lipase', 'U/L', 10, 140, 1, 20000, '10-140 U/L (typical)'),
  lab('amylase', 'Amylase', 'GI', 'amylase|serum amylase', 'U/L', 25, 125, 1, 20000, '25-125 U/L (typical)'),
  lab('inr', 'INR', 'Coagulation', 'inr|international normalized ratio|prothrombin time inr|pt/inr', 'ratio', 0.8, 1.2, 0.5, 20, '0.8-1.2 (typical, off anticoagulation)'),
  lab('d-dimer', 'D-Dimer', 'Coagulation', 'd-dimer|d dimer|ddimer', 'ng/mL', null, 500, 1, 100000, 'age-adjusted cut-offs are used clinically'),
  lab('uacr', 'Urine Albumin/Creatinine Ratio', 'Renal', 'microalbumin/creatinine ratio|urine albumin creatinine ratio|uacr|albumin/creatinine ratio', 'mg/g', null, 30, 0.1, 20000, '<30 mg/g (typical)'),
  lab('ana', 'ANA', 'Immunology', 'antinuclear antibody|antinuclear antibodies|ana titre|ana titer', 'titer', null, null, 0, 0, 'reported as a titre (e.g. 1:40)'),
];
