/* ------------------------------------------------------------------ */
/* Classification                                                      */
/*                                                                    */
/* The only functions in the control plane that may change a           */
/* computation's status. The gateway emits `unverified` and nothing      */
/* else; these two are the explicit human decisions.                     */
/*                                                                    */
/*     reviewComputation  → status 'reviewed', classification evidence  */
/*     rejectComputation  → status 'reviewed', classification rejected  */
/*                                                                    */
/* Both are pure: they return a new object and never mutate the input,  */
/* so a reviewed computation still carries its original unverified       */
/* history and can be re-derived at any time.                            */
/* ------------------------------------------------------------------ */

import type {
  ExternalComputation,
  ExternalComputationClassification,
} from './types';

export function reviewComputation(
  computation: ExternalComputation,
  note: string,
  at: string = new Date().toISOString(),
): ExternalComputation {
  return classify(computation, { kind: 'evidence', note, at });
}

export function rejectComputation(
  computation: ExternalComputation,
  note: string,
  at: string = new Date().toISOString(),
): ExternalComputation {
  return classify(computation, { kind: 'rejected', note, at });
}

function classify(
  computation: ExternalComputation,
  classification: ExternalComputationClassification,
): ExternalComputation {
  return {
    ...computation,
    status: 'reviewed',
    classification,
  };
}

/**
 * Whether a computation may be used downstream as an external reference.
 *
 * A computation is usable only when a human explicitly marked it `evidence`.
 * Everything else — unverified, rejected, or not yet classified — is not.
 */
export function isUsableAsEvidence(computation: ExternalComputation): boolean {
  return computation.status === 'reviewed' && computation.classification?.kind === 'evidence';
}
