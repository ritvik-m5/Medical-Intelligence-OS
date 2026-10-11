/* ------------------------------------------------------------------ */
/* MCP transport                                                       */
/*                                                                    */
/* The gateway talks to a transport, not to a process. That keeps the  */
/* control plane deterministic and testable, and lets the same gateway  */
/* drive stdio (Node), an in-memory registry (tests), or a network       */
/* transport (browser) without changing the classification rules.        */
/* ------------------------------------------------------------------ */

import type { McpToolSchema } from './types';

/** A tool result as returned by the transport, before classification. */
export interface McpToolOutput {
  /** Structured result when the server returns one. */
  content?: unknown;
  /** True when the server signalled an error. */
  isError?: boolean;
  /** A serialisable representation, used when `content` is absent. */
  text?: string;
}

export interface McpTransport {
  /** The transport's identifier, for the record. */
  readonly id: string;
  /** Discover the tools this server exposes. */
  listTools(): Promise<McpToolSchema[]>;
  /** Invoke a tool. Throws or returns an error shape on failure. */
  callTool(name: string, arguments_: Record<string, unknown>): Promise<McpToolOutput>;
}

/**
 * A transport backed by plain functions, for tests and for embedding a local
 * tool registry without a live process.
 */
export class MemoryMcpTransport implements McpTransport {
  readonly id: string;

  constructor(
    private readonly tools: McpToolSchema[],
    private readonly handler: (
      name: string,
      arguments_: Record<string, unknown>,
    ) => McpToolOutput | Promise<McpToolOutput>,
    id = 'memory',
  ) {
    this.id = id;
  }

  listTools(): Promise<McpToolSchema[]> {
    return Promise.resolve(this.tools.map((tool) => ({ ...tool })));
  }

  callTool(name: string, arguments_: Record<string, unknown>): Promise<McpToolOutput> {
    return Promise.resolve(this.handler(name, arguments_));
  }
}
