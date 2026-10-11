/* ------------------------------------------------------------------ */
/* Argument schema validation                                          */
/*                                                                    */
/* Deterministic, dependency-free validation against the tool's         */
/* advertised JSON schema. The subset implemented here is what the       */
/* shipped tools actually declare: required properties and per-property   */
/* primitive types. It is intentionally small — a tool whose arguments    */
/* do not match its schema is refused before it runs, which is the         */
/* permission gate's first line of defence.                               */
/* ------------------------------------------------------------------ */

import type { McpToolSchema } from './types';

export interface SchemaProblem {
  path: string;
  message: string;
}

function jsonTypeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/**
 * Validate `arguments_` against the tool's input schema.
 *
 * Returns an empty array when the arguments are acceptable, otherwise a list
 * of concrete problems. The validation is permissive about properties the
 * schema does not mention — refusing on unknown keys would break every client
 * the moment a server adds a field.
 */
export function validateArguments(
  schema: McpToolSchema,
  arguments_: Record<string, unknown>,
): SchemaProblem[] {
  const problems: SchemaProblem[] = [];
  const root = schema.inputSchema ?? {};
  const properties = (root.properties ?? {}) as Record<string, Record<string, unknown>>;
  const required = new Set((root.required ?? []) as string[]);

  for (const name of required) {
    if (!(name in arguments_) || arguments_[name] === undefined) {
      problems.push({ path: name, message: 'required' });
    }
  }

  for (const [name, value] of Object.entries(arguments_)) {
    const property = properties[name];
    if (!property) continue; // unknown keys are tolerated, not rejected

    const declared = property.type;
    if (typeof declared !== 'string') continue;

    const actual = jsonTypeOf(value);
    // JSON Schema calls a number "number" and integers "integer".
    const declaredJson = declared === 'integer' ? 'number' : declared;
    const actualJson = actual === 'number' && declared === 'integer' ? 'number' : actual;
    if (actualJson !== declaredJson) {
      problems.push({ path: name, message: `expected ${declared}, got ${actual}` });
    }

    if (declared === 'array' && Array.isArray(value)) {
      const items = property.items as Record<string, unknown> | undefined;
      if (items && typeof items.type === 'string') {
        value.forEach((item, index) => {
          if (jsonTypeOf(item) !== items.type) {
            problems.push({ path: `${name}[${index}]`, message: `expected ${items.type}, got ${jsonTypeOf(item)}` });
          }
        });
      }
    }
  }

  return problems;
}
