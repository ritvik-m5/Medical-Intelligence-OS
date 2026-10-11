import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/*
 * Read the stylesheets from disk rather than importing them. Vite would hand a
 * CSS import to the bundler and vitest stubs CSS to an empty module, so an
 * import would make every assertion below pass against nothing.
 */
const read = (name: string) =>
  readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8');

const layoutCss = read('./layout.css');
const builderCss = read('./builder.css');
const platformCss = read('./platform.css');
const baseCss = read('./base.css');
const componentsCss = read('./components.css');
const scrubberCss = read('./scrubber.css');

/* Layout contract.
 *
 * jsdom has no layout engine, so a rendered test cannot tell whether a page
 * scrolls. These assertions read the stylesheets instead and check the scroll
 * chain is declared correctly.
 *
 * This matters more than it looks. A grid item defaults to `min-height: auto`,
 * which means it will not shrink below its content: the element meant to be the
 * scroll container grows to fit instead, spills past `body { overflow: hidden }`,
 * and the content becomes permanently unreachable. The page then looks broken
 * while every component test still passes, because the DOM is exactly right.
 */

/** Pull one rule's body out of a stylesheet by selector. */
function ruleBody(css: string, selector: string): string | null {
  // Strip comments first, or a rule preceded by one never matches.
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = stripped.match(new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm'));
  return match ? match[1] : null;
}

describe('the page can scroll', () => {
  it('has the stylesheets to inspect at all', () => {
    // If `?raw` imports stop working, every assertion below would silently
    // "pass" against an empty string, so this is checked first.
    expect(typeof layoutCss).toBe('string');
    expect(layoutCss.length).toBeGreaterThan(1000);
    expect(layoutCss).toContain('.view');
    expect(builderCss).toContain('.view--builder');
    expect(platformCss).toContain('.proof-scroll');
  });

  it('gives the viewport chain a definite height', () => {
    const root = ruleBody(layoutCss, 'html,\nbody,\n#root') ?? ruleBody(layoutCss, '#root');
    expect(root).not.toBeNull();
    expect(root).toContain('height: 100%');
    // And a dynamic-viewport variant, so mobile chrome cannot hide the last row.
    expect(layoutCss).toContain('100dvh');
  });

  it('lets every grid item in the chain shrink', () => {
    // Without these, the scroll container grows instead of scrolling.
    expect(ruleBody(layoutCss, '.shell')).toContain('min-height: 0');
    expect(ruleBody(layoutCss, '.main')).toContain('min-height: 0');
    expect(ruleBody(layoutCss, '.view')).toContain('min-height: 0');
    expect(ruleBody(builderCss, '.view--builder')).toContain('min-height: 0');
  });

  it('makes the view the scroll container', () => {
    expect(ruleBody(layoutCss, '.view')).toContain('overflow-y: auto');
    expect(ruleBody(builderCss, '.view--builder')).toContain('overflow-y: auto');
  });

  it('never hides overflow on the scroll container', () => {
    // `overflow: hidden` here would clip the page with no way to reach the rest.
    expect(ruleBody(layoutCss, '.view')).not.toContain('overflow: hidden');
    expect(ruleBody(layoutCss, '.main')).not.toContain('overflow: hidden');
    expect(ruleBody(builderCss, '.view--builder')).not.toContain('overflow: hidden');
  });

  it('clips the body, which is what makes the fixed shell work', () => {
    expect(ruleBody(baseCss, 'body')).toContain('overflow: hidden');
  });

  it('keeps a wide proof graph scrollable in both directions', () => {
    // Hiding the vertical overflow here would make a tall proof unreachable.
    const proofScroll = ruleBody(platformCss, '.proof-scroll');
    expect(proofScroll).toContain('overflow-x: auto');
    expect(proofScroll).toContain('overflow-y: auto');
    expect(proofScroll).not.toContain('overflow-y: hidden');
  });

  it('contains scroll chaining so the page behind does not move', () => {
    expect(ruleBody(layoutCss, '.view')).toContain('overscroll-behavior: contain');
    expect(ruleBody(builderCss, '.view--builder')).toContain('overscroll-behavior: contain');
  });
});

describe('the layout is ratio-locked across devices', () => {
  it('prevents the browser from inflating text on rotation or zoom', () => {
    // Without this, iOS inflates font size on rotate and the "locked" ratio
    // breaks the moment the phone turns sideways.
    expect(baseCss).toContain('-webkit-text-size-adjust: 100%');
    expect(baseCss).toContain('text-size-adjust: 100%');
  });

  it('scales the root font fluidly between phone and monitor', () => {
    expect(baseCss).toMatch(/font-size:\s*clamp\(/);
  });

  it('turns the sidebar into an off-canvas drawer below 1024px', () => {
    // The sidebar must be fixed and translated off-screen, not merely squished
    // beside a too-narrow main column.
    expect(layoutCss).toContain('.shell.nav-open .sidebar');
    const maxWidth = /@media \(max-width: 1023\.98px\)\s*\{[\s\S]*?\.sidebar\s*\{([^}]*)\}/;
    const body = layoutCss.match(maxWidth)?.[1] ?? '';
    expect(body).toContain('position: fixed');
    expect(body).toContain('translateX(-102%)');
  });

  it('shows a nav toggle and backdrop only on small screens', () => {
    expect(ruleBody(layoutCss, '.nav-toggle')).toContain('display: none');
    expect(ruleBody(layoutCss, '.nav-backdrop')).toContain('display: none');
    // And reveals them inside the small-screen media query.
    expect(layoutCss).toMatch(/\.nav-toggle\s*\{\s*display: inline-flex/);
    expect(layoutCss).toContain('.shell.nav-open .nav-backdrop');
  });

  it('collapses every grid to a single column on a phone', () => {
    // At 640px the four grid classes must all drop to one column, otherwise a
    // phone shows a five-across strip of unreadable cards.
    const phoneRule = componentsCss.match(
      /@media \(max-width: 639\.98px\)\s*\{([\s\S]*?)\}/,
    )?.[1];
    expect(phoneRule).toContain('.grid-2');
    expect(phoneRule).toContain('.grid-3');
    expect(phoneRule).toContain('.grid-4');
    expect(phoneRule).toContain('.grid-5');
    expect(phoneRule).toContain('minmax(0, 1fr)');
  });

  it('stacks the scrubber instead of overflowing on a phone', () => {
    expect(scrubberCss).toMatch(/@media \(max-width: 639\.98px\)/);
    const phone = scrubberCss.slice(scrubberCss.indexOf('@media (max-width: 639.98px)'));
    // The meta line wraps and the tools take the full row. The track is not
    // locked into a side column beside the buttons.
    expect(phone).toContain('flex-wrap: wrap');
    expect(phone).toContain('width: 100%');
    expect(ruleBody(scrubberCss, '.scrubber-track')).toContain('width: 100%');
    expect(ruleBody(scrubberCss, '.scrubber')).not.toContain('grid-template-columns');
  });
});
