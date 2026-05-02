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
    parser.add_argument('--year', type=int, required=True)
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
        dataset_payloads = load_dataset_payloads_from_json(args.input_json)
    else:
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
    return report


if __name__ == '__main__':
    main()
