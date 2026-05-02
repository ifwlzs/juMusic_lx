"""Prepare / validate external Essentia genre inference payloads.

This script is intentionally lightweight on Windows:
- it does NOT run Essentia itself
- it normalizes a JSON payload produced by WSL / Linux / Docker
- it can be used before piping results back into load_music_info.py
"""

import argparse
import json
import math
from datetime import datetime
from pathlib import Path
from urllib.request import urlretrieve

SUPPORTED_EXTENSIONS = {'.mp3', '.flac', '.m4a', '.aac', '.wav', '.ape', '.ogg', '.opus'}

DEFAULT_EMBEDDING_MODEL_URL = 'https://essentia.upf.edu/models/feature-extractors/discogs-effnet/discogs-effnet-bs64-1.pb'
DEFAULT_CLASSIFIER_MODEL_URL = 'https://essentia.upf.edu/models/classification-heads/genre_discogs400/genre_discogs400-discogs-effnet-1.pb'
DEFAULT_METADATA_URL = 'https://essentia.upf.edu/models/classification-heads/genre_discogs400/genre_discogs400-discogs-effnet-1.json'


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root-path', default=None)
    parser.add_argument('--input-json', default=None)
    parser.add_argument('--output-json', required=True)
    parser.add_argument('--existing-json', default=None)
    parser.add_argument('--model-name', default='essentia-external')
    parser.add_argument('--source', default='wsl')
    parser.add_argument('--tasks-json', default=None)
    parser.add_argument('--embedding-model-pb', default=None)
    parser.add_argument('--classifier-model-pb', default=None)
    parser.add_argument('--metadata-json', default=None)
    parser.add_argument('--download-models-dir', default=None)
    return parser.parse_args()


def collect_audio_files(root_path):
    root = Path(root_path)
    files = []
    for path in root.rglob('*'):
        if path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS:
            files.append(path)
    return sorted(files)


def _to_posix_path(value):
    return str(value).replace('\\', '/')


def build_inference_tasks(files, existing_results=None):
    existing_results = existing_results or {}
    tasks = []
    for path in files:
        posix_path = _to_posix_path(path)
        if existing_results.get(posix_path, {}).get('genre_essentia_label'):
            continue
        tasks.append({
            'file_path': posix_path,
            'file_name': Path(path).name,
        })
    return tasks


def infer_tasks(tasks, predictor):
    predictions = []
    for item in tasks or []:
        file_path = item.get('file_path')
        if not file_path:
            continue
        result = predictor(file_path) or {}
        predictions.append({
            'file_path': file_path,
            'label': result.get('label'),
            'confidence': result.get('confidence'),
        })
    return predictions


def load_model_labels(metadata_json):
    payload = json.loads(Path(metadata_json).read_text(encoding='utf-8'))
    classes = payload.get('classes') or payload.get('labels') or payload
    result = []
    for item in classes:
        if isinstance(item, str):
            result.append(item)
        elif isinstance(item, dict):
            result.append(item.get('name') or item.get('label'))
    return [item for item in result if item]


def get_default_model_specs():
    return {
        'embedding_model_url': DEFAULT_EMBEDDING_MODEL_URL,
        'classifier_model_url': DEFAULT_CLASSIFIER_MODEL_URL,
        'metadata_url': DEFAULT_METADATA_URL,
    }


def download_default_models(target_dir):
    target = Path(target_dir)
    target.mkdir(parents=True, exist_ok=True)
    specs = get_default_model_specs()
    embedding_model_pb = target / Path(specs['embedding_model_url']).name
    classifier_model_pb = target / Path(specs['classifier_model_url']).name
    metadata_json = target / Path(specs['metadata_url']).name
    if not embedding_model_pb.exists():
        urlretrieve(specs['embedding_model_url'], embedding_model_pb)
    if not classifier_model_pb.exists():
        urlretrieve(specs['classifier_model_url'], classifier_model_pb)
    if not metadata_json.exists():
        urlretrieve(specs['metadata_url'], metadata_json)
    return {
        'embedding_model_pb': str(embedding_model_pb),
        'classifier_model_pb': str(classifier_model_pb),
        'metadata_json': str(metadata_json),
    }


def pick_top_prediction(predictions, labels):
    if labels is None or len(labels) == 0:
        return None, None
    if predictions is None:
        return None, None
    try:
        if len(predictions) == 0:
            return None, None
    except TypeError:
        return None, None
    if isinstance(predictions[0], (int, float)):
        predictions = [predictions]
    width = min(len(labels), len(predictions[0]))
    averaged = []
    for col in range(width):
        values = [float(row[col]) for row in predictions if len(row) > col]
        averaged.append(sum(values) / len(values) if values else float('-inf'))
    best_index = max(range(len(averaged)), key=lambda idx: averaged[idx])
    return labels[best_index], averaged[best_index]


def build_essentia_predictor(embedding_model_pb=None, classifier_model_pb=None, metadata_json=None):
    try:
        import essentia.standard as es  # type: ignore
    except Exception as exc:  # pragma: no cover
        raise RuntimeError(f'Essentia is not available in current environment: {exc}') from exc

    if not embedding_model_pb or not classifier_model_pb or not metadata_json:
        raise RuntimeError('embedding_model_pb, classifier_model_pb and metadata_json are required for real Essentia inference')

    labels = load_model_labels(metadata_json)
    embedding_model = es.TensorflowPredictEffnetDiscogs(
        graphFilename=embedding_model_pb,
        output='PartitionedCall:1',
    )
    classifier_model = es.TensorflowPredict2D(
        graphFilename=classifier_model_pb,
        input='serving_default_model_Placeholder',
        output='PartitionedCall:0',
    )

    def predictor(file_path):
        audio = es.MonoLoader(filename=file_path, sampleRate=16000, resampleQuality=4)()
        embeddings = embedding_model(audio)
        predictions = classifier_model(embeddings)
        label, confidence = pick_top_prediction(predictions, labels)
        if label is None:
            return {'label': None, 'confidence': None}
        return {'label': label, 'confidence': None if confidence is None else float(confidence)}

    return predictor


def normalize_payload(items, model_name='essentia-external', source='wsl', inferred_at=None):
    normalized = []
    timestamp = inferred_at or datetime.now().isoformat()
    for item in items or []:
        file_path = item.get('file_path')
        if not file_path:
            continue
        normalized.append({
            'file_path': str(file_path),
            'genre_essentia_label': item.get('genre_essentia_label') or item.get('label'),
            'genre_essentia_confidence': item.get('genre_essentia_confidence', item.get('confidence')),
            'genre_essentia_model': item.get('genre_essentia_model') or model_name,
            'genre_essentia_source': item.get('genre_essentia_source') or source,
            'genre_essentia_inferred_at': item.get('genre_essentia_inferred_at') or timestamp,
        })
    return normalized


def main_scan(root_path, output_json, existing_json=None):
    existing_results = {}
    if existing_json:
        existing_results = {
            item['file_path']: item
            for item in json.loads(Path(existing_json).read_text(encoding='utf-8'))
            if item.get('file_path')
        }
    files = collect_audio_files(root_path)
    tasks = build_inference_tasks(files, existing_results=existing_results)
    Path(output_json).write_text(json.dumps(tasks, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'tasks={len(tasks)} output={output_json}')
    return {'task_count': len(tasks), 'output_json': output_json}


def main_infer(tasks_json, output_json, predictor):
    tasks = json.loads(Path(tasks_json).read_text(encoding='utf-8'))
    predictions = infer_tasks(tasks, predictor=predictor)
    Path(output_json).write_text(json.dumps(predictions, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'predictions={len(predictions)} output={output_json}')
    return {'prediction_count': len(predictions), 'output_json': output_json}


def main_normalize(input_json, output_json, model_name='essentia-external', source='wsl'):
    items = json.loads(Path(input_json).read_text(encoding='utf-8'))
    normalized = normalize_payload(items, model_name=model_name, source=source)
    Path(output_json).write_text(json.dumps(normalized, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'normalized={len(normalized)} output={output_json}')
    return normalized


if __name__ == '__main__':
    args = parse_args()
    if args.download_models_dir:
        result = download_default_models(args.download_models_dir)
        Path(args.output_json).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
        print(f"downloaded_models={args.output_json}")
    elif args.root_path:
        main_scan(
            root_path=args.root_path,
            output_json=args.output_json,
            existing_json=args.existing_json,
        )
    elif args.tasks_json:
        predictor = build_essentia_predictor(
            embedding_model_pb=args.embedding_model_pb,
            classifier_model_pb=args.classifier_model_pb,
            metadata_json=args.metadata_json,
        )
        main_infer(
            tasks_json=args.tasks_json,
            output_json=args.output_json,
            predictor=predictor,
        )
    else:
        if not args.input_json:
            raise SystemExit('--input-json is required when --root-path is not provided and --tasks-json is not used')
        main_normalize(
            input_json=args.input_json,
            output_json=args.output_json,
            model_name=args.model_name,
            source=args.source,
        )
