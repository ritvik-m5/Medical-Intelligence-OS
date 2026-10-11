import { simple } from './simple';
import type { ConceptSpec } from './lexiconTypes';

/** Conditions / problems / diagnoses — cardiometabolic and endocrine. */
export const CONDITION_SPECS: ConceptSpec[] = [
  simple('condition', 'prediabetes', 'Prediabetes', 'Glycemic', 'prediabetes|pre-diabetes|impaired glucose tolerance|impaired fasting glucose'),
  simple('condition', 'type-2-diabetes', 'Type 2 Diabetes', 'Glycemic', 'type 2 diabetes|type ii diabetes|t2dm|diabetes mellitus type 2|dm2|diabetes type 2'),
  simple('condition', 'type-1-diabetes', 'Type 1 Diabetes', 'Glycemic', 'type 1 diabetes|type i diabetes|t1dm|diabetes mellitus type 1'),
  simple('condition', 'gestational-diabetes', 'Gestational Diabetes', 'Glycemic', 'gestational diabetes'),
  simple('condition', 'diabetes', 'Diabetes Mellitus', 'Glycemic', 'diabetes mellitus|diabetes|diabetic'),
  simple('condition', 'hypertension', 'Hypertension', 'Cardiovascular', 'hypertension|htn|high blood pressure|elevated blood pressure|essential hypertension'),
  simple('condition', 'hyperlipidemia', 'Hyperlipidemia', 'Cardiovascular', 'hyperlipidemia|hyperlipidaemia|dyslipidemia|high cholesterol|elevated cholesterol|hypercholesterolemia'),
  simple('condition', 'coronary-artery-disease', 'Coronary Artery Disease', 'Cardiovascular', 'coronary artery disease|cad|coronary heart disease|chd|atherosclerotic cardiovascular disease|ascvd|ischemic heart disease'),
  simple('condition', 'atrial-fibrillation', 'Atrial Fibrillation', 'Cardiovascular', 'atrial fibrillation|afib|a-fib'),
  simple('condition', 'heart-failure', 'Heart Failure', 'Cardiovascular', 'heart failure|chf|congestive heart failure|hfref|hfpef'),
  simple('condition', 'myocardial-infarction', 'Myocardial Infarction', 'Cardiovascular', 'myocardial infarction|heart attack|stemi|nstemi'),
  simple('condition', 'obesity', 'Obesity', 'Metabolic', 'obesity|obese|class i obesity|class ii obesity|class iii obesity'),
  simple('condition', 'overweight', 'Overweight', 'Metabolic', 'overweight'),
  simple('condition', 'metabolic-syndrome', 'Metabolic Syndrome', 'Metabolic', 'metabolic syndrome'),
  simple('condition', 'fatty-liver', 'Hepatic Steatosis / MASLD', 'Hepatic', 'hepatic steatosis|fatty liver|nafld|masld|nash|steatohepatitis'),
  simple('condition', 'hypothyroidism', 'Hypothyroidism', 'Endocrine', 'hypothyroidism|underactive thyroid|subclinical hypothyroidism'),
  simple('condition', 'hyperthyroidism', 'Hyperthyroidism', 'Endocrine', 'hyperthyroidism|overactive thyroid|graves disease'),
  simple('condition', 'thyroid-nodule', 'Thyroid Nodule', 'Endocrine', 'thyroid nodule|thyroid nodules'),
  simple('condition', 'vitamin-d-deficiency', 'Vitamin D Deficiency', 'Nutritional', 'vitamin d deficiency|low vitamin d|insufficient vitamin d'),
  simple('condition', 'vitamin-b12-deficiency', 'Vitamin B12 Deficiency', 'Nutritional', 'vitamin b12 deficiency|b12 deficiency|low b12'),
  simple('condition', 'iron-deficiency-anemia', 'Iron Deficiency Anemia', 'Hematologic', 'iron deficiency anemia|iron deficiency anaemia|iron deficiency|microcytic anemia'),
  simple('condition', 'anemia', 'Anemia', 'Hematologic', 'anemia|anaemia'),
  simple('condition', 'chronic-kidney-disease', 'Chronic Kidney Disease', 'Renal', 'chronic kidney disease|ckd stage 2|ckd stage 3|ckd stage 3a|ckd stage 3b|renal insufficiency|kidney disease'),
  simple('condition', 'nephrolithiasis', 'Nephrolithiasis', 'Renal', 'nephrolithiasis|kidney stones|renal calculi|kidney stone'),
];
