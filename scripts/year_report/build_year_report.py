"""Build MVP annual report JSON from SQL dataset payloads."""

import argparse
import json
import os
import re
import sys
from collections import defaultdict
from decimal import Decimal
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlparse, unquote

try:
    import pymssql
except ImportError:  # pragma: no cover
    pymssql = None

MODULE_DIR = Path(__file__).resolve().parent
if str(MODULE_DIR) not in sys.path:
    sys.path.insert(0, str(MODULE_DIR))

from year_report_queries import build_query_plan, map_rows_to_dataset_payload  # noqa: E402


def _coerce_generated_at(value):
    if value is None:
        return datetime.now().astimezone().isoformat()
    if isinstance(value, str):
        return value
    return value.isoformat()


def make_json_safe(value):
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, dict):
        return {key: make_json_safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [make_json_safe(item) for item in value]
    if isinstance(value, tuple):
        return [make_json_safe(item) for item in value]
    return value


def _longest_streak(active_dates):
    if not active_dates:
        return 0

    ordered = sorted(datetime.fromisoformat(day).date() for day in active_dates)
    best = 1
    current = 1
    for previous, current_date in zip(ordered, ordered[1:]):
        if (current_date - previous).days == 1:
            current += 1
            best = max(best, current)
        else:
            current = 1
    return best


def _row_dicts_from_cursor(cursor):
    rows = cursor.fetchall()
    columns = [column[0] for column in (cursor.description or [])]
    return [dict(zip(columns, row)) for row in rows]


def _clean_keyword_text(value):
    if not value:
        return ''

    text = str(value)
    text = re.sub(r'\[\d{2}:\d{2}(?:\.\d{1,2})?\]', ' ', text)
    text = re.sub(r'(?i)\b(?:lyrics?|written|composed|produced|arranged|mix(?:ed)?|vocal)\s+by\b', ' ', text)
    text = text.lower()
    text = re.sub(r'[^0-9a-z\u00c0-\u024f\u3040-\u30ff\u4e00-\u9fff]+', ' ', text)
    return ' '.join(text.split())


def _truncate_snippet(text, max_length=240):
    if len(text) <= max_length:
        return text
    truncated = text[:max_length].rstrip()
    last_space = truncated.rfind(' ')
    if last_space >= max_length * 0.6:
        truncated = truncated[:last_space]
    return truncated.rstrip()


def _is_unrecognized_genre(value):
    normalized = str(value or '').strip().lower()
    return normalized in {'未识别', 'unknown', 'unk', 'other', 'others'}


def _is_metadata_heavy_keyword_line(snippet):
    if not snippet:
        return False

    metadata_tokens = {
        '作词', '作曲', '编曲', '混音', '制作人',
        'lyrics', 'lyric', 'written', 'composed', 'produced', 'arranged',
        'mix', 'mixed', 'vocal', 'album', 'music', 'by',
    }
    tokens = snippet.split()
    if not tokens:
        return False

    metadata_hit_count = sum(1 for token in tokens if token in metadata_tokens)
    if not (metadata_hit_count >= 4 or (len(tokens) >= 6 and metadata_hit_count / len(tokens) >= 0.5)):
        return False

    remaining_tokens = [token for token in tokens if token not in metadata_tokens]
    if not remaining_tokens:
        return True

    remaining_counts = defaultdict(int)
    for token in remaining_tokens:
        remaining_counts[token] += 1

    has_repeated_remaining_token = any(count >= 2 for count in remaining_counts.values())
    return not has_repeated_remaining_token


def _extract_keywords(rows):
    stopwords = {
        'a', 'an', 'and', 'are', 'for', 'from', 'in', 'is', 'of', 'on', 'or',
        'the', 'to', 'with', '歌词', '搜索',
        'you', 'your', 'yours', 'me', 'my', 'mine', 'we', 'our', 'ours',
        'i', 'im', 'i m', 'it', 'its', 'it s', 'he', 'she', 'they', 'them',
        'their', 'theirs', 'love', 'like', 'know', 'only', 'just', 'that',
        'this', 'these', 'those', 'what', 'when', 'where', 'who', 'why',
        'how', 'been', 'being', 'into', 'onto', 'than', 'then', 'there',
        'here', 'have', 'has', 'had', 'will', 'would', 'could', 'should',
        'don', 't', 're', 've', 'll', 's',
        'by', 'oh', 'ah', 'la', 'na', 'all', 'up', 'but', 'so',
        'no', 'yeah', 'can', 'now', 'down',
        'ti', 'ar', 'al',
        'written', 'composed', 'produced', 'arranged', 'mix', 'mixed', 'vocal',
        '作词', '作曲', '编曲', '混音', '制作人', 'album', 'music', 'lyrics', 'lyric',
    }
    keyword_stats = defaultdict(lambda: {
        'keyword': None,
        'hit_count': 0,
        'ranking_score': 0.0,
        'source_type': None,
        'representative_track': None,
        'representative_snippet': None,
        'representative_weight': -1.0,
    })

    for row in rows:
        snippet = _clean_keyword_text(row.get('text_value') or row.get('source_value'))
        if not snippet:
            continue
        if _is_metadata_heavy_keyword_line(snippet):
            continue

        source_type = row.get('source_type') or 'unknown'
        weight = float(row.get('weight') or 1.0)
        track = None
        if row.get('track_id'):
            track = {
                'track_id': row.get('track_id'),
                'title': row.get('title'),
                'artist': row.get('artist'),
            }

        token_counts = defaultdict(int)
        for token in snippet.split():
            if len(token) <= 1 or token in stopwords:
                continue
            token_counts[token] += 1

        for token, count in token_counts.items():
            bounded_count = min(count, 2)
            stat = keyword_stats[token]
            stat['keyword'] = token
            stat['hit_count'] += bounded_count
            stat['ranking_score'] += bounded_count * weight

            if (
                bounded_count > 0 and (
                    stat['representative_snippet'] is None
                    or bounded_count * weight > stat['representative_weight']
                    or (
                        bounded_count * weight == stat['representative_weight']
                        and (source_type == 'lyric' and stat['source_type'] != 'lyric')
                    )
                )
            ):
                stat['source_type'] = source_type
                stat['representative_track'] = track
                stat['representative_snippet'] = _truncate_snippet(snippet)
                stat['representative_weight'] = bounded_count * weight

    sorted_keywords = sorted(
        keyword_stats.values(),
        key=lambda item: (
            -item['ranking_score'],
            -item['hit_count'],
            0 if item['source_type'] == 'lyric' else 1,
            item['keyword'] or '',
        ),
    )

    return [
        {
            'keyword': item['keyword'],
            'hit_count': item['hit_count'],
            'source_type': item['source_type'],
            'representative_track': item['representative_track'],
            'representative_snippet': item['representative_snippet'],
        }
        for item in sorted_keywords[:10]
    ]



def _safe_number(value, default=0):
    if value is None:
        return default
    if isinstance(value, Decimal):
        return float(value)
    return value


def _build_p05(rows):
    if not rows:
        return {
            'explore_ratio': 0.0,
            'repeat_ratio': 0.0,
            'explore_play_count': 0,
            'repeat_play_count': 0,
            'search_play_count': 0,
            'repeat_active_days': 0,
            'top_search_track': None,
            'top_repeat_track': None,
            'summary_text': '--',
        }

    summary_by_metric = {}
    track_by_metric = {}
    for row in rows:
        metric_key = row.get('metric_key')
        row_type = row.get('row_type')
        if metric_key not in {'explore', 'repeat', 'search_top', 'repeat_top'}:
            continue
        if row_type == 'summary':
            summary_by_metric[metric_key] = row
        elif row_type == 'track':
            track_by_metric[metric_key] = row

    explore = summary_by_metric.get('explore', {})
    repeat = summary_by_metric.get('repeat', {})
    search_top = track_by_metric.get('search_top')
    repeat_top = track_by_metric.get('repeat_top')

    search_play_count = _safe_number(search_top.get('play_count') if search_top else 0)

    result = {
        'explore_ratio': _safe_number(explore.get('ratio'), 0.0),
        'repeat_ratio': _safe_number(repeat.get('ratio'), 0.0),
        'explore_play_count': _safe_number(explore.get('play_count'), 0),
        'repeat_play_count': _safe_number(repeat.get('play_count'), 0),
        'search_play_count': search_play_count,
        'repeat_active_days': _safe_number(repeat.get('active_days'), 0),
        'top_search_track': {
            'track_id': search_top.get('track_id'),
            'title': search_top.get('title'),
            'artist': search_top.get('artist'),
            'play_count': _safe_number(search_top.get('play_count'), 0),
            'active_days': _safe_number(search_top.get('active_days'), 0),
        } if search_top else None,
        'top_repeat_track': {
            'track_id': repeat_top.get('track_id'),
            'title': repeat_top.get('title'),
            'artist': repeat_top.get('artist'),
            'play_count': _safe_number(repeat_top.get('play_count'), 0),
            'active_days': _safe_number(repeat_top.get('active_days'), 0),
        } if repeat_top else None,
    }
    result['summary_text'] = (
        f"今年你有 {result['explore_play_count']} 次探索型播放，"
        f"{result['repeat_play_count']} 次循环回听，"
        f"其中搜索触发了 {result['search_play_count']} 次播放。"
    )
    return result


def _build_p09(rows):
    if not rows:
        return []

    period_groups = defaultdict(list)
    for row in rows:
        period_key = row.get('period_key')
        genre = row.get('genre')
        if period_key and genre and row.get('new_track_count') is not None:
            period_groups[period_key].append(row)

    result = []
    for period_key in sorted(period_groups):
        genre_rows = sorted(
            period_groups[period_key],
            key=lambda row: (
                -(_safe_number(row.get('new_track_count'), 0)),
                row.get('genre') or '',
            ),
        )
        top_row = genre_rows[0] if genre_rows else None
        top_count = _safe_number(top_row.get('new_track_count') if top_row else 0, 0)
        genre_items = []
        for row in genre_rows:
            count = _safe_number(row.get('new_track_count'), 0)
            genre_items.append({
                'genre': row.get('genre'),
                'new_track_count': count,
                'ratio': _safe_number(row.get('ratio'), 0.0),
            })

        top_genre = top_row.get('genre') if top_row else None
        recognized_rows = [row for row in genre_rows if not _is_unrecognized_genre(row.get('genre'))]
        recognized_top_row = recognized_rows[0] if recognized_rows else None
        if top_genre and _is_unrecognized_genre(top_genre) and recognized_top_row:
            summary_text = (
                f'{period_key} 新歌里未识别曲风较多，'
                f'已识别部分以 {recognized_top_row.get("genre")} 最突出，'
                f'共发现 {_safe_number(recognized_top_row.get("new_track_count"), 0)} 首。'
            )
        else:
            summary_text = f'{period_key} 的新歌探索重心是 {top_genre}，共发现 {top_count} 首。' if top_genre else '--'
        result.append({
            'period_key': period_key,
            'top_genre': top_genre,
            'genres': genre_items,
            'summary_text': summary_text,
        })

    return result

def _build_taste_score(rows):
    if not rows:
        return {
            'taste_score': 0.0,
            'breadth_score': 0.0,
            'depth_score': 0.0,
            'freshness_score': 0.0,
            'balance_score': 0.0,
            'summary_label': '--',
            'summary_text': '--',
        }

    total_play_count = sum((row.get('play_count') or 0) for row in rows)
    total_artist_count = sum((row.get('artist_count') or 0) for row in rows)
    distinct_genre_count = len({row.get('genre') for row in rows if row.get('genre')})
    new_genre_count = sum(1 for row in rows if row.get('is_new_genre'))
    max_play_count = max((row.get('play_count') or 0) for row in rows)

    breadth_score = min(100.0, distinct_genre_count * 25.0 + total_artist_count * 5.0)
    depth_score = min(100.0, total_play_count / max(distinct_genre_count, 1) * 2.0)
    freshness_score = min(100.0, (new_genre_count / max(distinct_genre_count, 1)) * 100.0)
    balance_score = 100.0
    if total_play_count > 0:
        balance_score = max(0.0, 100.0 - (max_play_count / total_play_count) * 50.0)

    taste_score = round((breadth_score + depth_score + freshness_score + balance_score) / 4.0, 1)

    if taste_score >= 75:
        summary_label = '广度型乐迷'
    elif taste_score >= 50:
        summary_label = '探索型乐迷'
    else:
        summary_label = '稳定型乐迷'

    summary_text = (
        f'你今年覆盖了 {distinct_genre_count} 种曲风，'
        f'听了 {total_play_count} 次，其中 {new_genre_count} 种是新鲜尝试。'
    )

    return {
        'taste_score': taste_score,
        'breadth_score': round(breadth_score, 1),
        'depth_score': round(depth_score, 1),
        'freshness_score': round(freshness_score, 1),
        'balance_score': round(balance_score, 1),
        'summary_label': summary_label,
        'summary_text': summary_text,
    }


def _build_library_structure(rows):
    duration_order = {
        'lt_2': 0,
        '2_4': 1,
        '4_6': 2,
        '6_plus': 3,
    }
    grouped = {
        'format_distribution': [],
        'language_distribution': [],
        'duration_distribution': [],
        'genre_distribution': [],
        'genre_summary_text': '--',
    }
    genre_stats = {}
    language_stats = {}
    for row in rows:
        item = {
            'bucket_key': row.get('bucket_key'),
            'bucket_label': row.get('bucket_label'),
            'item_count': _safe_number(row.get('item_count'), 0),
            'ratio': _safe_number(row.get('ratio'), 0.0),
        }
        if row.get('row_type') == 'format':
            grouped['format_distribution'].append(item)
        elif row.get('row_type') == 'language':
            raw_label = str(item.get('bucket_label') or '').strip() or '未知'
            stat = language_stats.setdefault(raw_label, {
                'bucket_key': item.get('bucket_key') or raw_label,
                'bucket_label': raw_label,
                'item_count': 0,
                'ratio': 0.0,
            })
            stat['item_count'] += item['item_count']
            stat['ratio'] += item['ratio']
        elif row.get('row_type') == 'duration':
            grouped['duration_distribution'].append(item)
        elif row.get('row_type') == 'genre':
            raw_label = str(item.get('bucket_label') or '').strip()
            normalized_key = raw_label
            normalized_label = raw_label
            lowered = raw_label.lower()
            if lowered in {'other', 'miscellaneous', 'unknown', 'unk', '未识别'}:
                normalized_key = '未识别'
                normalized_label = '未识别'
            elif lowered == 'jpop':
                normalized_key = 'J-Pop'
                normalized_label = 'J-Pop'

            stat = genre_stats.setdefault(normalized_key, {
                'bucket_key': normalized_key,
                'bucket_label': normalized_label,
                'item_count': 0,
                'ratio': 0.0,
            })
            stat['item_count'] += item['item_count']
            stat['ratio'] += item['ratio']

    for stat in genre_stats.values():
        stat['ratio'] = round(_safe_number(stat.get('ratio'), 0.0), 4)

    for stat in language_stats.values():
        stat['ratio'] = round(_safe_number(stat.get('ratio'), 0.0), 4)

    grouped['language_distribution'] = sorted(
        language_stats.values(),
        key=lambda item: (-(item.get('item_count') or 0), str(item.get('bucket_label') or '')),
    )

    grouped['duration_distribution'] = sorted(
        grouped['duration_distribution'],
        key=lambda item: (
            duration_order.get(str(item.get('bucket_key') or ''), 99),
            str(item.get('bucket_label') or ''),
        ),
    )

    grouped['genre_distribution'] = sorted(
        genre_stats.values(),
        key=lambda item: (
            1 if str(item.get('bucket_label') or '') == '未识别' else 0,
            -(item.get('item_count') or 0),
            str(item.get('bucket_label') or ''),
        ),
    )

    top_genre = grouped['genre_distribution'][0] if grouped['genre_distribution'] else None
    unknown_genre = next((item for item in grouped['genre_distribution'] if item.get('bucket_label') == '未识别'), None)
    if unknown_genre and top_genre and top_genre.get('bucket_label') != '未识别':
        grouped['genre_summary_text'] = (
            f'曲库里未识别曲风较多，已识别部分以 {top_genre.get("bucket_label")} 最多，'
            f'共 {top_genre.get("item_count", 0)} 首。'
        )
    elif top_genre:
        grouped['genre_summary_text'] = (
            f'曲库中占比最高的曲风是 {top_genre.get("bucket_label")}，'
            f'共 {top_genre.get("item_count", 0)} 首。'
        )
    return grouped


def _append_coverage_warning(summary_text, field_name, ratio, threshold=0.6):
    if ratio is None:
        return summary_text
    if _safe_number(ratio, 0.0) >= threshold:
        return summary_text
    if not summary_text:
        return f'目前部分歌曲的{field_name}信息仍在补全中，以下结果基于已识别部分统计。'
    return f'{summary_text} 目前部分歌曲的{field_name}信息仍在补全中，以下结果基于已识别部分统计。'


INVALID_ALBUM_LABELS = {'', 'unknown', '未知', '未识别', 'other', 'others'}
SINGLE_ALBUM_LABELS = {'single', '单曲', '未收录专辑', '散曲'}
ARTIST_ALIAS_MAP = {
    '洛天依office': '洛天依',
    '洛天依 official': '洛天依',
    '洛天依official': '洛天依',
    'hatsunemiku': '初音未来',
    'hatsune miku': '初音未来',
    '初音ミク': '初音未来',
    '初音未来v4c': '初音未来',
}
NON_PRIMARY_ARTISTS = {'合唱', '多歌手', 'various artists', '未知歌手', 'unknown'}


def _is_rankable_album(album_name):
    normalized = str(album_name or '').strip().lower()
    if normalized in INVALID_ALBUM_LABELS:
        return False
    if normalized in SINGLE_ALBUM_LABELS:
        return False
    return True


def _album_sort_key(row):
    return (
        -_safe_number(row.get('play_count'), 0),
        -_safe_number(row.get('active_days'), 0),
        -_safe_number(row.get('listened_sec'), 0),
        str(row.get('album') or ''),
    )


def _song_score(row):
    play_count = _safe_number(row.get('play_count') or row.get('year_play_count'), 0)
    active_days = _safe_number(row.get('active_days') or row.get('year_active_days'), 0)
    listened_sec = _safe_number(row.get('listened_sec') or row.get('year_listened_sec'), 0)
    listened_hours = listened_sec / 3600 if listened_sec else 0
    return round(play_count * 0.55 + active_days * 0.30 + listened_hours * 0.15, 4)


def _repeat_index(row):
    play_count = _safe_number(row.get('play_count'), 0)
    active_days = _safe_number(row.get('active_days'), 0)
    return round(play_count / max(active_days, 1), 4)


def _normalize_artist_name(name):
    raw = str(name or '').strip()
    if not raw:
        return '未知歌手'
    alias_key = raw.lower().strip()
    alias_key = re.sub(r'\s+', ' ', alias_key)
    return ARTIST_ALIAS_MAP.get(alias_key, raw)


def _is_primary_artist(name):
    normalized = _normalize_artist_name(name)
    return normalized.lower() not in NON_PRIMARY_ARTISTS


def _build_l01_library_summary(year, overview):
    overview = overview or {}
    metrics = {
        'track_total': _safe_number(overview.get('track_count'), 0),
        'artist_total': _safe_number(overview.get('artist_count'), 0),
        'album_total': _safe_number(overview.get('album_count'), 0),
        'duration_total_sec': _safe_number(overview.get('total_duration_sec'), 0),
        'new_track_total': _safe_number(overview.get('new_track_count'), 0),
        'new_artist_total': _safe_number(overview.get('new_artist_count'), 0),
        'new_album_total': _safe_number(overview.get('new_album_count'), 0),
    }
    coverage = {
        'lyrics_coverage_ratio': _safe_number(overview.get('lyrics_coverage_ratio'), 0.0),
        'cover_coverage_ratio': _safe_number(overview.get('cover_coverage_ratio'), 0.0),
        'genre_coverage_ratio': _safe_number(overview.get('genre_coverage_ratio'), 0.0),
        'album_coverage_ratio': _safe_number(overview.get('album_coverage_ratio'), 0.0),
        'duration_coverage_ratio': _safe_number(overview.get('duration_coverage_ratio'), 0.0),
        'artist_coverage_ratio': _safe_number(overview.get('artist_coverage_ratio'), 0.0),
    }

    duration_hours = round(metrics['duration_total_sec'] / 3600, 1) if metrics['duration_total_sec'] else 0
    summary_text = (
        f'到 {year} 年底，你的歌曲库已收录 {metrics["track_total"]} 首歌，'
        f'覆盖 {metrics["artist_total"]} 位歌手与 {metrics["album_total"]} 张专辑，'
        f'总时长约 {duration_hours} 小时。今年你又新加入了 {metrics["new_track_total"]} 首歌。'
    )
    summary_text = _append_coverage_warning(summary_text, '专辑', coverage['album_coverage_ratio'])
    return {
        'page_id': 'L01',
        'title': '歌曲库总览',
        'summary_text': summary_text,
        'metrics': metrics,
        'coverage': coverage,
    }


def _build_l02_library_growth(year, rows):
    rows = rows or []
    summary_row = next((row for row in rows if row.get('row_type') == 'summary'), None)
    month_rows = [row for row in rows if row.get('row_type') == 'month']

    monthly_new_tracks = [
        {
            'month': row.get('period_key'),
            'track_count': _safe_number(row.get('track_count'), 0),
            'artist_count': _safe_number(row.get('artist_count'), 0),
            'album_count': _safe_number(row.get('album_count'), 0),
        }
        for row in sorted(month_rows, key=lambda item: item.get('period_key') or '')
    ]
    peak_row = max(month_rows, key=lambda row: (_safe_number(row.get('track_count'), 0), row.get('period_key') or ''), default=None)

    def _top_items(row_type):
        return [
            {
                'label': row.get('bucket_label'),
                'item_count': _safe_number(row.get('item_count'), 0),
                'ratio': _safe_number(row.get('ratio'), 0.0),
            }
            for row in rows
            if row.get('row_type') == row_type
        ]

    new_track_total = sum(item['track_count'] for item in monthly_new_tracks)
    new_artist_total = _safe_number((summary_row or {}).get('artist_count'), None)
    new_album_total = _safe_number((summary_row or {}).get('album_count'), None)
    if new_artist_total is None:
        new_artist_total = max((item['artist_count'] for item in monthly_new_tracks), default=0)
    if new_album_total is None:
        new_album_total = max((item['album_count'] for item in monthly_new_tracks), default=0)

    top_genre = next(iter(sorted(_top_items('genre'), key=lambda item: (-item['item_count'], item['label'] or ''))), None)
    recognized_top_genre = next(
        iter(sorted(
            [item for item in _top_items('genre') if not _is_unrecognized_genre(item.get('label'))],
            key=lambda item: (-item['item_count'], item['label'] or '')
        )),
        None,
    )
    summary_text = (
        f'{year} 年你共新增了 {new_track_total} 首歌曲、{new_artist_total} 位歌手和 {new_album_total} 张专辑。'
        f'其中 {(peak_row.get("period_key") if peak_row else "--")} 是扩库最活跃的月份，'
        f'当月新增了 {_safe_number(peak_row.get("track_count"), 0) if peak_row else 0} 首。'
    )
    if top_genre and _is_unrecognized_genre(top_genre.get('label')) and recognized_top_genre and recognized_top_genre.get('label'):
        summary_text += f' 新增内容里未识别曲风较多，已识别部分以 {recognized_top_genre["label"]} 最突出。'
    elif top_genre and top_genre.get('label'):
        summary_text += f' 从新增内容来看，今年你扩得最多的是 {top_genre["label"]}。'

    return {
        'page_id': 'L02',
        'title': '年度新增分析',
        'summary_text': summary_text,
        'new_track_total': new_track_total,
        'new_artist_total': new_artist_total,
        'new_album_total': new_album_total,
        'peak_new_month': peak_row.get('period_key') if peak_row else None,
        'peak_new_month_track_total': _safe_number(peak_row.get('track_count'), 0) if peak_row else 0,
        'monthly_new_tracks': monthly_new_tracks,
        'top_artists': _top_items('artist'),
        'top_albums': _top_items('album'),
        'top_languages': _top_items('language'),
        'top_genres': _top_items('genre'),
    }


def _build_l03_library_profile(structure):
    structure = structure or {}
    language_distribution = structure.get('language_distribution') or []
    duration_distribution = structure.get('duration_distribution') or []
    genre_distribution = structure.get('genre_distribution') or []

    top_language = language_distribution[0] if language_distribution else None
    top_vocal_language = next(
        (item for item in language_distribution if item.get('bucket_label') not in {'纯音乐', '未知语种'}),
        None,
    )
    top_duration = max(duration_distribution, key=lambda item: (_safe_number(item.get('item_count'), 0), item.get('bucket_label') or ''), default=None)
    top_recognized_genre = next((item for item in genre_distribution if item.get('bucket_label') != '未识别'), None)

    if top_recognized_genre:
        if top_language and top_language.get('bucket_label') == '纯音乐' and top_vocal_language:
            summary_text = (
                f'你的歌曲库以 纯音乐 为主，带人声的部分里 {top_vocal_language.get("bucket_label")} 最多，'
                f'时长主要集中在 {top_duration.get("bucket_label") if top_duration else "未知区间"}，'
                f'已识别曲风里 {top_recognized_genre.get("bucket_label")} 最突出。'
            )
        else:
            summary_text = (
                f'你的歌曲库以 {top_language.get("bucket_label") if top_language else "未知语种"} 歌曲为主，'
                f'时长主要集中在 {top_duration.get("bucket_label") if top_duration else "未知区间"}，'
                f'已识别曲风里 {top_recognized_genre.get("bucket_label")} 最突出。'
            )
    else:
        summary_text = '目前歌曲库的语种与曲风信息仍在逐步补全，以下画像基于已识别部分生成。'

    return {
        'page_id': 'L03',
        'title': '歌曲库结构分析',
        'summary_text': summary_text,
        'language_distribution': language_distribution,
        'duration_distribution': duration_distribution,
        'genre_distribution': genre_distribution,
    }


def _build_p08(top_genres):
    top_genres = list(top_genres or [])
    data_coverage = 1.0 if top_genres else 0.0
    if not top_genres:
        return {
            'top_genres': [],
            'data_coverage': 0.0,
            'summary_text': '--',
        }

    sorted_genres = sorted(
        top_genres,
        key=lambda item: (
            1 if _is_unrecognized_genre(item.get('genre')) else 0,
            -_safe_number(item.get('play_count'), 0),
            str(item.get('genre') or ''),
        ),
    )
    top_genre = sorted_genres[0]
    summary_text = f'这一年你最常听的曲风是 {top_genre.get("genre")}，共播放 {_safe_number(top_genre.get("play_count"), 0)} 次。'
    return {
        'top_genres': sorted_genres,
        'data_coverage': data_coverage,
        'summary_text': summary_text,
    }


def _build_p16_summary(page):
    if not page:
        return None
    top_track = page.get('top_track') or {}
    page['summary_text'] = (
        f'这一年陪伴你最多的是 {page.get("artist") or "--"}。'
        f'你共播放了 TA 的作品 {_safe_number(page.get("play_count"), 0)} 次，'
        f'其中最常听的是《{top_track.get("title") or "--"}》。'
    )
    return page


def _build_p23_summary(page):
    if not page:
        return None
    page['summary_text'] = (
        f'这一年最常陪着你的是《{page.get("album") or "--"}》。'
        f'你一共播放了这张专辑 {_safe_number(page.get("play_count"), 0)} 次，'
        f'在 {_safe_number(page.get("active_days"), 0)} 天里都听过它。'
    )
    return page


def _build_p24_summary(rows):
    rows = list(rows or [])
    if not rows:
        return rows
    top_albums_text = '、'.join(f'《{item.get("album") or "--"}》' for item in rows[:3])
    summary_text = f'这一年你最常回去听的专辑主要集中在 {top_albums_text}。'
    rows[0]['summary_text'] = summary_text
    return rows


def _build_p25_summary(page):
    if not page:
        return None
    page['summary_text'] = (
        f'{page.get("title") or "--"} 是这一年最能代表你的一首歌。'
        f'你共播放了它 {_safe_number(page.get("year_play_count"), 0)} 次，'
        f'在 {_safe_number(page.get("year_active_days"), 0)} 天里都听过它。'
    )
    return page


def _build_p31_summary(rows, overview=None):
    rows = list(rows or [])
    overview = overview or {}
    lyrics_ratio = _safe_number(overview.get("lyrics_coverage_ratio"), 0.0)
    cover_ratio = _safe_number(overview.get("cover_coverage_ratio"), 0.0)
    genre_ratio = _safe_number(overview.get("genre_coverage_ratio"), 0.0)
    coverage_text = (
        f'歌词覆盖率 {round(lyrics_ratio * 100)}%，'
        f'封面覆盖率 {round(cover_ratio * 100)}%，'
        f'曲风覆盖率 {round(genre_ratio * 100)}%。'
    )
    weak_coverage = max(lyrics_ratio, cover_ratio, genre_ratio) < 0.2
    if rows and not weak_coverage:
        top_credit = rows[0]
        summary_text = f'已识别词曲人里，{top_credit.get("credit_name") or "--"} 最突出。当前元数据覆盖率方面：{coverage_text}'
    elif rows:
        summary_text = f'当前词曲人与相关元数据覆盖率不足，暂不强调年度代表人物。当前元数据覆盖率方面：{coverage_text}'
    else:
        summary_text = f'当前元数据覆盖率方面：{coverage_text}'
    return {
        'items': rows,
        'summary_text': summary_text,
    }


def collect_dataset_payloads(cursor, year):
    plan = build_query_plan(year)
    payloads = {}
    for dataset_name, item in plan.items():
        cursor.execute(item['sql'], item['params'])
        rows = _row_dicts_from_cursor(cursor)
        payloads[dataset_name] = map_rows_to_dataset_payload(dataset_name, rows)
    return payloads


def build_report_from_dataset_payloads(year, dataset_payloads, generated_at=None):
    p01 = dataset_payloads.get('data_p01_summary')
    p02 = dataset_payloads.get('data_p02_overview')
    p03 = dataset_payloads.get('data_p03_explore')
    p04 = dataset_payloads.get('data_lib_overview')
    p05_rows = dataset_payloads.get('data_p05_explore_repeat') or []
    p06_rows = dataset_payloads.get('data_p06_keyword_source_rows') or []
    p07_rows = dataset_payloads.get('data_lib_structure') or []
    p08 = dataset_payloads.get('data_p08_genres') or []
    p09_rows = dataset_payloads.get('data_p09_genre_evolution') or []
    p10_rows = dataset_payloads.get('data_p10_taste_inputs') or []
    p12 = dataset_payloads.get('data_p12_spring')
    p13 = dataset_payloads.get('data_p13_summer')
    p14 = dataset_payloads.get('data_p14_autumn')
    p15 = dataset_payloads.get('data_p15_winter')
    p16_rows = dataset_payloads.get('data_p16_artist_of_year') or []
    p17_rows = dataset_payloads.get('data_p17_weekly_pattern') or []
    p18_rows = dataset_payloads.get('data_p18_calendar') or []
    p19_rows = dataset_payloads.get('data_p19_time_bucket') or []
    p20_row = dataset_payloads.get('data_p20_night')
    p22_rows = dataset_payloads.get('data_p22_repeat_tracks') or []
    p23 = dataset_payloads.get('data_p23_album_of_year')
    p24_rows = dataset_payloads.get('data_p24_top_albums') or []
    p25 = dataset_payloads.get('data_p25_song_of_year')
    p26_rows = dataset_payloads.get('data_p26_top_tracks') or []
    p27_rows = dataset_payloads.get('data_p27_top_artists') or []
    p28_rows = dataset_payloads.get('data_p28_artist_journey') or []
    p29_rows = dataset_payloads.get('data_p29_artist_rank_detail') or []
    p30_rows = dataset_payloads.get('data_p30_yearly_artist_rank') or []
    p31_rows = dataset_payloads.get('data_p31_credits') or []
    l02_rows = dataset_payloads.get('data_l02_library_growth') or []

    p05 = _build_p05(p05_rows)
    p06 = _extract_keywords(p06_rows)
    p07 = _build_library_structure(p07_rows)
    p08 = _build_p08(p08)
    p09 = _build_p09(p09_rows)
    p10 = _build_taste_score(p10_rows)
    l01 = _build_l01_library_summary(year, p04)
    l02 = _build_l02_library_growth(year, l02_rows)
    l03 = _build_l03_library_profile(p07)

    active_dates = [row['date'] for row in p18_rows if row.get('is_active')]
    p18 = {
        'active_day_count': len(active_dates),
        'longest_streak_days': _longest_streak(active_dates),
        'calendar_heatmap': list(p18_rows),
    }

    p20 = None
    if p20_row:
        p20 = {
            'night_session_count': p20_row.get('night_session_count', 0),
            'latest_night_date': p20_row.get('latest_night_date'),
            'latest_night_time': p20_row.get('latest_night_time'),
            'latest_night_track': {
                'track_id': p20_row.get('track_id'),
                'title': p20_row.get('title'),
                'artist': p20_row.get('artist_raw'),
            } if p20_row.get('track_id') else None,
            'latest_night_sort_minute': p20_row.get('night_sort_minute'),
        }

    normalized_p16_rows = [{**row, 'artist': _normalize_artist_name(row.get('artist'))} for row in p16_rows]
    p16_summary_candidates = [
        row for row in normalized_p16_rows
        if row.get('row_type') == 'summary' and _is_primary_artist(row.get('artist'))
    ]
    p16_summary_row = max(
        p16_summary_candidates,
        key=lambda row: (
            _safe_number(row.get('play_count'), 0),
            _safe_number(row.get('listened_sec'), 0),
            row.get('artist') or '',
        ),
        default=None,
    )
    p16_month_rows = [row for row in normalized_p16_rows if row.get('row_type') == 'month' and row.get('artist') == (p16_summary_row or {}).get('artist')]
    p16_track_row = next((row for row in normalized_p16_rows if row.get('row_type') == 'track' and row.get('artist') == (p16_summary_row or {}).get('artist')), None)
    p16 = None
    if p16_summary_row:
        p16 = {
            'artist': p16_summary_row.get('artist'),
            'play_count': p16_summary_row.get('play_count', 0),
            'listened_sec': p16_summary_row.get('listened_sec', 0),
            'active_months': p16_summary_row.get('active_months', 0),
            'monthly_distribution': [
                {
                    'month_no': row.get('month_no'),
                    'month_play_count': row.get('month_play_count', 0),
                }
                for row in sorted(p16_month_rows, key=lambda row: row.get('month_no') or 0)
            ],
            'top_track': {
                'track_id': p16_track_row.get('track_id'),
                'title': p16_track_row.get('title'),
                'play_count': p16_track_row.get('track_play_count', 0),
            } if p16_track_row else None,
        }
    p16 = _build_p16_summary(p16)

    p17_weekday_rows = [row for row in p17_rows if row.get('row_type') == 'weekday']
    p17_bucket_rows = [row for row in p17_rows if row.get('row_type') == 'bucket']
    p17_top_weekday = max(
        p17_weekday_rows,
        key=lambda row: ((row.get('play_count') or 0), (row.get('weekday_num') or 0)),
        default=None,
    )
    p17_least_weekday = min(
        p17_weekday_rows,
        key=lambda row: ((row.get('play_count') or 0), (row.get('weekday_num') or 0)),
        default=None,
    )
    p17_top_bucket = max(
        p17_bucket_rows,
        key=lambda row: ((row.get('bucket_play_count') or 0), row.get('time_bucket') or ''),
        default=None,
    )
    p17 = None
    if p17_rows:
        p17 = {
            'most_active_weekday': p17_top_weekday,
            'least_active_weekday': p17_least_weekday,
            'top_time_bucket': p17_top_bucket.get('time_bucket') if p17_top_bucket else None,
            'weekday_distribution': list(sorted(p17_weekday_rows, key=lambda row: row.get('weekday_num') or 0)),
        }

    normalized_p28_rows = [{**row, 'artist': _normalize_artist_name(row.get('artist'))} for row in p28_rows]
    p28_summary_row = next((row for row in normalized_p28_rows if row.get('row_type') == 'summary' and row.get('artist') == (p16_summary_row or {}).get('artist')), None)
    p28_first_track_row = next((row for row in normalized_p28_rows if row.get('row_type') == 'first_track' and row.get('artist') == (p16_summary_row or {}).get('artist')), None)
    p28_peak_day_row = next((row for row in normalized_p28_rows if row.get('row_type') == 'peak_day' and row.get('artist') == (p16_summary_row or {}).get('artist')), None)
    p28 = None
    if p28_summary_row:
        p28 = {
            'artist': p28_summary_row.get('artist'),
            'first_played_at': p28_summary_row.get('first_played_at'),
            'days_since_first_play': p28_summary_row.get('days_since_first_play'),
            'first_track': {
                'track_id': p28_first_track_row.get('track_id'),
                'title': p28_first_track_row.get('title'),
            } if p28_first_track_row else None,
            'peak_day': {
                'date': p28_peak_day_row.get('peak_date'),
                'play_count': p28_peak_day_row.get('peak_play_count'),
            } if p28_peak_day_row else None,
        }

    p19_bucket_rows = [row for row in p19_rows if row.get('row_type') == 'bucket']
    p19_hour_rows = [row for row in p19_rows if row.get('row_type') == 'hour']
    p19_track_rows = [row for row in p19_rows if row.get('row_type') == 'track']

    top_bucket_row = max(
        p19_bucket_rows,
        key=lambda row: ((row.get('play_count') or 0), row.get('time_bucket') or ''),
        default=None,
    )
    top_hour_row = max(
        p19_hour_rows,
        key=lambda row: ((row.get('play_count') or 0), -(row.get('play_hour') or 0)),
        default=None,
    )
    representative_track_row = None
    if top_bucket_row:
        representative_track_row = next(
            (row for row in p19_track_rows if row.get('time_bucket') == top_bucket_row.get('time_bucket')),
            None,
        )

    p19 = None
    if p19_rows:
        top_hour = top_hour_row.get('play_hour') if top_hour_row else None
        p19 = {
            'top_time_bucket': top_bucket_row.get('time_bucket') if top_bucket_row else None,
            'top_hour_range': f'{top_hour:02d}:00-{top_hour:02d}:59' if top_hour is not None else None,
            'time_bucket_distribution': [
                {
                    'time_bucket': row.get('time_bucket'),
                    'play_count': row.get('play_count', 0),
                }
                for row in sorted(
                    p19_bucket_rows,
                    key=lambda row: ((row.get('play_count') or 0), row.get('time_bucket') or ''),
                    reverse=True,
                )
            ],
            'representative_track': {
                'track_id': representative_track_row.get('track_id'),
                'title': representative_track_row.get('title'),
                'artist': representative_track_row.get('artist_raw'),
                'play_count': representative_track_row.get('play_count', 0),
                'time_bucket': representative_track_row.get('time_bucket'),
            } if representative_track_row else None,
        }

    normalized_p27_rows = [{**row, 'artist': _normalize_artist_name(row.get('artist'))} for row in p27_rows]
    p27_artist_rows = [
        row for row in normalized_p27_rows
        if row.get('row_type') == 'artist' and _is_primary_artist(row.get('artist'))
    ]
    p27_artist_rows = sorted(
        p27_artist_rows,
        key=lambda row: (
            -_safe_number(row.get('play_count'), 0),
            -_safe_number(row.get('listened_sec'), 0),
            row.get('artist') or '',
        ),
    )
    p27_track_rows = [row for row in normalized_p27_rows if row.get('row_type') == 'track']
    p27 = []
    for artist_row in p27_artist_rows:
        artist_name = artist_row.get('artist')
        top_track = next((row for row in p27_track_rows if row.get('artist') == artist_name), None)
        p27.append({
            'artist': artist_name,
            'play_count': artist_row.get('play_count', 0),
            'listened_sec': artist_row.get('listened_sec', 0),
            'top_track': {
                'track_id': top_track.get('track_id'),
                'title': top_track.get('title'),
                'play_count': top_track.get('track_play_count', 0),
            } if top_track else None,
        })

    normalized_p29_rows = [{**row, 'artist': _normalize_artist_name(row.get('artist'))} for row in p29_rows]
    p29_artist_rows = [
        row for row in normalized_p29_rows
        if row.get('row_type') == 'artist' and _is_primary_artist(row.get('artist'))
    ]
    p29_artist_rows = sorted(
        p29_artist_rows,
        key=lambda row: (
            -_safe_number(row.get('play_count'), 0),
            -_safe_number(row.get('listened_sec'), 0),
            row.get('artist') or '',
        ),
    )
    p29_track_rows = [row for row in normalized_p29_rows if row.get('row_type') == 'track']
    p29 = []
    for index, artist_row in enumerate(p29_artist_rows, start=1):
        artist_rank = index
        top_track = next((row for row in p29_track_rows if row.get('artist') == artist_row.get('artist')), None)
        p29.append({
            'artist_rank': artist_rank,
            'artist': artist_row.get('artist'),
            'play_count': artist_row.get('play_count', 0),
            'listened_sec': artist_row.get('listened_sec', 0),
            'top_track': {
                'track_id': top_track.get('track_id'),
                'title': top_track.get('title'),
                'play_count': top_track.get('track_play_count', 0),
            } if top_track else None,
        })

    p22 = sorted(
        [
            {
                **row,
                'repeat_index': _repeat_index(row),
            }
            for row in p22_rows
        ],
        key=lambda row: (
            -_safe_number(row.get('repeat_index'), 0),
            -_safe_number(row.get('play_count'), 0),
            -_safe_number(row.get('active_days'), 0),
            str(row.get('title') or ''),
        ),
    )

    rankable_p24_rows = [row for row in p24_rows if _is_rankable_album(row.get('album'))]
    p24 = sorted(rankable_p24_rows, key=_album_sort_key)
    if p24:
        p23 = p24[0]
    elif not _is_rankable_album((p23 or {}).get('album')):
        p23 = None
    p23 = _build_p23_summary(p23)
    p24 = _build_p24_summary(p24)

    p26 = sorted(
        [
            {
                **row,
                'song_score': _song_score(row),
            }
            for row in p26_rows
        ],
        key=lambda row: (
            -_safe_number(row.get('song_score'), 0),
            -_safe_number(row.get('play_count'), 0),
            -_safe_number(row.get('active_days'), 0),
            -_safe_number(row.get('listened_sec'), 0),
            str(row.get('title') or ''),
        ),
    )

    if p25 is None and p26:
        top_song = p26[0]
        p25 = {
            'track_id': top_song.get('track_id'),
            'title': top_song.get('title'),
            'artist': top_song.get('artist'),
            'album': top_song.get('album'),
            'first_played_at': top_song.get('first_played_at'),
            'year_play_count': top_song.get('play_count'),
            'year_listened_sec': top_song.get('listened_sec'),
            'year_active_days': top_song.get('active_days'),
            'song_score': top_song.get('song_score'),
        }
    p25 = _build_p25_summary(p25)

    normalized_p30_rows = [
        {**row, 'artist': _normalize_artist_name(row.get('artist'))}
        for row in p30_rows
        if _is_primary_artist(row.get('artist'))
    ]
    p30 = list(sorted(
        normalized_p30_rows,
        key=lambda row: ((row.get('play_year') or 0), (row.get('artist_rank') or 0))
    ))

    p31_items = list(sorted(
        p31_rows,
        key=lambda row: (row.get('credit_type') or '', -(row.get('play_count') or 0), -(row.get('listened_sec') or 0))
    ))
    p31 = _build_p31_summary(p31_items, p04)

    pages = {
        'P01': p01,
        'P02': p02,
        'P03': p03,
        'P04': p04,
        'P05': p05,
        'P06': p06,
        'P07': p07,
        'P08': p08,
        'P09': p09,
        'P10': p10,
        'P12': p12,
        'P13': p13,
        'P14': p14,
        'P15': p15,
        'P16': p16,
        'P17': p17,
        'P18': p18,
        'P19': p19,
        'P20': p20,
        'P22': p22,
        'P23': p23,
        'P24': p24,
        'P25': p25,
        'P26': p26,
        'P27': p27,
        'P28': p28,
        'P29': p29,
        'P30': p30,
        'P31': p31,
        'L01': l01,
        'L02': l02,
        'L03': l03,
    }

    pages['P32'] = {
        'artist_of_year': p16,
        'album_of_year': p23,
        'artist_journey': p28,
        'most_active_weekday': p17['most_active_weekday'] if p17 else None,
        'song_of_year': p25,
        'top_credit': (p31.get('items') or [None])[0] if p31 else None,
        'latest_night_track': p20['latest_night_track'] if p20 else None,
        'year_play_count': p02.get('year_play_count') if p02 else None,
        'year_listened_sec': p02.get('year_listened_sec') if p02 else None,
        'active_day_count': p18['active_day_count'],
        'days_since_first_play': p01.get('days_since_first_play') if p01 else None,
        'top_time_bucket': p19.get('top_time_bucket') if p19 else None,
    }

    return {
        'year': year,
        'generated_at': _coerce_generated_at(generated_at),
        'timezone': 'Asia/Shanghai',
        'pages': pages,
    }


# ==================== 年报骨架页最小聚合实现（兼容 direct-input 单测） ====================

CONFIRMED_PAGE_SEQUENCE = [
    'P20',
    'P21',
    'P22',
    'P23',
    'P24',
    'P26',
    'P27',
    'P28',
    'P29',
    'P30',
    'P31',
    'L01',
    # L04 已拆成连续两页，确认页顺序里不再保留旧页号。
    'L04A',
    'L04B',
    'L02',
    'L03',
    'P32',
]


# 统一维护最小标题映射，避免测试与后续页面注册各写一份常量。
PAGE_TITLES = {
    'P20': '深夜听歌',
    'P21': '历年最晚记录',
    'P22': '反复聆听',
    'P23': '年度之最专辑',
    'P24': '年度最爱专辑榜',
    'P26': '年度歌曲榜单',
    'P27': '年度歌手页',
    'P28': '与年度歌手的轨迹',
    'P29': '年度最爱歌手榜单',
    'P30': '历年歌手榜',
    'P31': '元数据完成度与封面颜色',
    'L01': '歌曲库总览',
    'L04A': '歌曲库歌手榜',
    'L04B': '年度新增歌手榜',
    'L02': '年度新增分析',
    'L03': '歌曲库结构分析',
    'P32': '年度总结四格',
}


# 先给覆盖率字段留出稳定键名，后续可直接在这些键上回填真实统计值。
EMPTY_COVERAGE = {
    'lyrics_ratio': 0.0,
    'cover_ratio': 0.0,
    'genre_ratio': 0.0,
    'album_ratio': 0.0,
    'artist_ratio': 0.0,
    'duration_ratio': 0.0,
    'credit_ratio': 0.0,
}


# L01 作为歌曲库章节首页，需要固定一组最小指标键，便于后续逐步补数。
EMPTY_LIBRARY_METRICS = {
    'track_total': 0,
    'artist_total': 0,
    'album_total': 0,
    'duration_total_sec': 0,
    'new_track_total': 0,
    'new_artist_total': 0,
    'new_album_total': 0,
}


# 统一维护空颜色统计结构，后续可在同一键名上继续扩展代表封面与颜色别名。
EMPTY_COLOR_SUMMARY = {
    'counted_track_total': 0,
    'excluded_track_total': 0,
    'top_colors': [],
}



def build_year_report(report_input: dict[str, Any] | None = None) -> dict[str, Any]:
    """构建年度报告最小输出结构。

    参数：
    - report_input: 当前阶段支持 `year`、`play_history`、`library_tracks` 三类输入。

    返回：
    - 包含 `year` 与 `pages` 的结构化年报对象。
    """
    normalized_input = report_input or {}
    year = _resolve_year(normalized_input)
    context = {
        'year': year,
        'play_history': normalized_input.get('play_history', []) or [],
        'library_tracks': normalized_input.get('library_tracks', []) or [],
        # 曲风候选映射表用于承载多口径并存：主曲风继续保留，加权口径按置信度累计。
        'genre_matches': normalized_input.get('genre_matches', []) or [],
    }
    pages = []
    page_map: dict[str, dict[str, Any]] = {}
    for page_id in CONFIRMED_PAGE_SEQUENCE:
        context['page_map'] = page_map
        page = _build_page(page_id, context)
        pages.append(page)
        page_map[page_id] = page
    return {
        'year': year,
        'pages': pages,
    }



def _resolve_year(report_input: dict[str, Any]) -> int:
    """解析年报目标年份；如果未传或非法，则先退化为 0，避免骨架阶段抛异常。"""
    year = report_input.get('year', 0)
    return year if isinstance(year, int) else 0



def _build_page(page_id: str, context: dict[str, Any]) -> dict[str, Any]:
    """根据页面编号分发到对应占位构建函数。"""
    builders = {
        'P20': _build_p20,
        'P21': _build_p21,
        'P22': _build_p22,
        'P23': _build_p23,
        'P24': _build_p24,
        'P26': _build_p26,
        'P27': _build_p27,
        'P28': _build_p28,
        'P29': _build_p29,
        'P30': _build_p30,
        'P31': _build_p31,
        'L01': _build_l01,
        'L04A': _build_l04a,
        'L04B': _build_l04b,
        'L02': _build_l02,
        'L03': _build_l03,
        'P32': _build_p32,
    }
    return builders[page_id](context)



def _base_page(page_id: str, year: int, summary_text: str) -> dict[str, Any]:
    """构建所有页面共享的基础字段。"""
    return {
        'page_id': page_id,
        'title': PAGE_TITLES[page_id],
        'year': year,
        'summary_text': summary_text,
    }



def _build_p20(context: dict[str, Any]) -> dict[str, Any]:
    """P20 输出本年度最晚深夜记录、深夜记录次数与代表歌曲。"""
    year_rows = _filter_year_rows(context['play_history'], context['year'])
    night_rows = [row for row in year_rows if isinstance(row.get('night_sort_minute'), int)]
    latest_night_record = _build_latest_night_record(night_rows)
    representative_tracks = _aggregate_late_night_tracks(night_rows)
    summary_text = '这一页用于展示本年度最晚听歌时刻与深夜活跃夜晚数。'
    if latest_night_record:
        summary_text = f"今年最晚的一次听歌出现在 {latest_night_record['latest_time']}，那时你在听《{latest_night_record['track_title']}》。"

    page = _base_page('P20', context['year'], summary_text)
    page['latest_night_record'] = latest_night_record
    page['late_night_total'] = len(night_rows)
    page['late_night_track_total'] = len(representative_tracks)
    page['representative_tracks'] = representative_tracks
    return page



def _build_p21(context: dict[str, Any]) -> dict[str, Any]:
    """P21 固化为历年最晚记录时间线页。"""
    history = _aggregate_latest_night_history(context['play_history'])
    peak_year = next((item['year'] for item in history if item['is_peak_record']), None)
    summary_text = '按历年时间线展示每年最晚听歌记录，并高亮全历史最晚的一年。'
    if history:
        peak_item = next(item for item in history if item['is_peak_record'])
        summary_text = f"历年最晚的一次出现在 {peak_item['year']} 年 {peak_item['latest_time']}，那晚你在听《{peak_item['track_title']}》。"

    page = _base_page('P21', context['year'], summary_text)
    page['latest_night_history'] = history
    page['peak_record_year'] = peak_year
    return page



def _build_p22(context: dict[str, Any]) -> dict[str, Any]:
    """P22 输出循环强度最高的歌曲榜单，强调单日重复聆听指数。"""
    repeat_ranking = _build_repeat_ranking(context['play_history'], context['year'])
    summary_text = '展示那些在真正点开它的日子里，你会一天反复听很多次的歌曲。'
    if repeat_ranking:
        summary_text = f"《{repeat_ranking[0]['track_title']}》是今年循环强度最高的歌，平均每个活跃日会回放 {repeat_ranking[0]['repeat_index']:.2f} 次。"

    page = _base_page('P22', context['year'], summary_text)
    page['repeat_ranking'] = repeat_ranking
    return page



def _build_p23(context: dict[str, Any]) -> dict[str, Any]:
    """P23 输出本年度播放表现最强的专辑。"""
    album_ranking = _aggregate_album_ranking(context['play_history'], context['year'])
    summary_text = '展示年度之最专辑及其代表歌曲。'
    if album_ranking:
        summary_text = f"今年听得最多的专辑是《{album_ranking[0]['album_display']}》，它陪你循环了 {album_ranking[0]['play_total']} 次。"

    page = _base_page('P23', context['year'], summary_text)
    page['top_album'] = album_ranking[0] if album_ranking else None
    return page



def _build_p24(context: dict[str, Any]) -> dict[str, Any]:
    """P24 输出本年度最爱专辑榜单。"""
    album_ranking = _aggregate_album_ranking(context['play_history'], context['year'])
    page = _base_page('P24', context['year'], '展示年度最爱专辑榜单。')
    page['album_ranking'] = album_ranking
    return page



def _build_p26(context: dict[str, Any]) -> dict[str, Any]:
    """P26 输出本年度歌曲榜单，复用与年度歌曲一致的综合评分口径。"""
    song_ranking = _build_song_ranking(context['play_history'], context['year'])
    summary_text = '展示这一年最常回放、也最稳定陪伴你的歌曲榜单。'
    if song_ranking:
        summary_text = f"今年的歌曲冠军是《{song_ranking[0]['track_title']}》，它一共陪你播放了 {song_ranking[0]['play_count']} 次。"

    page = _base_page('P26', context['year'], summary_text)
    page['song_ranking'] = song_ranking
    return page



def _build_p27(context: dict[str, Any]) -> dict[str, Any]:
    """P27 输出年度歌手页所需的歌手冠军榜数据。"""
    artist_ranking = _build_artist_ranking(context['play_history'], context['year'])
    summary_text = '展示今年最常陪着你的歌手，以及紧随其后的年度歌手榜。'
    if artist_ranking:
        summary_text = f"今年陪你最久的歌手是 {artist_ranking[0]['artist_display']}，总共出现了 {artist_ranking[0]['play_total']} 次。"

    page = _base_page('P27', context['year'], summary_text)
    page['artist_ranking'] = artist_ranking
    return page



def _build_p28(context: dict[str, Any]) -> dict[str, Any]:
    """P28 输出你与年度歌手的首次相遇、高峰日与陪伴跨度。"""
    artist_ranking = _build_artist_ranking(context['play_history'], context['year'])
    top_artist_name = artist_ranking[0]['artist_display'] if artist_ranking else None
    artist_journey = _build_artist_journey(context['play_history'], context['year'], top_artist_name)
    summary_text = '把你和年度歌手之间的首次相遇与高峰时刻，收束成一段轨迹。'
    if artist_journey.get('artist_display'):
        summary_text = f"你和 {artist_journey['artist_display']} 的故事，最早可以追溯到 {artist_journey.get('first_played_at') or '更早的某一天'}。"

    page = _base_page('P28', context['year'], summary_text)
    page['artist_journey'] = artist_journey
    return page



def _build_p29(context: dict[str, Any]) -> dict[str, Any]:
    """P29 展开年度最爱歌手榜单明细。"""
    artist_ranking = _build_artist_ranking(context['play_history'], context['year'])
    summary_text = '展示这一年你最常回到的歌手榜单明细。'
    if artist_ranking:
        summary_text = f"年度最爱歌手榜一共有 {len(artist_ranking)} 位主要歌手进入统计，榜首仍然是 {artist_ranking[0]['artist_display']}。"

    page = _base_page('P29', context['year'], summary_text)
    page['artist_ranking'] = artist_ranking
    return page



def _build_p30(context: dict[str, Any]) -> dict[str, Any]:
    """P30 按年份输出历年歌手冠军榜。"""
    yearly_artist_ranking = _build_yearly_artist_ranking(context['play_history'])
    summary_text = '按年份回看历年的歌手冠军与陪伴轨迹。'
    if yearly_artist_ranking:
        latest_year_group = yearly_artist_ranking[-1]
        latest_winner = latest_year_group['ranking'][0] if latest_year_group.get('ranking') else None
        if latest_winner:
            summary_text = f"{latest_year_group['year']} 年的歌手冠军是 {latest_winner['artist_display']}。"

    page = _base_page('P30', context['year'], summary_text)
    page['yearly_artist_ranking'] = yearly_artist_ranking
    return page



def _build_p31(context: dict[str, Any]) -> dict[str, Any]:
    """P31 作为桥页，统一承载元数据完成度与封面颜色模块。"""
    coverage = _calculate_library_coverage(context['library_tracks'], context['genre_matches'])
    color_summary = _calculate_cover_color_summary(context['library_tracks'])
    summary_text = '先展示曲库元数据完成度，再展示已识别封面颜色的年度主色摘要。'
    if color_summary['counted_track_total']:
        top_color = color_summary['top_colors'][0]
        summary_text = f"当前曲库已识别 {color_summary['counted_track_total']} 首封面颜色，最常出现的是 {top_color['color_hex']}。"

    page = _base_page('P31', context['year'], summary_text)
    page['coverage'] = coverage
    page['cover_color_summary'] = color_summary
    return page



def _build_l01(context: dict[str, Any]) -> dict[str, Any]:
    """L01 作为歌曲库章节首页，复用当前可得曲库统计结果。"""
    metrics = _calculate_library_metrics(context['library_tracks'], context['year'])
    coverage = _calculate_library_coverage(context['library_tracks'], context['genre_matches'])
    page = _base_page('L01', context['year'], '展示当前歌曲库规模、本年度新增规模与基础覆盖率。')
    page['metrics'] = metrics
    page['coverage'] = coverage
    return page



def _build_l04a(context: dict[str, Any]) -> dict[str, Any]:
    """L04A 输出全曲库歌手榜，并统一收敛到 ranking 字段。"""
    ranking = _build_library_artist_ranking(context['library_tracks'])
    summary_text = '展示全曲库歌手收藏 Top10。'
    if ranking:
        summary_text = f"全曲库收藏最多的歌手目前是 {ranking[0]['artist_display']}。"

    page = _base_page('L04A', context['year'], summary_text)
    page['ranking'] = ranking
    return page



def _build_l04b(context: dict[str, Any]) -> dict[str, Any]:
    """L04B 输出年度新增歌手榜，同样统一到 ranking 字段。"""
    ranking = _build_new_artist_ranking(context['library_tracks'], context['year'])
    summary_text = '展示本年度新增歌手 Top10。'
    if ranking:
        summary_text = f"今年扩坑最多的歌手是 {ranking[0]['artist_display']}。"

    page = _base_page('L04B', context['year'], summary_text)
    page['ranking'] = ranking
    return page



def _build_l02(context: dict[str, Any]) -> dict[str, Any]:
    """L02 输出本年度新增歌曲、歌手、专辑与月度新增趋势。"""
    new_tracks = [row for row in context['library_tracks'] if row.get('first_added_year') == context['year']]
    growth_metrics = _build_growth_metrics(new_tracks)
    monthly_growth = _build_monthly_growth(new_tracks)
    summary_text = '展示本年度新增歌曲、歌手、专辑及月度新增趋势。'
    if growth_metrics['new_track_total']:
        summary_text = f"今年新收进了 {growth_metrics['new_track_total']} 首歌，也同步拓宽了 {growth_metrics['new_artist_total']} 位歌手。"

    page = _base_page('L02', context['year'], summary_text)
    page['growth_metrics'] = growth_metrics
    page['monthly_growth'] = monthly_growth
    return page



def _build_l03(context: dict[str, Any]) -> dict[str, Any]:
    """L03 输出曲库结构分布，并新增主曲风/加权曲风双口径。"""
    genre_views = _build_genre_views(context['library_tracks'], context['genre_matches'])
    language_distribution = _build_language_distribution(context['library_tracks'])
    page = _base_page('L03', context['year'], '展示曲库语种、时长与曲风结构分布。')
    page['language_distribution'] = language_distribution
    page['duration_distribution'] = []
    # 旧字段继续保留，默认直接复用新的加权曲风口径，避免后续前端接线时找不到入口。
    page['genre_distribution'] = genre_views['weighted_genre_distribution']
    page['primary_genre_distribution'] = genre_views['primary_genre_distribution']
    page['weighted_genre_distribution'] = genre_views['weighted_genre_distribution']
    return page



def _build_p32(context: dict[str, Any]) -> dict[str, Any]:
    """P32 作为收尾页，优先复用前序页面结果拼装四格总结。"""
    page_map = context.get('page_map', {})
    summary_cards = _build_summary_cards(page_map)
    summary_text = '使用年度歌曲、歌手、专辑与关键时刻收束整份报告。'
    if summary_cards:
        summary_text = f"这一年里，你的深夜时刻、专辑偏好、扩坑方向和曲库结构都能在这几张总结卡里看到。"

    page = _base_page('P32', context['year'], summary_text)
    page['summary_cards'] = summary_cards
    return page



def _history_track_key(row: dict[str, Any]) -> str | None:
    """统一解析播放记录里的歌曲主键，优先 track_id，其次回退歌名。"""
    for raw_value in (row.get('track_id'), row.get('track_title')):
        if isinstance(raw_value, str) and raw_value.strip():
            return raw_value.strip()
    return None



def _history_artist_value(row: dict[str, Any]) -> str | None:
    """统一解析播放记录里的歌手展示名。"""
    artist_display = row.get('artist_display')
    if isinstance(artist_display, str) and artist_display.strip():
        return artist_display.strip()
    return None



def _history_play_total(row: dict[str, Any]) -> int:
    """统一解析播放记录里的播放次数，缺失时按 1 次兜底。"""
    return int(row.get('play_count') or row.get('play_total') or 1)



def _history_listened_sec(row: dict[str, Any]) -> int:
    """统一解析播放记录里的收听秒数。"""
    return int(row.get('listened_sec') or 0)



def _parse_played_at(raw_value: Any) -> datetime | None:
    """尽量把 played_at 解析成 datetime，失败时安全返回 None。"""
    if not isinstance(raw_value, str) or not raw_value.strip():
        return None
    try:
        return datetime.fromisoformat(raw_value.strip())
    except ValueError:
        return None



def _resolve_play_date_key(row: dict[str, Any]) -> str | None:
    """从播放时间里提取 YYYY-MM-DD 日期键，供高峰日与活跃日统计复用。"""
    parsed_dt = _parse_played_at(row.get('played_at'))
    if parsed_dt is None:
        return None
    return parsed_dt.date().isoformat()



def _build_song_ranking(play_history: list[dict[str, Any]], year: int) -> list[dict[str, Any]]:
    """按年度歌曲综合分构建歌曲榜单。"""
    year_rows = _filter_year_rows(play_history, year)
    buckets: dict[str, dict[str, Any]] = {}
    for row in year_rows:
        track_key = _history_track_key(row)
        if not track_key:
            continue
        bucket = buckets.setdefault(track_key, {
            'track_title': row.get('track_title') or '未知歌曲',
            'artist_display': _history_artist_value(row) or '未知歌手',
            'album_display': row.get('album_display') or '未知专辑',
            'play_count': 0,
            'active_days': 0,
            'listened_sec': 0,
            'cover_path': row.get('cover_path'),
        })
        bucket['play_count'] += _history_play_total(row)
        bucket['active_days'] += int(row.get('active_days') or 0)
        bucket['listened_sec'] += _history_listened_sec(row)
        if not bucket['cover_path'] and row.get('cover_path'):
            bucket['cover_path'] = row.get('cover_path')

    ranking = []
    for item in buckets.values():
        listened_hours = item['listened_sec'] / 3600
        score = round(item['play_count'] * 0.55 + item['active_days'] * 0.30 + listened_hours * 0.15, 3)
        ranking.append({
            'rank': 0,
            'track_title': item['track_title'],
            'artist_display': item['artist_display'],
            'album_display': item['album_display'],
            'play_count': item['play_count'],
            'active_days': item['active_days'],
            'listened_sec': item['listened_sec'],
            'score': score,
            'cover_path': item['cover_path'],
        })

    sorted_ranking = sorted(
        ranking,
        key=lambda item: (
            -item['score'],
            -item['play_count'],
            -item['active_days'],
            -item['listened_sec'],
            item['track_title'],
        ),
    )
    for index, item in enumerate(sorted_ranking, start=1):
        item['rank'] = index
    return sorted_ranking[:10]



def _build_repeat_ranking(play_history: list[dict[str, Any]], year: int) -> list[dict[str, Any]]:
    """按重复聆听指数构建歌曲榜单，供 P22 复用。"""
    year_rows = _filter_year_rows(play_history, year)
    buckets: dict[str, dict[str, Any]] = {}
    for row in year_rows:
        track_key = _history_track_key(row)
        if not track_key:
            continue
        bucket = buckets.setdefault(track_key, {
            'track_title': row.get('track_title') or '未知歌曲',
            'artist_display': _history_artist_value(row) or '未知歌手',
            'album_display': row.get('album_display') or '未知专辑',
            'play_count': 0,
            'active_days': 0,
            'listened_sec': 0,
            'cover_path': row.get('cover_path'),
        })
        bucket['play_count'] += _history_play_total(row)
        bucket['active_days'] += int(row.get('active_days') or 0)
        bucket['listened_sec'] += _history_listened_sec(row)
        if not bucket['cover_path'] and row.get('cover_path'):
            bucket['cover_path'] = row.get('cover_path')

    ranking = []
    for item in buckets.values():
        repeat_index = round(item['play_count'] / max(item['active_days'], 1), 4)
        ranking.append({
            'rank': 0,
            'track_title': item['track_title'],
            'artist_display': item['artist_display'],
            'album_display': item['album_display'],
            'play_count': item['play_count'],
            'active_days': item['active_days'],
            'listened_sec': item['listened_sec'],
            'repeat_index': repeat_index,
            'cover_path': item['cover_path'],
        })

    sorted_ranking = sorted(
        ranking,
        key=lambda item: (
            -item['repeat_index'],
            -item['play_count'],
            -item['active_days'],
            item['track_title'],
        ),
    )
    for index, item in enumerate(sorted_ranking, start=1):
        item['rank'] = index
    return sorted_ranking[:10]



def _artist_names_from_history(row: dict[str, Any]) -> list[str]:
    """播放记录中的歌手名同样复用安全分隔逻辑，避免协作串名不拆开。"""
    artist_names = _split_artist_display_values(row.get('artist_display'))
    if artist_names:
        return artist_names
    fallback_name = _history_artist_value(row)
    return [fallback_name] if fallback_name else []



def _build_artist_ranking(play_history: list[dict[str, Any]], year: int) -> list[dict[str, Any]]:
    """按年度播放聚合歌手榜，供 P27/P29/P30 共用。"""
    year_rows = _filter_year_rows(play_history, year)
    buckets: dict[str, dict[str, Any]] = {}
    for row in year_rows:
        track_key = _history_track_key(row)
        play_total = _history_play_total(row)
        listened_sec = _history_listened_sec(row)
        for artist_name in _artist_names_from_history(row):
            bucket = buckets.setdefault(artist_name, {
                'artist_display': artist_name,
                'play_total': 0,
                'listened_sec': 0,
                'track_keys': set(),
                'top_track_title': row.get('track_title') or '未知歌曲',
                'top_track_play_total': -1,
            })
            bucket['play_total'] += play_total
            bucket['listened_sec'] += listened_sec
            if track_key:
                bucket['track_keys'].add(track_key)
            if play_total > bucket['top_track_play_total']:
                bucket['top_track_play_total'] = play_total
                bucket['top_track_title'] = row.get('track_title') or '未知歌曲'

    ranking = []
    for item in buckets.values():
        ranking.append({
            'rank': 0,
            'artist_display': item['artist_display'],
            'play_total': item['play_total'],
            'listened_sec': item['listened_sec'],
            'track_total': len(item['track_keys']),
            'top_track_title': item['top_track_title'],
        })

    sorted_ranking = sorted(
        ranking,
        key=lambda item: (-item['play_total'], -item['listened_sec'], -item['track_total'], item['artist_display']),
    )
    for index, item in enumerate(sorted_ranking, start=1):
        item['rank'] = index
    return sorted_ranking[:10]



def _build_artist_journey(
    play_history: list[dict[str, Any]],
    year: int,
    artist_display: str | None,
) -> dict[str, Any]:
    """围绕年度歌手输出首次相遇、高峰日与陪伴天数。"""
    if not artist_display:
        return {}

    artist_rows = [
        row for row in play_history
        if artist_display in _artist_names_from_history(row)
    ]
    if not artist_rows:
        return {}

    dated_rows = []
    for row in artist_rows:
        parsed_dt = _parse_played_at(row.get('played_at'))
        if parsed_dt is None:
            continue
        dated_rows.append((parsed_dt, row))

    first_played_at = None
    first_track = None
    days_since_first_play = 0
    if dated_rows:
        first_dt, first_row = min(dated_rows, key=lambda item: item[0])
        first_played_at = first_dt.strftime('%Y-%m-%d %H:%M:%S')
        if year > 0:
            report_end = datetime(year, 12, 31).date()
            days_since_first_play = max(0, (report_end - first_dt.date()).days + 1)
        first_track = {
            'track_title': first_row.get('track_title') or '未知歌曲',
            'artist_display': artist_display,
            'album_display': first_row.get('album_display') or '未知专辑',
            'cover_path': first_row.get('cover_path'),
        }

    day_buckets: dict[str, dict[str, Any]] = {}
    for row in artist_rows:
        date_key = _resolve_play_date_key(row)
        if not date_key:
            continue
        bucket = day_buckets.setdefault(date_key, {
            'date': date_key,
            'play_total': 0,
            'track_title': row.get('track_title') or '未知歌曲',
            'top_track_play_total': -1,
        })
        play_total = _history_play_total(row)
        bucket['play_total'] += play_total
        if play_total > bucket['top_track_play_total']:
            bucket['top_track_play_total'] = play_total
            bucket['track_title'] = row.get('track_title') or '未知歌曲'

    peak_day = None
    if day_buckets:
        peak_item = max(day_buckets.values(), key=lambda item: (item['play_total'], item['date']))
        peak_day = {
            'date': peak_item['date'],
            'play_total': peak_item['play_total'],
            'track_title': peak_item['track_title'],
        }

    return {
        'artist_display': artist_display,
        'first_played_at': first_played_at,
        'days_since_first_play': days_since_first_play,
        'first_track': first_track,
        'peak_day': peak_day,
    }



def _build_yearly_artist_ranking(play_history: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """按年份回放歌手榜，供 P30 以年份分组展示。"""
    years = sorted({row.get('year') for row in play_history if isinstance(row.get('year'), int)})
    result = []
    for year in years:
        ranking = _build_artist_ranking(play_history, year)
        if not ranking:
            continue
        result.append({
            'year': year,
            'ranking': ranking[:3],
        })
    return result



def _aggregate_latest_night_history(play_history: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """按年份选出每年最晚的一条听歌记录，用于 P21 时间线。"""
    latest_by_year: dict[int, dict[str, Any]] = {}
    for row in play_history:
        year = row.get('year')
        night_sort_minute = row.get('night_sort_minute')
        if not isinstance(year, int) or not isinstance(night_sort_minute, int):
            continue
        current_best = latest_by_year.get(year)
        if current_best is None or night_sort_minute > current_best['night_sort_minute']:
            latest_by_year[year] = {
                'year': year,
                'latest_time': row.get('latest_time') or '',
                'track_title': row.get('track_title') or '未知歌曲',
                'artist_display': row.get('artist_display') or '未知歌手',
                'cover_path': row.get('cover_path'),
                'night_sort_minute': night_sort_minute,
                'is_peak_record': False,
            }

    history = [latest_by_year[year] for year in sorted(latest_by_year)]
    if history:
        peak_item = max(history, key=lambda item: item['night_sort_minute'])
        peak_item['is_peak_record'] = True
    return history


def _filter_year_rows(rows: list[dict[str, Any]], year: int) -> list[dict[str, Any]]:
    """统一过滤指定年份数据，避免各页面重复写 `row.get('year') == year`。"""
    return [row for row in rows if row.get('year') == year]


def _build_latest_night_record(rows: list[dict[str, Any]]) -> dict[str, Any] | None:
    """从年度深夜记录中取最晚一条，用于 P20 主角卡片。"""
    if not rows:
        return None
    best_row = max(rows, key=lambda row: row['night_sort_minute'])
    return {
        'latest_time': best_row.get('latest_time') or '',
        'track_title': best_row.get('track_title') or '未知歌曲',
        'artist_display': best_row.get('artist_display') or '未知歌手',
        'cover_path': best_row.get('cover_path'),
        'night_sort_minute': best_row['night_sort_minute'],
    }


def _aggregate_late_night_tracks(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """按歌曲聚合本年度深夜记录，输出代表歌曲列表。"""
    buckets: dict[str, dict[str, Any]] = {}
    for row in rows:
        track_key = str(row.get('track_id') or row.get('track_title') or '').strip()
        if not track_key:
            continue
        bucket = buckets.setdefault(track_key, {
            'track_title': row.get('track_title') or '未知歌曲',
            'artist_display': row.get('artist_display') or '未知歌手',
            'late_night_play_total': 0,
            'latest_time': row.get('latest_time') or '',
            'night_sort_minute': row['night_sort_minute'],
            'cover_path': row.get('cover_path'),
        })
        bucket['late_night_play_total'] += 1
        if row['night_sort_minute'] > bucket['night_sort_minute']:
            bucket['latest_time'] = row.get('latest_time') or ''
            bucket['night_sort_minute'] = row['night_sort_minute']
            bucket['cover_path'] = row.get('cover_path')

    return [
        {
            'track_title': item['track_title'],
            'artist_display': item['artist_display'],
            'late_night_play_total': item['late_night_play_total'],
            'latest_time': item['latest_time'],
            'cover_path': item['cover_path'],
        }
        for item in sorted(
            buckets.values(),
            key=lambda item: (-item['late_night_play_total'], -item['night_sort_minute'], item['track_title'])
        )
    ]


def _is_valid_album_name(album_display: Any) -> bool:
    """过滤未知专辑、散曲类专辑与空值，避免它们进入年度专辑主榜。"""
    if not _has_value(album_display):
        return False
    normalized = str(album_display).strip().lower()
    invalid_values = {
        'unknown',
        '未知',
        '未识别',
        'other',
        'single',
        '单曲',
        '散曲',
        '未收录专辑',
    }
    return normalized not in invalid_values


def _aggregate_album_ranking(play_history: list[dict[str, Any]], year: int) -> list[dict[str, Any]]:
    """按本年度播放记录聚合专辑榜单，供 P23/P24 共用。"""
    year_rows = _filter_year_rows(play_history, year)
    buckets: dict[str, dict[str, Any]] = {}
    for row in year_rows:
        album_display = row.get('album_display')
        if not _is_valid_album_name(album_display):
            continue
        album_key = str(album_display).strip()
        bucket = buckets.setdefault(album_key, {
            'album_display': album_key,
            'artist_display': row.get('artist_display') or '未知歌手',
            'play_total': 0,
            'track_ids': set(),
            'active_days': 0,
            'listened_sec': 0,
            'cover_path': row.get('cover_path'),
            'top_track_title': row.get('track_title') or '未知歌曲',
            'top_track_play_total': -1,
        })
        play_total = int(row.get('play_count') or row.get('play_total') or 1)
        bucket['play_total'] += play_total
        track_key = str(row.get('track_id') or row.get('track_title') or '').strip()
        if track_key:
            bucket['track_ids'].add(track_key)
        bucket['active_days'] += int(row.get('active_days') or 0)
        bucket['listened_sec'] += int(row.get('listened_sec') or 0)
        if play_total > bucket['top_track_play_total']:
            bucket['top_track_play_total'] = play_total
            bucket['top_track_title'] = row.get('track_title') or '未知歌曲'
            bucket['cover_path'] = row.get('cover_path')

    ranking = []
    for item in buckets.values():
        ranking.append({
            'rank': 0,
            'album_display': item['album_display'],
            'artist_display': item['artist_display'],
            'play_total': item['play_total'],
            'track_total': len(item['track_ids']),
            'active_days': item['active_days'],
            'listened_sec': item['listened_sec'],
            'representative_track_title': item['top_track_title'],
            'cover_path': item['cover_path'],
        })

    sorted_ranking = sorted(
        ranking,
        key=lambda item: (
            -item['play_total'],
            -item['track_total'],
            -item['active_days'],
            -item['listened_sec'],
            item['album_display'],
        )
    )
    for index, item in enumerate(sorted_ranking, start=1):
        item['rank'] = index
    return sorted_ranking[:10]



def _calculate_library_coverage(
    library_tracks: list[dict[str, Any]],
    genre_matches: list[dict[str, Any]],
) -> dict[str, float]:
    """计算曲库元数据覆盖率，统一复用给 P31 与 L01。"""
    total = len(library_tracks)
    if total == 0:
        return dict(EMPTY_COVERAGE)

    resolved_primary_genres = _resolve_primary_genre_map(library_tracks, genre_matches)
    coverage_counts = {
        'lyrics_ratio': sum(1 for row in library_tracks if _has_value(row.get('lyric_text'))),
        'cover_ratio': sum(
            1
            for row in library_tracks
            if bool(row.get('cover_art_present')) or _has_value(row.get('cover_path'))
        ),
        'genre_ratio': sum(
            1
            for row in library_tracks
            if _has_value(resolved_primary_genres.get(row.get('track_id')) or row.get('primary_genre'))
        ),
        'album_ratio': sum(1 for row in library_tracks if _has_value(row.get('album_display'))),
        'artist_ratio': sum(1 for row in library_tracks if _has_value(row.get('artist_display'))),
        'duration_ratio': sum(1 for row in library_tracks if row.get('duration_sec') is not None),
        'credit_ratio': sum(1 for row in library_tracks if _has_value(row.get('composer')) or _has_value(row.get('lyricist'))),
    }
    return {
        key: round(value / total, 4)
        for key, value in coverage_counts.items()
    }



def _calculate_cover_color_summary(library_tracks: list[dict[str, Any]]) -> dict[str, Any]:
    """统计已有封面颜色的歌曲数与主色 Top，缺失颜色的歌曲单独计入排除数。"""
    color_buckets: dict[str, dict[str, Any]] = {}
    counted_track_total = 0
    excluded_track_total = 0

    for row in library_tracks:
        color_hex = row.get('cover_color')
        if not _has_value(color_hex):
            excluded_track_total += 1
            continue

        counted_track_total += 1
        normalized_color = str(color_hex).strip()
        bucket = color_buckets.setdefault(normalized_color, {
            'color_hex': normalized_color,
            'track_count': 0,
            'representative_track_title': row.get('track_title') or '未知歌曲',
            'representative_artist_display': row.get('artist_display') or '未知歌手',
            'representative_cover_path': row.get('cover_path'),
        })
        bucket['track_count'] += 1

    top_colors = sorted(
        color_buckets.values(),
        key=lambda item: (-item['track_count'], item['color_hex'])
    )
    return {
        'counted_track_total': counted_track_total,
        'excluded_track_total': excluded_track_total,
        'top_colors': top_colors,
    }



def _calculate_library_metrics(library_tracks: list[dict[str, Any]], year: int) -> dict[str, Any]:
    """计算歌曲库规模指标，供 L01 当前阶段复用。"""
    if not library_tracks:
        return dict(EMPTY_LIBRARY_METRICS)

    track_total = len(library_tracks)
    artist_values = {str(row.get('artist_display')).strip() for row in library_tracks if _has_value(row.get('artist_display'))}
    album_values = {str(row.get('album_display')).strip() for row in library_tracks if _has_value(row.get('album_display'))}
    duration_total_sec = sum(int(row.get('duration_sec') or 0) for row in library_tracks)
    new_tracks = [row for row in library_tracks if row.get('first_added_year') == year]
    new_artists = {str(row.get('artist_display')).strip() for row in new_tracks if _has_value(row.get('artist_display'))}
    new_albums = {str(row.get('album_display')).strip() for row in new_tracks if _has_value(row.get('album_display'))}
    return {
        'track_total': track_total,
        'artist_total': len(artist_values),
        'album_total': len(album_values),
        'duration_total_sec': duration_total_sec,
        'new_track_total': len(new_tracks),
        'new_artist_total': len(new_artists),
        'new_album_total': len(new_albums),
    }


def _build_growth_metrics(new_tracks: list[dict[str, Any]]) -> dict[str, int]:
    """统计本年度新增歌曲、歌手、专辑数量。"""
    artist_values = {str(row.get('artist_display')).strip() for row in new_tracks if _has_value(row.get('artist_display'))}
    album_values = {str(row.get('album_display')).strip() for row in new_tracks if _has_value(row.get('album_display'))}
    return {
        'new_track_total': len(new_tracks),
        'new_artist_total': len(artist_values),
        'new_album_total': len(album_values),
    }


def _build_monthly_growth(new_tracks: list[dict[str, Any]]) -> list[dict[str, int]]:
    """按月份统计年度新增趋势；若月度字段缺失，则直接返回空数组。"""
    if not new_tracks or any(not isinstance(row.get('first_added_month'), int) for row in new_tracks):
        return []

    monthly_buckets: dict[int, dict[str, Any]] = {}
    for row in new_tracks:
        month = row['first_added_month']
        bucket = monthly_buckets.setdefault(month, {
            'month': month,
            'track_total': 0,
            'artist_values': set(),
            'album_values': set(),
        })
        bucket['track_total'] += 1
        if _has_value(row.get('artist_display')):
            bucket['artist_values'].add(str(row.get('artist_display')).strip())
        if _has_value(row.get('album_display')):
            bucket['album_values'].add(str(row.get('album_display')).strip())

    return [
        {
            'month': month,
            'new_track_total': monthly_buckets[month]['track_total'],
            'new_artist_total': len(monthly_buckets[month]['artist_values']),
            'new_album_total': len(monthly_buckets[month]['album_values']),
        }
        for month in sorted(monthly_buckets)
    ]


def _build_summary_cards(page_map: dict[str, dict[str, Any]]) -> list[dict[str, str]]:
    """从前序页面提取最有代表性的年度结论，拼装成 P32 总结四格。"""
    cards = []
    p20 = page_map.get('P20') or {}
    p23 = page_map.get('P23') or {}
    # 拆页后年度新增榜独立成 L04B，总结卡从该页读取扩坑冠军。
    l04b = page_map.get('L04B') or {}
    l03 = page_map.get('L03') or {}

    latest_night_record = p20.get('latest_night_record')
    if latest_night_record:
        cards.append({
            'card_id': 'latest-night',
            'headline': '今年最晚的一次',
            'value': latest_night_record.get('latest_time') or '',
            'support_text': f"你在听《{latest_night_record.get('track_title') or '未知歌曲'}》",
        })

    top_album = p23.get('top_album')
    if top_album:
        cards.append({
            'card_id': 'top-album',
            'headline': '年度之最专辑',
            'value': top_album.get('album_display') or '未知专辑',
            'support_text': f"累计播放 {top_album.get('play_total') or 0} 次",
        })

    new_artist_ranking = l04b.get('ranking') or []
    if new_artist_ranking:
        top_new_artist = new_artist_ranking[0]
        cards.append({
            'card_id': 'top-new-artist',
            'headline': '今年扩坑最多',
            'value': top_new_artist.get('artist_display') or '未知歌手',
            'support_text': f"新增歌曲 {top_new_artist.get('new_track_total') or 0} 首",
        })

    weighted_genre_distribution = l03.get('weighted_genre_distribution') or []
    if weighted_genre_distribution:
        top_genre = weighted_genre_distribution[0]
        cards.append({
            'card_id': 'library-structure',
            'headline': '曲库最显著结构',
            'value': top_genre.get('genre_name_zh') or top_genre.get('genre_name') or '未知曲风',
            'support_text': f"加权歌曲数 {top_genre.get('weighted_track_count') or 0}",
        })

    return cards



def _build_library_artist_ranking(library_tracks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """按全曲库维度统计歌手收藏数量与专辑覆盖，用于 L04A Top10。"""
    grouped_rows = _group_tracks_by_artist(library_tracks)
    ranking = []
    for artist_display, rows in grouped_rows.items():
        ranking.append({
            'rank': 0,
            'artist_display': artist_display,
            'track_total': len(rows),
            'album_total': len({str(row.get('album_display')).strip() for row in rows if _has_value(row.get('album_display'))}),
            'top_track_title': next((row.get('track_title') for row in rows if _has_value(row.get('track_title'))), '未知歌曲'),
        })

    sorted_ranking = sorted(
        ranking,
        key=lambda item: (-item['track_total'], -item['album_total'], item['artist_display'])
    )
    # 双榜都只保留 Top10，同时显式补 rank 便于前端直接渲染序号。
    for index, item in enumerate(sorted_ranking, start=1):
        item['rank'] = index
    return sorted_ranking[:10]



def _build_new_artist_ranking(library_tracks: list[dict[str, Any]], year: int) -> list[dict[str, Any]]:
    """按本年度新增歌曲统计歌手扩坑数量，用于 L04B Top10。"""
    new_tracks = [row for row in library_tracks if row.get('first_added_year') == year]
    grouped_rows = _group_tracks_by_artist(new_tracks)
    ranking = []
    for artist_display, rows in grouped_rows.items():
        ranking.append({
            'rank': 0,
            'artist_display': artist_display,
            'new_track_total': len(rows),
            'new_album_total': len({str(row.get('album_display')).strip() for row in rows if _has_value(row.get('album_display'))}),
            'highlight_tag': '年度重点新增' if len(rows) >= 2 else None,
        })

    sorted_ranking = sorted(
        ranking,
        key=lambda item: (-item['new_track_total'], -item['new_album_total'], item['artist_display'])
    )
    # 年度新增榜同样补 rank 并裁剪为 Top10，保证与 L04A 契约一致。
    for index, item in enumerate(sorted_ranking, start=1):
        item['rank'] = index
    return sorted_ranking[:10]


def _split_artist_display_values(raw_artist_display: Any) -> list[str]:
    """按安全分隔符拆歌手展示名，避免把协作串名误当成单个歌手。"""
    if not _has_value(raw_artist_display):
        return []

    # 当前只处理用户已明确确认的协作分隔符，先解决 `浅影阿;汐音社` 这类稳定场景。
    normalized_value = str(raw_artist_display).replace('；', ';')
    parts = [part.strip() for part in normalized_value.split(';')]
    result: list[str] = []
    seen: set[str] = set()
    for part in parts:
        if not part or part in seen:
            continue
        seen.add(part)
        result.append(part)
    return result


def _build_genre_views(
    library_tracks: list[dict[str, Any]],
    genre_matches: list[dict[str, Any]],
) -> dict[str, list[dict[str, Any]]]:
    """同时构建主曲风口径与置信度加权口径，满足“多口径并存”的年度报告需求。"""
    primary_genre_map = _resolve_primary_genre_map(library_tracks, genre_matches)
    primary_buckets: dict[str, int] = defaultdict(int)
    weighted_buckets: dict[str, float] = defaultdict(float)

    for row in library_tracks:
        track_id = row.get('track_id')
        primary_genre = primary_genre_map.get(track_id) or row.get('primary_genre')
        if _has_value(primary_genre):
            primary_buckets[str(primary_genre).strip()] += 1

    matches_by_track = _group_genre_matches_by_track(genre_matches)
    for row in library_tracks:
        track_id = row.get('track_id')
        track_matches = matches_by_track.get(track_id, [])
        if track_matches:
            for match in track_matches:
                weighted_buckets[match['genre_name']] += match['match_score']
            continue

        fallback_primary = row.get('primary_genre')
        if _has_value(fallback_primary):
            weighted_buckets[str(fallback_primary).strip()] += 1.0

    primary_distribution = [
        {
            'genre_name': genre_name,
            'genre_name_zh': _map_genre_name_to_zh(genre_name),
            'track_count': track_count,
        }
        for genre_name, track_count in sorted(
            primary_buckets.items(),
            key=lambda item: (-item[1], item[0])
        )
    ]
    weighted_distribution = [
        {
            'genre_name': genre_name,
            'genre_name_zh': _map_genre_name_to_zh(genre_name),
            'weighted_track_count': round(weighted_track_count, 2),
        }
        for genre_name, weighted_track_count in sorted(
            weighted_buckets.items(),
            key=lambda item: (-item[1], item[0])
        )
    ]
    return {
        'primary_genre_distribution': primary_distribution,
        'weighted_genre_distribution': weighted_distribution,
    }


def _build_language_distribution(library_tracks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """按已落库的 `language_norm` 统计语种分布，供 L03 直接复用。"""
    language_buckets: dict[str, int] = defaultdict(int)
    for row in library_tracks:
        language_name = row.get('language_norm')
        if not _has_value(language_name):
            continue
        language_buckets[str(language_name).strip()] += 1

    return [
        {
            'language_name': language_name,
            'track_count': track_count,
        }
        for language_name, track_count in sorted(
            language_buckets.items(),
            key=lambda item: (-item[1], item[0]),
        )
    ]


def _resolve_primary_genre_map(
    library_tracks: list[dict[str, Any]],
    genre_matches: list[dict[str, Any]],
) -> dict[Any, str]:
    """为每首歌解析主曲风：优先取最高置信度候选，没有候选时退回旧字段 primary_genre。"""
    matches_by_track = _group_genre_matches_by_track(genre_matches)
    primary_genre_map: dict[Any, str] = {}

    for row in library_tracks:
        track_id = row.get('track_id')
        track_matches = matches_by_track.get(track_id, [])
        if track_matches:
            primary_genre_map[track_id] = track_matches[0]['genre_name']
            continue
        if _has_value(row.get('primary_genre')):
            primary_genre_map[track_id] = str(row.get('primary_genre')).strip()

    return primary_genre_map


def _map_genre_name_to_zh(genre_name: Any) -> str:
    """把内部曲风路径映射成面向用户展示的中文标签。"""
    normalized = str(genre_name or '').strip()
    if not normalized:
        return '未知曲风'
    genre_map = {
        'J-Pop': '日系流行',
        'Pop---J-pop': '日系流行',
        'Pop---K-pop': '韩流流行',
        'Pop---Ballad': '抒情流行',
        'Electronic---Dance-pop': '舞曲流行',
        'Rock---Pop Rock': '流行摇滚',
        'Rock---Folk Rock': '民谣摇滚',
        'Anime': '动漫',
        'Folk': '民谣',
        '国语流行': '华语流行',
        'Mandopop': '华语流行',
        '古风': '古风',
        'Vocaloid': 'Vocaloid',
        'Pop': '流行',
        'Rock': '摇滚',
    }
    if normalized in genre_map:
        return genre_map[normalized]
    if '---' in normalized:
        parent_name, child_name = normalized.split('---', 1)
        if child_name in genre_map:
            return genre_map[child_name]
        if parent_name in genre_map:
            return genre_map[parent_name]
    return normalized


def _group_genre_matches_by_track(genre_matches: list[dict[str, Any]]) -> dict[Any, list[dict[str, Any]]]:
    """按歌曲聚合候选曲风，并按置信度降序排序，供主曲风与加权曲风共用。"""
    matches_by_track: dict[Any, list[dict[str, Any]]] = defaultdict(list)
    for row in genre_matches:
        track_id = row.get('track_id')
        genre_name = row.get('genre_name') or row.get('genre_norm')
        match_score = row.get('match_score')
        if track_id is None or not _has_value(genre_name):
            continue
        if not isinstance(match_score, (int, float)):
            continue
        matches_by_track[track_id].append({
            'genre_name': str(genre_name).strip(),
            'match_score': float(match_score),
        })

    for track_id, rows in matches_by_track.items():
        matches_by_track[track_id] = sorted(
            rows,
            key=lambda item: (-item['match_score'], item['genre_name'])
        )
    return matches_by_track



def _group_tracks_by_artist(rows: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    """按歌手分组，并对安全协作分隔符做拆分聚合。"""
    grouped_rows: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        artist_names = _split_artist_display_values(row.get('artist_display'))
        for artist_name in artist_names:
            grouped_rows[artist_name].append(row)
    return grouped_rows



def _has_value(value: Any) -> bool:
    """统一判断字段是否有可用值，避免空字符串或全空白字符串误算进覆盖率。"""
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    return True




def load_dataset_payloads_from_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def parse_db_url(db_url):
    parsed = urlparse(db_url)
    if parsed.scheme not in ('mssql+pymssql', 'pymssql'):
        raise ValueError('db_url scheme must be mssql+pymssql or pymssql')
    return {
        'server': parsed.hostname,
        'port': parsed.port or 1433,
        'user': unquote(parsed.username) if parsed.username else None,
        'password': unquote(parsed.password) if parsed.password else None,
        'database': parsed.path.lstrip('/') or None,
    }


def load_db_config(db_url=None):
    resolved_url = db_url or os.environ.get('JUMUSIC_DB_URL')
    if not resolved_url:
        raise ValueError('db_url is required for database mode')
    return parse_db_url(resolved_url)


def connect_db(db_config):
    if pymssql is None:
        raise RuntimeError('pymssql is required to connect to SQL Server')
    return pymssql.connect(
        server=db_config['server'],
        port=db_config.get('port', 1433),
        user=db_config['user'],
        password=db_config['password'],
        database=db_config['database'],
        charset='utf8',
        tds_version='7.0',
    )


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description='Build annual report JSON from dataset payloads')
    parser.add_argument('--year', type=int, required=False)
    parser.add_argument('--input-json', default=None)
    parser.add_argument('--db-url', default=None)
    parser.add_argument('--output', required=True)
    parser.add_argument('--generated-at', default=None)
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    if not args.input_json and not args.db_url:
        raise ValueError('either --input-json or --db-url is required')

    if args.input_json:
        input_payload = load_dataset_payloads_from_json(args.input_json)
        if isinstance(input_payload, dict) and 'pages' not in input_payload and any(
            key in input_payload for key in ('play_history', 'library_tracks', 'genre_matches')
        ):
            report = build_year_report(input_payload)
        else:
            target_year = args.year
            if target_year is None and isinstance(input_payload, dict):
                target_year = input_payload.get('year')
            if target_year is None:
                raise ValueError('--year is required when --input-json contains dataset payloads')
            report = build_report_from_dataset_payloads(
                year=target_year,
                dataset_payloads=input_payload,
                generated_at=args.generated_at,
            )
    else:
        if args.year is None:
            raise ValueError('--year is required when using --db-url')
        db_config = load_db_config(args.db_url)
        conn = connect_db(db_config)
        try:
            dataset_payloads = collect_dataset_payloads(conn.cursor(), args.year)
        finally:
            conn.close()
        report = build_report_from_dataset_payloads(
            year=args.year,
            dataset_payloads=dataset_payloads,
            generated_at=args.generated_at,
        )
    report = make_json_safe(report)
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Wrote year report JSON to {output_path}')
    return report


if __name__ == '__main__':
    main()
