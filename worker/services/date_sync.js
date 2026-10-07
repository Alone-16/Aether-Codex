/**
 * worker/services/date_sync.js
 * 
 * Pure function: Compares tracked upcoming anime dates against provider data.
 * Zero I/O — fully unit-testable.
 */

/**
 * Computes database updates and notifications for tracked upcoming anime.
 * 
 * @param {object} params
 * @param {Array<object>} params.trackedUpcomingItems - Media rows from DB with status = 'upcoming' and mal_id IS NOT NULL
 * @param {Map<number, object>|Record<number, object>} params.providerDatesMap - Map of malId -> { releaseDate, status, title, provider }
 * @param {string} params.todayStr - Current UTC day string 'YYYY-MM-DD'
 * @returns {{ dbUpdates: Array<object>, notifications: Array<object> }}
 */
export function computeDateUpdates({
  trackedUpcomingItems = [],
  providerDatesMap,
  todayStr,
}) {
  const dbUpdates = [];
  const notifications = [];

  const getProviderInfo = (malId) => {
    if (!malId) return null;
    const numId = Number(malId);
    if (providerDatesMap instanceof Map) {
      return providerDatesMap.get(numId) || null;
    }
    return providerDatesMap?.[numId] || null;
  };

  for (const item of trackedUpcomingItems) {
    const malId = Number(item.mal_id || item.malId);
    if (!malId || Number.isNaN(malId)) continue;
    const userId = item.user_id || item.userId;
    const prov = getProviderInfo(malId);
    const oldDate = item.release_date || item.releaseDate || null;
    const itemSource = item.release_date_source || item.releaseDateSource || null;

    if (!prov) {
      // Even if provider data wasn't in this batch (e.g. subrequest budget / rate limit),
      // if the item already has a confirmed date that has arrived, emit premiere notification!
      if (oldDate && oldDate.length === 10 && todayStr && oldDate <= todayStr) {
        notifications.push({
          userId,
          malId,
          mediaId: item.id,
          type: 'episode_release',
          title: item.title,
          message: `Episode 1 released! Season premiere aired on ${oldDate}.`,
          dedupeKey: `premiere:${malId}`,
          data: {
            old_date: oldDate,
            new_date: oldDate,
            provider: itemSource || 'stored',
            is_released: true,
            media_id: item.id,
            poster: item.cover_image || item.coverImage || null,
          },
        });
      }
      continue;
    }

    const newDate = prov.releaseDate || null;
    const providerName = prov.provider || 'anilist';
    const provStatus = String(prov.status || '').toUpperCase().trim();

    // Check if the anime has started airing / premiered Episode 1
    // (e.g. status is RELEASING or CURRENTLY_AIRING, or date is confirmed and today >= effectiveDate)
    const effectiveDate = newDate || oldDate;
    const isAiringOrReleased = provStatus === 'RELEASING' || provStatus === 'CURRENTLY_AIRING' || (Boolean(effectiveDate && todayStr && effectiveDate <= todayStr));

    // Rule 1: User set a manual date
    if (itemSource === 'manual') {
      if (newDate && newDate !== oldDate) {
        // Do not overwrite manual date. Emit a "date kept" notification once.
        notifications.push({
          userId,
          malId,
          mediaId: item.id,
          type: 'date_change',
          title: item.title,
          message: `Official release date announced: ${newDate}. Kept your manual date (${oldDate}).`,
          dedupeKey: `date_kept:${malId}:${newDate}`,
          data: {
            kept_manual: true,
            manual_date: oldDate,
            official_date: newDate,
            provider: providerName,
          },
        });
      }
      continue;
    }

    // Rule 2: Automatic provider date sync
    const dateChanged = newDate !== oldDate;
    if (dateChanged) {
      // Baseline migration rule: If item had an old provider or no provider source,
      // and oldDate had day precision (YYYY-MM-DD) while provider only has month/year (YYYY-MM or YYYY),
      // do not downgrade day precision silently unless provider is currently airing.
      const oldIsDay = oldDate && oldDate.length === 10;
      const newIsDay = newDate && newDate.length === 10;
      if (oldIsDay && !newIsDay && itemSource && itemSource !== providerName && !isAiringOrReleased) {
        // Keep higher precision
        continue;
      }

      dbUpdates.push({
        id: item.id,
        userId,
        releaseDate: newDate,
        releaseDateSource: providerName,
        releaseDateUpdatedAt: new Date().toISOString(),
      });
    }

    // Rule 3: Notifications
    // Scenario 3A: Episode 1 released / Season premiered!
    if (isAiringOrReleased) {
      notifications.push({
        userId,
        malId,
        mediaId: item.id,
        type: 'episode_release',
        title: item.title,
        message: newDate
          ? `Episode 1 released! Season premiere aired on ${newDate}.`
          : `Episode 1 is now available! The anime has begun airing.`,
        dedupeKey: `premiere:${malId}`,
        data: {
          old_date: oldDate,
          new_date: newDate,
          provider: providerName,
          is_released: true,
          media_id: item.id,
          poster: prov.coverImage || null,
        },
      });
    }
    // Scenario 3B: Upcoming premiere date announced or moved (future date)
    else if (dateChanged) {
      let msg = '';
      if (!oldDate && newDate) {
        msg = `Premiere date confirmed for ${newDate}`;
      } else if (oldDate && !newDate) {
        msg = `Premiere date moved to TBA (previously ${oldDate})`;
      } else {
        msg = `Premiere date changed from ${oldDate} to ${newDate}`;
      }

      const utcDayKey = todayStr ? todayStr.replace(/-/g, '') : new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const dateDedupeTag = newDate || 'tba';

      notifications.push({
        userId,
        malId,
        mediaId: item.id,
        type: 'date_change',
        title: item.title,
        message: msg,
        dedupeKey: `date_change:${malId}:${dateDedupeTag}:${utcDayKey}`,
        data: {
          old_date: oldDate,
          new_date: newDate,
          provider: providerName,
          media_id: item.id,
          poster: prov.coverImage || null,
        },
      });
    }
  }

  return { dbUpdates, notifications };
}
