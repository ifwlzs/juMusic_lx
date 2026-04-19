"""Load local music info into SQL Server."""

import hashlib
from datetime import datetime
from pathlib import Path

from mutagen import File as MutagenFile

TABLE_NAME = 'ods_jumusic_music_info'
SUPPORTED_EXTENSIONS = {'.mp3', '.flac', '.m4a', '.aac', '.wav', '.ape', '.ogg', '.opus'}
WAREHOUSE_COLUMNS = [
    'batch_id', 'root_path', 'file_path', 'file_name', 'file_ext', 'file_size', 'file_mtime', 'file_md5',
    'is_readable', 'title', 'artist', 'album', 'album_artist', 'track_no', 'disc_no', 'genre', 'year',
    'duration_sec', 'bitrate', 'sample_rate', 'channels', 'scan_status', 'scan_error', 'etl_created_at', 'etl_updated_at'
]


def iter_music_files(root_path):
    root = Path(root_path)
    files = []
    for path in root.rglob('*'):
        if path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS:
            files.append(path)
    return sorted(files)


def compute_md5(file_path, chunk_size=1024 * 1024):
    digest = hashlib.md5()
    with open(file_path, 'rb') as handle:
        while True:
            chunk = handle.read(chunk_size)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def extract_file_info(file_path, root_path):
    path = Path(file_path)
    stat = path.stat()
    return {
        'root_path': str(Path(root_path)),
        'file_path': str(path),
        'file_name': path.name,
        'file_ext': path.suffix.lower(),
        'file_size': stat.st_size,
        'file_mtime': datetime.fromtimestamp(stat.st_mtime),
        'file_md5': compute_md5(path),
        'is_readable': True,
    }


def _first_value(tags, *keys):
    for key in keys:
        value = tags.get(key)
        if value:
            if isinstance(value, (list, tuple)):
                return str(value[0]).strip()
            return str(value).strip()
    return None


def _parse_int_prefix(value):
    if not value:
        return None
    head = str(value).split('/', 1)[0].strip()
    return int(head) if head.isdigit() else None


def _row_values(row, columns):
    return [row.get(column) for column in columns]


def empty_audio_metadata(status='SUCCESS', error=None):
    return {
        'title': None,
        'artist': None,
        'album': None,
        'album_artist': None,
        'track_no': None,
        'disc_no': None,
        'genre': None,
        'year': None,
        'duration_sec': None,
        'bitrate': None,
        'sample_rate': None,
        'channels': None,
        'scan_status': status,
        'scan_error': error,
    }


def extract_audio_metadata(file_path):
    try:
        audio = MutagenFile(file_path, easy=True)
    except Exception as exc:
        return empty_audio_metadata(status='FAILED', error=str(exc))

    tags = audio or {}
    info = getattr(audio, 'info', None)
    result = empty_audio_metadata()
    result.update({
        'title': _first_value(tags, 'title'),
        'artist': _first_value(tags, 'artist'),
        'album': _first_value(tags, 'album'),
        'album_artist': _first_value(tags, 'albumartist', 'album artist'),
        'track_no': _parse_int_prefix(_first_value(tags, 'tracknumber')),
        'disc_no': _parse_int_prefix(_first_value(tags, 'discnumber')),
        'genre': _first_value(tags, 'genre'),
        'year': _first_value(tags, 'date', 'year'),
        'duration_sec': round(getattr(info, 'length', 0) or 0, 3) or None,
        'bitrate': getattr(info, 'bitrate', None),
        'sample_rate': getattr(info, 'sample_rate', None),
        'channels': getattr(info, 'channels', None),
    })
    return result


def ensure_table(conn):
    cursor = conn.cursor()
    cursor.execute(f"""
IF OBJECT_ID(N'dbo.{TABLE_NAME}', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.{TABLE_NAME} (
        id bigint identity(1,1) primary key,
        batch_id varchar(64) not null,
        root_path nvarchar(260) not null,
        file_path nvarchar(1024) not null,
        file_name nvarchar(260) not null,
        file_ext varchar(20) null,
        file_size bigint null,
        file_mtime datetime2 null,
        file_md5 varchar(32) null,
        is_readable bit not null default 1,
        title nvarchar(500) null,
        artist nvarchar(500) null,
        album nvarchar(500) null,
        album_artist nvarchar(500) null,
        track_no int null,
        disc_no int null,
        genre nvarchar(200) null,
        year varchar(20) null,
        duration_sec decimal(18,3) null,
        bitrate int null,
        sample_rate int null,
        channels int null,
        scan_status varchar(20) not null,
        scan_error nvarchar(2000) null,
        etl_created_at datetime2 not null,
        etl_updated_at datetime2 not null
    )
END
""")
    cursor.execute(f"""
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes WHERE name = 'ux_{TABLE_NAME}_file_path' AND object_id = OBJECT_ID(N'dbo.{TABLE_NAME}')
)
BEGIN
    CREATE UNIQUE INDEX ux_{TABLE_NAME}_file_path ON dbo.{TABLE_NAME}(file_path)
END
""")
    cursor.execute(f"""
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes WHERE name = 'ix_{TABLE_NAME}_batch_id' AND object_id = OBJECT_ID(N'dbo.{TABLE_NAME}')
)
BEGIN
    CREATE INDEX ix_{TABLE_NAME}_batch_id ON dbo.{TABLE_NAME}(batch_id)
END
""")
    conn.commit()
    cursor.close()


def upsert_music_rows(conn, rows):
    cursor = conn.cursor()
    updated = 0
    inserted = 0
    update_columns = [column for column in WAREHOUSE_COLUMNS if column not in {'file_path', 'etl_created_at'}]
    update_assignments = ', '.join(f"{column} = %s" for column in update_columns)
    insert_columns = ', '.join(WAREHOUSE_COLUMNS)
    insert_placeholders = ', '.join(['%s'] * len(WAREHOUSE_COLUMNS))

    for row in rows:
        update_params = _row_values(row, update_columns) + [row['file_path']]
        cursor.execute(f"UPDATE dbo.{TABLE_NAME} SET {update_assignments} WHERE file_path = %s", update_params)
        if cursor.rowcount:
            updated += 1
            continue
        cursor.execute(
            f"INSERT INTO dbo.{TABLE_NAME} ({insert_columns}) VALUES ({insert_placeholders})",
            _row_values(row, WAREHOUSE_COLUMNS),
        )
        inserted += 1

    conn.commit()
    cursor.close()
    return {'updated': updated, 'inserted': inserted}
