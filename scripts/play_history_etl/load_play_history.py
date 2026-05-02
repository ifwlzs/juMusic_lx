"""Load exported juMusic play history into SQL Server."""

import argparse
import hashlib
import json
import os
import uuid
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse, unquote

try:
    import pymssql
except ImportError:  # pragma: no cover - exercised only outside test env when dependency is missing
    pymssql = None

TABLE_NAME = 'ods_jumusic_play_history'
WAREHOUSE_COLUMNS = [
    'batch_id', 'session_hash', 'aggregate_song_id', 'source_item_id', 'started_at', 'ended_at', 'listened_sec',
    'duration_sec', 'counted_play', 'completion_rate', 'end_reason', 'entry_source', 'seek_count',
    'seek_forward_sec', 'seek_backward_sec', 'start_year', 'start_month', 'start_day', 'start_date_key',
    'start_weekday', 'start_hour', 'start_season', 'start_time_bucket', 'night_owning_date_key',
    'night_sort_minute', 'title_snapshot', 'artist_snapshot', 'album_snapshot', 'provider_type_snapshot',
    'file_name_snapshot', 'remote_path_snapshot', 'list_id_snapshot', 'list_type_snapshot', 'song_title',
    'song_artist', 'song_album', 'song_canonical_duration_sec', 'song_provider_type', 'song_path_or_uri',
    'song_file_name', 'imported_at', 'etl_created_at', 'etl_updated_at'
]
CREATE_TABLE_SQL = f"""
IF OBJECT_ID(N'dbo.{TABLE_NAME}', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.{TABLE_NAME} (
        id bigint identity(1,1) primary key,
        batch_id varchar(64) not null,
        session_hash varchar(32) not null,
        aggregate_song_id nvarchar(1024) not null,
        source_item_id nvarchar(1024) null,
        started_at bigint not null,
        ended_at bigint null,
        listened_sec decimal(18,6) not null,
        duration_sec decimal(18,6) null,
        counted_play bit not null,
        completion_rate decimal(18,10) null,
        end_reason varchar(64) null,
        entry_source varchar(64) null,
        seek_count int null,
        seek_forward_sec decimal(18,6) null,
        seek_backward_sec decimal(18,6) null,
        start_year int null,
        start_month int null,
        start_day int null,
        start_date_key varchar(20) null,
        start_weekday int null,
        start_hour int null,
        start_season varchar(32) null,
        start_time_bucket varchar(32) null,
        night_owning_date_key varchar(20) null,
        night_sort_minute int null,
        title_snapshot nvarchar(500) null,
        artist_snapshot nvarchar(500) null,
        album_snapshot nvarchar(500) null,
        provider_type_snapshot varchar(64) null,
        file_name_snapshot nvarchar(260) null,
        remote_path_snapshot nvarchar(2000) null,
        list_id_snapshot nvarchar(512) null,
        list_type_snapshot varchar(64) null,
        song_title nvarchar(500) null,
        song_artist nvarchar(500) null,
        song_album nvarchar(500) null,
        song_canonical_duration_sec decimal(18,6) null,
        song_provider_type varchar(64) null,
        song_path_or_uri nvarchar(2000) null,
        song_file_name nvarchar(260) null,
        imported_at datetime2 not null,
        etl_created_at datetime2 not null,
        etl_updated_at datetime2 not null
    )
END
"""
ALTER_WIDE_COLUMNS_SQL = [
    f"""
IF OBJECT_ID(N'dbo.{TABLE_NAME}', N'U') IS NOT NULL
   AND COL_LENGTH(N'dbo.{TABLE_NAME}', 'aggregate_song_id') IS NOT NULL
   AND COL_LENGTH(N'dbo.{TABLE_NAME}', 'aggregate_song_id') < 2048
BEGIN
    ALTER TABLE dbo.{TABLE_NAME} ALTER COLUMN aggregate_song_id nvarchar(1024) not null
END
""",
    f"""
IF OBJECT_ID(N'dbo.{TABLE_NAME}', N'U') IS NOT NULL
   AND COL_LENGTH(N'dbo.{TABLE_NAME}', 'source_item_id') IS NOT NULL
   AND COL_LENGTH(N'dbo.{TABLE_NAME}', 'source_item_id') < 2048
BEGIN
    ALTER TABLE dbo.{TABLE_NAME} ALTER COLUMN source_item_id nvarchar(1024) null
END
""",
    f"""
IF OBJECT_ID(N'dbo.{TABLE_NAME}', N'U') IS NOT NULL
   AND COL_LENGTH(N'dbo.{TABLE_NAME}', 'list_id_snapshot') IS NOT NULL
   AND COL_LENGTH(N'dbo.{TABLE_NAME}', 'list_id_snapshot') < 1024
BEGIN
    ALTER TABLE dbo.{TABLE_NAME} ALTER COLUMN list_id_snapshot nvarchar(512) null
END
""",
]
CREATE_UNIQUE_INDEX_SQL = f"""
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes WHERE name = 'ux_{TABLE_NAME}_session_hash' AND object_id = OBJECT_ID(N'dbo.{TABLE_NAME}')
)
BEGIN
    CREATE UNIQUE INDEX ux_{TABLE_NAME}_session_hash ON dbo.{TABLE_NAME}(session_hash)
END
"""
CREATE_BATCH_INDEX_SQL = f"""
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes WHERE name = 'ix_{TABLE_NAME}_batch_id' AND object_id = OBJECT_ID(N'dbo.{TABLE_NAME}')
)
BEGIN
    CREATE INDEX ix_{TABLE_NAME}_batch_id ON dbo.{TABLE_NAME}(batch_id)
END
"""
COMMENT_SQLS = [
    f"""
IF EXISTS (
    SELECT 1
    FROM sys.tables t
    WHERE t.object_id = OBJECT_ID(N'dbo.{TABLE_NAME}')
)
BEGIN
    IF EXISTS (
        SELECT 1
        FROM sys.extended_properties
        WHERE major_id = OBJECT_ID(N'dbo.{TABLE_NAME}')
          AND minor_id = 0
          AND name = N'MS_Description'
    )
        EXEC sys.sp_updateextendedproperty
            @name=N'MS_Description',
            @value=N'juMusic 播放历史事实表；一条记录代表一次播放会话，作为年报与行为分析统一事实底座',
            @level0type=N'SCHEMA', @level0name=N'dbo',
            @level1type=N'TABLE', @level1name=N'{TABLE_NAME}';
    ELSE
        EXEC sys.sp_addextendedproperty
            @name=N'MS_Description',
            @value=N'juMusic 播放历史事实表；一条记录代表一次播放会话，作为年报与行为分析统一事实底座',
            @level0type=N'SCHEMA', @level0name=N'dbo',
            @level1type=N'TABLE', @level1name=N'{TABLE_NAME}';
END
""",
    f"""
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.{TABLE_NAME}') AND name = N'session_hash')
BEGIN
    IF EXISTS (SELECT 1 FROM sys.extended_properties WHERE major_id = OBJECT_ID(N'dbo.{TABLE_NAME}') AND minor_id = COLUMNPROPERTY(OBJECT_ID(N'dbo.{TABLE_NAME}'), 'session_hash', 'ColumnId') AND name = N'MS_Description')
        EXEC sys.sp_updateextendedproperty @name=N'MS_Description', @value=N'播放会话稳定去重哈希', @level0type=N'SCHEMA', @level0name=N'dbo', @level1type=N'TABLE', @level1name=N'{TABLE_NAME}', @level2type=N'COLUMN', @level2name=N'session_hash';
    ELSE
        EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'播放会话稳定去重哈希', @level0type=N'SCHEMA', @level0name=N'dbo', @level1type=N'TABLE', @level1name=N'{TABLE_NAME}', @level2type=N'COLUMN', @level2name=N'session_hash';
END
""",
    f"""
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.{TABLE_NAME}') AND name = N'aggregate_song_id')
BEGIN
    IF EXISTS (SELECT 1 FROM sys.extended_properties WHERE major_id = OBJECT_ID(N'dbo.{TABLE_NAME}') AND minor_id = COLUMNPROPERTY(OBJECT_ID(N'dbo.{TABLE_NAME}'), 'aggregate_song_id', 'ColumnId') AND name = N'MS_Description')
        EXEC sys.sp_updateextendedproperty @name=N'MS_Description', @value=N'聚合歌曲标识；可能包含较长远端来源路径或 URI', @level0type=N'SCHEMA', @level0name=N'dbo', @level1type=N'TABLE', @level1name=N'{TABLE_NAME}', @level2type=N'COLUMN', @level2name=N'aggregate_song_id';
    ELSE
        EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'聚合歌曲标识；可能包含较长远端来源路径或 URI', @level0type=N'SCHEMA', @level0name=N'dbo', @level1type=N'TABLE', @level1name=N'{TABLE_NAME}', @level2type=N'COLUMN', @level2name=N'aggregate_song_id';
END
""",
    f"""
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.{TABLE_NAME}') AND name = N'source_item_id')
BEGIN
    IF EXISTS (SELECT 1 FROM sys.extended_properties WHERE major_id = OBJECT_ID(N'dbo.{TABLE_NAME}') AND minor_id = COLUMNPROPERTY(OBJECT_ID(N'dbo.{TABLE_NAME}'), 'source_item_id', 'ColumnId') AND name = N'MS_Description')
        EXEC sys.sp_updateextendedproperty @name=N'MS_Description', @value=N'来源文件实例标识；可能包含较长远端来源路径或 URI', @level0type=N'SCHEMA', @level0name=N'dbo', @level1type=N'TABLE', @level1name=N'{TABLE_NAME}', @level2type=N'COLUMN', @level2name=N'source_item_id';
    ELSE
        EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'来源文件实例标识；可能包含较长远端来源路径或 URI', @level0type=N'SCHEMA', @level0name=N'dbo', @level1type=N'TABLE', @level1name=N'{TABLE_NAME}', @level2type=N'COLUMN', @level2name=N'source_item_id';
END
""",
    f"""
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.{TABLE_NAME}') AND name = N'listened_sec')
BEGIN
    IF EXISTS (SELECT 1 FROM sys.extended_properties WHERE major_id = OBJECT_ID(N'dbo.{TABLE_NAME}') AND minor_id = COLUMNPROPERTY(OBJECT_ID(N'dbo.{TABLE_NAME}'), 'listened_sec', 'ColumnId') AND name = N'MS_Description')
        EXEC sys.sp_updateextendedproperty @name=N'MS_Description', @value=N'本次会话实际收听时长（秒），保留小数精度', @level0type=N'SCHEMA', @level0name=N'dbo', @level1type=N'TABLE', @level1name=N'{TABLE_NAME}', @level2type=N'COLUMN', @level2name=N'listened_sec';
    ELSE
        EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'本次会话实际收听时长（秒），保留小数精度', @level0type=N'SCHEMA', @level0name=N'dbo', @level1type=N'TABLE', @level1name=N'{TABLE_NAME}', @level2type=N'COLUMN', @level2name=N'listened_sec';
END
""",
]


def _value_or_none(value):
    if value is None:
        return None
    if isinstance(value, str):
        return value
    return str(value)


def _int_or_none(value):
    if value is None:
        return None
    return int(value)


def _float_or_none(value):
    if value is None:
        return None
    return float(value)


def _row_values(row, columns):
    return [row.get(column) for column in columns]


def _chunked(values, size):
    for index in range(0, len(values), size):
        yield values[index:index + size]


def parse_db_url(db_url):
    parsed = urlparse(db_url)
    if parsed.scheme not in ('mssql+pymssql', 'pymssql'):
        raise ValueError('db_url scheme must be mssql+pymssql or pymssql')
    return {
        'server': parsed.hostname,
        'port': parsed.port or 1433,
        'user': unquote(parsed.username) if parsed.username else None,
        'password': unquote(parsed.password) if parsed.password else None,
        'database': parsed.path.lstrip('/') or None,
    }


def new_batch_id(now=None):
    current = now or datetime.now()
    return current.strftime('%Y%m%d%H%M%S') + '-' + uuid.uuid4().hex[:8]


def validate_payload(payload):
    if not isinstance(payload, dict):
        raise ValueError('payload must be an object')
    if payload.get('type') != 'playHistoryExport_v1':
        raise ValueError('payload.type must equal playHistoryExport_v1')
    items = payload.get('items')
    if not isinstance(items, list):
        raise ValueError('payload.items must be a list')
    return payload


def read_payload(input_path):
    with open(input_path, 'r', encoding='utf-8') as handle:
        payload = json.load(handle)
    return validate_payload(payload)


def compute_session_hash(item):
    raw = '|'.join([
        _value_or_none(item.get('aggregateSongId')) or '',
        _value_or_none(item.get('sourceItemId')) or '',
        _value_or_none(item.get('startedAt')) or '',
        _value_or_none(item.get('endedAt')) or '',
        _value_or_none(item.get('listenedSec')) or '',
    ])
    return hashlib.md5(raw.encode('utf-8')).hexdigest()


def normalize_item(item, batch_id, imported_at, now=None):
    current = now or imported_at
    song = item.get('song') or {}
    return {
        'batch_id': batch_id,
        'session_hash': compute_session_hash(item),
        'aggregate_song_id': _value_or_none(item.get('aggregateSongId')),
        'source_item_id': _value_or_none(item.get('sourceItemId')),
        'started_at': _int_or_none(item.get('startedAt')),
        'ended_at': _int_or_none(item.get('endedAt')),
        'listened_sec': _float_or_none(item.get('listenedSec')) or 0.0,
        'duration_sec': _float_or_none(item.get('durationSec')),
        'counted_play': bool(item.get('countedPlay')),
        'completion_rate': _float_or_none(item.get('completionRate')),
        'end_reason': _value_or_none(item.get('endReason')),
        'entry_source': _value_or_none(item.get('entrySource')),
        'seek_count': int(item.get('seekCount') or 0),
        'seek_forward_sec': _float_or_none(item.get('seekForwardSec')) or 0.0,
        'seek_backward_sec': _float_or_none(item.get('seekBackwardSec')) or 0.0,
        'start_year': _int_or_none(item.get('startYear')),
        'start_month': _int_or_none(item.get('startMonth')),
        'start_day': _int_or_none(item.get('startDay')),
        'start_date_key': _value_or_none(item.get('startDateKey')),
        'start_weekday': _int_or_none(item.get('startWeekday')),
        'start_hour': _int_or_none(item.get('startHour')),
        'start_season': _value_or_none(item.get('startSeason')),
        'start_time_bucket': _value_or_none(item.get('startTimeBucket')),
        'night_owning_date_key': _value_or_none(item.get('nightOwningDateKey')),
        'night_sort_minute': _int_or_none(item.get('nightSortMinute')),
        'title_snapshot': _value_or_none(item.get('titleSnapshot')),
        'artist_snapshot': _value_or_none(item.get('artistSnapshot')),
        'album_snapshot': _value_or_none(item.get('albumSnapshot')),
        'provider_type_snapshot': _value_or_none(item.get('providerTypeSnapshot')),
        'file_name_snapshot': _value_or_none(item.get('fileNameSnapshot')),
        'remote_path_snapshot': _value_or_none(item.get('remotePathSnapshot')),
        'list_id_snapshot': _value_or_none(item.get('listIdSnapshot')),
        'list_type_snapshot': _value_or_none(item.get('listTypeSnapshot')),
        'song_title': _value_or_none(song.get('title')),
        'song_artist': _value_or_none(song.get('artist')),
        'song_album': _value_or_none(song.get('album')),
        'song_canonical_duration_sec': _float_or_none(song.get('canonicalDurationSec')),
        'song_provider_type': _value_or_none(song.get('providerType')),
        'song_path_or_uri': _value_or_none(song.get('pathOrUri')),
        'song_file_name': _value_or_none(song.get('fileName')),
        'imported_at': imported_at,
        'etl_created_at': current,
        'etl_updated_at': current,
    }


def load_rows_from_payload(payload, batch_id=None, imported_at=None, now=None):
    validated = validate_payload(payload)
    batch = batch_id or new_batch_id(now=now)
    current = imported_at or datetime.now()
    return [normalize_item(item, batch_id=batch, imported_at=current, now=now or current) for item in validated['items']]


def ensure_table(conn):
    cursor = conn.cursor()
    cursor.execute(CREATE_TABLE_SQL)
    for sql in ALTER_WIDE_COLUMNS_SQL:
        cursor.execute(sql)
    cursor.execute(CREATE_UNIQUE_INDEX_SQL)
    cursor.execute(CREATE_BATCH_INDEX_SQL)
    for sql in COMMENT_SQLS:
        cursor.execute(sql)
    conn.commit()
    cursor.close()


def get_existing_session_hashes(cursor, session_hashes, chunk_size=500):
    existing = set()
    for chunk in _chunked(list(session_hashes), chunk_size):
        placeholders = ', '.join(['%s'] * len(chunk))
        cursor.execute(
            f"SELECT session_hash FROM dbo.{TABLE_NAME} WHERE session_hash IN ({placeholders})",
            chunk,
        )
        existing.update(row[0] for row in cursor.fetchall())
    return existing


def insert_play_history_rows(conn, rows):
    cursor = conn.cursor()
    insert_columns = ', '.join(WAREHOUSE_COLUMNS)
    insert_placeholders = ', '.join(['%s'] * len(WAREHOUSE_COLUMNS))

    unique_rows_by_hash = {}
    duplicate_in_batch = 0
    for row in rows:
        session_hash = row['session_hash']
        if session_hash in unique_rows_by_hash:
            duplicate_in_batch += 1
            continue
        unique_rows_by_hash[session_hash] = row

    unique_rows = list(unique_rows_by_hash.values())
    existing_hashes = get_existing_session_hashes(cursor, unique_rows_by_hash.keys()) if unique_rows else set()
    new_rows = [row for row in unique_rows if row['session_hash'] not in existing_hashes]

    if new_rows:
        cursor.executemany(
            f"INSERT INTO dbo.{TABLE_NAME} ({insert_columns}) VALUES ({insert_placeholders})",
            [_row_values(row, WAREHOUSE_COLUMNS) for row in new_rows],
        )

    conn.commit()
    cursor.close()
    return {
        'inserted': len(new_rows),
        'skipped': len(existing_hashes) + duplicate_in_batch,
    }


def load_db_config(args):
    db_url = getattr(args, 'db_url', None) or os.environ.get('JUMUSIC_DB_URL')
    if db_url:
        return parse_db_url(db_url)
    return {
        'server': args.db_server or os.environ.get('JUMUSIC_DB_SERVER'),
        'port': int(args.db_port or os.environ.get('JUMUSIC_DB_PORT', '1433')),
        'user': args.db_user or os.environ.get('JUMUSIC_DB_USER'),
        'password': args.db_password or os.environ.get('JUMUSIC_DB_PASSWORD'),
        'database': args.db_database or os.environ.get('JUMUSIC_DB_DATABASE'),
    }


def connect_db(db_config):
    if pymssql is None:
        raise RuntimeError('pymssql is required to connect to SQL Server')
    return pymssql.connect(
        server=db_config['server'],
        port=db_config.get('port', 1433),
        user=db_config['user'],
        password=db_config['password'],
        database=db_config['database'],
        charset='utf8',
        tds_version='7.0',
    )


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True)
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--db-url', default=None)
    parser.add_argument('--db-server', default=None)
    parser.add_argument('--db-port', default=None)
    parser.add_argument('--db-user', default=None)
    parser.add_argument('--db-password', default=None)
    parser.add_argument('--db-database', default=None)
    return parser.parse_args()


def main(input_path, dry_run=False, db_config=None, now=None):
    payload = read_payload(input_path)
    current = now or datetime.now()
    rows = load_rows_from_payload(payload, imported_at=current, now=current)

    if dry_run:
        print(f"dry-run rows={len(rows)} inserted=0 skipped=0")
        return {'rows': len(rows), 'load': {'inserted': 0, 'skipped': 0}}

    config = db_config or load_db_config(argparse.Namespace(
        db_server=None,
        db_port=None,
        db_user=None,
        db_password=None,
        db_database=None,
    ))
    conn = connect_db(config)
    try:
        ensure_table(conn)
        load_stats = insert_play_history_rows(conn, rows)
        print(f"done rows={len(rows)} inserted={load_stats['inserted']} skipped={load_stats['skipped']}")
        return {'rows': len(rows), 'load': load_stats}
    finally:
        conn.close()


if __name__ == '__main__':
    args = parse_args()
    main(input_path=Path(args.input), dry_run=args.dry_run, db_config=load_db_config(args))
