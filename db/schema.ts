import { sqliteTable, text, integer, check } from 'drizzle-orm/sqlite-core';
import {sql} from 'drizzle-orm';
export const users = sqliteTable('users', {
  id: text('id').primaryKey(), email: text('email').notNull().unique(), subject: text('subject').unique(),
  name: text('name').notNull(), role: text('role').notNull(), active: integer('active').notNull().default(1),
  createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(),
});
export const cash = sqliteTable('cash', {
  id: integer('id').primaryKey(), balance: integer('balance').notNull().default(0),
  initialized: integer('initialized').notNull().default(0), revision: integer('revision').notNull().default(0),
  weekday: integer('weekday').notNull().default(1),
});
export const media = sqliteTable('media', {
  id: text('id').primaryKey(), ownerId: text('owner_id').notNull().references(()=>users.id),
  key: text('key').notNull().unique(), contentType: text('content_type').notNull(), size: integer('size').notNull(),
  createdAt: text('created_at').notNull(), entryId: text('entry_id').unique(),
});
export const entries = sqliteTable('entries', {
  seq: integer('seq').primaryKey({autoIncrement:true}), id: text('id').notNull().unique(),
  requestId: text('request_id').notNull().unique(), requestHash: text('request_hash').notNull(),
  kind: text('kind').notNull(), delta: integer('delta').notNull(), expected: integer('expected').notNull(),
  counted: integer('counted'), difference: integer('difference'), balanceAfter: integer('balance_after').notNull(),
  expectedRevision: integer('expected_revision').notNull(), reason: text('reason').notNull(), note: text('note').notNull(),
  linkedId: text('linked_id'), photoId: text('photo_id').references(()=>media.id),
  actorId: text('actor_id').notNull().references(()=>users.id), actorName: text('actor_name').notNull(),
  actorEmail: text('actor_email').notNull(), actorRole: text('actor_role'), createdAt: text('created_at').notNull(),
});
export const audit = sqliteTable('audit', {
  seq: integer('seq').primaryKey({autoIncrement:true}), id: text('id').notNull().unique(),
  requestId: text('request_id').notNull().unique(), actorId: text('actor_id').notNull().references(()=>users.id),
  actorName: text('actor_name').notNull(), actorRole: text('actor_role'), action: text('action').notNull(), targetId: text('target_id').notNull(),
  before: text('before_json').notNull(), after: text('after_json').notNull(), createdAt: text('created_at').notNull(),
});
export const countClosures = sqliteTable('count_closures', {
 countId:text('count_id').primaryKey().references(()=>entries.id),
 closingCountId:text('closing_count_id').notNull().references(()=>entries.id),
 resolutionId:text('resolution_id').references(()=>entries.id),
 closedBy:text('closed_by').notNull().references(()=>users.id), closedName:text('closed_name').notNull(),
 closedRole:text('closed_role').notNull(), reason:text('reason').notNull(), createdAt:text('created_at').notNull(),
});
export const writeGuards = sqliteTable('write_guards', {
 id:text('id').primaryKey(),accessOk:integer('access_ok').notNull().default(1),revisionOk:integer('revision_ok').notNull().default(1),
 balanceOk:integer('balance_ok').notNull().default(1),initOk:integer('init_ok').notNull().default(1),linkOk:integer('link_ok').notNull().default(1),
 photoOk:integer('photo_ok').notNull().default(1),lastAdminOk:integer('last_admin_ok').notNull().default(1),correctionOk:integer('correction_ok').notNull().default(1),
},t=>[
 check('cash_denied',sql`${t.accessOk}=1`),check('cash_stale',sql`${t.revisionOk}=1`),check('cash_overdraft',sql`${t.balanceOk}=1`),
 check('cash_uninitialized',sql`${t.initOk}=1`),check('cash_linked',sql`${t.linkOk}=1`),check('cash_photo',sql`${t.photoOk}=1`),
 check('cash_lastAdmin',sql`${t.lastAdminOk}=1`),check('cash_correctionSinceCount',sql`${t.correctionOk}=1`),
]);
