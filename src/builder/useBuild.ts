import { useCallback, useRef, useState } from 'react';
import type { BuildArtifact, BuildBackend, BuildRequest, BuildState, BuildStep } from './types';
import { EMPTY_BUILD_STATE } from './types';

/**
 * Drive a build backend from React.
 *
 * The hook knows nothing about how a build is produced. It starts one, appends
 * the steps it reports, and stores the artifact. Replacing the backend with a
 * server-side implementation is a one-line change at the call site.
 */
export function useBuild(backend: BuildBackend) {
  const [state, setState] = useState<BuildState>(EMPTY_BUILD_STATE);
  /** Guards against a stale run writing into a newer one's state. */
  const runIdRef = useRef(0);

  const run = useCallback(
    async (request: BuildRequest): Promise<BuildArtifact | null> => {
      const runId = runIdRef.current + 1;
      runIdRef.current = runId;

      setState({
        ...EMPTY_BUILD_STATE,
        stage: 'planning',
        plan: backend.plan(request),
        startedAt: Date.now(),
      });

      const isCurrent = () => runIdRef.current === runId;

      try {
        const artifact = await backend.run(request, (step: BuildStep) => {
          if (!isCurrent()) return;
          setState((prev) => ({
            ...prev,
            stage: step.stage,
            progress: step.progress,
            steps: [...prev.steps, step],
          }));
        });

        if (!isCurrent()) return artifact;
        setState((prev) => ({ ...prev, stage: 'ready', progress: 1, artifact, error: null }));
        return artifact;
      } catch (error) {
        if (!isCurrent()) return null;
        const message = error instanceof Error ? error.message : String(error);
        setState((prev) => ({ ...prev, stage: 'error', error: message }));
        return null;
      }
    },
    [backend],
  );

  const reset = useCallback(() => {
    runIdRef.current += 1;
    setState(EMPTY_BUILD_STATE);
  }, []);

  /**
   * Adopt an artifact produced elsewhere.
   *
   * Used when a saved run is opened: the registry panel has already re-derived it
   * from its stored corpus, so running the pipeline again would be duplicated
   * work. The adopted artifact is the same object the preview reads, so nothing
   * downstream can tell how it arrived — and it carries its own identity, so
   * opening a run cannot silently present a different result as the saved one.
   */
  const adopt = useCallback((artifact: BuildArtifact) => {
    runIdRef.current += 1;
    setState({ ...EMPTY_BUILD_STATE, stage: 'ready', progress: 1, artifact, error: null });
  }, []);

  return { ...state, run, reset, adopt };
}
