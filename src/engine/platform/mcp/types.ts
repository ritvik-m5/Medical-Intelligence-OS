/* ------------------------------------------------------------------ */
/* MCP Control Plane — types                                          */
/*                                                                    */
/* The rule this module exists to enforce:                            */
/*                                                                    */
/*     A tool result is an EXTERNAL COMPUTATION, not evidence.         */
/*                                                                    */
/* It carries its own provenance class ('external-computation'), which */
/* is deliberately disjoint from 'engine-derived' (proofs) and         */
/* 'model-explained' (prose). Nothing downstream may treat it as a      */
/* fact or a derivation. It is UNVERIFIED until a human explicitly      */
/* reviews it — there is no code path that promotes it automatically.   */
/* ------------------------------------------------------------------ */

/** A tool the MCP server exposes, as discovered at connect time. */
export interface McpToolSchema {
  name: string;
  description: string;
  /** The JSON schema the tool advertises for its arguments. */
  inputSchema: Record<string, unknown>;
}

/** A single invocation of a tool, before it runs. */
export interface McpToolCall {
  tool: string;
  arguments: Record<string, unknown>;
}

/**
 * A tool result, captured with its execution provenance and left
 * UNVERIFIED. This is the only shape the gateway ever emits.
 *
 * `ExternalComputation` is intentionally not assignable to `Fact` or
 * `Derivation`. There is no implicit path from here into the graph: the
 * output is an opaque `unknown`, and only an explicit `review()` (see
 * classify.ts) can attach a classification to it.
 */
export interface ExternalComputation {
  id: string;
  /** The tool that produced it. */
  tool: string;
  /** The arguments, exactly as sent. */
  arguments: Record<string, unknown>;
  /** The raw structured output, untouched. */
  output: unknown;
  startedAt: string;
  completedAt: string;
  /** Always 'external-computation'. Never 'engine-derived'. */
  provenance: 'external-computation';
  /** Unverified by default; only an explicit human action promotes it. */
  status: ExternalComputationStatus;
  /** The artifact this computation was run against, if any. */
  artifactId?: string;
  /** Set only by an explicit review. Absent until a human classifies. */
  classification?: ExternalComputationClassification;
}

export type ExternalComputationStatus = 'unverified' | 'reviewed';

/**
 * What a human decided about an external computation.
 *
 * `evidence` means it was explicitly promoted to be treated as an external
 * reference. `rejected` means it was looked at and set aside. Neither can be
 * produced by the gateway — only by `reviewComputation` / `rejectComputation`.
 */
export type ExternalComputationClassification =
  | { kind: 'evidence'; note: string; at: string }
  | { kind: 'rejected'; note: string; at: string };

/** A failure from the transport or the server, kept apart from a result. */
export interface McpToolError {
  tool: string;
  message: string;
  /** The server's structured error payload, if it sent one. */
  detail?: unknown;
}

export type McpCallOutcome =
  | { ok: true; computation: ExternalComputation }
  | { ok: false; error: McpToolError };

/** An append-only record of what the gateway did, for the audit trail. */
export interface McpExecutionRecord {
  id: string;
  at: string;
  tool: string;
  arguments: Record<string, unknown>;
  outcome: 'ok' | 'error';
  /** A hash of the output, so the log is reproducible without the payload. */
  outputDigest: string;
  computationId?: string;
}

export const EXTERNAL_COMPUTATION_PROVENANCE = 'external-computation' as const;

export const PROVENANCE_NOTE =
  'Produced by an external tool over the MCP transport. It is not evidence, ' +
  'not a derivation, and not the engine\u2019s own statement. It is unverified ' +
  'until a human reviews it explicitly.';
