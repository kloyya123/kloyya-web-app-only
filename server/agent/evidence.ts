import type { Evidence } from './types';

export function normalizeEvidence(
  items: Evidence[],
): Evidence[] {
  return items
    .filter((item) => item.content.trim().length > 0)
    .map((item) => ({
      ...item,
      content: item.content.trim(),
      confidence: item.confidence ?? 1,
    }));
}

export function deduplicateEvidence(
  items: Evidence[],
): Evidence[] {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key =
      item.externalId ??
      `${item.source}:${item.title}:${item.content}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}
