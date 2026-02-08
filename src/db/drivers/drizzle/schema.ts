import { index } from 'drizzle-orm/pg-core';
import {
  pgTable,
  uuid,
  text,
  bigint,
  timestamp,
  primaryKey,
  customType,
} from 'drizzle-orm/pg-core';

export const bytea = customType<{ data: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

/**
 * Logical document registry.
 * One row per authoritative document.
 */
export const documents = pgTable('documents', {
  id: uuid('id').primaryKey(),
  toolType: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
});

/**
 * Periodic full snapshots of a document.
 * Snapshots are immutable.
 */
export const documentSnapshots = pgTable(
  'document_snapshots',
  {
    docId: uuid('doc_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),

    seq: bigint('seq', { mode: 'number' }).notNull(),
    snapshot: bytea().notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey(table.docId, table.seq),
  }),
);

/**
 * Incremental Yjs updates.
 * Append-only, ordered by seq.
 */
export const documentUpdates = pgTable(
  'document_updates',
  {
    docId: uuid('doc_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),

    seq: bigint('seq', { mode: 'number' }).notNull(),
    update: bytea('update').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    pk: primaryKey(table.docId, table.seq),
  }),
);

export const toolInstances = pgTable('tool_instances', {
  id: uuid('id').primaryKey(),
  toolType: text('tool_type').notNull(),
  docId: uuid('doc_id').notNull(),
  ownerUserId: text('owner_user_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const toolInstanceMembers = pgTable(
  'tool_instance_members',
  {
    instanceId: uuid('instance_id')
      .notNull()
      .references(() => toolInstances.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.instanceId, t.userId] }),
    instIdx: index('tool_instance_members_instance_idx').on(t.instanceId),
    userIdx: index('tool_instance_members_user_idx').on(t.userId),
  }),
);
