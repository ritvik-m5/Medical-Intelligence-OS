import type { ConceptSpec, } from './lexiconTypes';
import { splitAliases } from './lexiconTypes';
import type { FactType } from '../types';

/** Build a non-measurement concept (condition, procedure, allergy, vital, …). */
export function simple(
  kind: FactType,
  key: string,
  label: string,
  category: string,
  aliases: string,
  note?: string,
): ConceptSpec {
  return {
    key,
    label,
    kind,
    category,
    aliases: splitAliases(aliases),
    note,
  };
}
