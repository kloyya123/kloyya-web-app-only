/**
 * @kloyya/db — the database package.
 *
 * Consumers import everything DB-related from here: the `db` client, the tables,
 * enums, and relations. Nothing reaches into `drizzle-orm` or `postgres`
 * directly, so the driver and ORM stay swappable behind one package boundary.
 */
export { db } from './client.js';
export type { AppDb } from './client.js';
export { withTenantScope } from './scope.js';
export type { Tx } from './scope.js';
export * from './schema.js';
export * from './types.js';
