/* ------------------------------------------------------------------ */
/* The engine's own version history                                    */
/*                                                                    */
/* `ENGINE_VERSION` used to be a magic string. It is now the head of a  */
/* declared, dated history, so a version number is a documented fact    */
/* rather than a constant someone remembers to bump.                    */
/*                                                                    */
/* Two things follow. An artifact can say not just which engine made it */
/* but what that engine was. And a comparison between two artifacts can */
/* explain a difference in results as a change in the engine, which is  */
/* the difference between "the numbers moved" and "rule X was added".   */
/*                                                                    */
/* A release is `breaking` when a result produced by the previous        */
/* version cannot be compared with one from this version — because a    */
/* rule was removed, or the meaning of an existing one changed. Those    */
/* are reported as requiring migration rather than silently diffed.      */
/* ------------------------------------------------------------------ */

export interface EngineRelease {
  version: string;
  /** ISO date. */
  released: string;
  summary: string;
  /** Rules that did not exist before this version. */
  rulesAdded: string[];
  /** Rules that existed and no longer do. */
  rulesRemoved: string[];
  /** Behavioural changes that are not a new rule. */
  changes: string[];
  /** True when results either side of this version are not comparable. */
  breaking: boolean;
}

export const ENGINE_RELEASES: EngineRelease[] = [
  {
    version: '1.0.0',
    released: '2026-09-18',
    summary:
      'The provenance-first record: ingestion with character spans, the Temporal Health Graph, the Time Machine and the contradiction engine.',
    rulesAdded: [],
    rulesRemoved: [],
    changes: [
      'Facts carry the document id and the character span they were read from.',
      'Contradictions are detected between documents and never resolved to a winner.',
    ],
    breaking: false,
  },
  {
    version: '2.0.0',
    released: '2026-09-30',
    summary:
      'The derivation layer. Findings became proof objects rather than prose, and every rule was required to state what it refuses to conclude.',
    rulesAdded: [
      'temporal.list_contradicts_course',
      'temporal.allergy_prescription_overlap',
      'safety.duplicate_therapy',
      'safety.contraindicated_pair',
      'gap.monitoring_absent',
      'gap.unresolved_discontinuation',
      'gap.immunization_due',
      'gap.documentation_silence',
      'trend.threshold_crossed',
      'trend.rapid_change',
      'quality.implausible_value',
      'quality.unit_mismatch',
      'quality.same_day_conflict',
      'quality.demographic_mismatch',
    ],
    rulesRemoved: [],
    changes: [
      'Interval reasoning: medication courses and condition spans reconstructed with the Allen algebra.',
      'Trajectory fitting excludes values restated inside later narrative notes.',
      'Confidence propagates from premises; it is never asserted.',
      'The platform layer: FHIR export, de-identification, quality scoring, cohort analysis, audit.',
    ],
    breaking: true,
  },
  {
    version: '2.1.0',
    released: '2026-10-02',
    summary:
      'Disagreement is now detected once. Rules consume the conflict layer instead of re-scanning the graph, so the two cannot disagree about whether a disagreement exists.',
    rulesAdded: [],
    rulesRemoved: [],
    changes: [
      'Raw conflicts moved onto the rule context beside courses and spans.',
      'quality.same_day_conflict and quality.demographic_mismatch consume the shared detector rather than duplicating it.',
      'Conflict detection is filtered to the evaluation date, so the Time Machine cannot surface a disagreement before both documents exist.',
      'An absence finding now cites the scope it searched, because a finding that cites nothing cannot be checked.',
    ],
    breaking: false,
  },
  {
    version: '2.2.0',
    released: '2026-10-02',
    summary:
      'Every result is named. The provenance invariant is checked at runtime, and a build can be reproduced and compared rather than merely trusted.',
    rulesAdded: [],
    rulesRemoved: [],
    changes: [
      'verify.ts re-reads every fact from its own span and validates every proof DAG on demand.',
      'identity.ts names a result by its corpus and its output, alongside the engine and rule set that produced it.',
      'A build can be reproduced from its own inputs, and the comparison names every finding that moved.',
    ],
    breaking: false,
  },
  {
    version: '2.3.0',
    released: '2026-10-15',
    summary:
      'Medication reconciliation and measurement integrity: cross-record dose discrepancies with stated uncertainty, direction-flag mismatches, and stricter provenance on numeric spans.',
    rulesAdded: ['quality.cross_record_dose_discrepancy', 'quality.value_flag_mismatch'],
    rulesRemoved: [],
    changes: [
      'Cross-record dose discrepancies require explicit uncertainty in the source record.',
      'Same-day dose conflicts ignore discontinued strengths.',
      'Data-quality warnings (implausible values, flag mismatches) are separated from cross-document contradictions in the Debugger.',
      'Measurement quotes encompass the numeric value span, not only the concept label.',
    ],
    breaking: false,
  },
];

/** The version this build runs. The head of the history, not a constant to remember. */
export const ENGINE_VERSION = ENGINE_RELEASES[ENGINE_RELEASES.length - 1].version;

/** The full release record for a version, or null if this build has never heard of it. */
export function releaseFor(version: string): EngineRelease | null {
  return ENGINE_RELEASES.find((release) => release.version === version) ?? null;
}

/** True when this build has a record of the version. */
export function isKnownVersion(version: string): boolean {
  return releaseFor(version) !== null;
}

export interface EngineDelta {
  from: string;
  to: string;
  /** Releases strictly after `from` and up to and including `to`. */
  releases: EngineRelease[];
  rulesAdded: string[];
  rulesRemoved: string[];
  breaking: boolean;
  /** A sentence a reader can act on. */
  explanation: string;
}

/**
 * What changed between two engine versions.
 *
 * Returns null when either version is unknown to this build, because guessing at
 * the difference between two things it cannot describe would be worse than
 * saying it does not know.
 */
export function engineDelta(from: string, to: string): EngineDelta | null {
  if (from === to) return null;

  const fromRelease = releaseFor(from);
  const toRelease = releaseFor(to);
  if (!fromRelease || !toRelease) return null;

  const fromIndex = ENGINE_RELEASES.indexOf(fromRelease);
  const toIndex = ENGINE_RELEASES.indexOf(toRelease);
  const low = Math.min(fromIndex, toIndex);
  const high = Math.max(fromIndex, toIndex);
  const releases = ENGINE_RELEASES.slice(low + 1, high + 1);

  const rulesAdded = Array.from(new Set(releases.flatMap((release) => release.rulesAdded)));
  const rulesRemoved = Array.from(new Set(releases.flatMap((release) => release.rulesRemoved)));
  const breaking = releases.some((release) => release.breaking);

  const parts: string[] = [];
  if (rulesAdded.length > 0) {
    parts.push(`${rulesAdded.length} rule${rulesAdded.length === 1 ? '' : 's'} added`);
  }
  if (rulesRemoved.length > 0) {
    parts.push(`${rulesRemoved.length} rule${rulesRemoved.length === 1 ? '' : 's'} removed`);
  }

  const explanation =
    parts.length > 0
      ? `${from} → ${to}: ${parts.join(', ')}. A difference in findings is expected rather than a fault.`
      : `${from} → ${to}: the rule set is unchanged. Any difference in findings comes from the record rather than the engine.`;

  return { from, to, releases, rulesAdded, rulesRemoved, breaking, explanation };
}
