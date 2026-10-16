# Contributing

Thank you for your interest in **Medical Memory**. Contributions are welcome via pull request.

## Branch protection (`main`)

The **Protect main** ruleset includes:

- PRs required · direct pushes blocked · no force-push or branch deletion · linear history
- Required checks: **`verify`**, **`coverage`**, **`pages-build`**, **`merge-gate`**, **CodeQL Analyze**
- Required deployment environment: **`merge-gate`**
- Code scanning via required **CodeQL `Analyze`** check · **60%** line coverage enforced in the **`coverage`** job
- **Signed commits** on the default branch
- Required **`merge-gate`** deployment (after verify, coverage, and pages-build)
- Copilot code review on pull requests
- Repository **admins** can bypass the ruleset in emergencies

To also enable **Restrict creations/updates** or **Restrict code coverage** in the GitHub UI, edit [Protect main](https://github.com/ritvik-m5/Medical-Intelligence-OS/rules/25212607) — those rules are not applied via the REST API on this plan.

**Signed commits:** configure [SSH or GPG commit signing](https://docs.github.com/en/authentication/managing-commit-signature-verification) locally, then merge with verified commits.

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
