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
