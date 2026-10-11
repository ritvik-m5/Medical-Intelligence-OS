/**
 * Curated, *declared* relations between concepts.
 *
 * These are the only "clinical knowledge" edges the engine adds, and every one of
 * them is marked `inferred: true` in the graph. They exist so the graph can show
 * "this medication is commonly used for that condition" and "this lab is
 * commonly used to monitor that condition" — never as a claim about this patient.
 */

/** Condition short key → lab short keys commonly used to monitor it. */
export const CONDITION_MONITORING: Record<string, string[]> = {
  'type-2-diabetes': ['hemoglobin-a1c', 'fasting-glucose', 'egfr', 'uacr'],
  'type-1-diabetes': ['hemoglobin-a1c', 'fasting-glucose'],
  prediabetes: ['hemoglobin-a1c', 'fasting-glucose'],
  diabetes: ['hemoglobin-a1c', 'fasting-glucose'],
  hypertension: ['systolic-blood-pressure', 'diastolic-blood-pressure', 'creatinine', 'potassium'],
  hyperlipidemia: ['ldl-cholesterol', 'total-cholesterol', 'triglycerides', 'hdl-cholesterol', 'non-hdl-cholesterol'],
  'coronary-artery-disease': ['ldl-cholesterol', 'troponin', 'nt-probnp'],
  'heart-failure': ['nt-probnp', 'sodium', 'potassium', 'creatinine'],
  'atrial-fibrillation': ['inr', 'tsh', 'hemoglobin'],
  hypothyroidism: ['tsh', 'free-t4'],
  hyperthyroidism: ['tsh', 'free-t4', 'total-t3'],
  'chronic-kidney-disease': ['creatinine', 'egfr', 'uacr', 'potassium'],
  gout: ['uric-acid', 'creatinine'],
  'iron-deficiency-anemia': ['ferritin', 'hemoglobin', 'iron', 'tibc', 'transferrin-saturation'],
  anemia: ['hemoglobin', 'hematocrit', 'ferritin', 'vitamin-b12', 'folate'],
  'vitamin-d-deficiency': ['vitamin-d-25-oh', 'calcium'],
  'vitamin-b12-deficiency': ['vitamin-b12', 'folate'],
  'fatty-liver': ['alt', 'ast', 'alp', 'total-bilirubin'],
  obesity: ['bmi', 'hemoglobin-a1c', 'ldl-cholesterol'],
  'metabolic-syndrome': ['hemoglobin-a1c', 'triglycerides', 'hdl-cholesterol', 'systolic-blood-pressure'],
  'sleep-apnea': ['oxygen-saturation', 'bmi'],
  asthma: ['oxygen-saturation'],
  copd: ['oxygen-saturation', 'hemoglobin'],
  'urinary-tract-infection': ['wbc', 'creatinine'],
  'rheumatoid-arthritis': ['crp', 'esr', 'hemoglobin'],
  depression: ['tsh', 'vitamin-b12', 'sodium'],
  'benign-prostatic-hyperplasia': ['psa'],
};

/** Drug class → condition short keys it is commonly used to treat. */
export const CLASS_TREATS: Record<string, string[]> = {
  Statin: ['hyperlipidemia', 'coronary-artery-disease'],
  'Cholesterol absorption inhibitor': ['hyperlipidemia'],
  'Lipid-lowering': ['hyperlipidemia'],
  'ACE inhibitor': ['hypertension', 'heart-failure', 'chronic-kidney-disease'],
  ARB: ['hypertension', 'heart-failure', 'chronic-kidney-disease'],
  'Calcium channel blocker': ['hypertension'],
  'Beta blocker': ['hypertension', 'coronary-artery-disease', 'heart-failure', 'atrial-fibrillation'],
  'Thiazide diuretic': ['hypertension'],
  'Loop diuretic': ['heart-failure'],
  'Aldosterone antagonist': ['heart-failure'],
  Biguanide: ['type-2-diabetes', 'prediabetes'],
  'GLP-1 receptor agonist': ['type-2-diabetes', 'obesity'],
  'GIP/GLP-1 receptor agonist': ['type-2-diabetes', 'obesity'],
  'SGLT2 inhibitor': ['type-2-diabetes', 'heart-failure', 'chronic-kidney-disease'],
  'DPP-4 inhibitor': ['type-2-diabetes'],
  Sulfonylurea: ['type-2-diabetes'],
  'Long-acting insulin': ['type-2-diabetes', 'type-1-diabetes'],
  'Rapid-acting insulin': ['type-2-diabetes', 'type-1-diabetes'],
  'Thyroid hormone': ['hypothyroidism'],
  Antithyroid: ['hyperthyroidism'],
  'Proton pump inhibitor': ['gerd', 'gastritis'],
  'H2 blocker': ['gerd'],
  SSRI: ['depression', 'anxiety'],
  SNRI: ['depression', 'anxiety', 'neuropathy'],
  NDRI: ['depression'],
  'Anticonvulsant / neuropathic': ['neuropathy'],
  'Xanthine oxidase inhibitor': ['gout'],
  'Anti-gout': ['gout'],
  Anticoagulant: ['atrial-fibrillation'],
  'Short-acting beta agonist': ['asthma', 'copd'],
  'Inhaled corticosteroid': ['asthma'],
  'Leukotriene modifier': ['asthma', 'allergic-rhinitis'],
  Antihistamine: ['allergic-rhinitis'],
  'Alpha blocker': ['benign-prostatic-hyperplasia'],
  '5-alpha reductase inhibitor': ['benign-prostatic-hyperplasia'],
  'Vitamin supplement': ['vitamin-d-deficiency', 'vitamin-b12-deficiency'],
  'Iron supplement': ['iron-deficiency-anemia'],
  Triptan: ['migraine'],
  'Sedative-hypnotic': ['insomnia'],
  Benzodiazepine: ['anxiety'],
  Corticosteroid: ['asthma', 'copd'],
};


/** Allergy short key → drug short keys that are pharmacologically related. */
export const ALLERGY_CROSS_REACTIVITY: Record<string, { drugs: string[]; rationale: string }> = {
  penicillin: {
    drugs: ['amoxicillin', 'amoxicillin-clavulanate', 'penicillin-vk', 'cephalexin'],
    rationale: 'Penicillins are structurally related to each other, and cephalosporins share a beta-lactam ring.',
  },
  amoxicillin: {
    drugs: ['amoxicillin', 'amoxicillin-clavulanate', 'penicillin-vk'],
    rationale: 'Amoxicillin is a penicillin.',
  },
  cephalosporins: {
    drugs: ['cephalexin'],
    rationale: 'Cephalexin is a cephalosporin.',
  },
  'sulfa-drugs': {
    drugs: ['trimethoprim-sulfamethoxazole'],
    rationale: 'Trimethoprim/sulfamethoxazole contains a sulfonamide.',
  },
  nsaids: {
    drugs: ['ibuprofen', 'naproxen', 'meloxicam', 'celecoxib', 'aspirin'],
    rationale: 'These are non-steroidal anti-inflammatory drugs.',
  },
  aspirin: {
    drugs: ['aspirin'],
    rationale: 'Direct match to the recorded allergy.',
  },
  macrolides: {
    drugs: ['azithromycin'],
    rationale: 'Azithromycin is a macrolide.',
  },
  statins: {
    drugs: ['atorvastatin', 'rosuvastatin', 'simvastatin', 'pravastatin'],
    rationale: 'These are statins.',
  },
  'ace-inhibitors': {
    drugs: ['lisinopril', 'enalapril', 'ramipril', 'benazepril'],
    rationale: 'These are ACE inhibitors.',
  },
};

export function monitoringLabsFor(conditionKey: string): string[] {
  return CONDITION_MONITORING[conditionKey] ?? [];
}

export function treatedConditionsFor(drugClass: string | undefined): string[] {
  if (!drugClass) return [];
  return CLASS_TREATS[drugClass] ?? [];
}

/**
 * Declared co-prescription pairs.
 *
 * Deliberately short. Each entry states the reason in one sentence so the
 * platform can show *why* a pair is on the list. A long list of speculative
 * interactions would be worse than a short list of real ones.
 */
export const CONTRAINDICATED_PAIRS: Array<{
  drugs: [string, string];
  rationale: string;
}> = [
  {
    drugs: ['lisinopril', 'spironolactone'],
    rationale:
      'An ACE inhibitor and an aldosterone antagonist both raise serum potassium, so concurrent use is a recognised hyperkalaemia risk and is usually accompanied by potassium monitoring.',
  },
  {
    drugs: ['lisinopril', 'trimethoprim-sulfamethoxazole'],
    rationale:
      'Trimethoprim acts like a potassium-sparing diuretic; combined with an ACE inhibitor it is a described cause of significant hyperkalaemia.',
  },
  {
    drugs: ['warfarin', 'ibuprofen'],
    rationale:
      'NSAIDs add antiplatelet effect and gastrointestinal bleeding risk on top of anticoagulation, and warfarin labeling describes this interaction.',
  },
  {
    drugs: ['warfarin', 'naproxen'],
    rationale:
      'As with other NSAIDs, the combination increases bleeding risk beyond anticoagulation alone.',
  },
  {
    drugs: ['sertraline', 'sumatriptan'],
    rationale:
      'Serotonergic agents used together are associated with serotonin syndrome, which labeling for both classes describes.',
  },
  {
    drugs: ['atorvastatin', 'gemfibrozil'],
    rationale:
      'Fibrates combined with statins increase the risk of myopathy and rhabdomyolysis, and this is described in statin labeling.',
  },
  {
    drugs: ['clopidogrel', 'omeprazole'],
    rationale:
      'Omeprazole inhibits the enzyme that activates clopidogrel, which labeling identifies as a potential reduction in antiplatelet effect.',
  },
];

