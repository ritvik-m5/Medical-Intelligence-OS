import { toDrugSpec, type DrugRow } from './drugs';

/** Glycemic, thyroid, GI, neuropsych and pain medications. */
const ROWS_B: DrugRow[] = [
  ['metformin', 'Metformin', 'Biguanide', 'metformin|metformin hcl|metformin hydrochloride', 'glucophage|fortamet', 'lowering blood glucose in type 2 diabetes', 'hemoglobin-a1c|egfr|vitamin-b12'],
  ['semaglutide', 'Semaglutide', 'GLP-1 receptor agonist', 'semaglutide', 'ozempic|wegovy|rybelsus', 'blood glucose control and weight management', 'hemoglobin-a1c|lipase'],
  ['tirzepatide', 'Tirzepatide', 'GIP/GLP-1 receptor agonist', 'tirzepatide', 'mounjaro|zepbound', 'blood glucose control and weight management', 'hemoglobin-a1c|lipase'],
  ['dulaglutide', 'Dulaglutide', 'GLP-1 receptor agonist', 'dulaglutide', 'trulicity', 'blood glucose control', 'hemoglobin-a1c'],
  ['empagliflozin', 'Empagliflozin', 'SGLT2 inhibitor', 'empagliflozin', 'jardiance', 'blood glucose and cardiovascular/kidney risk reduction', 'hemoglobin-a1c|egfr|creatinine'],
  ['dapagliflozin', 'Dapagliflozin', 'SGLT2 inhibitor', 'dapagliflozin', 'farxiga', 'blood glucose and heart/kidney risk reduction', 'hemoglobin-a1c|egfr'],
  ['sitagliptin', 'Sitagliptin', 'DPP-4 inhibitor', 'sitagliptin', 'januvia', 'blood glucose control', 'hemoglobin-a1c'],
  ['glipizide', 'Glipizide', 'Sulfonylurea', 'glipizide', 'glucotrol', 'blood glucose control', 'hemoglobin-a1c|fasting-glucose'],
  ['glimepiride', 'Glimepiride', 'Sulfonylurea', 'glimepiride', 'amaryl', 'blood glucose control', 'hemoglobin-a1c|fasting-glucose'],
  ['insulin-glargine', 'Insulin glargine', 'Long-acting insulin', 'insulin glargine|glargine', 'lantus|basaglar|toujeo', 'basal glucose control', 'hemoglobin-a1c|fasting-glucose'],
  ['insulin-aspart', 'Insulin aspart', 'Rapid-acting insulin', 'insulin aspart|aspart', 'novolog|novorapid', 'mealtime glucose control', 'random-glucose'],
  ['levothyroxine', 'Levothyroxine', 'Thyroid hormone', 'levothyroxine|levothyroxine sodium|l-thyroxine', 'synthroid|levoxyl|euthyrox', 'replacing thyroid hormone', 'tsh|free-t4'],
  ['methimazole', 'Methimazole', 'Antithyroid', 'methimazole|thiamazole', 'tapazole', 'reducing thyroid hormone production', 'tsh|free-t4'],
  ['omeprazole', 'Omeprazole', 'Proton pump inhibitor', 'omeprazole|omeprazole magnesium', 'prilosec', 'reducing stomach acid', 'magnesium|vitamin-b12'],
  ['pantoprazole', 'Pantoprazole', 'Proton pump inhibitor', 'pantoprazole', 'protonix', 'reducing stomach acid', 'magnesium|vitamin-b12'],
  ['esomeprazole', 'Esomeprazole', 'Proton pump inhibitor', 'esomeprazole', 'nexium', 'reducing stomach acid', 'magnesium'],
  ['famotidine', 'Famotidine', 'H2 blocker', 'famotidine', 'pepcid', 'reducing stomach acid', 'creatinine'],
  ['sertraline', 'Sertraline', 'SSRI', 'sertraline', 'zoloft', 'depression and anxiety treatment', 'sodium'],
  ['escitalopram', 'Escitalopram', 'SSRI', 'escitalopram', 'lexapro', 'depression and anxiety treatment', 'sodium'],
  ['fluoxetine', 'Fluoxetine', 'SSRI', 'fluoxetine', 'prozac', 'depression and anxiety treatment', 'sodium'],
  ['bupropion', 'Bupropion', 'NDRI', 'bupropion|bupropion xl', 'wellbutrin|zyban', 'depression treatment and smoking cessation', 'blood pressure'],
  ['venlafaxine', 'Venlafaxine', 'SNRI', 'venlafaxine', 'effexor', 'depression and anxiety treatment', 'blood pressure|sodium'],
  ['duloxetine', 'Duloxetine', 'SNRI', 'duloxetine', 'cymbalta', 'depression and nerve pain treatment', 'blood pressure|alt'],
  ['gabapentin', 'Gabapentin', 'Anticonvulsant / neuropathic', 'gabapentin', 'neurontin', 'nerve pain and seizure management', 'creatinine'],
  ['pregabalin', 'Pregabalin', 'Anticonvulsant / neuropathic', 'pregabalin', 'lyrica', 'nerve pain management', 'creatinine'],
];

export const DRUG_SPECS_B: import('./lexiconTypes').ConceptSpec[] = ROWS_B.map(toDrugSpec);
