import {readdirSync, readFileSync, statSync} from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '..');
const stylesRoot = path.join(repoRoot, 'src', 'web', 'styles');

function collectCssFiles(directory: string): string[] {
  return readdirSync(directory).flatMap(entry => {
    const absolutePath = path.join(directory, entry);
    return statSync(absolutePath).isDirectory()
      ? collectCssFiles(absolutePath)
      : [absolutePath];
  }).filter(filePath => filePath.endsWith('.css'));
}

describe('native-feel CSS guardrails', () => {
  it('keeps web pointer cursors out of app chrome styles', () => {
    const violations = collectCssFiles(stylesRoot).flatMap(filePath => {
      const source = readFileSync(filePath, 'utf8');
      return /cursor:\s*pointer\b/.test(source)
        ? [path.relative(repoRoot, filePath)]
        : [];
    });

    expect(violations).toEqual([]);
  });

  it('keeps a reduced-motion override in the final style layer', () => {
    const source = readFileSync(path.join(stylesRoot, 'reduced-motion.css'), 'utf8');

    expect(source).toContain('@media (prefers-reduced-motion: reduce)');
    expect(source).toContain('transition-duration: 0.01ms !important');
    expect(source).toContain('scroll-behavior: auto !important');
  });

  it('keeps selected timeline blocks from changing layout width', () => {
    const source = readFileSync(path.join(stylesRoot, 'timeline.css'), 'utf8');
    const selectedRules = source.match(/\.timeline-block(?:-overlay)?\.selected[^{]*\{[^}]*\}/g) ?? [];

    expect(selectedRules.length).toBeGreaterThan(0);
    expect(selectedRules.join('\n')).not.toMatch(/\bborder\s*:/);
  });

  it('keeps macOS traffic lights on a separate drag strip above transport controls', () => {
    const source = readFileSync(path.join(stylesRoot, 'native-surface.css'), 'utf8');

    expect(source).toContain('--mac-titlebar-height: 38px');
    expect(source).toContain("html[data-platform='darwin'] .app-shell");
    expect(source).toContain('padding-top: var(--mac-titlebar-height)');
    expect(source).toContain("html[data-platform='darwin'] .app-shell::before");
    expect(source).toContain('height: var(--mac-titlebar-height)');
    expect(source).not.toContain("html[data-platform='darwin'] .transport-bar-leading");
  });
});
