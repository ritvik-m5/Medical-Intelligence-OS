import type { Derivation } from '../derive/types';
import type { HealthGraph } from '../types';
import type { ArtifactIdentity } from '../identity';
import { impactOf, ruleLabel, type ImpactReport } from './impact';
import { proofDiff, type ProofDiff } from './proofDiff';
import { stabilityOf, type BranchRun, type StabilityProfile } from './stability';

/* ------------------------------------------------------------------ */
/* Research questions                                                  */
/*                                                                    */
/* A question is answered from the artifact and the proofs, never from  */
/* a model's impression of them. Each answer carries the citations it   */
/* rests on and the limits it operates under, because an answer without */
/* those is an assertion rather than a research result.                 */
/*                                                                    */
/* Every question here resolves through a real computation. Where a     */
/* question needs a branch that has not been run, the answer says so    */
/* rather than answering from the baseline and hoping.                  */
/* ------------------------------------------------------------------ */

export type QuestionId =
  | 'why-exists'
  | 'what-evidence'
  | 'what-would-remove'
  | 'what-changed'
  | 'which-depend-on-document'
  | 'most-sensitive'
  | 'knowable-as-of';

export interface Citation {
  kind: 'fact' | 'document' | 'derivation' | 'rule';
  id: string;
  label: string;
}

export interface ResearchAnswer {
  id: QuestionId;
  question: string;
  /** The engine's own answer. Assembled, never generated. */
  answer: string;
  citations: Citation[];
  /** A proof-level diff, when the answer is about what moved. */
  proof?: ProofDiff;
  /** An impact chain, when the answer is about dependency. */
  impact?: ImpactReport;
  /** Profiles, when the answer is about sensitivity. */
  profiles?: StabilityProfile[];
  /** What the engine declines to conclude. Always populated. */
  limitations: string[];
  /** True when a branch would be needed to answer fully. */
  requiresBranch: boolean;
}

export interface QuestionContext {
  graph: HealthGraph;
  derivations: Derivation[];
  identity: ArtifactIdentity;
  /** Branches that have actually been run against this artifact. */
  branches?: BranchRun[];
  /** A second artifact, for "what changed between these two runs". */
  other?: { identity: ArtifactIdentity; derivations: Derivation[]; label: string };
}

export const QUESTIONS: Array<{ id: QuestionId; label: string; needs?: string }> = [
  { id: 'why-exists', label: 'Why does this finding exist?', needs: 'a finding' },
  { id: 'what-evidence', label: 'What evidence is responsible?', needs: 'a finding' },
  { id: 'what-would-remove', label: 'What would make this finding disappear?', needs: 'a finding' },
  { id: 'what-changed', label: 'What changed between these two runs?', needs: 'a second run' },
  {
    id: 'which-depend-on-document',
    label: 'Which conclusions depend on this document?',
    needs: 'a document',
  },
  { id: 'most-sensitive', label: 'Which findings are most sensitive to missing evidence?' },
  { id: 'knowable-as-of', label: 'What was knowable as of a date?', needs: 'a branch' },
];

/** The findings that depend on a document, with the chain that connects them. */
export function dependentsOfDocument(docId: string, context: QuestionContext): ResearchAnswer {
  const document = context.graph.documents.find((doc) => doc.id === docId);
  const impact = impactOf({ kind: 'document', id: docId }, context.graph, context.derivations);

  const citations: Citation[] = [
    { kind: 'document', id: docId, label: document?.title ?? docId },
    ...impact.removedFacts.slice(0, 12).map((factId) => {
      const fact = context.graph.facts.find((entry) => entry.id === factId);
      return { kind: 'fact' as const, id: factId, label: fact?.quote ?? factId };
    }),
    ...impact.lostFindings.map((finding) => ({
      kind: 'derivation' as const,
      id: finding.id,
      label: finding.title,
    })),
  ];

  const answer =
    impact.lostFindings.length === 0
      ? `No finding in this artifact rests on ${document?.title ?? docId}. Removing it would take ${impact.removedFacts.length} fact${impact.removedFacts.length === 1 ? '' : 's'} out of the record and change nothing the engine concluded.`
      : `${impact.lostFindings.length} finding${impact.lostFindings.length === 1 ? '' : 's'} rest on ${document?.title ?? docId}, through ${impact.removedFacts.length} fact${impact.removedFacts.length === 1 ? '' : 's'}: ${impact.lostFindings
          .map((finding) => `“${finding.title}” (${ruleLabel(finding.ruleId)})`)
          .join('; ')}.`;

  return {
    id: 'which-depend-on-document',
    question: `Which conclusions depend on ${document?.title ?? docId}?`,
    answer,
    citations,
    impact,
    limitations: [
      'This is a dependency calculation over the recorded proofs, not a re-derivation. Run the branch to confirm the findings actually disappear.',
      ...(impact.thinnedFindings.length > 0
        ? [
            `${impact.thinnedFindings.length} further finding${impact.thinnedFindings.length === 1 ? '' : 's'} would still hold but would rest on thinner evidence.`,
          ]
        : []),
    ],
    requiresBranch: false,
  };
}

/** Why a finding exists, read off its own proof. */
export function whyFindingExists(derivationId: string, context: QuestionContext): ResearchAnswer {
  const derivation = context.derivations.find((entry) => entry.id === derivationId);
  if (!derivation) {
    return {
      id: 'why-exists',
      question: 'Why does this finding exist?',
      answer: `No finding with id ${derivationId} is present in this artifact.`,
      citations: [],
      limitations: ['The id named is not in this artifact, so there is nothing to explain.'],
      requiresBranch: false,
    };
  }

  const premises = derivation.steps.filter((step) => step.kind === 'premise');
  const rules = derivation.steps.filter((step) => step.kind === 'rule');

  const citations: Citation[] = [
    { kind: 'derivation', id: derivation.id, label: derivation.title },
    { kind: 'rule', id: derivation.ruleId, label: ruleLabel(derivation.ruleId) },
    ...derivation.factIds.slice(0, 12).map((factId) => {
      const fact = context.graph.facts.find((entry) => entry.id === factId);
      const document = context.graph.documents.find((doc) => doc.id === fact?.docId);
      return {
        kind: 'fact' as const,
        id: factId,
        label: fact ? `“${fact.quote}” — ${document?.title ?? fact.docId}` : factId,
      };
    }),
  ];

  const answer = `${ruleLabel(derivation.ruleId)} fired over ${premises.length} premise${premises.length === 1 ? '' : 's'} and ${rules.length} rule step${rules.length === 1 ? '' : 's'}, reaching “${derivation.statement}” at confidence ${derivation.confidence.toFixed(2)} on evidence grade ${derivation.grade}.`;

  return {
    id: 'why-exists',
    question: `Why does “${derivation.title}” exist?`,
    answer,
    citations,
    limitations: [
      derivation.notConcluded,
      ...(derivation.satisfiableBy ? [`Would be cleared by: ${derivation.satisfiableBy}`] : []),
    ],
    requiresBranch: false,
  };
}

/** What evidence carries a finding, and how stable it is. */
export function evidenceForFinding(derivationId: string, context: QuestionContext): ResearchAnswer {
  const derivation = context.derivations.find((entry) => entry.id === derivationId);
  if (!derivation) {
    return {
      id: 'what-evidence',
      question: 'What evidence is responsible?',
      answer: `No finding with id ${derivationId} is present in this artifact.`,
      citations: [],
      limitations: ['The id named is not in this artifact.'],
      requiresBranch: false,
    };
  }

  const profile = stabilityOf(derivation, context.graph, context.branches ?? []);
  const facts = derivation.factIds
    .map((id) => context.graph.facts.find((fact) => fact.id === id))
    .filter((fact): fact is NonNullable<typeof fact> => Boolean(fact));

  const citations: Citation[] = facts.slice(0, 16).map((fact) => ({
    kind: 'fact',
    id: fact.id,
    label: `“${fact.quote}”`,
  }));

  const answer = `${derivation.factIds.length} fact${derivation.factIds.length === 1 ? '' : 's'} from ${profile.independentDocuments} document${profile.independentDocuments === 1 ? '' : 's'} support this finding. Its proof runs ${profile.dependencyDepth} step${profile.dependencyDepth === 1 ? '' : 's'} deep and involves ${profile.rulesInvolved} rule${profile.rulesInvolved === 1 ? '' : 's'}. Stability: ${profile.classification}.`;

  return {
    id: 'what-evidence',
    question: `What evidence is responsible for “${derivation.title}”?`,
    answer,
    citations,
    profiles: [profile],
    limitations: profile.reasons,
    requiresBranch: profile.branchSensitivity === null,
  };
}

/** What would remove a finding: each premise, and what withholding it costs. */
export function whatWouldRemoveFinding(
  derivationId: string,
  context: QuestionContext,
): ResearchAnswer {
  const derivation = context.derivations.find((entry) => entry.id === derivationId);
  if (!derivation) {
    return {
      id: 'what-would-remove',
      question: 'What would make this finding disappear?',
      answer: `No finding with id ${derivationId} is present in this artifact.`,
      citations: [],
      limitations: ['The id named is not in this artifact.'],
      requiresBranch: false,
    };
  }

  /* Every premise, and how many findings depend on it. */
  const perFact = derivation.factIds.map((factId) => {
    const impact = impactOf({ kind: 'fact', id: factId }, context.graph, context.derivations);
    const fact = context.graph.facts.find((entry) => entry.id === factId);
    const document = context.graph.documents.find((doc) => doc.id === fact?.docId);
    return { factId, fact, document, impact };
  });

  const citations: Citation[] = perFact.slice(0, 16).map((entry) => ({
    kind: 'fact',
    id: entry.factId,
    label: entry.fact ? `“${entry.fact.quote}”` : entry.factId,
  }));

  const onlyThis = perFact.filter((entry) => entry.impact.lostFindings.length === 1);
  const shared = perFact.filter((entry) => entry.impact.lostFindings.length > 1);

  const answer =
    `Withholding ${ruleLabel(derivation.ruleId)} would remove it. Removing evidence instead: ` +
    (onlyThis.length > 0
      ? `${onlyThis.length} of its ${derivation.factIds.length} premises would remove this finding and nothing else. `
      : '') +
    (shared.length > 0
      ? `${shared.length} premise${shared.length === 1 ? '' : 's'} would also remove other findings — ${shared
          .slice(0, 3)
          .map(
            (entry) =>
              `${entry.document?.title ?? entry.fact?.docId ?? entry.factId} (${entry.impact.lostFindings.length} findings)`,
          )
          .join(', ')}.`
      : '');

  return {
    id: 'what-would-remove',
    question: `What would make “${derivation.title}” disappear?`,
    answer,
    citations,
    limitations: [
      'This names what each premise contributes. It does not say the premise is wrong, and it does not say the finding is wrong — only what the record would no longer support.',
      'A premise that removes several findings is load-bearing for more than one conclusion. That is a fact about the record, not a judgement about it.',
    ],
    requiresBranch: false,
  };
}

/** What changed between two runs, finding by finding. */
export function whatChanged(context: QuestionContext): ResearchAnswer {
  if (!context.other) {
    return {
      id: 'what-changed',
      question: 'What changed between these two runs?',
      answer:
        'Two runs are needed to answer this. Select a second artifact and the comparison will be computed from both.',
      citations: [],
      limitations: ['Nothing has been compared, so nothing is claimed.'],
      requiresBranch: false,
    };
  }

  const before = new Map(context.derivations.map((entry) => [entry.id, entry]));
  const after = new Map(context.other.derivations.map((entry) => [entry.id, entry]));

  const lost = [...before.keys()].filter((id) => !after.has(id));
  const gained = [...after.keys()].filter((id) => !before.has(id));
  const moved = [...before.keys()].filter((id) => {
    const other = after.get(id);
    if (!other) return false;
    const diff = proofDiff(before.get(id)!, other);
    return diff.counts.unchanged < diff.lines.length || diff.premises.removed.length > 0;
  });

  const citations: Citation[] = [...lost, ...gained, ...moved].slice(0, 20).map((id) => {
    const derivation = before.get(id) ?? after.get(id)!;
    return { kind: 'derivation', id, label: derivation.title };
  });

  const answer = `${context.identity.id} → ${context.other.identity.id}: ${lost.length} finding${lost.length === 1 ? '' : 's'} lost, ${gained.length} gained, ${moved.length} whose proof moved.`;

  return {
    id: 'what-changed',
    question: `What changed between ${context.identity.id} and ${context.other.identity.id}?`,
    answer,
    citations,
    limitations: [
      context.identity.corpusHash === context.other.identity.corpusHash
        ? 'Both runs read the same corpus, so any difference here comes from the rules or the engine rather than from the record.'
        : 'The two runs read different corpora, so a difference here is a difference between records rather than a change in the engine.',
      context.identity.engineVersion === context.other.identity.engineVersion
        ? 'Both runs used the same engine version.'
        : `Different engine versions (${context.identity.engineVersion} and ${context.other.identity.engineVersion}), so a difference may be a change in behaviour rather than in the evidence.`,
    ],
    requiresBranch: false,
  };
}

/** The findings whose evidence base is thinnest. */
export function mostSensitive(context: QuestionContext): ResearchAnswer {
  const rank = { unsupported: 0, fragile: 1, sensitive: 2, stable: 3 };
  const profiles = context.derivations
    .map((derivation) => stabilityOf(derivation, context.graph, context.branches ?? []))
    .filter((profile) => profile.classification !== 'stable')
    .sort(
      (a, b) =>
        rank[a.classification] - rank[b.classification] ||
        a.evidenceCount - b.evidenceCount ||
        a.independentDocuments - b.independentDocuments ||
        a.derivationId.localeCompare(b.derivationId),
    );

  const citations: Citation[] = profiles.slice(0, 16).map((profile) => ({
    kind: 'derivation',
    id: profile.derivationId,
    label: profile.title,
  }));

  const answer =
    profiles.length === 0
      ? 'Every finding in this artifact is classified stable. None rests on a single document, a single fact, or a flagged premise.'
      : `${profiles.length} of ${context.derivations.length} findings are not stable: ${profiles
          .slice(0, 3)
          .map((profile) => `“${profile.title}” (${profile.classification})`)
          .join(', ')}${profiles.length > 3 ? ', and others' : ''}.`;

  return {
    id: 'most-sensitive',
    question: 'Which findings are most sensitive to missing evidence?',
    answer,
    citations,
    profiles,
    limitations: [
      'Sensitivity is computed from the proof and from branches actually run. It is not a probability, and it does not say whether a finding is clinically important.',
      ...(context.branches && context.branches.length > 0
        ? []
        : [
            'Branch sensitivity is unmeasured: no branch has been run, so only structural fragility is reflected here.',
          ]),
    ],
    requiresBranch: !context.branches || context.branches.length === 0,
  };
}

/** What the record supported at an earlier date. Answered only from a real branch. */
export function knowableAsOf(date: string, context: QuestionContext): ResearchAnswer {
  const branch = (context.branches ?? []).find((run) => run.operation === 'as-of');
  if (!branch) {
    return {
      id: 'knowable-as-of',
      question: `What was knowable as of ${date}?`,
      answer:
        'This needs a branch evaluated at that date. Run one and the answer will be computed from the re-derivation rather than estimated from the baseline.',
      citations: [],
      limitations: [
        'Nothing is claimed. Answering from the baseline would present later evidence as if it had existed earlier, which is the exact error this question exists to expose.',
      ],
      requiresBranch: true,
    };
  }

  const later = context.derivations.filter(
    (derivation) => !branch.derivations.some((entry) => entry.id === derivation.id),
  );

  const citations: Citation[] = later.slice(0, 20).map((derivation) => ({
    kind: 'derivation',
    id: derivation.id,
    label: derivation.title,
  }));

  const answer = `As of ${date}, ${branch.derivations.length} of the current ${context.derivations.length} findings were derivable. ${later.length} were not yet supported by the record: ${later
    .slice(0, 3)
    .map((derivation) => `“${derivation.title}”`)
    .join(', ')}${later.length > 3 ? ', and others' : ''}.`;

  return {
    id: 'knowable-as-of',
    question: `What was knowable as of ${date}?`,
    answer,
    citations,
    limitations: [
      'A finding absent at an earlier date means the record did not yet support it. It does not mean it was wrong, and it does not mean nothing was happening.',
      'Findings present earlier and absent now are not shown here: this answers what was knowable then, not what has since been withdrawn.',
    ],
    requiresBranch: false,
  };
}
