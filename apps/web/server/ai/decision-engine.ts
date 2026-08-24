import type { GraphNode, GraphEdge, Memory } from '@kloyya/db';

/**
 * Decision Engine — The Intelligence Layer of Kloyya
 *
 * This module transforms raw context (graph nodes, edges, memories) into
 * structured, auditable, evidence-based recommendations.
 *
 * Key principles:
 * 1. Every recommendation MUST include reasoning and evidence
 * 2. Confidence scores are mandatory (0.0 to 1.0)
 * 3. Business impact must be explicit (LOW/MEDIUM/HIGH/CRITICAL)
 * 4. Dependencies and risks must be surfaced
 * 5. The AI must explain its logic, not just give answers
 *
 * This is NOT a chatbot. This is a decision support system.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types: Structured Output Schema
// ─────────────────────────────────────────────────────────────────────────────

export type BusinessImpact = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type Priority = 'P0' | 'P1' | 'P2' | 'P3';
export type Urgency = 'IMMEDIATE' | 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'BACKLOG';

export interface Evidence {
  /** Human-readable description of the evidence */
  description: string;
  /** Source system (slack, gmail, jira, etc.) */
  source: string;
  /** External ID in source system (for deep linking) */
  externalId?: string;
  /** Direct URL to the evidence (if available) */
  url?: string;
  /** When did this evidence occur? */
  occurredAt?: string;
  /** How strong is this piece of evidence? (0.0 to 1.0) */
  strength: number;
}

export interface Recommendation {
  /** Unique ID for this recommendation (for tracking/audit) */
  id: string;
  
  /** The actual recommendation (actionable, specific) */
  recommendation: string;
  
  /** Category (e.g., "project_management", "communication", "resource_allocation") */
  category: string;
  
  /** Confidence score (0.0 to 1.0) */
  confidenceScore: number;
  
  /** Business impact assessment */
  businessImpact: BusinessImpact;
  
  /** Priority level */
  priority: Priority;
  
  /** Urgency level */
  urgency: Urgency;
  
  /** Evidence supporting this recommendation */
  evidence: Evidence[];
  
  /** Step-by-step reasoning (the "why") */
  reasoning: string;
  
  /** Detailed reasoning chain (for audit trail) */
  reasoningChain: Array<{
    step: number;
    observation: string;
    inference: string;
  }>;
  
  /** What needs to happen first? (node IDs from graph) */
  dependencies: string[];
  
  /** What could go wrong? */
  risks: Array<{
    description: string;
    likelihood: 'LOW' | 'MEDIUM' | 'HIGH';
    mitigation?: string;
  }>;
  
  /** Expected outcome if recommendation is followed */
  expectedOutcome: string;
  
  /** Alternative recommendations considered but rejected */
  alternatives?: Array<{
    recommendation: string;
    reasonRejected: string;
  }>;
  
  /** Who should take action? (user IDs from graph) */
  assignedTo?: string[];
  
  /** When should this be acted upon? */
  deadline?: string;
  
  /** Graph node IDs that this recommendation relates to */
  relatedNodes: string[];
}

export interface DecisionContext {
  /** The user asking for the recommendation */
  userId: string;
  workspaceId: string;
  organizationId: string;
  
  /** The question or situation being analyzed */
  query: string;
  
  /** Relevant graph nodes (people, projects, docs, etc.) */
  nodes: GraphNode[];
  
  /** Relevant graph edges (relationships) */
  edges: GraphEdge[];
  
  /** Relevant memories (from all layers) */
  memories: Memory[];
  
  /** Current time (for temporal reasoning) */
  currentTime: string;
  
  /** User's role and preferences (for personalization) */
  userProfile?: {
    role: string;
    department?: string;
    preferences?: Record<string, unknown>;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// System Prompt: The Brain
// ─────────────────────────────────────────────────────────────────────────────

export const DECISION_ENGINE_SYSTEM_PROMPT = `You are Kloyya's Decision Engine — an AI system designed to provide structured, evidence-based recommendations for organizational decision-making.

## YOUR ROLE
You are NOT a chatbot. You are a decision support system that analyzes context from an organization's knowledge graph and memory layers to produce actionable, auditable recommendations.

## CORE PRINCIPLES
1. **Evidence-Based**: Every recommendation MUST be grounded in specific evidence from the provided context. Never make claims without citing sources.
2. **Transparent Reasoning**: You MUST explain your logic step-by-step. Show your work.
3. **Confidence Scoring**: Assign a confidence score (0.0 to 1.0) based on the strength and completeness of evidence.
4. **Business Impact**: Assess the business impact (LOW/MEDIUM/HIGH/CRITICAL) of each recommendation.
5. **Risk Awareness**: Surface dependencies and risks explicitly.
6. **Actionable**: Recommendations must be specific, actionable, and assigned to people when possible.

## OUTPUT FORMAT
You MUST respond with a JSON object matching this exact schema:

\`\`\`json
{
  "recommendations": [
    {
      "id": "rec_<uuid>",
      "recommendation": "Clear, actionable recommendation text",
      "category": "project_management|communication|resource_allocation|risk_mitigation|strategic",
      "confidenceScore": 0.85,
      "businessImpact": "LOW|MEDIUM|HIGH|CRITICAL",
      "priority": "P0|P1|P2|P3",
      "urgency": "IMMEDIATE|TODAY|THIS_WEEK|THIS_MONTH|BACKLOG",
      "evidence": [
        {
          "description": "What the evidence shows",
          "source": "slack|gmail|jira|notion|calendar|etc.",
          "externalId": "optional_external_id",
          "url": "optional_direct_link",
          "occurredAt": "ISO 8601 timestamp",
          "strength": 0.9
        }
      ],
      "reasoning": "Clear explanation of why this recommendation makes sense",
      "reasoningChain": [
        {
          "step": 1,
          "observation": "What I observed in the data",
          "inference": "What I inferred from that observation"
        }
      ],
      "dependencies": ["node_id_1", "node_id_2"],
      "risks": [
        {
          "description": "What could go wrong",
          "likelihood": "LOW|MEDIUM|HIGH",
          "mitigation": "How to mitigate this risk"
        }
      ],
      "expectedOutcome": "What should happen if this recommendation is followed",
      "alternatives": [
        {
          "recommendation": "Alternative approach",
          "reasonRejected": "Why this alternative was not chosen"
        }
      ],
      "assignedTo": ["user_id_1"],
      "deadline": "ISO 8601 timestamp or null",
      "relatedNodes": ["node_id_1", "node_id_2"]
    }
  ],
  "summary": "High-level summary of the situation and recommended actions",
  "confidenceInAnalysis": 0.9,
  "missingInformation": ["What information would improve this analysis"]
}
\`\`\`

## REASONING METHODOLOGY
Follow this process for every query:

1. **Context Gathering**: Identify all relevant nodes, edges, and memories from the provided context.
2. **Pattern Recognition**: Look for patterns, bottlenecks, risks, and opportunities.
3. **Hypothesis Formation**: Form hypotheses about what actions would be most valuable.
4. **Evidence Validation**: Validate each hypothesis against specific evidence.
5. **Impact Assessment**: Assess business impact, priority, and urgency.
6. **Risk Analysis**: Identify dependencies and potential risks.
7. **Recommendation Synthesis**: Synthesize findings into structured recommendations.

## CONFIDENCE SCORING GUIDELINES
- **0.9 - 1.0**: Strong evidence, clear pattern, high certainty
- **0.7 - 0.89**: Good evidence, some assumptions, reasonable certainty
- **0.5 - 0.69**: Moderate evidence, significant assumptions, use with caution
- **0.3 - 0.49**: Weak evidence, many assumptions, consider gathering more data
- **0.0 - 0.29**: Insufficient evidence, do not act on this recommendation

## BUSINESS IMPACT ASSESSMENT
- **CRITICAL**: Direct impact on revenue, compliance, or major customer relationships
- **HIGH**: Significant impact on project timelines, team productivity, or strategic goals
- **MEDIUM**: Moderate impact on efficiency, communication, or resource allocation
- **LOW**: Minor impact, nice-to-have improvements

## PRIORITY LEVELS
- **P0**: Must act immediately (blocking, critical)
- **P1**: Act within 24 hours (high priority)
- **P2**: Act within the week (medium priority)
- **P3**: Act when possible (low priority, backlog)

## URGENCY LEVELS
- **IMMEDIATE**: Within the next hour
- **TODAY**: By end of business day
- **THIS_WEEK**: Within 7 days
- **THIS_MONTH**: Within 30 days
- **BACKLOG**: No specific deadline, but important

## IMPORTANT CONSTRAINTS
- NEVER fabricate evidence. If you don't have evidence, say so.
- NEVER make recommendations without explaining your reasoning.
- NEVER assign recommendations to people without evidence they are the right person.
- ALWAYS surface risks and dependencies explicitly.
- ALWAYS provide alternatives when the primary recommendation has significant risks.
- If the context is insufficient, explicitly state what information is missing.

## TONE AND STYLE
- Professional, clear, concise
- Direct and actionable (no hedging unless uncertainty is genuine)
- Respectful of the user's time and intelligence
- Transparent about limitations and assumptions
`;

// ─────────────────────────────────────────────────────────────────────────────
// Prompt Builder: Context → Prompt
// ─────────────────────────────────────────────────────────────────────────────

export function buildDecisionPrompt(context: DecisionContext): string {
  const { query, nodes, edges, memories, currentTime, userProfile } = context;

  // Format nodes for the prompt
  const nodesSummary = nodes
    .map(
      (node) =>
        `- [${node.type}] ${node.name} (ID: ${node.id})\n  Metadata: ${JSON.stringify(node.metadata)}\n  Content: ${node.content?.substring(0, 500) || 'N/A'}`,
    )
    .join('\n');

  // Format edges for the prompt
  const edgesSummary = edges
    .map(
      (edge) =>
        `- ${edge.sourceId} --[${edge.type}]--> ${edge.targetId} (weight: ${edge.weight})`,
    )
    .join('\n');

  // Format memories for the prompt
  const memoriesSummary = memories
    .map(
      (memory) =>
        `- [${memory.layer}] ${memory.title}\n  Content: ${memory.content.substring(0, 500)}\n  Importance: ${memory.importance}`,
    )
    .join('\n');

  return `## CURRENT CONTEXT

**Time**: ${currentTime}
**User**: ${userProfile?.role || 'Unknown'} ${userProfile?.department ? `(${userProfile.department})` : ''}

## QUERY
${query}

## KNOWLEDGE GRAPH NODES (${nodes.length} entities)
${nodesSummary || 'No relevant nodes found.'}

## KNOWLEDGE GRAPH EDGES (${edges.length} relationships)
${edgesSummary || 'No relevant relationships found.'}

## RELEVANT MEMORIES (${memories.length} memories)
${memoriesSummary || 'No relevant memories found.'}

## INSTRUCTIONS
Analyze the context above and provide structured, evidence-based recommendations following the output format specified in the system prompt.

Remember:
- Every recommendation MUST include evidence and reasoning
- Assign confidence scores based on evidence strength
- Surface risks and dependencies explicitly
- If context is insufficient, state what information is missing
`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Usage Example
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Example usage:
 *
 * const context: DecisionContext = {
 *   userId: 'user-123',
 *   workspaceId: 'workspace-456',
 *   organizationId: 'org-789',
 *   query: 'Should we postpone the Project Alpha launch?',
 *   nodes: [...], // Retrieved from graph
 *   edges: [...], // Retrieved from graph
 *   memories: [...], // Retrieved from memory layers
 *   currentTime: new Date().toISOString(),
 *   userProfile: { role: 'Engineering Manager', department: 'Product' },
 * };
 *
 * const prompt = buildDecisionPrompt(context);
 * const response = await aiProvider.complete({
 *   system: DECISION_ENGINE_SYSTEM_PROMPT,
 *   user: prompt,
 *   responseFormat: { type: 'json_object' },
 * });
 *
 * const recommendations = JSON.parse(response) as { recommendations: Recommendation[] };
 */
