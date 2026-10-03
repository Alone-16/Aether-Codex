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
    if (!item.malId) continue;
    const prov = getProviderInfo(item.malId);
    if (!prov) continue;

    const oldDate = item.releaseDate || item.release_date || null;
    const newDate = prov.releaseDate || null;
    const providerName = prov.provider || 'anilist';
    const itemSource = item.releaseDateSource || item.release_date_source || null;

    // Rule 1: User set a manual date
    if (itemSource === 'manual') {
      if (newDate && newDate !== oldDate) {
        // Do not overwrite manual date. Emit a "date kept" notification once.
        notifications.push({
          userId: item.userId || item.user_id,
          malId: Number(item.malId),
          mediaId: item.id,
          type: 'date_change',
          title: item.title,
          message: `Official release date announced: ${newDate}. Kept your manual date (${oldDate}).`,
          dedupeKey: `date_kept:${item.malId}:${newDate}`,
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
    if (newDate !== oldDate) {
      // Baseline migration rule: If item had an old provider or no provider source,
      // and oldDate had day precision (YYYY-MM-DD) while provider only has month/year (YYYY-MM or YYYY),
      // do not downgrade day precision silently.
      const oldIsDay = oldDate && oldDate.length === 10;
      const newIsDay = newDate && newDate.length === 10;
      if (oldIsDay && !newIsDay && itemSource && itemSource !== providerName) {
        // Keep higher precision
        continue;
      }

      dbUpdates.push({
        id: item.id,
        userId: item.userId || item.user_id,
        releaseDate: newDate,
        releaseDateSource: providerName,
        releaseDateUpdatedAt: new Date().toISOString(),
      });

      // Format notification message
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
        userId: item.userId || item.user_id,
        malId: Number(item.malId),
        mediaId: item.id,
        type: 'date_change',
        title: item.title,
        message: msg,
        dedupeKey: `date_change:${item.malId}:${dateDedupeTag}:${utcDayKey}`,
        data: {
          old_date: oldDate,
          new_date: newDate,
          provider: providerName,
        },
      });
    }
  }

  return { dbUpdates, notifications };
}
