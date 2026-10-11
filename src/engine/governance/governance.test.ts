import { describe, expect, it } from 'vitest';
import {
  checkRetirements,
  checkRuleCoverage,
  checkRulesetEvolution,
  checkVersionHistory,
  rulesAtEachRelease,
  type GovernanceReport,
} from './checks';
import { ENGINE_RELEASES, ENGINE_VERSION, type EngineRelease } from '../versions';
import { RULE_REGISTRY } from '../derive/engine';
import { rulesetHash } from '../identity';

/* ------------------------------------------------------------------ */
/* Governance                                                          */
/*                                                                    */
/* Two halves, and the second matters more. The first asserts that the  */
/* real repository passes. The second deliberately corrupts a history   */
/* and asserts that each corruption is *caught* — because a check that  */
/* cannot fail is decoration, and the only way to know a check works is  */
/* to watch it fail.                                                    */
/* ------------------------------------------------------------------ */

const release = (over: Partial<EngineRelease> & { version: string }): EngineRelease => ({
  released: '2026-01-01',
  summary: 'A release with a summary long enough to be usable.',
  rulesAdded: [],
  rulesRemoved: [],
  changes: [],
  breaking: false,
  ...over,
});

describe('governance: the real repository', () => {
  it('passes rule coverage', () => {
    const report = checkRuleCoverage(RULE_REGISTRY, ENGINE_RELEASES);
    expect(report.findings).toEqual([]);
    expect(report.ok).toBe(true);
    // Something was actually examined; an empty run must not read as a pass.
    expect(report.examined).toBeGreaterThan(RULE_REGISTRY.length);
  });

  it('passes retirement checks', () => {
    const report = checkRetirements(RULE_REGISTRY, ENGINE_RELEASES);
    expect(report.findings).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('passes the version history', () => {
    const report = checkVersionHistory(ENGINE_RELEASES, ENGINE_VERSION);
    expect(report.findings).toEqual([]);
    expect(report.examined).toBe(ENGINE_RELEASES.length);
  });

  it('passes rule set evolution against the real hash', () => {
    const report = checkRulesetEvolution(ENGINE_RELEASES, (ids) => rulesetHash(ids));
    expect(report.findings).toEqual([]);
  });

  it('has a rule set that is the accumulation of the whole history', () => {
    const stages = rulesAtEachRelease(ENGINE_RELEASES);
    const head = stages[stages.length - 1];
    expect(head.ids.slice().sort()).toEqual(RULE_REGISTRY.map((rule) => rule.id).sort());
  });
});

/* ------------------------------------------------------------------ */
/* Mutation: every corruption must be detected                         */
/* ------------------------------------------------------------------ */

const detected = (report: GovernanceReport, subject: string) =>
  report.findings.some((finding) => finding.subject === subject && finding.severity === 'error');

describe('governance: corruptions are detected', () => {
  it('catches a rule added to the registry with no release recording it', () => {
    const registry = [...RULE_REGISTRY, { id: 'gap.smuggled_rule' }];
    const report = checkRuleCoverage(registry, ENGINE_RELEASES);
    expect(report.ok).toBe(false);
    expect(detected(report, 'gap.smuggled_rule')).toBe(true);
  });

  it('catches a rule deleted from the registry with no retirement entry', () => {
    const target = RULE_REGISTRY[0].id;
    const registry = RULE_REGISTRY.filter((rule) => rule.id !== target);
    const report = checkRetirements(registry, ENGINE_RELEASES);
    expect(report.ok).toBe(false);
    expect(detected(report, target)).toBe(true);
  });

  it('catches a retirement of a rule that is still in the registry', () => {
    const target = RULE_REGISTRY[0].id;
    const releases = [
      ...ENGINE_RELEASES.slice(0, -1),
      { ...ENGINE_RELEASES[ENGINE_RELEASES.length - 1], rulesRemoved: [target] },
    ];
    const report = checkRetirements(RULE_REGISTRY, releases);
    expect(report.ok).toBe(false);
    expect(detected(report, target)).toBe(true);
  });

  it('catches a retirement of a rule that never existed', () => {
    const releases = [
      ...ENGINE_RELEASES,
      release({ version: '9.9.9', released: '2027-01-01', rulesRemoved: ['never.existed'] }),
    ];
    const report = checkRetirements(RULE_REGISTRY, releases);
    expect(report.ok).toBe(false);
    expect(detected(report, 'never.existed')).toBe(true);
  });

  it('catches a breaking release that does not increment the major version', () => {
    const releases = [
      release({ version: '1.0.0', released: '2026-01-01' }),
      release({ version: '1.1.0', released: '2026-02-01', breaking: true }),
    ];
    const report = checkVersionHistory(releases, '1.1.0');
    expect(report.ok).toBe(false);
    expect(report.findings.some((finding) => finding.message.includes('marked breaking'))).toBe(
      true,
    );
  });

  it('catches a major bump that is not marked breaking', () => {
    const releases = [
      release({ version: '1.0.0', released: '2026-01-01' }),
      release({ version: '2.0.0', released: '2026-02-01', breaking: false }),
    ];
    const report = checkVersionHistory(releases, '2.0.0');
    expect(report.ok).toBe(false);
    expect(
      report.findings.some((finding) => finding.message.includes('without being marked breaking')),
    ).toBe(true);
  });

  it('catches a history whose dates go backwards', () => {
    const releases = [
      release({ version: '1.0.0', released: '2026-02-01' }),
      release({ version: '1.1.0', released: '2026-01-01' }),
    ];
    const report = checkVersionHistory(releases, '1.1.0');
    expect(report.ok).toBe(false);
    expect(
      report.findings.some((finding) => finding.message.includes('must not go backwards')),
    ).toBe(true);
  });

  it('allows two releases on the same day, because that happens', () => {
    const releases = [
      release({ version: '1.0.0', released: '2026-01-01' }),
      release({ version: '1.1.0', released: '2026-01-01' }),
    ];
    expect(checkVersionHistory(releases, '1.1.0').ok).toBe(true);
  });

  it('catches a running version that is not the head of the history', () => {
    const report = checkVersionHistory(ENGINE_RELEASES, '99.0.0');
    expect(report.ok).toBe(false);
    expect(detected(report, '99.0.0')).toBe(true);
  });

  it('catches a malformed version and a malformed date', () => {
    const releases = [release({ version: 'v1', released: 'last Tuesday' })];
    const report = checkVersionHistory(releases, 'v1');
    expect(report.ok).toBe(false);
    expect(report.findings.length).toBeGreaterThanOrEqual(2);
  });

  it('catches a release with no usable summary', () => {
    const releases = [release({ version: '1.0.0', summary: 'tweak' })];
    const report = checkVersionHistory(releases, '1.0.0');
    expect(report.ok).toBe(false);
    expect(report.findings.some((finding) => finding.message.includes('no usable summary'))).toBe(
      true,
    );
  });

  it('catches a rule set change that leaves the hash unmoved', () => {
    const releases = [
      release({ version: '1.0.0', released: '2026-01-01', rulesAdded: ['a'] }),
      release({ version: '1.1.0', released: '2026-02-01', rulesAdded: ['b'] }),
    ];
    // A hash that ignores its input: exactly the failure being guarded against.
    const report = checkRulesetEvolution(releases, () => 'constant');
    expect(report.ok).toBe(false);
    expect(report.findings.every((finding) => finding.subject === '1.1.0')).toBe(true);
  });

  it('catches a hash that moves when the rule set did not', () => {
    const releases = [
      release({ version: '1.0.0', released: '2026-01-01', rulesAdded: ['a'] }),
      release({ version: '1.0.1', released: '2026-02-01' }),
    ];
    let calls = 0;
    const report = checkRulesetEvolution(releases, (ids) => {
      calls += 1;
      return `${ids.join(',')}#${calls}`;
    });
    expect(report.ok).toBe(false);
    expect(report.findings.some((finding) => finding.message.includes('does not change'))).toBe(
      true,
    );
  });

  it('catches an empty history', () => {
    expect(checkVersionHistory([], ENGINE_VERSION).ok).toBe(false);
    expect(checkRuleCoverage(RULE_REGISTRY, []).ok).toBe(false);
  });

  it('reports no findings when nothing is wrong, so a pass is distinguishable', () => {
    // Real rule ids: `rulesetHash` hashes the registry subset, so a fixture of
    // invented ids would hash to the empty set twice and prove nothing.
    const first = RULE_REGISTRY[0].id;
    const second = RULE_REGISTRY[1].id;

    const releases = [
      release({ version: '1.0.0', released: '2026-01-01', rulesAdded: [first] }),
      release({
        version: '2.0.0',
        released: '2026-02-01',
        rulesAdded: [second],
        breaking: true,
      }),
    ];
    expect(checkRuleCoverage([{ id: first }, { id: second }], releases).ok).toBe(true);
    expect(checkVersionHistory(releases, '2.0.0').ok).toBe(true);
    expect(checkRulesetEvolution(releases, (ids) => rulesetHash(ids)).ok).toBe(true);
  });

  it('treats a rule id the registry does not know as unknown, not as a change', () => {
    /*
     * `rulesetHash` hashes the registry subset, so an id the registry does not
     * contain contributes nothing. That is correct for hashing a real subset, and
     * it is why coverage is checked separately: a release naming a rule that does
     * not exist is caught by rule coverage rather than silently absorbed here.
     */
    const first = RULE_REGISTRY[0].id;
    const releases = [
      release({ version: '1.0.0', released: '2026-01-01', rulesAdded: [first] }),
      release({ version: '1.1.0', released: '2026-02-01', rulesAdded: ['typo.rule_that_is_not_real'] }),
    ];

    expect(checkRulesetEvolution(releases, (ids) => rulesetHash(ids)).ok).toBe(false);
    expect(checkRuleCoverage(RULE_REGISTRY, releases).ok).toBe(false);
  });
});
