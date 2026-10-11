import { useState } from 'react';
import { branchOptions, firedRules, type BranchKind } from '../../builder/runs';
import type { BuildArtifact, BuildRequest } from '../../builder/types';
import { Icon } from '../Icon';

/* ------------------------------------------------------------------ */
/* Research branches                                                   */
/*                                                                    */
/* A branch is the parent's corpus with exactly one thing changed, and  */
/* every branch offered here is one this build can actually run:        */
/* withhold a rule, evaluate at an earlier date, or add a document.     */
/*                                                                    */
/* "Run this under a different engine" is deliberately absent. There is */
/* one engine in the binary. The version manifest records which engine  */
/* produced a run; it does not pretend to run another one.              */
/* ------------------------------------------------------------------ */

interface BranchPanelProps {
  artifact: BuildArtifact | null;
  /** Run a build for a branch of the current artifact. */
  onBranch: (request: BuildRequest, description: string) => void;
}

export function BranchPanel({ artifact, onBranch }: BranchPanelProps) {
  const [kind, setKind] = useState<BranchKind | null>(null);
  const [rule, setRule] = useState<string | null>(null);

  if (!artifact) {
    return (
      <div className="branch">
        <h3 className="branch-title">Research branches</h3>
        <p className="branch-empty">
          Build a record first. A branch is a copy of a run with one thing changed, so there has to
          be a run to copy.
        </p>
      </div>
    );
  }

  const options = branchOptions(artifact);
  const rules = firedRules(artifact);
  const earliest = artifact.graph.stats.spanStart;

  return (
    <div className="branch">
      <div className="branch-head">
        <h3 className="branch-title">Research branches</h3>
        <p className="branch-sub">
          Duplicate this run with one thing changed, and see which proof moved. The original is never
          touched.
        </p>
      </div>

      <div className="branch-parent">
        <Icon.Branch size={13} />
        <span>
          branching <code>{artifact.identity.id}</code> · {artifact.derivations.length} findings ·{' '}
          {artifact.identity.ruleCount} rules · as of {artifact.asOf}
        </span>
      </div>

      <ul className="branch-options">
        {options.map((option) => {
          const active = kind === option.kind;
          return (
            <li key={option.kind} className={`branch-option${active ? ' is-active' : ''}`}>
              <button
                className="branch-option-btn"
                type="button"
                disabled={!option.available}
                onClick={() => {
                  setKind(active ? null : option.kind);
                  setRule(null);
                }}
              >
                <span className="branch-option-label">{option.label}</span>
                <span className="branch-option-detail">{option.detail}</span>
                {!option.available && option.reason && (
                  <span className="branch-option-why">{option.reason}</span>
                )}
              </button>

              {active && option.kind === 'withhold-rule' && (
                <div className="branch-config">
                  <div className="branch-rules">
                    {rules.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        className={`branch-rule${rule === entry.id ? ' is-picked' : ''}`}
                        onClick={() => setRule(entry.id)}
                      >
                        <code>{entry.id}</code>
                        <span className="branch-rule-count">{entry.count}</span>
                      </button>
                    ))}
                  </div>
                  <button
                    className="branch-run"
                    type="button"
                    disabled={!rule}
                    onClick={() => {
                      if (!rule) return;
                      onBranch(
                        {
                          prompt: artifact.scenarioLabel,
                          attachments: artifact.inputs,
                          suppressRules: [rule],
                          asOf: artifact.asOf,
                          branch: {
                            parentId: artifact.identity.artifactId,
                            operation: 'withhold-rule',
                            reason: `withheld ${rule}`,
                          },
                        },
                        `Branch: ${rule} withheld`,
                      );
                      setKind(null);
                      setRule(null);
                    }}
                  >
                    <Icon.Play size={12} />
                    Run the branch
                  </button>
                </div>
              )}
              {active && option.kind === 'evaluate-earlier' && (
                <div className="branch-config">
                  <p className="branch-config-note">
                    The record begins {earliest}. Anything not yet supported at that date will be
                    absent from the branch — which is the point of asking.
                  </p>
                  <button
                    className="branch-run"
                    type="button"
                    onClick={() => {
                      onBranch(
                        {
                          prompt: artifact.scenarioLabel,
                          attachments: artifact.inputs,
                          suppressRules: artifact.suppressedRules,
                          asOf: earliest,
                          branch: {
                            parentId: artifact.identity.artifactId,
                            operation: 'as-of',
                            reason: `evaluated as of ${earliest}`,
                          },
                        },
                        `Branch: evaluated as of ${earliest}`,
                      );
                      setKind(null);
                    }}
                  >
                    <Icon.Play size={12} />
                    Run the branch
                  </button>
                </div>
              )}

              {active && option.kind === 'add-document' && (
                <div className="branch-config">
                  <p className="branch-config-note">
                    Attach a document in the composer above, then build. The build keeps this run's
                    documents and adds yours, so the branch differs by exactly one document — and it
                    will be recorded as a branch of <code>{artifact.identity.id}</code>.
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
