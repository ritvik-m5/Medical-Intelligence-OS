import type { ExternalEvidence } from '../types';
import { drug } from './evidenceTypes';

/** Drug-class evidence. Never a statement about this patient. */
export const DRUG_EVIDENCE: ExternalEvidence[] = [
  drug(
    'ev_statin',
    'Statins',
    'atorvastatin',
    ['medication:atorvastatin', 'medication:rosuvastatin', 'medication:simvastatin', 'medication:pravastatin'],
    'Statins lower LDL cholesterol by inhibiting HMG-CoA reductase. Labeling commonly lists liver enzyme and muscle-related monitoring considerations, and muscle symptoms are a recognised reason clinicians change or stop therapy.',
  ),
  drug(
    'ev_ace',
    'ACE inhibitors',
    'lisinopril',
    ['medication:lisinopril', 'medication:enalapril', 'medication:ramipril', 'medication:benazepril'],
    'ACE inhibitors reduce blood pressure through the renin-angiotensin system and are used in hypertension, heart failure and kidney protection. Labeling typically advises monitoring potassium and kidney function, and notes cough and angioedema as class effects.',
  ),
  drug(
    'ev_arb',
    'Angiotensin receptor blockers',
    'losartan',
    ['medication:losartan', 'medication:valsartan', 'medication:olmesartan'],
    'ARBs block the angiotensin II receptor and are used for blood pressure and kidney protection, generally with a lower cough rate than ACE inhibitors. Potassium and kidney function monitoring is commonly advised.',
  ),
  drug(
    'ev_metformin',
    'Metformin',
    'metformin',
    ['medication:metformin', 'condition:type-2-diabetes', 'condition:prediabetes'],
    'Metformin lowers hepatic glucose production and improves insulin sensitivity. It is among the most commonly used first-line glucose-lowering medications. Labeling addresses kidney function thresholds and long-term vitamin B12 considerations.',
  ),
  drug(
    'ev_glp1',
    'GLP-1 receptor agonists',
    'semaglutide',
    ['medication:semaglutide', 'medication:dulaglutide', 'medication:tirzepatide'],
    'GLP-1 receptor agonists increase glucose-dependent insulin release, slow gastric emptying and reduce appetite. They are used for glycaemic control and, at some doses, for weight management. Nausea is commonly reported, particularly around dose increases.',
  ),
  drug(
    'ev_sglt2',
    'SGLT2 inhibitors',
    'empagliflozin',
    ['medication:empagliflozin', 'medication:dapagliflozin'],
    'SGLT2 inhibitors reduce glucose reabsorption in the kidney and are used in type 2 diabetes, and separately in heart failure and kidney disease. Labeling covers kidney function assessment and volume-related effects.',
  ),
  drug(
    'ev_levothyroxine',
    'Levothyroxine',
    'levothyroxine',
    ['medication:levothyroxine', 'condition:hypothyroidism'],
    'Levothyroxine replaces thyroid hormone. Dosing is individualised and response is usually assessed with TSH, which is why a thyroid panel is often repeated after a dose change.',
  ),
  drug(
    'ev_ppi',
    'Proton pump inhibitors',
    'omeprazole',
    ['medication:omeprazole', 'medication:pantoprazole', 'medication:esomeprazole'],
    'Proton pump inhibitors reduce gastric acid secretion and are used for reflux-related conditions and ulcer healing. Long-term use labeling discusses magnesium and vitamin B12 considerations.',
  ),
  drug(
    'ev_ssri',
    'SSRIs',
    'sertraline',
    ['medication:sertraline', 'medication:escitalopram', 'medication:fluoxetine'],
    'Selective serotonin reuptake inhibitors are used for depressive and anxiety disorders. Labeling includes a boxed warning about suicidality in younger patients and notes hyponatraemia as an uncommon class effect.',
  ),
  drug(
    'ev_anticoag',
    'Direct oral anticoagulants',
    'apixaban',
    ['medication:apixaban', 'medication:rivaroxaban'],
    'Direct oral anticoagulants reduce clot formation by inhibiting factor Xa and are used in atrial fibrillation and venous thromboembolism. Bleeding risk assessment and kidney function monitoring are standard parts of labeling.',
  ),
];
