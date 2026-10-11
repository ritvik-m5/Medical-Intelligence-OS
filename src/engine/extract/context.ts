import type { ConceptCode, FactFlag, FactStatus, FactType, ISODate, ReferenceRange, SectionKind, SourceDocument } from '../types';
import type { Segment } from './segments';
import type { ConceptSpec } from '../text/lexiconTypes';

/** Everything an extractor needs: the document, its segments, and the date context. */
export interface ExtractContext {
  doc: SourceDocument;
  segments: Segment[];
}

export interface FactDraft {
  type: FactType;
  entityKey: string;
  label: string;
  spec: ConceptSpec;
  codes?: ConceptCode[];
  valueNum?: number;
  valueText?: string;
  unit?: string;
  comparator?: '<' | '>' | '<=' | '>=';
  referenceRange?: ReferenceRange;
  status: FactStatus;
  occurredAt: ISODate;
  periodEnd?: ISODate;
  sectionKind: SectionKind;
  sectionId?: string;
  span: [number, number];
  quote: string;
  extractor: string;
  confidence: number;
  flags: FactFlag[];
  attrs: Record<string, string | number | boolean>;
}

/**
 * Which fact kinds a section is allowed to produce. This single function is what
 * keeps an "Allergy: Penicillin" line from becoming an active medication, and
 * what keeps a medication list from producing phantom diagnoses.
 */
export function preferredKindsFor(sectionKind: SectionKind | undefined): FactType[] {
  switch (sectionKind) {
    case 'current_medications':
    case 'discontinued_medications':
    case 'medication_history':
      return ['medication', 'allergy'];
    case 'allergies':
      return ['allergy', 'medication'];
    case 'immunizations':
      return ['immunization'];
    case 'procedures':
      return ['procedure'];
    case 'vitals':
      return ['vital', 'measurement'];
    case 'results':
      return ['measurement', 'vital'];
    case 'problem_list':
    case 'assessment':
    case 'impression':
      return ['condition', 'symptom', 'procedure'];
    case 'plan':
      return ['medication', 'procedure', 'condition', 'symptom'];
    case 'history':
    case 'family_history':
      return ['condition', 'symptom', 'procedure', 'medication'];
    case 'social_history':
      return ['social', 'symptom'];
    default:
      return ['measurement', 'vital', 'medication', 'condition', 'procedure', 'allergy', 'immunization', 'symptom', 'social', 'demographic'];
  }
}

export function overlaps(consumed: Array<[number, number]>, span: [number, number]): boolean {
  return consumed.some(([s, e]) => span[0] < e && span[1] > s);
}
