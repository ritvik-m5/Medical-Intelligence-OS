/* ------------------------------------------------------------------ */
/* MCP Control Plane                                                   */
/*                                                                    */
/* Browser-safe surface. The stdio transport lives in ./stdio and is   */
/* imported only by Node entrypoints and tests, never by the app bundle. */
/* ------------------------------------------------------------------ */

export {
  EXTERNAL_COMPUTATION_PROVENANCE,
  PROVENANCE_NOTE,
} from './types';
export type {
  ExternalComputation,
  ExternalComputationClassification,
  ExternalComputationStatus,
  McpCallOutcome,
  McpExecutionRecord,
  McpToolCall,
  McpToolError,
  McpToolSchema,
} from './types';
export { MemoryMcpTransport } from './transport';
export type { McpTransport, McpToolOutput } from './transport';
export { reviewComputation, rejectComputation, isUsableAsEvidence } from './classify';
export { validateArguments } from './schema';
export type { SchemaProblem } from './schema';
export { McpGateway, allowTools, digest } from './gateway';
export type { McpGatewayOptions, McpPermission } from './gateway';
