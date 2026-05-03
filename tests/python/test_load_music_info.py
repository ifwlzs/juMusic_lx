from pathlib import Path
import json
import importlib.util
import runpy

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
        'scan_status': 'SUCCESS',
        'scan_error': None,
    }



def test_split_genre_label_parses_two_level_path():
    module = load_module()

    result = module.split_genre_essentia_label('Pop---J-pop')

    assert result == {
        'genre_essentia_raw_label': 'Pop---J-pop',
        'genre_essentia_path': 'Pop---J-pop',
        'genre_essentia_parent': 'Pop',
        'genre_essentia_child': 'J-pop',
        'genre_essentia_depth': 2,
        'genre_essentia_label': 'J-pop',
    }


def test_split_genre_label_parses_single_level_path():
    module = load_module()

    result = module.split_genre_essentia_label('Vocaloid')

    assert result == {
        'genre_essentia_raw_label': 'Vocaloid',
        'genre_essentia_path': 'Vocaloid',
        'genre_essentia_parent': 'Vocaloid',
        'genre_essentia_child': None,
        'genre_essentia_depth': 1,
        'genre_essentia_label': 'Vocaloid',
    }


def test_split_genre_label_trims_empty_segments_and_handles_blank():
    module = load_module()

    assert module.split_genre_essentia_label(' Pop ---  J-pop ') == {
        'genre_essentia_raw_label': 'Pop ---  J-pop',
        'genre_essentia_path': 'Pop---J-pop',
        'genre_essentia_parent': 'Pop',
        'genre_essentia_child': 'J-pop',
        'genre_essentia_depth': 2,
        'genre_essentia_label': 'J-pop',
    }
    assert module.split_genre_essentia_label('   ') == {
        'genre_essentia_raw_label': None,
        'genre_essentia_path': None,
        'genre_essentia_parent': None,
        'genre_essentia_child': None,
        'genre_essentia_depth': None,
        'genre_essentia_label': None,
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


def test_build_music_row_overrides_artist_from_filename_for_virtual_singer_directory():
    from datetime import datetime

    module = load_module()
    now = datetime(2026, 5, 1, 12, 0, 0)
    file_info = {
        'root_path': 'Z:/Music/▓虚拟歌姬▓',
        'file_path': 'Z:/Music/▓虚拟歌姬▓/洛天依 - 勾指起誓.flac',
        'file_name': '洛天依 - 勾指起誓.flac',
        'file_ext': '.flac',
        'file_size': 123,
        'file_mtime': now,
        'file_md5': 'abc',
        'is_readable': True,
    }
    metadata = {
        'title': '勾指起誓',
        'artist': 'ilem',
        'album': 'Album',
        'album_artist': None,
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

    assert row['artist'] == '洛天依'


def test_build_music_row_extracts_bracket_artist_from_virtual_singer_filename():
    from datetime import datetime

    module = load_module()
    now = datetime(2026, 5, 1, 12, 0, 0)
    file_info = {
        'root_path': 'Z:/Music/▓虚拟歌姬▓',
        'file_path': 'Z:/Music/▓虚拟歌姬▓/【言和】少年游.mp3',
        'file_name': '【言和】少年游.mp3',
        'file_ext': '.mp3',
        'file_size': 123,
        'file_mtime': now,
        'file_md5': 'abc',
        'is_readable': True,
    }
    metadata = {
        'title': '少年游',
        'artist': 'Producer',
        'album': 'Album',
        'album_artist': None,
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

    assert row['artist'] == '言和'


def test_build_music_row_applies_artist_alias_map_after_filename_extraction():
    from datetime import datetime

    module = load_module()
    now = datetime(2026, 5, 1, 12, 0, 0)
    file_info = {
        'root_path': 'Z:/Music/▓虚拟歌姬▓',
        'file_path': 'Z:/Music/▓虚拟歌姬▓/洛天依Official - 勾指起誓.flac',
        'file_name': '洛天依Official - 勾指起誓.flac',
        'file_ext': '.flac',
        'file_size': 123,
        'file_mtime': now,
        'file_md5': 'abc',
        'is_readable': True,
    }
    metadata = {
        'title': '勾指起誓',
        'artist': 'ilem',
        'album': 'Album',
        'album_artist': None,
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

    row = module.build_music_row(
        file_info,
        metadata,
        batch_id='batch-1',
        now=now,
        artist_alias_map={'洛天依official': '洛天依'},
    )

    assert row['artist'] == '洛天依'


def test_build_music_row_does_not_override_artist_outside_virtual_singer_directory():
    from datetime import datetime

    module = load_module()
    now = datetime(2026, 5, 1, 12, 0, 0)
    file_info = {
        'root_path': 'Z:/Music/流行',
        'file_path': 'Z:/Music/流行/洛天依 - 勾指起誓.flac',
        'file_name': '洛天依 - 勾指起誓.flac',
        'file_ext': '.flac',
        'file_size': 123,
        'file_mtime': now,
        'file_md5': 'abc',
        'is_readable': True,
    }
    metadata = {
        'title': '勾指起誓',
        'artist': 'ilem',
        'album': 'Album',
        'album_artist': None,
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

    assert row['artist'] == 'ilem'


def test_apply_artist_alias_map_normalizes_official_suffix_to_canonical_artist():
    module = load_module()

    artist = module.apply_artist_alias_map(
        '洛天依Official',
        {
            '洛天依official': '洛天依',
        },
    )

    assert artist == '洛天依'


def test_apply_artist_alias_map_maps_each_artist_in_multi_artist_string():
    module = load_module()

    artist = module.apply_artist_alias_map(
        '哔哩哔哩拜年纪 / 洛天依Official / 乐正绫',
        {
            '洛天依official': '洛天依',
        },
    )

    assert artist == '哔哩哔哩拜年纪 / 洛天依 / 乐正绫'


def test_apply_artist_alias_map_maps_each_artist_in_comma_separated_string():
    module = load_module()

    artist = module.apply_artist_alias_map(
        'Greetea,洛天依Official,乐正绫',
        {
            '洛天依official': '洛天依',
        },
    )

    assert artist == 'Greetea / 洛天依 / 乐正绫'


def test_load_artist_alias_map_reads_enabled_aliases_only():
    module = load_module()

    class AliasCursor:
        def __init__(self):
            self.executed = []
            self.description = []

        def execute(self, sql, params=None):
            self.executed.append((sql, params))
            self.description = [('alias_name_norm',), ('canonical_artist',)]

        def fetchall(self):
            return [
                ('洛天依official', '洛天依'),
                ('言和official', '言和'),
            ]

        def close(self):
            pass

    class AliasConn:
        def __init__(self):
            self.cursor_obj = AliasCursor()

        def cursor(self):
            return self.cursor_obj

    alias_map = module.load_artist_alias_map(AliasConn())

    assert alias_map == {
        '洛天依official': '洛天依',
        '言和official': '言和',
    }

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
        self.closed = False

    def cursor(self):
        return self.cursor_obj

    def commit(self):
        self.commit_count += 1

    def close(self):
        self.closed = True


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
    assert 'ods_jumusic_artist_alias' in sql_text
    assert conn.commit_count == 1


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


def test_ensure_table_contains_comment_sql():
    module = load_module()

    sql_text = '\n'.join(module.COMMENT_SQLS)
    assert 'ods_jumusic_music_info' in sql_text
    assert 'ods_jumusic_artist_alias' in sql_text
    assert 'ods_jumusic_genre_dim' in sql_text
    assert '歌曲维表' in sql_text
    assert '歌手别名映射表' in sql_text
    assert '曲风维度表' in sql_text
    assert 'file_path' in sql_text
    assert 'duration_sec' in sql_text
    assert 'alias_name' in sql_text
    assert 'canonical_artist' in sql_text
    assert 'genre_essentia_label' in sql_text
    assert 'genre_essentia_confidence' in sql_text
    assert 'genre_essentia_model' in sql_text
    assert 'genre_essentia_inferred_at' in sql_text

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


def test_ensure_table_creates_genre_dim_table_and_indexes():
    module = load_module()
    conn = FakeConnection()

    module.ensure_table(conn)

    sql_text = '\n'.join(item[0] for item in conn.cursor_obj.executed)
    assert 'ods_jumusic_genre_dim' in sql_text
    assert 'ux_ods_jumusic_genre_dim_level_genre_en' in sql_text
    assert 'genre_zh' in sql_text
    assert 'parent_genre_en' in sql_text
    assert 'child_genre_en' in sql_text


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


def test_build_music_row_can_merge_external_genre_inference_payload():
    from datetime import datetime

    module = load_module()
    now = datetime(2026, 5, 2, 13, 30, 0)
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
    genre_inference = {
        'genre_essentia_label': 'Vocaloid',
        'genre_essentia_confidence': 0.9234,
        'genre_essentia_model': 'essentia-discogs-effnet-bs64-1',
        'genre_essentia_source': 'wsl',
        'genre_essentia_inferred_at': now,
    }

    row = module.build_music_row(
        file_info,
        metadata,
        batch_id='batch-1',
        now=now,
        genre_inference=genre_inference,
    )

    assert row['genre_essentia_label'] == 'Vocaloid'
    assert row['genre_essentia_confidence'] == 0.9234
    assert row['genre_essentia_model'] == 'essentia-discogs-effnet-bs64-1'
    assert row['genre_essentia_source'] == 'wsl'
    assert row['genre_essentia_inferred_at'] == now


def test_load_genre_inference_map_reads_json_by_file_path(tmp_path):
    import json

    module = load_module()
    payload = [
        {
            'file_path': 'Z:/Music/a.mp3',
            'genre_essentia_label': 'Vocaloid',
            'genre_essentia_confidence': 0.9,
        },
        {
            'file_path': 'Z:/Music/b.mp3',
            'genre_essentia_label': 'J-Pop',
            'genre_essentia_confidence': 0.8,
        },
    ]
    path = tmp_path / 'genre_inference.json'
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding='utf-8')

    result = module.load_genre_inference_map(path)

    assert result['Z:/Music/a.mp3']['genre_essentia_label'] == 'Vocaloid'
    assert result['Z:/Music/b.mp3']['genre_essentia_confidence'] == 0.8

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
    assert stats == {'scanned': 2, 'success': 2, 'failed': 0, 'skipped': 0}
    assert {row['file_path'] for row in rows} == {str(first), str(second)}


def test_collect_music_rows_passes_matching_external_genre_inference_into_built_rows(monkeypatch):
    module = load_module()
    files = ['a.mp3']
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

    rows, stats = module.collect_music_rows(
        'Z:/Music',
        batch_id='batch-1',
        genre_inference_map={
            'a.mp3': {
                'genre_essentia_label': 'Vocaloid',
                'genre_essentia_confidence': 0.95,
            }
        },
    )

    assert stats == {'scanned': 1, 'success': 1, 'failed': 0, 'skipped': 0}
    assert rows[0]['genre_essentia_label'] == 'Vocaloid'
    assert rows[0]['genre_essentia_confidence'] == 0.95

def test_main_runs_table_creation_collection_and_upsert(monkeypatch, capsys):
    module = load_module()
    calls = []

    class DummyConn:
        pass

    monkeypatch.setattr(module, 'load_db_config_from_env', lambda: {'server': 'x'})
    monkeypatch.setattr(module, 'connect_db', lambda config: calls.append(('connect', config)) or DummyConn())
    monkeypatch.setattr(module, 'ensure_table', lambda conn: calls.append(('ensure_table', conn)))
    monkeypatch.setattr(module, 'load_artist_alias_map', lambda conn: {})
    monkeypatch.setattr(module, 'collect_music_rows', lambda root_path, batch_id=None, now=None, limit=None, artist_alias_map=None, changed_only=False, existing_index=None, genre_inference_map=None: (
        [{'file_path': 'masked', 'scan_status': 'SUCCESS', 'batch_id': 'batch-1'}],
        {'scanned': 1, 'success': 1, 'failed': 0, 'skipped': 0},
    ))
    monkeypatch.setattr(module, 'upsert_music_rows', lambda conn, rows: calls.append(('upsert', conn, rows)) or {'updated': 0, 'inserted': 1})
    monkeypatch.setattr(module, 'run_genre_inference_pipeline', lambda conn, batch_id, now=None, limit=None: calls.append(('genre', conn, batch_id, limit)) or {'pending': 1, 'received': 1, 'updated': 1, 'skipped': 0})

    module.main(root_path='X:/Sample', limit=1)
    output = capsys.readouterr().out

    assert calls[0][0] == 'connect'
    assert calls[1][0] == 'ensure_table'
    assert calls[2][0] == 'upsert'
    assert calls[3][0] == 'genre'
    assert 'scan scanned=1 success=1 failed=0 skipped=0' in output
    assert 'load updated=0 inserted=1' in output
    assert 'genre skipped=no pending=1 received=1 updated=1 timeout_skipped=0' in output
    assert 'X:/Sample' not in output


def test_main_loads_artist_alias_map_before_collecting_rows(monkeypatch, capsys):
    module = load_module()
    calls = []

    class DummyConn:
        pass

    monkeypatch.setattr(module, 'load_db_config_from_env', lambda: {'server': 'x'})
    monkeypatch.setattr(module, 'connect_db', lambda config: calls.append(('connect', config)) or DummyConn())
    monkeypatch.setattr(module, 'ensure_table', lambda conn: calls.append(('ensure_table', conn)))
    monkeypatch.setattr(module, 'load_artist_alias_map', lambda conn: calls.append(('load_artist_alias_map', conn)) or {'洛天依official': '洛天依'})
    monkeypatch.setattr(module, 'collect_music_rows', lambda root_path, batch_id=None, now=None, limit=None, artist_alias_map=None, changed_only=False, existing_index=None, genre_inference_map=None: (
        calls.append(('collect_music_rows', artist_alias_map, changed_only, existing_index, genre_inference_map)) or [{'file_path': 'masked', 'scan_status': 'SUCCESS', 'batch_id': 'batch-1'}],
        {'scanned': 1, 'success': 1, 'failed': 0, 'skipped': 0},
    ))
    monkeypatch.setattr(module, 'upsert_music_rows', lambda conn, rows: calls.append(('upsert', conn, rows)) or {'updated': 0, 'inserted': 1})
    monkeypatch.setattr(module, 'run_genre_inference_pipeline', lambda conn, batch_id, now=None, limit=None: calls.append(('genre', batch_id, limit)) or {'pending': 1, 'received': 1, 'updated': 1, 'skipped': 0})

    module.main(root_path='X:/Sample', limit=1)
    output = capsys.readouterr().out

    assert calls[0][0] == 'connect'
    assert calls[1][0] == 'ensure_table'
    assert calls[2][0] == 'load_artist_alias_map'
    assert calls[3] == ('collect_music_rows', {'洛天依official': '洛天依'}, False, None, None)
    assert calls[5] == ('genre', 'batch-1', 1)
    assert 'load updated=0 inserted=1' in output


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


def test_collect_music_rows_skips_unchanged_files_when_changed_only(monkeypatch):
    from datetime import datetime

    module = load_module()
    files = ['a.mp3', 'b.mp3']
    file_info_map = {
        'a.mp3': {
            'root_path': 'Z:/Music',
            'file_path': 'a.mp3',
            'file_name': 'a.mp3',
            'file_ext': '.mp3',
            'file_size': 100,
            'file_mtime': datetime(2026, 5, 1, 10, 0, 0),
            'file_md5': 'a',
            'is_readable': True,
        },
        'b.mp3': {
            'root_path': 'Z:/Music',
            'file_path': 'b.mp3',
            'file_name': 'b.mp3',
            'file_ext': '.mp3',
            'file_size': 200,
            'file_mtime': datetime(2026, 5, 1, 11, 0, 0),
            'file_md5': 'b',
            'is_readable': True,
        },
    }

    monkeypatch.setattr(module, 'iter_music_files', lambda _root: files)
    monkeypatch.setattr(module, 'extract_file_info', lambda path, root_path: file_info_map[path])
    monkeypatch.setattr(module, 'extract_audio_metadata', lambda _path: module.empty_audio_metadata())

    rows, stats = module.collect_music_rows(
        'Z:/Music',
        batch_id='batch-1',
        changed_only=True,
        existing_index={
            'a.mp3': {'file_size': 100, 'file_mtime': datetime(2026, 5, 1, 10, 0, 0)},
        },
    )

    assert [row['file_path'] for row in rows] == ['b.mp3']
    assert stats == {'scanned': 2, 'success': 1, 'failed': 0, 'skipped': 1}


def test_parse_args_defaults_to_configured_music_root(monkeypatch):
    module = load_module()
    monkeypatch.setattr('sys.argv', ['load_music_info.py'])

    args = module.parse_args()

    assert args.root_path == module.DEFAULT_LOCAL_MUSIC_ROOT
    assert args.changed_only is False
    assert args.skip_genre_inference is False


def test_parse_args_accepts_changed_only(monkeypatch):
    module = load_module()
    monkeypatch.setattr('sys.argv', ['load_music_info.py', '--changed-only'])

    args = module.parse_args()

    assert args.changed_only is True


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


def test_load_db_config_from_env_accepts_db_url(monkeypatch):
    module = load_module()
    monkeypatch.delenv('JUMUSIC_DB_SERVER', raising=False)
    monkeypatch.delenv('JUMUSIC_DB_PORT', raising=False)
    monkeypatch.delenv('JUMUSIC_DB_USER', raising=False)
    monkeypatch.delenv('JUMUSIC_DB_PASSWORD', raising=False)
    monkeypatch.delenv('JUMUSIC_DB_DATABASE', raising=False)
    monkeypatch.setenv('JUMUSIC_DB_URL', 'mssql+pymssql://sa:ifwlzs@192.168.2.156:1433/db_tgmsg')

    config = module.load_db_config_from_env()

    assert config == {
        'server': '192.168.2.156',
        'port': 1433,
        'user': 'sa',
        'password': 'ifwlzs',
        'database': 'db_tgmsg',
    }


def test_main_closes_connection(monkeypatch):
    module = load_module()
    conn = FakeConnection()

    monkeypatch.setattr(module, 'load_db_config_from_env', lambda: {'server': 'x'})
    monkeypatch.setattr(module, 'connect_db', lambda config: conn)
    monkeypatch.setattr(module, 'ensure_table', lambda actual_conn: None)
    monkeypatch.setattr(module, 'load_artist_alias_map', lambda actual_conn: {})
    monkeypatch.setattr(module, 'collect_music_rows', lambda root_path, batch_id=None, now=None, limit=None, artist_alias_map=None, changed_only=False, existing_index=None, genre_inference_map=None: (
        [{'file_path': 'masked', 'scan_status': 'SUCCESS'}],
        {'scanned': 1, 'success': 1, 'failed': 0, 'skipped': 0},
    ))
    monkeypatch.setattr(module, 'upsert_music_rows', lambda actual_conn, rows: {'updated': 0, 'inserted': 1})

    module.main(root_path='X:/Sample', limit=1)

    assert conn.closed is True


def test_module_script_entrypoint_invokes_main(monkeypatch, capsys):
    import pymssql

    class ScriptCursor:
        def __init__(self):
            self.executed = []
            self.rowcount = 0
            self.description = []

        def execute(self, sql, params=None):
            self.executed.append((sql, params))
            if 'SELECT alias_name_norm, canonical_artist' in sql:
                self.description = [('alias_name_norm',), ('canonical_artist',)]
            else:
                self.description = []
            self.rowcount = 0

        def fetchall(self):
            return []

        def close(self):
            pass

    class ScriptConn:
        def __init__(self):
            self.cursor_obj = ScriptCursor()

        def cursor(self):
            return self.cursor_obj

        def commit(self):
            pass

        def close(self):
            pass

    monkeypatch.setattr('sys.argv', ['load_music_info.py', '--root-path', 'Z:/Music/▓虚拟歌姬▓', '--limit', '5'])
    monkeypatch.setenv('JUMUSIC_DB_URL', 'mssql+pymssql://sa:pass@127.0.0.1:1433/db_tgmsg')
    monkeypatch.setattr(pymssql, 'connect', lambda **_kwargs: ScriptConn())

    runpy.run_path(str(MODULE_PATH), run_name='__main__')
    output = capsys.readouterr().out

    assert 'scan scanned=' in output
    assert 'load updated=' in output


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
    assert stats == {'scanned': 1, 'success': 0, 'failed': 1, 'skipped': 0}


def test_parse_args_accepts_skip_genre_inference(monkeypatch):
    module = load_module()
    monkeypatch.setattr('sys.argv', ['load_music_info.py', '--skip-genre-inference'])

    args = module.parse_args()

    assert args.skip_genre_inference is True


def test_load_vm_config_from_env_reads_default_and_override(monkeypatch):
    module = load_module()
    monkeypatch.delenv('JUMUSIC_VM_HOST', raising=False)
    monkeypatch.delenv('JUMUSIC_VM_PORT', raising=False)
    monkeypatch.delenv('JUMUSIC_VM_USER', raising=False)
    monkeypatch.delenv('JUMUSIC_VM_PASSWORD', raising=False)

    default_config = module.load_vm_config_from_env()

    assert default_config == module.DEFAULT_VM_CONFIG

    monkeypatch.setenv('JUMUSIC_VM_HOST', '10.0.0.9')
    monkeypatch.setenv('JUMUSIC_VM_PORT', '2200')
    monkeypatch.setenv('JUMUSIC_VM_USER', 'tester')
    monkeypatch.setenv('JUMUSIC_VM_PASSWORD', 'secret')

    override_config = module.load_vm_config_from_env()

    assert override_config == {
        'host': '10.0.0.9',
        'port': 2200,
        'username': 'tester',
        'password': 'secret',
    }


def test_windows_path_to_vm_path_maps_shared_music_directory():
    module = load_module()

    result = module.windows_path_to_vm_path(r'Z:\Music\中\邓丽君 - 我只在乎你.mp3')

    assert result == '/mnt/hgfs/Music/中/邓丽君 - 我只在乎你.mp3'


def test_vm_path_to_windows_path_restores_local_music_directory():
    module = load_module()

    result = module.vm_path_to_windows_path('/mnt/hgfs/Music/▓虚拟歌姬▓/洛天依/外婆桥.flac')

    assert result == r'Z:\Music\▓虚拟歌姬▓\洛天依\外婆桥.flac'


def test_normalize_genre_inference_results_maps_vm_output_into_structured_fields():
    module = load_module()

    rows = module.normalize_genre_inference_results([
        {
            'file_path': '/mnt/hgfs/Music/中/邓丽君 - 我只在乎你.mp3',
            'label': 'Pop---Kayōkyoku',
            'confidence': 0.199437,
        },
    ], inferred_at='2026-05-03T16:00:00')

    assert rows[0]['file_path'] == r'Z:\Music\中\邓丽君 - 我只在乎你.mp3'
    assert rows[0]['genre_essentia_label'] == 'Kayōkyoku'
    assert rows[0]['genre_essentia_raw_label'] == 'Pop---Kayōkyoku'
    assert rows[0]['genre_essentia_path'] == 'Pop---Kayōkyoku'
    assert rows[0]['genre_essentia_parent'] == 'Pop'
    assert rows[0]['genre_essentia_child'] == 'Kayōkyoku'
    assert rows[0]['genre_essentia_depth'] == 2
    assert rows[0]['genre_essentia_confidence'] == 0.199437
    assert rows[0]['genre_essentia_model'] == 'essentia-external'
    assert rows[0]['genre_essentia_source'] == 'vm'
    assert rows[0]['genre_essentia_inferred_at'] == '2026-05-03T16:00:00'


def test_fetch_pending_genre_file_paths_returns_only_current_batch_rows():
    module = load_module()
    conn = FakeConnection()
    conn.cursor_obj.rows = [('Z:/Music/a.mp3',), ('Z:/Music/b.mp3',)]
    conn.cursor_obj.fetchall = lambda: conn.cursor_obj.rows

    result = module.fetch_pending_genre_file_paths(conn, batch_id='batch-1', limit=1)

    assert result == ['Z:/Music/a.mp3']
    sql_text = conn.cursor_obj.executed[0][0]
    assert 'genre_essentia_label' in sql_text
    assert 'genre_essentia_path' in sql_text
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
        self.rowcount = 0

    def execute(self, sql, params=None):
        super().execute(sql, params)
        self.rowcount = self._rowcounts.pop(0)


class FakeApplyConnection(FakeConnection):
    def __init__(self, rowcounts):
        self.cursor_obj = FakeApplyCursor(rowcounts)
        self.commit_count = 0
        self.closed = False


def test_apply_genre_inference_results_updates_rows_by_file_path():
    module = load_module()
    conn = FakeApplyConnection([1, 0])

    stats = module.apply_genre_inference_results(conn, [
        {
            'file_path': r'Z:\Music\a.mp3',
            'genre_essentia_label': 'Ballad',
            'genre_essentia_raw_label': 'Pop---Ballad',
            'genre_essentia_path': 'Pop---Ballad',
            'genre_essentia_parent': 'Pop',
            'genre_essentia_child': 'Ballad',
            'genre_essentia_depth': 2,
            'genre_essentia_confidence': 0.4,
            'genre_essentia_model': 'essentia-external',
            'genre_essentia_source': 'vm',
            'genre_essentia_inferred_at': '2026-05-03T16:00:00',
        },
        {
            'file_path': r'Z:\Music\b.mp3',
            'genre_essentia_label': 'Rock',
            'genre_essentia_raw_label': 'Rock',
            'genre_essentia_path': 'Rock',
            'genre_essentia_parent': 'Rock',
            'genre_essentia_child': None,
            'genre_essentia_depth': 1,
            'genre_essentia_confidence': 0.2,
            'genre_essentia_model': 'essentia-external',
            'genre_essentia_source': 'vm',
            'genre_essentia_inferred_at': '2026-05-03T16:00:00',
        },
    ])

    assert stats == {'updated': 1}
    sql_text = conn.cursor_obj.executed[0][0]
    assert 'genre_essentia_raw_label' in sql_text
    assert 'genre_essentia_path' in sql_text
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

    def fake_run_vm(file_paths, batch_id, vm_config=None, top_k=module.DEFAULT_VM_TOP_K, request_id=None, timeout_sec=module.DEFAULT_VM_GENRE_TIMEOUT_SEC):
        vm_calls.append((tuple(file_paths), batch_id))
        return [{'file_path': path, 'label': f'label-{index}', 'confidence': 0.5} for index, path in enumerate(file_paths, start=1)]

    def fake_normalize(items, inferred_at=None):
        return [
            {
                'file_path': item['file_path'],
                'genre_essentia_label': item['label'],
                'genre_essentia_raw_label': item['label'],
                'genre_essentia_path': item['label'],
                'genre_essentia_parent': item['label'],
                'genre_essentia_child': None,
                'genre_essentia_depth': 1,
                'genre_essentia_confidence': item['confidence'],
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

    def fake_run_vm(file_paths, batch_id, vm_config=None, top_k=module.DEFAULT_VM_TOP_K, request_id=None, timeout_sec=module.DEFAULT_VM_GENRE_TIMEOUT_SEC):
        if file_paths[0].endswith('a.mp3'):
            raise RuntimeError('remote command timed out')
        return [{'file_path': path, 'label': 'Pop', 'confidence': 0.5} for path in file_paths]

    def fake_normalize(items, inferred_at=None):
        return [
            {
                'file_path': item['file_path'],
                'genre_essentia_label': item['label'],
                'genre_essentia_raw_label': item['label'],
                'genre_essentia_path': item['label'],
                'genre_essentia_parent': item['label'],
                'genre_essentia_child': None,
                'genre_essentia_depth': 1,
                'genre_essentia_confidence': item['confidence'],
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
        scan_stats={'scanned': 3, 'success': 3, 'failed': 0, 'skipped': 0},
        load_stats={'updated': 1, 'inserted': 2},
        genre_stats={'pending': 0, 'received': 0, 'updated': 0, 'skipped': 0},
        skip_genre_inference=True,
    )

    assert 'batch=batch-2' in summary
    assert 'root_name=Music' in summary
    assert 'genre skipped=yes pending=0 received=0 updated=0 timeout_skipped=0' in summary


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


def test_exec_remote_command_reads_stdout_and_stderr_without_blocking():
    module = load_module()
    channel = FakeRemoteChannel(stdout_chunks=['hello'], stderr_chunks=['warn'], exit_code=0, ready_after_checks=1)
    client = FakeSSHClient(channel)

    output = module._exec_remote_command(client, 'echo hello', timeout=1, poll_interval=0)

    assert output == 'hello'
    assert channel.closed is False


def test_exec_remote_command_raises_timeout_and_closes_channel(monkeypatch):
    module = load_module()
    channel = FakeRemoteChannel(stdout_chunks=[], stderr_chunks=[], exit_code=0, ready_after_checks=999)
    client = FakeSSHClient(channel)
    values = iter([0.0, 0.6, 1.2])

    monkeypatch.setattr(module.time, 'monotonic', lambda: next(values))
    monkeypatch.setattr(module.time, 'sleep', lambda _interval: None)

    try:
        module._exec_remote_command(client, 'sleep 2', timeout=1, poll_interval=0)
        assert False, 'expected TimeoutError'
    except TimeoutError as exc:
        assert 'remote command timed out' in str(exc)
    assert channel.closed is True


def test_artist_alias_seed_script_exists():
    seed_script = Path(__file__).resolve().parents[2] / 'scripts' / 'music_etl' / 'seed_artist_aliases.py'
    assert seed_script.exists()


def test_artist_alias_seed_script_uses_local_importable_module_path():
    seed_script = Path(__file__).resolve().parents[2] / 'scripts' / 'music_etl' / 'seed_artist_aliases.py'
    content = seed_script.read_text(encoding='utf-8')
    assert 'sys.path.insert' in content
    assert 'from load_music_info import' in content


def test_essentia_external_normalizer_script_can_rewrite_payload(tmp_path):
    import json

    script = Path(__file__).resolve().parents[2] / 'scripts' / 'music_etl' / 'run_essentia_genre_inference.py'
    assert script.exists()

    input_path = tmp_path / 'raw.json'
    output_path = tmp_path / 'normalized.json'
    input_path.write_text(json.dumps([
        {'file_path': 'Z:/Music/a.mp3', 'label': 'Vocaloid', 'confidence': 0.91},
        {'file_path': 'Z:/Music/b.mp3', 'genre_essentia_label': 'J-Pop', 'genre_essentia_confidence': 0.87},
    ], ensure_ascii=False), encoding='utf-8')

    namespace = runpy.run_path(str(script))
    result = namespace['main_normalize'](
        input_json=str(input_path),
        output_json=str(output_path),
        model_name='essentia-test-model',
        source='wsl',
    )

    saved = json.loads(output_path.read_text(encoding='utf-8'))
    assert result[0]['genre_essentia_label'] == 'Vocaloid'
    assert result[0]['genre_essentia_model'] == 'essentia-test-model'
    assert saved[1]['genre_essentia_label'] == 'J-Pop'



def test_warehouse_columns_include_structured_essentia_genre_fields():
    module = load_module()

    assert 'genre_essentia_raw_label' in module.WAREHOUSE_COLUMNS
    assert 'genre_essentia_path' in module.WAREHOUSE_COLUMNS
    assert 'genre_essentia_parent' in module.WAREHOUSE_COLUMNS
    assert 'genre_essentia_child' in module.WAREHOUSE_COLUMNS
    assert 'genre_essentia_depth' in module.WAREHOUSE_COLUMNS


def test_build_music_row_expands_structured_essentia_genre_fields():
    from datetime import datetime

    module = load_module()
    now = datetime(2026, 5, 2, 10, 0, 0)

    row = module.build_music_row(
        file_info={
            'root_path': 'Z:/Music',
            'file_path': 'Z:/Music/a.mp3',
            'file_name': 'a.mp3',
            'file_ext': '.mp3',
            'file_size': 1,
            'file_mtime': now,
            'file_md5': 'x',
            'is_readable': True,
        },
        metadata={
            'title': 'a', 'artist': 'b', 'album': None, 'album_artist': None,
            'track_no': None, 'disc_no': None, 'genre': None, 'year': None,
            'duration_sec': 1.0, 'bitrate': None, 'sample_rate': None, 'channels': None,
            'scan_status': 'SUCCESS', 'scan_error': None,
        },
        batch_id='batch-1',
        now=now,
        genre_inference={
            'genre_essentia_label': 'Pop---J-pop',
            'genre_essentia_confidence': 0.91,
            'genre_essentia_model': 'essentia-test',
            'genre_essentia_source': 'linux-vm',
            'genre_essentia_inferred_at': now,
        },
    )

    assert row['genre_essentia_raw_label'] == 'Pop---J-pop'
    assert row['genre_essentia_path'] == 'Pop---J-pop'
    assert row['genre_essentia_parent'] == 'Pop'
    assert row['genre_essentia_child'] == 'J-pop'
    assert row['genre_essentia_depth'] == 2
    assert row['genre_essentia_label'] == 'J-pop'



def test_load_genre_inference_map_keeps_structured_essentia_fields(tmp_path):
    module = load_module()
    path = tmp_path / 'genre.json'
    path.write_text(json.dumps([
        {
            'file_path': 'Z:/Music/a.mp3',
            'genre_essentia_raw_label': 'Pop---J-pop',
            'genre_essentia_path': 'Pop---J-pop',
            'genre_essentia_parent': 'Pop',
            'genre_essentia_child': 'J-pop',
            'genre_essentia_depth': 2,
            'genre_essentia_label': 'J-pop',
            'genre_essentia_confidence': 0.88,
        }
    ], ensure_ascii=False), encoding='utf-8')

    result = module.load_genre_inference_map(str(path))

    assert result['Z:/Music/a.mp3']['genre_essentia_parent'] == 'Pop'
    assert result['Z:/Music/a.mp3']['genre_essentia_child'] == 'J-pop'
    assert result['Z:/Music/a.mp3']['genre_essentia_depth'] == 2
