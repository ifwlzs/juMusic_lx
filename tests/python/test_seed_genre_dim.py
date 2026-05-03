from pathlib import Path
import importlib.util


MODULE_PATH = Path(__file__).resolve().parents[2] / 'scripts' / 'music_etl' / 'seed_genre_dim.py'


def load_module():
    spec = importlib.util.spec_from_file_location('seed_genre_dim', MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_module_file_exists():
    assert MODULE_PATH.exists()


def test_build_genre_dim_rows_expands_parent_child_and_path_labels():
    module = load_module()

    rows = module.build_genre_dim_rows([
        {'genre_essentia_parent': 'Pop', 'genre_essentia_child': 'J-pop', 'genre_essentia_path': 'Pop---J-pop'},
        {'genre_essentia_parent': 'Electronic', 'genre_essentia_child': 'House', 'genre_essentia_path': 'Electronic---House'},
        {'genre_essentia_parent': 'Pop', 'genre_essentia_child': 'J-pop', 'genre_essentia_path': 'Pop---J-pop'},
    ])

    keyed = {(row['genre_level'], row['genre_en']): row for row in rows}

    assert ('parent', 'Pop') in keyed
    assert ('child', 'J-pop') in keyed
    assert ('path', 'Pop---J-pop') in keyed
    assert keyed[('parent', 'Pop')]['genre_zh'] == '流行'
    assert keyed[('child', 'J-pop')]['genre_zh'] == '日系流行'
    assert keyed[('child', 'House')]['genre_zh'] == '浩室'
    assert keyed[('path', 'Pop---J-pop')]['parent_genre_en'] == 'Pop'
    assert keyed[('path', 'Pop---J-pop')]['child_genre_en'] == 'J-pop'
    assert keyed[('path', 'Pop---J-pop')]['genre_depth'] == 2


def test_genre_dim_seed_contains_common_essentia_translations():
    module = load_module()

    assert module.DEFAULT_GENRE_TRANSLATIONS['Pop'] == '流行'
    assert module.DEFAULT_GENRE_TRANSLATIONS['J-pop'] == '日系流行'
    assert module.DEFAULT_GENRE_TRANSLATIONS['Ballad'] == '抒情流行'
    assert module.DEFAULT_GENRE_TRANSLATIONS['Alternative Rock'] == '另类摇滚'
    assert module.DEFAULT_GENRE_TRANSLATIONS['House'] == '浩室'


def test_translate_genre_label_can_translate_path_style_labels():
    module = load_module()

    assert module.translate_genre_label('Pop---J-pop') == '流行 / 日系流行'
    assert module.translate_genre_label('Electronic---Drum n Bass') == '电子 / 鼓打贝斯'
    assert module.translate_genre_label('Stage & Screen---Soundtrack') == '舞台与影视 / 原声带'
