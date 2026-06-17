function sanitizeFileBaseName(name: string): string {
  return Array.from(name, char => {
    const code = char.charCodeAt(0);
    return code < 32 || '<>:"/\\|?*'.includes(char) ? '-' : char;
  }).join('');
}

export function safeExportFileName(name: string, fallback: string): string {
  const cleaned = sanitizeFileBaseName(name).replace(/\s+/g, ' ').trim();
  return cleaned.length > 0 && cleaned !== '.' && cleaned !== '..'
    ? `${cleaned}.wav`
    : `${fallback}.wav`;
}
