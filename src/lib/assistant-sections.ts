export function splitSectionItem(value: string): string[] {
  const base = value.trim().replace(/\s+/g, ' ');
  const chunks = base
    .split(/\r?\n+/)
    .flatMap((line) => line.split(/\s*;\s+/))
    .flatMap((line) => line.split(/\s*·\s*/))
    .flatMap((line) => line.split(/(?<=[.!?])\s+(?=[A-Z0-9])/))
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  if (chunks.length > 1) return chunks.filter((chunk) => chunk.length > 0).slice(0, 12);
  const words = base.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= 110) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = word;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [base];
}

export function normalizeSectionTitle(title: string): string {
  return title.trim().slice(0, 60) || 'Details';
}
