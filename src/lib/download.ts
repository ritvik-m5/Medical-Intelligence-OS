/**
 * Hand a file to the browser.
 *
 * Guarded because `URL.createObjectURL` is not implemented everywhere, including
 * the DOM the tests run in. A download that cannot happen should say so rather
 * than throw, so the caller gets a boolean and can report it.
 */
export function downloadText(
  filename: string,
  contents: string,
  type = 'application/json',
): boolean {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return false;
  if (typeof URL.createObjectURL !== 'function') return false;

  try {
    const blob = new Blob([contents], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}

/** Copy text to the clipboard, where the environment allows it. */
export async function copyText(contents: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(contents);
      return true;
    }
  } catch {
    /* falls through to the caller's message */
  }
  return false;
}
