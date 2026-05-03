"""Load local music info into SQL Server."""

import argparse
import hashlib
import re
import os
import shlex
import time
import uuid
import json
from datetime import datetime
from pathlib import Path

import paramiko
import pymssql
from mutagen import File as MutagenFile

TABLE_NAME = 'ods_jumusic_music_info'
SUPPORTED_EXTENSIONS = {'.mp3', '.flac', '.m4a', '.aac', '.wav', '.ape', '.ogg', '.opus'}
# 默认本地音乐根目录，便于后续直接执行脚本时无需再传路径参数。
DEFAULT_LOCAL_MUSIC_ROOT = r'Z:\Music'
# VM 共享目录固定映射到本地音乐根目录，用于远端 Essentia 曲风识别。
DEFAULT_VM_MUSIC_ROOT = '/mnt/hgfs/Music'
# VM 上的曲风识别脚本、模型与工作目录都固定在这一套路径。
DEFAULT_VM_GENRE_WORKDIR = '/root/juMusic_tmp'
DEFAULT_VM_GENRE_SCRIPT = f'{DEFAULT_VM_GENRE_WORKDIR}/run_essentia_genre_inference.py'
DEFAULT_VM_EMBEDDING_MODEL = f'{DEFAULT_VM_GENRE_WORKDIR}/discogs-effnet-bs64-1.pb'
DEFAULT_VM_CLASSIFIER_MODEL = f'{DEFAULT_VM_GENRE_WORKDIR}/genre_discogs400-discogs-effnet-1.pb'
DEFAULT_VM_METADATA_JSON = f'{DEFAULT_VM_GENRE_WORKDIR}/genre_discogs400-discogs-effnet-1.json'
DEFAULT_VM_GENRE_MODEL = 'essentia-external'
DEFAULT_VM_GENRE_SOURCE = 'vm'
DEFAULT_VM_TOP_K = 20
# 曲风推理默认按更小批次循环提交，避免单个批次卡住太久导致整体无进展。
DEFAULT_VM_GENRE_BATCH_SIZE = 5
# 单批次远端推理最长运行秒数，超时后直接终止这一批并继续后续批次。
DEFAULT_VM_GENRE_TIMEOUT_SEC = 90
# 当某一批远端推理失败或超时时，使用固定来源标记该批已跳过，避免无限重试卡死。
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
    'genre_essentia_label', 'genre_essentia_confidence', 'genre_essentia_matches_json',
    'genre_essentia_model', 'genre_essentia_source', 'genre_essentia_inferred_at',
    'scan_status', 'scan_error', 'etl_created_at', 'etl_updated_at'
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


def empty_file_info(file_path, root_path, error=None):
    """构造文件层的兜底信息，避免单个文件瞬时不可读时中断整批补数。"""
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
        # 外部 Essentia 曲风识别结果默认先留空，后续由 VM 回填链路统一补齐。
        'genre_essentia_label': None,
        'genre_essentia_confidence': None,
        'genre_essentia_matches_json': None,
        'genre_essentia_model': None,
        'genre_essentia_source': None,
        'genre_essentia_inferred_at': None,
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
        embedded_lyric nvarchar(max) null,
        embedded_lyric_format varchar(20) null,
        embedded_lyric_length int null,
        genre_essentia_label nvarchar(200) null,
        genre_essentia_confidence decimal(18,6) null,
        genre_essentia_matches_json nvarchar(max) null,
        genre_essentia_model varchar(100) null,
        genre_essentia_source varchar(50) null,
        genre_essentia_inferred_at datetime2 null,
        scan_status varchar(20) not null,
        scan_error nvarchar(2000) null,
        etl_created_at datetime2 not null,
        etl_updated_at datetime2 not null
    )
END
""")
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
IF COL_LENGTH('dbo.{TABLE_NAME}', 'genre_essentia_label') IS NULL
BEGIN
    ALTER TABLE dbo.{TABLE_NAME} ADD genre_essentia_label nvarchar(200) null
END
""")
    cursor.execute(f"""
IF COL_LENGTH('dbo.{TABLE_NAME}', 'genre_essentia_confidence') IS NULL
BEGIN
    ALTER TABLE dbo.{TABLE_NAME} ADD genre_essentia_confidence decimal(18,6) null
END
""")
    cursor.execute(f"""
IF COL_LENGTH('dbo.{TABLE_NAME}', 'genre_essentia_matches_json') IS NULL
BEGIN
    ALTER TABLE dbo.{TABLE_NAME} ADD genre_essentia_matches_json nvarchar(max) null
END
""")
    cursor.execute(f"""
IF COL_LENGTH('dbo.{TABLE_NAME}', 'genre_essentia_model') IS NULL
BEGIN
    ALTER TABLE dbo.{TABLE_NAME} ADD genre_essentia_model varchar(100) null
END
""")
    cursor.execute(f"""
IF COL_LENGTH('dbo.{TABLE_NAME}', 'genre_essentia_source') IS NULL
BEGIN
    ALTER TABLE dbo.{TABLE_NAME} ADD genre_essentia_source varchar(50) null
END
""")
    cursor.execute(f"""
IF COL_LENGTH('dbo.{TABLE_NAME}', 'genre_essentia_inferred_at') IS NULL
BEGIN
    ALTER TABLE dbo.{TABLE_NAME} ADD genre_essentia_inferred_at datetime2 null
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
        OR genre_essentia_matches_json IS NULL
        OR LTRIM(RTRIM(genre_essentia_matches_json)) = ''
      )
ORDER BY file_path
""", [batch_id, DEFAULT_VM_GENRE_SKIP_SOURCE])
    rows = cursor.fetchall()
    cursor.close()
    file_paths = [row[0] for row in rows if row and row[0]]
    if limit is not None:
        return file_paths[:limit]
    return file_paths


def new_batch_id(now=None):
    current = now or datetime.now()
    return current.strftime('%Y%m%d%H%M%S') + '-' + uuid.uuid4().hex[:8]


def build_music_row(file_info, metadata, batch_id, now=None):
    current = now or datetime.now()
    row = {}
    row.update(file_info)
    row.update(metadata)
    row['batch_id'] = batch_id
    row['etl_created_at'] = current
    row['etl_updated_at'] = current
    return row


def collect_music_rows(root_path, batch_id=None, now=None, limit=None):
    batch = batch_id or new_batch_id(now=now)
    rows = []
    stats = {'scanned': 0, 'success': 0, 'failed': 0}
    for file_path in iter_music_files(root_path):
        if limit is not None and stats['scanned'] >= limit:
            break
        stats['scanned'] += 1
        file_info = extract_file_info(file_path, root_path=root_path)
        # 文件层已经判定不可读时，直接落失败记录并继续后续文件，避免整批任务被单个坏路径打断。
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
        rows.append(build_music_row(file_info, metadata, batch_id=batch, now=now))
    return rows, stats


def load_db_config_from_env():
    return {
        'server': os.environ['JUMUSIC_DB_SERVER'],
        'port': int(os.environ.get('JUMUSIC_DB_PORT', '1433')),
        'user': os.environ['JUMUSIC_DB_USER'],
        'password': os.environ['JUMUSIC_DB_PASSWORD'],
        'database': os.environ['JUMUSIC_DB_DATABASE'],
    }


def load_vm_config_from_env():
    """读取 VM 连接配置；默认值固定为当前共享目录和 root 账户。"""
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
    tasks = []
    for file_path in file_paths:
        tasks.append({
            'file_path': windows_path_to_vm_path(file_path),
            'file_name': Path(str(file_path)).name,
        })
    return tasks


def get_tmp_workdir():
    """统一使用仓库根目录下的 tmp 作为本地中间文件目录。"""
    workdir = Path(__file__).resolve().parents[2] / 'tmp' / 'music_etl_vm'
    workdir.mkdir(parents=True, exist_ok=True)
    return workdir


def format_run_summary(root_path, batch_id, limit, scan_stats, load_stats, genre_stats, skip_genre_inference):
    """把本次执行结果格式化为多行摘要，便于后续直接从控制台判断每个阶段状态。"""
    root_name = Path(str(root_path)).name if root_path else ''
    limit_text = 'all' if limit is None else str(limit)
    skipped = 'yes' if skip_genre_inference else 'no'
    lines = [
        f'batch={batch_id or "none"} root_name={root_name or "unknown"} limit={limit_text}',
        f"scan scanned={scan_stats['scanned']} success={scan_stats['success']} failed={scan_stats['failed']}",
        f"load updated={load_stats['updated']} inserted={load_stats['inserted']}",
        f"genre skipped={skipped} pending={genre_stats['pending']} received={genre_stats['received']} updated={genre_stats['updated']} timeout_skipped={genre_stats.get('skipped', 0)}",
    ]
    return '\n'.join(lines)


def _build_vm_mount_command(vm_music_root=DEFAULT_VM_MUSIC_ROOT):
    """生成 VM 共享音乐目录的挂载命令，保证年报补数时远端总能看到宿主机音乐库。"""
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
    stdin, stdout, stderr = client.exec_command(command, timeout=timeout)
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
    """调用 VM 的 Essentia 脚本，对指定歌曲列表输出主曲风和多候选曲风。"""
    if not file_paths:
        return []

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
    """把 VM 原始推理结果转换为可直接回写 ODS 的结构。"""
    timestamp = inferred_at or datetime.now().isoformat()
    normalized = []
    for item in items or []:
        file_path = item.get('file_path')
        if not file_path:
            continue
        normalized.append({
            'file_path': vm_path_to_windows_path(file_path),
            'genre_essentia_label': item.get('genre_essentia_label') or item.get('label'),
            'genre_essentia_confidence': item.get('genre_essentia_confidence', item.get('confidence')),
            'genre_essentia_matches_json': json.dumps(
                item.get('genre_essentia_matches') or item.get('genre_matches') or [],
                ensure_ascii=False,
            ),
            'genre_essentia_model': item.get('genre_essentia_model') or DEFAULT_VM_GENRE_MODEL,
            'genre_essentia_source': item.get('genre_essentia_source') or DEFAULT_VM_GENRE_SOURCE,
            'genre_essentia_inferred_at': item.get('genre_essentia_inferred_at') or timestamp,
        })
    return normalized


def apply_genre_inference_results(conn, rows, now=None):
    """按 `file_path` 把主曲风和多候选曲风回写进 ODS。"""
    cursor = conn.cursor()
    updated = 0
    current = now or datetime.now()
    sql = f"""
UPDATE dbo.{TABLE_NAME}
SET
    genre_essentia_label = %s,
    genre_essentia_confidence = %s,
    genre_essentia_matches_json = %s,
    genre_essentia_model = %s,
    genre_essentia_source = %s,
    genre_essentia_inferred_at = %s,
    etl_updated_at = %s
WHERE file_path = %s
"""
    for row in rows:
        cursor.execute(sql, [
            row['genre_essentia_label'],
            row['genre_essentia_confidence'],
            row['genre_essentia_matches_json'],
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
    """把超时或失败的歌曲批次标记为“已跳过”，避免同一批坏文件无限重试。"""
    cursor = conn.cursor()
    updated = 0
    current = now or datetime.now()
    sql = f"""
UPDATE dbo.{TABLE_NAME}
SET
    genre_essentia_label = %s,
    genre_essentia_confidence = %s,
    genre_essentia_matches_json = %s,
    genre_essentia_model = %s,
    genre_essentia_source = %s,
    genre_essentia_inferred_at = %s,
    etl_updated_at = %s
WHERE file_path = %s
"""
    # 用空数组保留“已尝试但无有效候选”的状态；主标签保持空，避免后续统计把跳过项误算成有效曲风。
    skipped_label = None
    skipped_matches_json = '[]'
    skipped_model = DEFAULT_VM_GENRE_MODEL
    for file_path in file_paths:
        cursor.execute(sql, [
            skipped_label,
            None,
            skipped_matches_json,
            skipped_model,
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
    parser.add_argument('--skip-genre-inference', action='store_true')
    return parser.parse_args()


def main(root_path=DEFAULT_LOCAL_MUSIC_ROOT, limit=None, skip_genre_inference=False):
    if not root_path:
        raise ValueError('root_path is required')
    db_config = load_db_config_from_env()
    conn = connect_db(db_config)
    try:
        ensure_table(conn)
        rows, scan_stats = collect_music_rows(root_path, limit=limit)
        load_stats = upsert_music_rows(conn, rows)
        batch_id = rows[0]['batch_id'] if rows else None
        genre_stats = {'pending': 0, 'received': 0, 'updated': 0}
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
        close = getattr(conn, 'close', None)
        if callable(close):
            close()


if __name__ == '__main__':
    args = parse_args()
    main(root_path=args.root_path, limit=args.limit, skip_genre_inference=args.skip_genre_inference)
