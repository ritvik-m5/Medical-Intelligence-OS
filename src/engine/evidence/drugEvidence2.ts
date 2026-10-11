import type { ExternalEvidence } from '../types';
import { drug } from './evidenceTypes';

/** Drug-class evidence, continued. Never a statement about this patient. */
export const DRUG_EVIDENCE_2: ExternalEvidence[] = [
  drug(
    'ev_warfarin',
    'Warfarin',
    'warfarin',
    ['medication:warfarin', 'measurement:inr'],
    'Warfarin inhibits vitamin K-dependent clotting factors. Effect is monitored with INR, and many drug and dietary interactions are described in labeling.',
  ),
  drug(
    'ev_allopurinol',
    'Allopurinol',
    'allopurinol',
    ['medication:allopurinol', 'condition:gout', 'measurement:uric-acid'],
    'Allopurinol reduces uric acid production and is used to prevent gout flares. Labeling describes rare but serious hypersensitivity reactions and advises dose adjustment with reduced kidney function.',
  ),
  drug(
    'ev_beta_blocker',
    'Beta blockers',
    'metoprolol',
    ['medication:metoprolol', 'medication:atenolol', 'medication:carvedilol', 'medication:bisoprolol'],
    'Beta blockers reduce heart rate and cardiac workload and are used in hypertension, ischaemic heart disease, heart failure and rate control in atrial fibrillation. Abrupt discontinuation is addressed in labeling.',
  ),
  drug(
    'ev_penicillin',
    'Penicillins and amoxicillin',
    'amoxicillin',
    ['medication:amoxicillin', 'medication:amoxicillin-clavulanate', 'medication:penicillin-vk'],
    'Penicillins are beta-lactam antibiotics. Labeling lists hypersensitivity reactions including rash and, rarely, anaphylaxis, and describes cross-reactivity considerations within the beta-lactam family.',
  ),
  drug(
    'ev_sulfa',
    'Trimethoprim/sulfamethoxazole',
    'trimethoprim sulfamethoxazole',
    ['medication:trimethoprim-sulfamethoxazole'],
    'A sulfonamide combination antibiotic. Labeling describes hypersensitivity reactions, including severe cutaneous reactions, and advises potassium and kidney function awareness.',
  ),
  drug(
    'ev_nsaid',
    'NSAIDs',
    'ibuprofen',
    ['medication:ibuprofen', 'medication:naproxen', 'medication:meloxicam', 'medication:celecoxib'],
    'NSAIDs reduce pain and inflammation through cyclo-oxygenase inhibition. Labeling includes cardiovascular and gastrointestinal risk information and advises kidney function awareness.',
  ),
  drug(
    'ev_corticosteroid',
    'Systemic corticosteroids',
    'prednisone',
    ['medication:prednisone', 'medication:methylprednisolone'],
    'Systemic corticosteroids suppress inflammation and immune activity. Labeling describes effects on glucose, blood pressure, bone density and infection risk with longer-term use.',
  ),
];
