import type { EngineRelease } from '../versions';

/* ------------------------------------------------------------------ */
/* Release governance                                                  */
/*                                                                    */
/* Claims the project makes about itself, turned into checks that can   */
/* fail:                                                                */
/*                                                                    */
/*   every rule in the registry was introduced in a release             */
/*   every rule that was retired has a retirement entry                 */
/*   every breaking release increments the major version                */
/*   every change to the rule set changes the rule set hash             */
/*                                                                    */
/* Each check is a pure function of its inputs rather than a reader of   */
/* module globals, so it can be pointed at a deliberately corrupted      */
/* history and asserted to notice. A governance check that cannot fail   */
/* is decoration.                                                       */
/* ------------------------------------------------------------------ */

export interface GovernanceFinding {
  check: string;
  severity: 'error' | 'warning';
  /** What the finding is about: a rule id, a version, a field. */
  subject: string;
  message: string;
}

export interface GovernanceReport {
  check: string;
  findings: GovernanceFinding[];
  /** How many things were examined, so "no findings" differs from "nothing ran". */
  examined: number;
  ok: boolean;
}

export function makeReport(
  check: string,
  examined: number,
  findings: GovernanceFinding[],
): GovernanceReport {
  return {
    check,
    findings,
    examined,
    ok: findings.every((finding) => finding.severity !== 'error'),
  };
}

export const errorFinding = (
  check: string,
  subject: string,
  message: string,
): GovernanceFinding => ({ check, severity: 'error', subject, message });

/* ------------------------------------------------------------------ */
/* Rules                                                               */
/* ------------------------------------------------------------------ */

/**
 * Every rule in the registry must have been introduced by a release.
 *
 * Without this, a rule can be added to the engine and shipped with no version
 * bump and no entry in the history — so an artifact produced afterwards would
 * claim a version whose declared rule set does not include the rule that made it.
 */
export function checkRuleCoverage(
  registry: Array<{ id: string }>,
  releases: EngineRelease[],
): GovernanceReport {
  const introduced = new Set(releases.flatMap((release) => release.rulesAdded));
  const present = new Set(registry.map((rule) => rule.id));
  const retired = new Set(releases.flatMap((release) => release.rulesRemoved));
  const findings: GovernanceFinding[] = [];

  for (const rule of registry) {
    if (!introduced.has(rule.id)) {
      findings.push(
        errorFinding(
          'rule-coverage',
          rule.id,
          'This rule is in the registry but no release records introducing it. Add it to the rulesAdded list of the release that introduced it.',
        ),
      );
    }
  }

  for (const id of introduced) {
    if (!present.has(id) && !retired.has(id)) {
      findings.push(
        errorFinding(
          'rule-coverage',
          id,
          'This rule was recorded as introduced, is not in the registry, and has no retirement entry.',
        ),
      );
    }
  }

  return makeReport('rule-coverage', registry.length + introduced.size, findings);
}

/**
 * A rule that was introduced and is now absent must have a retirement entry, and
 * a retirement must refer to a rule that actually existed.
 */
export function checkRetirements(
  registry: Array<{ id: string }>,
  releases: EngineRelease[],
): GovernanceReport {
  const introduced = new Set(releases.flatMap((release) => release.rulesAdded));
  const present = new Set(registry.map((rule) => rule.id));
  const retired = releases.flatMap((release) =>
    release.rulesRemoved.map((id) => ({ id, version: release.version })),
  );
  const findings: GovernanceFinding[] = [];

  for (const entry of retired) {
    if (!introduced.has(entry.id)) {
      findings.push(
        errorFinding(
          'rule-retirement',
          entry.id,
          `Release ${entry.version} retires a rule that no release records introducing.`,
        ),
      );
    }
    if (present.has(entry.id)) {
      findings.push(
        errorFinding(
          'rule-retirement',
          entry.id,
          `Release ${entry.version} retires this rule, but it is still in the registry.`,
        ),
      );
    }
  }

  // Introduced, gone, and never retired: the drift this check exists to catch.
  for (const id of introduced) {
    if (!present.has(id) && !retired.some((entry) => entry.id === id)) {
      findings.push(
        errorFinding(
          'rule-retirement',
          id,
          'This rule was introduced, is no longer in the registry, and no release records retiring it.',
        ),
      );
    }
  }

  return makeReport('rule-retirement', introduced.size + retired.length, findings);
}

/** The rule ids present after each release, in release order. */
export function rulesAtEachRelease(
  releases: EngineRelease[],
): Array<{ version: string; ids: string[] }> {
  const current = new Set<string>();
  return releases.map((release) => {
    for (const id of release.rulesAdded) current.add(id);
    for (const id of release.rulesRemoved) current.delete(id);
    return { version: release.version, ids: Array.from(current).sort() };
  });
}

/**
 * The rule set hash must move whenever the rule set moves, and only then.
 *
 * This is the check that keeps `rulesetVersion` meaningful. If a rule were added
 * without the hash changing, two artifacts reasoning with different rules would
 * claim the same rule set version, and a comparison between them would blame the
 * evidence for a difference the rules caused.
 */
export function checkRulesetEvolution(
  releases: EngineRelease[],
  hashOf: (ids: string[]) => string,
): GovernanceReport {
  const stages = rulesAtEachRelease(releases);
  const findings: GovernanceFinding[] = [];

  for (let index = 1; index < stages.length; index += 1) {
    const previous = stages[index - 1];
    const current = stages[index];
    const release = releases[index];

    const changed = release.rulesAdded.length > 0 || release.rulesRemoved.length > 0;
    const hashChanged = hashOf(previous.ids) !== hashOf(current.ids);

    if (changed && !hashChanged) {
      findings.push(
        errorFinding(
          'ruleset-evolution',
          release.version,
          'This release changes the rule set, but the rule set hash is unchanged. Two artifacts with different rules would claim the same rule set version.',
        ),
      );
    }
    if (!changed && hashChanged) {
      findings.push(
        errorFinding(
          'ruleset-evolution',
          release.version,
          'This release does not change the rule set, but the rule set hash moved. The hash is over rule ids and order, so something changed without being recorded.',
        ),
      );
    }
  }

  return makeReport('ruleset-evolution', stages.length, findings);
}

/* ------------------------------------------------------------------ */
/* Versions                                                            */
/* ------------------------------------------------------------------ */

export const parseVersion = (version: string): [number, number, number] => {
  const parts = version.split('.').map((part) => Number.parseInt(part, 10));
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
};

/**
 * Releases must be dated, ordered, and consistent about what "breaking" means.
 *
 * A breaking release increments the major version, and a non-breaking release
 * does not. Without that rule the `breaking` flag is an annotation rather than a
 * contract, and "these two artifacts are not comparable" stops meaning anything.
 *
 * Two releases may share a date. Sequence is established by position in the
 * history rather than by the date, because two releases genuinely can ship on the
 * same day, and forcing distinct dates would mean inventing them. What is checked
 * is that the date never moves backwards.
 */
export function checkVersionHistory(
  releases: EngineRelease[],
  runningVersion: string,
): GovernanceReport {
  const findings: GovernanceFinding[] = [];

  if (releases.length === 0) {
    findings.push(
      errorFinding('version-history', 'releases', 'The engine declares no releases at all.'),
    );
    return makeReport('version-history', 0, findings);
  }

  const head = releases[releases.length - 1];
  if (head.version !== runningVersion) {
    findings.push(
      errorFinding(
        'version-history',
        runningVersion,
        `ENGINE_VERSION is ${runningVersion}, but the head of the declared history is ${head.version}.`,
      ),
    );
  }

  for (let index = 0; index < releases.length; index += 1) {
    const release = releases[index];
    const [major] = parseVersion(release.version);
    const wellFormed = /^\d+\.\d+\.\d+$/.test(release.version);

    if (!wellFormed) {
      // Reported, but the other checks still run: one malformed field must not
      // hide a second problem in the same release.
      findings.push(
        errorFinding('version-history', release.version, 'This version is not a three-part number.'),
      );
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(release.released)) {
      findings.push(
        errorFinding(
          'version-history',
          release.version,
          `The release date "${release.released}" is not an ISO date.`,
        ),
      );
    }

    if (release.summary.trim().length < 20) {
      findings.push(
        errorFinding(
          'version-history',
          release.version,
          'This release has no usable summary, so a stored artifact citing it cannot be explained.',
        ),
      );
    }

    if (index === 0 || !wellFormed) continue;

    const previous = releases[index - 1];
    const [previousMajor] = parseVersion(previous.version);

    if (previous.released > release.released) {
      findings.push(
        errorFinding(
          'version-history',
          release.version,
          `Released ${release.released}, which is before ${previous.version} on ${previous.released}. The history must not go backwards.`,
        ),
      );
    }

    if (release.breaking && major <= previousMajor) {
      findings.push(
        errorFinding(
          'version-history',
          release.version,
          `This release is marked breaking, but the major version did not increase from ${previous.version}.`,
        ),
      );
    }
    if (!release.breaking && major > previousMajor) {
      findings.push(
        errorFinding(
          'version-history',
          release.version,
          `This release increases the major version from ${previous.version} without being marked breaking, so the flag and the number disagree.`,
        ),
      );
    }
  }

  return makeReport('version-history', releases.length, findings);
}
