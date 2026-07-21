import { sql } from "drizzle-orm";
import {
  foreignKey,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    email: text("email").notNull(),
    displayName: text("display_name").notNull().default(""),
    passwordHash: text("password_hash").notNull().default(""),
    emailVerifiedAt: text("email_verified_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({ emailIndex: uniqueIndex("users_email_unique").on(table.email) }),
);

export const savedItems = sqliteTable(
  "saved_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull(),
    itemId: text("item_id").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    userItemIndex: uniqueIndex("saved_items_user_item_unique").on(table.userId, table.itemId),
    userIndex: index("saved_items_user_id_idx").on(table.userId),
    userForeignKey: foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "saved_items_user_id_fk",
    }).onDelete("cascade"),
  }),
);

export const authTokens = sqliteTable(
  "auth_tokens",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    purpose: text("purpose").notNull(),
    expiresAt: text("expires_at").notNull(),
    consumedAt: text("consumed_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    tokenHashIndex: uniqueIndex("auth_tokens_token_hash_unique").on(table.tokenHash),
    userIndex: index("auth_tokens_user_id_idx").on(table.userId),
    lookupIndex: index("auth_tokens_purpose_expires_idx").on(table.purpose, table.expiresAt),
    userForeignKey: foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "auth_tokens_user_id_fk",
    }).onDelete("cascade"),
  }),
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    revokedAt: text("revoked_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    tokenHashIndex: uniqueIndex("sessions_token_hash_unique").on(table.tokenHash),
    userIndex: index("sessions_user_id_idx").on(table.userId),
    expiryIndex: index("sessions_expires_at_idx").on(table.expiresAt),
    userForeignKey: foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "sessions_user_id_fk",
    }).onDelete("cascade"),
  }),
);
