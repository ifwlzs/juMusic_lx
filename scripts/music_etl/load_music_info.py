"""Load local music info into SQL Server."""

import argparse
import hashlib
import json
import os
import re
import shlex
import time
import uuid
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse, unquote

try:
    import paramiko
except ImportError:  # pragma: no cover
    paramiko = None

import pymssql
from mutagen import File as MutagenFile

TABLE_NAME = 'ods_jumusic_music_info'
ARTIST_ALIAS_TABLE_NAME = 'ods_jumusic_artist_alias'
GENRE_DIM_TABLE_NAME = 'ods_jumusic_genre_dim'
SUPPORTED_EXTENSIONS = {'.mp3', '.flac', '.m4a', '.aac', '.wav', '.ape', '.ogg', '.opus'}
# 默认本地音乐根目录，便于后续新增歌曲后直接执行脚本即可。
DEFAULT_LOCAL_MUSIC_ROOT = r'Z:\Music'
# VM 共享目录固定映射到宿主机音乐库，用于远端 Essentia 曲风识别。
DEFAULT_VM_MUSIC_ROOT = '/mnt/hgfs/Music'
# VM 上的曲风识别脚本、模型与工作目录都固定为当前挑战环境已验证路径。
DEFAULT_VM_GENRE_WORKDIR = '/root/juMusic_tmp'
DEFAULT_VM_GENRE_SCRIPT = f'{DEFAULT_VM_GENRE_WORKDIR}/run_essentia_genre_inference.py'
DEFAULT_VM_EMBEDDING_MODEL = f'{DEFAULT_VM_GENRE_WORKDIR}/discogs-effnet-bs64-1.pb'
DEFAULT_VM_CLASSIFIER_MODEL = f'{DEFAULT_VM_GENRE_WORKDIR}/genre_discogs400-discogs-effnet-1.pb'
DEFAULT_VM_METADATA_JSON = f'{DEFAULT_VM_GENRE_WORKDIR}/genre_discogs400-discogs-effnet-1.json'
DEFAULT_VM_GENRE_MODEL = 'essentia-external'
DEFAULT_VM_GENRE_SOURCE = 'vm'
DEFAULT_VM_TOP_K = 20
# 曲风推理默认按更小批次循环提交，避免单批次卡太久。
DEFAULT_VM_GENRE_BATCH_SIZE = 5
# 单批次远端推理最长运行秒数，超时后直接终止该批并继续后续批次。
DEFAULT_VM_GENRE_TIMEOUT_SEC = 90
# 超时或异常批次写入固定来源，避免坏文件无限重试。
DEFAULT_VM_GENRE_SKIP_SOURCE = 'vm-timeout-skip'
# VM 默认连接参数固定为当前用户给定值，同时仍允许通过环境变量覆盖。
DEFAULT_VM_CONFIG = {
    'host': '192.168.194.133',
    'port': 22,
    'username': 'root',
    'password': 'root',
}
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


def empty_file_info(file_path, root_path, error=None):
    """构造文件层兜底信息，避免单个文件瞬时不可读时中断整批补数。"""
    path = Path(file_path)
    return {
        'root_path': str(Path(root_path)),
        'file_path': str(path),
        'file_name': path.name,
        'file_ext': path.suffix.lower(),
        'file_size': None,
        'file_mtime': None,
        'file_md5': None,
        'is_readable': False,
        'file_error': error,
    }


def extract_file_info(file_path, root_path):
    """提取文件基础信息；若文件在扫描过程中消失，则返回失败占位信息继续后续流程。"""
    path = Path(file_path)
    result = empty_file_info(path, root_path=root_path)
    try:
        stat = path.stat()
        result['file_size'] = stat.st_size
        result['file_mtime'] = datetime.fromtimestamp(stat.st_mtime)
    except OSError as exc:
        result['file_error'] = str(exc)
        return result

    try:
        result['file_md5'] = compute_md5(path)
    except OSError as exc:
        result['file_error'] = str(exc)
        return result

    result['is_readable'] = True
    result.pop('file_error', None)
    return result


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


def fetch_pending_genre_file_paths(conn, batch_id, limit=None):
    """查询本批次仍未完成 Essentia 曲风识别的歌曲路径。"""
    cursor = conn.cursor()
    cursor.execute(f"""
SELECT file_path
FROM dbo.{TABLE_NAME}
WHERE batch_id = %s
  AND scan_status = 'SUCCESS'
  AND ISNULL(genre_essentia_source, '') <> %s
  AND (
        genre_essentia_label IS NULL
        OR LTRIM(RTRIM(genre_essentia_label)) = ''
        OR genre_essentia_path IS NULL
        OR LTRIM(RTRIM(genre_essentia_path)) = ''
      )
ORDER BY file_path
""", [batch_id, DEFAULT_VM_GENRE_SKIP_SOURCE])
    rows = cursor.fetchall()
    cursor.close()
    file_paths = [row[0] for row in rows if row and row[0]]
    if limit is not None:
        return file_paths[:limit]
    return file_paths


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
    """扫描歌曲文件并构造入仓行；单个文件异常时只落失败记录，不影响整批继续。"""
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

        # 文件层已经判定不可读时，直接落失败记录并继续，避免整批任务被单个坏路径打断。
        if not file_info.get('is_readable', True):
            metadata = empty_audio_metadata(
                status='FAILED',
                error=file_info.get('file_error') or 'file is not readable',
            )
        else:
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


def load_vm_config_from_env():
    """读取 VM 连接配置；默认值固定为当前共享目录与 root 账户。"""
    return {
        'host': os.environ.get('JUMUSIC_VM_HOST', DEFAULT_VM_CONFIG['host']),
        'port': int(os.environ.get('JUMUSIC_VM_PORT', str(DEFAULT_VM_CONFIG['port']))),
        'username': os.environ.get('JUMUSIC_VM_USER', DEFAULT_VM_CONFIG['username']),
        'password': os.environ.get('JUMUSIC_VM_PASSWORD', DEFAULT_VM_CONFIG['password']),
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


def windows_path_to_vm_path(file_path):
    """把 Windows 音乐路径映射为 VM 共享目录路径。"""
    normalized = str(file_path).replace('/', '\\')
    prefix = DEFAULT_LOCAL_MUSIC_ROOT.rstrip('\\')
    if normalized.lower().startswith(prefix.lower()):
        suffix = normalized[len(prefix):].lstrip('\\').replace('\\', '/')
        return f'{DEFAULT_VM_MUSIC_ROOT}/{suffix}' if suffix else DEFAULT_VM_MUSIC_ROOT
    return normalized.replace('\\', '/')


def vm_path_to_windows_path(file_path):
    """把 VM 共享目录路径恢复为 Windows 音乐路径。"""
    normalized = str(file_path).replace('\\', '/')
    prefix = DEFAULT_VM_MUSIC_ROOT.rstrip('/')
    if normalized.startswith(prefix):
        suffix = normalized[len(prefix):].lstrip('/').replace('/', '\\')
        return f'{DEFAULT_LOCAL_MUSIC_ROOT}\\{suffix}' if suffix else DEFAULT_LOCAL_MUSIC_ROOT
    return str(file_path)


def build_vm_genre_tasks(file_paths):
    """把待推理文件列表转换为 VM 侧任务 JSON。"""
    return [
        {
            'file_path': windows_path_to_vm_path(file_path),
            'file_name': Path(str(file_path)).name,
        }
        for file_path in file_paths
    ]


def get_tmp_workdir():
    """统一使用仓库根目录下的 tmp 作为本地中间文件目录。"""
    workdir = Path(__file__).resolve().parents[2] / 'tmp' / 'music_etl_vm'
    workdir.mkdir(parents=True, exist_ok=True)
    return workdir


def format_run_summary(root_path, batch_id, limit, scan_stats, load_stats, genre_stats, skip_genre_inference):
    """把本次执行结果格式化为多行摘要，便于直接从控制台判断各阶段状态。"""
    root_name = Path(str(root_path)).name if root_path else ''
    limit_text = 'all' if limit is None else str(limit)
    skipped = 'yes' if skip_genre_inference else 'no'
    lines = [
        f'batch={batch_id or "none"} root_name={root_name or "unknown"} limit={limit_text}',
        f"scan scanned={scan_stats.get('scanned', 0)} success={scan_stats.get('success', 0)} failed={scan_stats.get('failed', 0)} skipped={scan_stats.get('skipped', 0)}",
        f"load updated={load_stats.get('updated', 0)} inserted={load_stats.get('inserted', 0)}",
        f"genre skipped={skipped} pending={genre_stats.get('pending', 0)} received={genre_stats.get('received', 0)} updated={genre_stats.get('updated', 0)} timeout_skipped={genre_stats.get('skipped', 0)}",
    ]
    return '\n'.join(lines)


def _build_vm_mount_command(vm_music_root=DEFAULT_VM_MUSIC_ROOT):
    """生成 VM 共享音乐目录挂载命令，保证远端总能看到宿主机音乐库。"""
    share_name = Path(vm_music_root.rstrip('/')).name
    return (
        f"mkdir -p {vm_music_root} && "
        f"if ! mountpoint -q {vm_music_root}; then "
        f"vmhgfs-fuse '.host:/{share_name}' {vm_music_root} -o allow_other; "
        f'fi'
    )


def _build_vm_exec_command(remote_tasks_json, remote_raw_json, top_k, timeout_sec=DEFAULT_VM_GENRE_TIMEOUT_SEC):
    """拼装 VM 侧推理命令，固定使用共享目录和指定模型文件。"""
    infer_command = (
        f'cd {DEFAULT_VM_GENRE_WORKDIR} && '
        f'source /root/essentia-venv/bin/activate && '
        f'python {DEFAULT_VM_GENRE_SCRIPT} '
        f'--tasks-json {remote_tasks_json} '
        f'--embedding-model-pb {DEFAULT_VM_EMBEDDING_MODEL} '
        f'--classifier-model-pb {DEFAULT_VM_CLASSIFIER_MODEL} '
        f'--metadata-json {DEFAULT_VM_METADATA_JSON} '
        f'--top-k {int(top_k)} '
        f'--output-json {remote_raw_json}'
    )
    return (
        f'{_build_vm_mount_command()} && '
        f'timeout --foreground {int(timeout_sec)} '
        f'bash -lc {shlex.quote(infer_command)}'
    )


def _exec_remote_command(client, command, timeout=3600, poll_interval=0.2):
    """执行 VM 命令并轮询读取 stdout/stderr，避免阻塞式 read 导致本地长时间挂死。"""
    _stdin, stdout, _stderr = client.exec_command(command, timeout=timeout)
    channel = stdout.channel
    output_chunks = []
    error_chunks = []
    deadline = time.monotonic() + max(float(timeout), 0)

    while True:
        while channel.recv_ready():
            output_chunks.append(channel.recv(4096).decode('utf-8', errors='ignore'))
        while channel.recv_stderr_ready():
            error_chunks.append(channel.recv_stderr(4096).decode('utf-8', errors='ignore'))
        if channel.exit_status_ready():
            break
        if time.monotonic() >= deadline:
            close = getattr(channel, 'close', None)
            if callable(close):
                close()
            raise TimeoutError(f'remote command timed out: {command}')
        time.sleep(poll_interval)

    while channel.recv_ready():
        output_chunks.append(channel.recv(4096).decode('utf-8', errors='ignore'))
    while channel.recv_stderr_ready():
        error_chunks.append(channel.recv_stderr(4096).decode('utf-8', errors='ignore'))

    output = ''.join(output_chunks)
    error = ''.join(error_chunks)
    exit_code = channel.recv_exit_status()
    if exit_code != 0:
        raise RuntimeError(f'remote command failed: {command}\nstdout:\n{output}\nstderr:\n{error}')
    return output


def build_vm_request_id(batch_id):
    """为每次 VM 推理生成唯一请求号，避免同一批次重试时覆盖远端临时文件。"""
    return f'{batch_id}-{uuid.uuid4().hex[:8]}'


def run_vm_genre_inference(
    file_paths,
    batch_id,
    vm_config=None,
    top_k=DEFAULT_VM_TOP_K,
    request_id=None,
    timeout_sec=DEFAULT_VM_GENRE_TIMEOUT_SEC,
):
    """调用 VM 的 Essentia 脚本，对指定歌曲列表输出主曲风结果。"""
    if not file_paths:
        return []

    if paramiko is None:
        raise RuntimeError('paramiko is required to run VM genre inference')

    vm_settings = vm_config or load_vm_config_from_env()
    current_request_id = request_id or build_vm_request_id(batch_id)
    local_workdir = get_tmp_workdir()
    local_tasks_json = local_workdir / f'tasks_{current_request_id}.json'
    local_raw_json = local_workdir / f'raw_predictions_{current_request_id}.json'
    remote_tasks_json = f'{DEFAULT_VM_GENRE_WORKDIR}/tasks_{current_request_id}.json'
    remote_raw_json = f'{DEFAULT_VM_GENRE_WORKDIR}/raw_predictions_{current_request_id}.json'
    local_tasks_json.write_text(
        json.dumps(build_vm_genre_tasks(file_paths), ensure_ascii=False, indent=2),
        encoding='utf-8',
    )

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    sftp = None
    try:
        client.connect(
            hostname=vm_settings['host'],
            port=vm_settings['port'],
            username=vm_settings['username'],
            password=vm_settings['password'],
            timeout=20,
        )
        sftp = client.open_sftp()
        sftp.put(str(local_tasks_json), remote_tasks_json)
        _exec_remote_command(
            client,
            _build_vm_exec_command(
                remote_tasks_json=remote_tasks_json,
                remote_raw_json=remote_raw_json,
                top_k=top_k,
                timeout_sec=timeout_sec,
            ),
        )
        sftp.get(remote_raw_json, str(local_raw_json))
    finally:
        if sftp is not None:
            sftp.close()
        client.close()

    return json.loads(local_raw_json.read_text(encoding='utf-8'))


def normalize_genre_inference_results(items, inferred_at=None):
    """把 VM 原始推理结果转换为可直接回写当前 ODS 结构的字段。"""
    timestamp = inferred_at or datetime.now().isoformat()
    normalized = []
    for item in items or []:
        file_path = item.get('file_path')
        if not file_path:
            continue
        genre_parts = split_genre_essentia_label(
            item.get('genre_essentia_raw_label')
            or item.get('genre_essentia_path')
            or item.get('genre_essentia_label')
            or item.get('label')
        )
        normalized.append({
            'file_path': vm_path_to_windows_path(file_path),
            **genre_parts,
            'genre_essentia_confidence': item.get('genre_essentia_confidence', item.get('confidence')),
            'genre_essentia_model': item.get('genre_essentia_model') or DEFAULT_VM_GENRE_MODEL,
            'genre_essentia_source': item.get('genre_essentia_source') or DEFAULT_VM_GENRE_SOURCE,
            'genre_essentia_inferred_at': item.get('genre_essentia_inferred_at') or timestamp,
        })
    return normalized


def apply_genre_inference_results(conn, rows, now=None):
    """按 file_path 把 Essentia 主曲风与结构化路径信息回写进 ODS。"""
    cursor = conn.cursor()
    updated = 0
    current = now or datetime.now()
    sql = f"""
UPDATE dbo.{TABLE_NAME}
SET
    genre_essentia_label = %s,
    genre_essentia_raw_label = %s,
    genre_essentia_path = %s,
    genre_essentia_parent = %s,
    genre_essentia_child = %s,
    genre_essentia_depth = %s,
    genre_essentia_confidence = %s,
    genre_essentia_model = %s,
    genre_essentia_source = %s,
    genre_essentia_inferred_at = %s,
    etl_updated_at = %s
WHERE file_path = %s
"""
    for row in rows:
        cursor.execute(sql, [
            row['genre_essentia_label'],
            row['genre_essentia_raw_label'],
            row['genre_essentia_path'],
            row['genre_essentia_parent'],
            row['genre_essentia_child'],
            row['genre_essentia_depth'],
            row['genre_essentia_confidence'],
            row['genre_essentia_model'],
            row['genre_essentia_source'],
            row['genre_essentia_inferred_at'],
            current,
            row['file_path'],
        ])
        if cursor.rowcount:
            updated += 1
    conn.commit()
    cursor.close()
    return {'updated': updated}


def mark_genre_inference_skipped(conn, file_paths, reason, now=None):
    """把超时或失败的歌曲批次标记为已跳过，避免同一批坏文件无限重试。"""
    cursor = conn.cursor()
    updated = 0
    current = now or datetime.now()
    sql = f"""
UPDATE dbo.{TABLE_NAME}
SET
    genre_essentia_label = %s,
    genre_essentia_raw_label = %s,
    genre_essentia_path = %s,
    genre_essentia_parent = %s,
    genre_essentia_child = %s,
    genre_essentia_depth = %s,
    genre_essentia_confidence = %s,
    genre_essentia_model = %s,
    genre_essentia_source = %s,
    genre_essentia_inferred_at = %s,
    etl_updated_at = %s
WHERE file_path = %s
"""
    for file_path in file_paths:
        cursor.execute(sql, [
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            DEFAULT_VM_GENRE_MODEL,
            DEFAULT_VM_GENRE_SKIP_SOURCE,
            current,
            current,
            file_path,
        ])
        if cursor.rowcount:
            updated += 1
    conn.commit()
    cursor.close()
    return {'updated': updated}


def run_genre_inference_pipeline(conn, batch_id, now=None, limit=None, batch_size=DEFAULT_VM_GENRE_BATCH_SIZE):
    """执行“查询待推理歌曲 -> 分批调 VM 推理 -> 分批回写 ODS”的完整链路。"""
    total_pending = 0
    total_received = 0
    total_updated = 0
    total_skipped = 0
    current_batch_size = limit or batch_size

    while True:
        pending_file_paths = fetch_pending_genre_file_paths(conn, batch_id=batch_id, limit=current_batch_size)
        if not pending_file_paths:
            break

        total_pending += len(pending_file_paths)
        try:
            raw_results = run_vm_genre_inference(
                pending_file_paths,
                batch_id=batch_id,
                request_id=build_vm_request_id(batch_id),
            )
            normalized_rows = normalize_genre_inference_results(raw_results, inferred_at=(now or datetime.now()).isoformat())
            update_stats = apply_genre_inference_results(conn, normalized_rows, now=now)
            total_received += len(normalized_rows)
            total_updated += update_stats['updated']
        except Exception as exc:
            skip_stats = mark_genre_inference_skipped(conn, pending_file_paths, reason=str(exc), now=now)
            total_skipped += skip_stats['updated']

    return {
        'pending': total_pending,
        'received': total_received,
        'updated': total_updated,
        'skipped': total_skipped,
    }


def parse_args():
    parser = argparse.ArgumentParser()
    # 默认固定到本地音乐目录，这样后续新增歌曲后直接执行脚本即可。
    parser.add_argument('--root-path', default=DEFAULT_LOCAL_MUSIC_ROOT)
    parser.add_argument('--limit', type=int, default=None)
    parser.add_argument('--changed-only', action='store_true')
    parser.add_argument('--genre-inference-json', default=None)
    parser.add_argument('--skip-genre-inference', action='store_true')
    return parser.parse_args()


def main(root_path=DEFAULT_LOCAL_MUSIC_ROOT, limit=None, changed_only=False, genre_inference_json=None, skip_genre_inference=False):
    """执行歌曲扫描入仓，并在未跳过时自动补跑 VM 曲风识别链路。"""
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
        # 某些测试桩或人工构造输入可能未带 batch_id，这里做兜底避免关闭连接前抛异常。
        batch_id = next((row.get('batch_id') for row in rows if row.get('batch_id')), None)
        genre_stats = {'pending': 0, 'received': 0, 'updated': 0, 'skipped': 0}
        if batch_id and not skip_genre_inference:
            genre_stats = run_genre_inference_pipeline(conn, batch_id=batch_id, now=None, limit=limit)
        print(format_run_summary(
            root_path=root_path,
            batch_id=batch_id,
            limit=limit,
            scan_stats=scan_stats,
            load_stats=load_stats,
            genre_stats=genre_stats,
            skip_genre_inference=skip_genre_inference,
        ))
        return {'scan': scan_stats, 'load': load_stats, 'genre': genre_stats}
    finally:
        close_method = getattr(conn, 'close', None)
        if callable(close_method):
            close_method()


if __name__ == '__main__':
    args = parse_args()
    main(
        root_path=args.root_path,
        limit=args.limit,
        changed_only=args.changed_only,
        genre_inference_json=args.genre_inference_json,
        skip_genre_inference=args.skip_genre_inference,
    )
