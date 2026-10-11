import { useStore } from '../state/store';
import { Chip, Panel } from './Panel';
import { CATEGORY_LABEL } from '../engine/derive/types';

/**
 * The rule registry.
 *
 * Every rule the platform is capable of applying, with how many findings each
 * produced on this record. Showing the zero rows matters: it is the difference
 * between "nothing was found" and "nothing was looked for".
 */
export function RuleRegistry() {
  const { ruleHealthReport } = useStore();

  return (
    <Panel
      title="Rule registry"
      sub={`${ruleHealthReport.length} rules · every one is a pure function over the graph`}
    >
      <table className="table">
        <thead>
          <tr>
            <th>Rule</th>
            <th>Category</th>
            <th style={{ textAlign: 'right' }}>Findings</th>
            <th>What it detects</th>
          </tr>
        </thead>
        <tbody>
          {ruleHealthReport.map((entry) => (
            <tr key={entry.id}>
              <td className="is-primary mono" style={{ fontSize: 11 }}>
                {entry.id}
              </td>
              <td>{CATEGORY_LABEL[entry.category]}</td>
              <td className="num">
                {entry.failed ? (
                  <Chip tone="critical">threw</Chip>
                ) : entry.produced === 0 ? (
                  <span className="dim">0</span>
                ) : (
                  entry.produced
                )}
              </td>
              <td className="muted">{entry.describe}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="dim" style={{ fontSize: 11, marginTop: 10 }}>
        A rule producing zero findings is a normal outcome. It means the pattern it detects is not
        present in this record, not that the rule is broken.
      </div>
    </Panel>
  );
}
