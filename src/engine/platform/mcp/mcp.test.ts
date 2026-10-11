import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import {
  McpGateway,
  allowTools,
  digest,
  MemoryMcpTransport,
  reviewComputation,
  rejectComputation,
  isUsableAsEvidence,
  validateArguments,
  EXTERNAL_COMPUTATION_PROVENANCE,
} from './index';
import { McpStdioTransport } from './stdio';
import type { ExternalComputation, McpToolSchema } from './types';

const SCHEMAS: McpToolSchema[] = [
  {
    name: 'process_data',
    description: 'Summarize a list of numbers.',
    inputSchema: {
      type: 'object',
      properties: {
        values: { type: 'array', items: { type: 'number' } },
        sort_output: { type: 'boolean' },
      },
      required: ['values'],
    },
  },
  {
    name: 'get_system_info',
    description: 'Read-only host info.',
    inputSchema: { type: 'object', properties: {} },
  },
];

const FIXED_CLOCK = () => '2026-01-01T00:00:00.000Z';

function transport(): MemoryMcpTransport {
  return new MemoryMcpTransport(SCHEMAS, (name) => {
    if (name === 'process_data') return { content: { count: 4, mean: 2.5 } };
    if (name === 'get_system_info') return { content: { os: 'Darwin' } };
    return { content: undefined, text: 'unknown tool', isError: true };
  });
}

function computation(output: unknown = { count: 4 }): ExternalComputation {
  return {
    id: 'mcp_1',
    tool: 'process_data',
    arguments: { values: [1, 2, 3, 4] },
    output,
    startedAt: '2026-01-01T00:00:00.000Z',
    completedAt: '2026-01-01T00:00:00.001Z',
    provenance: 'external-computation',
    status: 'unverified',
  };
}

describe('the provenance boundary', () => {
  it('marks every gateway result as an external computation, never engine-derived', async () => {
    const gateway = new McpGateway(transport(), { clock: FIXED_CLOCK });
    await gateway.discover();
    const outcome = await gateway.run({ tool: 'process_data', arguments: { values: [1, 2, 3] } });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.computation.provenance).toBe(EXTERNAL_COMPUTATION_PROVENANCE);
    expect(outcome.computation.status).toBe('unverified');
    expect(outcome.computation.classification).toBeUndefined();
  });

  it('is not usable as evidence until explicitly reviewed', () => {
    const fresh = computation();
    expect(isUsableAsEvidence(fresh)).toBe(false);

    const rejected = rejectComputation(fresh, 'out of scope', FIXED_CLOCK());
    expect(rejected.status).toBe('reviewed');
    expect(isUsableAsEvidence(rejected)).toBe(false);

    const reviewed = reviewComputation(fresh, 'vetted against the record', FIXED_CLOCK());
    expect(reviewed.status).toBe('reviewed');
    expect(reviewed.classification?.kind).toBe('evidence');
    expect(isUsableAsEvidence(reviewed)).toBe(true);
  });

  it('review is pure — it never mutates the original computation', () => {
    const fresh = computation();
    reviewComputation(fresh, 'note', FIXED_CLOCK());
    expect(fresh.status).toBe('unverified');
    expect(fresh.classification).toBeUndefined();
  });

  it('has no path that auto-promotes: the gateway never classifies', async () => {
    const gateway = new McpGateway(transport(), { clock: FIXED_CLOCK });
    await gateway.discover();

    for (const tool of ['process_data', 'get_system_info']) {
      const outcome = await gateway.run({ tool, arguments: { values: [1, 2, 3] } });
      if (outcome.ok) {
        expect(outcome.computation.status).toBe('unverified');
        expect(outcome.computation.classification).toBeUndefined();
      }
    }
  });
});

describe('the gateway', () => {
  it('discovers and caches the tool registry', async () => {
    const gateway = new McpGateway(transport());
    const tools = await gateway.discover();
    expect(tools.map((tool) => tool.name)).toEqual(['process_data', 'get_system_info']);
    expect(gateway.tools().length).toBe(2);
  });

  it('returns a structured, unverified computation for a valid call', async () => {
    const gateway = new McpGateway(transport(), { clock: FIXED_CLOCK });
    await gateway.discover();
    const outcome = await gateway.run({ tool: 'process_data', arguments: { values: [1, 2, 3] } });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.computation.output).toEqual({ count: 4, mean: 2.5 });
    expect(outcome.computation.tool).toBe('process_data');
    expect(outcome.computation.arguments).toEqual({ values: [1, 2, 3] });
  });

  it('denies a tool outside the allowlist before it runs', async () => {
    const gateway = new McpGateway(transport(), {
      permission: allowTools('get_system_info'),
      clock: FIXED_CLOCK,
    });
    await gateway.discover();
    const outcome = await gateway.run({ tool: 'process_data', arguments: { values: [1] } });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.message).toContain('permission denied');
  });

  it('refuses an unknown tool', async () => {
    const gateway = new McpGateway(transport(), { clock: FIXED_CLOCK });
    await gateway.discover();
    const outcome = await gateway.run({ tool: 'does_not_exist', arguments: {} });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.message).toContain('unknown tool');
  });

  it('refuses arguments that violate the schema', async () => {
    const gateway = new McpGateway(transport(), { clock: FIXED_CLOCK });
    await gateway.discover();
    const outcome = await gateway.run({ tool: 'process_data', arguments: {} });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.message).toContain('invalid arguments');
  });

  it('records every call in an append-only log, with a reproducible digest', async () => {
    const gateway = new McpGateway(transport(), { clock: FIXED_CLOCK });
    await gateway.discover();
    await gateway.run({ tool: 'process_data', arguments: { values: [1, 2, 3] } });
    await gateway.run({ tool: 'nope', arguments: {} });

    const records = gateway.records();
    expect(records.length).toBe(2);
    expect(records[0].outcome).toBe('ok');
    expect(records[1].outcome).toBe('error');
    expect(records[0].outputDigest).toBe(digest({ count: 4, mean: 2.5 }));
  });

  it('stamps the artifact id onto every computation', async () => {
    const gateway = new McpGateway(transport(), { artifactId: 'MM-27C7-F194', clock: FIXED_CLOCK });
    await gateway.discover();
    const outcome = await gateway.run({ tool: 'get_system_info', arguments: {} });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.computation.artifactId).toBe('MM-27C7-F194');
  });
});

describe('argument schema validation', () => {
  it('flags a missing required field', () => {
    expect(validateArguments(SCHEMAS[0], {})).toEqual([{ path: 'values', message: 'required' }]);
  });

  it('flags a wrong primitive type', () => {
    const problems = validateArguments(SCHEMAS[0], { values: 'not-an-array' });
    expect(problems).toContainEqual({ path: 'values', message: 'expected array, got string' });
  });

  it('flags a wrong array element type', () => {
    const problems = validateArguments(SCHEMAS[0], { values: [1, 'two', 3] });
    expect(problems).toContainEqual({ path: 'values[1]', message: 'expected number, got string' });
  });

  it('accepts valid arguments and tolerates unknown keys', () => {
    expect(validateArguments(SCHEMAS[0], { values: [1, 2], sort_output: true, extra: 1 })).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* End-to-end against the real local-tools server, when present.        */
/* ------------------------------------------------------------------ */

const SERVER = '/Users/rpm/Desktop/Plants-Inventory/mcp-server/server.py';
const PYTHON = '/Users/rpm/Desktop/Plants-Inventory/.venv/bin/python';

describe.skipIf(!existsSync(SERVER))('the real stdio server', () => {
  it('discovers and runs a tool over stdio', async () => {
    const stdio = new McpStdioTransport({
      command: PYTHON,
      args: [SERVER],
      cwd: '/Users/rpm/Desktop/Plants-Inventory/mcp-server',
      env: { MCP_SERVER_LOG_FILE: '/tmp/mcp_test.log' },
      timeoutMs: 8000,
    });
    const gateway = new McpGateway(stdio, { clock: FIXED_CLOCK });
    try {
      await stdio.connect();
      const tools = await gateway.discover();
      expect(tools.map((tool) => tool.name)).toEqual([
        'process_data',
        'get_system_info',
        'vendor_readiness_score',
        'detect_outliers',
      ]);

      const outcome = await gateway.run({ tool: 'process_data', arguments: { values: [1, 2, 3, 4] } });
      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.computation.status).toBe('unverified');
        expect(outcome.computation.provenance).toBe('external-computation');
        expect(outcome.computation.output).toMatchObject({ count: 4, mean: 2.5 });
      }
    } finally {
      stdio.dispose();
    }
  }, 20000);
});

