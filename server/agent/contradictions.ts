import type { Evidence } from './types';

export type Contradiction = {
  claimA: Evidence;
  claimB: Evidence;
  reason: string;
};

export function detectContradictions(
  evidence: Evidence[],
): Contradiction[] {
  const contradictions: Contradiction[] = [];

  for (let i = 0; i < evidence.length; i++) {
    for (let j = i + 1; j < evidence.length; j++) {
      const a = evidence[i];
      const b = evidence[j];

      if (
        a.metadata?.entityId &&
        a.metadata.entityId === b.metadata?.entityId &&
        a.metadata?.value !== undefined &&
        b.metadata?.value !== undefined &&
        a.metadata.value !== b.metadata.value
      ) {
        contradictions.push({
          claimA: a,
          claimB: b,
          reason: 'The sources provide different values for the same entity.',
        });
      }
    }
  }

  return contradictions;
}
