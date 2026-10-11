import { splitAliases, type ConceptSpec } from './lexiconTypes';

/**
 * Medication lexicon.
 *
 * [key, label, drugClass, genericAliases, brandAliases, commonUses, monitoringLabs]
 *
 * `commonUses` and `monitoringLabs` feed *only* the clearly-labelled education
 * layer. They never appear as statements about the patient.
 */
export type DrugRow = [string, string, string, string, string, string, string];

export function toDrugSpec(row: DrugRow): ConceptSpec {
  const [key, label, drugClass, aliases, brands, uses, monitoring] = row;
  return {
    key,
    label,
    kind: 'medication',
    category: drugClass,
    aliases: [...splitAliases(aliases), ...splitAliases(brands)],
    drugClass,
    commonUses: splitAliases(uses),
    monitoringLabs: splitAliases(monitoring),
  };
}
