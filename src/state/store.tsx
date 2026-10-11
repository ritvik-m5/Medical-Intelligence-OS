import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Answer, ChangeEvent, Contradiction, HealthGraph, ISODate, Patient, Snapshot } from '../engine/types';
import type { AuditEntry, Derivation, QualityReport } from '../engine/derive/types';
import { ingestDocument, type DocumentInput, type IngestResult } from '../engine/ingest';
import { buildGraph } from '../engine/graph';
import { derivePatientFromCorpus } from '../engine/patient/derive';
import { diffSnapshots, snapshotAt } from '../engine/timeline';
import { findContradictions, qualityFlags, type Draft } from '../engine/contradiction';
import { filterContradictionsAsOf, filterQualityFlagsAsOf } from '../engine/temporal/eligibility';
import { ask } from '../engine/query';
import { generateQuestions, applyStatuses, type QuestionStatus, type RecordQuestion } from '../engine/questions';
import type { AIContext } from '../ai/context';
import { derive, ruleHealth, RULE_REGISTRY, type RuleHealth } from '../engine/derive/engine';
import { addDays } from '../engine/text/normalize';
import type { CohortEntry } from '../data/cohortIndex';
import { assessQuality } from '../engine/platform/quality';
import { AuditLog, LocalStorageAuditStore } from '../engine/platform/audit';
import { engineStatus, type EngineStatus } from '../lib/engineStatus';
import {
  LocalStorageBackend,
  clearRecord,
  loadRecord,
  saveRecord,
  type LoadResult,
} from '../engine/platform/persistence';

export type ViewId =
  | 'guide'
  | 'home'
  | 'whatis'
  | 'reset'
  | 'builder'
  | 'chat'
  | 'overview'
  | 'timemachine'
  | 'temporal'
  | 'graph'
  | 'records'
  | 'debugger'
  | 'inference'
  | 'measurements'
  | 'quality'
  | 'cohort'
  | 'interop'
  | 'research'
  | 'lab'
  | 'ask';

export interface EvidenceRequest {
  title: string;
  subtitle?: string;
  factIds: string[];
  docId?: string;
}

/**
 * How deeply to explain. The engine is identical at every depth; only the
 * presentation changes. This is a user preference, never a change to the
 * underlying facts, proofs or conclusions.
 */
export type ExplainDepth = 'simple' | 'plain' | 'technical';

export const EXPLAIN_DEPTH_LABEL: Record<ExplainDepth, string> = {
  simple: 'Explain like I\u2019m 10',
  plain: 'Plain English',
  technical: 'Technical detail',
};

export interface AskTurn {
  id: string;
  question: string;
  answer: Answer | null;
  error?: string;
}

export interface ProofRequest {
  derivationId: string;
}

interface StoreValue {
  graph: HealthGraph;
  documents: DocumentInput[];
  userDocumentCount: number;
  /** True once the reader has imported at least one document. Gates the workspace. */
  hasRecord: boolean;
  asOf: ISODate;
  view: ViewId;
  evidence: EvidenceRequest | null;
  proof: ProofRequest | null;
  focusDocId: string | null;
  snapshot: Snapshot;
  contradictions: Contradiction[];
  qualityFlags: Draft[];
  changes: ChangeEvent[];
  derivations: Derivation[];
  questions: RecordQuestion[];
  setQuestionStatus: (id: string, status: QuestionStatus) => void;
  ruleHealthReport: RuleHealth[];
  quality: QualityReport;
  cohort: CohortEntry[];
  engine: EngineStatus;
  audit: AuditEntry[];
  turns: AskTurn[];
  paletteOpen: boolean;
  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
  explainDepth: ExplainDepth;
  setExplainDepth: (depth: ExplainDepth) => void;
  aiContext: AIContext | null;
  /** The contexts the reader came from, so "back" is possible. */
  contextStack: AIContext[];
  /** One-shot question seed when opening Research Mode from another view. */
  researchSeed: string | null;
  askAbout: (context: AIContext) => void;
  researchAbout: (context: AIContext | null, question?: string) => void;
  clearResearchSeed: () => void;
  clearAIContext: () => void;
  backToPreviousContext: () => void;
  setView: (view: ViewId) => void;
  setAsOf: (date: ISODate) => void;
  openEvidence: (request: EvidenceRequest) => void;
  closeEvidence: () => void;
  openProof: (derivationId: string) => void;
  closeProof: () => void;
  setFocusDoc: (docId: string | null) => void;
  ingest: (input: DocumentInput) => void;
  resetCorpus: () => void;
  askQuestion: (question: string) => void;
  clearTurns: () => void;
  setPaletteOpen: (open: boolean) => void;
  lastIngest: IngestResult | null;
  /** The audit log serialised for export, schema and all. */
  exportAudit: () => string;
  /** Remove every entry from the audit log. */
  clearAudit: () => void;
  /** Where the imported documents are kept between sessions. */
  storage: {
    available: boolean;
    /** ISO timestamp of the last successful save, or null. */
    savedAt: string | null;
    /** The last thing storage had to say, including refusals. */
    message: string;
    /** What happened when this session tried to restore. */
    restoreStatus: LoadResult['status'];
    forget: () => void;
  };
}

const StoreContext = createContext<StoreValue | null>(null);

/**
 * The patient the graph holds before any document has been imported.
 *
 * There is deliberately no built-in record: the workspace stays empty until the
 * reader drops their own documents in. The name is filled in once the record
 * exists; until then the interface shows a neutral "Your record".
 */
const EMPTY_PATIENT: Patient = {
  id: 'local-record',
  name: '',
  synthetic: false,
};

const auditLog = new AuditLog(new LocalStorageAuditStore());

export function StoreProvider({ children }: { children: ReactNode }) {
  const [userInputs, setUserInputs] = useState<DocumentInput[]>([]);
  const [asOf, setAsOf] = useState<ISODate>('');
  const [view, setView] = useState<ViewId>('home');
  const [evidence, setEvidence] = useState<EvidenceRequest | null>(null);
  const [proof, setProof] = useState<ProofRequest | null>(null);
  const [focusDocId, setFocusDocId] = useState<string | null>(null);
  const [turns, setTurns] = useState<AskTurn[]>([]);
  const [lastIngest, setLastIngest] = useState<IngestResult | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [auditVersion, setAuditVersion] = useState(0);
  const [questionStatuses, setQuestionStatuses] = useState<Record<string, QuestionStatus>>({});
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [explainDepth, setExplainDepthState] = useState<ExplainDepth>(() => {
    try {
      const saved = localStorage.getItem('medical-memory.explainDepth.v1');
      return saved === 'simple' || saved === 'plain' || saved === 'technical' ? saved : 'plain';
    } catch {
      return 'plain';
    }
  });
  const [aiContext, setAIContext] = useState<AIContext | null>(null);
  const [contextStack, setContextStack] = useState<AIContext[]>([]);
  const [researchSeed, setResearchSeed] = useState<string | null>(null);

  const storage = useMemo(() => new LocalStorageBackend(), []);
  const [restored, setRestored] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [storageMessage, setStorageMessage] = useState('Nothing saved yet.');
  const [restoreStatus, setRestoreStatus] = useState<LoadResult['status']>('empty');

  const forget = useCallback(() => {
    clearRecord(storage);
    setSavedAt(null);
    setStorageMessage('The saved record was removed from this browser.');
    auditLog.record('reset', 'Removed the locally saved record');
    setAuditVersion((v) => v + 1);
  }, [storage]);

  const exportAudit = useCallback(() => auditLog.toJSON(), []);

  const clearAudit = useCallback(() => {
    auditLog.clear();
    setAuditVersion((v) => v + 1);
  }, []);

  /**
   * The graph is rebuilt from the corpus on every change. Ingesting is fast
   * enough for a record this size that a single derived graph is simpler and less
   * error-prone than incremental updates — and it guarantees the indexes and the
   * provenance stay consistent.
   */
  const graph = useMemo(() => {
    const results = userInputs
      .map((input, index) => ingestDocument(input, 1000 + index))
      .sort((a, b) => a.document.date.localeCompare(b.document.date));
    const patient = derivePatientFromCorpus(EMPTY_PATIENT, results);
    return buildGraph(patient, results);
  }, [userInputs]);

  const effectiveAsOf = asOf === '' ? graph.stats.spanEnd : asOf;

  /* ---------------- Local persistence ---------------- */

  /**
   * Restore the imported documents on first mount.
   *
   * The stored form is the corpus, not the graph, so the graph is re-derived from
   * it and cannot drift from its inputs. A version mismatch or corruption is
   * reported rather than swallowed, because silently loading a record the build
   * does not understand is how a platform loses someone's data.
   */
  useEffect(() => {
    const result = loadRecord(storage);
    setRestoreStatus(result.status);
    setStorageMessage(result.message);
    if (result.status === 'loaded' && result.record) {
      setUserInputs(result.record.documents as DocumentInput[]);
      setSavedAt(result.record.savedAt);
    }
    setRestored(true);
  }, [storage]);

  /**
   * Keep the saved record in step with what was imported.
   *
   * Gated on the restore having run, so an empty first render cannot wipe a
   * record that is about to be loaded.
   */
  useEffect(() => {
    if (!restored) return;
    if (userInputs.length === 0) {
      clearRecord(storage);
      setSavedAt(null);
      return;
    }
    const result = saveRecord(storage, graph, userInputs);
    if (result.ok) setSavedAt(new Date().toISOString());
    setStorageMessage(result.message);
  }, [restored, userInputs, graph, storage]);

  const snapshot = useMemo(() => snapshotAt(graph, effectiveAsOf), [graph, effectiveAsOf]);
  const contradictions = useMemo(
    () => filterContradictionsAsOf(findContradictions(graph), graph, effectiveAsOf),
    [graph, effectiveAsOf],
  );
  const qualityFlagsMemo = useMemo(
    () => filterQualityFlagsAsOf(qualityFlags(graph), effectiveAsOf),
    [graph, effectiveAsOf],
  );

  /**
   * The inference engine runs once per graph change and is the single source of
   * every derived claim in the interface. Views filter it; none of them compute
   * their own findings.
   */
  const derivations = useMemo(() => derive(graph, effectiveAsOf), [graph, effectiveAsOf]);
  const ruleHealthReport = useMemo(() => ruleHealth(graph, effectiveAsOf), [graph, effectiveAsOf]);

  const quality = useMemo(
    () => assessQuality({ graph, derivations, asOf: effectiveAsOf }),
    [graph, derivations, effectiveAsOf],
  );

  const cohort = useMemo<CohortEntry[]>(() => {
    if (userInputs.length === 0) return [];
    return [
      {
        id: graph.patient.id,
        label: graph.patient.name || 'Your record',
        graph,
        documents: userInputs,
      },
    ];
  }, [graph, userInputs]);

  /**
   * The engine status the pill reports, including a live provenance verdict.
   *
   * Computed here rather than in the pill so it runs once per graph change
   * instead of once per render, and so the verdict is available to every view
   * that wants to make a claim about the record.
   */
  const engine = useMemo(
    () =>
      engineStatus({
        record: graph.patient.name || 'Your record',
        origin: 'workspace',
        graph,
        derivations,
        // The corpus as imported, not as ingested: the identity is a name for
        // the record, and the record is what the reader supplied.
        documents: userInputs,
        rulesEvaluated: RULE_REGISTRY.length,
      }),
    [graph, derivations, userInputs],
  );

  const changes = useMemo(() => {
    const start = addDays(effectiveAsOf, -366);
    return diffSnapshots(snapshotAt(graph, start), snapshotAt(graph, effectiveAsOf));
  }, [graph, effectiveAsOf]);

  /**
   * The questions this record raises but cannot answer.
   *
   * Generated deterministically from the contradictions, derivations and
   * changes, then overlaid with whatever statuses the reader has set. The
   * generation never reads a status, so the two cannot corrupt each other.
   */
  const questions = useMemo(
    () =>
      applyStatuses(
        generateQuestions({ contradictions, derivations, changes }),
        questionStatuses,
      ),
    [contradictions, derivations, changes, questionStatuses],
  );

  const setQuestionStatus = useCallback((id: string, status: QuestionStatus) => {
    setQuestionStatuses((previous) => ({ ...previous, [id]: status }));
  }, []);

  const setExplainDepth = useCallback((depth: ExplainDepth) => {
    setExplainDepthState(depth);
    try {
      localStorage.setItem('medical-memory.explainDepth.v1', depth);
    } catch {
      // Preference persistence is best-effort; the in-memory value still applies.
    }
  }, []);

  /**
   * The single supported way to hand an object to the AI.
   *
   * It pushes the current context onto a small stack (so "back" is possible),
   * sets the new context, and navigates to the chat. Validation happens in the
   * chat view, which refuses to silently substitute a stale object.
   */
  const askAbout = useCallback((context: AIContext) => {
    setContextStack((prev) => (aiContext ? [...prev.slice(-8), aiContext] : prev));
    setAIContext(context);
    setView('chat');
    setEvidence(null);
    setProof(null);
    setMobileNavOpen(false);
  }, [aiContext]);

  const researchAbout = useCallback(
    (context: AIContext | null, question?: string) => {
      if (context) {
        setContextStack((prev) => (aiContext ? [...prev.slice(-8), aiContext] : prev));
        setAIContext(context);
      }
      setResearchSeed(question ?? (context ? `What does the record establish about ${context.title}?` : ''));
      setView('research');
      setEvidence(null);
      setProof(null);
      setMobileNavOpen(false);
    },
    [aiContext],
  );

  const clearResearchSeed = useCallback(() => setResearchSeed(null), []);

  const clearAIContext = useCallback(() => setAIContext(null), []);

  const backToPreviousContext = useCallback(() => {
    setContextStack((prev) => {
      const previous = prev[prev.length - 1];
      if (previous) setAIContext(previous);
      return prev.slice(0, -1);
    });
  }, []);

  const openEvidence = useCallback((request: EvidenceRequest) => {
    setEvidence(request);
    setProof(null);
    if (request.docId) setFocusDocId(request.docId);
    auditLog.record('view', `Opened evidence: ${request.title}`, {
      factIds: request.factIds,
      docIds: request.docId ? [request.docId] : [],
    });
    setAuditVersion((v) => v + 1);
  }, []);

  const closeEvidence = useCallback(() => setEvidence(null), []);

  const openProof = useCallback((derivationId: string) => {
    setProof({ derivationId });
    setEvidence(null);
    auditLog.record('view', `Opened proof for ${derivationId}`);
    setAuditVersion((v) => v + 1);
  }, []);

  const closeProof = useCallback(() => setProof(null), []);

  const ingest = useCallback((input: DocumentInput) => {
    const result = ingestDocument(input, 1000 + Math.floor(Math.random() * 100000));
    setLastIngest(result);
    setUserInputs((prev) => [...prev, input]);
    setAsOf('');
    auditLog.record('ingest', `Imported "${input.title}"`, {
      docIds: [result.document.id],
      detail: `${result.facts.length} facts extracted; text quality ${result.document.quality.toFixed(2)}.`,
    });
    setAuditVersion((v) => v + 1);
  }, []);

  const resetCorpus = useCallback(() => {
    setUserInputs([]);
    setLastIngest(null);
    setTurns([]);
    setEvidence(null);
    setProof(null);
    setFocusDocId(null);
    setAsOf('');
    auditLog.record('reset', 'Cleared the imported record');
    setAuditVersion((v) => v + 1);
  }, []);

  const askQuestion = useCallback(
    (question: string) => {
      const trimmed = question.trim();
      if (!trimmed) return;
      try {
        const answer = ask(graph, trimmed, { asOf: effectiveAsOf });
        setTurns((prev) => [
          { id: `turn_${prev.length}_${Date.now().toString(36)}`, question: trimmed, answer },
          ...prev,
        ]);
        auditLog.record('query', trimmed, {
          factIds: answer.citations.map((c) => c.factId ?? ''),
        });
      } catch (error) {
        setTurns((prev) => [
          {
            id: `turn_err_${prev.length}`,
            question: trimmed,
            answer: null,
            error: error instanceof Error ? error.message : String(error),
          },
          ...prev,
        ]);
      }
      setAuditVersion((v) => v + 1);
    },
    [graph, effectiveAsOf],
  );

  const clearTurns = useCallback(() => setTurns([]), []);

  const audit = useMemo(() => auditLog.all(), [auditVersion]);

  const value: StoreValue = {
    graph,
    documents: userInputs,
    userDocumentCount: userInputs.length,
    hasRecord: userInputs.length > 0,
    asOf: effectiveAsOf,
    view,
    evidence,
    proof,
    focusDocId,
    snapshot,
    contradictions,
    qualityFlags: qualityFlagsMemo,
    changes,
    derivations,
    questions,
    setQuestionStatus,
    ruleHealthReport,
    quality,
    engine,
    storage: {
      available: storage.available(),
      savedAt,
      message: storageMessage,
      restoreStatus,
      forget,
    },
    exportAudit,
    clearAudit,
    cohort,
    audit,
    turns,
    paletteOpen,
    mobileNavOpen,
    setMobileNavOpen,
    explainDepth,
    setExplainDepth,
    aiContext,
    contextStack,
    researchSeed,
    askAbout,
    researchAbout,
    clearResearchSeed,
    clearAIContext,
    backToPreviousContext,
    setView: (next: ViewId) => {
      setView(next);
      setEvidence(null);
      setProof(null);
      setMobileNavOpen(false);
    },
    setAsOf: (date: ISODate) => setAsOf(date),
    openEvidence,
    closeEvidence,
    openProof,
    closeProof,
    setFocusDoc: setFocusDocId,
    ingest,
    resetCorpus,
    askQuestion,
    clearTurns,
    setPaletteOpen,
    lastIngest,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useStore must be used inside StoreProvider');
  return value;
}
