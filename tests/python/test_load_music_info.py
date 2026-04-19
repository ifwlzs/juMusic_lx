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
