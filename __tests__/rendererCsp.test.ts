import {readFileSync} from 'node:fs';
import path from 'node:path';

function rendererCsp(): string {
  const html = readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const match = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/);
  return match?.[1] ?? '';
}

describe('renderer content security policy', () => {
  it('allows scoped album art hosts without opening all remote images', () => {
    const csp = rendererCsp();

    expect(csp).toContain("img-src 'self' data: https://s.mxmcdn.net https://*.mzstatic.com");
    expect(csp).not.toContain('img-src https:');
    expect(csp).not.toContain('img-src *');
  });
});
