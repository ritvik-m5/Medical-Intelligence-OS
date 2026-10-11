import { simple } from './simple';
import type { ConceptSpec } from './lexiconTypes';

/** Immunizations. */
export const IMMUNIZATION_SPECS: ConceptSpec[] = [
  simple('immunization', 'influenza-vaccine', 'Influenza vaccine', 'Routine', 'influenza vaccine|flu shot|influenza vaccination|quadrivalent influenza'),
  simple('immunization', 'covid19-vaccine', 'COVID-19 vaccine', 'Routine', 'covid-19 vaccine|covid vaccine|covid-19 vaccination|bivalent covid|mrna covid'),
  simple('immunization', 'tdap', 'Tdap / Td', 'Routine', 'tdap|td booster|tetanus diphtheria|tetanus-diphtheria'),
  simple('immunization', 'zoster-vaccine', 'Zoster (shingles) vaccine', 'Routine', 'zoster vaccine|shingles vaccine|recombinant zoster|shingrix'),
  simple('immunization', 'pneumococcal-vaccine', 'Pneumococcal vaccine', 'Routine', 'pneumococcal vaccine|pneumococcal conjugate|pcv20|pcv15|pneumovax'),
  simple('immunization', 'hepatitis-b-vaccine', 'Hepatitis B vaccine', 'Routine', 'hepatitis b vaccine|hep b vaccine|hepb'),
  simple('immunization', 'hepatitis-a-vaccine', 'Hepatitis A vaccine', 'Travel', 'hepatitis a vaccine|hep a vaccine'),
  simple('immunization', 'mmr-vaccine', 'MMR vaccine', 'Routine', 'mmr vaccine|measles mumps rubella'),
  simple('immunization', 'varicella-vaccine', 'Varicella vaccine', 'Routine', 'varicella vaccine|chickenpox vaccine'),
  simple('immunization', 'hpv-vaccine', 'HPV vaccine', 'Routine', 'hpv vaccine|human papillomavirus vaccine|gardasil'),
  simple('immunization', 'rsv-vaccine', 'RSV vaccine', 'Routine', 'rsv vaccine|respiratory syncytial virus vaccine|arexvy|abrysvo'),
];

/** Symptoms and reported findings. */
export const SYMPTOM_SPECS: ConceptSpec[] = [
  simple('symptom', 'fatigue', 'Fatigue', 'Constitutional', 'fatigue|tiredness|malaise|low energy'),
  simple('symptom', 'chest-pain', 'Chest pain', 'Cardiovascular', 'chest pain|chest tightness|chest pressure'),
  simple('symptom', 'dyspnea', 'Shortness of breath', 'Respiratory', 'shortness of breath|dyspnea|dyspnoea|breathlessness|sob\\b'),
  simple('symptom', 'headache', 'Headache', 'Neurological', 'headache|headaches|cephalgia'),
  simple('symptom', 'dizziness', 'Dizziness', 'Neurological', 'dizziness|lightheadedness|light-headed|vertigo'),
  simple('symptom', 'palpitations', 'Palpitations', 'Cardiovascular', 'palpitations|heart racing|irregular heartbeat'),
  simple('symptom', 'cough', 'Cough', 'Respiratory', 'cough|coughing|productive cough|dry cough'),
  simple('symptom', 'rash', 'Rash', 'Dermatologic', 'rash|skin rash|urticaria|hives'),
  simple('symptom', 'nausea', 'Nausea', 'Gastrointestinal', 'nausea|nauseated|vomiting'),
  simple('symptom', 'abdominal-pain', 'Abdominal pain', 'Gastrointestinal', 'abdominal pain|stomach pain|epigastric pain'),
  simple('symptom', 'back-pain', 'Back pain', 'Musculoskeletal', 'back pain|low back pain'),
  simple('symptom', 'joint-pain', 'Joint pain', 'Musculoskeletal', 'joint pain|arthralgia|joint stiffness'),
  simple('symptom', 'edema', 'Edema', 'Cardiovascular', 'edema|oedema|swelling of the legs|ankle swelling|peripheral edema'),
  simple('symptom', 'paresthesia', 'Numbness / tingling', 'Neurological', 'numbness|tingling|paresthesia|neuropathic pain'),
  simple('symptom', 'blurred-vision', 'Blurred vision', 'Ophthalmologic', 'blurred vision|vision changes'),
  simple('symptom', 'polyuria', 'Frequent urination', 'Genitourinary', 'frequent urination|polyuria|nocturia'),
  simple('symptom', 'polydipsia', 'Excessive thirst', 'Constitutional', 'excessive thirst|polydipsia'),
  simple('symptom', 'unintentional-weight-loss', 'Unintentional weight loss', 'Constitutional', 'unintentional weight loss|weight loss'),
  simple('symptom', 'weight-gain', 'Weight gain', 'Constitutional', 'weight gain'),
  simple('symptom', 'fever', 'Fever', 'Constitutional', 'fever|febrile|chills'),
  simple('symptom', 'night-sweats', 'Night sweats', 'Constitutional', 'night sweats'),
  simple('symptom', 'brain-fog', 'Brain fog', 'Neurological', 'brain fog|difficulty concentrating|poor concentration'),
  simple('symptom', 'heartburn', 'Heartburn', 'Gastrointestinal', 'heartburn|pyrosis'),
  simple('symptom', 'constipation', 'Constipation', 'Gastrointestinal', 'constipation'),
  simple('symptom', 'diarrhea', 'Diarrhea', 'Gastrointestinal', 'diarrhea|diarrhoea|loose stools'),
  simple('symptom', 'myalgia', 'Muscle pain', 'Musculoskeletal', 'muscle pain|myalgia|muscle aches'),
];
