export type AgentIntent =
  | 'question'
  | 'research'
  | 'summarize'
  | 'decision'
  | 'action'
  | 'planning'
  | 'briefing';

export type EvidenceType =
  | 'email'
  | 'message'
  | 'document'
  | 'calendar_event'
  | 'crm_record'
  | 'web'
  | 'database'
  | 'user_input';

export type Evidence = {
  id: string;
  type: EvidenceType;
  source: string;
  title: string;
  content: string;
  url?: string;
  externalId?: string;
  fetchedAt?: string;
  confidence?: number;
  metadata?: Record<string, unknown>;
};

export type ToolCapability = {
  id: string;
  description: string;
  readOnly: boolean;
  requiresApproval: boolean;
};

export type AgentTool = {
  id: string;
  name: string;
  description: string;
  capabilities: ToolCapability[];
  available: boolean;
};

export type DecisionOption = {
  id: string;
  label: string;
  advantages: string[];
  disadvantages: string[];
  risks: string[];
};

export type AgentDecision = {
  decision: string;
  confidence: number;

  facts: Evidence[];

  assumptions: string[];

  contradictions: Array<{
    claimA: string;
    claimB: string;
    sources: string[];
  }>;

  options: DecisionOption[];

  risks: string[];

  recommendation: string;

  nextActions: Array<{
    label: string;
    tool?: string;
    requiresApproval: boolean;
  }>;

  requiresHumanApproval: boolean;
};

export type AgentRun = {
  id: string;
  workspaceId: string;
  intent: AgentIntent;

  userMessage: string;

  toolsConsidered: AgentTool[];
  toolsUsed: string[];

  evidence: Evidence[];

  decision?: AgentDecision;

  status:
    | 'planning'
    | 'reading'
    | 'analyzing'
    | 'deciding'
    | 'waiting_approval'
    | 'completed'
    | 'failed';
};
