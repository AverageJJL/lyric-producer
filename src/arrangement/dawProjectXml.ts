export function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function xmlAttr(name: string, value: string | number | boolean | undefined): string {
  if (value === undefined) {
    return '';
  }
  return ` ${name}="${xmlEscape(String(value))}"`;
}

export function xmlElement(
  name: string,
  attrs: Record<string, string | number | boolean | undefined>,
  children = '',
): string {
  const attrText = Object.entries(attrs)
    .map(([key, value]) => xmlAttr(key, value))
    .join('');
  return children
    ? `<${name}${attrText}>${children}</${name}>`
    : `<${name}${attrText}/>`;
}

export function attrString(element: Element | null, name: string): string | undefined {
  const value = element?.getAttribute(name);
  return value && value.trim() ? value : undefined;
}

export function attrNumber(
  element: Element | null,
  name: string,
  fallback: number,
): number {
  const raw = attrString(element, name);
  const parsed = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function attrBoolean(element: Element | null, name: string): boolean {
  return attrString(element, name) === 'true';
}

export function directChild(element: Element, tagName: string): Element | null {
  return Array.from(element.children).find(child => child.tagName === tagName) ?? null;
}

export function directChildren(element: Element, tagName: string): Element[] {
  return Array.from(element.children).filter(child => child.tagName === tagName);
}

export function parseXml(raw: string): Document | null {
  const parsed = new DOMParser().parseFromString(raw, 'application/xml');
  return parsed.querySelector('parsererror') ? null : parsed;
}
