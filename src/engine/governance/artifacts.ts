import type { Derivation } from '../derive/types';
import type { ArtifactIdentity } from '../identity';
import { compareIdentities, contentAddress } from '../identity';
import type { StoredRun } from '../platform/registry';
import { REGISTRY_SCHEMA } from '../platform/registry';
import { makeReport, errorFinding, type GovernanceFinding, type GovernanceReport } from './checks';

/* ------------------------------------------------------------------ */
/* Artifact and reproducibility governance                             */
/*                                                                    */
/* The checks that need a real build take the rebuild as an argument    */
/* rather than importing the builder. The engine layer stays free of    */
/* the layer above it, and the same checks can be pointed at a          */
/* deliberately broken artifact in a test.                              */
/* ------------------------------------------------------------------ */

export interface Rebuilt {
  identity: ArtifactIdentity;
  derivations: Derivation[];
}

export interface ArtifactCheckInput {
  runs: StoredRun[];
  /** Re-derive a stored run from its own corpus. */
  rebuild: (run: StoredRun) => Promise<Rebuilt>;
}

/**
 * Every stored artifact must still describe itself correctly.
 *
 * Each check has a specific failure it prevents:
 *
 *   the content address recomputes        the name is not the claim
 *   the cached findings match a rebuild    the listing has gone stale
 *   lineage resolves within the store      a branch points at nothing
 *   the schema is the one we write         a record from another version
 */
export async function checkArtifacts(input: ArtifactCheckInput): Promise<GovernanceReport> {
  const findings: GovernanceFinding[] = [];
  const ids = new Set(input.runs.map((run) => run.artifactId));

  for (const run of input.runs) {
    const label = run.identity.id;

    if (run.schema !== REGISTRY_SCHEMA) {
      findings.push(
        errorFinding(
          'artifacts',
          label,
          `Stored under schema ${run.schema}; this build writes ${REGISTRY_SCHEMA}.`,
        ),
      );
    }

    // The address must be what its own four determinants produce.
    const recomputed = contentAddress({
      corpusHash: run.identity.corpusHash,
      rulesetVersion: run.identity.rulesetVersion,
      engineVersion: run.identity.engineVersion,
      resultHash: run.identity.resultHash,
    });
    if (recomputed !== run.artifactId) {
      findings.push(
        errorFinding(
          'artifacts',
          label,
          'The content address does not match the identity it was stored with, so the name is not the claim.',
        ),
      );
    }

    if (run.branch.parentId && !ids.has(run.branch.parentId)) {
      findings.push(
        errorFinding(
          'artifacts',
          label,
          'This run records a parent that is not in the store, so its lineage cannot be resolved.',
        ),
      );
    }
    if (run.branch.operation !== 'baseline' && !run.branch.parentId) {
      findings.push(
        errorFinding(
          'artifacts',
          label,
          `This run claims to be a ${run.branch.operation} branch but records no parent.`,
        ),
      );
    }
    if (run.branch.operation === 'baseline' && run.branch.parentId) {
      findings.push(
        errorFinding(
          'artifacts',
          label,
          'This run is recorded as a baseline but names a parent, so the lineage contradicts itself.',
        ),
      );
    }

    // Re-derive and compare. This is the expensive check, and the one that
    // catches a cache that has drifted from the corpus it describes.
    const rebuilt = await input.rebuild(run);
    if (rebuilt.identity.corpusHash !== run.identity.corpusHash) {
      findings.push(
        errorFinding(
          'artifacts',
          label,
          'Re-deriving from the stored corpus produced a different corpus hash, so the stored documents are not the ones that were built.',
        ),
      );
    }
    if (rebuilt.derivations.length !== run.findings.length) {
      findings.push(
        errorFinding(
          'artifacts',
          label,
          `The cached listing records ${run.findings.length} findings; re-deriving gives ${rebuilt.derivations.length}. The cache has drifted.`,
        ),
      );
    }

    const cachedIds = run.findings.map((finding) => finding.id).sort();
    const freshIds = rebuilt.derivations.map((derivation) => derivation.id).sort();
    if (cachedIds.join('|') !== freshIds.join('|')) {
      findings.push(
        errorFinding(
          'artifacts',
          label,
          'The cached finding ids are not the ones a re-derivation produces, even though the counts agree.',
        ),
      );
    }
  }

  return makeReport('artifacts', input.runs.length, findings);
}

export interface ReproductionPair {
  label: string;
  expected: Rebuilt;
  actual: Rebuilt;
}

/**
 * Two builds of the same thing must be the same thing.
 *
 * This is the property the whole platform rests on: an artifact is quotable a
 * year later only if rebuilding it gives the same answer. Each pair is a real
 * build and a real re-build, compared with the same machinery a user would see.
 */
export function checkReproducibility(pairs: ReproductionPair[]): GovernanceReport {
  const findings: GovernanceFinding[] = [];

  for (const pair of pairs) {
    const report = compareIdentities(
      pair.expected.identity,
      pair.actual.identity,
      pair.expected.derivations,
      pair.actual.derivations,
    );

    if (report.status !== 'identical') {
      findings.push(
        errorFinding(
          'reproducibility',
          pair.label,
          `Expected the build to reproduce exactly, got "${report.status}". ${report.notes.join(' ')}`,
        ),
      );
    }

    if (report.added.length > 0 || report.removed.length > 0 || report.altered.length > 0) {
      findings.push(
        errorFinding(
          'reproducibility',
          pair.label,
          `Reproduction is not exact: ${report.added.length} added, ${report.removed.length} removed, ${report.altered.length} altered.`,
        ),
      );
    }
  }

  return makeReport('reproducibility', pairs.length, findings);
}
