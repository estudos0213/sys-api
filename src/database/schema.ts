import { sql } from 'drizzle-orm';
import { index, pgPolicy, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const activeTenant = sql`nullif(current_setting('app.tenant_id', true), '')::uuid`;

// Emails are globally unique because login does not accept a tenant identifier.
// This credential table is read before establishing the RLS tenant context.
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  tenantId: uuid('tenant_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const notes = pgTable('notes', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  title: text('title').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('notes_tenant_created_at_idx').on(table.tenantId, table.createdAt),
  pgPolicy('notes_tenant_isolation', {
    for: 'all',
    to: 'public',
    using: sql`${table.tenantId} = ${activeTenant}`,
    withCheck: sql`${table.tenantId} = ${activeTenant}`,
  }),
]).enableRLS();
