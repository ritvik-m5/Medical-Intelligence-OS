import { toDrugSpec, type DrugRow } from './drugs';

/** Analgesics, anticoagulants, respiratory, supplements and other common medications. */
const ROWS_D: DrugRow[] = [
  ['acetaminophen', 'Acetaminophen', 'Analgesic / antipyretic', 'acetaminophen|paracetamol|apap', 'tylenol', 'pain and fever relief', 'alt'],
  ['ibuprofen', 'Ibuprofen', 'NSAID', 'ibuprofen', 'advil|motrin', 'pain, fever and inflammation relief', 'creatinine|potassium'],
  ['naproxen', 'Naproxen', 'NSAID', 'naproxen|naproxen sodium', 'aleve|naprosyn', 'pain and inflammation relief', 'creatinine|potassium'],
  ['meloxicam', 'Meloxicam', 'NSAID', 'meloxicam', 'mobic', 'pain and inflammation relief', 'creatinine|potassium'],
  ['celecoxib', 'Celecoxib', 'NSAID (COX-2)', 'celecoxib', 'celebrex', 'pain and inflammation relief', 'creatinine'],
  ['aspirin', 'Aspirin', 'Antiplatelet / NSAID', 'aspirin|acetylsalicylic acid|asa', 'bayer|ecotrin', 'antiplatelet protection and pain relief', 'hemoglobin'],
  ['clopidogrel', 'Clopidogrel', 'Antiplatelet', 'clopidogrel', 'plavix', 'preventing clot formation after cardiovascular events', 'hemoglobin'],
  ['apixaban', 'Apixaban', 'Anticoagulant', 'apixaban', 'eliquis', 'preventing blood clots', 'hemoglobin|creatinine'],
  ['rivaroxaban', 'Rivaroxaban', 'Anticoagulant', 'rivaroxaban', 'xarelto', 'preventing blood clots', 'hemoglobin|creatinine'],
  ['warfarin', 'Warfarin', 'Anticoagulant', 'warfarin|warfarin sodium', 'coumadin|jantoven', 'preventing blood clots', 'inr|hemoglobin'],
  ['prednisone', 'Prednisone', 'Corticosteroid', 'prednisone|prednisolone', 'rayos|deltasone', 'reducing inflammation and immune activity', 'fasting-glucose|potassium'],
  ['methylprednisolone', 'Methylprednisolone', 'Corticosteroid', 'methylprednisolone|medrol dose pack', 'medrol', 'reducing inflammation and immune activity', 'fasting-glucose'],
  ['albuterol', 'Albuterol', 'Short-acting beta agonist', 'albuterol|salbutamol|albuterol sulfate', 'ventolin|proair', 'rapid relief of bronchospasm', 'potassium'],
  ['fluticasone', 'Fluticasone', 'Inhaled corticosteroid', 'fluticasone|fluticasone propionate|fluticasone/salmeterol', 'flovent|advair', 'controlling airway inflammation in asthma', 'none'],
  ['montelukast', 'Montelukast', 'Leukotriene modifier', 'montelukast|montelukast sodium', 'singulair', 'controlling asthma and allergic symptoms', 'none'],
  ['allopurinol', 'Allopurinol', 'Xanthine oxidase inhibitor', 'allopurinol', 'zyloprim', 'lowering uric acid to prevent gout attacks', 'uric-acid|alt|creatinine'],
  ['colchicine', 'Colchicine', 'Anti-gout', 'colchicine', 'colcrys|mitigare', 'treating and preventing gout flares', 'creatinine|ck'],
  ['cholecalciferol', 'Cholecalciferol (vitamin D3)', 'Vitamin supplement', 'cholecalciferol|vitamin d3|vitamin d supplement|d3 supplement', 'd3 supplement', 'correcting vitamin D deficiency', 'vitamin-d-25-oh|calcium'],
  ['cyanocobalamin', 'Cyanocobalamin (vitamin B12)', 'Vitamin supplement', 'cyanocobalamin|vitamin b12 supplement|b12 supplement', 'none', 'correcting vitamin B12 deficiency', 'vitamin-b12'],
  ['ferrous-sulfate', 'Ferrous sulfate', 'Iron supplement', 'ferrous sulfate|iron supplement|ferrous gluconate', 'slow fe', 'correcting iron deficiency', 'hemoglobin|ferritin'],
  ['tamsulosin', 'Tamsulosin', 'Alpha blocker', 'tamsulosin', 'flomax', 'improving urinary flow', 'blood pressure'],
  ['finasteride', 'Finasteride', '5-alpha reductase inhibitor', 'finasteride', 'proscar|propecia', 'treating prostate enlargement and hair loss', 'psa'],
  ['sumatriptan', 'Sumatriptan', 'Triptan', 'sumatriptan', 'imitrex', 'aborting migraine attacks', 'none'],
  ['ondansetron', 'Ondansetron', 'Antiemetic', 'ondansetron', 'zofran', 'treating nausea and vomiting', 'none'],
  ['cetirizine', 'Cetirizine', 'Antihistamine', 'cetirizine|cetirizine hydrochloride', 'zyrtec', 'treating allergic symptoms', 'none'],
  ['loratadine', 'Loratadine', 'Antihistamine', 'loratadine', 'claritin', 'treating allergic symptoms', 'none'],
  ['zolpidem', 'Zolpidem', 'Sedative-hypnotic', 'zolpidem|zolpidem tartrate', 'ambien', 'short-term treatment of insomnia', 'none'],
  ['trazodone', 'Trazodone', 'Serotonin antagonist / antidepressant', 'trazodone', 'desyrel', 'treating depression and insomnia', 'blood pressure'],
  ['alprazolam', 'Alprazolam', 'Benzodiazepine', 'alprazolam', 'xanax', 'treating anxiety', 'none'],
  ['lorazepam', 'Lorazepam', 'Benzodiazepine', 'lorazepam', 'ativan', 'treating anxiety and agitation', 'none'],
  ['tramadol', 'Tramadol', 'Opioid analgesic', 'tramadol', 'ultram', 'treating moderate pain', 'creatinine'],
  ['mirtazapine', 'Mirtazapine', 'Antidepressant (NaSSA)', 'mirtazapine', 'remeron', 'treating depression', 'weight'],
];

export const DRUG_SPECS_D: import('./lexiconTypes').ConceptSpec[] = ROWS_D.map(toDrugSpec);
