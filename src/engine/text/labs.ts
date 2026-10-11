import { lab, type ConceptSpec } from './lexiconTypes';

/**
 * Lab / measurement lexicon.
 *
 * Reference ranges here are widely-published *typical adult* ranges and are
 * explicitly marked illustrative: whenever the source document states its own
 * range, that range wins (see extract/labs.ts).
 *
 * `plausible` is the guard rail that turns "potassium 45" into a flagged
 * data-quality problem instead of a reported finding.
 */
export const LAB_SPECS: ConceptSpec[] = [
  // --- Lipids ---
  lab('total-cholesterol', 'Total Cholesterol', 'Lipid panel', 'total cholesterol|cholesterol, total|cholesterol total', 'mg/dL', null, 200, 50, 700, '<200 mg/dL desirable (typical)'),
  lab('ldl-cholesterol', 'LDL Cholesterol', 'Lipid panel', 'ldl cholesterol|ldl-c|ldl|low density lipoprotein|ldl-chol', 'mg/dL', null, 100, 10, 700, '<100 mg/dL optimal (typical)'),
  lab('hdl-cholesterol', 'HDL Cholesterol', 'Lipid panel', 'hdl cholesterol|hdl-c|hdl|high density lipoprotein', 'mg/dL', 40, null, 5, 150, '>40 mg/dL (typical)'),
  lab('triglycerides', 'Triglycerides', 'Lipid panel', 'triglycerides|triglyceride|triglyceride level', 'mg/dL', null, 150, 10, 5000, '<150 mg/dL (typical)'),
  lab('non-hdl-cholesterol', 'Non-HDL Cholesterol', 'Lipid panel', 'non-hdl cholesterol|non hdl|non-hdl-c|nonhdl', 'mg/dL', null, 130, 10, 800, '<130 mg/dL (typical)'),
  lab('apolipoprotein-b', 'Apolipoprotein B', 'Lipid panel', 'apolipoprotein b|apob|apo b', 'mg/dL', null, 90, 10, 400, '<90 mg/dL (typical)'),
  lab('lipoprotein-a', 'Lipoprotein(a)', 'Lipid panel', 'lipoprotein(a)|lipoprotein a|lp(a)|lpa', 'nmol/L', null, 75, 1, 500, '<75 nmol/L (typical)'),

  // --- Glycemia ---
  lab('hemoglobin-a1c', 'Hemoglobin A1c', 'Glycemic', 'hemoglobin a1c|hba1c|a1c|glycated hemoglobin|glycohemoglobin', '%', 4.0, 5.6, 2, 20, '4.0-5.6 % (typical non-diabetic)'),
  lab('fasting-glucose', 'Fasting Glucose', 'Glycemic', 'fasting glucose|glucose, fasting|fasting blood glucose|fbg|fbs|glucose fasting|fasting plasma glucose', 'mg/dL', 70, 99, 10, 1500, '70-99 mg/dL fasting (typical)'),
  lab('random-glucose', 'Glucose', 'Glycemic', 'random glucose|glucose|blood glucose', 'mg/dL', 70, 140, 10, 1500, '70-140 mg/dL (typical)'),
  lab('fasting-insulin', 'Fasting Insulin', 'Glycemic', 'fasting insulin|insulin, fasting|insulin fasting', 'µIU/mL', 2, 19, 0.1, 400, '2-19 µIU/mL (typical)'),
  lab('c-peptide', 'C-Peptide', 'Glycemic', 'c-peptide|c peptide|cpeptide', 'ng/mL', 0.5, 2.0, 0.05, 30, '0.5-2.0 ng/mL (typical)'),

  // --- Renal / electrolytes ---
  lab('creatinine', 'Creatinine', 'Renal', 'creatinine|serum creatinine|creat', 'mg/dL', 0.6, 1.3, 0.05, 25, '0.6-1.3 mg/dL (typical)'),
  lab('egfr', 'Estimated GFR', 'Renal', 'egfr|estimated gfr|gfr estimated|estimated glomerular filtration rate', 'mL/min/1.73m²', 60, null, 1, 200, '>60 mL/min/1.73 m² (typical)'),
  lab('bun', 'Blood Urea Nitrogen', 'Renal', 'blood urea nitrogen|bun|urea nitrogen', 'mg/dL', 7, 20, 1, 200, '7-20 mg/dL (typical)'),
  lab('sodium', 'Sodium', 'Electrolytes', 'sodium|serum sodium|na+', 'mmol/L', 135, 145, 90, 190, '135-145 mmol/L (typical)'),
  lab('potassium', 'Potassium', 'Electrolytes', 'potassium|serum potassium|k+', 'mmol/L', 3.5, 5.1, 1, 10, '3.5-5.1 mmol/L (typical)'),
  lab('chloride', 'Chloride', 'Electrolytes', 'chloride|serum chloride', 'mmol/L', 98, 107, 60, 150, '98-107 mmol/L (typical)'),
  lab('bicarbonate', 'Bicarbonate (CO2)', 'Electrolytes', 'bicarbonate|carbon dioxide|co2|total co2|hco3', 'mmol/L', 22, 29, 5, 60, '22-29 mmol/L (typical)'),
  lab('calcium', 'Calcium', 'Electrolytes', 'calcium|serum calcium|total calcium', 'mg/dL', 8.6, 10.2, 4, 20, '8.6-10.2 mg/dL (typical)'),
  lab('magnesium', 'Magnesium', 'Electrolytes', 'magnesium|serum magnesium', 'mg/dL', 1.7, 2.2, 0.5, 6, '1.7-2.2 mg/dL (typical)'),
  lab('phosphorus', 'Phosphorus', 'Electrolytes', 'phosphorus|phosphate|serum phosphorus', 'mg/dL', 2.5, 4.5, 0.5, 15, '2.5-4.5 mg/dL (typical)'),

  // --- Liver ---
  lab('alt', 'ALT', 'Liver panel', 'alt|alanine aminotransferase|sgpt|alt (sgpt)', 'U/L', 7, 56, 1, 5000, '7-56 U/L (typical)'),
  lab('ast', 'AST', 'Liver panel', 'ast|aspartate aminotransferase|sgot|ast (sgot)', 'U/L', 10, 40, 1, 5000, '10-40 U/L (typical)'),
  lab('alp', 'Alkaline Phosphatase', 'Liver panel', 'alkaline phosphatase|alp|alk phos', 'U/L', 44, 147, 5, 2000, '44-147 U/L (typical)'),
  lab('total-bilirubin', 'Total Bilirubin', 'Liver panel', 'total bilirubin|bilirubin total|bilirubin', 'mg/dL', 0.1, 1.2, 0.05, 40, '0.1-1.2 mg/dL (typical)'),
  lab('albumin', 'Albumin', 'Liver panel', 'albumin|serum albumin', 'g/dL', 3.5, 5.0, 1, 8, '3.5-5.0 g/dL (typical)'),
  lab('total-protein', 'Total Protein', 'Liver panel', 'total protein|protein, total', 'g/dL', 6.0, 8.3, 2, 15, '6.0-8.3 g/dL (typical)'),
];
