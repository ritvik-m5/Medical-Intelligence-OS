import { toDrugSpec, type DrugRow } from './drugs';

/** Anti-infectives. Present so that allergy-vs-prescription conflicts are detectable. */
const ROWS_C: DrugRow[] = [
  ['amoxicillin', 'Amoxicillin', 'Penicillin antibiotic', 'amoxicillin|amoxicillin trihydrate', 'amoxil|moxatag', 'treating susceptible bacterial infections', 'creatinine'],
  ['amoxicillin-clavulanate', 'Amoxicillin/Clavulanate', 'Penicillin antibiotic', 'amoxicillin-clavulanate|amoxicillin clavulanate|amoxicillin/clavulanate|co-amoxiclav', 'augmentin', 'treating susceptible bacterial infections', 'alt|ast|creatinine'],
  ['penicillin-vk', 'Penicillin VK', 'Penicillin antibiotic', 'penicillin vk|penicillin v|penicillin', 'veetids', 'treating susceptible bacterial infections', 'creatinine'],
  ['cephalexin', 'Cephalexin', 'Cephalosporin antibiotic', 'cephalexin', 'keflex', 'treating skin and urinary bacterial infections', 'creatinine'],
  ['azithromycin', 'Azithromycin', 'Macrolide antibiotic', 'azithromycin|z-pak|zithromax', 'zithromax|z-pak', 'treating respiratory bacterial infections', 'alt|ast'],
  ['doxycycline', 'Doxycycline', 'Tetracycline antibiotic', 'doxycycline|doxycycline hyclate', 'vibramycin|oryx', 'treating acne, respiratory and tick-borne infections', 'alt|ast'],
  ['ciprofloxacin', 'Ciprofloxacin', 'Fluoroquinolone antibiotic', 'ciprofloxacin', 'cipro', 'treating urinary and other bacterial infections', 'creatinine|alt'],
  ['levofloxacin', 'Levofloxacin', 'Fluoroquinolone antibiotic', 'levofloxacin', 'levaquin', 'treating respiratory and urinary bacterial infections', 'creatinine|alt'],
  ['nitrofurantoin', 'Nitrofurantoin', 'Urinary antibiotic', 'nitrofurantoin|nitrofurantoin monohydrate', 'macrobid|macrodantin', 'treating urinary tract infections', 'creatinine|alt'],
  ['trimethoprim-sulfamethoxazole', 'Trimethoprim/Sulfamethoxazole', 'Sulfonamide antibiotic', 'trimethoprim-sulfamethoxazole|trimethoprim/sulfamethoxazole|tmp-smx|tmp/smx|sulfamethoxazole-trimethoprim', 'bactrim|septra', 'treating urinary and skin bacterial infections', 'potassium|creatinine'],
  ['clindamycin', 'Clindamycin', 'Lincosamide antibiotic', 'clindamycin', 'cleocin', 'treating skin, dental and anaerobic infections', 'alt|creatinine'],
  ['metronidazole', 'Metronidazole', 'Nitroimidazole antibiotic', 'metronidazole', 'flagyl', 'treating anaerobic and parasitic infections', 'alt'],
  ['fluconazole', 'Fluconazole', 'Antifungal', 'fluconazole', 'diflucan', 'treating fungal infections', 'alt|creatinine'],
  ['nystatin', 'Nystatin', 'Antifungal', 'nystatin', 'nystop', 'treating local fungal infections', 'none'],
];

export const DRUG_SPECS_C: import('./lexiconTypes').ConceptSpec[] = ROWS_C.map(toDrugSpec);
