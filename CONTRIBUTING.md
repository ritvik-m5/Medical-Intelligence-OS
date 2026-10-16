# Contributing

Thank you for your interest in **Medical Memory**. This repository is **private**; contributions are by invitation or explicit agreement with the maintainer.

## Branch protection (`main`)

The default branch uses the **Protect main** ruleset:

- Pull requests required (reviews optional; CI must pass)
- Required status check: **`verify`** (CI workflow)
- No force-push or branch deletion; linear history (no merge commits)

Open a PR from a feature branch; wait for green CI, then merge (squash or rebase recommended).

Configuration: [`.github/rulesets/protect-main.json`](./.github/rulesets/protect-main.json) · [Rules on GitHub](https://github.com/ritvik-m5/Medical-Intelligence-OS/rules/25212607)

## Before you open a pull request

1. **Read** the [Platform handbook](./docs/HANDBOOK.md) and [pipeline audit](./docs/pipeline-baseline-audit.md) — especially provenance and temporal (`asOf`) rules.
2. **Run the full gate** locally:

   ```bash
   npm install
   npm run verify:pipeline
   ```

3. **Keep engine purity** — no React or DOM imports under `src/engine/`.
4. **Prefer proof over prose** — new conclusions must flow through the rule registry and carry `question` + `notConcluded`.

## Pull request checklist

- [ ] Tests added or updated for behavior you changed
- [ ] `npm run typecheck` clean
- [ ] `npm run verify:pipeline` green
- [ ] If you added a view: sidebar, router, `ViewId`, and [How it works](./src/views/HowItWorksView.tsx) stay in sync (`npm run audit:nav`)
- [ ] No secrets, patient data, or local paths in commits

## Commit messages

Use short, imperative subjects focused on **why** (e.g. “Filter contradictions by asOf so historical snapshots cannot leak future docs”).

## Questions

Open a **Discussion** or **Issue** in this repository, or contact the repository owner directly.
