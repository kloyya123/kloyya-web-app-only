import type { InferSelectModel } from 'drizzle-orm';
import { graphNodes, graphEdges, memories } from './schema';

// Export des types inférés pour une utilisation propre dans l'application
export type GraphNode = InferSelectModel<typeof graphNodes>;
export type GraphEdge = InferSelectModel<typeof graphEdges>;
export type Memory = InferSelectModel<typeof memories>;
