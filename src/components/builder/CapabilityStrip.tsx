import { useReveal } from '../../builder/scroll';
import { RULE_SUMMARY } from '../../builder/scenarios';

/* ------------------------------------------------------------------ */
/* What a build hands back                                             */
/*                                                                    */
/* Six things, each one a capability of the engine rather than a        */
/* marketing claim. They reveal in sequence as the strip enters view.   */
/* ------------------------------------------------------------------ */

interface Capability {
  id: string;
  name: string;
  detail: string;
  /** The concrete artefact, shown as a mono line. */
  artefact: string;
}

const CAPABILITIES: Capability[] = [
  {
    id: 'provenance',
    name: 'Provenance',
    detail: 'Every fact keeps the document id and the character span it was read from.',
    artefact: 'doc_2024_lab · [412, 448]',
  },
  {
    id: 'intervals',
    name: 'Intervals',
    detail: 'Medication courses and condition spans are reconstructed, then related with interval algebra.',
    artefact: 'atorvastatin · 2023-04-11 → 2025-03-09',
  },
  {
    id: 'inference',
    name: 'Inference',
    detail: `The engine's ${RULE_SUMMARY} emit derivations as proof graphs, each ending in exactly one conclusion.`,
    artefact: 'premise → interval → rule → conclusion',
  },
  {
    id: 'quality',
    name: 'Quality',
    detail: 'Nine weighted dimensions score the record and name the documents that justify each score.',
    artefact: 'provenance integrity 98 · completeness 71',
  },
  {
    id: 'coding',
    name: 'Coding',
    detail: 'Concepts are mapped to LOINC, RxNorm, SNOMED, ICD-10 and CVX where a mapping is known.',
    artefact: 'LOINC 4548-4 · RxNorm 83367',
  },
  {
    id: 'export',
    name: 'Export',
    detail: 'A FHIR R4 bundle with provenance on every resource, plus a redacted variant and a removal manifest.',
    artefact: 'Bundle/collection · 214 resources',
  },
];

export function CapabilityStrip() {
  const { ref, revealed } = useReveal<HTMLElement>({ threshold: 0.15 });

  return (
    <section className={`capstrip${revealed ? ' is-revealed' : ''}`} ref={ref}>
      <div className="capstrip-head">
        <h2 className="capstrip-title">A build returns more than a screen</h2>
        <p className="capstrip-sub">
          The same run produces the provenance, the reasoning, the quality score and the export. None
          of them are bolted on afterwards.
        </p>
      </div>

      <div className="capstrip-grid">
        {CAPABILITIES.map((capability, index) => (
          <article
            className="capcard"
            key={capability.id}
            style={{ '--i': index } as React.CSSProperties}
          >
            <div className="capcard-index">{String(index + 1).padStart(2, '0')}</div>
            <div className="capcard-name">{capability.name}</div>
            <p className="capcard-detail">{capability.detail}</p>
            <code className="capcard-artefact">{capability.artefact}</code>
          </article>
        ))}
      </div>
    </section>
  );
}
