import { useMemo, useState } from 'react';
import type { BuildArtifact } from '../../builder/types';
import { proofDiff } from '../../engine/analysis/proofDiff';
import {
  OPERATION_LABEL,
  shortAddress,
  type BranchOperation,
  type LineageGraph,
  type StoredRun,
} from '../../engine/platform/artifactStore';
import type { CounterfactualResult } from '../../engine/analysis/counterfactual';
import { impactOf, ruleLabel, type ImpactTarget } from '../../engine/analysis/impact';
import type { ProofDiff } from '../../engine/analysis/proofDiff';
import type { BranchRun, StabilityClass, StabilityProfile } from '../../engine/analysis/stability';
import {
  dependentsOfDocument,
  evidenceForFinding,
  knowableAsOf,
  mostSensitive,
  whatChanged,
  whatWouldRemoveFinding,
  whyFindingExists,
  type ResearchAnswer,
} from '../../engine/analysis/questions';
import type { ProvenanceReport } from '../../engine/verify';
import { Icon } from '../Icon';

/* ------------------------------------------------------------------ */
/* The Lab's panels                                                    */
/*                                                                    */
/* Every panel renders what an analysis module returned. None of them   */
/* computes a number, and none decides what is true: they lay out a     */
/* result the engine produced and label it with what it is.             */
/* ------------------------------------------------------------------ */

const STABILITY_TONE: Record<StabilityClass, string> = {
  stable: 'ok',
  sensitive: 'warn',
  fragile: 'bad',
  unsupported: 'bad',
};

const SEVERITY_TONE: Record<string, string> = { high: 'bad', medium: 'warn', low: 'plain' };

export function LabCard({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="lab-card">
      <div className="lab-card-label">{label}</div>
      <div className="lab-card-value">{value}</div>
      <div className="lab-card-note">{note}</div>
    </div>
  );
}

export function LabStat({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className={`lab-stat is-${ok ? 'ok' : 'warn'}`}>
      <span className="lab-stat-label">{label}</span>
      <span className="lab-stat-value">{value}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Baseline                                                            */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Baseline                                                            */
/* ------------------------------------------------------------------ */

export function BaselinePanel({
  artifact,
  verification,
}: {
  artifact: BuildArtifact;
  verification: ProvenanceReport | null;
}) {
  return (
    <div className="lab-panel">
      <div className="lab-cards">
        <LabCard label="Documents" value={artifact.documents.length} note="read into the graph" />
        <LabCard label="Facts" value={artifact.facts.length} note="each anchored to a span" />
        <LabCard
          label="Entities"
          value={artifact.graph.entities.length}
          note={`${artifact.graph.edges.length} edges, ${artifact.graph.edges.filter((edge) => edge.inferred).length} inferred`}
        />
        <LabCard
          label="Findings"
          value={artifact.derivations.length}
          note={`${artifact.derivations.filter((entry) => entry.severity === 'high').length} high severity`}
        />
      </div>

      {verification && (
        <section className="lab-section">
          <h3 className="lab-section-title">Verification</h3>
          <p className="lab-section-sub">
            Every fact re-read from its own span, and every proof walked as a DAG. This is the check
            that ran on the artifact in front of you, not on a fixture.
          </p>
          <div className="lab-verify">
            <LabStat
              label="Facts re-read"
              value={`${verification.facts.quoted} / ${verification.facts.total}`}
              ok={verification.facts.quoted === verification.facts.total}
            />
            <LabStat
              label="Proofs ordered"
              value={`${verification.derivations.ordered} / ${verification.derivations.total}`}
              ok={verification.derivations.ordered === verification.derivations.total}
            />
            <LabStat
              label="Findings citing evidence"
              value={`${verification.derivations.withEvidence} / ${verification.derivations.total}`}
              ok={verification.derivations.withEvidence === verification.derivations.total}
            />
            <LabStat
              label="Dangling citations"
              value={String(
                verification.citations.danglingFactRefs + verification.citations.danglingDocRefs,
              )}
              ok={
                verification.citations.danglingFactRefs === 0 &&
                verification.citations.danglingDocRefs === 0
              }
            />
          </div>
        </section>
      )}

      <section className="lab-section">
        <h3 className="lab-section-title">Findings</h3>
        <p className="lab-section-sub">
          Every conclusion this record supports, with the rule that produced it, the grade it rests
          on, and what the engine refuses to conclude from it.
        </p>
        <ul className="lab-findings">
          {artifact.derivations.map((derivation) => (
            <li key={derivation.id} className="lab-finding">
              <span className={`lab-sev is-${SEVERITY_TONE[derivation.severity]}`}>
                {derivation.severity}
              </span>
              <div className="lab-finding-body">
                <div className="lab-finding-title">{derivation.title}</div>
                <div className="lab-finding-meta">
                  <code>{derivation.ruleId}</code>
                  <span>grade {derivation.grade}</span>
                  <span>confidence {derivation.confidence.toFixed(2)}</span>
                  <span>{derivation.factIds.length} premises</span>
                  <span>depth {derivation.depth}</span>
                </div>
                <p className="lab-finding-not">{derivation.notConcluded}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Branches                                                            */
/* ------------------------------------------------------------------ */

interface BranchOptionView {
  kind: string;
  label: string;
  detail: string;
  available: boolean;
  reason?: string;
}

export interface LiveBranchView {
  run: StoredRun;
  artifact: BuildArtifact;
  operation: BranchOperation;
  reason: string;
}

export function BranchesPanel({
  artifact,
  branches,
  optionList,
  rules,
  busy,
  onRun,
  onFocus,
}: {
  artifact: BuildArtifact;
  branches: LiveBranchView[];
  optionList: BranchOptionView[];
  rules: Array<{ id: string; label: string; count: number }>;
  busy: boolean;
  onRun: (operation: BranchOperation, change: Record<string, unknown>, reason: string) => void;
  onFocus: (artifactId: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [rule, setRule] = useState<string | null>(null);
  const [docId, setDocId] = useState<string | null>(null);

  const earliest = artifact.graph.stats.spanStart;
  const documents = artifact.graph.documents;

  return (
    <div className="lab-panel">
      <BranchTree artifact={artifact} branches={branches} onFocus={onFocus} />

      <section className="lab-section">
        <h3 className="lab-section-title">Run a branch</h3>
        <p className="lab-section-sub">
          Each of these re-derives the record from its own documents with exactly one thing changed.
          A branch that cannot be run is shown with the reason rather than hidden.
        </p>

        <ul className="lab-options">
          {optionList.map((option) => {
            const active = open === option.kind;
            return (
              <li key={option.kind} className={`lab-option${active ? ' is-active' : ''}`}>
                <button
                  type="button"
                  className="lab-option-btn"
                  disabled={!option.available || busy}
                  onClick={() => {
                    setOpen(active ? null : option.kind);
                    setRule(null);
                    setDocId(null);
                  }}
                >
                  <span className="lab-option-label">{option.label}</span>
                  <span className="lab-option-detail">{option.detail}</span>
                  {!option.available && option.reason && (
                    <span className="lab-option-why">{option.reason}</span>
                  )}
                </button>

                {active && option.kind === 'withhold-rule' && (
                  <div className="lab-config">
                    <div className="lab-chips">
                      {rules.map((entry) => (
                        <button
                          key={entry.id}
                          type="button"
                          className={`lab-chip-btn${rule === entry.id ? ' is-picked' : ''}`}
                          onClick={() => setRule(entry.id)}
                        >
                          <code>{entry.id}</code>
                          <span>{entry.count}</span>
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="lab-btn"
                      disabled={!rule || busy}
                      onClick={() => {
                        if (!rule) return;
                        onRun('withhold-rule', { suppressRules: [rule] }, `withheld ${rule}`);
                        setOpen(null);
                        setRule(null);
                      }}
                    >
                      <Icon.Play size={12} />
                      Run the branch
                    </button>
                  </div>
                )}


                {active && option.kind === 'withhold-document' && (
                  <div className="lab-config">
                    <div className="lab-chips">
                      {documents.map((doc) => (
                        <button
                          key={doc.id}
                          type="button"
                          className={`lab-chip-btn${docId === doc.id ? ' is-picked' : ''}`}
                          onClick={() => setDocId(doc.id)}
                        >
                          <span>{doc.title}</span>
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="lab-btn"
                      disabled={!docId || busy}
                      onClick={() => {
                        if (!docId) return;
                        const title = documents.find((doc) => doc.id === docId)!.title;
                        onRun(
                          'withhold-document',
                          { withholdDocuments: [title] },
                          `withheld document \u201c${title}\u201d`,
                        );
                        setOpen(null);
                        setDocId(null);
                      }}
                    >
                      <Icon.Play size={12} />
                      Run the branch
                    </button>
                  </div>
                )}

                {active && option.kind === 'evaluate-earlier' && (
                  <div className="lab-config">
                    <p className="lab-config-note">
                      The record begins {earliest}. Anything not yet supported at that date is absent
                      from the branch, which is the point of asking.
                    </p>
                    <button
                      type="button"
                      className="lab-btn"
                      disabled={busy}
                      onClick={() => {
                        onRun('as-of', { asOf: earliest }, `evaluated as of ${earliest}`);
                        setOpen(null);
                      }}
                    >
                      <Icon.Play size={12} />
                      Run the branch
                    </button>
                  </div>
                )}

                {active && option.kind === 'add-document' && (
                  <div className="lab-config">
                    <p className="lab-config-note">
                      Adding a document needs a document, and this lab does not invent one. Attach it
                      in the builder and save that run; it will appear here as its own artifact, and
                      the diff against this one will be exact.
                    </p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

/** The branch tree: the baseline at the root, each branch beneath it. */
export function BranchTree({
  artifact,
  branches,
  onFocus,
}: {
  artifact: BuildArtifact;
  branches: LiveBranchView[];
  onFocus: (artifactId: string) => void;
}) {
  return (
    <section className="lab-section">
      <h3 className="lab-section-title">Tree</h3>
      <div className="lab-tree">
        <div className="lab-tree-root">
          <span className="lab-tree-tag">BASELINE</span>
          <code>{artifact.identity.id}</code>
          <span className="lab-tree-meta">{artifact.derivations.length} findings</span>
        </div>

        {branches.length === 0 && (
          <p className="lab-tree-empty">
            No branches yet. Running one re-derives the record and records its parent on the result.
          </p>
        )}

        <ul className="lab-tree-children">
          {branches.map((entry) => (
            <li key={entry.run.artifactId} className="lab-tree-child">
              <button
                type="button"
                className="lab-tree-btn"
                onClick={() => onFocus(entry.run.artifactId)}
              >
                <span className="lab-tree-tag is-branch">
                  {OPERATION_LABEL[entry.operation].toUpperCase()}
                </span>
                <code>{entry.artifact.identity.id}</code>
                <span className="lab-tree-meta">
                  {entry.artifact.derivations.length} findings
                  {entry.artifact.derivations.length !== artifact.derivations.length && (
                    <span className="lab-tree-delta">
                      {entry.artifact.derivations.length > artifact.derivations.length ? '+' : ''}
                      {entry.artifact.derivations.length - artifact.derivations.length}
                    </span>
                  )}
                </span>
                <span className="lab-tree-reason">{entry.reason}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Proof diff and counterfactual                                       */
/* ------------------------------------------------------------------ */

const CHANGE_TONE: Record<string, string> = {
  added: 'ok',
  removed: 'bad',
  replaced: 'warn',
  changed: 'warn',
  unchanged: 'plain',
};

function StepLine({ line }: { line: ProofDiff['lines'][number] }) {
  return (
    <li className={`lab-step is-${CHANGE_TONE[line.change]}`}>
      <span className="lab-step-tag">{line.change}</span>
      <div className="lab-step-body">
        <div className="lab-step-pair">
          <span className="lab-step-before">
            {line.before ? `${line.before.kind}: ${line.before.label}` : '\u2014'}
          </span>
          <Icon.Link size={12} />
          <span className="lab-step-after">
            {line.after ? `${line.after.kind}: ${line.after.label}` : '\u2014'}
          </span>
        </div>
        <p className="lab-step-why">{line.reason}</p>
      </div>
    </li>
  );
}

export function DiffPanel({
  artifact,
  chosen,
  counterfactuals,
}: {
  artifact: BuildArtifact;
  chosen: LiveBranchView | null;
  counterfactuals: CounterfactualResult[];
}) {
  const diff = useMemo(() => {
    if (!chosen) return null;
    const before = new Map(artifact.derivations.map((entry) => [entry.id, entry]));
    const after = new Map(chosen.artifact.derivations.map((entry) => [entry.id, entry]));
    const ids = new Set([...before.keys(), ...after.keys()]);
    return Array.from(ids)
      .map((id) => ({
        id,
        diff: proofDiff(before.get(id) ?? null, after.get(id) ?? null, (factId) => {
          const fact = artifact.graph.facts.find((entry) => entry.id === factId);
          return fact ? `\u201c${fact.quote}\u201d` : factId;
        }),
      }))
      .filter((entry) => entry.diff.presence !== 'both' || entry.diff.counts.unchanged !== entry.diff.lines.length || entry.diff.premises.removed.length > 0)
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [artifact, chosen]);

  const cf = chosen
    ? counterfactuals.find((entry) => entry.interventionResult?.identity === chosen.artifact.identity.id)
    : null;

  if (!chosen) {
    return (
      <div className="lab-panel">
        <p className="lab-tree-empty">
          Run a branch and its proof-level difference from the baseline will appear here. A diff
          compares the reasoning, not the counts.
        </p>
      </div>
    );
  }

  return (
    <div className="lab-panel">
      {cf && (
        <div className="lab-counterfactual">
          <div className="lab-cf-head">
            <span className="lab-cf-tag">{cf.label}</span>
            <strong>{cf.question}</strong>
          </div>
          <div className="lab-cf-chain">
            <span>
              baseline <code>{cf.baseline.identity}</code> \u00b7 {cf.baseline.findings} findings
            </span>
            <Icon.Link size={12} />
            <span>
              branch <code>{cf.interventionResult?.identity}</code> \u00b7{' '}
              {cf.interventionResult?.findings} findings
            </span>
            <Icon.Link size={12} />
            <span>{cf.changed.length} proofs changed</span>
          </div>
          <ul className="lab-cf-not">
            {cf.notClaimed.map((statement) => (
              <li key={statement}>{statement}</li>
            ))}
          </ul>
        </div>
      )}

      <section className="lab-section">
        <h3 className="lab-section-title">
          {chosen.artifact.identity.id} \u2192 {artifact.identity.id}
        </h3>
        <p className="lab-section-sub">
          {diff && diff.length > 0
            ? `${diff.length} findings differ between the baseline and this branch. Each is shown step by step: which premise was replaced, which rule step changed, and which part of the reasoning survived untouched.`
            : 'No finding differs. The branch changed the record without changing what the rules concluded.'}
        </p>

        <ul className="lab-diffs">
          {(diff ?? []).map((entry) => (
            <li key={entry.id} className="lab-diff">
              <div className="lab-diff-head">
                <code>{entry.diff.ruleId}</code>
                <span className="lab-diff-title">{entry.diff.title}</span>
                <span className={`lab-diff-presence is-${entry.diff.presence}`}>
                  {entry.diff.presence}
                </span>
              </div>
              <p className="lab-diff-headline">{entry.diff.headline}</p>
              {entry.diff.notes.map((note) => (
                <p key={note} className="lab-diff-note">
                  {note}
                </p>
              ))}
              <ul className="lab-steps">
                {entry.diff.lines.map((line) => (
                  <StepLine key={line.index} line={line} />
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}



/* ------------------------------------------------------------------ */
/* Impact                                                              */
/* ------------------------------------------------------------------ */

export function ImpactPanel({
  artifact,
  branches,
}: {
  artifact: BuildArtifact;
  branches: LiveBranchView[];
}) {
  const [target, setTarget] = useState<ImpactTarget>({
    kind: 'document',
    id: artifact.graph.documents[0]?.id ?? '',
  });

  const impact = useMemo(
    () =>
      impactOf(target, artifact.graph, artifact.derivations, {
        courses: artifact.courses,
        spans: artifact.spans,
      }),
    [target, artifact],
  );

  const rule = branches.find((entry) => entry.operation === 'withhold-rule');

  return (
    <div className="lab-panel">
      <section className="lab-section">
        <h3 className="lab-section-title">What depends on what</h3>
        <p className="lab-section-sub">
          Pick anything in the record and the chain that runs from it is computed from the
          dependencies the engine already recorded. Nothing is re-derived here, so the answer cannot
          disagree with the artifact it describes.
        </p>

        <div className="lab-targets">
          <label className="lab-target">
            <span>Document</span>
            <select
              value={target.kind === 'document' ? target.id : ''}
              onChange={(event) => setTarget({ kind: 'document', id: event.target.value })}
            >
              {artifact.graph.documents.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.title}
                </option>
              ))}
            </select>
          </label>

          <label className="lab-target">
            <span>Finding</span>
            <select
              value={target.kind === 'derivation' ? target.id : ''}
              onChange={(event) =>
                setTarget(
                  event.target.value
                    ? { kind: 'derivation', id: event.target.value }
                    : { kind: 'document', id: artifact.graph.documents[0]?.id ?? '' },
                )
              }
            >
              <option value="">\u2014 a document instead \u2014</option>
              {artifact.derivations.map((derivation) => (
                <option key={derivation.id} value={derivation.id}>
                  {derivation.title}
                </option>
              ))}
            </select>
          </label>

          <label className="lab-target">
            <span>Rule</span>
            <select
              value={target.kind === 'rule' ? target.id : ''}
              onChange={(event) =>
                setTarget(
                  event.target.value
                    ? { kind: 'rule', id: event.target.value }
                    : { kind: 'document', id: artifact.graph.documents[0]?.id ?? '' },
                )
              }
            >
              <option value="">\u2014 a document instead \u2014</option>
              {Array.from(new Set(artifact.derivations.map((d) => d.ruleId))).map((ruleId) => (
                <option key={ruleId} value={ruleId}>
                  {ruleLabel(ruleId)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="lab-section">
        <h3 className="lab-section-title">{impact.headline}</h3>
        <div className="lab-chain">
          <LabCard label="Facts removed" value={impact.removedFacts.length} note="with their spans" />
          <LabCard
            label="Entities affected"
            value={impact.affectedEntities.length}
            note="losing evidence"
          />
          <LabCard
            label="Findings lost"
            value={impact.lostFindings.length}
            note="cannot be derived without it"
          />
          <LabCard
            label="Findings thinned"
            value={impact.thinnedFindings.length}
            note="still hold, on less"
          />
          <LabCard
            label="Export resources"
            value={impact.exports.resources}
            note="would leave the bundle"
          />
          <LabCard
            label="Rule prevalences"
            value={impact.cohort.length}
            note="would move in this record"
          />
        </div>

        <p className="lab-note">{impact.exports.note}</p>

        {impact.lostFindings.length > 0 && (
          <ul className="lab-impact-list">
            {impact.lostFindings.map((finding) => (
              <li key={finding.id}>
                <span className={`lab-sev is-${SEVERITY_TONE[finding.severity]}`}>
                  {finding.severity}
                </span>
                <span>{finding.title}</span>
                <code>{finding.ruleId}</code>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ImpactChain impact={impact} />

      {rule && (
        <section className="lab-section">
          <h3 className="lab-section-title">Confirm against a real branch</h3>
          <p className="lab-section-sub">
            {rule.reason} was run against this artifact. A dependency calculation predicts; the
            branch is the measurement. Where they disagree, the branch is right and the prediction is
            the thing that is wrong.
          </p>
          <div className="lab-chain">
            <LabCard
              label="Baseline findings"
              value={artifact.derivations.length}
              note="before the change"
            />
            <LabCard
              label="Branch findings"
              value={rule.artifact.derivations.length}
              note="after the change"
            />
            <LabCard
              label="Difference"
              value={rule.artifact.derivations.length - artifact.derivations.length}
              note="positive means the branch supports more"
            />
          </div>
        </section>
      )}
    </div>
  );
}


export function ImpactChain({ impact }: { impact: ReturnType<typeof impactOf> }) {
  return (
    <section className="lab-section">
      <h3 className="lab-section-title">The chain</h3>
      <p className="lab-section-sub">
        Every edge, in order, with the reason it exists. This is the audit trail: each link can be
        checked against the source rather than taken on trust.
      </p>
      <ul className="lab-edges">
        {impact.edges.map((edge, index) => (
          <li key={`${edge.from}-${edge.to}-${index}`} className="lab-edge">
            <code className="lab-edge-from">{edge.from}</code>
            <span className="lab-edge-rel">{edge.relation}</span>
            <code className="lab-edge-to">{edge.to}</code>
            <p className="lab-edge-why">{edge.detail}</p>
          </li>
        ))}
      </ul>
      {impact.notes.map((note) => (
        <p key={note} className="lab-note">
          {note}
        </p>
      ))}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Stability                                                           */
/* ------------------------------------------------------------------ */

export function StabilityPanel({
  stability,
}: {
  stability: {
    profiles: StabilityProfile[];
    byClass: Record<StabilityClass, number>;
    notes: string[];
  } | null;
}) {
  if (!stability) return null;

  const rank: Record<StabilityClass, number> = {
    unsupported: 0,
    fragile: 1,
    sensitive: 2,
    stable: 3,
  };
  const ordered = [...stability.profiles].sort(
    (a, b) =>
      rank[a.classification] - rank[b.classification] ||
      a.evidenceCount - b.evidenceCount ||
      a.derivationId.localeCompare(b.derivationId),
  );

  return (
    <div className="lab-panel">
      <section className="lab-section">
        <h3 className="lab-section-title">Evidence stability</h3>
        <p className="lab-section-sub">
          A confidence number says what the engine thinks of one proof. These say whether the proof
          would survive a different record, a withheld rule, or an earlier date. They are computed
          from the proof and from branches that were actually run — never from a heuristic score.
        </p>

        <div className="lab-cards">
          {(['unsupported', 'fragile', 'sensitive', 'stable'] as StabilityClass[]).map((kind) => (
            <LabCard
              key={kind}
              label={kind}
              value={stability.byClass[kind]}
              note={
                kind === 'unsupported'
                  ? 'no usable evidence'
                  : kind === 'fragile'
                    ? 'thin or flagged evidence'
                    : kind === 'sensitive'
                      ? 'moves under intervention'
                      : 'holds across branches'
              }
            />
          ))}
        </div>

        {stability.notes.map((note) => (
          <p key={note} className="lab-note">
            {note}
          </p>
        ))}
      </section>

      <section className="lab-section">
        <ul className="lab-profiles">
          {ordered.map((profile) => (
            <li key={profile.derivationId} className="lab-profile">
              <div className="lab-profile-head">
                <span className={`lab-stab is-${STABILITY_TONE[profile.classification]}`}>
                  {profile.classification}
                </span>
                <span className="lab-profile-title">{profile.title}</span>
                <code>{profile.ruleId}</code>
              </div>

              <div className="lab-profile-figures">
                <span>
                  evidence <strong>{profile.evidenceCount}</strong>
                </span>
                <span>
                  documents <strong>{profile.independentDocuments}</strong>
                </span>
                <span>
                  spans <strong>{profile.supportingSpans}</strong>
                </span>
                <span>
                  flagged <strong>{profile.weakSpans}</strong>
                </span>
                <span>
                  depth <strong>{profile.dependencyDepth}</strong>
                </span>
                <span>
                  rules <strong>{profile.rulesInvolved}</strong>
                </span>
                <span>
                  branch sensitivity{' '}
                  <strong>
                    {profile.branchSensitivity === null
                      ? 'not measured'
                      : `${Math.round(profile.branchSensitivity * 100)}%`}
                  </strong>


                </span>
                <span>
                  date sensitivity{' '}
                  <strong>
                    {profile.dateSensitivity === null
                      ? 'not measured'
                      : `${Math.round(profile.dateSensitivity * 100)}%`}
                  </strong>
                </span>
              </div>

              <ul className="lab-profile-why">
                {profile.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Research questions                                                  */
/* ------------------------------------------------------------------ */

export function QuestionsPanel({
  artifact,
  branchRuns,
  other,
}: {
  artifact: BuildArtifact;
  branchRuns: BranchRun[];
  other: LiveBranchView | null;
}) {
  const [findingId, setFindingId] = useState(artifact.derivations[0]?.id ?? '');
  const [docId, setDocId] = useState(artifact.graph.documents[0]?.id ?? '');
  const [date, setDate] = useState(artifact.graph.stats.spanStart);

  const context = useMemo(
    () => ({
      graph: artifact.graph,
      derivations: artifact.derivations,
      identity: artifact.identity,
      branches: branchRuns,
      other: other
        ? {
            identity: other.artifact.identity,
            derivations: other.artifact.derivations,
            label: other.reason,
          }
        : undefined,
    }),
    [artifact, branchRuns, other],
  );

  const answers: ResearchAnswer[] = useMemo(
    () => [
      whyFindingExists(findingId, context),
      evidenceForFinding(findingId, context),
      whatWouldRemoveFinding(findingId, context),
      whatChanged(context),
      dependentsOfDocument(docId, context),
      mostSensitive(context),
      knowableAsOf(date, context),
    ],
    [findingId, docId, date, context],
  );

  return (
    <div className="lab-panel">
      <section className="lab-section">
        <h3 className="lab-section-title">Ask the artifact</h3>
        <p className="lab-section-sub">
          Every answer is assembled from the artifact and its proofs, never generated. Where a
          question needs a branch that has not been run, the answer says so rather than estimating.
        </p>

        <div className="lab-targets">
          <label className="lab-target">
            <span>Finding</span>
            <select value={findingId} onChange={(event) => setFindingId(event.target.value)}>
              {artifact.derivations.map((derivation) => (
                <option key={derivation.id} value={derivation.id}>
                  {derivation.title}
                </option>
              ))}
            </select>
          </label>

          <label className="lab-target">
            <span>Document</span>
            <select value={docId} onChange={(event) => setDocId(event.target.value)}>
              {artifact.graph.documents.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.title}
                </option>
              ))}
            </select>
          </label>

          <label className="lab-target">
            <span>Date</span>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
        </div>
      </section>

      <ul className="lab-answers">
        {answers.map((answer) => (
          <li key={answer.id} className="lab-answer">
            <div className="lab-answer-head">
              <span className="lab-answer-tag">ENGINE-DERIVED</span>
              <strong>{answer.question}</strong>
              {answer.requiresBranch && (
                <span className="lab-answer-needs">needs a branch to answer fully</span>
              )}
            </div>

            <p className="lab-answer-text">{answer.answer}</p>

            {answer.citations.length > 0 && (
              <div className="lab-answer-cites">
                <span className="lab-answer-cites-label">Rests on</span>
                <ul>
                  {answer.citations.map((citation, index) => (
                    <li key={`${citation.kind}-${citation.id}-${index}`}>
                      <span className={`lab-cite is-${citation.kind}`}>{citation.kind}</span>
                      <span>{citation.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="lab-answer-limits">
              <span className="lab-answer-limits-label">What this does not say</span>
              <ul>
                {answer.limitations.map((limitation) => (
                  <li key={limitation}>{limitation}</li>
                ))}
              </ul>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}


/* ------------------------------------------------------------------ */
/* Lineage                                                             */
/*                                                                    */
/* The graph is read back from stored parent pointers. There is no      */
/* separate lineage structure that could fall out of step with the      */
/* artifacts it describes.                                              */
/* ------------------------------------------------------------------ */

export function LineagePanel({
  lineage,
  runs,
  focusId,
  onOpen,
}: {
  lineage: LineageGraph | null;
  runs: StoredRun[];
  focusId: string;
  onOpen: (run: StoredRun) => void;
}) {
  if (!lineage || lineage.nodes.length === 0) {
    return (
      <div className="lab-panel">
        <p className="lab-tree-empty">
          No stored artifacts yet, so there is no lineage to draw. The graph is derived from the
          parent recorded on each run rather than maintained separately.
        </p>
      </div>
    );
  }

  const maxDepth = Math.max(...lineage.nodes.map((node) => node.depth));
  const ordered = lineage.nodes
    .slice()
    .sort((a, b) => a.depth - b.depth || a.createdAt.localeCompare(b.createdAt));

  return (
    <div className="lab-panel">
      <section className="lab-section">
        <h3 className="lab-section-title">Lineage</h3>
        <p className="lab-section-sub">
          {lineage.nodes.length} artifact{lineage.nodes.length === 1 ? '' : 's'} across {maxDepth + 1}{' '}
          generation{maxDepth === 0 ? '' : 's'}, read back from the parent recorded on each run.
        </p>

        <ul className="lab-lineage">
          {ordered.map((node) => {
            const run = runs.find((entry) => entry.artifactId === node.artifactId);
            return (
              <li
                key={node.artifactId}
                className={`lab-lineage-node${node.artifactId === focusId ? ' is-focus' : ''}`}
                style={{ marginLeft: `${node.depth * 22}px` }}
              >
                <span className={`lab-lineage-op is-${node.operation}`}>
                  {OPERATION_LABEL[node.operation]}
                </span>
                <code title={node.artifactId}>{node.displayId}</code>
                <span className="lab-lineage-meta">
                  engine {node.engineVersion} \u00b7 {node.findings} findings \u00b7{' '}
                  {node.createdAt.slice(0, 10)}
                </span>
                {node.parentId && (
                  <span className="lab-lineage-parent">
                    <Icon.Branch size={11} />
                    <code title={node.parentId}>{shortAddress(node.parentId)}</code>
                  </span>
                )}
                {node.reason && <span className="lab-lineage-reason">{node.reason}</span>}
                {node.children.length > 0 && (
                  <span className="lab-lineage-children">
                    {node.children.length} branch{node.children.length === 1 ? '' : 'es'}
                  </span>
                )}
                {run && (
                  <button
                    type="button"
                    className="lab-btn is-quiet is-tiny"
                    onClick={() => onOpen(run)}
                  >
                    <Icon.Play size={11} />
                    Open
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="lab-section">
        <h3 className="lab-section-title">Result state</h3>
        <p className="lab-section-sub">
          Each node is re-derived from its own stored corpus when opened, and compared against the
          identity it was saved with. A node whose result no longer reproduces is reported rather
          than hidden.
        </p>
        <ul className="lab-lineage-states">
          {ordered.map((node) => {
            const run = runs.find((entry) => entry.artifactId === node.artifactId);
            const clean = run?.verification.clean ?? false;
            return (
              <li key={node.artifactId}>
                <code>{node.displayId}</code>
                <span className={`lab-flag is-${clean ? 'ok' : 'warn'}`}>
                  {clean ? `provenance clean \u00b7 ${run?.verification.score}/100` : 'not verified'}
                </span>
                <span className="lab-lineage-meta">
                  rules <code title={node.rulesetVersion}>{node.rulesetVersion.slice(0, 10)}</code>
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
