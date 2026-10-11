import type { EvidenceLink, ExternalSource, PersonalEvidenceItem } from './types';

/**
 * Relate a personal item to an external source.
 *
 * Sharing a word is not support. Sharing an entity key is contextualization:
 * the source is about the same concept the record documented. A medical
 * "supports" conclusion is never inferred here.
 */
export function relateEvidence(
  personal: PersonalEvidenceItem,
  source: ExternalSource,
): EvidenceLink | null {
  const overlap = personal.entityKeys.filter((key) => source.entityIds.includes(key));
  if (overlap.length === 0) return null;

  return {
    personalId: personal.id,
    externalSourceId: source.id,
    state: 'contextualizes',
    because: `Both name ${overlap.join(', ')}. That is not a finding about the patient.`,
  };
}

export function linkEvidence(
  personal: PersonalEvidenceItem[],
  sources: ExternalSource[],
): EvidenceLink[] {
  const links: EvidenceLink[] = [];
  for (const item of personal) {
    for (const source of sources) {
      const link = relateEvidence(item, source);
      if (link) links.push(link);
    }
  }
  return links.sort(
    (a, b) =>
      a.personalId.localeCompare(b.personalId) || a.externalSourceId.localeCompare(b.externalSourceId),
  );
}
