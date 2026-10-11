import { toDrugSpec, type DrugRow } from './drugs';

/** Cardiovascular / metabolic medications. */
const ROWS_A: DrugRow[] = [
  ['atorvastatin', 'Atorvastatin', 'Statin', 'atorvastatin|atorva', 'lipitor', 'lowering LDL cholesterol and cardiovascular risk', 'ldl-cholesterol|alt|ast'],
  ['rosuvastatin', 'Rosuvastatin', 'Statin', 'rosuvastatin', 'crestor', 'lowering LDL cholesterol and cardiovascular risk', 'ldl-cholesterol|alt|ast'],
  ['simvastatin', 'Simvastatin', 'Statin', 'simvastatin', 'zocor', 'lowering LDL cholesterol', 'ldl-cholesterol|alt|ast'],
  ['pravastatin', 'Pravastatin', 'Statin', 'pravastatin', 'pravachol', 'lowering LDL cholesterol', 'ldl-cholesterol|alt'],
  ['ezetimibe', 'Ezetimibe', 'Cholesterol absorption inhibitor', 'ezetimibe', 'zetia', 'lowering LDL cholesterol', 'ldl-cholesterol|alt'],
  ['bempedoic-acid', 'Bempedoic Acid', 'Lipid-lowering', 'bempedoic acid', 'nexletol', 'lowering LDL cholesterol', 'ldl-cholesterol|uric-acid'],
  ['lisinopril', 'Lisinopril', 'ACE inhibitor', 'lisinopril', 'zestril|prinivil', 'blood pressure and cardiovascular/kidney protection', 'potassium|creatinine|egfr'],
  ['enalapril', 'Enalapril', 'ACE inhibitor', 'enalapril', 'vasotec', 'blood pressure and heart failure management', 'potassium|creatinine'],
  ['ramipril', 'Ramipril', 'ACE inhibitor', 'ramipril', 'altace', 'blood pressure and cardiovascular protection', 'potassium|creatinine'],
  ['benazepril', 'Benazepril', 'ACE inhibitor', 'benazepril', 'lotensin', 'blood pressure management', 'potassium|creatinine'],
  ['losartan', 'Losartan', 'ARB', 'losartan', 'cozaar', 'blood pressure and kidney protection', 'potassium|creatinine|egfr'],
  ['valsartan', 'Valsartan', 'ARB', 'valsartan', 'diovan', 'blood pressure and heart failure management', 'potassium|creatinine'],
  ['olmesartan', 'Olmesartan', 'ARB', 'olmesartan', 'benicar', 'blood pressure management', 'potassium|creatinine'],
  ['amlodipine', 'Amlodipine', 'Calcium channel blocker', 'amlodipine|amlodipine besylate', 'norvasc', 'blood pressure and angina management', 'blood pressure'],
  ['nifedipine', 'Nifedipine', 'Calcium channel blocker', 'nifedipine', 'procardia|adalat', 'blood pressure management', 'blood pressure'],
  ['metoprolol', 'Metoprolol', 'Beta blocker', 'metoprolol|metoprolol succinate|metoprolol tartrate', 'lopressor|toprol-xl', 'heart rate and blood pressure control', 'heart rate|blood pressure'],
  ['atenolol', 'Atenolol', 'Beta blocker', 'atenolol', 'tenormin', 'heart rate and blood pressure control', 'heart rate|blood pressure'],
  ['carvedilol', 'Carvedilol', 'Beta blocker', 'carvedilol', 'coreg', 'heart failure and blood pressure management', 'heart rate|blood pressure'],
  ['bisoprolol', 'Bisoprolol', 'Beta blocker', 'bisoprolol', 'zebeta', 'heart failure and blood pressure management', 'heart rate|blood pressure'],
  ['hydrochlorothiazide', 'Hydrochlorothiazide', 'Thiazide diuretic', 'hydrochlorothiazide|hctz', 'microzide', 'blood pressure management and fluid reduction', 'potassium|sodium|creatinine'],
  ['chlorthalidone', 'Chlorthalidone', 'Thiazide diuretic', 'chlorthalidone', 'thalitone', 'blood pressure management', 'potassium|sodium|creatinine'],
  ['furosemide', 'Furosemide', 'Loop diuretic', 'furosemide|frusemide', 'lasix', 'fluid overload and heart failure management', 'potassium|creatinine|sodium'],
  ['spironolactone', 'Spironolactone', 'Aldosterone antagonist', 'spironolactone', 'aldactone', 'heart failure and fluid management', 'potassium|creatinine'],
];

export const DRUG_SPECS_A: import('./lexiconTypes').ConceptSpec[] = ROWS_A.map(toDrugSpec);
