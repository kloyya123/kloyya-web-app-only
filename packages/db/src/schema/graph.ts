import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { organizations, users, workspaces } from './tenants';

/**
 * Knowledge Graph — The Semantic Fabric of Kloyya
 *
 * This is NOT a chat history. This is a living, queryable map of everything
 * that matters in an organization: people, projects, documents, meetings,
 * decisions — connected by meaning, not keywords.
 *
 * Architecture:
 * - `graph_nodes`: entities (people, projects, docs, meetings, decisions)
 * - `graph_edges`: relationships between them (WORKS_ON, DECIDED_BY, etc.)
 * - `embeddings`: vector representations for semantic search (pgvector)
 *
 * Multi-tenant isolation: every node/edge is scoped to a workspace AND org.
 * RLS policies must enforce this at the database level.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Node Types: What kind of entity is this?
// ─────────────────────────────────────────────────────────────────────────────

export const graphNodeTypeEnum = pgEnum('graph_node_type', [
  'person',        // A human (employee, contractor, external contact)
  'project',       // A project, initiative, or workstream
  'document',      // A file, doc, wiki page, email thread
  'meeting',       // A calendar event with participants
  'decision',      // A recorded decision with context
  'task',          // A work item (from Jira, Linear, Asana, etc.)
  'conversation',  // A Slack thread, Teams channel, email thread
  'tool',          // An integrated application (Gmail, Slack, etc.)
  'knowledge',     // A synthesized insight or organizational rule
]);

// ─────────────────────────────────────────────────────────────────────────────
// Edge Types: How are two nodes related?
// ─────────────────────────────────────────────────────────────────────────────

export const graphEdgeTypeEnum = pgEnum('graph_edge_type', [
  // Work relationships
  'WORKS_ON',           // Person → Project
  'OWNS',               // Person → Task/Document/Decision
  'ASSIGNED_TO',        // Task → Person
  'DEPENDS_ON',         // Task → Task
  
  // Communication relationships
  'PARTICIPATES_IN',    // Person → Meeting/Conversation
  'MENTIONS',           // Document/Conversation → Person/Project
  'AUTHORED',           // Person → Document/Decision
  'REVIEWED',           // Person → Document
  
  // Semantic relationships
  'RELATES_TO',         // Generic semantic link
  'REFERENCES',         // Document → Document/Project
  'SUPERSEDES',         // Decision → Decision (this replaces that)
  'SUPPORTS',           // Evidence → Decision
  
  // Organizational relationships
  'REPORTS_TO',         // Person → Person (informal hierarchy)
  'COLLABORATES_WITH',  // Person → Person (frequency-based)
  'MEMBER_OF',          // Person → Team/Project
]);

// ─────────────────────────────────────────────────────────────────────────────
// Nodes: The Entities
// ─────────────────────────────────────────────────────────────────────────────

export const graphNodes = pgTable(
  'graph_nodes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    
    // What kind of entity is this?
    type: graphNodeTypeEnum('type').notNull(),
    
    // External reference (e.g., Slack user ID, Jira ticket ID)
    // Allows us to deduplicate and update from source systems
    externalId: text('external_id'),
    externalProvider: text('external_provider'), // 'slack', 'gmail', 'jira', etc.
    
    // Human-readable name/title
    name: text('name').notNull(),
    
    // Rich metadata (varies by type)
    // Person: { email, role, department }
    // Project: { status, startDate, endDate }
    // Document: { url, mimeType, size }
    metadata: jsonb('metadata').default('{}').notNull(),
    
    // Full text content for search (emails, doc bodies, meeting transcripts)
    // Kept separate from metadata for performance
    content: text('content'),
    
    // Vector embedding for semantic search (1536 dims for OpenAI, 768 for others)
    // Use pgvector extension: CREATE EXTENSION IF NOT EXISTS vector;
    embedding: text('embedding'), // Stored as text, cast to vector in queries
    
    // Temporal metadata
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    
    // When did this entity last appear in activity? (for relevance decay)
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    
    // Soft delete (preserve graph integrity)
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    // Fast lookups by workspace + type
    workspaceTypeIdx: index('graph_nodes_workspace_type_idx').on(
      table.workspaceId,
      table.type,
    ),
    // External ID deduplication
    externalIdIdx: uniqueIndex('graph_nodes_external_id_idx').on(
      table.workspaceId,
      table.externalProvider,
      table.externalId,
    ),
    // Full-text search
    contentSearchIdx: index('graph_nodes_content_search_idx').using(
      'gin',
      // Requires: CREATE EXTENSION IF NOT EXISTS pg_trgm;
      // Use raw SQL for trigram index: CREATE INDEX ... USING gin (content gin_trgm_ops)
    ),
    // Tenant isolation (critical for RLS)
    tenantIdx: index('graph_nodes_tenant_idx').on(
      table.organizationId,
      table.workspaceId,
    ),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// Edges: The Relationships
// ─────────────────────────────────────────────────────────────────────────────

export const graphEdges = pgTable(
  'graph_edges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    
    // The two nodes being connected
    sourceId: uuid('source_id')
      .notNull()
      .references(() => graphNodes.id, { onDelete: 'cascade' }),
    targetId: uuid('target_id')
      .notNull()
      .references(() => graphNodes.id, { onDelete: 'cascade' }),
    
    // What kind of relationship?
    type: graphEdgeTypeEnum('type').notNull(),
    
    // Strength/weight of the relationship (0.0 to 1.0)
    // E.g., collaboration frequency, mention count, semantic similarity
    weight: real('weight').default(1.0).notNull(),
    
    // When did this relationship occur? (for temporal queries)
    occurredAt: timestamp('occurred_at', { withTimezone: true }),
    
    // Rich metadata (varies by edge type)
    // PARTICIPATES_IN: { role: 'organizer' | 'attendee' }
    // MENTIONS: { context: 'quoted text' }
    metadata: jsonb('metadata').default('{}').notNull(),
    
    // Provenance: which sync job created this edge?
    sourceProvider: text('source_provider'), // 'slack', 'gmail', etc.
    sourceEventId: text('source_event_id'),  // ID in source system
    
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // Graph traversal: find all edges from/to a node
    sourceIdx: index('graph_edges_source_idx').on(table.sourceId, table.type),
    targetIdx: index('graph_edges_target_idx').on(table.targetId, table.type),
    // Bidirectional lookup
    edgeIdx: uniqueIndex('graph_edges_edge_idx').on(
      table.workspaceId,
      table.sourceId,
      table.targetId,
      table.type,
    ),
    // Tenant isolation
    tenantIdx: index('graph_edges_tenant_idx').on(
      table.organizationId,
      table.workspaceId,
    ),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// Memory Layers: Structured Memory (Not Just Chat History)
// ─────────────────────────────────────────────────────────────────────────────

export const memoryLayerEnum = pgEnum('memory_layer', [
  'short_term',        // Last 24h: what just happened?
  'working',           // Active tasks/projects: what am I focused on now?
  'session',           // Current conversation context
  'long_term',         // Historical patterns: how do we usually do this?
  'organizational',    // Company rules, culture, org chart
  'knowledge',         // Synthesized insights, best practices
  'decision',          // Why did we decide X? (audit trail)
  'conversational',    // Chat/thread context
  'user',              // Personal preferences, habits, goals
]);

export const memories = pgTable(
  'memories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    
    // Which memory layer does this belong to?
    layer: memoryLayerEnum('layer').notNull(),
    
    // Human-readable summary
    title: text('title').notNull(),
    
    // Full content (the actual memory)
    content: text('content').notNull(),
    
    // Structured metadata (varies by layer)
    // Decision: { alternatives, outcome, reasoning }
    // Organizational: { policy_type, effective_date }
    metadata: jsonb('metadata').default('{}').notNull(),
    
    // Vector embedding for semantic retrieval
    embedding: text('embedding'),
    
    // Relevance scoring (for decay/prioritization)
    importance: real('importance').default(0.5).notNull(),
    accessCount: integer('access_count').default(0).notNull(),
    
    // Temporal bounds
    validFrom: timestamp('valid_from', { withTimezone: true }).defaultNow(),
    validUntil: timestamp('valid_until', { withTimezone: true }), // null = forever
    
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    
    // Soft delete
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    // Fast retrieval by user + layer
    userLayerIdx: index('memories_user_layer_idx').on(
      table.userId,
      table.layer,
    ),
    // Workspace-wide organizational memories
    orgLayerIdx: index('memories_org_layer_idx').on(
      table.organizationId,
      table.layer,
    ),
    // Tenant isolation
    tenantIdx: index('memories_tenant_idx').on(
      table.organizationId,
      table.workspaceId,
    ),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// Relations (Drizzle ORM)
// ─────────────────────────────────────────────────────────────────────────────

export const graphNodesRelations = relations(graphNodes, ({ many, one }) => ({
  workspace: one(workspaces, {
    fields: [graphNodes.workspaceId],
    references: [workspaces.id],
  }),
  organization: one(organizations, {
    fields: [graphNodes.organizationId],
    references: [organizations.id],
  }),
  outgoingEdges: many(graphEdges),
  memories: many(memories),
}));

export const graphEdgesRelations = relations(graphEdges, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [graphEdges.workspaceId],
    references: [workspaces.id],
  }),
  organization: one(organizations, {
    fields: [graphEdges.organizationId],
    references: [organizations.id],
  }),
  source: one(graphNodes, {
    fields: [graphEdges.sourceId],
    references: [graphNodes.id],
    relationName: 'sourceEdges',
  }),
  target: one(graphNodes, {
    fields: [graphEdges.targetId],
    references: [graphNodes.id],
    relationName: 'targetEdges',
  }),
}));

export const memoriesRelations = relations(memories, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [memories.workspaceId],
    references: [workspaces.id],
  }),
  organization: one(organizations, {
    fields: [memories.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [memories.userId],
    references: [users.id],
  }),
}));
