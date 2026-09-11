/**
 * Builds a correlated, read-only JSON projection for one post. Both SQL
 * expressions are internal constants supplied by callers, never user input.
 */
export function communityNotesJsonSql(tweetIdSql: string, matchedNotesSql: string) {
  return `COALESCE((
    SELECT json_group_array(json_object(
      'note_id', note_rows.note_id,
      'tweet_id', note_rows.tweet_id,
      'summary', note_rows.summary,
      'classification', note_rows.classification,
      'trustworthy_sources', note_rows.trustworthy_sources,
      'is_media_note', note_rows.is_media_note,
      'is_collaborative_note', note_rows.is_collaborative_note,
      'current_status', note_rows.current_status,
      'created_at', note_rows.note_created_at,
      'status_updated_at', note_rows.status_updated_at,
      'source_snapshot_date', note_rows.source_snapshot_date
    ))
    FROM (
      SELECT cn.*
      FROM community_notes cn
      WHERE cn.current_status = 'CURRENTLY_RATED_HELPFUL'
        AND (
          cn.tweet_id = ${tweetIdSql}
          OR cn.note_id IN (
            SELECT json_extract(match.value, '$.note_id')
            FROM json_each(CASE
              WHEN json_valid(COALESCE(${matchedNotesSql}, '[]'))
              THEN COALESCE(${matchedNotesSql}, '[]')
              ELSE '[]'
            END) AS match
          )
        )
      ORDER BY cn.status_updated_at DESC NULLS LAST, cn.note_id
    ) AS note_rows
  ), '[]')`;
}
