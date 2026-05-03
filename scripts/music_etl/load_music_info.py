"""Load local music info into SQL Server."""

import argparse
import hashlib
import json
import os
import re
import uuid
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse, unquote

import pymssql
from mutagen import File as MutagenFile

TABLE_NAME = 'ods_jumusic_music_info'
ARTIST_ALIAS_TABLE_NAME = 'ods_jumusic_artist_alias'
GENRE_DIM_TABLE_NAME = 'ods_jumusic_genre_dim'
SUPPORTED_EXTENSIONS = {'.mp3', '.flac', '.m4a', '.aac', '.wav', '.ape', '.ogg', '.opus'}
WAREHOUSE_COLUMNS = [
    'batch_id', 'root_path', 'file_path', 'file_name', 'file_ext', 'file_size', 'file_mtime', 'file_md5',
    'is_readable', 'title', 'artist', 'album', 'album_artist', 'track_no', 'disc_no', 'genre', 'year',
    'duration_sec', 'bitrate', 'sample_rate', 'channels',
    'embedded_lyric', 'embedded_lyric_format', 'embedded_lyric_length',
    'genre_essentia_label', 'genre_essentia_raw_label', 'genre_essentia_path', 'genre_essentia_parent', 'genre_essentia_child', 'genre_essentia_depth',
    'genre_essentia_confidence', 'genre_essentia_model', 'genre_essentia_source', 'genre_essentia_inferred_at',
    'scan_status', 'scan_error', 'etl_created_at', 'etl_updated_at'
]
COMMENT_SQLS = [
    f"""
IF EXISTS (
    SELECT 1 FROM sys.tables t WHERE t.object_id = OBJECT_ID(N'dbo.{ARTIST_ALIAS_TABLE_NAME}')
)
BEGIN
    IF EXISTS (
        SELECT 1 FROM sys.extended_properties
        WHERE major_id = OBJECT_ID(N'dbo.{ARTIST_ALIAS_TABLE_NAME}') AND minor_id = 0 AND name = N'MS_Description'
    )
        EXEC sys.sp_dropextendedproperty
            @name=N'MS_Description',
            @level0type=N'SCHEMA', @level0name=N'dbo',
            @level1type=N'TABLE', @level1name=N'{ARTIST_ALIAS_TABLE_NAME}';

    EXEC sys.sp_addextendedproperty
        @name=N'MS_Description',
        @value=N'juMusic 歌手别名映射表；用于把文件名或标签中的别名统一归并到标准歌手名',
        @level0type=N'SCHEMA', @level0name=N'dbo',
        @level1type=N'TABLE', @level1name=N'{ARTIST_ALIAS_TABLE_NAME}';
END
""",
    f"""
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.{ARTIST_ALIAS_TABLE_NAME}') AND name = N'alias_name')
BEGIN
    IF EXISTS (SELECT 1 FROM sys.extended_properties WHERE major_id = OBJECT_ID(N'dbo.{ARTIST_ALIAS_TABLE_NAME}') AND minor_id = COLUMNPROPERTY(OBJECT_ID(N'dbo.{ARTIST_ALIAS_TABLE_NAME}'), 'alias_name', 'ColumnId') AND name = N'MS_Description')
        EXEC sys.sp_dropextendedproperty @name=N'MS_Description', @level0type=N'SCHEMA', @level0name=N'dbo', @level1type=N'TABLE', @level1name=N'{ARTIST_ALIAS_TABLE_NAME}', @level2type=N'COLUMN', @level2name=N'alias_name';
    EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'原始别名，通常来自文件名、标签或人工整理结果', @level0type=N'SCHEMA', @level0name=N'dbo', @level1type=N'TABLE', @level1name=N'{ARTIST_ALIAS_TABLE_NAME}', @level2type=N'COLUMN', @level2name=N'alias_name';
END
""",
    f"""
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.{ARTIST_ALIAS_TABLE_NAME}') AND name = N'alias_name_norm')
BEGIN
    IF EXISTS (SELECT 1 FROM sys.extended_properties WHERE major_id = OBJECT_ID(N'dbo.{ARTIST_ALIAS_TABLE_NAME}') AND minor_id = COLUMNPROPERTY(OBJECT_ID(N'dbo.{ARTIST_ALIAS_TABLE_NAME}'), 'alias_name_norm', 'ColumnId') AND name = N'MS_Description')
        EXEC sys.sp_dropextendedproperty @name=N'MS_Description', @level0type=N'SCHEMA', @level0name=N'dbo', @level1type=N'TABLE', @level1name=N'{ARTIST_ALIAS_TABLE_NAME}', @level2type=N'COLUMN', @level2name=N'alias_name_norm';
    EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'归一化后的别名键；去空白并转小写，用于唯一匹配', @level0type=N'SCHEMA', @level0name=N'dbo', @level1type=N'TABLE', @level1name=N'{ARTIST_ALIAS_TABLE_NAME}', @level2type=N'COLUMN', @level2name=N'alias_name_norm';
END
""",
    f"""
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.{ARTIST_ALIAS_TABLE_NAME}') AND name = N'canonical_artist')
BEGIN
    IF EXISTS (SELECT 1 FROM sys.extended_properties WHERE major_id = OBJECT_ID(N'dbo.{ARTIST_ALIAS_TABLE_NAME}') AND minor_id = COLUMNPROPERTY(OBJECT_ID(N'dbo.{ARTIST_ALIAS_TABLE_NAME}'), 'canonical_artist', 'ColumnId') AND name = N'MS_Description')
        EXEC sys.sp_dropextendedproperty @name=N'MS_Description', @level0type=N'SCHEMA', @level0name=N'dbo', @level1type=N'TABLE', @level1name=N'{ARTIST_ALIAS_TABLE_NAME}', @level2type=N'COLUMN', @level2name=N'canonical_artist';
    EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'标准歌手名；命中 alias 后最终写入歌曲维表 artist 的值', @level0type=N'SCHEMA', @level0name=N'dbo', @level1type=N'TABLE', @level1name=N'{ARTIST_ALIAS_TABLE_NAME}', @level2type=N'COLUMN', @level2name=N'canonical_artist';
END
""",
    f"""
IF EXISTS (
    SELECT 1 FROM sys.tables t WHERE t.object_id = OBJECT_ID(N'dbo.{GENRE_DIM_TABLE_NAME}')
)
BEGIN
    IF EXISTS (
        SELECT 1 FROM sys.extended_properties
        WHERE major_id = OBJECT_ID(N'dbo.{GENRE_DIM_TABLE_NAME}') AND minor_id = 0 AND name = N'MS_Description'
    )
        EXEC sys.sp_dropextendedproperty
            @name=N'MS_Description',
            @level0type=N'SCHEMA', @level0name=N'dbo',
            @level1type=N'TABLE', @level1name=N'{GENRE_DIM_TABLE_NAME}';

    EXEC sys.sp_addextendedproperty
        @name=N'MS_Description',
        @value=N'juMusic 曲风维度表；维护 Essentia 曲风英文标准值、中文展示名以及父子层级关系',
        @level0type=N'SCHEMA', @level0name=N'dbo',
        @level1type=N'TABLE', @level1name=N'{GENRE_DIM_TABLE_NAME}';
END
""",
    f"""
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.{GENRE_DIM_TABLE_NAME}') AND name = N'genre_level')
BEGIN
    IF EXISTS (SELECT 1 FROM sys.extended_properties WHERE major_id = OBJECT_ID(N'dbo.{GENRE_DIM_TABLE_NAME}') AND minor_id = COLUMNPROPERTY(OBJECT_ID(N'dbo.{GENRE_DIM_TABLE_NAME}'), 'genre_level', 'ColumnId') AND name = N'MS_Description')
        EXEC sys.sp_dropextendedproperty @name=N'MS_Description', @level0type=N'SCHEMA', @level0name=N'dbo', @level1type=N'TABLE', @level1name=N'{GENRE_DIM_TABLE_NAME}', @level2type=N'COLUMN', @level2name=N'genre_level';
    EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'曲风层级：parent / child / path', @level0type=N'SCHEMA', @level0name=N'dbo', @level1type=N'TABLE', @level1name=N'{GENRE_DIM_TABLE_NAME}', @level2type=N'COLUMN', @level2name=N'genre_level';
END
""",
    f"""
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.{GENRE_DIM_TABLE_NAME}') AND name = N'genre_en')
BEGIN
    IF EXISTS (SELECT 1 FROM sys.extended_properties WHERE major_id = OBJECT_ID(N'dbo.{GENRE_DIM_TABLE_NAME}') AND minor_id = COLUMNPROPERTY(OBJECT_ID(N'dbo.{GENRE_DIM_TABLE_NAME}'), 'genre_en', 'ColumnId') AND name = N'MS_Description')
        EXEC sys.sp_dropextendedproperty @name=N'MS_Description', @level0type=N'SCHEMA', @level0name=N'dbo', @level1type=N'TABLE', @level1name=N'{GENRE_DIM_TABLE_NAME}', @level2type=N'COLUMN', @level2name=N'genre_en';
    EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'曲风英文标准值或路径键', @level0type=N'SCHEMA', @level0name=N'dbo', @level1type=N'TABLE', @level1name=N'{GENRE_DIM_TABLE_NAME}', @level2type=N'COLUMN', @level2name=N'genre_en';
END
""",
    f"""
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.{GENRE_DIM_TABLE_NAME}') AND name = N'genre_zh')
BEGIN
    IF EXISTS (SELECT 1 FROM sys.extended_properties WHERE major_id = OBJECT_ID(N'dbo.{GENRE_DIM_TABLE_NAME}') AND minor_id = COLUMNPROPERTY(OBJECT_ID(N'dbo.{GENRE_DIM_TABLE_NAME}'), 'genre_zh', 'ColumnId') AND name = N'MS_Description')
        EXEC sys.sp_dropextendedproperty @name=N'MS_Description', @level0type=N'SCHEMA', @level0name=N'dbo', @level1type=N'TABLE', @level1name=N'{GENRE_DIM_TABLE_NAME}', @level2type=N'COLUMN', @level2name=N'genre_zh';
    EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'曲风中文展示名', @level0type=N'SCHEMA', @level0name=N'dbo', @level1type=N'TABLE', @level1name=N'{GENRE_DIM_TABLE_NAME}', @level2type=N'COLUMN', @level2name=N'genre_zh';
END
""",
    f"""
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.{GENRE_DIM_TABLE_NAME}') AND name = N'parent_genre_en')
BEGIN
    IF EXISTS (SELECT 1 FROM sys.extended_properties WHERE major_id = OBJECT_ID(N'dbo.{GENRE_DIM_TABLE_NAME}') AND minor_id = COLUMNPROPERTY(OBJECT_ID(N'dbo.{GENRE_DIM_TABLE_NAME}'), 'parent_genre_en', 'ColumnId') AND name = N'MS_Description')
        EXEC sys.sp_dropextendedproperty @name=N'MS_Description', @level0type=N'SCHEMA', @level0name=N'dbo', @level1type=N'TABLE', @level1name=N'{GENRE_DIM_TABLE_NAME}', @level2type=N'COLUMN', @level2name=N'parent_genre_en';
    EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'父级曲风英文值；path/child 记录可回指 parent', @level0type=N'SCHEMA', @level0name=N'dbo', @level1type=N'TABLE', @level1name=N'{GENRE_DIM_TABLE_NAME}', @level2type=N'COLUMN', @level2name=N'parent_genre_en';
END
""",
    f"""
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.{GENRE_DIM_TABLE_NAME}') AND name = N'child_genre_en')
BEGIN
    IF EXISTS (SELECT 1 FROM sys.extended_properties WHERE major_id = OBJECT_ID(N'dbo.{GENRE_DIM_TABLE_NAME}') AND minor_id = COLUMNPROPERTY(OBJECT_ID(N'dbo.{GENRE_DIM_TABLE_NAME}'), 'child_genre_en', 'ColumnId') AND name = N'MS_Description')
        EXEC sys.sp_dropextendedproperty @name=N'MS_Description', @level0type=N'SCHEMA', @level0name=N'dbo', @level1type=N'TABLE', @level1name=N'{GENRE_DIM_TABLE_NAME}', @level2type=N'COLUMN', @level2name=N'child_genre_en';
    EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'子级曲风英文值；path 记录可回指 child', @level0type=N'SCHEMA', @level0name=N'dbo', @level1type=N'TABLE', @level1name=N'{GENRE_DIM_TABLE_NAME}', @level2type=N'COLUMN', @level2name=N'child_genre_en';
END
""",
    f"""
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.{GENRE_DIM_TABLE_NAME}') AND name = N'genre_depth')
BEGIN
    IF EXISTS (SELECT 1 FROM sys.extended_properties WHERE major_id = OBJECT_ID(N'dbo.{GENRE_DIM_TABLE_NAME}') AND minor_id = COLUMNPROPERTY(OBJECT_ID(N'dbo.{GENRE_DIM_TABLE_NAME}'), 'genre_depth', 'ColumnId') AND name = N'MS_Description')
        EXEC sys.sp_dropextendedproperty @name=N'MS_Description', @level0type=N'SCHEMA', @level0name=N'dbo', @level1type=N'TABLE', @level1name=N'{GENRE_DIM_TABLE_NAME}', @level2type=N'COLUMN', @level2name=N'genre_depth';
    EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'曲风路径层级深度，通常 parent=1, child=1, path=2', @level0type=N'SCHEMA', @level0name=N'dbo', @level1type=N'TABLE', @level1name=N'{GENRE_DIM_TABLE_NAME}', @level2type=N'COLUMN', @level2name=N'genre_depth';
END
""",
    f"""
IF EXISTS (
    SELECT 1 FROM sys.tables t WHERE t.object_id = OBJECT_ID(N'dbo.{TABLE_NAME}')
)
BEGIN
    IF EXISTS (
        SELECT 1 FROM sys.extended_properties
        WHERE major_id = OBJECT_ID(N'dbo.{TABLE_NAME}') AND minor_id = 0 AND name = N'MS_Description'
    )
        EXEC sys.sp_dropextendedproperty
            @name=N'MS_Description',
            @level0type=N'SCHEMA', @level0name=N'dbo',
            @level1type=N'TABLE', @level1name=N'{TABLE_NAME}';

    EXEC sys.sp_addextendedproperty
        @name=N'MS_Description',
        @value=N'juMusic 歌曲维表；存放本地/远端扫描后的音频文件元数据，作为年报与分析维度补充',
        @level0type=N'SCHEMA', @level0name=N'dbo',
        @level1type=N'TABLE', @level1name=N'{TABLE_NAME}';
END
""",
    f"""
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.{TABLE_NAME}') AND name = N'file_path')
BEGIN
    IF EXISTS (SELECT 1 FROM sys.extended_properties WHERE major_id = OBJECT_ID(N'dbo.{TABLE_NAME}') AND minor_id = COLUMNPROPERTY(OBJECT_ID(N'dbo.{TABLE_NAME}'), 'file_path', 'ColumnId') AND name = N'MS_Description')
        EXEC sys.sp_dropextendedproperty @name=N'MS_Description', @level0type=N'SCHEMA', @level0name=N'dbo', @level1type=N'TABLE', @level1name=N'{TABLE_NAME}', @level2type=N'COLUMN', @level2name=N'file_path';
    EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'音频文件完整路径，作为唯一去重键', @level0type=N'SCHEMA', @level0name=N'dbo', @level1type=N'TABLE', @level1name=N'{TABLE_NAME}', @level2type=N'COLUMN', @level2name=N'file_path';
END
""",
    f"""
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.{TABLE_NAME}') AND name = N'duration_sec')
BEGIN
    IF EXISTS (SELECT 1 FROM sys.extended_properties WHERE major_id = OBJECT_ID(N'dbo.{TABLE_NAME}') AND minor_id = COLUMNPROPERTY(OBJECT_ID(N'dbo.{TABLE_NAME}'), 'duration_sec', 'ColumnId') AND name = N'MS_Description')
        EXEC sys.sp_dropextendedproperty @name=N'MS_Description', @level0type=N'SCHEMA', @level0name=N'dbo', @level1type=N'TABLE', @level1name=N'{TABLE_NAME}', @level2type=N'COLUMN', @level2name=N'duration_sec';
    EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'歌曲时长（秒），保留 3 位小数', @level0type=N'SCHEMA', @level0name=N'dbo', @level1type=N'TABLE', @level1name=N'{TABLE_NAME}', @level2type=N'COLUMN', @level2name=N'duration_sec';
END
""",
    f"""
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.{TABLE_NAME}') AND name = N'genre_essentia_label')
BEGIN
    IF EXISTS (SELECT 1 FROM sys.extended_properties WHERE major_id = OBJECT_ID(N'dbo.{TABLE_NAME}') AND minor_id = COLUMNPROPERTY(OBJECT_ID(N'dbo.{TABLE_NAME}'), 'genre_essentia_label', 'ColumnId') AND name = N'MS_Description')
        EXEC sys.sp_dropextendedproperty @name=N'MS_Description', @level0type=N'SCHEMA', @level0name=N'dbo', @level1type=N'TABLE', @level1name=N'{TABLE_NAME}', @level2type=N'COLUMN', @level2name=N'genre_essentia_label';
    EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'外挂 Essentia / Linux 识别得到的主曲风标签', @level0type=N'SCHEMA', @level0name=N'dbo', @level1type=N'TABLE', @level1name=N'{TABLE_NAME}', @level2type=N'COLUMN', @level2name=N'genre_essentia_label';
END
""",
    f"""
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.{TABLE_NAME}') AND name = N'genre_essentia_confidence')
BEGIN
    IF EXISTS (SELECT 1 FROM sys.extended_properties WHERE major_id = OBJECT_ID(N'dbo.{TABLE_NAME}') AND minor_id = COLUMNPROPERTY(OBJECT_ID(N'dbo.{TABLE_NAME}'), 'genre_essentia_confidence', 'ColumnId') AND name = N'MS_Description')
        EXEC sys.sp_dropextendedproperty @name=N'MS_Description', @level0type=N'SCHEMA', @level0name=N'dbo', @level1type=N'TABLE', @level1name=N'{TABLE_NAME}', @level2type=N'COLUMN', @level2name=N'genre_essentia_confidence';
    EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'外挂 Essentia 主曲风置信度，范围通常为 0-1', @level0type=N'SCHEMA', @level0name=N'dbo', @level1type=N'TABLE', @level1name=N'{TABLE_NAME}', @level2type=N'COLUMN', @level2name=N'genre_essentia_confidence';
END
""",
    f"""
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.{TABLE_NAME}') AND name = N'genre_essentia_model')
BEGIN
    IF EXISTS (SELECT 1 FROM sys.extended_properties WHERE major_id = OBJECT_ID(N'dbo.{TABLE_NAME}') AND minor_id = COLUMNPROPERTY(OBJECT_ID(N'dbo.{TABLE_NAME}'), 'genre_essentia_model', 'ColumnId') AND name = N'MS_Description')
        EXEC sys.sp_dropextendedproperty @name=N'MS_Description', @level0type=N'SCHEMA', @level0name=N'dbo', @level1type=N'TABLE', @level1name=N'{TABLE_NAME}', @level2type=N'COLUMN', @level2name=N'genre_essentia_model';
    EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'外挂 Essentia 识别使用的模型标识', @level0type=N'SCHEMA', @level0name=N'dbo', @level1type=N'TABLE', @level1name=N'{TABLE_NAME}', @level2type=N'COLUMN', @level2name=N'genre_essentia_model';
END
""",
    f"""
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.{TABLE_NAME}') AND name = N'genre_essentia_source')
BEGIN
    IF EXISTS (SELECT 1 FROM sys.extended_properties WHERE major_id = OBJECT_ID(N'dbo.{TABLE_NAME}') AND minor_id = COLUMNPROPERTY(OBJECT_ID(N'dbo.{TABLE_NAME}'), 'genre_essentia_source', 'ColumnId') AND name = N'MS_Description')
        EXEC sys.sp_dropextendedproperty @name=N'MS_Description', @level0type=N'SCHEMA', @level0name=N'dbo', @level1type=N'TABLE', @level1name=N'{TABLE_NAME}', @level2type=N'COLUMN', @level2name=N'genre_essentia_source';
    EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'外挂识别来源，例如 wsl / linux / docker', @level0type=N'SCHEMA', @level0name=N'dbo', @level1type=N'TABLE', @level1name=N'{TABLE_NAME}', @level2type=N'COLUMN', @level2name=N'genre_essentia_source';
END
""",
    f"""
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.{TABLE_NAME}') AND name = N'genre_essentia_inferred_at')
BEGIN
    IF EXISTS (SELECT 1 FROM sys.extended_properties WHERE major_id = OBJECT_ID(N'dbo.{TABLE_NAME}') AND minor_id = COLUMNPROPERTY(OBJECT_ID(N'dbo.{TABLE_NAME}'), 'genre_essentia_inferred_at', 'ColumnId') AND name = N'MS_Description')
        EXEC sys.sp_dropextendedproperty @name=N'MS_Description', @level0type=N'SCHEMA', @level0name=N'dbo', @level1type=N'TABLE', @level1name=N'{TABLE_NAME}', @level2type=N'COLUMN', @level2name=N'genre_essentia_inferred_at';
    EXEC sys.sp_addextendedproperty @name=N'MS_Description', @value=N'外挂 Essentia 识别完成时间', @level0type=N'SCHEMA', @level0name=N'dbo', @level1type=N'TABLE', @level1name=N'{TABLE_NAME}', @level2type=N'COLUMN', @level2name=N'genre_essentia_inferred_at';
END
""",
]

VIRTUAL_SINGER_DIR_MARKER = '▓虚拟歌姬▓'


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


def _is_virtual_singer_directory(file_info):
    target = ' '.join([
        str(file_info.get('root_path') or ''),
        str(file_info.get('file_path') or ''),
    ])
    return VIRTUAL_SINGER_DIR_MARKER in target


def _normalize_artist_text(value):
    if not value:
        return None

    text = str(value).strip()
    if not text:
        return None

    text = (
        text.replace('／', '/')
        .replace('、', '/')
        .replace('，', '/')
        .replace(',', '/')
        .replace(';', '/')
        .replace('；', '/')
        .replace('&', '/')
        .replace(' feat. ', '/')
        .replace(' feat ', '/')
        .replace('×', '/')
        .replace(' x ', '/')
        .replace(' X ', '/')
    )
    parts = [part.strip() for part in re.split(r'\s*/\s*', text) if part.strip()]
    deduped = []
    for part in parts:
        if part not in deduped:
            deduped.append(part)
    return ' / '.join(deduped) if deduped else None


def _normalize_artist_alias_key(value):
    if not value:
        return None
    text = str(value).strip()
    if not text:
        return None
    text = re.sub(r'\s+', '', text)
    return text.lower()


def apply_artist_alias_map(artist, artist_alias_map):
    normalized_artist = _normalize_artist_text(artist)
    if not normalized_artist:
        return normalized_artist

    mapped_parts = []
    for part in [item.strip() for item in normalized_artist.split('/') if item.strip()]:
        normalized_key = _normalize_artist_alias_key(part)
        canonical_artist = artist_alias_map.get(normalized_key, part) if normalized_key else part
        canonical_artist = _normalize_artist_text(canonical_artist) or canonical_artist
        if canonical_artist and canonical_artist not in mapped_parts:
            mapped_parts.append(canonical_artist)

    return ' / '.join(mapped_parts) if mapped_parts else normalized_artist


def load_artist_alias_map(conn):
    cursor = conn.cursor()
    cursor.execute(f"""
SELECT alias_name_norm, canonical_artist
FROM dbo.{ARTIST_ALIAS_TABLE_NAME}
WHERE is_enabled = 1
""")
    rows = cursor.fetchall()
    cursor.close()
    return {
        str(alias_name_norm): str(canonical_artist)
        for alias_name_norm, canonical_artist in rows
        if alias_name_norm and canonical_artist
    }


def _extract_artist_from_virtual_singer_filename(file_name):
    stem = Path(file_name).stem.strip()
    if not stem:
        return None

    bracket_match = re.match(r'^[\[\(【](.+?)[\]\)】]', stem)
    if bracket_match:
        return _normalize_artist_text(bracket_match.group(1))

    separator_match = re.match(r'^(.+?)\s*[-—–_/／]\s*.+$', stem)
    if separator_match:
        return _normalize_artist_text(separator_match.group(1))

    return None


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
        'embedded_lyric': None,
        'embedded_lyric_format': None,
        'embedded_lyric_length': None,
        'scan_status': status,
        'scan_error': error,
    }


def _normalize_lyric_text(text):
    if text is None:
        return None
    normalized = str(text).replace('\r\n', '\n').replace('\r', '\n').strip('\ufeff')
    return normalized.strip() or None


def _detect_lyric_format(text):
    if not text:
        return None
    if re.search(r'\[[0-9]{1,2}:[0-9]{2}(?:\.[0-9]{1,3})?\]', text):
        return 'lrc'
    return 'plain'


def _stringify_raw_lyric(value):
    if value is None:
        return None
    if isinstance(value, str):
        return _normalize_lyric_text(value)
    if isinstance(value, (bytes, bytearray)):
        return _normalize_lyric_text(value.decode('utf-8', errors='ignore'))
    if isinstance(value, (list, tuple)):
        joined = '\n'.join(str(item) for item in value if item is not None)
        return _normalize_lyric_text(joined)
    return _normalize_lyric_text(value)


def _extract_lyric_from_easy_tags(tags):
    for key in ('lyrics', 'lyric', 'unsyncedlyrics', 'syncedlyrics'):
        lyric = _stringify_raw_lyric(tags.get(key))
        if lyric:
            return lyric
    return None


def _extract_lyric_from_raw_tags(raw_audio):
    tags = getattr(raw_audio, 'tags', None)
    if not tags:
        return None

    if isinstance(tags, dict):
        for key, value in tags.items():
            key_lower = str(key).lower()
            if any(token in key_lower for token in ('uslt', 'sylt', 'lyric')):
                lyric = _stringify_raw_lyric(value)
                if lyric:
                    return lyric

    values = getattr(tags, 'values', None)
    if callable(values):
        for frame in values():
            for attr in ('text', 'lyrics', 'lyric'):
                lyric = _stringify_raw_lyric(getattr(frame, attr, None))
                if lyric:
                    return lyric
    return None


def extract_audio_metadata(file_path):
    try:
        audio = MutagenFile(file_path, easy=True)
    except Exception as exc:
        return empty_audio_metadata(status='FAILED', error=str(exc))

    tags = audio or {}
    info = getattr(audio, 'info', None)
    result = empty_audio_metadata()
    lyric_text = _extract_lyric_from_easy_tags(tags)
    if lyric_text is None:
        try:
            raw_audio = MutagenFile(file_path, easy=False)
        except Exception:
            raw_audio = None
        lyric_text = _extract_lyric_from_raw_tags(raw_audio)

    lyric_format = _detect_lyric_format(lyric_text)
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
        'embedded_lyric': lyric_text,
        'embedded_lyric_format': lyric_format,
        'embedded_lyric_length': len(lyric_text) if lyric_text else None,
    })
    return result


def split_genre_essentia_label(label):
    raw_label = None if label is None else str(label).strip()
    if not raw_label:
        return {
            'genre_essentia_raw_label': None,
            'genre_essentia_path': None,
            'genre_essentia_parent': None,
            'genre_essentia_child': None,
            'genre_essentia_depth': None,
            'genre_essentia_label': None,
        }

    parts = [part.strip() for part in raw_label.split('---') if part and part.strip()]
    if not parts:
        return {
            'genre_essentia_raw_label': None,
            'genre_essentia_path': None,
            'genre_essentia_parent': None,
            'genre_essentia_child': None,
            'genre_essentia_depth': None,
            'genre_essentia_label': None,
        }

    path = '---'.join(parts)
    parent = parts[0] if len(parts) >= 1 else None
    child = parts[1] if len(parts) >= 2 else None
    display_label = child or parent or path

    return {
        'genre_essentia_raw_label': raw_label,
        'genre_essentia_path': path,
        'genre_essentia_parent': parent,
        'genre_essentia_child': child,
        'genre_essentia_depth': len(parts),
        'genre_essentia_label': display_label,
    }


def load_genre_inference_map(path):
    items = json.loads(Path(path).read_text(encoding='utf-8'))
    result = {}
    for item in items or []:
        file_path = item.get('file_path')
        if not file_path:
            continue
        result[str(file_path)] = dict(item)
    return result


def ensure_table(conn):
    cursor = conn.cursor()
    cursor.execute(f"""
IF OBJECT_ID(N'dbo.{ARTIST_ALIAS_TABLE_NAME}', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.{ARTIST_ALIAS_TABLE_NAME} (
        id bigint identity(1,1) primary key,
        alias_name nvarchar(255) not null,
        alias_name_norm nvarchar(255) not null,
        canonical_artist nvarchar(255) not null,
        is_enabled bit not null default 1,
        note nvarchar(500) null,
        etl_created_at datetime2 not null default sysdatetime(),
        etl_updated_at datetime2 not null default sysdatetime()
    )
END
""")
    cursor.execute(f"""
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes WHERE name = 'ux_{ARTIST_ALIAS_TABLE_NAME}_alias_name_norm' AND object_id = OBJECT_ID(N'dbo.{ARTIST_ALIAS_TABLE_NAME}')
)
BEGIN
    CREATE UNIQUE INDEX ux_{ARTIST_ALIAS_TABLE_NAME}_alias_name_norm
    ON dbo.{ARTIST_ALIAS_TABLE_NAME}(alias_name_norm)
END
""")
    cursor.execute(f"""
IF OBJECT_ID(N'dbo.{GENRE_DIM_TABLE_NAME}', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.{GENRE_DIM_TABLE_NAME} (
        id bigint identity(1,1) primary key,
        genre_level varchar(20) not null,
        genre_en nvarchar(255) not null,
        genre_zh nvarchar(255) null,
        genre_zh_short nvarchar(100) null,
        parent_genre_en nvarchar(255) null,
        child_genre_en nvarchar(255) null,
        genre_depth int null,
        is_enabled bit not null default 1,
        note nvarchar(500) null,
        etl_created_at datetime2 not null default sysdatetime(),
        etl_updated_at datetime2 not null default sysdatetime()
    )
END
""")
    cursor.execute(f"""
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes WHERE name = 'ux_{GENRE_DIM_TABLE_NAME}_level_genre_en' AND object_id = OBJECT_ID(N'dbo.{GENRE_DIM_TABLE_NAME}')
)
BEGIN
    CREATE UNIQUE INDEX ux_{GENRE_DIM_TABLE_NAME}_level_genre_en
    ON dbo.{GENRE_DIM_TABLE_NAME}(genre_level, genre_en)
END
""")
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
        embedded_lyric nvarchar(max) null,
        embedded_lyric_format varchar(20) null,
        embedded_lyric_length int null,
        genre_essentia_label nvarchar(255) null,
        genre_essentia_raw_label nvarchar(255) null,
        genre_essentia_path nvarchar(255) null,
        genre_essentia_parent nvarchar(100) null,
        genre_essentia_child nvarchar(100) null,
        genre_essentia_depth int null,
        genre_essentia_confidence decimal(18,6) null,
        genre_essentia_model nvarchar(255) null,
        genre_essentia_source nvarchar(100) null,
        genre_essentia_inferred_at datetime2 null,
        scan_status varchar(20) not null,
        scan_error nvarchar(2000) null,
        etl_created_at datetime2 not null,
        etl_updated_at datetime2 not null
    )
END
""")
    for alter_sql in [
        f"IF COL_LENGTH('dbo.{TABLE_NAME}', 'genre_essentia_label') IS NULL ALTER TABLE dbo.{TABLE_NAME} ADD genre_essentia_label nvarchar(255) null",
        f"IF COL_LENGTH('dbo.{TABLE_NAME}', 'genre_essentia_raw_label') IS NULL ALTER TABLE dbo.{TABLE_NAME} ADD genre_essentia_raw_label nvarchar(255) null",
        f"IF COL_LENGTH('dbo.{TABLE_NAME}', 'genre_essentia_path') IS NULL ALTER TABLE dbo.{TABLE_NAME} ADD genre_essentia_path nvarchar(255) null",
        f"IF COL_LENGTH('dbo.{TABLE_NAME}', 'genre_essentia_parent') IS NULL ALTER TABLE dbo.{TABLE_NAME} ADD genre_essentia_parent nvarchar(100) null",
        f"IF COL_LENGTH('dbo.{TABLE_NAME}', 'genre_essentia_child') IS NULL ALTER TABLE dbo.{TABLE_NAME} ADD genre_essentia_child nvarchar(100) null",
        f"IF COL_LENGTH('dbo.{TABLE_NAME}', 'genre_essentia_depth') IS NULL ALTER TABLE dbo.{TABLE_NAME} ADD genre_essentia_depth int null",
        f"IF COL_LENGTH('dbo.{TABLE_NAME}', 'genre_essentia_confidence') IS NULL ALTER TABLE dbo.{TABLE_NAME} ADD genre_essentia_confidence decimal(18,6) null",
        f"IF COL_LENGTH('dbo.{TABLE_NAME}', 'genre_essentia_model') IS NULL ALTER TABLE dbo.{TABLE_NAME} ADD genre_essentia_model nvarchar(255) null",
        f"IF COL_LENGTH('dbo.{TABLE_NAME}', 'genre_essentia_source') IS NULL ALTER TABLE dbo.{TABLE_NAME} ADD genre_essentia_source nvarchar(100) null",
        f"IF COL_LENGTH('dbo.{TABLE_NAME}', 'genre_essentia_inferred_at') IS NULL ALTER TABLE dbo.{TABLE_NAME} ADD genre_essentia_inferred_at datetime2 null",
    ]:
        cursor.execute(alter_sql)
    cursor.execute(f"""
IF COL_LENGTH('dbo.{TABLE_NAME}', 'embedded_lyric') IS NULL
BEGIN
    ALTER TABLE dbo.{TABLE_NAME} ADD embedded_lyric nvarchar(max) null
END
""")
    cursor.execute(f"""
IF COL_LENGTH('dbo.{TABLE_NAME}', 'embedded_lyric_format') IS NULL
BEGIN
    ALTER TABLE dbo.{TABLE_NAME} ADD embedded_lyric_format varchar(20) null
END
""")
    cursor.execute(f"""
IF COL_LENGTH('dbo.{TABLE_NAME}', 'embedded_lyric_length') IS NULL
BEGIN
    ALTER TABLE dbo.{TABLE_NAME} ADD embedded_lyric_length int null
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
    for sql in COMMENT_SQLS:
        cursor.execute(sql)
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


def load_existing_music_index(conn, root_path):
    cursor = conn.cursor()
    cursor.execute(
        f"""
SELECT file_path, file_size, file_mtime
FROM dbo.{TABLE_NAME}
WHERE root_path = %s
""",
        (str(Path(root_path)),),
    )
    rows = cursor.fetchall()
    cursor.close()
    return {
        str(file_path): {
            'file_size': file_size,
            'file_mtime': file_mtime,
        }
        for file_path, file_size, file_mtime in rows
        if file_path
    }


def new_batch_id(now=None):
    current = now or datetime.now()
    return current.strftime('%Y%m%d%H%M%S') + '-' + uuid.uuid4().hex[:8]


def build_music_row(file_info, metadata, batch_id, now=None, artist_alias_map=None, genre_inference=None):
    current = now or datetime.now()
    row = {}
    row.update(file_info)
    row.update(metadata)
    if _is_virtual_singer_directory(file_info):
        artist_from_filename = _extract_artist_from_virtual_singer_filename(file_info.get('file_name'))
        if artist_from_filename:
            row['artist'] = artist_from_filename
    row['artist'] = _normalize_artist_text(row.get('artist'))
    if artist_alias_map:
        row['artist'] = apply_artist_alias_map(row.get('artist'), artist_alias_map)
    row['genre_essentia_label'] = None
    row['genre_essentia_raw_label'] = None
    row['genre_essentia_path'] = None
    row['genre_essentia_parent'] = None
    row['genre_essentia_child'] = None
    row['genre_essentia_depth'] = None
    row['genre_essentia_confidence'] = None
    row['genre_essentia_model'] = None
    row['genre_essentia_source'] = None
    row['genre_essentia_inferred_at'] = None
    if genre_inference:
        genre_parts = split_genre_essentia_label(
            genre_inference.get('genre_essentia_raw_label')
            or genre_inference.get('genre_essentia_path')
            or genre_inference.get('genre_essentia_label')
        )
        row.update(genre_parts)
        row['genre_essentia_confidence'] = genre_inference.get('genre_essentia_confidence')
        row['genre_essentia_model'] = genre_inference.get('genre_essentia_model')
        row['genre_essentia_source'] = genre_inference.get('genre_essentia_source')
        row['genre_essentia_inferred_at'] = genre_inference.get('genre_essentia_inferred_at')
    row['batch_id'] = batch_id
    row['etl_created_at'] = current
    row['etl_updated_at'] = current
    return row


def _is_file_changed(file_info, existing_row):
    if not existing_row:
        return True
    return (
        existing_row.get('file_size') != file_info.get('file_size')
        or existing_row.get('file_mtime') != file_info.get('file_mtime')
    )


def collect_music_rows(root_path, batch_id=None, now=None, limit=None, artist_alias_map=None, changed_only=False, existing_index=None, genre_inference_map=None):
    batch = batch_id or new_batch_id(now=now)
    rows = []
    stats = {'scanned': 0, 'success': 0, 'failed': 0, 'skipped': 0}
    for file_path in iter_music_files(root_path):
        if limit is not None and stats['scanned'] >= limit:
            break
        stats['scanned'] += 1
        file_info = extract_file_info(file_path, root_path=root_path)
        if changed_only and not _is_file_changed(file_info, (existing_index or {}).get(file_info['file_path'])):
            stats['skipped'] += 1
            continue
        metadata = extract_audio_metadata(file_path)
        if metadata['scan_status'] == 'FAILED':
            stats['failed'] += 1
        else:
            stats['success'] += 1
        rows.append(build_music_row(
            file_info,
            metadata,
            batch_id=batch,
            now=now,
            artist_alias_map=artist_alias_map,
            genre_inference=(genre_inference_map or {}).get(file_info['file_path']),
        ))
    return rows, stats


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


def load_db_config_from_env():
    db_url = os.environ.get('JUMUSIC_DB_URL')
    if db_url:
        return parse_db_url(db_url)
    return {
        'server': os.environ['JUMUSIC_DB_SERVER'],
        'port': int(os.environ.get('JUMUSIC_DB_PORT', '1433')),
        'user': os.environ['JUMUSIC_DB_USER'],
        'password': os.environ['JUMUSIC_DB_PASSWORD'],
        'database': os.environ['JUMUSIC_DB_DATABASE'],
    }


def connect_db(db_config):
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
    parser.add_argument('--root-path', default=None)
    parser.add_argument('--limit', type=int, default=None)
    parser.add_argument('--changed-only', action='store_true')
    parser.add_argument('--genre-inference-json', default=None)
    return parser.parse_args()


def main(root_path, limit=None, changed_only=False, genre_inference_json=None):
    if not root_path:
        raise ValueError('root_path is required')
    db_config = load_db_config_from_env()
    conn = connect_db(db_config)
    try:
        ensure_table(conn)
        artist_alias_map = load_artist_alias_map(conn)
        existing_index = load_existing_music_index(conn, root_path) if changed_only else None
        genre_inference_map = load_genre_inference_map(genre_inference_json) if genre_inference_json else None
        rows, scan_stats = collect_music_rows(
            root_path,
            limit=limit,
            artist_alias_map=artist_alias_map,
            changed_only=changed_only,
            existing_index=existing_index,
            genre_inference_map=genre_inference_map,
        )
        load_stats = upsert_music_rows(conn, rows)
        print(
            f"done scanned={scan_stats['scanned']} success={scan_stats['success']} "
            f"failed={scan_stats['failed']} skipped={scan_stats['skipped']} "
            f"updated={load_stats['updated']} inserted={load_stats['inserted']}"
        )
        return {'scan': scan_stats, 'load': load_stats}
    finally:
        close_method = getattr(conn, 'close', None)
        if callable(close_method):
            close_method()


if __name__ == '__main__':
    args = parse_args()
    main(root_path=args.root_path, limit=args.limit, changed_only=args.changed_only, genre_inference_json=args.genre_inference_json)
