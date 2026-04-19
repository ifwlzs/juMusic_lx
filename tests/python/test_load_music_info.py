from pathlib import Path
import importlib.util

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

class FakeCursor:
    def __init__(self):
        self.executed = []

    def execute(self, sql, params=None):
        self.executed.append((sql, params))

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


def test_ensure_table_creates_target_table_and_indexes():
    module = load_module()
    conn = FakeConnection()

    module.ensure_table(conn)

    sql_text = '\n'.join(item[0] for item in conn.cursor_obj.executed)
    assert 'ods_jumusic_music_info' in sql_text
    assert 'CREATE TABLE' in sql_text
    assert 'CREATE UNIQUE INDEX' in sql_text
    assert 'file_path' in sql_text
    assert conn.commit_count == 1

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
        'scan_status': 'SUCCESS',
        'scan_error': None,
    }

    row = module.build_music_row(file_info, metadata, batch_id='batch-1', now=now)

    assert row['batch_id'] == 'batch-1'
    assert row['file_path'] == 'Z:/Music/a.mp3'
    assert row['title'] == 'Song'
    assert row['etl_created_at'] == now
    assert row['etl_updated_at'] == now
