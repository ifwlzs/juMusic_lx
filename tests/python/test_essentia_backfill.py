from pathlib import Path
import importlib.util
import json


MODULE_PATH = Path(__file__).resolve().parents[2] / 'scripts' / 'music_etl' / 'backfill_essentia_genre.py'


def load_module():
    spec = importlib.util.spec_from_file_location('backfill_essentia_genre', MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_module_file_exists():
    assert MODULE_PATH.exists()


def test_build_remote_task_items_maps_windows_music_path_to_linux_mount():
    module = load_module()

    result = module.build_remote_task_items([
        r'Z:\Music\▓虚拟歌姬▓\IA\IA - 星見の唄.mp3',
        r'Z:\Music\Album\abc.flac',
    ])

    assert result == [
        {
            'file_path': '/mnt/hgfs/Music/▓虚拟歌姬▓/IA/IA - 星見の唄.mp3',
            'file_name': 'IA - 星見の唄.mp3',
        },
        {
            'file_path': '/mnt/hgfs/Music/Album/abc.flac',
            'file_name': 'abc.flac',
        },
    ]


def test_build_structured_rows_maps_linux_predictions_back_to_windows_paths():
    module = load_module()

    rows = module.build_structured_rows(
        raw_items=[
            {
                'file_path': '/mnt/hgfs/Music/▓虚拟歌姬▓/IA/IA - 星見の唄.mp3',
                'label': 'Pop---J-pop',
                'confidence': 0.88,
            },
            {
                'file_path': '/mnt/hgfs/Music/Album/inst.flac',
                'label': 'Electronic---Ambient',
                'confidence': 0.61,
            },
        ],
        inferred_at='2026-05-02T21:50:00+08:00',
        model_name='essentia-discogs400-discogs-effnet-1',
        source_name='linux-vm',
    )

    assert rows[0]['file_path'] == r'Z:\Music\▓虚拟歌姬▓\IA\IA - 星見の唄.mp3'
    assert rows[0]['genre_essentia_raw_label'] == 'Pop---J-pop'
    assert rows[0]['genre_essentia_parent'] == 'Pop'
    assert rows[0]['genre_essentia_child'] == 'J-pop'
    assert rows[0]['genre_essentia_depth'] == 2
    assert rows[0]['genre_essentia_label'] == 'J-pop'
    assert rows[0]['genre_essentia_confidence'] == 0.88
    assert rows[0]['genre_essentia_model'] == 'essentia-discogs400-discogs-effnet-1'
    assert rows[0]['genre_essentia_source'] == 'linux-vm'
    assert rows[0]['genre_essentia_inferred_at'] == '2026-05-02T21:50:00+08:00'
    assert rows[1]['file_path'] == r'Z:\Music\Album\inst.flac'
    assert rows[1]['genre_essentia_label'] == 'Ambient'


def test_load_and_save_state_round_trip(tmp_path):
    module = load_module()
    state_path = tmp_path / 'state.json'

    state = module.load_state(state_path, default_batch_no=7)
    assert state == {'current_batch': 7, 'completed_batches': [], 'last_error': None}

    state['completed_batches'].append(7)
    state['last_error'] = 'sample error'
    module.save_state(state_path, state)

    loaded = json.loads(state_path.read_text(encoding='utf-8'))
    assert loaded == state
