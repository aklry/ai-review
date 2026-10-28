import type { Evidence, EvidenceSource } from '@interview-assistant/contracts';

export function validateEvidence(
  evidence: Evidence[],
  sources: Partial<Record<EvidenceSource, string | string[]>>,
): void {
  for (const item of evidence) {
    const source = sources[item.source];
    const texts = typeof source === 'string' ? [source] : (source ?? []);
    if (!texts.some((text) => normalize(text).includes(normalize(item.quote)))) {
      throw new Error(`Ungrounded evidence quote from ${item.source}`);
    }
  }
}

// Compare decoded facts, rather than their JSON-escaped representation. Keep
// fields separate so a quotation cannot be fabricated by spanning two facts.
export function evidenceStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(evidenceStrings);
  if (value !== null && typeof value === 'object')
    return Object.values(value).flatMap(evidenceStrings);
  return [];
}

function normalize(text: string): string {
  return text.normalize('NFKC').replace(/\s+/g, ' ').trim();
}
