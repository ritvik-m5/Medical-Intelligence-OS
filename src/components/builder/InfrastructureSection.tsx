import { useScrollProgress, stageProgress } from '../../builder/scroll';
import { RULE_SUMMARY } from '../../builder/scenarios';

/* ------------------------------------------------------------------ */
/* What comes with the product                                         */
/*                                                                    */
/* These are deliberately not eight feature cards. They are eight       */
/* layers of one system, drawn on a single spine, because that is how   */
/* they actually depend on each other: nothing above the data layer can */
/* be trusted if the layer beneath it is not.                           */
/* ------------------------------------------------------------------ */

interface Layer {
  id: string;
  name: string;
  detail: string;
  /** What this layer is in this product, stated concretely. */
  here: string;
  tone: 'accent' | 'blue' | 'violet';
}

const LAYERS: Layer[] = [
  {
    id: 'interface',
    name: 'Interface',
    detail: 'Thirteen views over one graph, plus the proof viewer.',
    here: 'Every view reads the same derivation list. None computes its own findings.',
    tone: 'accent',
  },
  {
    id: 'database',
    name: 'Data',
    detail: 'Documents, facts, entities and edges.',
    here: 'The stored form is the corpus, not the graph. The graph is rebuilt, so it can never drift from its sources.',
    tone: 'blue',
  },
  {
    id: 'auth',
    name: 'Authentication',
    detail: 'Who is asking.',
    here: 'Sessions are local. No document leaves the tab, and the audit log records what was opened.',
    tone: 'violet',
  },
  {
    id: 'permissions',
    name: 'Permissions',
    detail: 'What may be seen, and what may leave.',
    here: 'Three redaction policies, each emitting a removal manifest and a stated residual risk.',
    tone: 'accent',
  },
  {
    id: 'apis',
    name: 'APIs',
    detail: 'How anything else gets in or out.',
    here: 'A FHIR R4 collection bundle with provenance extensions, plus a round-trip importer.',
    tone: 'blue',
  },
  {
    id: 'ai',
    name: 'Inference',
    detail: 'What the system concludes, and on what basis.',
    here: `${RULE_SUMMARY}. Confidence propagates from premises; it is never asserted.`,
    tone: 'violet',
  },
  {
    id: 'automation',
    name: 'Automation',
    detail: 'What runs without being asked.',
    here: 'Ingestion, extraction, linking and derivation run on every change to the record.',
    tone: 'accent',
  },
  {
    id: 'deploy',
    name: 'Deployment',
    detail: 'Where it runs.',
    here: 'The engine and the platform layer contain no React and no DOM. They run in a browser, in a worker or on a server unchanged.',
    tone: 'blue',
  },
];

export function InfrastructureSection() {
  const { ref, progress } = useScrollProgress<HTMLElement>();
  // Each layer lights as the spine passes it.
  const reached = stageProgress(progress, 0.16, 0.72) * LAYERS.length;

  return (
    <section className="infra" ref={ref}>
      <div className="infra-head">
        <div className="infra-eyebrow">One system, eight layers</div>
        <h2 className="infra-title">The record is the foundation. Everything else stands on it.</h2>
        <p className="infra-sub">
          A health record product is not a screen with a database behind it. Each layer below is only
          as trustworthy as the one beneath, which is why provenance sits at the bottom and the
          interface sits at the top.
        </p>
      </div>

      <div className="infra-stack">
        <div className="infra-spine" aria-hidden="true">
          <div
            className="infra-spine-fill"
            style={{ height: `${Math.round(stageProgress(progress, 0.16, 0.72) * 100)}%` }}
          />
        </div>

        {LAYERS.map((layer, index) => {
          const lit = index < reached;
          return (
            <div
              className={`infra-layer is-${layer.tone}${lit ? ' is-lit' : ''}`}
              key={layer.id}
              style={{ '--i': index } as React.CSSProperties}
            >
              <span className="infra-node" aria-hidden="true" />
              <div className="infra-layer-name">{layer.name}</div>
              <div className="infra-layer-detail">{layer.detail}</div>
              <div className="infra-layer-here">{layer.here}</div>
            </div>
          );
        })}
      </div>

      <div className="infra-foot">
        Read from the top down, this is a product. Read from the bottom up, it is an argument about
        what can be believed.
      </div>
    </section>
  );
}
