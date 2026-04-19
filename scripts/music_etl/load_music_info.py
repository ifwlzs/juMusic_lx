"""Load local music info into SQL Server."""

import hashlib
from datetime import datetime
from pathlib import Path

from mutagen import File as MutagenFile

SUPPORTED_EXTENSIONS = {'.mp3', '.flac', '.m4a', '.aac', '.wav', '.ape', '.ogg', '.opus'}


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


def extract_file_info(file_path, root_path):
    path = Path(file_path)
    stat = path.stat()
    return {
        'root_path': str(Path(root_path)),
        'file_path': str(path),
        'file_name': path.name,
        'file_ext': path.suffix.lower(),
        'file_size': stat.st_size,
        'file_mtime': datetime.fromtimestamp(stat.st_mtime),
        'file_md5': compute_md5(path),
        'is_readable': True,
    }


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
        'scan_status': status,
        'scan_error': error,
    }


def extract_audio_metadata(file_path):
    try:
        audio = MutagenFile(file_path, easy=True)
    except Exception as exc:
        return empty_audio_metadata(status='FAILED', error=str(exc))

    tags = audio or {}
    info = getattr(audio, 'info', None)
    result = empty_audio_metadata()
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
    })
    return result
