from pathlib import Path
import importlib.util
import json


MODULE_PATH = Path(__file__).resolve().parents[2] / 'scripts' / 'music_etl' / 'run_essentia_genre_inference.py'


def load_module():
    spec = importlib.util.spec_from_file_location('run_essentia_genre_inference', MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_module_file_exists():
    assert MODULE_PATH.exists()


def test_collect_audio_files_scans_supported_music_extensions(tmp_path):
    module = load_module()
    root = tmp_path / 'mnt' / 'hgfs' / 'Music'
    root.mkdir(parents=True)
    keep1 = root / 'a.mp3'
    keep2 = root / 'b.flac'
    skip = root / 'c.txt'
    keep1.write_bytes(b'a')
    keep2.write_bytes(b'b')
    skip.write_text('x', encoding='utf-8')

    result = module.collect_audio_files(root)

    assert result == [keep1, keep2]


def test_build_inference_tasks_uses_posix_paths_and_skips_already_known_results(tmp_path):
    module = load_module()
    root = tmp_path / 'mnt' / 'hgfs' / 'Music'
    root.mkdir(parents=True)
    first = root / 'x' / 'a.mp3'
    second = root / 'y' / 'b.flac'
    first.parent.mkdir(parents=True)
    second.parent.mkdir(parents=True)
    first.write_bytes(b'a')
    second.write_bytes(b'b')

    tasks = module.build_inference_tasks(
        [first, second],
        existing_results={str(first).replace('\\', '/'): {'genre_essentia_label': 'Vocaloid'}},
    )

    assert tasks == [
        {
            'file_path': str(second).replace('\\', '/'),
            'file_name': 'b.flac',
        }
    ]


def test_main_task_mode_emits_todo_json_without_running_essentia(tmp_path):
    module = load_module()
    root = tmp_path / 'mnt' / 'hgfs' / 'Music'
    root.mkdir(parents=True)
    (root / 'a.mp3').write_bytes(b'a')
    (root / 'b.flac').write_bytes(b'b')
    output = tmp_path / 'tasks.json'

    result = module.main_scan(root_path=str(root), output_json=str(output))
    saved = json.loads(output.read_text(encoding='utf-8'))

    assert result['task_count'] == 2
    assert len(saved) == 2
    assert saved[0]['file_path'].startswith(str(root).replace('\\', '/'))


def test_normalize_payload_keeps_external_result_contract():
    module = load_module()

    result = module.normalize_payload([
        {
            'file_path': '/mnt/hgfs/Music/a.mp3',
            'label': 'Vocaloid',
            'confidence': 0.88,
        }
    ], model_name='essentia-linux', source='linux')

    assert result[0]['genre_essentia_label'] == 'Vocaloid'
    assert result[0]['genre_essentia_confidence'] == 0.88
    assert result[0]['genre_essentia_model'] == 'essentia-linux'
    assert result[0]['genre_essentia_source'] == 'linux'


def test_infer_tasks_calls_predictor_and_preserves_file_paths():
    module = load_module()
    tasks = [
        {'file_path': '/mnt/hgfs/Music/a.mp3', 'file_name': 'a.mp3'},
        {'file_path': '/mnt/hgfs/Music/b.flac', 'file_name': 'b.flac'},
    ]

    result = module.infer_tasks(
        tasks,
        predictor=lambda file_path: {
            'label': 'Vocaloid' if file_path.endswith('.mp3') else 'J-Pop',
            'confidence': 0.91 if file_path.endswith('.mp3') else 0.82,
        },
    )

    assert result == [
        {'file_path': '/mnt/hgfs/Music/a.mp3', 'label': 'Vocaloid', 'confidence': 0.91},
        {'file_path': '/mnt/hgfs/Music/b.flac', 'label': 'J-Pop', 'confidence': 0.82},
    ]


def test_main_infer_reads_tasks_and_writes_raw_predictions(tmp_path):
    module = load_module()
    tasks_path = tmp_path / 'tasks.json'
    output_path = tmp_path / 'raw_predictions.json'
    tasks_path.write_text(json.dumps([
        {'file_path': '/mnt/hgfs/Music/a.mp3', 'file_name': 'a.mp3'},
        {'file_path': '/mnt/hgfs/Music/b.flac', 'file_name': 'b.flac'},
    ], ensure_ascii=False), encoding='utf-8')

    result = module.main_infer(
        tasks_json=str(tasks_path),
        output_json=str(output_path),
        predictor=lambda file_path: {'label': 'Vocaloid', 'confidence': 0.77},
    )

    saved = json.loads(output_path.read_text(encoding='utf-8'))
    assert result['prediction_count'] == 2
    assert saved[0]['label'] == 'Vocaloid'
    assert saved[1]['confidence'] == 0.77


def test_pick_top_prediction_averages_patch_scores_before_selecting_label():
    module = load_module()

    label, confidence = module.pick_top_prediction(
        predictions=[
            [0.1, 0.8, 0.1],
            [0.2, 0.7, 0.1],
        ],
        labels=['A', 'B', 'C'],
    )

    assert label == 'B'
    assert round(confidence, 4) == 0.75


def test_load_model_labels_accepts_common_metadata_shapes(tmp_path):
    module = load_module()
    path = tmp_path / 'meta.json'
    path.write_text(json.dumps({
        'classes': [
            {'name': 'Vocaloid'},
            {'name': 'J-Pop'},
        ]
    }, ensure_ascii=False), encoding='utf-8')

    labels = module.load_model_labels(str(path))

    assert labels == ['Vocaloid', 'J-Pop']



def test_pick_top_prediction_accepts_single_vector_predictions():
    module = load_module()

    label, confidence = module.pick_top_prediction(
        predictions=[0.2, 0.6, 0.2],
        labels=['A', 'B', 'C'],
    )

    assert label == 'B'
    assert round(confidence, 4) == 0.6


def test_build_essentia_predictor_uses_embedding_and_classifier_models(tmp_path, monkeypatch):
    import sys
    import types

    module = load_module()
    metadata = tmp_path / 'genre.json'
    metadata.write_text(json.dumps({'classes': ['A', 'B', 'C']}, ensure_ascii=False), encoding='utf-8')
    embedding_pb = tmp_path / 'discogs-effnet-bs64-1.pb'
    classifier_pb = tmp_path / 'genre_discogs400-discogs-effnet-1.pb'
    embedding_pb.write_bytes(b'pb')
    classifier_pb.write_bytes(b'pb')

    calls = {}

    class FakeMonoLoader:
        def __init__(self, filename=None, sampleRate=None, resampleQuality=None):
            calls['mono_loader_init'] = {
                'filename': filename,
                'sampleRate': sampleRate,
                'resampleQuality': resampleQuality,
            }

        def __call__(self):
            calls['mono_loader_called'] = True
            return 'audio-samples'

    class FakeEffnet:
        def __init__(self, **kwargs):
            calls['embedding_init'] = kwargs

        def __call__(self, audio):
            calls['embedding_audio'] = audio
            return [[1.0, 2.0], [3.0, 4.0]]

    class FakePredict2D:
        def __init__(self, **kwargs):
            calls['classifier_init'] = kwargs

        def __call__(self, embeddings):
            calls['classifier_embeddings'] = embeddings
            return [[0.1, 0.8, 0.1], [0.2, 0.7, 0.1]]

    fake_standard = types.ModuleType('essentia.standard')
    fake_standard.MonoLoader = FakeMonoLoader
    fake_standard.TensorflowPredictEffnetDiscogs = FakeEffnet
    fake_standard.TensorflowPredict2D = FakePredict2D

    fake_essentia = types.ModuleType('essentia')
    fake_essentia.standard = fake_standard

    monkeypatch.setitem(sys.modules, 'essentia', fake_essentia)
    monkeypatch.setitem(sys.modules, 'essentia.standard', fake_standard)

    predictor = module.build_essentia_predictor(
        embedding_model_pb=str(embedding_pb),
        classifier_model_pb=str(classifier_pb),
        metadata_json=str(metadata),
    )
    result = predictor('/mnt/hgfs/Music/a.mp3')

    assert result['label'] == 'B'
    assert round(result['confidence'], 4) == 0.75
    assert calls['mono_loader_init'] == {
        'filename': '/mnt/hgfs/Music/a.mp3',
        'sampleRate': 16000,
        'resampleQuality': 4,
    }
    assert calls['embedding_init']['graphFilename'] == str(embedding_pb)
    assert calls['embedding_init']['output'] == 'PartitionedCall:1'
    assert calls['classifier_init']['graphFilename'] == str(classifier_pb)
    assert calls['classifier_init']['input'] == 'serving_default_model_Placeholder'
    assert calls['classifier_init']['output'] == 'PartitionedCall:0'
    assert calls['embedding_audio'] == 'audio-samples'
    assert calls['classifier_embeddings'] == [[1.0, 2.0], [3.0, 4.0]]


def test_default_model_specs_expose_official_effnet_genre_urls():
    module = load_module()

    specs = module.get_default_model_specs()

    assert specs['embedding_model_url'].endswith('/models/feature-extractors/discogs-effnet/discogs-effnet-bs64-1.pb')
    assert specs['classifier_model_url'].endswith('/models/classification-heads/genre_discogs400/genre_discogs400-discogs-effnet-1.pb')
    assert specs['metadata_url'].endswith('/models/classification-heads/genre_discogs400/genre_discogs400-discogs-effnet-1.json')



def test_pick_top_prediction_accepts_numpy_like_array_without_truthiness_checks():
    module = load_module()

    class FakeArray(list):
        @property
        def shape(self):
            return (2, 3)

        def __bool__(self):
            raise ValueError('ambiguous truth value')

    predictions = FakeArray([
        [0.05, 0.9, 0.05],
        [0.15, 0.7, 0.15],
    ])

    label, confidence = module.pick_top_prediction(predictions, ['A', 'B', 'C'])

    assert label == 'B'
    assert round(confidence, 4) == 0.8
