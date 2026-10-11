import type { ExternalEvidence } from '../types';
import { lab } from './evidenceTypes';

/** What a test measures and why it is generally ordered. */
export const LAB_EVIDENCE: ExternalEvidence[] = [
  lab(
    'ev_lipid_panel',
    'Lipid panel',
    ['measurement:ldl-cholesterol', 'measurement:hdl-cholesterol', 'measurement:total-cholesterol', 'measurement:triglycerides', 'measurement:non-hdl-cholesterol'],
    'A lipid panel measures total cholesterol, LDL, HDL and triglycerides. It is generally used to estimate cardiovascular risk and to track the effect of lipid-lowering therapy.',
  ),
  lab(
    'ev_a1c',
    'Hemoglobin A1c',
    ['measurement:hemoglobin-a1c', 'condition:type-2-diabetes', 'condition:prediabetes'],
    'A1c reflects average blood glucose over roughly the preceding two to three months. It is generally used to screen for and monitor diabetes. Reported values are compared against the range printed by the performing laboratory.',
  ),
  lab(
    'ev_cmp',
    'Comprehensive metabolic panel',
    ['measurement:creatinine', 'measurement:egfr', 'measurement:alt', 'measurement:ast', 'measurement:sodium', 'measurement:potassium', 'measurement:bun'],
    'A comprehensive metabolic panel groups electrolytes, kidney function and liver enzymes. It is generally ordered to assess organ function and to monitor medications that affect the kidney or liver.',
  ),
  lab(
    'ev_cbc',
    'Complete blood count',
    ['measurement:hemoglobin', 'measurement:hematocrit', 'measurement:wbc', 'measurement:platelets', 'measurement:mcv'],
    'A complete blood count measures red cells, white cells and platelets. It is generally used to look for anaemia, infection or abnormal blood counts.',
  ),
  lab(
    'ev_tsh',
    'Thyroid stimulating hormone',
    ['measurement:tsh', 'measurement:free-t4', 'condition:hypothyroidism'],
    'TSH is the usual first-line test of thyroid function because it responds to changes in circulating thyroid hormone. It is generally used to detect and monitor thyroid disorders.',
  ),
  lab(
    'ev_vitamin_d',
    'Vitamin D test',
    ['measurement:vitamin-d-25-oh', 'condition:vitamin-d-deficiency'],
    'The 25-hydroxyvitamin D test is the standard measure of vitamin D status. It is generally ordered when deficiency is suspected. Thresholds for "low" differ between guideline bodies.',
  ),
  lab(
    'ev_ferritin',
    'Iron studies and ferritin',
    ['measurement:ferritin', 'measurement:iron', 'measurement:tibc', 'condition:iron-deficiency-anemia'],
    'Ferritin estimates stored iron, and is interpreted alongside iron, transferrin saturation and haemoglobin. It is generally used to investigate anaemia and iron deficiency. Ferritin also rises with inflammation, so it is read in context.',
  ),
  lab(
    'ev_egfr',
    'Estimated GFR',
    ['measurement:egfr', 'measurement:creatinine', 'condition:chronic-kidney-disease'],
    'Estimated GFR is calculated from creatinine and other factors to estimate kidney filtration. It is generally used to stage kidney function and to adjust medication doses.',
  ),
  lab(
    'ev_uacr',
    'Urine albumin/creatinine ratio',
    ['measurement:uacr', 'condition:chronic-kidney-disease', 'condition:type-2-diabetes'],
    'The urine albumin/creatinine ratio detects small amounts of albumin in urine. It is generally used to detect early kidney involvement, particularly in diabetes and hypertension.',
  ),
  lab(
    'ev_potassium',
    'Potassium blood test',
    ['measurement:potassium'],
    'Potassium is an electrolyte that affects nerve and muscle function, including heart rhythm. It is generally monitored when medications or conditions can shift potassium levels. Haemolysed specimens are a common cause of falsely high results.',
  ),
  lab(
    'ev_crp',
    'C-reactive protein',
    ['measurement:crp', 'measurement:hs-crp'],
    'C-reactive protein rises with inflammation. It is generally used as a non-specific marker of inflammation and, in the high-sensitivity form, as a cardiovascular risk modifier.',
  ),
  lab(
    'ev_uric_acid',
    'Uric acid test',
    ['measurement:uric-acid', 'condition:gout'],
    'Uric acid measures the end product of purine metabolism. It is generally used in the evaluation and monitoring of gout and of urate-lowering therapy.',
  ),
  lab(
    'ev_urinalysis',
    'Urinalysis',
    ['procedure:urinalysis'],
    'Urinalysis examines urine chemically and microscopically. It is generally used to screen for urinary infection, blood, protein and metabolic abnormalities.',
  ),
];
