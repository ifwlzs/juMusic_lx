/*
年终听歌报告（MSSQL 模板）
适用数据：lx_play_history_*.json 的 items 数组（扩展埋点版）

建议导入表（你可按现有 ETL 调整）：
  dbo.play_history (
    aggregateSongId        nvarchar(128)  not null,
    sourceItemId           nvarchar(256)  null,
    startedAt              bigint         not null, -- Unix ms
    endedAt                bigint         not null, -- Unix ms
    listenedSec            int            not null,
    durationSec            int            not null,
    countedPlay            bit            not null,
    completionRate         decimal(8,4)   not null,
    endReason              nvarchar(32)   not null,
    entrySource            nvarchar(32)   not null,
    seekCount              int            not null,
    seekForwardSec         int            not null,
    seekBackwardSec        int            not null,
    startYear              int            not null,
    startMonth             int            not null,
    startDay               int            not null,
    startDateKey           char(10)       not null, -- YYYY-MM-DD
    startWeekday           int            not null, -- 1..7 (Mon..Sun)
    startHour              int            not null, -- 0..23
    startSeason            nvarchar(16)   not null,
    startTimeBucket        nvarchar(16)   not null,
    nightOwningDateKey     char(10)       not null,
    nightSortMinute        int            not null,
    titleSnapshot          nvarchar(300)  null,
    artistSnapshot         nvarchar(300)  null,
    albumSnapshot          nvarchar(300)  null,
    providerTypeSnapshot   nvarchar(32)   null,
    fileNameSnapshot       nvarchar(512)  null,
    remotePathSnapshot     nvarchar(2048) null,
    listIdSnapshot         nvarchar(128)  null,
    listTypeSnapshot       nvarchar(32)   not null
  );

可选维表（用于语言/曲风等需要外部标注的分析）：
  dbo.song_dim(
    aggregateSongId        nvarchar(128) primary key,
    languageTag            nvarchar(64) null, -- 例: zh, ja, en
    genreTag               nvarchar(128) null,
    bpm                    int null,
    composer               nvarchar(256) null,
    lyricist               nvarchar(256) null
  )
*/

DECLARE @year int = 2025;

/* ------------------------------------------------------------
  基础 CTE：全年数据 + 全历史首次出现
-------------------------------------------------------------*/
WITH y AS (
  SELECT *
  FROM dbo.play_history
  WHERE startYear = @year
),
first_seen_song AS (
  SELECT aggregateSongId, MIN(startedAt) AS firstStartedAt
  FROM dbo.play_history
  GROUP BY aggregateSongId
),
first_seen_artist AS (
  SELECT artistSnapshot, MIN(startedAt) AS firstStartedAt
  FROM dbo.play_history
  WHERE ISNULL(artistSnapshot, '') <> ''
  GROUP BY artistSnapshot
),
first_seen_genre AS (
  SELECT sd.genreTag, MIN(ph.startedAt) AS firstStartedAt
  FROM dbo.play_history ph
  JOIN dbo.song_dim sd ON sd.aggregateSongId = ph.aggregateSongId
  WHERE ISNULL(sd.genreTag, '') <> ''
  GROUP BY sd.genreTag
)
SELECT 1 AS _ready_for_reuse;
GO

/* ------------------------------------------------------------
  1) 首次使用时间、已使用天数/年数
-------------------------------------------------------------*/
DECLARE @firstUse datetime2 = (
  SELECT DATEADD(millisecond, MIN(startedAt) % 1000,
         DATEADD(second, MIN(startedAt) / 1000, '1970-01-01'))
  FROM dbo.play_history
);

SELECT
  @firstUse                                   AS firstUseAt,
  DATEDIFF(day, @firstUse, SYSDATETIME())     AS passedDays,
  CAST(DATEDIFF(day, @firstUse, SYSDATETIME()) / 365.0 AS decimal(10,2)) AS passedYears;
GO

/* ------------------------------------------------------------
  2) 年度听歌概览：歌曲数/新歌占比/时长
-------------------------------------------------------------*/
DECLARE @year int = 2025;
WITH y AS (
  SELECT *
  FROM dbo.play_history
  WHERE startYear = @year
),
song_year AS (
  SELECT aggregateSongId, MIN(startedAt) AS firstInYear
  FROM y
  GROUP BY aggregateSongId
),
song_all AS (
  SELECT aggregateSongId, MIN(startedAt) AS firstEver
  FROM dbo.play_history
  GROUP BY aggregateSongId
)
SELECT
  COUNT(*) AS totalSessions,
  COUNT(DISTINCT y.aggregateSongId) AS totalSongs,
  SUM(y.listenedSec) AS totalListenedSec,
  CAST(SUM(y.listenedSec) / 3600.0 AS decimal(12,2)) AS totalListenedHours,
  SUM(CASE WHEN sa.firstEver = sy.firstInYear THEN 1 ELSE 0 END) AS newSongCount,
  CAST(SUM(CASE WHEN sa.firstEver = sy.firstInYear THEN 1 ELSE 0 END) * 1.0
       / NULLIF(COUNT(DISTINCT y.aggregateSongId), 0) AS decimal(8,4)) AS newSongRatio
FROM y
JOIN song_year sy ON sy.aggregateSongId = y.aggregateSongId
JOIN song_all sa ON sa.aggregateSongId = y.aggregateSongId;
GO

/* ------------------------------------------------------------
  3) 年度歌手/曲风覆盖 + 新歌手/新曲风
-------------------------------------------------------------*/
DECLARE @year int = 2025;
WITH y AS (
  SELECT *
  FROM dbo.play_history
  WHERE startYear = @year
),
artist_year AS (
  SELECT artistSnapshot, MIN(startedAt) AS firstInYear
  FROM y
  WHERE ISNULL(artistSnapshot, '') <> ''
  GROUP BY artistSnapshot
),
artist_all AS (
  SELECT artistSnapshot, MIN(startedAt) AS firstEver
  FROM dbo.play_history
  WHERE ISNULL(artistSnapshot, '') <> ''
  GROUP BY artistSnapshot
),
genre_year AS (
  SELECT sd.genreTag, MIN(y.startedAt) AS firstInYear
  FROM y
  JOIN dbo.song_dim sd ON sd.aggregateSongId = y.aggregateSongId
  WHERE ISNULL(sd.genreTag, '') <> ''
  GROUP BY sd.genreTag
),
genre_all AS (
  SELECT sd.genreTag, MIN(ph.startedAt) AS firstEver
  FROM dbo.play_history ph
  JOIN dbo.song_dim sd ON sd.aggregateSongId = ph.aggregateSongId
  WHERE ISNULL(sd.genreTag, '') <> ''
  GROUP BY sd.genreTag
)
SELECT
  (SELECT COUNT(*) FROM artist_year) AS totalArtists,
  (SELECT COUNT(*) FROM artist_year ay JOIN artist_all aa ON aa.artistSnapshot = ay.artistSnapshot
    WHERE ay.firstInYear = aa.firstEver) AS newArtists,
  (SELECT COUNT(*) FROM genre_year) AS totalGenres,
  (SELECT COUNT(*) FROM genre_year gy JOIN genre_all ga ON ga.genreTag = gy.genreTag
    WHERE gy.firstInYear = ga.firstEver) AS newGenres;
GO

/* ------------------------------------------------------------
  4) 外语歌曲统计（需 song_dim.languageTag）
-------------------------------------------------------------*/
DECLARE @year int = 2025;
WITH y AS (
  SELECT ph.*, sd.languageTag
  FROM dbo.play_history ph
  JOIN dbo.song_dim sd ON sd.aggregateSongId = ph.aggregateSongId
  WHERE ph.startYear = @year
)
SELECT
  languageTag,
  COUNT(*) AS sessions,
  SUM(listenedSec) AS listenedSec
FROM y
WHERE ISNULL(languageTag, '') <> ''
  AND languageTag NOT IN ('zh', '中文', 'mandarin')
GROUP BY languageTag
ORDER BY listenedSec DESC;
GO

/* ------------------------------------------------------------
  5) 主动探索 vs 重复所爱（基于 entrySource + 重复播放）
-------------------------------------------------------------*/
DECLARE @year int = 2025;
WITH y AS (
  SELECT *
  FROM dbo.play_history
  WHERE startYear = @year
),
song_days AS (
  SELECT aggregateSongId, startDateKey, COUNT(*) AS daySessions
  FROM y
  GROUP BY aggregateSongId, startDateKey
),
repeat_days AS (
  SELECT COUNT(*) AS repeatDayCount
  FROM song_days
  WHERE daySessions >= 2
)
SELECT
  SUM(CASE WHEN entrySource = 'search' THEN 1 ELSE 0 END) AS activeSearchSessions,
  CAST(SUM(CASE WHEN entrySource = 'search' THEN 1 ELSE 0 END) * 1.0 / NULLIF(COUNT(*), 0) AS decimal(8,4)) AS activeSearchRatio,
  (SELECT repeatDayCount FROM repeat_days) AS repeatLoveDays,
  COUNT(*) AS totalSessions
FROM y;
GO

/* ------------------------------------------------------------
  8) 年度曲风 TOP5（需 song_dim.genreTag）
-------------------------------------------------------------*/
DECLARE @year int = 2025;
SELECT TOP 5
  sd.genreTag,
  COUNT(*) AS sessions,
  SUM(ph.listenedSec) AS listenedSec
FROM dbo.play_history ph
JOIN dbo.song_dim sd ON sd.aggregateSongId = ph.aggregateSongId
WHERE ph.startYear = @year
  AND ISNULL(sd.genreTag, '') <> ''
GROUP BY sd.genreTag
ORDER BY listenedSec DESC, sessions DESC;
GO

/* ------------------------------------------------------------
  12~15) 四季最爱歌曲（按 listenedSec）
-------------------------------------------------------------*/
DECLARE @year int = 2025;
WITH season_song AS (
  SELECT
    startSeason,
    aggregateSongId,
    MAX(titleSnapshot) AS titleSnapshot,
    MAX(artistSnapshot) AS artistSnapshot,
    SUM(listenedSec) AS listenedSec
  FROM dbo.play_history
  WHERE startYear = @year
  GROUP BY startSeason, aggregateSongId
),
ranked AS (
  SELECT *,
         ROW_NUMBER() OVER(PARTITION BY startSeason ORDER BY listenedSec DESC) AS rn
  FROM season_song
)
SELECT startSeason, aggregateSongId, titleSnapshot, artistSnapshot, listenedSec
FROM ranked
WHERE rn = 1
ORDER BY CASE startSeason
  WHEN 'spring' THEN 1
  WHEN 'summer' THEN 2
  WHEN 'autumn' THEN 3
  WHEN 'winter' THEN 4
  ELSE 99
END;
GO

/* ------------------------------------------------------------
  16/29) 年度歌手榜单
-------------------------------------------------------------*/
DECLARE @year int = 2025;
SELECT TOP 12
  artistSnapshot,
  COUNT(*) AS sessions,
  SUM(listenedSec) AS listenedSec,
  SUM(CASE WHEN countedPlay = 1 THEN 1 ELSE 0 END) AS countedPlays
FROM dbo.play_history
WHERE startYear = @year
  AND ISNULL(artistSnapshot, '') <> ''
GROUP BY artistSnapshot
ORDER BY listenedSec DESC, sessions DESC;
GO

/* ------------------------------------------------------------
  17) 一周听歌活跃（含 BPM 需要 song_dim.bpm）
-------------------------------------------------------------*/
DECLARE @year int = 2025;
SELECT
  ph.startWeekday,
  COUNT(*) AS sessions,
  SUM(ph.listenedSec) AS listenedSec,
  AVG(CAST(sd.bpm AS decimal(10,2))) AS avgBpm
FROM dbo.play_history ph
LEFT JOIN dbo.song_dim sd ON sd.aggregateSongId = ph.aggregateSongId
WHERE ph.startYear = @year
GROUP BY ph.startWeekday
ORDER BY ph.startWeekday;
GO

/* ------------------------------------------------------------
  18) 年度听歌日历：活跃天数 + 最长连续天数
-------------------------------------------------------------*/
DECLARE @year int = 2025;
WITH d AS (
  SELECT DISTINCT CAST(startDateKey AS date) AS d
  FROM dbo.play_history
  WHERE startYear = @year
),
seq AS (
  SELECT d,
         DATEADD(day, -ROW_NUMBER() OVER(ORDER BY d), d) AS grp
  FROM d
),
islands AS (
  SELECT MIN(d) AS startDate, MAX(d) AS endDate, COUNT(*) AS streakDays
  FROM seq
  GROUP BY grp
)
SELECT
  (SELECT COUNT(*) FROM d) AS activeDays,
  MAX(streakDays) AS maxStreakDays
FROM islands;
GO

/* ------------------------------------------------------------
  19) 年度最活跃时间段 + 代表歌曲
-------------------------------------------------------------*/
DECLARE @year int = 2025;
WITH bucket_song AS (
  SELECT
    startTimeBucket,
    aggregateSongId,
    MAX(titleSnapshot) AS titleSnapshot,
    MAX(artistSnapshot) AS artistSnapshot,
    COUNT(*) AS sessions,
    SUM(listenedSec) AS listenedSec
  FROM dbo.play_history
  WHERE startYear = @year
  GROUP BY startTimeBucket, aggregateSongId
),
bucket_rank AS (
  SELECT startTimeBucket, SUM(sessions) AS bucketSessions
  FROM bucket_song
  GROUP BY startTimeBucket
),
song_rank AS (
  SELECT *,
         ROW_NUMBER() OVER(PARTITION BY startTimeBucket ORDER BY listenedSec DESC, sessions DESC) AS rn
  FROM bucket_song
)
SELECT TOP 1
  br.startTimeBucket,
  br.bucketSessions,
  sr.aggregateSongId,
  sr.titleSnapshot,
  sr.artistSnapshot
FROM bucket_rank br
LEFT JOIN song_rank sr
  ON sr.startTimeBucket = br.startTimeBucket AND sr.rn = 1
ORDER BY br.bucketSessions DESC;
GO

/* ------------------------------------------------------------
  20) 熬夜统计（按 nightOwningDateKey + 夜间分钟）
-------------------------------------------------------------*/
DECLARE @year int = 2025;
WITH y AS (
  SELECT *
  FROM dbo.play_history
  WHERE startYear = @year
),
late_night AS (
  SELECT
    nightOwningDateKey,
    MAX(nightSortMinute) AS latestMinute
  FROM y
  GROUP BY nightOwningDateKey
  HAVING MAX(nightSortMinute) >= (24 * 60 + 120) -- 至少到次日 02:00
)
SELECT
  COUNT(*) AS lateNightCount,
  MAX(latestMinute) AS latestMinuteInYear
FROM late_night;
GO

/* ------------------------------------------------------------
  22) 年度反复听歌曲（按播放次数）
-------------------------------------------------------------*/
DECLARE @year int = 2025;
SELECT TOP 20
  aggregateSongId,
  MAX(titleSnapshot) AS titleSnapshot,
  MAX(artistSnapshot) AS artistSnapshot,
  COUNT(*) AS sessions,
  SUM(listenedSec) AS listenedSec
FROM dbo.play_history
WHERE startYear = @year
GROUP BY aggregateSongId
ORDER BY sessions DESC, listenedSec DESC;
GO

/* ------------------------------------------------------------
  23/24) 年度专辑之最与 TOPN
-------------------------------------------------------------*/
DECLARE @year int = 2025;
SELECT TOP 10
  albumSnapshot,
  MAX(artistSnapshot) AS artistSnapshot,
  COUNT(*) AS sessions,
  COUNT(DISTINCT startDateKey) AS activeDays,
  SUM(listenedSec) AS listenedSec
FROM dbo.play_history
WHERE startYear = @year
  AND ISNULL(albumSnapshot, '') <> ''
GROUP BY albumSnapshot
ORDER BY listenedSec DESC, sessions DESC;
GO

/* ------------------------------------------------------------
  25/26) 年度歌曲 + 歌单（歌曲/歌手/次数）
-------------------------------------------------------------*/
DECLARE @year int = 2025;
WITH y AS (
  SELECT *
  FROM dbo.play_history
  WHERE startYear = @year
),
song_all AS (
  SELECT aggregateSongId, MIN(startedAt) AS firstEver
  FROM dbo.play_history
  GROUP BY aggregateSongId
)
SELECT
  y.aggregateSongId,
  MAX(y.titleSnapshot) AS titleSnapshot,
  MAX(y.artistSnapshot) AS artistSnapshot,
  sa.firstEver,
  COUNT(*) AS sessions,
  COUNT(DISTINCT y.startDateKey) AS activeDays,
  SUM(y.listenedSec) AS listenedSec
FROM y
JOIN song_all sa ON sa.aggregateSongId = y.aggregateSongId
GROUP BY y.aggregateSongId, sa.firstEver
ORDER BY listenedSec DESC, sessions DESC;
GO

/* ------------------------------------------------------------
  31) 年度词曲人（需 song_dim.composer / lyricist）
-------------------------------------------------------------*/
DECLARE @year int = 2025;
SELECT TOP 20
  sd.composer,
  sd.lyricist,
  COUNT(*) AS sessions,
  SUM(ph.listenedSec) AS listenedSec
FROM dbo.play_history ph
JOIN dbo.song_dim sd ON sd.aggregateSongId = ph.aggregateSongId
WHERE ph.startYear = @year
  AND (ISNULL(sd.composer, '') <> '' OR ISNULL(sd.lyricist, '') <> '')
GROUP BY sd.composer, sd.lyricist
ORDER BY listenedSec DESC, sessions DESC;
GO

/* ------------------------------------------------------------
  备注
  - 第 6 页关键词、11 页封面颜色，需要你在 ETL 补充词元/颜色维度后统计
  - 第 27~30 页历年轨迹，可将 @year 去掉并按 startYear 分组
  - 所有 startedAt/endedAt 若需本地时区展示，建议统一在应用层或报表层转换
-------------------------------------------------------------*/
