"""Load local music info into SQL Server."""

import argparse
import colorsys
import hashlib
import re
import os
import shlex
import time
import uuid
import json
import io
from datetime import datetime
from pathlib import Path

import paramiko
import pymssql
from mutagen import File as MutagenFile
from PIL import Image

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
    'cover_art_present', 'cover_art_mime', 'cover_color', 'cover_color_source', 'cover_color_confidence',
    'genre_essentia_label', 'genre_essentia_confidence', 'genre_essentia_matches_json',
    'genre_essentia_model', 'genre_essentia_source', 'genre_essentia_inferred_at',
    # 语种字段统一在入库阶段直接落地，后续年报、曲库分析都直接复用 ODS 结果。
    'language_norm', 'language_source', 'language_confidence', 'language_norm_version',
    'scan_status', 'scan_error', 'etl_created_at', 'etl_updated_at'
]
LANGUAGE_NORM_VERSION = 'lyric-v1'
LANGUAGE_LABEL_JA = '日语'
LANGUAGE_LABEL_ZH = '中文'
LANGUAGE_LABEL_EN = '英语'
LANGUAGE_LABEL_KO = '韩语'
LANGUAGE_LABEL_RU = '俄语'
LANGUAGE_LABEL_MULTI = '多语种'


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
        'cover_art_present': False,
        'cover_art_mime': None,
        'cover_color': None,
        'cover_color_source': None,
        'cover_color_confidence': None,
        'language_norm': None,
        'language_source': None,
        'language_confidence': None,
        'language_norm_version': LANGUAGE_NORM_VERSION,
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


def _strip_lrc_inline_tags(text):
    """去掉时间戳与常见 LRC 头部标签，避免把元数据误当成歌词正文。"""
    if not text:
        return ''
    normalized = re.sub(r'\[[0-9]{1,2}:[0-9]{2}(?:\.[0-9]{1,3})?\]', ' ', str(text))
    normalized = re.sub(r'\[(?:ti|ar|al|by|offset):[^\]]*\]', ' ', normalized, flags=re.IGNORECASE)
    return normalized


def _is_language_noise_text(text):
    """识别 `Lavf58.76.100`、`-8.13 dB` 这类假歌词噪音，避免污染语种检测。"""
    normalized = re.sub(r'\s+', '', str(text or '')).lower()
    if not normalized:
        return True
    if re.fullmatch(r'lavf\d+(?:\.\d+)*', normalized):
        return True
    if re.fullmatch(r'-?\d+(?:\.\d+)?db', normalized):
        return True
    if re.fullmatch(r'-?\d+(?:\.\d+)?', normalized):
        return True
    return False


def _is_language_metadata_line(line):
    """过滤作词作曲、翻译说明、来源站点等不会代表歌曲语种的行。"""
    normalized = str(line or '').strip().lower()
    if not normalized:
        return True
    metadata_patterns = (
        r'^(?:作词|作曲|编曲|演唱|音乐|混音|调声|词|曲)\s*[:：]',
        r'^(?:lyrics?|music|written|composed|arranged|produced|vocal|artist|album|title)\s*(?:by)?\s*[:：]',
        r'^(?:以下歌词翻译由|歌词翻译|翻译：|译：)',
        r'^(?:www\.|https?://|qq音乐|网易云|酷狗|酷我|lrc歌词网)',
    )
    return any(re.search(pattern, normalized, flags=re.IGNORECASE) for pattern in metadata_patterns)


def _clean_language_probe_text(text):
    """把歌词/标题清洗成适合做语种判断的文本，尽量保留正文、剔除翻译和噪音。"""
    normalized = _normalize_lyric_text(text)
    if not normalized:
        return None

    cleaned_lines = []
    for raw_line in normalized.split('\n'):
        line = _strip_lrc_inline_tags(raw_line).strip()
        # 优先去掉括号里的翻译或附注，减少中外双语对语种判断的干扰。
        line = re.sub(r'（[^）]{0,120}）', ' ', line)
        line = re.sub(r'\([^)]{0,120}\)', ' ', line)
        line = re.sub(r'\s+', ' ', line).strip(' -–—_/\\|:;,.')
        if not line or _is_language_noise_text(line) or _is_language_metadata_line(line):
            continue
        cleaned_lines.append(line)

    if not cleaned_lines:
        return None

    cleaned_text = '\n'.join(cleaned_lines).strip()
    if _is_language_noise_text(cleaned_text):
        return None
    return cleaned_text or None


def _build_language_script_counts(text):
    """统计不同文字脚本的字符数，为后续语种归类提供证据。"""
    counts = {
        'han': 0,
        'hiragana': 0,
        'katakana': 0,
        'hangul': 0,
        'latin': 0,
        'cyrillic': 0,
    }
    for char in str(text or ''):
        if '\u4e00' <= char <= '\u9fff':
            counts['han'] += 1
        elif '\u3040' <= char <= '\u309f':
            counts['hiragana'] += 1
        elif '\u30a0' <= char <= '\u30ff':
            counts['katakana'] += 1
        elif '\uac00' <= char <= '\ud7af':
            counts['hangul'] += 1
        elif ('a' <= char.lower() <= 'z'):
            counts['latin'] += 1
        elif '\u0400' <= char <= '\u04ff':
            counts['cyrillic'] += 1
    return counts


def _detect_language_from_text(text):
    """按脚本分布推断语种；优先识别日/韩/俄等强特征脚本，再处理中英混合。"""
    cleaned_text = _clean_language_probe_text(text)
    if not cleaned_text:
        return None

    counts = _build_language_script_counts(cleaned_text)
    japanese_count = counts['hiragana'] + counts['katakana']
    chinese_count = counts['han']
    korean_count = counts['hangul']
    english_count = counts['latin']
    russian_count = counts['cyrillic']
    total_count = japanese_count + chinese_count + korean_count + english_count + russian_count
    if total_count <= 0:
        return None

    # 日文/韩文/俄文具有强脚本特征，出现到一定数量时优先直接命中。
    if japanese_count >= 2:
        return {'language_norm': LANGUAGE_LABEL_JA, 'language_confidence': 1.0}
    if korean_count >= 2:
        return {'language_norm': LANGUAGE_LABEL_KO, 'language_confidence': 1.0}
    if russian_count >= 2:
        return {'language_norm': LANGUAGE_LABEL_RU, 'language_confidence': 1.0}

    # 处理中英混排：如果两边都不少，则记为多语种；否则取优势脚本。
    if chinese_count >= 2 and english_count >= 3:
        dominant_count = max(chinese_count, english_count)
        runner_up_count = min(chinese_count, english_count)
        if runner_up_count / dominant_count >= 0.45:
            return {'language_norm': LANGUAGE_LABEL_MULTI, 'language_confidence': round(dominant_count / total_count, 6)}
        if chinese_count > english_count:
            return {'language_norm': LANGUAGE_LABEL_ZH, 'language_confidence': round(chinese_count / total_count, 6)}
        return {'language_norm': LANGUAGE_LABEL_EN, 'language_confidence': round(english_count / total_count, 6)}

    if chinese_count >= 2:
        return {'language_norm': LANGUAGE_LABEL_ZH, 'language_confidence': 1.0}
    if english_count >= 3:
        return {'language_norm': LANGUAGE_LABEL_EN, 'language_confidence': 1.0}
    return None


def detect_language_metadata(embedded_lyric=None, title=None, artist=None):
    """按“歌词优先，标题兜底，歌手名最后兜底”生成稳定语种字段。"""
    for source_name, source_value in (
        ('lyric', embedded_lyric),
        ('title', title),
        ('artist', artist),
    ):
        detected = _detect_language_from_text(source_value)
        if not detected:
            continue
        return {
            'language_norm': detected['language_norm'],
            'language_source': source_name,
            'language_confidence': detected['language_confidence'],
            'language_norm_version': LANGUAGE_NORM_VERSION,
        }
    return {
        'language_norm': None,
        'language_source': None,
        'language_confidence': None,
        'language_norm_version': LANGUAGE_NORM_VERSION,
    }


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


def _extract_cover_art_from_raw_tags(raw_audio):
    """兼容 FLAC pictures、MP3 APIC、MP4 covr 等常见封面帧，返回图片字节和 mime。"""
    if raw_audio is None:
        return None

    pictures = getattr(raw_audio, 'pictures', None)
    if pictures:
        for picture in pictures:
            data = getattr(picture, 'data', None)
            if data:
                return {
                    'data': bytes(data),
                    'mime': getattr(picture, 'mime', None) or 'image/unknown',
                }

    tags = getattr(raw_audio, 'tags', None)
    if not tags:
        return None

    if isinstance(tags, dict):
        for key, value in tags.items():
            key_lower = str(key).lower()
            if 'apic' in key_lower:
                data = getattr(value, 'data', None)
                if data:
                    return {
                        'data': bytes(data),
                        'mime': getattr(value, 'mime', None) or 'image/unknown',
                    }
                if isinstance(value, (list, tuple)):
                    for item in value:
                        data = getattr(item, 'data', None)
                        if data:
                            return {
                                'data': bytes(data),
                                'mime': getattr(item, 'mime', None) or 'image/unknown',
                            }
            if 'covr' in key_lower:
                if isinstance(value, (list, tuple)):
                    for item in value:
                        if isinstance(item, (bytes, bytearray)):
                            return {'data': bytes(item), 'mime': 'image/unknown'}
                if isinstance(value, (bytes, bytearray)):
                    return {'data': bytes(value), 'mime': 'image/unknown'}

    values = getattr(tags, 'values', None)
    if callable(values):
        for frame in values():
            data = getattr(frame, 'data', None)
            if data:
                return {
                    'data': bytes(data),
                    'mime': getattr(frame, 'mime', None) or 'image/unknown',
                }
    return None


def _crop_cover_focus_area(rgb_image):
    """优先取封面中间主体区域，降低白边、黑边和大面积留白对主题色判断的干扰。"""
    width, height = rgb_image.size
    if width < 8 or height < 8:
        return rgb_image

    margin_x = int(width * 0.12)
    margin_y = int(height * 0.12)
    right = max(margin_x + 1, width - margin_x)
    bottom = max(margin_y + 1, height - margin_y)
    return rgb_image.crop((margin_x, margin_y, right, bottom))


def _score_cover_color_candidate(red, green, blue, pixel_ratio):
    """给候选颜色打分：保留像素占比，同时优先更像封面主题色的高饱和中心色。"""
    normalized_red = max(0.0, min(red / 255.0, 1.0))
    normalized_green = max(0.0, min(green / 255.0, 1.0))
    normalized_blue = max(0.0, min(blue / 255.0, 1.0))
    _hue, saturation, value = colorsys.rgb_to_hsv(normalized_red, normalized_green, normalized_blue)
    luminance = 0.2126 * normalized_red + 0.7152 * normalized_green + 0.0722 * normalized_blue

    is_near_white = luminance >= 0.92 and saturation <= 0.16
    is_near_black = luminance <= 0.14 and value <= 0.24 and saturation <= 0.22
    is_near_gray = saturation <= 0.10 and not is_near_white and not is_near_black

    if is_near_white:
        neutral_penalty = 0.22
    elif is_near_black:
        neutral_penalty = 0.34
    elif is_near_gray:
        neutral_penalty = 0.48
    elif saturation < 0.22:
        neutral_penalty = 0.72
    else:
        neutral_penalty = 1.0

    saturation_boost = 1.0 + saturation * 1.6
    luminance_balance_boost = 1.0 + max(0.0, 0.34 - abs(luminance - 0.56))
    score = pixel_ratio * saturation_boost * luminance_balance_boost * neutral_penalty
    return {
        'score': score,
        'saturation': saturation,
        'luminance': luminance,
        'is_neutral': is_near_white or is_near_black or is_near_gray,
    }


def _extract_cover_color_metadata(cover_art):
    """从嵌入封面图提取主色和置信度，用于 ODS 与年报封面颜色统计。"""
    if not cover_art or not cover_art.get('data'):
        return {
            'cover_art_present': False,
            'cover_art_mime': None,
            'cover_color': None,
            'cover_color_source': None,
            'cover_color_confidence': None,
        }

    try:
        image = Image.open(io.BytesIO(cover_art['data']))
        rgb_image = image.convert('RGB')
        focus_image = _crop_cover_focus_area(rgb_image)
        sample_image = focus_image.resize((48, 48), Image.LANCZOS)
        quantized = sample_image.quantize(colors=8, method=Image.Quantize.MEDIANCUT)
        palette = quantized.getpalette() or []
        colors = quantized.getcolors() or []
        if not colors:
            raise ValueError('no colors extracted from cover art')
        total_pixels = sample_image.size[0] * sample_image.size[1]
        scored_candidates = []
        for color_count, color_index in colors:
            palette_offset = color_index * 3
            if palette_offset + 2 >= len(palette):
                continue
            red, green, blue = palette[palette_offset:palette_offset + 3]
            pixel_ratio = (color_count / total_pixels) if total_pixels else 0.0
            candidate = {
                'count': color_count,
                'red': red,
                'green': green,
                'blue': blue,
                'pixel_ratio': pixel_ratio,
            }
            candidate.update(_score_cover_color_candidate(red, green, blue, pixel_ratio))
            scored_candidates.append(candidate)

        if not scored_candidates:
            raise ValueError('no scored candidates extracted from cover art')

        scored_candidates.sort(
            key=lambda item: (
                -item['score'],
                item['is_neutral'],
                -item['pixel_ratio'],
                -item['saturation'],
            )
        )
        dominant_candidate = scored_candidates[0]
        red = dominant_candidate['red']
        green = dominant_candidate['green']
        blue = dominant_candidate['blue']
        confidence = round(dominant_candidate['pixel_ratio'], 6) if total_pixels else None
        return {
            'cover_art_present': True,
            'cover_art_mime': cover_art.get('mime'),
            'cover_color': f'#{red:02X}{green:02X}{blue:02X}',
            'cover_color_source': 'embedded-art',
            'cover_color_confidence': confidence,
        }
    except Exception:
        return {
            'cover_art_present': True,
            'cover_art_mime': cover_art.get('mime'),
            'cover_color': None,
            'cover_color_source': 'embedded-art',
            'cover_color_confidence': None,
        }


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
    else:
        raw_audio = None

    if raw_audio is None:
        try:
            raw_audio = MutagenFile(file_path, easy=False)
        except Exception:
            raw_audio = None

    lyric_format = _detect_lyric_format(lyric_text)
    cover_art = _extract_cover_art_from_raw_tags(raw_audio)
    cover_color_metadata = _extract_cover_color_metadata(cover_art)
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
    result.update(cover_color_metadata)
    result.update(detect_language_metadata(
        embedded_lyric=lyric_text,
        title=result.get('title'),
        artist=result.get('artist'),
    ))
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
        cover_art_present bit not null default 0,
        cover_art_mime varchar(100) null,
        cover_color varchar(7) null,
        cover_color_source varchar(30) null,
        cover_color_confidence decimal(18,6) null,
        language_norm nvarchar(100) null,
        language_source varchar(20) null,
        language_confidence decimal(18,6) null,
        language_norm_version varchar(40) null,
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
IF COL_LENGTH('dbo.{TABLE_NAME}', 'cover_art_present') IS NULL
BEGIN
    ALTER TABLE dbo.{TABLE_NAME} ADD cover_art_present bit not null CONSTRAINT df_{TABLE_NAME}_cover_art_present DEFAULT 0
END
""")
    cursor.execute(f"""
IF COL_LENGTH('dbo.{TABLE_NAME}', 'cover_art_mime') IS NULL
BEGIN
    ALTER TABLE dbo.{TABLE_NAME} ADD cover_art_mime varchar(100) null
END
""")
    cursor.execute(f"""
IF COL_LENGTH('dbo.{TABLE_NAME}', 'cover_color') IS NULL
BEGIN
    ALTER TABLE dbo.{TABLE_NAME} ADD cover_color varchar(7) null
END
""")
    cursor.execute(f"""
IF COL_LENGTH('dbo.{TABLE_NAME}', 'cover_color_source') IS NULL
BEGIN
    ALTER TABLE dbo.{TABLE_NAME} ADD cover_color_source varchar(30) null
END
""")
    cursor.execute(f"""
IF COL_LENGTH('dbo.{TABLE_NAME}', 'cover_color_confidence') IS NULL
BEGIN
    ALTER TABLE dbo.{TABLE_NAME} ADD cover_color_confidence decimal(18,6) null
END
""")
    cursor.execute(f"""
IF COL_LENGTH('dbo.{TABLE_NAME}', 'language_norm') IS NULL
BEGIN
    ALTER TABLE dbo.{TABLE_NAME} ADD language_norm nvarchar(100) null
END
""")
    cursor.execute(f"""
IF COL_LENGTH('dbo.{TABLE_NAME}', 'language_source') IS NULL
BEGIN
    ALTER TABLE dbo.{TABLE_NAME} ADD language_source varchar(20) null
END
""")
    cursor.execute(f"""
IF COL_LENGTH('dbo.{TABLE_NAME}', 'language_confidence') IS NULL
BEGIN
    ALTER TABLE dbo.{TABLE_NAME} ADD language_confidence decimal(18,6) null
END
""")
    cursor.execute(f"""
IF COL_LENGTH('dbo.{TABLE_NAME}', 'language_norm_version') IS NULL
BEGIN
    ALTER TABLE dbo.{TABLE_NAME} ADD language_norm_version varchar(40) null
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


def fetch_language_detection_candidates(conn, limit=None, only_missing=False):
    """读取需要补语种的歌曲行；可只挑缺失语种字段的记录做增量回填。"""
    cursor = conn.cursor(as_dict=True)
    sql = f"""
SELECT
    file_path,
    title,
    artist,
    embedded_lyric,
    language_norm,
    language_source,
    language_confidence,
    language_norm_version
FROM dbo.{TABLE_NAME}
WHERE scan_status = 'SUCCESS'
"""
    params = []
    if only_missing:
        sql += """
  AND (
        language_norm IS NULL
        OR LTRIM(RTRIM(language_norm)) = ''
        OR language_norm_version IS NULL
        OR LTRIM(RTRIM(language_norm_version)) <> %s
      )
"""
        params.append(LANGUAGE_NORM_VERSION)
    sql += '\nORDER BY file_path ASC'
    if limit is not None:
        sql = f"SET ROWCOUNT {int(limit)};\n{sql}\nSET ROWCOUNT 0;"
    cursor.execute(sql, params)
    rows = cursor.fetchall()
    cursor.close()
    return rows


def apply_language_detection_results(conn, rows, now=None):
    """把按歌词/标题识别出的语种结果直接回写进 ODS。"""
    cursor = conn.cursor()
    updated = 0
    current = now or datetime.now()
    sql = f"""
UPDATE dbo.{TABLE_NAME}
SET
    language_norm = %s,
    language_source = %s,
    language_confidence = %s,
    language_norm_version = %s,
    etl_updated_at = %s
WHERE file_path = %s
"""
    for row in rows:
        cursor.execute(sql, [
            row.get('language_norm'),
            row.get('language_source'),
            row.get('language_confidence'),
            row.get('language_norm_version') or LANGUAGE_NORM_VERSION,
            current,
            row['file_path'],
        ])
        if cursor.rowcount:
            updated += 1
    conn.commit()
    cursor.close()
    return {'updated': updated}


def fetch_cover_metadata_candidates(conn, limit=None, only_missing=False):
    """读取需要补封面元数据的歌曲行；可只挑缺失封面颜色的记录做增量回填。"""
    cursor = conn.cursor(as_dict=True)
    sql = f"""
SELECT
    file_path,
    cover_art_present,
    cover_art_mime,
    cover_color,
    cover_color_source,
    cover_color_confidence
FROM dbo.{TABLE_NAME}
WHERE scan_status = 'SUCCESS'
"""
    if only_missing:
        sql += """
  AND (
        cover_color IS NULL
        OR LTRIM(RTRIM(cover_color)) = ''
        OR cover_art_present = 0
      )
"""
    sql += '\nORDER BY file_path ASC'
    if limit is not None:
        sql = f"SET ROWCOUNT {int(limit)};\n{sql}\nSET ROWCOUNT 0;"
    cursor.execute(sql)
    rows = cursor.fetchall()
    cursor.close()
    return rows


def apply_cover_metadata_results(conn, rows, now=None):
    """把封面存在性、主色和来源信息直接回写进 ODS。"""
    cursor = conn.cursor()
    updated = 0
    current = now or datetime.now()
    sql = f"""
UPDATE dbo.{TABLE_NAME}
SET
    cover_art_present = %s,
    cover_art_mime = %s,
    cover_color = %s,
    cover_color_source = %s,
    cover_color_confidence = %s,
    etl_updated_at = %s
WHERE file_path = %s
"""
    for row in rows:
        cursor.execute(sql, [
            row.get('cover_art_present'),
            row.get('cover_art_mime'),
            row.get('cover_color'),
            row.get('cover_color_source'),
            row.get('cover_color_confidence'),
            current,
            row['file_path'],
        ])
        if cursor.rowcount:
            updated += 1
    conn.commit()
    cursor.close()
    return {'updated': updated}


def backfill_cover_metadata(conn, limit=None, only_missing=False, now=None):
    """对现有 ODS 记录批量补写封面存在性与主色字段。"""
    candidate_rows = fetch_cover_metadata_candidates(conn, limit=limit, only_missing=only_missing)
    update_rows = []
    for row in candidate_rows:
        metadata = extract_audio_metadata(row['file_path'])
        update_rows.append({
            'file_path': row['file_path'],
            'cover_art_present': metadata.get('cover_art_present', False),
            'cover_art_mime': metadata.get('cover_art_mime'),
            'cover_color': metadata.get('cover_color'),
            'cover_color_source': metadata.get('cover_color_source'),
            'cover_color_confidence': metadata.get('cover_color_confidence'),
        })
    update_stats = apply_cover_metadata_results(conn, update_rows, now=now)
    return {
        'selected': len(candidate_rows),
        'updated': update_stats['updated'],
    }


def backfill_language_detection(conn, limit=None, only_missing=False, now=None):
    """对现有 ODS 记录批量补写语种字段，适合修复历史老数据。"""
    candidate_rows = fetch_language_detection_candidates(conn, limit=limit, only_missing=only_missing)
    detection_rows = []
    for row in candidate_rows:
        detected = detect_language_metadata(
            embedded_lyric=row.get('embedded_lyric'),
            title=row.get('title'),
            artist=row.get('artist'),
        )
        detection_rows.append({
            'file_path': row['file_path'],
            **detected,
        })
    update_stats = apply_language_detection_results(conn, detection_rows, now=now)
    return {
        'selected': len(candidate_rows),
        'updated': update_stats['updated'],
    }


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
