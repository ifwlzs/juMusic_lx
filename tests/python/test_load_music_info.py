from pathlib import Path
import importlib.util
import io

from PIL import Image

MODULE_PATH = Path(__file__).resolve().parents[2] / 'scripts' / 'music_etl' / 'load_music_info.py'


def load_module():
    spec = importlib.util.spec_from_file_location('load_music_info', MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_module_file_exists():
    assert MODULE_PATH.exists()

def test_iter_music_files_filters_supported_extensions(tmp_path):
    module = load_module()
    music_dir = tmp_path / 'Music'
    music_dir.mkdir()
    keep_1 = music_dir / 'a.mp3'
    keep_2 = music_dir / 'sub' / 'b.flac'
    skip = music_dir / 'note.txt'
    keep_2.parent.mkdir()
    keep_1.write_bytes(b'a')
    keep_2.write_bytes(b'b')
    skip.write_text('x', encoding='utf-8')

    result = list(module.iter_music_files(music_dir))

    assert result == [keep_1, keep_2]

import hashlib


def test_extract_file_info_returns_basic_fields(tmp_path):
    module = load_module()
    music_file = tmp_path / 'sample.mp3'
    payload = b'hello music'
    music_file.write_bytes(payload)

    info = module.extract_file_info(music_file, root_path=tmp_path)

    assert info['root_path'] == str(tmp_path)
    assert info['file_path'] == str(music_file)
    assert info['file_name'] == 'sample.mp3'
    assert info['file_ext'] == '.mp3'
    assert info['file_size'] == len(payload)
    assert info['file_md5'] == hashlib.md5(payload).hexdigest()
    assert info['is_readable'] is True
    assert info['file_mtime'] is not None


def test_extract_file_info_marks_file_as_unreadable_when_md5_read_raises(tmp_path, monkeypatch):
    module = load_module()
    music_file = tmp_path / 'sample.mp3'
    music_file.write_bytes(b'hello music')

    def raise_missing(_file_path, chunk_size=1024 * 1024):
        raise FileNotFoundError('file disappeared while scanning')

    monkeypatch.setattr(module, 'compute_md5', raise_missing)

    info = module.extract_file_info(music_file, root_path=tmp_path)

    assert info['root_path'] == str(tmp_path)
    assert info['file_path'] == str(music_file)
    assert info['file_name'] == 'sample.mp3'
    assert info['file_ext'] == '.mp3'
    assert info['file_md5'] is None
    assert info['is_readable'] is False


def test_extract_audio_metadata_maps_common_fields(monkeypatch, tmp_path):
    module = load_module()
    music_file = tmp_path / 'track.flac'
    music_file.write_bytes(b'x')

    class FakeInfo:
        length = 245.123
        bitrate = 320000
        sample_rate = 44100
        channels = 2

    class FakeAudio(dict):
        info = FakeInfo()

    fake_audio = FakeAudio({
        'title': ['Song'],
        'artist': ['Singer'],
        'album': ['Album'],
        'albumartist': ['Various'],
        'tracknumber': ['3/12'],
        'discnumber': ['1/2'],
        'genre': ['Pop'],
        'date': ['2024'],
        'lyrics': ['[00:01.00]line1\n[00:02.00]line2'],
    })

    monkeypatch.setattr(module, 'MutagenFile', lambda *_args, **_kwargs: fake_audio)

    info = module.extract_audio_metadata(music_file)

    assert info == {
        'title': 'Song',
        'artist': 'Singer',
        'album': 'Album',
        'album_artist': 'Various',
        'track_no': 3,
        'disc_no': 1,
        'genre': 'Pop',
        'year': '2024',
        'duration_sec': 245.123,
        'bitrate': 320000,
        'sample_rate': 44100,
        'channels': 2,
        'embedded_lyric': '[00:01.00]line1\n[00:02.00]line2',
        'embedded_lyric_format': 'lrc',
        'embedded_lyric_length': 31,
        'cover_art_present': False,
        'cover_art_mime': None,
        'cover_color': None,
        'cover_color_source': None,
        'cover_color_confidence': None,
        'language_norm': '英语',
        'language_source': 'lyric',
        'language_confidence': 1.0,
        'language_norm_version': 'lyric-v1',
        'genre_essentia_label': None,
        'genre_essentia_confidence': None,
        'genre_essentia_matches_json': None,
        'genre_essentia_model': None,
        'genre_essentia_source': None,
        'genre_essentia_inferred_at': None,
        'scan_status': 'SUCCESS',
        'scan_error': None,
    }

def test_extract_audio_metadata_marks_failed_when_parser_raises(monkeypatch, tmp_path):
    module = load_module()
    music_file = tmp_path / 'bad.mp3'
    music_file.write_bytes(b'x')

    def raise_error(*_args, **_kwargs):
        raise RuntimeError('broken tag')

    monkeypatch.setattr(module, 'MutagenFile', raise_error)

    info = module.extract_audio_metadata(music_file)

    assert info['scan_status'] == 'FAILED'
    assert info['scan_error'] == 'broken tag'
    assert info['title'] is None
    assert info['duration_sec'] is None
    assert info['embedded_lyric'] is None

class FakeCursor:
    def __init__(self):
        self.executed = []
        self.rows = []
        self.rowcount = 0

    def execute(self, sql, params=None):
        self.executed.append((sql, params))

    def fetchall(self):
        return self.rows

    def close(self):
        pass


class FakeConnection:
    def __init__(self):
        self.cursor_obj = FakeCursor()
        self.commit_count = 0

    def cursor(self):
        return self.cursor_obj

    def commit(self):
        self.commit_count += 1

    def close(self):
        pass


class FakeRemoteChannel:
    def __init__(self, stdout_chunks=None, stderr_chunks=None, exit_code=0, ready_after_checks=1):
        self.stdout_chunks = [chunk.encode('utf-8') for chunk in (stdout_chunks or [])]
        self.stderr_chunks = [chunk.encode('utf-8') for chunk in (stderr_chunks or [])]
        self.exit_code = exit_code
        self.ready_after_checks = ready_after_checks
        self.exit_ready_checks = 0
        self.closed = False

    def exit_status_ready(self):
        self.exit_ready_checks += 1
        return self.exit_ready_checks > self.ready_after_checks

    def recv_ready(self):
        return bool(self.stdout_chunks)

    def recv_stderr_ready(self):
        return bool(self.stderr_chunks)

    def recv(self, _size):
        return self.stdout_chunks.pop(0) if self.stdout_chunks else b''

    def recv_stderr(self, _size):
        return self.stderr_chunks.pop(0) if self.stderr_chunks else b''

    def recv_exit_status(self):
        return self.exit_code

    def close(self):
        self.closed = True


class FakeRemoteStream:
    def __init__(self, channel):
        self.channel = channel


class FakeSSHClient:
    def __init__(self, channel):
        self.channel = channel

    def exec_command(self, command, timeout=None):
        return None, FakeRemoteStream(self.channel), FakeRemoteStream(self.channel)


def test_ensure_table_creates_target_table_and_indexes():
    module = load_module()
    conn = FakeConnection()

    module.ensure_table(conn)

    sql_text = '\n'.join(item[0] for item in conn.cursor_obj.executed)
    assert 'ods_jumusic_music_info' in sql_text
    assert 'CREATE TABLE' in sql_text
    assert 'CREATE UNIQUE INDEX' in sql_text
    assert 'file_path' in sql_text
    assert 'embedded_lyric' in sql_text
    assert 'language_norm' in sql_text
    assert 'language_source' in sql_text
    assert 'language_confidence' in sql_text
    assert 'cover_art_present' in sql_text
    assert 'cover_art_mime' in sql_text
    assert 'cover_color' in sql_text
    assert 'genre_essentia_label' in sql_text
    assert 'genre_essentia_matches_json' in sql_text
    assert conn.commit_count == 1


def test_exec_remote_command_returns_stdout_when_remote_command_succeeds():
    module = load_module()
    channel = FakeRemoteChannel(stdout_chunks=['ok'], exit_code=0, ready_after_checks=1)
    client = FakeSSHClient(channel)

    result = module._exec_remote_command(client, 'echo ok', timeout=1, poll_interval=0)

    assert result == 'ok'


def test_exec_remote_command_raises_timeout_when_remote_command_never_finishes():
    module = load_module()
    channel = FakeRemoteChannel(stdout_chunks=[], stderr_chunks=[], exit_code=0, ready_after_checks=999999)
    client = FakeSSHClient(channel)

    try:
        module._exec_remote_command(client, 'sleep forever', timeout=0, poll_interval=0)
    except TimeoutError as exc:
        assert 'sleep forever' in str(exc)
        assert channel.closed is True
    else:
        raise AssertionError('expected TimeoutError')


def test_extract_audio_metadata_reads_embedded_lyric_from_raw_tags(monkeypatch, tmp_path):
    module = load_module()
    music_file = tmp_path / 'raw-lyric.mp3'
    music_file.write_bytes(b'x')

    class FakeAudio(dict):
        info = None

    class FakeRawAudio:
        info = None
        tags = {
            'USLT::eng': ['hello from uslt'],
        }

    calls = []

    def fake_mutagen(path, easy=True):
        calls.append(easy)
        if easy:
            return FakeAudio({'title': ['Song']})
        return FakeRawAudio()

    monkeypatch.setattr(module, 'MutagenFile', fake_mutagen)

    info = module.extract_audio_metadata(music_file)

    assert calls == [True, False]
    assert info['embedded_lyric'] == 'hello from uslt'
    assert info['embedded_lyric_format'] == 'plain'
    assert info['embedded_lyric_length'] == 15
    assert info['language_norm'] == '英语'
    assert info['language_source'] == 'lyric'


def test_extract_audio_metadata_reads_cover_color_from_raw_tags(monkeypatch, tmp_path):
    module = load_module()
    music_file = tmp_path / 'cover-raw.flac'
    music_file.write_bytes(b'x')

    class FakeAudio(dict):
        info = None

    class FakePicture:
        def __init__(self, data, mime='image/png'):
            self.data = data
            self.mime = mime

    class FakeRawAudio:
        info = None
        pictures = [FakePicture(
            b'\x89PNG\r\n\x1a\n'
            b'\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde'
            b'\x00\x00\x00\x0cIDATx\x9cc\xf8\xcf\xc0\x00\x00\x03\x01\x01\x00\xc9\xfe\x92\xef'
            b'\x00\x00\x00\x00IEND\xaeB`\x82'
        )]

    calls = []

    def fake_mutagen(path, easy=True):
        calls.append(easy)
        if easy:
            return FakeAudio({'title': ['Song']})
        return FakeRawAudio()

    monkeypatch.setattr(module, 'MutagenFile', fake_mutagen)

    info = module.extract_audio_metadata(music_file)

    assert calls == [True, False]
    assert info['cover_art_present'] is True
    assert info['cover_art_mime'] == 'image/png'
    assert info['cover_color'] == '#FF0000'
    assert info['cover_color_source'] == 'embedded-art'


def test_extract_audio_metadata_prefers_saturated_center_cover_color_over_large_white_background(monkeypatch, tmp_path):
    module = load_module()
    music_file = tmp_path / 'cover-center-theme.flac'
    music_file.write_bytes(b'x')

    class FakeAudio(dict):
        info = None

    class FakePicture:
        def __init__(self, data, mime='image/png'):
            self.data = data
            self.mime = mime

    image = Image.new('RGB', (40, 40), '#FFFFFF')
    for x in range(10, 30):
        for y in range(10, 30):
            image.putpixel((x, y), (255, 0, 0))
    image_bytes = io.BytesIO()
    image.save(image_bytes, format='PNG')

    class FakeRawAudio:
        info = None
        pictures = [FakePicture(image_bytes.getvalue())]

    def fake_mutagen(_path, easy=True):
        if easy:
            return FakeAudio({'title': ['Song']})
        return FakeRawAudio()

    monkeypatch.setattr(module, 'MutagenFile', fake_mutagen)

    info = module.extract_audio_metadata(music_file)

    # 即使白底面积更大，也应优先拿到位于中心且更有主题感的高饱和颜色。
    assert info['cover_color'] == '#FF0000'
    assert info['cover_color_confidence'] is not None


def test_extract_audio_metadata_falls_back_to_title_language_when_lyric_is_noise(monkeypatch, tmp_path):
    module = load_module()
    music_file = tmp_path / 'noise-lyric.mp3'
    music_file.write_bytes(b'x')

    class FakeAudio(dict):
        info = None

    fake_audio = FakeAudio({
        'title': ['ラストリゾート'],
        'artist': ['Ayase'],
        'lyrics': ['Lavf58.76.100'],
    })

    monkeypatch.setattr(module, 'MutagenFile', lambda *_args, **_kwargs: fake_audio)

    info = module.extract_audio_metadata(music_file)

    assert info['embedded_lyric'] == 'Lavf58.76.100'
    assert info['language_norm'] == '日语'
    assert info['language_source'] == 'title'
    assert info['language_confidence'] == 1.0

class FakeUpsertCursor(FakeCursor):
    def __init__(self, rowcounts):
        super().__init__()
        self._rowcounts = list(rowcounts)
        self.rowcount = 0

    def execute(self, sql, params=None):
        super().execute(sql, params)
        self.rowcount = self._rowcounts.pop(0)


class FakeUpsertConnection(FakeConnection):
    def __init__(self, rowcounts):
        self.cursor_obj = FakeUpsertCursor(rowcounts)
        self.commit_count = 0


def test_upsert_music_rows_updates_then_inserts():
    module = load_module()
    conn = FakeUpsertConnection([1, 0, 1])
    rows = [
        {
            'batch_id': 'b1',
            'root_path': 'Z:/Music',
            'file_path': 'Z:/Music/a.mp3',
            'file_name': 'a.mp3',
            'file_ext': '.mp3',
            'file_size': 1,
            'file_mtime': None,
            'file_md5': 'a',
            'is_readable': True,
            'title': 'A',
            'artist': 'AA',
            'album': 'AL',
            'album_artist': 'VA',
            'track_no': 1,
            'disc_no': 1,
            'genre': 'Pop',
            'year': '2024',
            'duration_sec': 1.0,
            'bitrate': 320000,
            'sample_rate': 44100,
            'channels': 2,
            'scan_status': 'SUCCESS',
            'scan_error': None,
            'etl_created_at': 'created',
            'etl_updated_at': 'updated',
        },
        {
            'batch_id': 'b1',
            'root_path': 'Z:/Music',
            'file_path': 'Z:/Music/b.mp3',
            'file_name': 'b.mp3',
            'file_ext': '.mp3',
            'file_size': 1,
            'file_mtime': None,
            'file_md5': 'b',
            'is_readable': True,
            'title': 'B',
            'artist': 'BB',
            'album': 'BL',
            'album_artist': 'VB',
            'track_no': 2,
            'disc_no': 1,
            'genre': 'Rock',
            'year': '2023',
            'duration_sec': 2.0,
            'bitrate': 128000,
            'sample_rate': 48000,
            'channels': 2,
            'scan_status': 'SUCCESS',
            'scan_error': None,
            'etl_created_at': 'created',
            'etl_updated_at': 'updated',
        },
    ]

    stats = module.upsert_music_rows(conn, rows)

    sql_text = '\n'.join(item[0] for item in conn.cursor_obj.executed)
    assert 'UPDATE dbo.ods_jumusic_music_info' in sql_text
    assert 'INSERT INTO dbo.ods_jumusic_music_info' in sql_text
    assert stats == {'updated': 1, 'inserted': 1}
    assert conn.commit_count == 1


def test_build_row_combines_file_and_metadata_fields():
    from datetime import datetime

    module = load_module()
    now = datetime(2026, 4, 19, 12, 0, 0)
    file_info = {
        'root_path': 'Z:/Music',
        'file_path': 'Z:/Music/a.mp3',
        'file_name': 'a.mp3',
        'file_ext': '.mp3',
        'file_size': 123,
        'file_mtime': now,
        'file_md5': 'abc',
        'is_readable': True,
    }
    metadata = {
        'title': 'Song',
        'artist': 'Singer',
        'album': 'Album',
        'album_artist': 'Various',
        'track_no': 1,
        'disc_no': 1,
        'genre': 'Pop',
        'year': '2024',
        'duration_sec': 200.0,
        'bitrate': 320000,
        'sample_rate': 44100,
        'channels': 2,
        'cover_art_present': True,
        'cover_art_mime': 'image/jpeg',
        'cover_color': '#112233',
        'cover_color_source': 'embedded-art',
        'cover_color_confidence': 0.91,
        'language_norm': '中文',
        'language_source': 'title',
        'language_confidence': 1.0,
        'language_norm_version': 'lyric-v1',
        'scan_status': 'SUCCESS',
        'scan_error': None,
    }

    row = module.build_music_row(file_info, metadata, batch_id='batch-1', now=now)

    assert row['batch_id'] == 'batch-1'
    assert row['file_path'] == 'Z:/Music/a.mp3'
    assert row['title'] == 'Song'
    assert row['cover_color'] == '#112233'
    assert row['language_norm'] == '中文'
    assert row['etl_created_at'] == now
    assert row['etl_updated_at'] == now

def test_collect_music_rows_builds_rows_for_each_supported_file(monkeypatch, tmp_path):
    module = load_module()
    music_dir = tmp_path / 'Music'
    music_dir.mkdir()
    first = music_dir / 'a.mp3'
    second = music_dir / 'b.flac'
    first.write_bytes(b'a')
    second.write_bytes(b'b')

    monkeypatch.setattr(module, 'extract_file_info', lambda path, root_path: {
        'root_path': str(root_path),
        'file_path': str(path),
        'file_name': path.name,
        'file_ext': path.suffix,
        'file_size': 1,
        'file_mtime': None,
        'file_md5': path.stem,
        'is_readable': True,
    })
    monkeypatch.setattr(module, 'extract_audio_metadata', lambda _path: {
        'title': 'Song',
        'artist': 'Singer',
        'album': 'Album',
        'album_artist': 'Various',
        'track_no': 1,
        'disc_no': 1,
        'genre': 'Pop',
        'year': '2024',
        'duration_sec': 1.0,
        'bitrate': 320000,
        'sample_rate': 44100,
        'channels': 2,
        'scan_status': 'SUCCESS',
        'scan_error': None,
    })

    rows, stats = module.collect_music_rows(music_dir, batch_id='batch-1')

    assert len(rows) == 2
    assert stats == {'scanned': 2, 'success': 2, 'failed': 0}
    assert {row['file_path'] for row in rows} == {str(first), str(second)}


def test_collect_music_rows_marks_unreadable_file_info_as_failed_without_crashing(monkeypatch):
    module = load_module()
    files = ['a.mp3']
    monkeypatch.setattr(module, 'iter_music_files', lambda _root: files)
    monkeypatch.setattr(module, 'extract_file_info', lambda path, root_path: {
        'root_path': str(root_path),
        'file_path': str(path),
        'file_name': str(path),
        'file_ext': '.mp3',
        'file_size': None,
        'file_mtime': None,
        'file_md5': None,
        'is_readable': False,
        'file_error': 'file disappeared while scanning',
    })

    rows, stats = module.collect_music_rows('Z:/Music', batch_id='batch-1')

    assert len(rows) == 1
    assert rows[0]['scan_status'] == 'FAILED'
    assert rows[0]['scan_error'] == 'file disappeared while scanning'
    assert stats == {'scanned': 1, 'success': 0, 'failed': 1}


def test_main_runs_table_creation_collection_and_upsert(monkeypatch, capsys):
    module = load_module()
    calls = []

    class DummyConn:
        pass

    monkeypatch.setattr(module, 'load_db_config_from_env', lambda: {'server': 'x'})
    monkeypatch.setattr(module, 'connect_db', lambda config: calls.append(('connect', config)) or DummyConn())
    monkeypatch.setattr(module, 'ensure_table', lambda conn: calls.append(('ensure_table', conn)))
    monkeypatch.setattr(module, 'collect_music_rows', lambda root_path, batch_id=None, now=None, limit=None: (
        [{'file_path': 'masked', 'scan_status': 'SUCCESS', 'batch_id': 'batch-1'}],
        {'scanned': 1, 'success': 1, 'failed': 0},
    ))
    monkeypatch.setattr(module, 'upsert_music_rows', lambda conn, rows: calls.append(('upsert', conn, rows)) or {'updated': 0, 'inserted': 1})
    monkeypatch.setattr(module, 'run_genre_inference_pipeline', lambda conn, batch_id, now=None, limit=None: calls.append(('genre', conn, batch_id, limit)) or {'pending': 1, 'received': 1, 'updated': 1})

    module.main(root_path='X:/Sample', limit=1)
    output = capsys.readouterr().out

    assert calls[0][0] == 'connect'
    assert calls[1][0] == 'ensure_table'
    assert calls[2][0] == 'upsert'
    assert calls[3][0] == 'genre'
    assert 'batch=batch-1' in output
    assert 'scan scanned=1 success=1 failed=0' in output
    assert 'load updated=0 inserted=1' in output
    assert 'genre skipped=no pending=1 received=1 updated=1' in output
    assert 'X:/Sample' not in output


def test_collect_music_rows_respects_limit(monkeypatch):
    module = load_module()
    files = ['a.mp3', 'b.mp3', 'c.mp3']
    monkeypatch.setattr(module, 'iter_music_files', lambda _root: files)
    monkeypatch.setattr(module, 'extract_file_info', lambda path, root_path: {
        'root_path': str(root_path),
        'file_path': str(path),
        'file_name': str(path),
        'file_ext': '.mp3',
        'file_size': 1,
        'file_mtime': None,
        'file_md5': str(path),
        'is_readable': True,
    })
    monkeypatch.setattr(module, 'extract_audio_metadata', lambda _path: module.empty_audio_metadata())

    rows, stats = module.collect_music_rows('Z:/Music', batch_id='batch-1', limit=2)

    assert len(rows) == 2
    assert stats['scanned'] == 2

def test_parse_args_defaults_to_configured_music_root(monkeypatch):
    module = load_module()
    monkeypatch.setattr('sys.argv', ['load_music_info.py'])

    args = module.parse_args()

    assert args.root_path == module.DEFAULT_LOCAL_MUSIC_ROOT
    assert args.skip_genre_inference is False


def test_windows_path_to_vm_path_maps_shared_music_directory():
    module = load_module()

    result = module.windows_path_to_vm_path(r'Z:\Music\中\邓丽君 - 我只在乎你.mp3')

    assert result == '/mnt/hgfs/Music/中/邓丽君 - 我只在乎你.mp3'


def test_vm_path_to_windows_path_restores_local_music_directory():
    module = load_module()

    result = module.vm_path_to_windows_path('/mnt/hgfs/Music/▓虚拟歌姬▓/洛天依/外婆桥.flac')

    assert result == r'Z:\Music\▓虚拟歌姬▓\洛天依\外婆桥.flac'


def test_normalize_genre_inference_results_keeps_primary_and_candidate_matches():
    module = load_module()

    rows = module.normalize_genre_inference_results([
        {
            'file_path': '/mnt/hgfs/Music/中/邓丽君 - 我只在乎你.mp3',
            'label': 'Pop---Kayōkyoku',
            'confidence': 0.199437,
            'genre_matches': [
                {'genre_name': 'Pop---Kayōkyoku', 'match_score': 0.199437, 'rank': 1},
                {'genre_name': 'Pop---Ballad', 'match_score': 0.153210, 'rank': 2},
            ],
        },
    ], inferred_at='2026-05-03T16:00:00')

    assert rows[0]['file_path'] == r'Z:\Music\中\邓丽君 - 我只在乎你.mp3'
    assert rows[0]['genre_essentia_label'] == 'Pop---Kayōkyoku'
    assert rows[0]['genre_essentia_confidence'] == 0.199437
    assert rows[0]['genre_essentia_model'] == 'essentia-external'
    assert rows[0]['genre_essentia_source'] == 'vm'
    assert rows[0]['genre_essentia_inferred_at'] == '2026-05-03T16:00:00'
    assert 'Pop---Ballad' in rows[0]['genre_essentia_matches_json']


def test_fetch_pending_genre_file_paths_returns_only_current_batch_rows():
    module = load_module()
    conn = FakeConnection()
    conn.cursor_obj.rows = [('Z:/Music/a.mp3',), ('Z:/Music/b.mp3',)]

    result = module.fetch_pending_genre_file_paths(conn, batch_id='batch-1', limit=1)

    assert result == ['Z:/Music/a.mp3']
    sql_text = conn.cursor_obj.executed[0][0]
    assert 'genre_essentia_label' in sql_text
    assert 'genre_essentia_source' in sql_text
    assert conn.cursor_obj.executed[0][1] == ['batch-1', module.DEFAULT_VM_GENRE_SKIP_SOURCE]


def test_build_vm_request_id_appends_unique_suffix(monkeypatch):
    module = load_module()

    class FakeUuid:
        hex = 'abcdef1234567890'

    monkeypatch.setattr(module.uuid, 'uuid4', lambda: FakeUuid())

    request_id = module.build_vm_request_id('batch-1')

    assert request_id == 'batch-1-abcdef12'


class FakeApplyCursor(FakeCursor):
    def __init__(self, rowcounts):
        super().__init__()
        self._rowcounts = list(rowcounts)

    def execute(self, sql, params=None):
        super().execute(sql, params)
        self.rowcount = self._rowcounts.pop(0)


class FakeApplyConnection(FakeConnection):
    def __init__(self, rowcounts):
        self.cursor_obj = FakeApplyCursor(rowcounts)
        self.commit_count = 0


def test_apply_genre_inference_results_updates_rows_by_file_path():
    module = load_module()
    conn = FakeApplyConnection([1, 0])

    stats = module.apply_genre_inference_results(conn, [
        {
            'file_path': r'Z:\Music\a.mp3',
            'genre_essentia_label': 'Pop---Ballad',
            'genre_essentia_confidence': 0.4,
            'genre_essentia_matches_json': '[{"genre_name":"Pop---Ballad","match_score":0.4,"rank":1}]',
            'genre_essentia_model': 'essentia-external',
            'genre_essentia_source': 'vm',
            'genre_essentia_inferred_at': '2026-05-03T16:00:00',
        },
        {
            'file_path': r'Z:\Music\b.mp3',
            'genre_essentia_label': 'Rock',
            'genre_essentia_confidence': 0.2,
            'genre_essentia_matches_json': '[{"genre_name":"Rock","match_score":0.2,"rank":1}]',
            'genre_essentia_model': 'essentia-external',
            'genre_essentia_source': 'vm',
            'genre_essentia_inferred_at': '2026-05-03T16:00:00',
        },
    ])

    assert stats == {'updated': 1}
    sql_text = conn.cursor_obj.executed[0][0]
    assert 'genre_essentia_matches_json' in sql_text
    assert conn.commit_count == 1


def test_run_genre_inference_pipeline_processes_pending_rows_in_multiple_batches(monkeypatch):
    module = load_module()
    conn = object()
    pending_batches = [
        [r'Z:\Music\a.mp3', r'Z:\Music\b.mp3'],
        [r'Z:\Music\c.mp3'],
        [],
    ]
    vm_calls = []
    apply_calls = []

    def fake_fetch(_conn, batch_id, limit=None):
        assert batch_id == 'batch-1'
        assert limit == module.DEFAULT_VM_GENRE_BATCH_SIZE
        return pending_batches.pop(0)

    def fake_run_vm(file_paths, batch_id, vm_config=None, top_k=module.DEFAULT_VM_TOP_K, request_id=None):
        vm_calls.append((tuple(file_paths), batch_id))
        return [{'file_path': path, 'label': f'label-{index}', 'confidence': 0.5} for index, path in enumerate(file_paths, start=1)]

    def fake_normalize(items, inferred_at=None):
        return [
            {
                'file_path': item['file_path'],
                'genre_essentia_label': item['label'],
                'genre_essentia_confidence': item['confidence'],
                'genre_essentia_matches_json': '[]',
                'genre_essentia_model': 'essentia-external',
                'genre_essentia_source': 'vm',
                'genre_essentia_inferred_at': inferred_at,
            }
            for item in items
        ]

    def fake_apply(_conn, rows, now=None):
        apply_calls.append([row['file_path'] for row in rows])
        return {'updated': len(rows)}

    monkeypatch.setattr(module, 'fetch_pending_genre_file_paths', fake_fetch)
    monkeypatch.setattr(module, 'run_vm_genre_inference', fake_run_vm)
    monkeypatch.setattr(module, 'normalize_genre_inference_results', fake_normalize)
    monkeypatch.setattr(module, 'apply_genre_inference_results', fake_apply)

    stats = module.run_genre_inference_pipeline(conn, batch_id='batch-1')

    assert stats == {'pending': 3, 'received': 3, 'updated': 3, 'skipped': 0}
    assert vm_calls == [
        ((r'Z:\Music\a.mp3', r'Z:\Music\b.mp3'), 'batch-1'),
        ((r'Z:\Music\c.mp3',), 'batch-1'),
    ]
    assert apply_calls == [
        [r'Z:\Music\a.mp3', r'Z:\Music\b.mp3'],
        [r'Z:\Music\c.mp3'],
    ]


def test_run_genre_inference_pipeline_marks_failed_batch_as_skipped_and_continues(monkeypatch):
    module = load_module()
    conn = object()
    pending_batches = [
        [r'Z:\Music\a.mp3', r'Z:\Music\b.mp3'],
        [r'Z:\Music\c.mp3'],
        [],
    ]
    skip_calls = []
    apply_calls = []

    def fake_fetch(_conn, batch_id, limit=None):
        assert batch_id == 'batch-1'
        assert limit == module.DEFAULT_VM_GENRE_BATCH_SIZE
        return pending_batches.pop(0)

    def fake_run_vm(file_paths, batch_id, vm_config=None, top_k=module.DEFAULT_VM_TOP_K, request_id=None):
        if file_paths[0].endswith('a.mp3'):
            raise RuntimeError('remote command timed out')
        return [{'file_path': path, 'label': 'Pop', 'confidence': 0.5} for path in file_paths]

    def fake_normalize(items, inferred_at=None):
        return [
            {
                'file_path': item['file_path'],
                'genre_essentia_label': item['label'],
                'genre_essentia_confidence': item['confidence'],
                'genre_essentia_matches_json': '[]',
                'genre_essentia_model': 'essentia-external',
                'genre_essentia_source': 'vm',
                'genre_essentia_inferred_at': inferred_at,
            }
            for item in items
        ]

    def fake_apply(_conn, rows, now=None):
        apply_calls.append([row['file_path'] for row in rows])
        return {'updated': len(rows)}

    def fake_mark_skipped(_conn, file_paths, reason, now=None):
        skip_calls.append({'file_paths': list(file_paths), 'reason': reason})
        return {'updated': len(file_paths)}

    monkeypatch.setattr(module, 'fetch_pending_genre_file_paths', fake_fetch)
    monkeypatch.setattr(module, 'run_vm_genre_inference', fake_run_vm)
    monkeypatch.setattr(module, 'normalize_genre_inference_results', fake_normalize)
    monkeypatch.setattr(module, 'apply_genre_inference_results', fake_apply)
    monkeypatch.setattr(module, 'mark_genre_inference_skipped', fake_mark_skipped)

    stats = module.run_genre_inference_pipeline(conn, batch_id='batch-1')

    assert stats == {'pending': 3, 'received': 1, 'updated': 1, 'skipped': 2}
    assert skip_calls == [{
        'file_paths': [r'Z:\Music\a.mp3', r'Z:\Music\b.mp3'],
        'reason': 'remote command timed out',
    }]
    assert apply_calls == [[r'Z:\Music\c.mp3']]


def test_format_run_summary_marks_genre_stage_as_skipped():
    module = load_module()

    summary = module.format_run_summary(
        root_path=r'Z:\Music',
        batch_id='batch-2',
        limit=None,
        scan_stats={'scanned': 3, 'success': 3, 'failed': 0},
        load_stats={'updated': 1, 'inserted': 2},
        genre_stats={'pending': 0, 'received': 0, 'updated': 0},
        skip_genre_inference=True,
    )

    assert 'batch=batch-2' in summary
    assert 'root_name=Music' in summary
    assert 'genre skipped=yes pending=0 received=0 updated=0' in summary


def test_build_vm_exec_command_ensures_shared_music_mount_before_inference():
    module = load_module()

    command = module._build_vm_exec_command(
        remote_tasks_json='/root/juMusic_tmp/tasks.json',
        remote_raw_json='/root/juMusic_tmp/raw_predictions.json',
        top_k=20,
    )

    assert 'mountpoint -q /mnt/hgfs/Music' in command
    assert "vmhgfs-fuse '.host:/Music' /mnt/hgfs/Music -o allow_other" in command
    assert f'timeout --foreground {module.DEFAULT_VM_GENRE_TIMEOUT_SEC}' in command
    assert f'python {module.DEFAULT_VM_GENRE_SCRIPT}' in command


def test_load_db_config_from_env_reads_only_environment(monkeypatch):
    module = load_module()
    monkeypatch.setenv('JUMUSIC_DB_SERVER', 'server')
    monkeypatch.setenv('JUMUSIC_DB_PORT', '1433')
    monkeypatch.setenv('JUMUSIC_DB_USER', 'user')
    monkeypatch.setenv('JUMUSIC_DB_PASSWORD', 'password')
    monkeypatch.setenv('JUMUSIC_DB_DATABASE', 'database')

    config = module.load_db_config_from_env()

    assert config == {
        'server': 'server',
        'port': 1433,
        'user': 'user',
        'password': 'password',
        'database': 'database',
    }
