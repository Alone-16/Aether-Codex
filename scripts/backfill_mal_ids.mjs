/**
 * scripts/backfill_mal_ids.mjs
 * 
 * Audits and backfills mal_id for anime entries in D1:
 * - Detects mal_id candidates from `mal_12345` id format.
 * - Audits duplicates on (user_id, genre_id, mal_id) before unique index creation.
 * - Lists unlinked anime entries.
 * 
 * Usage:
 *   node scripts/backfill_mal_ids.mjs          # Dry-run
 *   node scripts/backfill_mal_ids.mjs --apply  # Apply updates to remote D1
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const isApply = process.argv.includes('--apply');
const isLocal = process.argv.includes('--local');

function runD1Query(sql) {
  const envFlag = isLocal ? '--local' : '--env production --remote';
  const flattened = sql.replace(/\r?\n|\r/g, ' ').replace(/\s+/g, ' ').replace(/"/g, '\\"').trim();

  try {
    const cmd = `npx wrangler d1 execute DB ${envFlag} --command "${flattened}" --json`;
    const out = execSync(cmd, { encoding: 'utf8', cwd: process.cwd(), stdio: ['pipe', 'pipe', 'pipe'] });
    const parsed = JSON.parse(out);
    return parsed[0]?.results || [];
  } catch (err) {
    console.error('D1 query error:', err.stderr || err.message);
    throw err;
  }
}


async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  MAL ID Backfill & Audit Tool (${isApply ? 'APPLY MODE' : 'DRY RUN'})`);
  console.log('═══════════════════════════════════════════════════════════\n');

  // 1. Audit potential backfill from `mal_12345` IDs
  console.log('1. Checking entries with id like "mal_%" and NULL mal_id...');
  const candidates = runD1Query(`
    SELECT id, user_id, title, status 
    FROM media 
    WHERE genre_id = 'anime' 
      AND mal_id IS NULL 
      AND id LIKE 'mal_%' 
      AND SUBSTR(id, 5) GLOB '[0-9]*';
  `);

  console.log(`   Found ${candidates.length} candidate rows with mal_* ID format.`);
  if (candidates.length > 0) {
    console.log('   Sample candidates:');
    candidates.slice(0, 5).forEach(c => {
      const derivedMalId = c.id.slice(4);
      console.log(`     - [${c.id}] -> mal_id: ${derivedMalId} | "${c.title}" (${c.status})`);
    });
  }

  // 2. Audit existing or potential duplicates on (user_id, genre_id, mal_id)
  console.log('\n2. Auditing duplicates on (user_id, genre_id, mal_id)...');
  const duplicates = runD1Query(`
    SELECT user_id, genre_id, mal_id, COUNT(*) AS count 
    FROM media 
    WHERE mal_id IS NOT NULL 
    GROUP BY user_id, genre_id, mal_id 
    HAVING count > 1;
  `);

  if (duplicates.length === 0) {
    console.log('   ✓ No duplicates found among currently linked mal_id entries.');
  } else {
    console.warn(`   ⚠️ Found ${duplicates.length} duplicate mal_id groups:`);
    duplicates.forEach(d => console.warn(`     - User ${d.user_id}: mal_id ${d.mal_id} appears ${d.count} times`));
  }

  // 3. Count remaining unlinked anime
  console.log('\n3. Checking total unlinked anime entries...');
  const unlinked = runD1Query(`
    SELECT id, title, status 
    FROM media 
    WHERE genre_id = 'anime' 
      AND mal_id IS NULL;
  `);
  console.log(`   Total unlinked anime: ${unlinked.length}`);

  // 4. If apply mode, perform the UPDATE
  if (isApply) {
    if (candidates.length === 0) {
      console.log('\n✓ No candidate rows to backfill.');
    } else {
      console.log(`\n4. Applying backfill to ${candidates.length} rows...`);
      runD1Query(`
        UPDATE media 
        SET mal_id = CAST(SUBSTR(id, 5) AS INTEGER),
            updated_at = unixepoch()
        WHERE genre_id = 'anime' 
          AND mal_id IS NULL 
          AND id LIKE 'mal_%' 
          AND SUBSTR(id, 5) GLOB '[0-9]*';
      `);
      console.log(`   ✓ Successfully updated ${candidates.length} rows in D1.`);
    }
  } else {
    console.log('\n💡 Dry run complete. Run with --apply to commit backfill changes.');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
