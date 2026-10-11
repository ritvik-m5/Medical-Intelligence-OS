import { lab, type ConceptSpec } from './lexiconTypes';

/** Labs part 2: hematology and endocrine. */
export const LAB_SPECS_2: ConceptSpec[] = [
  // --- Hematology ---
  lab('wbc', 'White Blood Cell Count', 'CBC', 'white blood cell count|wbc|white blood cells|leukocytes', '10^3/µL', 4.0, 11.0, 0.05, 300, '4.0-11.0 x10^3/µL (typical)'),
  lab('rbc', 'Red Blood Cell Count', 'CBC', 'red blood cell count|rbc|red blood cells|erythrocytes', '10^6/µL', 4.5, 5.9, 0.5, 12, '4.5-5.9 x10^6/µL (typical)'),
  lab('hemoglobin', 'Hemoglobin', 'CBC', 'hemoglobin|hgb|hb|haemoglobin', 'g/dL', 13.5, 17.5, 2, 25, '13.5-17.5 g/dL (typical)'),
  lab('hematocrit', 'Hematocrit', 'CBC', 'hematocrit|hct|haematocrit|packed cell volume', '%', 38.8, 50.0, 5, 80, '38.8-50.0 % (typical)'),
  lab('platelets', 'Platelet Count', 'CBC', 'platelet count|platelets|plt|thrombocytes', '10^3/µL', 150, 450, 1, 2000, '150-450 x10^3/µL (typical)'),
  lab('mcv', 'MCV', 'CBC', 'mcv|mean corpuscular volume', 'fL', 80, 100, 30, 160, '80-100 fL (typical)'),
  lab('mch', 'MCH', 'CBC', 'mch|mean corpuscular hemoglobin', 'pg', 27, 33, 10, 60, '27-33 pg (typical)'),
  lab('neutrophils-abs', 'Absolute Neutrophils', 'CBC', 'absolute neutrophils|neutrophils absolute|anc', '10^3/µL', 1.5, 8.0, 0.01, 200, '1.5-8.0 x10^3/µL (typical)'),
  lab('lymphocytes-abs', 'Absolute Lymphocytes', 'CBC', 'absolute lymphocytes|lymphocytes absolute|alc', '10^3/µL', 1.0, 4.8, 0.01, 200, '1.0-4.8 x10^3/µL (typical)'),
  lab('ferritin', 'Ferritin', 'Iron studies', 'ferritin|serum ferritin', 'ng/mL', 24, 336, 0.5, 20000, '24-336 ng/mL (typical)'),
  lab('iron', 'Serum Iron', 'Iron studies', 'serum iron|iron, serum', 'mcg/dL', 65, 175, 5, 1000, '65-175 mcg/dL (typical)'),
  lab('tibc', 'TIBC', 'Iron studies', 'tibc|total iron binding capacity', 'mcg/dL', 250, 450, 50, 1200, '250-450 mcg/dL (typical)'),
  lab('transferrin-saturation', 'Transferrin Saturation', 'Iron studies', 'transferrin saturation|tsat|iron saturation', '%', 20, 50, 1, 100, '20-50 % (typical)'),

  // --- Endocrine ---
  lab('tsh', 'TSH', 'Thyroid', 'tsh|thyroid stimulating hormone|thyrotropin', 'mIU/L', 0.4, 4.0, 0.001, 200, '0.4-4.0 mIU/L (typical)'),
  lab('free-t4', 'Free T4', 'Thyroid', 'free t4|ft4|free thyroxine|t4 free', 'ng/dL', 0.8, 1.8, 0.05, 12, '0.8-1.8 ng/dL (typical)'),
  lab('total-t3', 'T3', 'Thyroid', 'total t3|triiodothyronine', 'ng/dL', 80, 200, 5, 900, '80-200 ng/dL (typical)'),
  lab('free-t3', 'Free T3', 'Thyroid', 'free t3|ft3|free triiodothyronine', 'pg/mL', 2.3, 4.2, 0.1, 40, '2.3-4.2 pg/mL (typical)'),
  lab('thyroid-peroxidase-ab', 'Thyroid Peroxidase Antibody', 'Thyroid', 'thyroid peroxidase antibody|tpo antibody|anti-tpo|tpoab', 'IU/mL', null, 9, 0.1, 5000, '<9 IU/mL (typical)'),
  lab('cortisol-am', 'Cortisol (AM)', 'Endocrine', 'cortisol am|cortisol, morning|am cortisol|cortisol', 'mcg/dL', 6, 23, 0.5, 150, '6-23 mcg/dL morning (typical)'),
  lab('testosterone-total', 'Total Testosterone', 'Endocrine', 'total testosterone|testosterone, total', 'ng/dL', 300, 1000, 5, 3000, '300-1000 ng/dL (typical adult male)'),
  lab('estradiol', 'Estradiol', 'Endocrine', 'estradiol|estradiol, serum', 'pg/mL', 15, 350, 1, 5000, 'varies by cycle/life stage'),
  lab('psa', 'PSA', 'Endocrine', 'psa|prostate specific antigen|prostate-specific antigen', 'ng/mL', null, 4.0, 0.01, 2000, '<4.0 ng/mL (typical)'),
  lab('c-peptide', 'C-Peptide', 'Glycemic', 'c-peptide|c peptide|cpeptide', 'ng/mL', 0.5, 2.0, 0.05, 30, '0.5-2.0 ng/mL (typical)'),
];
