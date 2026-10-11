import { useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { Chip, MetricCard, Notice, Panel } from '../components/Panel';
import { Icon } from '../components/Icon';
import { exportFhir, importFhir, type FhirImportResult } from '../engine/platform/fhir';
import { redact } from '../engine/platform/redactApply';
import { REDACTION_POLICIES } from '../engine/platform/redactPolicy';
import { codingCoverage, codesFor, primaryCodeFor } from '../engine/platform/codes';
import { downloadText } from '../lib/download';

/**
 * Interoperability and disclosure.
 *
 * Three things a platform must be able to do with a record: send it out with its
 * provenance intact, read someone else's record in, and share a version with
 * parts deliberately removed — saying exactly what was removed.
 */
export function InteropView() {
  const { graph } = useStore();
  const [policyId, setPolicyId] = useState('clinical-share');
  const [importText, setImportText] = useState('');
  const [importResult, setImportResult] = useState<FhirImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [downloadNote, setDownloadNote] = useState<string | null>(null);

  const fhir = useMemo(() => exportFhir(graph), [graph]);
  const policy = REDACTION_POLICIES.find((p) => p.id === policyId) ?? REDACTION_POLICIES[0];
  const redacted = useMemo(() => redact(graph, policy), [graph, policy]);
  const coverage = useMemo(
    () => codingCoverage(graph.entities.filter((e) => e.kind !== 'person').map((e) => e.key)),
    [graph],
  );

  /** Every concept, with the codes it resolved to — or why it did not. */
  const codedConcepts = useMemo(
    () =>
      graph.entities
        .filter((entity) => entity.kind !== 'person')
        .map((entity) => ({
          key: entity.key,
          label: entity.label,
          kind: entity.kind,
          codes: codesFor(entity.key),
          primary: primaryCodeFor(entity.key),
          facts: entity.factCount,
        }))
        .sort((a, b) => {
          // Uncoded concepts first: they are the ones a reader can act on.
          const aCoded = a.codes.length > 0 ? 1 : 0;
          const bCoded = b.codes.length > 0 ? 1 : 0;
          return aCoded - bCoded || b.facts - a.facts;
        }),
    [graph],
  );

  const download = (filename: string, contents: string) => {
    const ok = downloadText(filename, contents);
    setDownloadNote(
      ok ? `Downloaded ${filename}.` : 'This environment does not allow a download; the contents are unchanged in the panel.',
    );
  };

  const runImport = () => {
    setImportError(null);
    setImportResult(null);
    try {
      setImportResult(importFhir(importText));
    } catch (error) {
      setImportError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="view-inner">
      <div className="grid grid-4">
        <MetricCard
          label="FHIR resources"
          value={fhir.bundle.total}
          sub={`${Object.keys(fhir.manifest.resourceCounts).length} resource types`}
        />
        <MetricCard
          label="Coded concepts"
          value={`${coverage.coded}/${coverage.total}`}
          sub="LOINC · RxNorm · SNOMED"
        />
        <MetricCard
          label="Redaction policies"
          value={REDACTION_POLICIES.length}
          sub="including date shifting"
        />
        <MetricCard
          label="After redaction"
          value={redacted.graph.facts.length}
          tone={redacted.manifest.counts.factsRemoved > 0 ? 'warn' : 'ok'}
          sub={`${redacted.manifest.counts.factsRemoved} facts removed`}
        />
      </div>

      {downloadNote && (
        <div className="notice" style={{ marginBottom: 14 }}>
          <Icon.Link size={15} />
          <div>{downloadNote}</div>
        </div>
      )}

      <Panel
        title="FHIR R4 export"
        sub="Every clinical resource carries the document and character span it was read from"
        actions={
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              className="btn is-sm"
              onClick={() => {
                void navigator.clipboard?.writeText(fhir.json);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? 'Copied' : 'Copy JSON'}
            </button>
            <button
              type="button"
              className="btn is-sm is-primary"
              onClick={() => download('medical-memory-fhir.json', fhir.json)}
            >
              <Icon.Plus size={12} />
              Download bundle
            </button>
          </div>
        }
      >
        <div className="notice">
          <Icon.Warning size={15} />
          <div>
            <strong>{fhir.manifest.provenanceNote}</strong> That is the difference between an export
            something downstream can audit and one it has to take on faith.
          </div>
        </div>

        <div className="grid grid-2" style={{ marginTop: 14 }}>
          <div>
            <div className="metric-label" style={{ marginBottom: 8 }}>
              Resources produced
            </div>
            <div className="flag-list">
              {Object.entries(fhir.manifest.resourceCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([type, count]) => (
                  <Chip key={type} tone={type === 'Unmapped' ? 'warn' : 'info'}>
                    {type} · {count}
                  </Chip>
                ))}
            </div>
          </div>
          <div>
            <div className="metric-label" style={{ marginBottom: 8 }}>
              Coding coverage
            </div>
            <div className="flag-list">
              {Object.entries(coverage.bySystem).map(([system, count]) => (
                <Chip key={system} tone="external">
                  {system} · {count}
                </Chip>
              ))}
              {coverage.uncodedKeys.length > 0 && (
                <Chip tone="muted">{coverage.uncodedKeys.length} exported as text</Chip>
              )}
            </div>
            <div className="dim" style={{ fontSize: 11, marginTop: 8 }}>
              {coverage.note}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {fhir.manifest.cautions.map((caution, index) => (
            <div key={index} className="conflict-not">
              • {caution}
            </div>
          ))}
        </div>
      </Panel>

      <Panel
        title="Concept coding"
        sub="Every resolved concept, the codes it mapped to, and the ones that stayed text-only"
        actions={
          <Chip tone={coverage.uncodedKeys.length > 0 ? 'warn' : 'ok'}>
            {coverage.coded}/{coverage.total} coded
          </Chip>
        }
      >
        <Notice>
          The mapping is curated and deliberately partial. A concept with no code is left as text
          rather than given a plausible-looking one, because a wrong code propagates into other
          systems as though it had been verified.
        </Notice>

        <div className="code-table" style={{ marginTop: 14 }}>
          {codedConcepts.map((concept) => (
            <div
              className={`code-row${concept.codes.length === 0 ? ' is-uncoded' : ''}`}
              key={concept.key}
            >
              <span className="code-row-label" title={concept.key}>
                {concept.label}
              </span>

              <span className="code-row-codes">
                {concept.codes.length === 0 ? (
                  <span className="code-uncoded">no standard code — exported as text</span>
                ) : (
                  concept.codes.map((code) => (
                    <span className="code-chip" key={`${code.system}-${code.code}`}>
                      <span className="code-chip-system">{code.system}</span>
                      <span className="code-chip-value">{code.code}</span>
                    </span>
                  ))
                )}
              </span>

              <span className="code-row-note">
                {concept.kind} · {concept.facts} fact{concept.facts === 1 ? '' : 's'}
              </span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel
        title="De-identification"
        sub="Produces a new graph and a manifest of exactly what was removed or altered"
        actions={
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {REDACTION_POLICIES.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`chip is-button${policyId === option.id ? ' is-ok' : ' is-muted'}`}
                onClick={() => setPolicyId(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        }
      >
        <div className="notice is-warn">
          <Icon.Warning size={15} />
          <div>
            <strong>{policy.description}</strong>
          </div>
        </div>

        <div className="grid grid-2" style={{ marginTop: 14 }}>
          <div>
            <div className="metric-label" style={{ marginBottom: 8 }}>
              What the policy did
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {redacted.manifest.removed.map((removal, index) => (
                <div key={index} className="conflict-not">
                  <Chip tone="muted">{removal.kind}</Chip> {removal.detail}
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="metric-label" style={{ marginBottom: 8 }}>
              Counts
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="stat-row">
                <span>Facts kept</span>
                <span>{redacted.manifest.counts.factsKept}</span>
              </div>
              <div className="stat-row">
                <span>Facts removed</span>
                <span>{redacted.manifest.counts.factsRemoved}</span>
              </div>
              <div className="stat-row">
                <span>Documents removed</span>
                <span>{redacted.manifest.counts.documentsRemoved}</span>
              </div>
              <div className="stat-row">
                <span>Dates shifted</span>
                <span>{redacted.manifest.counts.documentsDateShifted}</span>
              </div>
              <div className="stat-row">
                <span>Subject name</span>
                <span>{redacted.graph.patient.name}</span>
              </div>
            </div>
            <button
              type="button"
              className="btn is-sm"
              style={{ marginTop: 10 }}
              onClick={() =>
                download(
                  `medical-memory-redacted-${policy.id}.json`,
                  JSON.stringify(
                    {
                      manifest: redacted.manifest,
                      patient: redacted.graph.patient,
                      documents: redacted.graph.documents.map((d) => ({
                        id: d.id,
                        title: d.title,
                        date: d.date,
                        kind: d.kind,
                      })),
                      facts: redacted.graph.facts.map((f) => ({
                        id: f.id,
                        entityKey: f.entityKey,
                        value: f.valueNum,
                        unit: f.unit,
                        status: f.status,
                        occurredAt: f.occurredAt,
                        span: f.span,
                      })),
                    },
                    null,
                    2,
                  ),
                )
              }
            >
              <Icon.Plus size={12} />
              Download redacted record + manifest
            </button>
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <div className="metric-label" style={{ marginBottom: 8 }}>
            Residual risk — stated, not hidden
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {redacted.manifest.residualRisk.map((risk, index) => (
              <div key={index} className="conflict-not">
                • {risk}
              </div>
            ))}
          </div>
        </div>
      </Panel>


      <Panel
        title="Import a FHIR bundle"
        sub="Reads a bundle into a source document so provenance still holds"
        actions={
          <button
            type="button"
            className="btn is-sm is-primary"
            onClick={runImport}
            disabled={!importText.trim()}
          >
            <Icon.Play size={12} />
            Parse bundle
          </button>
        }
      >
        <div className="field">
          <label>Paste a FHIR collection bundle</label>
          <textarea
            value={importText}
            onChange={(event) => setImportText(event.target.value)}
            placeholder='{"resourceType":"Bundle","type":"collection","entry":[...]}'
            style={{ minHeight: 140 }}
          />
        </div>

        {importError && (
          <Notice tone="critical">
            <strong>Could not read that payload.</strong> {importError}
          </Notice>
        )}

        {importResult && (
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="metric-label">What the reader found</div>
            <div className="flag-list">
              {importResult.summary.map((entry) => (
                <Chip key={entry.resourceType} tone={entry.notes.length > 0 ? 'warn' : 'info'}>
                  {entry.resourceType} · {entry.count}
                </Chip>
              ))}
            </div>
            {importResult.warnings.map((warning, index) => (
              <div key={index} className="conflict-not">
                • {warning}
              </div>
            ))}
            <div className="dim" style={{ fontSize: 11 }}>
              The bundle becomes one source document with every resource on its own labelled lines.
              That keeps the provenance invariant intact: facts still point at characters in a
              document, so an import is auditable in the same way as a pasted note.
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}

