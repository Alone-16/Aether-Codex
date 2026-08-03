// ═══════════════════════════════════════════════════════════════════
//  worker/services/d1.js — Cloudflare D1 Database Helper & FTS5 Indexing
// ═══════════════════════════════════════════════════════════════════

export async function upsertUser(db, user) {
  const query = `
    INSERT INTO users (id, email, name, picture, created_at)
    VALUES (?, ?, ?, ?, unixepoch())
    ON CONFLICT(id) DO UPDATE SET
      email = excluded.email,
      name = excluded.name,
      picture = excluded.picture;
  `;
  await db.prepare(query).bind(user.id, user.email, user.name || null, user.picture || null).run();
}

export async function storeRefreshToken(db, { id, userId, tokenHash, deviceName, ipAddress, expiresAt }) {
  const query = `
    INSERT INTO refresh_tokens (id, user_id, token_hash, device_name, ip_address, expires_at, created_at, last_used_at)
    VALUES (?, ?, ?, ?, ?, ?, unixepoch(), unixepoch());
  `;
  await db.prepare(query).bind(id, userId, tokenHash, deviceName || 'Web Device', ipAddress || 'Unknown', expiresAt).run();
}

export async function findRefreshToken(db, tokenHash) {
  const query = `SELECT * FROM refresh_tokens WHERE token_hash = ? AND expires_at > unixepoch();`;
  return await db.prepare(query).bind(tokenHash).first();
}

export async function deleteRefreshToken(db, tokenHash) {
  const query = `DELETE FROM refresh_tokens WHERE token_hash = ?;`;
  await db.prepare(query).bind(tokenHash).run();
}

export async function deleteAllUserRefreshTokens(db, userId) {
  const query = `DELETE FROM refresh_tokens WHERE user_id = ?;`;
  await db.prepare(query).bind(userId).run();
}

export async function getUserRefreshTokens(db, userId) {
  const query = `SELECT id, device_name, ip_address, expires_at, created_at, last_used_at FROM refresh_tokens WHERE user_id = ? AND expires_at > unixepoch() ORDER BY last_used_at DESC;`;
  const { results } = await db.prepare(query).bind(userId).all();
  return results || [];
}

export async function updateFTSIndex(db, userId, itemId, section, title, content) {
  try {
    // Delete existing FTS entry for item
    await db.prepare(`DELETE FROM search_fts WHERE user_id = ? AND item_id = ?;`).bind(userId, itemId).run();
    if (title || content) {
      await db.prepare(`INSERT INTO search_fts (user_id, item_id, section, title, content) VALUES (?, ?, ?, ?, ?);`)
        .bind(userId, itemId, section, title || '', content || '').run();
    }
  } catch (e) {
    console.warn('[FTS5 Index Error]', e.message);
  }
}

export async function removeFTSIndex(db, userId, itemId) {
  try {
    await db.prepare(`DELETE FROM search_fts WHERE user_id = ? AND item_id = ?;`).bind(userId, itemId).run();
  } catch (e) {}
}
