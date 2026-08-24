/**
 * Unified Event Schema — The Universal Language of Kloyya
 *
 * Every connector (Gmail, Slack, Jira, etc.) must normalize its data into
 * this universal format before ingesting into the knowledge graph.
 */

export type UnifiedEventType =
  | 'message'
  | 'document'
  | 'meeting'
  | 'task'
  | 'decision'
  | 'relationship'
  | 'status_change'
  | 'mention'
  | 'reaction'
  | 'attachment'
  | 'integration_event';

export interface UnifiedActor {
  id: string;
  name: string;
  email?: string;
  externalId?: string;
  avatarUrl?: string;
  role?: string;
  metadata?: Record<string, unknown>;
}

export interface UnifiedContent {
  text: string;
  html?: string;
  markdown?: string;
  summary?: string;
  language?: string;
  attachments?: UnifiedAttachment[];
}

export interface UnifiedAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  url: string;
  thumbnailUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface UnifiedContext {
  channelId?: string;
  channelName?: string;
  projectId?: string;
  projectName?: string;
  meetingId?: string;
  meetingTitle?: string;
  parentEventId?: string;
  metadata?: Record<string, unknown>;
}

export interface UnifiedParticipant {
  actor: UnifiedActor;
  role: string;
  participatedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface UnifiedReference {
  type: 'person' | 'project' | 'document' | 'task' | 'meeting' | 'url' | 'other';
  name: string;
  externalId?: string;
  url?: string;
  context?: string;
  metadata?: Record<string, unknown>;
}

export interface UnifiedEvent {
  id: string;
  externalId: string;
  provider: string;
  type: UnifiedEventType;
  timestamp: string;
  actor: UnifiedActor;
  content: UnifiedContent;
  context: UnifiedContext;
  participants: UnifiedParticipant[];
  references: UnifiedReference[];
  workspaceId: string;
  organizationId: string;
  status?: string;
  priority?: 'P0' | 'P1' | 'P2' | 'P3' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  dueAt?: string;
  completedAt?: string;
  tags?: string[];
  metadata: Record<string, unknown>;
  ingestedAt: string;
  contentHash: string;
}

export interface ConnectorConfig {
  credentials: Record<string, string>;
  workspaceId: string;
  organizationId: string;
  syncConfig?: {
    lookbackPeriod?: string;
    includeIds?: string[];
    excludeIds?: string[];
  };
}

export interface SyncResult {
  eventsSynced: number;
  eventsSkipped: number;
  errors: number;
  nextSyncAt: string;
  cursor?: string | undefined;
  errorDetails?: Array<{ externalId: string; error: string }> | undefined;
}

export interface Connector {
  provider: string;
  validate(config: ConnectorConfig): Promise<boolean>;
  sync(config: ConnectorConfig, cursor?: string): Promise<{ events: UnifiedEvent[]; result: SyncResult }>;
  handleWebhook?(payload: unknown, config: ConnectorConfig): Promise<UnifiedEvent[]>;
  getMetadata(): {
    name: string;
    description: string;
    icon: string;
    // ✅ CORRECTION : readonly pour accepter les tuples 'as const'
    capabilities: readonly ('sync' | 'webhook' | 'realtime')[];
    rateLimits?: {
      requestsPerMinute?: number;
      requestsPerDay?: number;
    };
  };
}

export function generateContentHash(externalId: string, content: string): string {
  const input = `${externalId}:${content}`;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

export function validateUnifiedEvent(event: UnifiedEvent): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!event.id) errors.push('Missing id');
  if (!event.externalId) errors.push('Missing externalId');
  if (!event.provider) errors.push('Missing provider');
  if (!event.type) errors.push('Missing type');
  if (!event.timestamp) errors.push('Missing timestamp');
  if (!event.actor?.id) errors.push('Missing actor.id');
  if (!event.content?.text) errors.push('Missing content.text');
  if (!event.workspaceId) errors.push('Missing workspaceId');
  if (!event.organizationId) errors.push('Missing organizationId');

  return { valid: errors.length === 0, errors };
}

export class SlackConnector implements Connector {
  provider = 'slack';

  async validate(config: ConnectorConfig): Promise<boolean> {
    return true;
  }

  async sync(config: ConnectorConfig, cursor?: string): Promise<{ events: UnifiedEvent[]; result: SyncResult }> {
    const events: UnifiedEvent[] = [];
    return {
      events,
      result: {
        eventsSynced: events.length,
        eventsSkipped: 0,
        errors: 0,
        nextSyncAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        cursor,
      },
    };
  }

  async handleWebhook(payload: unknown, config: ConnectorConfig): Promise<UnifiedEvent[]> {
    return [];
  }

  getMetadata() {
    return {
      name: 'Slack',
      description: 'Sync messages, channels, and threads from Slack',
      icon: 'slack',
      capabilities: ['sync', 'webhook', 'realtime'] as const,
      rateLimits: {
        requestsPerMinute: 60,
        requestsPerDay: 10000,
      },
    };
  }
}
