# Security policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| `main`  | Yes       |
| Tags    | Best effort on latest engine release |

## Reporting a vulnerability

**Do not** open a public issue for security-sensitive findings.

1. Use [GitHub private vulnerability reporting](https://github.com/ritvik-m5/Medical-Intelligence-OS/security/advisories/new) if enabled, **or**
2. Contact the repository owner through a private channel you already use with them.

Include:

- Description and impact
- Steps to reproduce
- Whether patient or PHI data is involved (this project uses **synthetic** demo records only in-repo)

## Scope notes

- **Local-first**: imported corpora may persist in browser storage on the user’s machine.
- **LLM proxy**: optional model endpoints are user-configured; requests must not include raw patient documents (see `ExplanationRequest` in `src/explain/types.ts`).
- **Not a hardened multi-tenant service** — do not expose Ollama or this app to the public internet without authentication in front of inference.

We aim to acknowledge reports within **7 days** and share a remediation plan when applicable.
