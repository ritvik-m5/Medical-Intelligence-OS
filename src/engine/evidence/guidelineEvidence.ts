import type { ExternalEvidence } from '../types';
import { drug } from './evidenceTypes';

/** Prevention guidance and reference archives, kept clearly separate from personal data. */
export const GUIDELINE_EVIDENCE: ExternalEvidence[] = [
  {
    id: 'ev_immunization_schedule',
    title: 'CDC immunization schedules (adults and children)',
    source: 'CDC',
    url: 'https://www.cdc.gov/vaccines/hcp/imz-schedules/index.html',
    summary:
      'The CDC publishes annual age-based immunization schedules. They are used to check whether a recorded vaccination history is complete for a person\'s age and risk factors.',
    topics: [
      'immunization:influenza-vaccine',
      'immunization:covid19-vaccine',
      'immunization:tdap',
      'immunization:zoster-vaccine',
      'immunization:pneumococcal-vaccine',
    ],
    kind: 'guideline',
    retrieved: '2026-10-02',
  },
  {
    id: 'ev_dailymed',
    title: 'DailyMed — official drug labeling archive',
    source: 'FDA label search',
    url: 'https://dailymed.nlm.nih.gov/dailymed/',
    summary:
      'DailyMed is the National Library of Medicine archive of FDA-approved drug labels. It is the authoritative place to check indications, dosing, warnings and interactions for a specific product.',
    topics: ['medication:atorvastatin', 'medication:metformin', 'medication:lisinopril'],
    kind: 'guideline',
    retrieved: '2026-10-02',
  },
  drug(
    'ev_glp1_weight',
    'Weight-management GLP-1 therapy',
    'semaglutide',
    ['medication:semaglutide', 'condition:obesity'],
    'Some GLP-1 receptor agonists are separately approved at specific doses for weight management. Dose escalation schedules are described in labeling because gastrointestinal effects are common during titration.',
  ),
];
