import { useState } from 'react';
import type { Derivation } from '../engine/derive/types';
import type { HealthGraph } from '../engine/types';
import type { EngineStatus } from '../lib/engineStatus';
import { statusLine } from '../lib/engineStatus';
import { verificationHeadline } from '../engine/verify';
import {
  reproductionHeadline,
  type ArtifactIdentity,
  type ReproductionReport,
} from '../engine/identity';
import type { BuildStep } from '../builder/types';
import { Icon } from './Icon';

/* ------------------------------------------------------------------ */
/* The artifact inspector                                              */
/*                                                                    */
/* This is the answer to "prove it". It shows the artifact a build      */
/* produced, the provenance verdict computed on this render, the        */
/* pipeline that ran, and every finding with its proof statistics.      */
/*                                                                    */
/* Nothing here is a summary of a summary. The counts come from the     */
/* graph and the verification runs when the panel opens.                */
/* ------------------------------------------------------------------ */

interface ArtifactInspectorProps {
  status: EngineStatus;
  graph: HealthGraph;
  derivations: Derivation[];
  /** Present only when the artifact came from a builder run. */
  steps?: BuildStep[];
  interop?: { resourceCount: number; codedConcepts: number; totalConcepts: number };
  /**
   * Re-run this artifact from its own inputs and compare.
   *
   * Supplied by the builder, where an artifact is a frozen result. The workspace
   * omits it: its graph is derived live, so "reproduce" there would be a
   * tautology rather than a test.
   */
  onReproduce?: () => ReproductionReport;
  onClose: () => void;
  onOpenProof?: (derivationId: string) => void;
  onOpenDocument?: (docId: string) => void;
}

export function ArtifactInspector({
  status,
  graph,
  derivations,
  steps,
  interop,
  onReproduce,
  onClose,
  onOpenProof,
  onOpenDocument,
}: ArtifactInspectorProps) {
  const report = status.verification;
  const [reproduction, setReproduction] = useState<ReproductionReport | null>(null);

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} role="presentation" />
      <aside className="drawer drawer--wide" aria-label="Engine artifact">
        <header className="drawer-head">
          <div>
            <div className="panel-title">Engine artifact</div>
            <div className="panel-sub">
              {status.record} · {statusLine(status)}
              {status.elapsedMs !== undefined ? ` · built in ${status.elapsedMs} ms` : ''}
            </div>
          </div>
          <button type="button" className="drawer-close" onClick={onClose} aria-label="Close">
            <Icon.Close size={14} />
          </button>
        </header>

        <div className="drawer-body">
          <section className={`inspector-verdict${report.clean ? ' is-clean' : ' is-failed'}`}>
            <div className="inspector-verdict-score">
              <span className="inspector-verdict-value">{report.score}</span>
              <span className="inspector-verdict-label">
                {report.clean ? 'verified' : 'failures found'}
              </span>
            </div>
            <p className="inspector-verdict-text">{verificationHeadline(report)}</p>
          </section>

          <InspectorIdentity
            identity={status.identity}
            reproduction={reproduction}
            onReproduce={onReproduce ? () => setReproduction(onReproduce()) : undefined}
          />

          <InspectorVerification report={report} />

          {steps && steps.length > 0 && <InspectorPipeline steps={steps} />}

          <InspectorDocuments graph={graph} onOpenDocument={onOpenDocument} />

          <InspectorDerivations derivations={derivations} onOpenProof={onOpenProof} />

          {interop && <InspectorInterop interop={interop} />}
        </div>
      </aside>
    </>
  );
}

/* ---------------------------- Verification --------------------------- */

/**
 * What this result is called, and what it would take to reproduce it.
 *
 * The name is computed, not assigned: the corpus hash says which record, the
 * result hash says which output, and the two version numbers say which engine
 * and rule set produced it. Quoting the id quotes all four.
 */
function InspectorIdentity({
  identity,
  reproduction,
  onReproduce,
}: {
  identity: ArtifactIdentity;
  reproduction: ReproductionReport | null;
  onReproduce?: () => void;
}) {
  const rows: Array<{ label: string; value: string; note: string }> = [
    {
      label: 'Artifact',
      value: identity.artifactId,
      note: 'the content address: corpus · rule set · engine · result',
    },
    {
      label: 'Corpus',
      value: identity.corpusHash,
      note: `${identity.documents} documents, hashed order-independently`,
    },
    {
      label: 'Result',
      value: identity.resultHash,
      note: `${identity.facts} facts · ${identity.entities} entities · ${identity.derivations} findings`,
    },
    {
      label: 'Engine',
      value: identity.engineVersion,
      note: 'bumped deliberately when behaviour changes',
    },
    {
      label: 'Rule set',
      value: identity.rulesetVersion,
      note: `${identity.ruleCount} rules, in registry order`,
    },
  ];

  return (
    <section className="inspector-section">
      <div className="inspector-section-head">
        <h3>Identity</h3>
        <span className="inspector-section-sub">
          <span className="mono inspector-id">{identity.id}</span>
        </span>
      </div>

      <div className="inspector-identity">
        {rows.map((row) => (
          <div className="inspector-identity-row" key={row.label}>
            <span className="inspector-identity-label">{row.label}</span>
            <span className="inspector-identity-value mono">{row.value}</span>
            <span className="inspector-identity-note">{row.note}</span>
          </div>
        ))}
      </div>

      {onReproduce && (
        <div className="inspector-reproduce">
          <button type="button" className="btn is-sm" onClick={onReproduce}>
            <Icon.Play size={12} />
            Reproduce this artifact
          </button>
          <span className="dim">
            Re-reads the corpus, rebuilds the graph, runs the rules again and compares the result
            finding by finding.
          </span>
        </div>
      )}

      {reproduction && (
        <div className={`inspector-report is-${reproduction.status}`}>
          <div className="inspector-report-head">
            <span className={`inspector-report-status is-${reproduction.status}`}>
              {reproduction.status}
            </span>
            <span className="inspector-report-text">{reproductionHeadline(reproduction)}</span>
          </div>

          <div className="inspector-report-checks">
            {(
              [
                ['corpus', reproduction.corpus],
                ['engine', reproduction.engine],
                ['rule set', reproduction.ruleset],
                ['result', reproduction.result],
              ] as const
            ).map(([label, state]) => (
              <span
                key={label}
                className={`inspector-report-check${state === 'match' ? ' is-ok' : ' is-bad'}`}
              >
                {state === 'match' ? '✓' : '✕'} {label}
              </span>
            ))}
          </div>

          {reproduction.notes.map((note, index) => (
            <div className="inspector-report-note" key={index}>
              {note}
            </div>
          ))}

          {[...reproduction.added, ...reproduction.removed, ...reproduction.altered].length > 0 && (
            <div className="inspector-report-deltas">
              {reproduction.added.map((delta) => (
                <div className="inspector-report-delta is-added" key={`a-${delta.id}`}>
                  <span className="mono">{delta.ruleId}</span>
                  <span>{delta.title}</span>
                  <span className="dim">{delta.detail}</span>
                </div>
              ))}
              {reproduction.removed.map((delta) => (
                <div className="inspector-report-delta is-removed" key={`r-${delta.id}`}>
                  <span className="mono">{delta.ruleId}</span>
                  <span>{delta.title}</span>
                  <span className="dim">{delta.detail}</span>
                </div>
              ))}
              {reproduction.altered.map((delta) => (
                <div className="inspector-report-delta is-altered" key={`c-${delta.id}`}>
                  <span className="mono">{delta.ruleId}</span>
                  <span>{delta.title}</span>
                  <span className="dim">{delta.detail}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/* --------------------------- Verification --------------------------- */

function InspectorVerification({ report }: { report: EngineStatus['verification'] }) {
  const checks: Array<{ label: string; value: string; ok: boolean; detail: string }> = [
    {
      label: 'Facts re-read from source',
      value: `${report.facts.quoted} / ${report.facts.total}`,
      ok: report.facts.quoted === report.facts.total,
      detail: 'Each span was re-sliced and matched against the fact it came from.',
    },
    {
      label: 'Spans inside their document',
      value: `${report.facts.anchored} / ${report.facts.total}`,
      ok: report.facts.anchored === report.facts.total,
      detail: 'No span runs past the end of the text it points at.',
    },
    {
      label: 'Proofs topologically ordered',
      value: `${report.derivations.ordered} / ${report.derivations.total}`,
      ok: report.derivations.ordered === report.derivations.total,
      detail: 'Every step appears after the steps it depends on. This also rules out cycles.',
    },
    {
      label: 'Proof dependencies resolved',
      value: `${report.derivations.resolved} / ${report.derivations.total}`,
      ok: report.derivations.resolved === report.derivations.total,
      detail: 'No step points at an id that is not in the same proof.',
    },
    {
      label: 'Findings citing evidence',
      value: `${report.derivations.withEvidence} / ${report.derivations.total}`,
      ok: report.derivations.withEvidence === report.derivations.total,
      detail: 'A finding that cites nothing cannot be checked by a reader.',
    },
    {
      label: 'Citations resolving',
      value: `${report.citations.factRefs - report.citations.danglingFactRefs} facts · ${
        report.citations.docRefs - report.citations.danglingDocRefs
      } docs`,
      ok:
        report.citations.danglingFactRefs === 0 && report.citations.danglingDocRefs === 0,
      detail: 'Every fact id and document id a finding names exists in the graph.',
    },
  ];

  const problemCount = report.problems.facts.length + report.problems.proofs.length;

  return (
    <section className="inspector-section">
      <div className="inspector-section-head">
        <h3>Provenance</h3>
        <span className="inspector-section-sub">
          recomputed when this panel opened, not stored
        </span>
      </div>

      <div className="inspector-checks">
        {checks.map((check) => (
          <div className={`inspector-check${check.ok ? ' is-ok' : ' is-bad'}`} key={check.label}>
            <span className="inspector-check-mark" aria-hidden="true">
              {check.ok ? '✓' : '✕'}
            </span>
            <div className="inspector-check-body">
              <div className="inspector-check-row">
                <span className="inspector-check-label">{check.label}</span>
                <span className="inspector-check-value">{check.value}</span>
              </div>
              <div className="inspector-check-detail">{check.detail}</div>
            </div>
          </div>
        ))}
      </div>

      {problemCount > 0 && (
        <div className="inspector-problems">
          {report.problems.facts.map((problem) => (
            <div className="inspector-problem" key={problem.factId}>
              <span className="inspector-problem-tag">fact</span>
              <span className="mono">{problem.factId}</span>
              <span>{problem.reason}</span>
            </div>
          ))}
          {report.problems.proofs.map((problem) => (
            <div className="inspector-problem" key={problem.derivationId}>
              <span className="inspector-problem-tag">proof</span>
              <span className="mono">{problem.ruleId}</span>
              <span>{problem.reason}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ----------------------------- Pipeline ----------------------------- */

function InspectorPipeline({ steps }: { steps: BuildStep[] }) {
  return (
    <section className="inspector-section">
      <div className="inspector-section-head">
        <h3>Pipeline</h3>
        <span className="inspector-section-sub">{steps.length} steps, as they ran</span>
      </div>
      <div className="inspector-steps">
        {steps.map((step) => (
          <div className="inspector-step" key={step.id}>
            <span className="inspector-step-stage">{step.stage}</span>
            <div className="inspector-step-body">
              <div className="inspector-step-label">{step.label}</div>
              <div className="inspector-step-detail">{step.detail}</div>
            </div>
            <span className="inspector-step-progress">
              {Math.round(step.progress * 100)}%
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------------------------- Documents ---------------------------- */

function InspectorDocuments({
  graph,
  onOpenDocument,
}: {
  graph: HealthGraph;
  onOpenDocument?: (docId: string) => void;
}) {
  const factsByDoc = graph.facts.reduce<Record<string, number>>((acc, fact) => {
    acc[fact.docId] = (acc[fact.docId] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <section className="inspector-section">
      <div className="inspector-section-head">
        <h3>Documents</h3>
        <span className="inspector-section-sub">
          {graph.documents.length} read · {graph.facts.length} facts extracted
        </span>
      </div>
      <div className="inspector-table">
        {graph.documents.map((doc) => (
          <button
            type="button"
            className={`inspector-row${onOpenDocument ? ' is-clickable' : ''}`}
            key={doc.id}
            onClick={() => onOpenDocument?.(doc.id)}
            disabled={!onOpenDocument}
          >
            <span className="inspector-row-kind">{doc.kind.replace(/_/g, ' ')}</span>
            <span className="inspector-row-title">{doc.title}</span>
            <span className="inspector-row-date mono">{doc.date}</span>
            <span className="inspector-row-count mono">{factsByDoc[doc.id] ?? 0}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/* --------------------------- Derivations --------------------------- */

function InspectorDerivations({
  derivations,
  onOpenProof,
}: {
  derivations: Derivation[];
  onOpenProof?: (derivationId: string) => void;
}) {
  return (
    <section className="inspector-section">
      <div className="inspector-section-head">
        <h3>Derivations</h3>
        <span className="inspector-section-sub">
          {derivations.length} findings, each with a proof graph
        </span>
      </div>
      <div className="inspector-table">
        {derivations.map((derivation) => (
          <button
            type="button"
            className={`inspector-row is-${derivation.severity} is-clickable`}
            key={derivation.id}
            onClick={() => onOpenProof?.(derivation.id)}
            disabled={!onOpenProof}
          >
            <span className="inspector-row-kind">{derivation.ruleId}</span>
            <span className="inspector-row-title">{derivation.title}</span>
            <span className="inspector-row-date mono">grade {derivation.grade}</span>
            <span className="inspector-row-count mono">
              {derivation.steps.length} steps · {derivation.confidence.toFixed(2)}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------ Interop ----------------------------- */

function InspectorInterop({
  interop,
}: {
  interop: { resourceCount: number; codedConcepts: number; totalConcepts: number };
}) {
  const percent =
    interop.totalConcepts === 0
      ? 0
      : Math.round((interop.codedConcepts / interop.totalConcepts) * 100);

  return (
    <section className="inspector-section">
      <div className="inspector-section-head">
        <h3>Export</h3>
        <span className="inspector-section-sub">FHIR R4 collection bundle</span>
      </div>
      <div className="inspector-export">
        <div className="inspector-export-stat">
          <span className="inspector-export-value mono">{interop.resourceCount}</span>
          <span className="inspector-export-label">resources</span>
        </div>
        <div className="inspector-export-stat">
          <span className="inspector-export-value mono">{interop.codedConcepts}</span>
          <span className="inspector-export-label">coded concepts</span>
        </div>
        <div className="inspector-export-stat">
          <span className="inspector-export-value mono">{interop.totalConcepts}</span>
          <span className="inspector-export-label">total concepts</span>
        </div>
        <div className="inspector-export-stat">
          <span className="inspector-export-value mono">{percent}%</span>
          <span className="inspector-export-label">coding coverage</span>
        </div>
      </div>
      <p className="inspector-note">
        Every clinical resource in the bundle carries the document id and character span it was read
        from, so a receiving system can trace any value back to its source line.
      </p>
    </section>
  );
}
