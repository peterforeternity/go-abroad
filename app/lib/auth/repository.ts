import { getWorkerBinding } from "../env";

export type UserRecord = {
  id: number;
  email: string;
  display_name: string;
  password_hash: string;
  email_verified_at: string | null;
};

export type TokenRecord = {
  id: number;
  user_id: number;
};

function database(): D1Database {
  const db = getWorkerBinding<D1Database>("DB");
  if (!db) throw new Error("D1 binding DB is unavailable");
  return db;
}

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  return database()
    .prepare("SELECT id, email, display_name, password_hash, email_verified_at FROM users WHERE email = ? LIMIT 1")
    .bind(email)
    .first<UserRecord>();
}

export async function findUserById(id: number): Promise<UserRecord | null> {
  return database()
    .prepare("SELECT id, email, display_name, password_hash, email_verified_at FROM users WHERE id = ? LIMIT 1")
    .bind(id)
    .first<UserRecord>();
}

export async function createUser(email: string, displayName: string, passwordHash: string): Promise<UserRecord> {
  const created = await database()
    .prepare(
      "INSERT INTO users (email, display_name, password_hash) VALUES (?, ?, ?) RETURNING id, email, display_name, password_hash, email_verified_at",
    )
    .bind(email, displayName, passwordHash)
    .first<UserRecord>();
  if (!created) throw new Error("User insert did not return a row");
  return created;
}

export async function updateUnverifiedUser(
  id: number,
  displayName: string,
  passwordHash: string,
): Promise<void> {
  await database()
    .prepare("UPDATE users SET display_name = ?, password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND email_verified_at IS NULL")
    .bind(displayName, passwordHash, id)
    .run();
}

export async function replaceAuthToken(
  userId: number,
  purpose: "email_verification" | "password_reset",
  tokenHash: string,
  expiresAt: string,
): Promise<void> {
  const db = database();
  await db.batch([
    db.prepare("DELETE FROM auth_tokens WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL").bind(userId, purpose),
    db.prepare("INSERT INTO auth_tokens (user_id, token_hash, purpose, expires_at) VALUES (?, ?, ?, ?)").bind(
      userId,
      tokenHash,
      purpose,
      expiresAt,
    ),
  ]);
}

export async function findUsableToken(
  tokenHash: string,
  purpose: "email_verification" | "password_reset",
): Promise<TokenRecord | null> {
  return database()
    .prepare(
      "SELECT id, user_id FROM auth_tokens WHERE token_hash = ? AND purpose = ? AND consumed_at IS NULL AND expires_at > CURRENT_TIMESTAMP LIMIT 1",
    )
    .bind(tokenHash, purpose)
    .first<TokenRecord>();
}

export async function verifyEmail(token: TokenRecord): Promise<void> {
  const db = database();
  await db.batch([
    db.prepare("UPDATE auth_tokens SET consumed_at = CURRENT_TIMESTAMP WHERE id = ? AND consumed_at IS NULL").bind(token.id),
    db.prepare("UPDATE users SET email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(token.user_id),
  ]);
}

export async function resetPassword(token: TokenRecord, passwordHash: string): Promise<void> {
  const db = database();
  await db.batch([
    db.prepare("UPDATE auth_tokens SET consumed_at = CURRENT_TIMESTAMP WHERE id = ? AND consumed_at IS NULL").bind(token.id),
    db.prepare("UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(passwordHash, token.user_id),
    db.prepare("UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND revoked_at IS NULL").bind(token.user_id),
  ]);
}

export async function createSession(userId: number, tokenHash: string, expiresAt: string): Promise<void> {
  await database()
    .prepare("INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)")
    .bind(userId, tokenHash, expiresAt)
    .run();
}

export async function findSessionUser(tokenHash: string): Promise<UserRecord | null> {
  return database()
    .prepare(
      `SELECT users.id, users.email, users.display_name, users.password_hash, users.email_verified_at
       FROM sessions JOIN users ON users.id = sessions.user_id
       WHERE sessions.token_hash = ? AND sessions.revoked_at IS NULL AND sessions.expires_at > CURRENT_TIMESTAMP
       LIMIT 1`,
    )
    .bind(tokenHash)
    .first<UserRecord>();
}

export async function touchSession(tokenHash: string): Promise<void> {
  await database()
    .prepare("UPDATE sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE token_hash = ? AND last_seen_at < datetime('now', '-15 minutes')")
    .bind(tokenHash)
    .run();
}

export async function revokeSession(tokenHash: string): Promise<void> {
  await database()
    .prepare("UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE token_hash = ? AND revoked_at IS NULL")
    .bind(tokenHash)
    .run();
}
