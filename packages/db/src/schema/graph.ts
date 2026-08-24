import { relations } from 'drizzle-orm';
import {
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

// ─────────────────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────────────────

export const graphNodeTypeEnum = pgEnum('graph_node_type', [
  'person', 'project', 'document', 'meeting', 'decision', 'task', 'conversation', 'tool', 'knowledge',
]);

export const graphEdgeTypeEnum = pgEnum('graph_edge_type', [
  'WORKS_ON', 'OWNS', 'ASSIGNED_TO', 'DEPENDS_ON', 'PARTICIPATES_IN',
  'MENTIONS', 'AUTHORED', 'REVIEWED', 'RELATES_TO', 'REFERENCES',
  'SUPERSEDES', 'SUPPORTS', 'REPORTS_TO', 'COLLABORATES_WITH', 'MEMBER_OF',
]);

export const memoryLayerEnum = pgEnum('memory_layer', [
  'short_term', 'working', 'session', 'long_term', 'organizational',
  'knowledge', 'decision', 'conversational', 'user',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Tables
// ─────────────────────────────────────────────────────────────────────────────

export const graphNodes = pgTable(
  'graph_nodes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: text('workspace_id').notNull(),
    organizationId: text('organization_id').notNull(),
    type: graphNodeTypeEnum('type').notNull(),
    externalId: text('external_id'),
    externalProvider: text('external_provider'),
    name: text('name').notNull(),
    metadata: jsonb('metadata').default('{}').notNull(),
    content: text('content'),
    embedding: text('embedding'), // Sera converti en vector(1536) via migration SQL
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    workspaceTypeIdx: index('graph_nodes_workspace_type_idx').on(table.workspaceId, table.type),
    externalIdIdx: uniqueIndex('graph_nodes_external_id_idx').on(table.workspaceId, table.externalProvider, table.externalId),
    tenantIdx: index('graph_nodes_tenant_idx').on(table.organizationId, table.workspaceId),
  })
);

export const graphEdges = pgTable(
  'graph_edges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: text('workspace_id').notNull(),
    organizationId: text('organization_id').notNull(),
    sourceId: uuid('source_id').notNull(),
    targetId: uuid('target_id').notNull(),
    type: graphEdgeTypeEnum('type').notNull(),
    weight: real('weight').default(1.0).notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }),
    metadata: jsonb('metadata').default('{}').notNull(),
    sourceProvider: text('source_provider'),
    sourceEventId: text('source_event_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    sourceIdx: index('graph_edges_source_idx').on(table.sourceId, table.type),
    targetIdx: index('graph_edges_target_idx').on(table.targetId, table.type),
    edgeIdx: uniqueIndex('graph_edges_edge_idx').on(table.workspaceId, table.sourceId, table.targetId, table.type),
    tenantIdx: index('graph_edges_tenant_idx').on(table.organizationId, table.workspaceId),
  })
);

export const memories = pgTable(
  'memories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: text('workspace_id').notNull(),
    organizationId: text('organization_id').notNull(),
    userId: text('user_id'),
    layer: memoryLayerEnum('layer').notNull(),
    title: text('title').notNull(),
    content: text('content').notNull(),
    metadata: jsonb('metadata').default('{}').notNull(),
    embedding: text('embedding'),
    importance: real('importance').default(0.5).notNull(),
    accessCount: integer('access_count').default(0).notNull(),
    validFrom: timestamp('valid_from', { withTimezone: true }).defaultNow(),
    validUntil: timestamp('valid_until', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    userLayerIdx: index('memories_user_layer_idx').on(table.userId, table.layer),
    orgLayerIdx: index('memories_org_layer_idx').on(table.organizationId, table.layer),
    tenantIdx: index('memories_tenant_idx').on(table.organizationId, table.workspaceId),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// Relations
// ─────────────────────────────────────────────────────────────────────────────

export const graphNodesRelations = relations(graphNodes, ({ many }) => ({
  outgoingEdges: many(graphEdges),
}));

export const graphEdgesRelations = relations(graphEdges, ({ one }) => ({
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
