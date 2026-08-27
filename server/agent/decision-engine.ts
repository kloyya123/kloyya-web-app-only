import type {
  AgentDecision,
  Evidence,
} from './types';

export function buildDecision(
  question: string,
  evidence: Evidence[],
  contradictions: Array<{
    claimA: string;
    claimB: string;
    sources: string[];
  }>,
  recommendation: string,
): AgentDecision {
  const missingInformation = evidence.length === 0;

  const confidence = missingInformation
    ? 0.1
    : Math.max(
        0.1,
        Math.min(
          0.98,
          0.55 +
            Math.min(evidence.length, 8) * 0.05 -
            contradictions.length * 0.1,
        ),
      );

  return {
    decision: recommendation,
    confidence,
    facts: evidence,
    assumptions: [],
    contradictions,
    options: [],
    risks: [],
    recommendation,
    nextActions: [],
    requiresHumanApproval: true,
  };
}
