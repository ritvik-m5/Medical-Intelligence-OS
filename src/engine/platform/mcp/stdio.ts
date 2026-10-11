/* ------------------------------------------------------------------ */
/* MCP stdio transport (Node only)                                     */
/*                                                                    */
/* Speaks the JSON-RPC-over-stdio protocol to a local server such as    */
/* the `local-tools` FastMCP server. This module is deliberately kept   */
/* out of the browser-facing index: it imports `node:child_process`,     */
/* which has no meaning in a Vite browser bundle. Import it from tests   */
/* or a Node entrypoint instead.                                         */
/* ------------------------------------------------------------------ */

import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface, type Interface } from 'node:readline';
import type { McpToolSchema } from './types';
import type { McpToolOutput, McpTransport } from './transport';

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface McpStdioOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  /** Time to wait for the initialize handshake, in ms. */
  timeoutMs?: number;
}

export class McpStdioTransport implements McpTransport {
  readonly id: string;

  private proc: ChildProcess | null = null;
  private lines: Interface | null = null;
  private nextId = 1;
  private pending = new Map<number, (value: JsonRpcResponse) => void>();

  constructor(private readonly options: McpStdioOptions) {
    this.id = options.command;
  }

  private ensureStarted(): ChildProcess {
    if (this.proc) return this.proc;

    const proc = spawn(this.options.command, this.options.args ?? [], {
      cwd: this.options.cwd,
      env: { ...process.env, ...this.options.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.proc = proc;

    this.lines = createInterface({ input: proc.stdout!, crlfDelay: Infinity });
    this.lines.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        const message = JSON.parse(trimmed) as JsonRpcResponse;
        if (message.id !== undefined && this.pending.has(message.id)) {
          const resolve = this.pending.get(message.id)!;
          this.pending.delete(message.id);
          resolve(message);
        }
      } catch {
        // A non-JSON line on stdout is a protocol violation; it is ignored so
        // a stray log line cannot desynchronise the request/response stream.
      }
    });

    return proc;
  }

  private async request(method: string, params?: unknown): Promise<unknown> {
    const proc = this.ensureStarted();
    const id = this.nextId;
    this.nextId += 1;

    const timeoutMs = this.options.timeoutMs ?? 10_000;
    const response = new Promise<JsonRpcResponse>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`MCP request ${method} timed out`)), timeoutMs);
      this.pending.set(id, (value) => {
        clearTimeout(timer);
        resolve(value);
      });
    });

    const message = JSON.stringify({ jsonrpc: '2.0', id, method, params: params ?? {} });
    proc.stdin!.write(message + '\n');

    const result = await response;
    if (result.error) {
      throw new Error(`MCP ${method} failed: ${result.error.message}`);
    }
    return result.result;
  }

  /** Establish the connection and complete the initialize handshake. */
  async connect(): Promise<void> {
    await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'medical-memory', version: '0.1.0' },
    });
    // The initialized notification has no id; write it raw.
    this.ensureStarted().stdin!.write(
      JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n',
    );
  }

  async listTools(): Promise<McpToolSchema[]> {
    const result = (await this.request('tools/list')) as { tools?: McpToolSchema[] };
    return result.tools ?? [];
  }

  async callTool(name: string, arguments_: Record<string, unknown>): Promise<McpToolOutput> {
    const result = (await this.request('tools/call', { name, arguments: arguments_ })) as {
      content?: Array<{ type: string; text?: string }>;
      structuredContent?: unknown;
      isError?: boolean;
    };
    const text = (result.content ?? [])
      .filter((item) => item.type === 'text')
      .map((item) => item.text ?? '')
      .join('\n');
    return {
      content: result.structuredContent ?? text,
      text: text || undefined,
      isError: result.isError === true,
    };
  }

  dispose(): void {
    if (this.lines) this.lines.close();
    if (this.proc) {
      this.proc.stdin?.end();
      this.proc.kill();
      this.proc = null;
    }
  }
}
