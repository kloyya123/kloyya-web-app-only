/**
 * Unified Event Schema — The Universal Language of Kloyya
 *
 * Every connector (Gmail, Slack, Jira, etc.) must normalize its data into
 * this universal format before ingesting into the knowledge graph.
 *
 * This ensures:
 * 1. Consistent data model across all integrations
 * 2. Simplified graph construction (no provider-specific logic)
 * 3. Easy addition of new connectors (just implement this interface)
 * 4. Provider-agnostic AI reasoning
 *
 * Design principles:
 * - Extensible via metadata (provider-specific fields go here)
 * - Temporal (every event has a timestamp)
 * - Provenance (we always know where data came from)
 * - Deduplication-friendly (externalId + provider = unique key)
 */

// ─────────────────────────────────────────────────────────────────────────────
// Event Types: What kind of activity is this?
// ─────────────────────────────────────────────────────────────────────────────

export type UnifiedEventType =
  | 'message'           // Chat message, email, comment
  | 'document'          // File, doc, wiki page
  | 'meeting'           // Calendar event
  | 'task'              // Work item, ticket
  | 'decision'          // Recorded decision
  | 'relationship'      // Edge/relationship between entities
  | 'status_change'     // Status update (task moved, project phase changed)
  | 'mention'           // @mention of a person/project
  | 'reaction'          // Emoji reaction, like, thumbs up
  | 'attachment'        // File attached to a message/doc
  | 'integration_event'; // Generic provider-specific event

// ─────────────────────────────────────────────────────────────────────────────
// Actor: Who performed this action?
// ─────────────────────────────────────────────────────────────────────────────

export interface UnifiedActor {
  /** Unique ID within Kloyya (graph node ID) */
  id: string;
  /** Display name */
  name: string;
  /** Email (if available) */
  email?: string;
  /** External ID in source system */
  externalId?: string;
  /** Avatar URL */
  avatarUrl?: string;
  /** Role/title */
  role?: string;
  /** Provider-specific metadata */
  metadata?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Content: What is the actual content?
// ─────────────────────────────────────────────────────────────────────────────

export interface UnifiedContent {
  /** Plain text content (for search/indexing) */
  text: string;
  /** HTML content (for rich rendering) */
  html?: string;
  /** Markdown content (for structured content) */
  markdown?: string;
  /** Summary (AI-generated or manual) */
  summary?: string;
  /** Language code (ISO 639-1) */
  language?: string;
  /** Attachments (files, images, etc.) */
  attachments?: UnifiedAttachment[];
}

export interface UnifiedAttachment {
  /** Unique ID */
  id: string;
  /** Filename */
  filename: string;
  /** MIME type */
  mimeType: string;
  /** File size in bytes */
  size: number;
  /** Download URL */
  url: string;
  /** Thumbnail URL (for images) */
  thumbnailUrl?: string;
  /** Provider-specific metadata */
  metadata?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Context: Where/when did this happen?
// ─────────────────────────────────────────────────────────────────────────────

export interface UnifiedContext {
  /** Channel/conversation/thread ID */
  channelId?: string;
  /** Channel name (for display) */
  channelName?: string;
  /** Project ID (if related to a project) */
  projectId?: string;
  /** Project name */
  projectName?: string;
  /** Meeting ID (if this is a meeting) */
  meetingId?: string;
  /** Meeting title */
  meetingTitle?: string;
  /** Parent event ID (for threads/replies) */
  parentEventId?: string;
  /** Provider-specific context */
  metadata?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Participants: Who is involved?
// ─────────────────────────────────────────────────────────────────────────────

export interface UnifiedParticipant {
  /** Actor reference */
  actor: UnifiedActor;
  /** Role in this event (sender, recipient, attendee, assignee, etc.) */
  role: string;
  /** When did they participate? */
  participatedAt?: string;
  /** Provider-specific metadata */
  metadata?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// References: What entities are mentioned/related?
// ─────────────────────────────────────────────────────────────────────────────

export interface UnifiedReference {
  /** Type of entity being referenced */
  type: 'person' | 'project' | 'document' | 'task' | 'meeting' | 'url' | 'other';
  /** Display name/label */
  name: string;
  /** External ID (if available) */
  externalId?: string;
  /** Direct URL */
  url?: string;
  /** Context of the reference (e.g., the sentence where it was mentioned) */
  context?: string;
  /** Provider-specific metadata */
  metadata?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// The Unified Event: The Core Schema
// ─────────────────────────────────────────────────────────────────────────────

export interface UnifiedEvent {
  /** Unique ID within Kloyya (generated on ingest) */
  id: string;
  
  /** External ID in source system (for deduplication) */
  externalId: string;
  
  /** Source provider (slack, gmail, jira, notion, etc.) */
  provider: string;
  
  /** What kind of event is this? */
  type: UnifiedEventType;
  
  /** When did this event occur? (ISO 8601) */
  timestamp: string;
  
  /** Who performed this action? */
  actor: UnifiedActor;
  
  /** The actual content */
  content: UnifiedContent;
  
  /** Where/when did this happen? */
  context: UnifiedContext;
  
  /** Who is involved? */
  participants: UnifiedParticipant[];
  
  /** What entities are referenced? */
  references: UnifiedReference[];
  
  /** Tenant isolation */
  workspaceId: string;
  organizationId: string;
  
  /** Status (for tasks/projects) */
  status?: string;
  
  /** Priority (for tasks) */
  priority?: 'P0' | 'P1' | 'P2' | 'P3' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  
  /** Due date (for tasks/meetings) */
  dueAt?: string;
  
  /** Completed at (for tasks) */
  completedAt?: string;
  
  /** Tags/labels */
  tags?: string[];
  
  /** Provider-specific metadata (anything not covered above) */
  metadata: Record<string, unknown>;
  
  /** When was this ingested into Kloyya? */
  ingestedAt: string;
  
  /** Hash for deduplication (content + externalId) */
  contentHash: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Connector Interface: What every integration must implement
// ─────────────────────────────────────────────────────────────────────────────

export interface ConnectorConfig {
  /** OAuth tokens or API keys */
  credentials: Record<string, string>;
  /** Workspace/organization context */
  workspaceId: string;
  organizationId: string;
  /** Sync configuration */
  syncConfig?: {
    /** How far back to sync (ISO 8601 duration, e.g., 'P30D' for 30 days) */
    lookbackPeriod?: string;
    /** Specific channels/projects to sync (empty = all) */
    includeIds?: string[];
    /** Channels/projects to exclude */
    excludeIds?: string[];
  };
}

export interface SyncResult {
  /** How many events were synced */
  eventsSynced: number;
  /** How many events were skipped (duplicates) */
  eventsSkipped: number;
  /** How many errors occurred */
  errors: number;
  /** When to sync next (ISO 8601 timestamp) */
  nextSyncAt: string;
  /** Cursor for pagination (if provider supports it) */
  cursor?: string;
  /** Error details */
  errorDetails?: Array<{
    externalId: string;
    error: string;
  }>;
}

export interface Connector {
  /** Provider name (slack, gmail, jira, etc.) */
  provider: string;
  
  /** Validate credentials and connection */
  validate(config: ConnectorConfig): Promise<boolean>;
  
  /** Sync events from source system */
  sync(
    config: ConnectorConfig,
    cursor?: string,
  ): Promise<{ events: UnifiedEvent[]; result: SyncResult }>;
  
  /** Handle webhook events (if provider supports webhooks) */
  handleWebhook?(
    payload: unknown,
    config: ConnectorConfig,
  ): Promise<UnifiedEvent[]>;
  
  /** Get metadata about the connector (capabilities, limits, etc.) */
  getMetadata(): {
    name: string;
    description: string;
    icon: string;
    capabilities: Array<'sync' | 'webhook' | 'realtime'>;
    rateLimits?: {
      requestsPerMinute?: number;
      requestsPerDay?: number;
    };
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a content hash for deduplication
 */
export function generateContentHash(externalId: string, content: string): string {
  // In production, use a proper hash function (e.g., crypto.createHash('sha256'))
  // This is a simplified version for demonstration
  const input = `${externalId}:${content}`;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Validate a unified event
 */
export function validateUnifiedEvent(event: UnifiedEvent): {
  valid: boolean;
  errors: string[];
} {
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

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Example: Slack Connector Implementation
 */
export class SlackConnector implements Connector {
  provider = 'slack';

  async validate(config: ConnectorConfig): Promise<boolean> {
    // Validate Slack token and workspace access
    // Implementation omitted for brevity
    return true;
  }

  async sync(
    config: ConnectorConfig,
    cursor?: string,
  ): Promise<{ events: UnifiedEvent[]; result: SyncResult }> {
    // Fetch messages from Slack API
    // Normalize into UnifiedEvent format
    // Implementation omitted for brevity
    
    const events: UnifiedEvent[] = [];
    
    return {
      events,
      result: {
        eventsSynced: events.length,
        eventsSkipped: 0,
        errors: 0,
        nextSyncAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 minutes
        cursor,
      },
    };
  }

  async handleWebhook(
    payload: unknown,
    config: ConnectorConfig,
  ): Promise<UnifiedEvent[]> {
    // Parse Slack webhook payload
    // Normalize into UnifiedEvent format
    // Implementation omitted for brevity
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
