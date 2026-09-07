import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
export const sessions = sqliteTable('scan_sessions', {
  id: text('id').primaryKey(),
  createdAt: integer('created_at').notNull(),
  nextSequence: integer('next_sequence').notNull().default(0),
});
export const spreads = sqliteTable(
  'spreads',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id),
    sequence: integer('sequence').notNull(),
    createdAt: integer('created_at').notNull(),
    revision: integer('revision').notNull().default(1),
    status: text('status').notNull().default('ready'),
    jobStarted: integer('job_started'),
    data: text('data').notNull(),
  },
  (t) => [
    index('idx_spreads_session_sequence').on(t.sessionId, t.sequence),
    uniqueIndex('idx_spreads_sequence_unique').on(t.sessionId, t.sequence),
  ],
);
