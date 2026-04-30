"""Helpers for MVP year-report SQL datasets built from ODS tables."""

SUPPORTED_DATASETS = (
    'data_p01_summary',
    'data_p02_overview',
    'data_p03_explore',
    'data_p05_explore_repeat',
    'data_p06_keyword_source_rows',
    'data_p08_genres',
    'data_p09_genre_evolution',
    'data_p10_taste_inputs',
    'data_p12_spring',
    'data_p13_summer',
    'data_p14_autumn',
    'data_p15_winter',
    'data_p16_artist_of_year',
    'data_p17_weekly_pattern',
    'data_p18_calendar',
    'data_p19_time_bucket',
    'data_p20_night',
    'data_p22_repeat_tracks',
    'data_p23_album_of_year',
    'data_p24_top_albums',
    'data_p25_song_of_year',
    'data_p26_top_tracks',
    'data_p27_top_artists',
    'data_p28_artist_journey',
    'data_p29_artist_rank_detail',
    'data_p30_yearly_artist_rank',
    'data_p31_credits',
)

DATASET_SHAPES = {
    'data_p01_summary': 'one',
    'data_p02_overview': 'one',
    'data_p03_explore': 'one',
    'data_p05_explore_repeat': 'many',
    'data_p06_keyword_source_rows': 'many',
    'data_p08_genres': 'many',
    'data_p09_genre_evolution': 'many',
    'data_p10_taste_inputs': 'many',
    'data_p12_spring': 'one',
    'data_p13_summer': 'one',
    'data_p14_autumn': 'one',
    'data_p15_winter': 'one',
    'data_p16_artist_of_year': 'many',
    'data_p17_weekly_pattern': 'many',
    'data_p18_calendar': 'many',
    'data_p19_time_bucket': 'many',
    'data_p20_night': 'one',
    'data_p22_repeat_tracks': 'many',
    'data_p23_album_of_year': 'one',
    'data_p24_top_albums': 'many',
    'data_p25_song_of_year': 'one',
    'data_p26_top_tracks': 'many',
    'data_p27_top_artists': 'many',
    'data_p28_artist_journey': 'many',
    'data_p29_artist_rank_detail': 'many',
    'data_p30_yearly_artist_rank': 'many',
    'data_p31_credits': 'many',
}

COMMON_BASE_CTE = """
WITH dim_file AS (
  SELECT
    file_name,
    MAX(title) AS title,
    MAX(artist_raw) AS artist_raw,
    MAX(artist_norm) AS artist_norm,
    MAX(album) AS album,
    MAX(COALESCE(NULLIF(genre_norm, ''), NULLIF(genre_lvl2, ''), NULLIF(genre_lvl1, ''), NULLIF(genre, ''))) AS genre
  FROM dbo.ods_jumusic_music_info
  WHERE scan_status = 'SUCCESS'
  GROUP BY file_name
),
raw_base AS (
  SELECT
    DATEADD(
      hour,
      8,
      DATEADD(
        millisecond,
        CONVERT(bigint, p.started_at) % 1000,
        DATEADD(second, CONVERT(bigint, p.started_at) / 1000, CAST('1970-01-01T00:00:00' AS datetime2))
      )
    ) AS played_at,
    CAST(p.start_date_key AS date) AS play_date,
    p.start_date_key AS play_date_key,
    p.start_year AS play_year,
    p.start_month AS play_month,
    p.start_day AS play_day,
    p.start_hour AS play_hour,
    p.start_weekday AS play_weekday,
    p.night_owning_date_key,
    p.night_sort_minute,
    COALESCE(NULLIF(p.aggregate_song_id, ''), NULLIF(p.source_item_id, ''), NULLIF(p.song_file_name, ''), NULLIF(p.title_snapshot, '')) AS track_id,
    COALESCE(NULLIF(p.title_snapshot, ''), NULLIF(d.title, ''), NULLIF(p.song_title, ''), NULLIF(p.song_file_name, '')) AS title,
    COALESCE(NULLIF(p.artist_snapshot, ''), NULLIF(d.artist_raw, ''), NULLIF(p.song_artist, '')) AS artist_raw,
    COALESCE(NULLIF(d.artist_norm, ''), NULLIF(p.artist_snapshot, ''), NULLIF(p.song_artist, '')) AS artist_norm,
    COALESCE(NULLIF(p.album_snapshot, ''), NULLIF(d.album, ''), NULLIF(p.song_album, '')) AS album,
    CAST(p.listened_sec AS decimal(18,6)) AS listened_sec,
    CAST(COALESCE(p.duration_sec, p.song_canonical_duration_sec) AS decimal(18,6)) AS duration_sec,
    COALESCE(NULLIF(d.genre, ''), N'未识别') AS genre
  FROM dbo.ods_jumusic_play_history p
  LEFT JOIN dim_file d
    ON p.song_file_name = d.file_name
),
base AS (
  SELECT
    *,
    MIN(played_at) OVER (PARTITION BY track_id) AS first_played_at
  FROM raw_base
  WHERE play_year = @year
),
all_base AS (
  SELECT
    *,
    MIN(played_at) OVER (PARTITION BY track_id) AS first_played_at
  FROM raw_base
)
""".strip()

DATASET_SQL = {
    'data_p01_summary': f"""
DECLARE @year int = %s;
{COMMON_BASE_CTE}
SELECT TOP 1
  first_played_at,
  DATEDIFF(day, first_played_at, SYSDATETIME()) AS days_since_first_play,
  CAST(DATEDIFF(day, first_played_at, SYSDATETIME()) / 365.2425 AS decimal(10,1)) AS years_since_first_play
FROM all_base
ORDER BY first_played_at ASC;
""".strip(),
    'data_p02_overview': f"""
DECLARE @year int = %s;
{COMMON_BASE_CTE}
SELECT
  COUNT(*) AS year_play_count,
  COUNT(DISTINCT track_id) AS year_distinct_tracks,
  COUNT(DISTINCT CASE WHEN YEAR(first_played_at) = @year THEN track_id END) AS year_new_track_count,
  CAST(
    COUNT(DISTINCT CASE WHEN YEAR(first_played_at) = @year THEN track_id END) * 1.0
    / NULLIF(COUNT(DISTINCT track_id), 0)
    AS decimal(10,4)
  ) AS year_new_track_ratio,
  SUM(listened_sec) AS year_listened_sec,
  FLOOR(SUM(listened_sec) / 3600) AS year_listened_hours,
  FLOOR((SUM(listened_sec) % 3600) / 60) AS year_listened_minutes_remainder
FROM base;
""".strip(),
    'data_p03_explore': f"""
DECLARE @year int = %s;
{COMMON_BASE_CTE},
genre_year AS (
  SELECT DISTINCT TRIM(value) AS genre_name
  FROM base
  CROSS APPLY STRING_SPLIT(REPLACE(REPLACE(ISNULL(genre, ''), '|', '/'), ',', '/'), '/')
  WHERE LTRIM(RTRIM(value)) <> ''
),
genre_all AS (
  SELECT
    TRIM(value) AS genre_name,
    MIN(first_played_at) AS first_seen_at
  FROM all_base
  CROSS APPLY STRING_SPLIT(REPLACE(REPLACE(ISNULL(genre, ''), '|', '/'), ',', '/'), '/')
  WHERE LTRIM(RTRIM(value)) <> ''
  GROUP BY TRIM(value)
)
SELECT
  COUNT(DISTINCT artist_norm) AS artist_count,
  COUNT(DISTINCT CASE WHEN YEAR(first_played_at) = @year THEN artist_norm END) AS new_artist_count,
  (SELECT COUNT(*) FROM genre_year) AS genre_count,
  (SELECT COUNT(*) FROM genre_all WHERE YEAR(first_seen_at) = @year) AS new_genre_count
FROM base;
""".strip(),
    'data_p05_explore_repeat': """
DECLARE @year int = %s;
SELECT 1 AS placeholder WHERE 1 = 0;
""".strip(),
    'data_p06_keyword_source_rows': """
DECLARE @year int = %s;
SELECT 1 AS placeholder WHERE 1 = 0;
""".strip(),
    'data_p08_genres': f"""
DECLARE @year int = %s;
{COMMON_BASE_CTE},
genre_rows AS (
  SELECT
    TRIM(value) AS genre_name,
    listened_sec
  FROM base
  CROSS APPLY STRING_SPLIT(REPLACE(REPLACE(ISNULL(genre, ''), '|', '/'), ',', '/'), '/')
  WHERE LTRIM(RTRIM(value)) <> ''
),
genre_stats AS (
  SELECT
    genre_name,
    COUNT(*) AS play_count,
    SUM(listened_sec) AS listened_sec
  FROM genre_rows
  GROUP BY genre_name
),
genre_total AS (
  SELECT SUM(play_count) AS total_play_count
  FROM genre_stats
)
SELECT TOP 5
  g.genre_name AS genre,
  g.play_count,
  g.listened_sec,
  CAST(g.play_count * 1.0 / NULLIF(t.total_play_count, 0) AS decimal(10,4)) AS ratio
FROM genre_stats g
CROSS JOIN genre_total t
ORDER BY g.play_count DESC, g.listened_sec DESC, g.genre_name;
""".strip(),
    'data_p09_genre_evolution': """
DECLARE @year int = %s;
SELECT 1 AS placeholder WHERE 1 = 0;
""".strip(),
    'data_p10_taste_inputs': """
DECLARE @year int = %s;
SELECT 1 AS placeholder WHERE 1 = 0;
""".strip(),
    'data_p12_spring': f"""
DECLARE @year int = %s;
DECLARE @season nvarchar(20) = N'spring';
-- @season = N'spring'
{COMMON_BASE_CTE},
season_base AS (
  SELECT *
  FROM base
  WHERE play_month IN (3, 4, 5)
),
track_stats AS (
  SELECT
    track_id,
    MAX(title) AS title,
    MAX(artist_raw) AS artist,
    COUNT(*) AS play_count,
    SUM(listened_sec) AS listened_sec,
    COUNT(DISTINCT play_date) AS active_days
  FROM season_base
  GROUP BY track_id
)
SELECT TOP 1
  @season AS season,
  track_id AS top_track_id,
  title,
  artist,
  play_count,
  listened_sec,
  active_days
FROM track_stats
ORDER BY play_count DESC, listened_sec DESC, top_track_id;
""".strip(),
    'data_p13_summer': f"""
DECLARE @year int = %s;
DECLARE @season nvarchar(20) = N'summer';
-- @season = N'summer'
{COMMON_BASE_CTE},
season_base AS (
  SELECT *
  FROM base
  WHERE play_month IN (6, 7, 8)
),
track_stats AS (
  SELECT
    track_id,
    MAX(title) AS title,
    MAX(artist_raw) AS artist,
    COUNT(*) AS play_count,
    SUM(listened_sec) AS listened_sec,
    COUNT(DISTINCT play_date) AS active_days
  FROM season_base
  GROUP BY track_id
)
SELECT TOP 1
  @season AS season,
  track_id AS top_track_id,
  title,
  artist,
  play_count,
  listened_sec,
  active_days
FROM track_stats
ORDER BY play_count DESC, listened_sec DESC, top_track_id;
""".strip(),
    'data_p14_autumn': f"""
DECLARE @year int = %s;
DECLARE @season nvarchar(20) = N'autumn';
-- @season = N'autumn'
{COMMON_BASE_CTE},
season_base AS (
  SELECT *
  FROM base
  WHERE play_month IN (9, 10, 11)
),
track_stats AS (
  SELECT
    track_id,
    MAX(title) AS title,
    MAX(artist_raw) AS artist,
    COUNT(*) AS play_count,
    SUM(listened_sec) AS listened_sec,
    COUNT(DISTINCT play_date) AS active_days
  FROM season_base
  GROUP BY track_id
)
SELECT TOP 1
  @season AS season,
  track_id AS top_track_id,
  title,
  artist,
  play_count,
  listened_sec,
  active_days
FROM track_stats
ORDER BY play_count DESC, listened_sec DESC, top_track_id;
""".strip(),
    'data_p15_winter': f"""
DECLARE @year int = %s;
DECLARE @season nvarchar(20) = N'winter';
-- @season = N'winter'
{COMMON_BASE_CTE},
season_base AS (
  SELECT *
  FROM base
  WHERE play_month IN (12, 1, 2)
),
track_stats AS (
  SELECT
    track_id,
    MAX(title) AS title,
    MAX(artist_raw) AS artist,
    COUNT(*) AS play_count,
    SUM(listened_sec) AS listened_sec,
    COUNT(DISTINCT play_date) AS active_days
  FROM season_base
  GROUP BY track_id
)
SELECT TOP 1
  @season AS season,
  track_id AS top_track_id,
  title,
  artist,
  play_count,
  listened_sec,
  active_days
FROM track_stats
ORDER BY play_count DESC, listened_sec DESC, top_track_id;
""".strip(),
    'data_p16_artist_of_year': f"""
DECLARE @year int = %s;
{COMMON_BASE_CTE},
artist_base AS (
  SELECT
    COALESCE(NULLIF(artist_norm, ''), NULLIF(artist_raw, ''), N'未知歌手') AS artist,
    play_month,
    track_id,
    title,
    listened_sec
  FROM base
),
artist_stats AS (
  SELECT
    artist,
    COUNT(*) AS play_count,
    SUM(listened_sec) AS listened_sec,
    COUNT(DISTINCT play_month) AS active_months
  FROM artist_base
  GROUP BY artist
),
top_artist AS (
  SELECT TOP 1 *
  FROM artist_stats
  ORDER BY play_count DESC, listened_sec DESC, artist
),
month_stats AS (
  SELECT
    a.artist,
    a.play_month AS month_no,
    COUNT(*) AS month_play_count
  FROM artist_base a
  INNER JOIN top_artist t
    ON a.artist = t.artist
  GROUP BY a.artist, a.play_month
),
track_stats AS (
  SELECT
    a.artist,
    a.track_id,
    MAX(a.title) AS title,
    COUNT(*) AS track_play_count,
    ROW_NUMBER() OVER (PARTITION BY a.artist ORDER BY COUNT(*) DESC, MAX(a.title), a.track_id) AS rn
  FROM artist_base a
  INNER JOIN top_artist t
    ON a.artist = t.artist
  GROUP BY a.artist, a.track_id
)
SELECT
  N'summary' AS row_type,
  t.artist,
  t.play_count,
  t.listened_sec,
  t.active_months,
  NULL AS month_no,
  NULL AS month_play_count,
  NULL AS track_id,
  NULL AS title,
  NULL AS track_play_count
FROM top_artist t
UNION ALL
SELECT
  N'month' AS row_type,
  m.artist,
  NULL,
  NULL,
  NULL,
  m.month_no,
  m.month_play_count,
  NULL,
  NULL,
  NULL
FROM month_stats m
UNION ALL
SELECT
  N'track' AS row_type,
  s.artist,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  s.track_id,
  s.title,
  s.track_play_count
FROM track_stats s
WHERE s.rn = 1;
""".strip(),
    'data_p17_weekly_pattern': f"""
DECLARE @year int = %s;
{COMMON_BASE_CTE},
weekday_stats AS (
  SELECT
    play_weekday AS weekday_num,
    CASE play_weekday
      WHEN 1 THEN N'周一'
      WHEN 2 THEN N'周二'
      WHEN 3 THEN N'周三'
      WHEN 4 THEN N'周四'
      WHEN 5 THEN N'周五'
      WHEN 6 THEN N'周六'
      WHEN 7 THEN N'周日'
      ELSE N'未知'
    END AS weekday_cn,
    COUNT(*) AS play_count,
    SUM(listened_sec) AS listened_sec
  FROM base
  GROUP BY play_weekday
),
bucket_stats AS (
  SELECT
    CASE
      WHEN play_hour BETWEEN 0 AND 5 THEN N'late_night'
      WHEN play_hour BETWEEN 6 AND 10 THEN N'morning'
      WHEN play_hour BETWEEN 11 AND 13 THEN N'noon'
      WHEN play_hour BETWEEN 14 AND 17 THEN N'afternoon'
      WHEN play_hour BETWEEN 18 AND 21 THEN N'evening'
      ELSE N'night'
    END AS time_bucket,
    COUNT(*) AS bucket_play_count
  FROM base
  GROUP BY CASE
      WHEN play_hour BETWEEN 0 AND 5 THEN N'late_night'
      WHEN play_hour BETWEEN 6 AND 10 THEN N'morning'
      WHEN play_hour BETWEEN 11 AND 13 THEN N'noon'
      WHEN play_hour BETWEEN 14 AND 17 THEN N'afternoon'
      WHEN play_hour BETWEEN 18 AND 21 THEN N'evening'
      ELSE N'night'
    END
)
SELECT
  N'weekday' AS row_type,
  weekday_num,
  weekday_cn,
  play_count,
  listened_sec,
  NULL AS time_bucket,
  NULL AS bucket_play_count
FROM weekday_stats
UNION ALL
SELECT
  N'bucket' AS row_type,
  NULL,
  NULL,
  NULL,
  NULL,
  time_bucket,
  bucket_play_count
FROM bucket_stats;
""".strip(),
    'data_p18_calendar': f"""
DECLARE @year int = %s;
{COMMON_BASE_CTE},
play_day AS (
  SELECT
    play_date,
    COUNT(*) AS play_count,
    SUM(listened_sec) AS listened_sec
  FROM base
  GROUP BY play_date
)
SELECT
  d.full_date_ymd AS [date],
  ISNULL(p.play_count, 0) AS play_count,
  ISNULL(p.listened_sec, 0) AS listened_sec,
  CASE WHEN p.play_date IS NULL THEN 0 ELSE 1 END AS is_active
FROM dbo.dim_com_date d
LEFT JOIN play_day p
  ON p.play_date = d.record_date
WHERE d.year_number = @year
ORDER BY d.record_date;
""".strip(),
    'data_p19_time_bucket': f"""
DECLARE @year int = %s;
{COMMON_BASE_CTE},
bucketed AS (
  SELECT
    CASE
      WHEN play_hour BETWEEN 0 AND 5 THEN N'late_night'
      WHEN play_hour BETWEEN 6 AND 10 THEN N'morning'
      WHEN play_hour BETWEEN 11 AND 13 THEN N'noon'
      WHEN play_hour BETWEEN 14 AND 17 THEN N'afternoon'
      WHEN play_hour BETWEEN 18 AND 21 THEN N'evening'
      ELSE N'night'
    END AS time_bucket,
    play_hour,
    track_id,
    title,
    artist_raw
  FROM base
),
bucket_stats AS (
  SELECT time_bucket, COUNT(*) AS play_count
  FROM bucketed
  GROUP BY time_bucket
),
hour_stats AS (
  SELECT play_hour, COUNT(*) AS play_count
  FROM bucketed
  GROUP BY play_hour
),
bucket_track_stats AS (
  SELECT
    time_bucket,
    track_id,
    MAX(title) AS title,
    MAX(artist_raw) AS artist_raw,
    COUNT(*) AS play_count,
    ROW_NUMBER() OVER (PARTITION BY time_bucket ORDER BY COUNT(*) DESC, MAX(title), track_id) AS rn
  FROM bucketed
  GROUP BY time_bucket, track_id
)
SELECT
  N'bucket' AS row_type,
  time_bucket,
  NULL AS play_hour,
  NULL AS track_id,
  NULL AS title,
  NULL AS artist_raw,
  play_count
FROM bucket_stats
UNION ALL
SELECT
  N'hour' AS row_type,
  NULL AS time_bucket,
  play_hour,
  NULL,
  NULL,
  NULL,
  play_count
FROM hour_stats
UNION ALL
SELECT
  N'track' AS row_type,
  time_bucket,
  NULL AS play_hour,
  track_id,
  title,
  artist_raw,
  play_count
FROM bucket_track_stats
WHERE rn = 1;
""".strip(),
    'data_p20_night': f"""
DECLARE @year int = %s;
{COMMON_BASE_CTE},
night_rows AS (
  SELECT
    played_at,
    CAST(night_owning_date_key AS date) AS latest_night_date,
    track_id,
    title,
    artist_raw,
    night_sort_minute
  FROM base
  WHERE play_hour < 6
),
latest_row AS (
  SELECT TOP 1 *
  FROM night_rows
  ORDER BY night_sort_minute DESC, played_at DESC
)
SELECT
  (SELECT COUNT(*) FROM night_rows) AS night_session_count,
  latest_night_date,
  CONVERT(varchar(5), played_at, 108) AS latest_night_time,
  track_id,
  title,
  artist_raw,
  night_sort_minute
FROM latest_row;
""".strip(),
    'data_p22_repeat_tracks': f"""
DECLARE @year int = %s;
{COMMON_BASE_CTE},
track_stats AS (
  SELECT
    track_id,
    MAX(title) AS title,
    MAX(artist_raw) AS artist,
    COUNT(*) AS play_count,
    SUM(listened_sec) AS listened_sec,
    COUNT(DISTINCT play_date) AS active_days
  FROM base
  GROUP BY track_id
)
SELECT TOP 10
  track_id,
  title,
  artist,
  play_count,
  listened_sec,
  active_days
FROM track_stats
WHERE play_count >= 2
ORDER BY play_count DESC, listened_sec DESC, track_id;
""".strip(),
    'data_p23_album_of_year': f"""
DECLARE @year int = %s;
{COMMON_BASE_CTE},
album_stats AS (
  SELECT
    COALESCE(NULLIF(album, ''), N'未知专辑') AS album,
    COALESCE(NULLIF(artist_raw, ''), N'未知歌手') AS artist,
    COUNT(*) AS play_count,
    SUM(listened_sec) AS listened_sec,
    COUNT(DISTINCT play_date) AS active_days,
    COUNT(DISTINCT track_id) AS track_count,
    CAST(COUNT(*) * 0.6 + (SUM(listened_sec) / 60.0) * 0.4 AS decimal(18,4)) AS album_score
  FROM base
  GROUP BY COALESCE(NULLIF(album, ''), N'未知专辑'), COALESCE(NULLIF(artist_raw, ''), N'未知歌手')
)
SELECT TOP 1
  album,
  artist,
  play_count,
  listened_sec,
  active_days,
  track_count,
  album_score
FROM album_stats
ORDER BY album_score DESC, play_count DESC, listened_sec DESC, album, artist;
""".strip(),
    'data_p24_top_albums': f"""
DECLARE @year int = %s;
{COMMON_BASE_CTE},
album_stats AS (
  SELECT
    COALESCE(NULLIF(album, ''), N'未知专辑') AS album,
    COALESCE(NULLIF(artist_raw, ''), N'未知歌手') AS artist,
    COUNT(*) AS play_count,
    SUM(listened_sec) AS listened_sec,
    COUNT(DISTINCT play_date) AS active_days,
    COUNT(DISTINCT track_id) AS track_count,
    CAST(COUNT(*) * 0.6 + (SUM(listened_sec) / 60.0) * 0.4 AS decimal(18,4)) AS album_score
  FROM base
  GROUP BY COALESCE(NULLIF(album, ''), N'未知专辑'), COALESCE(NULLIF(artist_raw, ''), N'未知歌手')
)
SELECT TOP 10
  album,
  artist,
  play_count,
  listened_sec,
  active_days,
  track_count,
  album_score
FROM album_stats
ORDER BY album_score DESC, play_count DESC, listened_sec DESC, album, artist;
""".strip(),
    'data_p25_song_of_year': f"""
DECLARE @year int = %s;
{COMMON_BASE_CTE},
track_stats AS (
  SELECT
    track_id,
    MAX(title) AS title,
    MAX(artist_raw) AS artist,
    MAX(album) AS album,
    MIN(first_played_at) AS first_played_at,
    COUNT(*) AS year_play_count,
    SUM(listened_sec) AS year_listened_sec,
    COUNT(DISTINCT play_date) AS year_active_days,
    CAST(COUNT(*) * 0.6 + (SUM(listened_sec) / 60.0) * 0.4 AS decimal(18,4)) AS song_score
  FROM base
  GROUP BY track_id
)
SELECT TOP 1
  track_id,
  title,
  artist,
  album,
  first_played_at,
  year_play_count,
  year_listened_sec,
  year_active_days,
  song_score
FROM track_stats
ORDER BY song_score DESC, year_play_count DESC, year_listened_sec DESC, track_id;
""".strip(),
    'data_p26_top_tracks': f"""
DECLARE @year int = %s;
{COMMON_BASE_CTE},
track_stats AS (
  SELECT
    track_id,
    MAX(title) AS title,
    MAX(artist_raw) AS artist,
    MAX(album) AS album,
    COUNT(*) AS play_count,
    SUM(listened_sec) AS listened_sec,
    COUNT(DISTINCT play_date) AS active_days
  FROM base
  GROUP BY track_id
)
SELECT TOP 20
  track_id,
  title,
  artist,
  album,
  play_count,
  listened_sec,
  active_days
FROM track_stats
ORDER BY play_count DESC, listened_sec DESC, track_id;
""".strip(),
    'data_p27_top_artists': f"""
DECLARE @year int = %s;
{COMMON_BASE_CTE},
artist_stats AS (
  SELECT
    COALESCE(NULLIF(artist_norm, ''), NULLIF(artist_raw, ''), N'未知歌手') AS artist,
    COUNT(*) AS play_count,
    SUM(listened_sec) AS listened_sec
  FROM base
  GROUP BY COALESCE(NULLIF(artist_norm, ''), NULLIF(artist_raw, ''), N'未知歌手')
),
top_artists AS (
  SELECT TOP 10 *
  FROM artist_stats
  ORDER BY play_count DESC, listened_sec DESC, artist
),
track_stats AS (
  SELECT
    COALESCE(NULLIF(b.artist_norm, ''), NULLIF(b.artist_raw, ''), N'未知歌手') AS artist,
    b.track_id,
    MAX(b.title) AS title,
    COUNT(*) AS track_play_count,
    ROW_NUMBER() OVER (
      PARTITION BY COALESCE(NULLIF(b.artist_norm, ''), NULLIF(b.artist_raw, ''), N'未知歌手')
      ORDER BY COUNT(*) DESC, MAX(b.title), b.track_id
    ) AS rn
  FROM base b
  INNER JOIN top_artists a
    ON COALESCE(NULLIF(b.artist_norm, ''), NULLIF(b.artist_raw, ''), N'未知歌手') = a.artist
  GROUP BY COALESCE(NULLIF(b.artist_norm, ''), NULLIF(b.artist_raw, ''), N'未知歌手'), b.track_id
)
SELECT
  N'artist' AS row_type,
  a.artist,
  a.play_count,
  a.listened_sec,
  NULL AS track_id,
  NULL AS title,
  NULL AS track_play_count
FROM top_artists a
UNION ALL
SELECT
  N'track' AS row_type,
  t.artist,
  NULL,
  NULL,
  t.track_id,
  t.title,
  t.track_play_count
FROM track_stats t
WHERE t.rn = 1;
""".strip(),
    'data_p28_artist_journey': f"""
DECLARE @year int = %s;
{COMMON_BASE_CTE},
artist_stats AS (
  SELECT
    COALESCE(NULLIF(artist_norm, ''), NULLIF(artist_raw, ''), N'未知歌手') AS artist,
    COUNT(*) AS play_count,
    SUM(listened_sec) AS listened_sec
  FROM base
  GROUP BY COALESCE(NULLIF(artist_norm, ''), NULLIF(artist_raw, ''), N'未知歌手')
),
top_artist AS (
  SELECT TOP 1 *
  FROM artist_stats
  ORDER BY play_count DESC, listened_sec DESC, artist
),
artist_all AS (
  SELECT
    played_at,
    play_date,
    track_id,
    title,
    COALESCE(NULLIF(artist_norm, ''), NULLIF(artist_raw, ''), N'未知歌手') AS artist
  FROM all_base
),
first_track AS (
  SELECT TOP 1
    a.artist,
    a.track_id,
    a.title,
    a.played_at AS first_played_at
  FROM artist_all a
  INNER JOIN top_artist t
    ON a.artist = t.artist
  ORDER BY a.played_at ASC, a.track_id
),
peak_day AS (
  SELECT TOP 1
    a.artist,
    a.play_date AS peak_date,
    COUNT(*) AS peak_play_count
  FROM artist_all a
  INNER JOIN top_artist t
    ON a.artist = t.artist
  GROUP BY a.artist, a.play_date
  ORDER BY COUNT(*) DESC, a.play_date ASC
)
SELECT
  N'summary' AS row_type,
  t.artist,
  f.first_played_at,
  DATEDIFF(day, f.first_played_at, SYSDATETIME()) AS days_since_first_play,
  NULL AS peak_date,
  NULL AS peak_play_count,
  NULL AS track_id,
  NULL AS title
FROM top_artist t
INNER JOIN first_track f
  ON f.artist = t.artist
UNION ALL
SELECT
  N'first_track' AS row_type,
  artist,
  NULL,
  NULL,
  NULL,
  NULL,
  track_id,
  title
FROM first_track
UNION ALL
SELECT
  N'peak_day' AS row_type,
  artist,
  NULL,
  NULL,
  peak_date,
  peak_play_count,
  NULL,
  NULL
FROM peak_day;
""".strip(),
    'data_p29_artist_rank_detail': f"""
DECLARE @year int = %s;
{COMMON_BASE_CTE},
artist_stats AS (
  SELECT
    COALESCE(NULLIF(artist_norm, ''), NULLIF(artist_raw, ''), N'未知歌手') AS artist,
    COUNT(*) AS play_count,
    SUM(listened_sec) AS listened_sec
  FROM base
  GROUP BY COALESCE(NULLIF(artist_norm, ''), NULLIF(artist_raw, ''), N'未知歌手')
),
ranked_artists AS (
  SELECT TOP 10
    ROW_NUMBER() OVER (ORDER BY play_count DESC, listened_sec DESC, artist) AS artist_rank,
    artist,
    play_count,
    listened_sec
  FROM artist_stats
  ORDER BY play_count DESC, listened_sec DESC, artist
),
track_stats AS (
  SELECT
    r.artist_rank,
    r.artist,
    b.track_id,
    MAX(b.title) AS title,
    COUNT(*) AS track_play_count,
    ROW_NUMBER() OVER (
      PARTITION BY r.artist
      ORDER BY COUNT(*) DESC, MAX(b.title), b.track_id
    ) AS rn
  FROM base b
  INNER JOIN ranked_artists r
    ON COALESCE(NULLIF(b.artist_norm, ''), NULLIF(b.artist_raw, ''), N'未知歌手') = r.artist
  GROUP BY r.artist_rank, r.artist, b.track_id
)
SELECT
  N'artist' AS row_type,
  r.artist_rank,
  r.artist,
  r.play_count,
  r.listened_sec,
  NULL AS track_id,
  NULL AS title,
  NULL AS track_play_count
FROM ranked_artists r
UNION ALL
SELECT
  N'track' AS row_type,
  t.artist_rank,
  t.artist,
  NULL,
  NULL,
  t.track_id,
  t.title,
  t.track_play_count
FROM track_stats t
WHERE t.rn = 1;
""".strip(),
    'data_p30_yearly_artist_rank': f"""
DECLARE @year int = %s;
{COMMON_BASE_CTE},
year_artist_stats AS (
  SELECT
    play_year,
    COALESCE(NULLIF(artist_norm, ''), NULLIF(artist_raw, ''), N'未知歌手') AS artist,
    COUNT(*) AS play_count,
    SUM(listened_sec) AS listened_sec
  FROM all_base
  GROUP BY play_year, COALESCE(NULLIF(artist_norm, ''), NULLIF(artist_raw, ''), N'未知歌手')
),
ranked AS (
  SELECT
    play_year,
    artist,
    play_count,
    listened_sec,
    ROW_NUMBER() OVER (
      PARTITION BY play_year
      ORDER BY play_count DESC, listened_sec DESC, artist
    ) AS artist_rank
  FROM year_artist_stats
)
SELECT
  play_year,
  artist_rank,
  artist,
  play_count,
  listened_sec
FROM ranked
WHERE artist_rank <= 5
ORDER BY play_year ASC, artist_rank ASC;
""".strip(),
    'data_p31_credits': f"""
DECLARE @year int = %s;
{COMMON_BASE_CTE},
composer_rows AS (
  SELECT
    N'composer' AS credit_type,
    TRIM(value) AS credit_name,
    listened_sec
  FROM base
  CROSS APPLY STRING_SPLIT(REPLACE(REPLACE(ISNULL(title, ''), ' feat. ', '/'), '&', '/'), '/')
  WHERE LTRIM(RTRIM(value)) <> ''
),
lyricist_rows AS (
  SELECT
    N'lyricist' AS credit_type,
    TRIM(value) AS credit_name,
    listened_sec
  FROM base
  CROSS APPLY STRING_SPLIT(REPLACE(REPLACE(ISNULL(artist_raw, ''), ';', '/'), ',', '/'), '/')
  WHERE LTRIM(RTRIM(value)) <> ''
),
all_credit_rows AS (
  SELECT * FROM composer_rows
  UNION ALL
  SELECT * FROM lyricist_rows
),
credit_stats AS (
  SELECT
    credit_type,
    credit_name,
    COUNT(*) AS play_count,
    SUM(listened_sec) AS listened_sec,
    ROW_NUMBER() OVER (
      PARTITION BY credit_type
      ORDER BY COUNT(*) DESC, SUM(listened_sec) DESC, credit_name
    ) AS rn
  FROM all_credit_rows
  GROUP BY credit_type, credit_name
)
SELECT
  credit_type,
  credit_name,
  play_count,
  listened_sec
FROM credit_stats
WHERE rn <= 3
ORDER BY credit_type ASC, play_count DESC, listened_sec DESC, credit_name ASC;
""".strip(),
}


def _validate_year(year):
    if not isinstance(year, int):
        raise ValueError('year must be an integer')
    return year


def build_query_plan(year):
    _validate_year(year)
    return {
        dataset_name: {
            'dataset_name': dataset_name,
            'sql': DATASET_SQL[dataset_name],
            'params': (year,),
        }
        for dataset_name in SUPPORTED_DATASETS
    }


def map_rows_to_dataset_payload(dataset_name, rows):
    if dataset_name not in DATASET_SHAPES:
        raise ValueError(f'unsupported dataset: {dataset_name}')

    shape = DATASET_SHAPES[dataset_name]
    if shape == 'one':
        return rows[0] if rows else None
    return list(rows)
