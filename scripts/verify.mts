/* ------------------------------------------------------------------ */
/* The governance runner                                               */
/*                                                                    */
/*   npm run verify:versions                                            */
/*   npm run verify:rules                                               */
/*   npm run verify:artifacts                                           */
/*   npm run verify:reproducibility                                     */
/*                                                                    */
/* Each exits non-zero on any error finding, so it fails a build rather */
/* than printing a warning nobody reads. Findings are printed in full,  */
/* because the message says what to do about them.                       */
/* ------------------------------------------------------------------ */

import { LocalBuildBackend, reproduceArtifact } from '../src/builder/backend';
import { requestFromRun, toStoredRun } from '../src/builder/runs';
import { DEFAULT_SCENARIO, SCENARIOS } from '../src/builder/scenarios';
import { RULE_REGISTRY } from '../src/engine/derive/engine';
import { rulesetHash } from '../src/engine/identity';
import { ENGINE_RELEASES, ENGINE_VERSION } from '../src/engine/versions';
import {
  checkRetirements,
  checkRuleCoverage,
  checkRulesetEvolution,
  checkVersionHistory,
  type GovernanceReport,
} from '../src/engine/governance/checks';
import { checkArtifacts, checkReproducibility } from '../src/engine/governance/artifacts';
import { MemoryArtifactStore } from '../src/engine/platform/artifactStore';

const RED = '\u001b[31m';
const GREEN = '\u001b[32m';
const DIM = '\u001b[2m';
const OFF = '\u001b[0m';

function present(reports: GovernanceReport[]): number {
  let errors = 0;

  for (const report of reports) {
    const mark = report.ok ? `${GREEN}PASS${OFF}` : `${RED}FAIL${OFF}`;
    console.log(`${mark}  ${report.check} ${DIM}(${report.examined} examined)${OFF}`);
    for (const finding of report.findings) {
      if (finding.severity === 'error') errors += 1;
      const tone = finding.severity === 'error' ? RED : '\u001b[33m';
      console.log(`      ${tone}${finding.severity}${OFF} ${finding.subject}`);
      console.log(`        ${finding.message}`);
    }
  }

  return errors;
}

async function versions(): Promise<GovernanceReport[]> {
  return [checkVersionHistory(ENGINE_RELEASES, ENGINE_VERSION)];
}

async function rules(): Promise<GovernanceReport[]> {
  return [
    checkRuleCoverage(RULE_REGISTRY, ENGINE_RELEASES),
    checkRetirements(RULE_REGISTRY, ENGINE_RELEASES),
    checkRulesetEvolution(ENGINE_RELEASES, (ids) => rulesetHash(ids)),
  ];
}

/**
 * Build every scenario, save it, and check every stored artifact.
 *
 * The store is in memory: this is a check of the artifacts the engine produces,
 * not of whatever happens to be in a browser's localStorage on the machine
 * running it.
 */
async function artifacts(): Promise<GovernanceReport[]> {
  const backend = new LocalBuildBackend({ pace: 0 });
  const store = new MemoryArtifactStore();

  for (const scenario of SCENARIOS) {
    const artifact = await backend.run({ prompt: scenario.prompt, pace: 0 }, () => {});
    await store.save(toStoredRun(artifact, { prompt: scenario.prompt }));
  }

  const { runs } = await store.list();

  return [
    await checkArtifacts({
      runs,
      rebuild: async (run) => {
        const rebuilt = await backend.run(requestFromRun(run), () => {});
        return { identity: rebuilt.identity, derivations: rebuilt.derivations };
      },
    }),
  ];
}

/** Build each scenario twice and require the two to be identical. */
async function reproducibility(): Promise<GovernanceReport[]> {
  const backend = new LocalBuildBackend({ pace: 0 });
  const prompts = [DEFAULT_SCENARIO.prompt, ...SCENARIOS.map((scenario) => scenario.prompt)];
  const pairs = [];

  for (const prompt of prompts) {
    const first = await backend.run({ prompt, pace: 0 }, () => {});
    const second = await backend.run({ prompt, pace: 0 }, () => {});
    // And a third through the reproduction path a user would take.
    const { report } = reproduceArtifact(first);

    pairs.push({
      label: prompt,
      expected: { identity: first.identity, derivations: first.derivations },
      actual: { identity: second.identity, derivations: second.derivations },
    });

    if (report.status !== 'identical') {
      return [
        {
          check: 'reproducibility',
          examined: 1,
          ok: false,
          findings: [
            {
              check: 'reproducibility',
              severity: 'error' as const,
              subject: prompt,
              message: `reproduceArtifact returned "${report.status}". ${report.notes.join(' ')}`,
            },
          ],
        },
      ];
    }
  }

  return [checkReproducibility(pairs)];
}

const COMMANDS: Record<string, () => Promise<GovernanceReport[]>> = {
  versions,
  rules,
  artifacts,
  reproducibility,
};

const which = process.argv[2];

if (!which || !(which in COMMANDS)) {
  console.error(`usage: verify <${Object.keys(COMMANDS).join('|')}>`);
  process.exit(2);
}

const reports = await COMMANDS[which]();
const errors = present(reports);

if (errors > 0) {
  console.error(`\n${RED}${errors} governance error${errors === 1 ? '' : 's'}.${OFF}`);
  process.exit(1);
}

console.log(`\n${GREEN}No governance errors.${OFF}`);
