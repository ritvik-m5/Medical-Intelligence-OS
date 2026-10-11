/* ------------------------------------------------------------------ */
/* MCP Gateway — the control plane                                     */
/*                                                                    */
/* Discover tools, gate every call through permission + schema, run     */
/* the tool, and wrap the result as an ExternalComputation that is       */
/* ALWAYS unverified and ALWAYS external-computation provenance.        */
/*                                                                    */
/* The gateway never classifies. It never produces a fact or a           */
/* derivation. It only produces computations for a human to review.      */
/* ------------------------------------------------------------------ */

import type {
  ExternalComputation,
  McpCallOutcome,
  McpExecutionRecord,
  McpToolCall,
  McpToolSchema,
} from './types';
import type { McpTransport } from './transport';
import { validateArguments } from './schema';

/** Decides whether a call may run. Return a reason to block, or null to allow. */
export interface McpPermission {
  authorize(tool: string, arguments_: Record<string, unknown>): string | null;
}

/** Permit exactly the listed tools; refuse everything else. */
export function allowTools(...names: string[]): McpPermission {
  const set = new Set(names);
  return {
    authorize(tool) {
      return set.has(tool) ? null : `tool "${tool}" is not in the allowlist`;
    },
  };
}

export interface McpGatewayOptions {
  permission?: McpPermission;
  /** The artifact id to stamp on every computation. */
  artifactId?: string;
  /** Time source, injectable for deterministic tests. */
  clock?: () => string;
}

/** A stable, dependency-free string digest for the execution log. */
export function digest(value: unknown): string {
  const text = JSON.stringify(value) ?? String(value);
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export class McpGateway {
  private registry: McpToolSchema[] | null = null;
  private readonly log: McpExecutionRecord[] = [];
  private sequence = 0;
  private readonly clock: () => string;

  constructor(
    private readonly transport: McpTransport,
    private readonly options: McpGatewayOptions = {},
  ) {
    this.clock = options.clock ?? (() => new Date().toISOString());
  }

  /** The transport this gateway is bound to. */
  get source(): string {
    return this.transport.id;
  }

  /** Discover tools once and cache them. */
  async discover(): Promise<McpToolSchema[]> {
    if (!this.registry) {
      this.registry = await this.transport.listTools();
    }
    return this.registry.map((tool) => ({ ...tool }));
  }

  /** The cached registry, or an empty list before discovery. */
  tools(): McpToolSchema[] {
    return (this.registry ?? []).map((tool) => ({ ...tool }));
  }

  /** The append-only execution log. */
  records(): McpExecutionRecord[] {
    return [...this.log];
  }

  /**
   * Run a tool through the permission and schema gates, then wrap the output.
   *
   * The returned computation is `unverified` with `external-computation`
   * provenance, no matter what the tool returns. Only `reviewComputation` (a
   * separate, explicit call) can change that.
   */
  async run(call: McpToolCall): Promise<McpCallOutcome> {
    const startedAt = this.clock();
    this.sequence += 1;

    const permission = this.options.permission;
    const denial = permission ? permission.authorize(call.tool, call.arguments) : null;
    if (denial) {
      return this.fail(call, startedAt, `permission denied: ${denial}`);
    }

    const schema = (this.registry ?? []).find((tool) => tool.name === call.tool);
    if (!schema) {
      // Unknown tool: refuse before any call leaves the process.
      return this.fail(call, startedAt, `unknown tool "${call.tool}"`);
    }

    const problems = validateArguments(schema, call.arguments);
    if (problems.length > 0) {
      const detail = problems.map((p) => `${p.path}: ${p.message}`).join('; ');
      return this.fail(call, startedAt, `invalid arguments: ${detail}`);
    }

    try {
      const output = await this.transport.callTool(call.tool, call.arguments);
      if (output.isError) {
        return this.fail(call, startedAt, `tool reported an error`, output);
      }

      const completedAt = this.clock();
      const computation: ExternalComputation = {
        id: `mcp_${this.sequence}`,
        tool: call.tool,
        arguments: call.arguments,
        output: output.content ?? output.text,
        startedAt,
        completedAt,
        provenance: 'external-computation',
        status: 'unverified',
        artifactId: this.options.artifactId,
      };

      this.record(call, 'ok', startedAt, computation.output, computation.id);
      return { ok: true, computation };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.fail(call, startedAt, `transport error: ${message}`);
    }
  }

  private fail(
    call: McpToolCall,
    startedAt: string,
    message: string,
    detail?: unknown,
  ): McpCallOutcome {
    this.record(call, 'error', startedAt, detail, undefined);
    return { ok: false, error: { tool: call.tool, message, detail } };
  }

  private record(
    call: McpToolCall,
    outcome: 'ok' | 'error',
    at: string,
    payload: unknown,
    computationId?: string,
  ): void {
    this.log.push({
      id: `rec_${this.sequence}`,
      at,
      tool: call.tool,
      arguments: call.arguments,
      outcome,
      outputDigest: digest(payload),
      computationId,
    });
  }
}
