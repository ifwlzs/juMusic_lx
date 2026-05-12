"""构建移动端年度报告 contract 的编排层。"""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
import json
import os
from pathlib import Path
from statistics import median
from typing import Any
import importlib.util
import math
import re
from urllib.parse import unquote, urlparse


# 移动端当前先串起 P01-P20，再衔接专辑页、P31/L01 桥页与曲库专题双榜。
MOBILE_PAGE_ORDER = [
    'P01', 'P02', 'P03', 'P04', 'P05', 'P06', 'P07', 'P08', 'P09', 'P10',
    'P11', 'P12', 'P13', 'P14', 'P15', 'P16', 'P17', 'P18', 'P19', 'P20',
    'P21', 'P22', 'P23', 'P24', 'P25', 'P26', 'P27', 'P28', 'P29', 'P30', 'P31', 'P32', 'L01', 'L02', 'L03', 'L04A', 'L04B',
]


# 统一维护模板名，前端直接据此分发到对应页面组件。
PAGE_TEMPLATES = {
    'P01': 'hero-cover',
    'P02': 'overview-stats',
    'P03': 'breadth-stats',
    'P04': 'foreign-language',
    'P05': 'exploration-contrast',
    'P06': 'keyword-poster',
    'P07': 'story-placeholder',
    'P08': 'genre-ranking',
    'P09': 'genre-timeline',
    'P10': 'genre-score',
    'P11': 'cover-color',
    'P12': 'season-favorite',
    'P13': 'season-favorite',
    'P14': 'season-favorite',
    'P15': 'season-favorite',
    'P16': 'artist-hero',
    'P17': 'week-rhythm',
    'P18': 'calendar-heatmap',
    'P19': 'time-preference',
    'P20': 'late-night-hero',
    'P21': 'timeline-night',
    'P22': 'repeat-ranking',
    'P23': 'album-hero',
    'P24': 'album-ranking',
    'P25': 'song-hero',
    'P26': 'song-ranking',
    'P27': 'artist-ranking',
    'P28': 'artist-journey',
    'P29': 'artist-ranking-detail',
    'P30': 'artist-yearly-ranking',
    'P31': 'library-coverage',
    'L01': 'library-overview',
    'L02': 'library-growth',
    'L03': 'library-structure',
    'L04A': 'artist-library-ranking',
    'L04B': 'artist-new-ranking',
    'P32': 'year-summary',
}


# 顶部弱章节标签统一由 contract 提供，避免页面组件里重复维护中文文案。
PAGE_SECTIONS = {
    'P01': '故事开场',
    'P02': '年度概览',
    'P03': '探索广度',
    'P04': '外语歌单',
    'P05': '听歌方式',
    'P06': '年度关键词',
    'P07': '氛围章节',
    'P08': '曲风章节',
    'P09': '曲风章节',
    'P10': '曲风章节',
    'P11': '封面颜色',
    'P12': '四季最爱',
    'P13': '四季最爱',
    'P14': '四季最爱',
    'P15': '四季最爱',
    'P16': '歌手章节',
    'P17': '节奏习惯',
    'P18': '节奏习惯',
    'P19': '时间偏好',
    'P20': '深夜偏好',
    'P21': '深夜轨迹',
    'P22': '年度歌曲',
    'P23': '专辑章节',
    'P24': '专辑章节',
    'P25': '年度歌曲',
    'P26': '年度歌曲',
    'P27': '歌手章节',
    'P28': '歌手章节',
    'P29': '歌手章节',
    'P30': '歌手章节',
    'P31': '曲库专题',
    'L01': '曲库专题',
    'L02': '曲库专题',
    'L03': '曲库专题',
    'L04A': '曲库专题',
    'L04B': '曲库专题',
    'P32': '总结收尾',
}


PAGE_TITLES = {
    'P01': '第一次相遇',
    'P02': '年度总览',
    'P03': '年度探索广度',
    'P04': '外语歌曲',
    'P05': '主动探索 vs 重复所爱',
    'P06': '年度关键词',
    'P07': '城市陪伴',
    'P08': '年度曲风 Top5',
    'P09': '曲风进化历',
    'P10': '品味曲风分数',
    'P11': '年度封面主色',
    'P12': '春季最爱',
    'P13': '夏季最爱',
    'P14': '秋季最爱',
    'P15': '冬季最爱',
    'P16': '年度最爱歌手',
    'P17': '一周听歌心情',
    'P18': '年度听歌日历',
    'P19': '最爱时段',
    'P20': '深夜听歌',
    'P21': '历年最晚记录',
    'P22': '反复聆听',
    'P23': '年度之最专辑',
    'P24': '年度最爱专辑榜',
    'P25': '年度歌曲',
    'P26': '年度歌曲榜单',
    'P27': '年度歌手页',
    'P28': '与年度歌手的轨迹',
    'P29': '年度最爱歌手榜单',
    'P30': '历年歌手榜',
    'P31': '元数据完成度与封面颜色',
    'L01': '歌曲库总览',
    'L02': '年度新增分析',
    'L03': '歌曲库结构分析',
    'L04A': '歌曲库歌手榜',
    'L04B': '年度新增歌手榜',
    'P32': '年度总结四格',
}


MOBILE_DESIGN_WIDTH = 390
MOBILE_DESIGN_HEIGHT = 844
BUILD_YEAR_REPORT_PATH = Path(__file__).resolve().with_name('build_year_report.py')
WORKTREE_DB_BUILD_YEAR_REPORT_PATH = Path(__file__).resolve().parents[2] / '.worktrees' / 'main-merge-20260502' / 'scripts' / 'year_report' / 'build_year_report.py'
STOPWORDS = {
    'music', 'version', 'feat', 'live', 'edit', 'demo', 'original', 'instrumental',
    'the', 'and', 'with', 'from', 'your', 'this', 'that', 'into', '因为', '所以',
    '我们', '你们', '他们', '一个', '没有', '可以', '如果', '还是', '已经', '只是',
    '然后', '不是', '自己', '真的', '以及', '继续', '一起', '只要', '时候', '地方',
    '歌曲', '歌手', '专辑', '试听', '播放', '年度', 'musiclx', 'jumusic',
    'lavf', 'cover', 'ver', 'remix', 'vocaloid', 'feat', 'ft', 'vs',
    '翻自', '翻唱', '原唱', '调教', '本家', '作词', '作曲', '编曲', '词', '曲',
}
CHINESE_RE = re.compile(r'[\u4e00-\u9fff]{2,8}')
LATIN_RE = re.compile(r"[A-Za-z][A-Za-z'\-]{2,}")
BRACKETED_SEGMENT_RE = re.compile(r'\[[^\]]*\]|【[^】]*】|\([^)]*\)|（[^）]*）')
TITLE_PREFIX_DELIMITER_RE = re.compile(r'^\s*(?P<prefix>[^—–\-|｜]{1,80}?)\s*[-—–|｜]\s*(?P<body>.+?)\s*$')
GENRE_LABEL_FALLBACKS = {
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
}


class _BuilderContext(dict):
    """轻量 context 容器，便于在多个页面构建函数之间共享缓存。"""


def build_year_report_contract(raw_report: dict[str, Any] | None = None) -> dict[str, Any]:
    """把原始年报输入编排成前端可直接消费的移动端 contract。"""
    normalized_report = raw_report or {}
    year = _resolve_year(normalized_report)
    base_module = _load_base_report_builder()
    analytics_report = base_module.build_year_report(normalized_report)
    analytics_page_map = {page['page_id']: page for page in analytics_report.get('pages', [])}
    context = _build_context(normalized_report, year, base_module, analytics_page_map)

    pages = [
        _build_p01_page(context),
        _build_p02_page(context),
        _build_p03_page(context),
        _build_p04_page(context),
        _build_p05_page(context),
        _build_p06_page(context),
        _build_p07_page(context),
        _build_p08_page(context),
        _build_p09_page(context),
        _build_p10_page(context),
        _build_p11_page(context),
        _build_season_page(context, 'P12', 'spring'),
        _build_season_page(context, 'P13', 'summer'),
        _build_season_page(context, 'P14', 'autumn'),
        _build_season_page(context, 'P15', 'winter'),
        _build_p16_page(context),
        _build_p17_page(context),
        _build_p18_page(context),
        _build_p19_page(context),
        _build_p20_page(context),
        _build_p21_page(context),
        _build_p22_page(context),
        _build_p23_page(context),
        _build_p24_page(context),
        _build_p25_page(context),
        _build_p26_page(context),
        _build_p27_page(context),
        _build_p28_page(context),
        _build_p29_page(context),
        _build_p30_page(context),
        _build_p31_page(context),
        _build_p32_page(context),
        _build_l01_page(context),
        _build_l02_page(context),
        _build_l03_page(context),
        _build_l04a_page(context),
        _build_l04b_page(context),
    ]
    return {
        'meta': {
            'year': year,
            'design_width': MOBILE_DESIGN_WIDTH,
            'design_height': MOBILE_DESIGN_HEIGHT,
            'page_order': MOBILE_PAGE_ORDER,
            'page_total': len(pages),
            'theme_name': 'netease-young-editorial',
        },
        'pages': pages,
    }


def _build_context(
    raw_report: dict[str, Any],
    year: int,
    base_module: Any,
    analytics_page_map: dict[str, dict[str, Any]],
) -> _BuilderContext:
    """预先整理全局上下文，减少各页重复扫描同一份输入。"""
    play_history = raw_report.get('play_history', []) or []
    library_tracks = raw_report.get('library_tracks', []) or []
    genre_matches = raw_report.get('genre_matches', []) or []
    track_library_map = {
        row.get('track_id'): row
        for row in library_tracks
        if row.get('track_id') is not None
    }
    genre_views_fn = getattr(base_module, '_build_genre_views', None)
    genre_views = genre_views_fn(library_tracks, genre_matches) if callable(genre_views_fn) else {
        'primary_genre_distribution': [],
        'weighted_genre_distribution': [],
    }
    primary_genre_map_fn = getattr(base_module, '_resolve_primary_genre_map', None)
    primary_genre_map = (
        primary_genre_map_fn(library_tracks, genre_matches)
        if callable(primary_genre_map_fn)
        else {}
    )
    group_genre_matches_fn = getattr(base_module, '_group_genre_matches_by_track', None)
    genre_matches_by_track = (
        group_genre_matches_fn(genre_matches)
        if callable(group_genre_matches_fn)
        else {}
    )
    genre_label_map = _build_genre_label_map()

    return _BuilderContext({
        'year': year,
        'play_history': play_history,
        'library_tracks': library_tracks,
        'genre_matches': genre_matches,
        'base_module': base_module,
        'analytics_page_map': analytics_page_map,
        'track_library_map': track_library_map,
        'primary_genre_map': primary_genre_map,
        'genre_matches_by_track': genre_matches_by_track,
        'genre_views': genre_views,
        'genre_label_map': genre_label_map,
    })


def _load_base_report_builder() -> Any:
    """按文件路径加载已有年报骨架脚本，复用底层聚合逻辑。"""
    spec = importlib.util.spec_from_file_location('build_year_report', BUILD_YEAR_REPORT_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _resolve_year(raw_report: dict[str, Any]) -> int:
    """解析目标年份；无效值统一降级为 0。"""
    year = raw_report.get('year', 0)
    return year if isinstance(year, int) else 0


def _build_p01_page(context: _BuilderContext) -> dict[str, Any]:
    """构建首次相遇页，强调全历史第一次听歌与陪伴时长。"""
    first_track = _find_first_track(context['play_history'])
    payload = {
        'first_played_at': first_track.get('played_at') if first_track else None,
        'companionship_days': _calculate_companionship_days(first_track, context['year']),
        'companionship_years': _calculate_companionship_years(first_track, context['year']),
        'first_track': first_track,
    }
    summary_text = '这一页用于回看你和 juMusic 的第一次相遇。'
    if first_track:
        summary_text = f"最早的一次记录停在 {first_track['played_at']}，当时你点开的是《{first_track['track_title']}》。"
    return _build_page_shell('P01', context['year'], summary_text, payload)


def _build_p02_page(context: _BuilderContext) -> dict[str, Any]:
    """构建年度总览页，先输出最稳的总量指标。"""
    year_rows = _filter_year_rows(context['play_history'], context['year'])
    track_first_year = _resolve_first_year_map(context['play_history'], _row_track_key)
    yearly_track_keys = {track_key for track_key in (_row_track_key(row) for row in year_rows) if track_key}
    new_track_keys = {track_key for track_key in yearly_track_keys if track_first_year.get(track_key) == context['year']}
    active_day_total = len({_resolve_date_key(row) for row in year_rows if _resolve_date_key(row)})
    total_play_count = sum(_row_play_total(row) for row in year_rows)
    total_listened_sec = sum(_row_listened_sec(row) for row in year_rows)
    unique_track_total = len(yearly_track_keys)
    new_song_ratio = round(len(new_track_keys) / unique_track_total, 4) if unique_track_total else 0.0
    payload = {
        'overview_metrics': {
            'total_play_count': total_play_count,
            'total_listened_sec': total_listened_sec,
            'total_listened_hours': round(total_listened_sec / 3600, 2),
            'active_day_total': active_day_total,
            'unique_track_total': unique_track_total,
            'new_song_total': len(new_track_keys),
            'new_song_ratio': new_song_ratio,
        },
    }
    summary_text = '把这一年的播放次数、收听时长与新歌占比先收束成一页。'
    if total_play_count:
        summary_text = f"这一年你一共播放了 {total_play_count} 次，活跃了 {active_day_total} 天。"
    return _build_page_shell('P02', context['year'], summary_text, payload)


def _build_p03_page(context: _BuilderContext) -> dict[str, Any]:
    """构建年度探索广度页，统计歌手与曲风的新旧跨度。"""
    year_rows = _filter_year_rows(context['play_history'], context['year'])
    yearly_artists = {artist for artist in (_row_artist_value(row) for row in year_rows) if artist}
    artist_first_year = _resolve_first_year_map(context['play_history'], _row_artist_value)
    new_artist_total = sum(1 for artist in yearly_artists if artist_first_year.get(artist) == context['year'])

    yearly_track_keys = {_row_track_key(row) for row in year_rows if _row_track_key(row)}
    genre_rows = []
    for row in context['play_history']:
        genre_name = _resolve_genre_for_row(row, context)
        if not genre_name:
            continue
        row_year = row.get('year') if isinstance(row.get('year'), int) else _resolve_row_year(row)
        if row_year is None:
            continue
        genre_rows.append((row_year, genre_name))
    genre_first_year = {}
    for row_year, genre_name in genre_rows:
        genre_first_year[genre_name] = min(row_year, genre_first_year.get(genre_name, row_year))
    yearly_genres = {genre for row in year_rows for genre in [_resolve_genre_for_row(row, context)] if genre}
    new_genre_total = sum(1 for genre_name in yearly_genres if genre_first_year.get(genre_name) == context['year'])

    payload = {
        'breadth_metrics': {
            'artist_total': len(yearly_artists),
            'new_artist_total': new_artist_total,
            'genre_total': len(yearly_genres),
            'new_genre_total': new_genre_total,
            'track_total': len(yearly_track_keys),
        },
    }
    summary_text = '这一页用于展示你这一年听歌版图到底拓到了多宽。'
    if yearly_artists or yearly_genres:
        summary_text = f"今年你听过 {len(yearly_artists)} 位歌手、{len(yearly_genres)} 种曲风，其中有 {new_artist_total} 位新歌手。"
    return _build_page_shell('P03', context['year'], summary_text, payload)


def _build_p04_page(context: _BuilderContext) -> dict[str, Any]:
    """构建外语歌曲页，统计年度外语语种与代表歌曲。"""
    year_rows = _filter_year_rows(context['play_history'], context['year'])
    language_buckets: dict[str, dict[str, Any]] = {}
    foreign_rows = []
    for row in year_rows:
        language_name = _resolve_language_for_row(row, context)
        if not _is_foreign_language(language_name):
            continue
        foreign_rows.append(row)
        bucket = language_buckets.setdefault(language_name, {
            'language_name': language_name,
            'play_total': 0,
            'track_keys': set(),
        })
        bucket['play_total'] += _row_play_total(row)
        track_key = _row_track_key(row)
        if track_key:
            bucket['track_keys'].add(track_key)

    language_ranking = [
        {
            'language_name': item['language_name'],
            'play_total': item['play_total'],
            'track_total': len(item['track_keys']),
        }
        for item in sorted(language_buckets.values(), key=lambda item: (-item['play_total'], item['language_name']))
    ]
    spotlight_track = _build_track_spotlight(foreign_rows, context)
    if spotlight_track:
        spotlight_track['language_name'] = _resolve_language_for_row(spotlight_track, context) or language_ranking[0]['language_name']

    payload = {
        'foreign_language_total': len(language_ranking),
        'language_ranking': language_ranking,
        'spotlight_track': spotlight_track,
    }
    summary_text = '外语歌页会聚焦你这一年真正听进去的外语语种与代表歌曲。'
    if language_ranking:
        summary_text = f"今年你主要在 {language_ranking[0]['language_name']} 歌里停留得最久，一共打开了 {language_ranking[0]['play_total']} 次。"
    return _build_page_shell('P04', context['year'], summary_text, payload)


def _build_p05_page(context: _BuilderContext) -> dict[str, Any]:
    """构建主动探索 vs 重复所爱页，比较搜歌行为与旧歌回访。"""
    year_rows = _filter_year_rows(context['play_history'], context['year'])
    total_play_count = sum(_row_play_total(row) for row in year_rows)
    search_rows = [row for row in year_rows if _resolve_entry_source(row) == 'search']
    search_play_total = sum(_row_play_total(row) for row in search_rows)
    # 用户的实际埋点里 search 不一定充分，探索口径要把手动触发的播放一并算进来。
    explore_rows = [row for row in year_rows if _resolve_entry_source(row) in {'search', 'list_click', 'manual_next_prev'}]
    explore_play_total = sum(_row_play_total(row) for row in explore_rows)

    track_added_year_map = {
        track_id: row.get('first_added_year')
        for track_id, row in context['track_library_map'].items()
        if isinstance(row.get('first_added_year'), int)
    }
    revisit_rows = []
    revisit_days = set()
    for row in year_rows:
        track_key = _row_track_key(row)
        if not track_key:
            continue
        if track_added_year_map.get(track_key) is None or track_added_year_map.get(track_key) >= context['year']:
            continue
        revisit_rows.append(row)
        date_key = _resolve_date_key(row)
        if date_key:
            revisit_days.add(date_key)

    revisit_play_total = sum(_row_play_total(row) for row in revisit_rows)
    payload = {
        'exploration_metrics': {
            'explore_play_total': explore_play_total,
            'search_play_total': search_play_total,
            'search_ratio': round(search_play_total / total_play_count, 4) if total_play_count else 0.0,
            'explore_ratio': round(explore_play_total / total_play_count, 4) if total_play_count else 0.0,
            'repeat_play_total': revisit_play_total,
            'repeat_track_ratio': round(revisit_play_total / total_play_count, 4) if total_play_count else 0.0,
            'repeat_active_day_total': len(revisit_days),
        },
        'spotlight_tracks': {
            'search_top_track': _build_track_spotlight(search_rows, context),
            'revisit_top_track': _build_track_spotlight(revisit_rows, context),
        },
    }
    summary_text = '这一页用来对照你今年更常去主动找歌，还是反复回到老朋友那里。'
    if total_play_count:
        summary_text = f"今年主动搜索带来了 {search_play_total} 次播放，而旧歌回访覆盖了 {len(revisit_days)} 个活跃日。"
    return _build_page_shell('P05', context['year'], summary_text, payload)


def _build_p06_page(context: _BuilderContext) -> dict[str, Any]:
    """构建年度关键词页，聚焦本年听过歌曲的歌词切片与歌名。"""
    keyword_stats = _extract_keywords(context)
    payload = {
        'keywords': keyword_stats[:12],
        'keyword_total': len(keyword_stats),
    }
    summary_text = '把本年听过歌曲的歌词切片和歌名里最常冒出来的词，整理成这一年的情绪海报。'
    if keyword_stats:
        summary_text = f"今年最常出现的关键词是“{keyword_stats[0]['keyword']}”，它反复出现在你这一年的歌单里。"
    return _build_page_shell('P06', context['year'], summary_text, payload)


def _build_p07_page(context: _BuilderContext) -> dict[str, Any]:
    """构建城市陪伴页，当前先保留氛围故事口径。"""
    year_rows = _filter_year_rows(context['play_history'], context['year'])
    active_day_total = len({_resolve_date_key(row) for row in year_rows if _resolve_date_key(row)})
    payload = {
        'story_card': {
            'headline': '这一年，很多通勤和夜路都被音乐接住了',
            'subline': f'哪怕暂时没有城市轨迹，你依然在 {active_day_total} 个日子里留下了听歌痕迹。',
            'note': 'City mood',
        },
    }
    return _build_page_shell('P07', context['year'], '先用一页轻故事，把这一年的陪伴感接起来。', payload)


def _build_p08_page(context: _BuilderContext) -> dict[str, Any]:
    """构建年度曲风 Top5 页，统一展示主曲风与加权结果。"""
    genre_ranking = _aggregate_year_genre_ranking(context)
    payload = {
        'genre_ranking': genre_ranking[:5],
    }
    summary_text = '用曲风 Top5 把这一年的口味变化先拉出一个冠军视角。'
    if genre_ranking:
        top_genre_label = genre_ranking[0].get('genre_name_zh') or genre_ranking[0].get('genre_name') or '未知曲风'
        summary_text = f"已识别部分里，{top_genre_label} 是今年最突出的主角。"
    return _build_page_shell('P08', context['year'], summary_text, payload)


def _build_p09_page(context: _BuilderContext) -> dict[str, Any]:
    """构建曲风进化历页，按月挑出最突出的曲风。"""
    timeline = []
    month_buckets: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for row in _filter_year_rows(context['play_history'], context['year']):
        month = _resolve_month_from_row(row)
        if month is None:
            continue
        month_buckets[month].append(row)

    for month in sorted(month_buckets):
        ranking = _aggregate_year_genre_ranking(context, month_buckets[month])
        if not ranking:
            continue
        timeline.append({
            'month': month,
            'top_genre': ranking[0]['genre_name'],
            'top_genre_zh': ranking[0].get('genre_name_zh') or ranking[0]['genre_name'],
            'top_primary_genre': ranking[0]['genre_name'],
            'top_primary_genre_zh': ranking[0].get('genre_name_zh') or ranking[0]['genre_name'],
            'top_weighted_play_total': ranking[0]['weighted_play_total'],
            # 兼容早期字段命名，前端仍可能读取 *_track_count。
            'top_weighted_track_count': ranking[0]['weighted_play_total'],
            'genre_weights': ranking[:3],
        })

    payload = {
        'monthly_genre_timeline': timeline,
    }
    summary_text = '曲风进化历会把你一年里每个月最显眼的口味切面排成一条线。'
    if timeline:
        first_genre_label = timeline[0].get('top_genre_zh') or timeline[0].get('top_genre') or '未知曲风'
        last_genre_label = timeline[-1].get('top_genre_zh') or timeline[-1].get('top_genre') or '未知曲风'
        summary_text = f"从 {first_genre_label} 到 {last_genre_label}，这一年的曲风重心一直在慢慢漂移。"
    return _build_page_shell('P09', context['year'], summary_text, payload)


def _build_p10_page(context: _BuilderContext) -> dict[str, Any]:
    """构建曲风探索分数页，按广度、均衡度、新曲风与识别可信度折算成 100 分。"""
    genre_ranking = _aggregate_year_genre_ranking(context)
    breadth_score = min(35, len(genre_ranking) * 7)
    total_weight = sum(item['weighted_play_total'] for item in genre_ranking)
    balance_score = 0
    if total_weight > 0 and len(genre_ranking) > 1:
        entropy = 0.0
        for item in genre_ranking:
            ratio = item['weighted_play_total'] / total_weight
            if ratio > 0:
                entropy -= ratio * math.log(ratio)
        max_entropy = math.log(len(genre_ranking))
        balance_score = int(round((entropy / max_entropy) * 35)) if max_entropy else 0

    breadth_metrics = _build_p03_page(context)['payload']['breadth_metrics']
    genre_total = breadth_metrics['genre_total']
    new_genre_ratio = (breadth_metrics['new_genre_total'] / genre_total) if genre_total else 0.0
    new_genre_score = int(round(new_genre_ratio * 20))
    confidence_score = 0
    if genre_ranking:
        total_primary_play = sum(item['primary_play_total'] for item in genre_ranking) or 1
        weighted_confidence = sum(
            item['confidence_score'] * item['primary_play_total']
            for item in genre_ranking
        ) / total_primary_play
        confidence_score = int(round(min(1.0, weighted_confidence) * 10))
    taste_score = max(0, min(100, int(round(breadth_score + balance_score + new_genre_score + confidence_score))))
    payload = {
        'taste_score': taste_score,
        'score_breakdown': {
            'breadth_score': breadth_score,
            'balance_score': balance_score,
            'new_genre_score': new_genre_score,
            'confidence_score': confidence_score,
        },
        'radar_metrics': [
            {'metric_key': 'breadth', 'metric_label': '广度', 'score': breadth_score, 'full_score': 35},
            {'metric_key': 'balance', 'metric_label': '均衡', 'score': balance_score, 'full_score': 35},
            {'metric_key': 'novelty', 'metric_label': '新曲风', 'score': new_genre_score, 'full_score': 20},
            {'metric_key': 'confidence', 'metric_label': '识别可信度', 'score': confidence_score, 'full_score': 10},
        ],
    }
    summary_text = f'这一年的曲风探索分数先定格在 {taste_score} 分。'
    return _build_page_shell('P10', context['year'], summary_text, payload)


def _build_p11_page(context: _BuilderContext) -> dict[str, Any]:
    """构建年度封面主色页，仅统计本年实际听过的歌曲封面。"""
    year_track_keys = {
        _row_track_key(row)
        for row in _filter_year_rows(context['play_history'], context['year'])
        if _row_track_key(row)
    }
    listened_tracks = [
        row for row in context['library_tracks']
        if row.get('track_id') in year_track_keys
    ]
    color_summary = _build_cover_color_summary_for_page(context, listened_tracks)
    payload = {
        'cover_color_summary': color_summary,
    }
    summary_text = '封面颜色页会把曲库里最常出现的几种色调浓缩出来。'
    if color_summary['top_colors']:
        summary_text = f"当前最常出现的封面主色是 {color_summary['top_colors'][0]['color_hex']}。"
    return _build_page_shell('P11', context['year'], summary_text, payload)


def _build_season_page(context: _BuilderContext, page_id: str, season_key: str) -> dict[str, Any]:
    """按四季同构模板输出四页最爱歌曲。"""
    year_rows = _filter_year_rows(context['play_history'], context['year'])
    season_rows = [row for row in year_rows if _resolve_season_from_row(row) == season_key]
    favorite_track = _build_track_spotlight(season_rows, context, sort_by='play_count')
    season_label_map = {
        'spring': '春',
        'summer': '夏',
        'autumn': '秋',
        'winter': '冬',
    }
    payload = {
        'season_key': season_key,
        'season_label': season_label_map[season_key],
        'favorite_track': favorite_track,
    }
    summary_text = f"{season_label_map[season_key]}天里最常陪着你的那首歌，会留在这一页。"
    if favorite_track:
        summary_text = f"{season_label_map[season_key]}天里你最常回到《{favorite_track['track_title']}》。"
    return _build_page_shell(page_id, context['year'], summary_text, payload)


def _build_p16_page(context: _BuilderContext) -> dict[str, Any]:
    """构建年度最爱歌手页，聚焦冠军歌手和月度条形分布。"""
    year_rows = _filter_year_rows(context['play_history'], context['year'])
    buckets: dict[str, dict[str, Any]] = {}
    for row in year_rows:
        artist_display = _row_artist_value(row)
        if not artist_display:
            continue
        bucket = buckets.setdefault(artist_display, {
            'artist_display': artist_display,
            'play_total': 0,
            'listened_sec': 0,
            'track_keys': set(),
            'top_track_title': row.get('track_title') or '未知歌曲',
            'top_track_play_total': -1,
            'monthly_distribution': defaultdict(int),
        })
        play_total = _row_play_total(row)
        listened_sec = _row_listened_sec(row)
        track_key = _row_track_key(row)
        month = _resolve_month_from_row(row)
        bucket['play_total'] += play_total
        bucket['listened_sec'] += listened_sec
        if track_key:
            bucket['track_keys'].add(track_key)
        if month is not None:
            bucket['monthly_distribution'][month] += play_total
        if play_total > bucket['top_track_play_total']:
            bucket['top_track_play_total'] = play_total
            bucket['top_track_title'] = row.get('track_title') or '未知歌曲'

    ranking = sorted(
        buckets.values(),
        key=lambda item: (-item['play_total'], -item['listened_sec'], -len(item['track_keys']), item['artist_display'])
    )
    top_artist = None
    if ranking:
        winner = ranking[0]
        top_artist = {
            'artist_display': winner['artist_display'],
            'play_total': winner['play_total'],
            'listened_sec': winner['listened_sec'],
            'track_total': len(winner['track_keys']),
            'top_track_title': winner['top_track_title'],
            'monthly_distribution': [
                {
                    'month': month,
                    'play_total': winner['monthly_distribution'].get(month, 0),
                }
                for month in range(1, 13)
            ],
        }

    payload = {
        'top_artist': top_artist,
    }
    summary_text = '这一页会把年度第一歌手和整年的月度陪伴感并排讲清楚。'
    if top_artist:
        summary_text = f"今年陪你最久的歌手是 {top_artist['artist_display']}，一共出现了 {top_artist['play_total']} 次。"
    return _build_page_shell('P16', context['year'], summary_text, payload)


def _build_p17_page(context: _BuilderContext) -> dict[str, Any]:
    """构建一周听歌心情页，输出周分布与 BPM 概览。"""
    year_rows = _filter_year_rows(context['play_history'], context['year'])
    weekday_buckets = {
        weekday: {
            'weekday': weekday,
            'weekday_label': _weekday_label(weekday),
            'play_total': 0,
            'listened_sec': 0,
            'bpm_values': [],
        }
        for weekday in range(1, 8)
    }
    bpm_row_total = 0
    for row in year_rows:
        weekday = _resolve_weekday_from_row(row)
        if weekday is None:
            continue
        bucket = weekday_buckets[weekday]
        bucket['play_total'] += _row_play_total(row)
        bucket['listened_sec'] += _row_listened_sec(row)
        bpm_value = _resolve_bpm_for_row(row, context)
        if bpm_value is not None:
            bucket['bpm_values'].append(bpm_value)
            bpm_row_total += 1

    weekday_distribution = []
    for weekday in range(1, 8):
        bucket = weekday_buckets[weekday]
        bpm_values = bucket.pop('bpm_values')
        bucket['bpm_value'] = int(round(median(bpm_values))) if bpm_values else None
        bucket['bpm_source'] = 'median' if bpm_values else None
        weekday_distribution.append(bucket)

    workday_play_total = sum(item['play_total'] for item in weekday_distribution[:5])
    weekend_play_total = sum(item['play_total'] for item in weekday_distribution[5:])
    bpm_coverage_ratio = round(bpm_row_total / len(year_rows), 4) if year_rows else 0.0
    mood_summary = '周末更松弛，工作日更像把情绪重新拧紧。'
    if bpm_coverage_ratio < 0.35:
        mood_summary = '这一页先保留活跃分布，BPM 覆盖还不足以强行解读心情。'

    payload = {
        'weekday_distribution': weekday_distribution,
        'weekend_vs_workday': {
            'workday_play_total': workday_play_total,
            'weekend_play_total': weekend_play_total,
        },
        'bpm_coverage_ratio': bpm_coverage_ratio,
        'mood_summary': mood_summary,
    }
    return _build_page_shell('P17', context['year'], mood_summary, payload)


def _build_p18_page(context: _BuilderContext) -> dict[str, Any]:
    """构建年度听歌日历页，输出 GitHub 风格的全年周列热力图。"""
    day_counter: Counter[str] = Counter()
    for row in _filter_year_rows(context['play_history'], context['year']):
        date_key = _resolve_date_key(row)
        if date_key:
            day_counter[date_key] += _row_play_total(row)

    max_count = max(day_counter.values(), default=0)
    weekday_labels = ['一', '二', '三', '四', '五', '六', '日']
    heatmap_columns, heatmap_cells, month_labels = _build_calendar_heatmap_columns(
        context['year'],
        day_counter,
        max_count,
    )

    peak_date = None
    if day_counter:
        peak_date = max(day_counter.items(), key=lambda item: (item[1], item[0]))[0]

    payload = {
        'active_day_total': len(day_counter),
        'longest_streak_day_total': _calculate_longest_streak(sorted(day_counter)),
        'peak_date': peak_date,
        'weekday_labels': weekday_labels,
        'month_labels': month_labels,
        'heatmap_columns': heatmap_columns,
        'heatmap_cells': heatmap_cells,
    }
    summary_text = '这一页把你全年真正活跃的那些日子，一格一格地重新亮起来。'
    if payload['active_day_total']:
        summary_text = f"今年你一共在 {payload['active_day_total']} 天里点开过音乐，最长连续记录是 {payload['longest_streak_day_total']} 天。"
    return _build_page_shell('P18', context['year'], summary_text, payload)


def _build_p19_page(context: _BuilderContext) -> dict[str, Any]:
    """构建最爱时段页，把一天拆得更细，并补充高峰小时排行。"""
    year_rows = _filter_year_rows(context['play_history'], context['year'])
    bucket_counter: Counter[str] = Counter()
    hour_counter: Counter[int] = Counter()
    bucket_rows: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in year_rows:
        hour = _resolve_hour_from_row(row)
        if hour is None:
            continue
        bucket_key = _resolve_time_bucket_from_hour(hour)
        play_total = _row_play_total(row)
        bucket_counter[bucket_key] += play_total
        hour_counter[hour] += play_total
        bucket_rows[bucket_key].append(row)

    time_bucket_distribution = [
        {
            **descriptor,
            'play_total': bucket_counter.get(descriptor['bucket_key'], 0),
        }
        for descriptor in _time_bucket_descriptors()
    ]
    # 年报页面固定展示完整时间分段，因此 0 播放的桶也必须保留，避免页面缺格。
    # 只有本年确实存在播放记录时，才计算真正的主时段，避免空数据被误识别成第一桶。
    top_bucket = max(time_bucket_distribution, key=lambda item: item['play_total']) if hour_counter else None
    peak_hour = None
    if hour_counter:
        hour, play_total = max(hour_counter.items(), key=lambda item: (item[1], -item[0]))
        peak_hour = {
            'hour': hour,
            'label': f'{hour:02d}:00-{hour:02d}:59',
            'play_total': play_total,
        }
    top_hour_ranking = [
        {
            'hour': hour,
            'label': f'{hour:02d}:00-{hour:02d}:59',
            'play_total': play_total,
        }
        for hour, play_total in sorted(hour_counter.items(), key=lambda item: (-item[1], item[0]))[:3]
    ]
    representative_track = _build_track_spotlight(bucket_rows.get(top_bucket['bucket_key'], []), context) if top_bucket else None
    payload = {
        'time_bucket_distribution': time_bucket_distribution,
        'top_bucket': top_bucket,
        'peak_hour': peak_hour,
        'top_hour_ranking': top_hour_ranking,
        'representative_track': representative_track,
    }
    summary_text = '这页会告诉你，哪一个时段最像今年的默认打开方式。'
    if top_bucket and peak_hour:
        summary_text = f"你最常在{top_bucket['bucket_label']}听歌，其中最密集的一小时落在 {peak_hour['label']}。"
    return _build_page_shell('P19', context['year'], summary_text, payload)


def _build_p20_page(context: _BuilderContext) -> dict[str, Any]:
    """构建深夜听歌页，直接复用底层聚合结果并包进 payload。"""
    p20_page = context['analytics_page_map'].get('P20') or {}
    payload = {
        'latest_night_record': p20_page.get('latest_night_record'),
        'late_night_total': p20_page.get('late_night_total', 0),
        'late_night_track_total': p20_page.get('late_night_track_total', 0),
        'representative_tracks': list(p20_page.get('representative_tracks', []) or []),
    }
    summary_text = p20_page.get('summary_text') or '这一页展示本年度最晚听歌的时刻与深夜歌单。'
    return _build_page_shell('P20', context['year'], summary_text, payload)


def _build_p21_page(context: _BuilderContext) -> dict[str, Any]:
    """构建 P21 历年最晚记录页，并根据数据量切换单年/时间线版式。"""
    p21_page = context['analytics_page_map'].get('P21') or {}
    latest_night_history = list(p21_page.get('latest_night_history', []) or [])
    payload = {
        'layout_mode': 'single-year' if len(latest_night_history) <= 1 else 'timeline',
        'latest_night_history': latest_night_history,
        'peak_record_year': p21_page.get('peak_record_year'),
    }
    summary_text = p21_page.get('summary_text') or '用时间线回看历年最晚听歌的那一刻。'
    return _build_page_shell('P21', context['year'], summary_text, payload)


def _build_p22_page(context: _BuilderContext) -> dict[str, Any]:
    """构建反复聆听页，直接复用底层循环强度榜单。"""
    p22_page = context['analytics_page_map'].get('P22') or {}
    payload = {
        'repeat_ranking': list(p22_page.get('repeat_ranking', []) or []),
    }
    summary_text = p22_page.get('summary_text') or '展示那些在真正点开它的日子里，你会一天反复听很多次的歌曲。'
    return _build_page_shell('P22', context['year'], summary_text, payload)


def _build_p23_page(context: _BuilderContext) -> dict[str, Any]:
    """构建年度之最专辑页，直接复用底层专辑冠军聚合结果。"""
    p23_page = context['analytics_page_map'].get('P23') or {}
    payload = {
        'top_album': p23_page.get('top_album'),
    }
    summary_text = p23_page.get('summary_text') or '这一页展示最能代表本年度陪伴感的专辑。'
    return _build_page_shell('P23', context['year'], summary_text, payload)


def _build_p24_page(context: _BuilderContext) -> dict[str, Any]:
    """构建年度最爱专辑榜页，直接复用底层专辑榜数据。"""
    p24_page = context['analytics_page_map'].get('P24') or {}
    payload = {
        'album_ranking': list(p24_page.get('album_ranking', []) or []),
    }
    summary_text = p24_page.get('summary_text') or '把这一年最常循环的专辑完整展开。'
    return _build_page_shell('P24', context['year'], summary_text, payload)


def _build_p25_page(context: _BuilderContext) -> dict[str, Any]:
    """构建年度歌曲页，按综合分挑出最能代表这一年的歌曲。"""
    song_of_year = _build_song_of_year(context['play_history'], context['year'])
    payload = {
        'song_of_year': song_of_year,
    }
    summary_text = '这一页展示最能代表你这一年的年度歌曲。'
    if song_of_year:
        summary_text = f"《{song_of_year['track_title']}》用更长时间的陪伴，成了你的年度歌曲。"
    return _build_page_shell('P25', context['year'], summary_text, payload)


def _build_p26_page(context: _BuilderContext) -> dict[str, Any]:
    """构建年度歌曲榜单页，直接复用底层歌曲榜。"""
    p26_page = context['analytics_page_map'].get('P26') or {}
    payload = {
        'song_ranking': list(p26_page.get('song_ranking', []) or []),
    }
    summary_text = p26_page.get('summary_text') or '把这一年最常回放、也最稳定陪伴你的歌曲完整展开。'
    return _build_page_shell('P26', context['year'], summary_text, payload)


def _build_p27_page(context: _BuilderContext) -> dict[str, Any]:
    """构建年度歌手页，复用底层歌手冠军榜。"""
    p27_page = context['analytics_page_map'].get('P27') or {}
    payload = {
        'artist_ranking': list(p27_page.get('artist_ranking', []) or []),
    }
    summary_text = p27_page.get('summary_text') or '展示今年最常陪着你的歌手，以及紧随其后的年度歌手榜。'
    return _build_page_shell('P27', context['year'], summary_text, payload)


def _build_p28_page(context: _BuilderContext) -> dict[str, Any]:
    """构建与年度歌手的轨迹页，复用底层歌手轨迹故事。"""
    p28_page = context['analytics_page_map'].get('P28') or {}
    payload = {
        'artist_journey': dict(p28_page.get('artist_journey') or {}),
    }
    summary_text = p28_page.get('summary_text') or '把你和年度歌手之间的首次相遇与高峰时刻，收束成一段轨迹。'
    return _build_page_shell('P28', context['year'], summary_text, payload)


def _build_p29_page(context: _BuilderContext) -> dict[str, Any]:
    """构建年度最爱歌手榜单页，复用底层完整榜单。"""
    p29_page = context['analytics_page_map'].get('P29') or {}
    payload = {
        'artist_ranking': list(p29_page.get('artist_ranking', []) or []),
    }
    summary_text = p29_page.get('summary_text') or '把这一年最常回到的歌手榜单明细完整展开。'
    return _build_page_shell('P29', context['year'], summary_text, payload)


def _build_p30_page(context: _BuilderContext) -> dict[str, Any]:
    """构建历年歌手榜页，仅展示近十年每年的冠军歌手。"""
    p30_page = context['analytics_page_map'].get('P30') or {}
    payload = {
        'yearly_artist_ranking': list(p30_page.get('yearly_artist_ranking', []) or []),
    }
    summary_text = p30_page.get('summary_text') or '按年份回看近十年里每一年的歌手冠军。'
    return _build_page_shell('P30', context['year'], summary_text, payload)


def _build_p31_page(context: _BuilderContext) -> dict[str, Any]:
    """构建元数据完成度与封面颜色桥页。"""
    p31_page = context['analytics_page_map'].get('P31') or {}
    # 覆盖率沿用底层分析口径；封面颜色这里补齐 treemap 展示所需字段，避免前端再次兜底。
    payload = {
        'coverage': dict(p31_page.get('coverage') or getattr(context['base_module'], 'EMPTY_COVERAGE', {})),
        'cover_color_summary': _build_cover_color_summary_for_page(context),
        'source_distribution': dict(p31_page.get('source_distribution') or getattr(context['base_module'], 'EMPTY_SOURCE_DISTRIBUTION', {})),
    }
    summary_text = p31_page.get('summary_text') or '先看曲库元数据覆盖率，再看已识别封面颜色的主色分布。'
    return _build_page_shell('P31', context['year'], summary_text, payload)


def _build_l01_page(context: _BuilderContext) -> dict[str, Any]:
    """构建歌曲库总览页。"""
    l01_page = context['analytics_page_map'].get('L01') or {}
    # 指标与覆盖率直接复用底层统计结果，保证移动端与分析页口径一致。
    payload = {
        'metrics': dict(l01_page.get('metrics') or getattr(context['base_module'], 'EMPTY_LIBRARY_METRICS', {})),
        'coverage': dict(l01_page.get('coverage') or getattr(context['base_module'], 'EMPTY_COVERAGE', {})),
        'source_distribution': dict(l01_page.get('source_distribution') or getattr(context['base_module'], 'EMPTY_SOURCE_DISTRIBUTION', {})),
    }
    summary_text = l01_page.get('summary_text') or '展示当前歌曲库规模、本年度新增规模与基础覆盖率。'
    return _build_page_shell('L01', context['year'], summary_text, payload)


def _build_l02_page(context: _BuilderContext) -> dict[str, Any]:
    """构建年度新增分析页，直接复用底层新增增长结果。"""
    l02_page = context['analytics_page_map'].get('L02') or {}
    payload = {
        'growth_metrics': l02_page.get('growth_metrics') or {},
        'monthly_growth': list(l02_page.get('monthly_growth', []) or []),
    }
    summary_text = l02_page.get('summary_text') or '展示本年度新增歌曲、歌手、专辑及月度新增趋势。'
    return _build_page_shell('L02', context['year'], summary_text, payload)


def _build_l03_page(context: _BuilderContext) -> dict[str, Any]:
    """构建歌曲库结构分析页，复用底层结构分布与双曲风口径。"""
    l03_page = context['analytics_page_map'].get('L03') or {}
    payload = {
        'language_distribution': list(l03_page.get('language_distribution', []) or []),
        'duration_distribution': list(l03_page.get('duration_distribution', []) or []),
        'genre_distribution': list(l03_page.get('genre_distribution', []) or []),
        'primary_genre_distribution': list(l03_page.get('primary_genre_distribution', []) or []),
        'weighted_genre_distribution': list(l03_page.get('weighted_genre_distribution', []) or []),
    }
    summary_text = l03_page.get('summary_text') or '展示曲库语种、时长与曲风结构分布。'
    return _build_page_shell('L03', context['year'], summary_text, payload)


def _build_l04a_page(context: _BuilderContext) -> dict[str, Any]:
    """构建曲库歌手榜页。"""
    l04_page = context['analytics_page_map'].get('L04A') or {}
    payload = {
        'ranking': _pad_ranking_to_ten(list(l04_page.get('ranking', []) or []), metric_mode='library'),
    }
    summary_text = l04_page.get('summary_text') or '展示全曲库歌手榜 Top10。'
    return _build_page_shell('L04A', context['year'], summary_text, payload)


def _build_l04b_page(context: _BuilderContext) -> dict[str, Any]:
    """构建年度新增歌手榜页。"""
    l04_page = context['analytics_page_map'].get('L04B') or {}
    payload = {
        'ranking': _pad_ranking_to_ten(list(l04_page.get('ranking', []) or []), metric_mode='new'),
    }
    summary_text = l04_page.get('summary_text') or '展示年度新增歌手榜 Top10。'
    return _build_page_shell('L04B', context['year'], summary_text, payload)


def _build_p32_page(context: _BuilderContext) -> dict[str, Any]:
    """构建年度总结四格页，复用底层总结卡片。"""
    p32_page = context['analytics_page_map'].get('P32') or {}
    payload = {
        'summary_cards': list(p32_page.get('summary_cards', []) or []),
    }
    summary_text = p32_page.get('summary_text') or '用四张总结卡收束这一年的音乐回放。'
    return _build_page_shell('P32', context['year'], summary_text, payload)


def _build_page_shell(page_id: str, year: int, summary_text: str, payload: dict[str, Any]) -> dict[str, Any]:
    """统一补齐页面公共字段。"""
    return {
        'page_id': page_id,
        'template': PAGE_TEMPLATES[page_id],
        'section': PAGE_SECTIONS[page_id],
        'title': PAGE_TITLES[page_id],
        'year': year,
        'summary_text': summary_text,
        'payload': payload,
    }


def _find_first_track(play_history: list[dict[str, Any]]) -> dict[str, Any] | None:
    """找到全历史最早播放记录。"""
    dated_rows = []
    for row in play_history:
        parsed_dt = _parse_datetime(row.get('played_at'))
        if parsed_dt is None:
            continue
        dated_rows.append((parsed_dt, row))

    if dated_rows:
        first_dt, first_row = min(dated_rows, key=lambda item: item[0])
        return {
            'played_at': first_dt.strftime('%Y-%m-%d %H:%M:%S'),
            'track_title': first_row.get('track_title') or '未知歌曲',
            'artist_display': first_row.get('artist_display') or '未知歌手',
            'album_display': first_row.get('album_display') or '未知专辑',
            'cover_path': first_row.get('cover_path'),
        }

    if not play_history:
        return None

    fallback_row = play_history[0]
    return {
        'played_at': fallback_row.get('played_at'),
        'track_title': fallback_row.get('track_title') or '未知歌曲',
        'artist_display': fallback_row.get('artist_display') or '未知歌手',
        'album_display': fallback_row.get('album_display') or '未知专辑',
        'cover_path': fallback_row.get('cover_path'),
    }


def _calculate_companionship_days(first_track: dict[str, Any] | None, year: int) -> int:
    """按报告年年末估算陪伴天数。"""
    if not first_track:
        return 0
    first_dt = _parse_datetime(first_track.get('played_at'))
    if first_dt is None or year <= 0:
        return 0
    report_end = date(year, 12, 31)
    return max(0, (report_end - first_dt.date()).days + 1)


def _calculate_companionship_years(first_track: dict[str, Any] | None, year: int) -> int:
    """按自然年估算相伴年数。"""
    if not first_track:
        return 0
    first_dt = _parse_datetime(first_track.get('played_at'))
    if first_dt is None or year <= 0:
        return 0
    return max(1, year - first_dt.year + 1)


def _build_song_of_year(play_history: list[dict[str, Any]], year: int) -> dict[str, Any] | None:
    """按综合分计算年度歌曲，直接复用当前稳定口径。"""
    yearly_rows = [row for row in play_history if row.get('year') == year]
    if not yearly_rows:
        return None

    buckets: dict[str, dict[str, Any]] = {}
    for row in yearly_rows:
        track_key = _row_track_key(row)
        if not track_key:
            continue
        bucket = buckets.setdefault(track_key, {
            'track_title': row.get('track_title') or '未知歌曲',
            'artist_display': row.get('artist_display') or '未知歌手',
            'album_display': row.get('album_display') or '未知专辑',
            'play_count': 0,
            'active_days': 0,
            'listened_sec': 0,
            'cover_path': row.get('cover_path'),
            'peak_month': None,
        })
        bucket['play_count'] += _row_play_total(row)
        bucket['active_days'] += int(row.get('active_days') or 0)
        bucket['listened_sec'] += _row_listened_sec(row)
        if not bucket['cover_path'] and row.get('cover_path'):
            bucket['cover_path'] = row.get('cover_path')
        peak_month = _resolve_month_from_row(row)
        if peak_month is not None:
            bucket['peak_month'] = peak_month if bucket['peak_month'] is None else min(bucket['peak_month'], peak_month)

    ranking = []
    for item in buckets.values():
        listened_hours = item['listened_sec'] / 3600
        score = round(item['play_count'] * 0.55 + item['active_days'] * 0.30 + listened_hours * 0.15, 3)
        ranking.append({
            **item,
            'score': score,
        })

    return sorted(
        ranking,
        key=lambda item: (
            -item['score'],
            -item['play_count'],
            -item['active_days'],
            -item['listened_sec'],
            item['track_title'],
        ),
    )[0] if ranking else None


def _filter_year_rows(rows: list[dict[str, Any]], year: int) -> list[dict[str, Any]]:
    """统一过滤指定年份的数据。"""
    return [row for row in rows if row.get('year') == year]


def _row_track_key(row: dict[str, Any]) -> str | None:
    """统一解析歌曲键，优先 track_id，缺失时回退歌名。"""
    for raw_value in (row.get('track_id'), row.get('track_title')):
        if isinstance(raw_value, str) and raw_value.strip():
            return raw_value.strip()
    return None


def _row_artist_value(row: dict[str, Any]) -> str | None:
    """统一解析歌手展示名。"""
    artist_display = row.get('artist_display')
    if isinstance(artist_display, str) and artist_display.strip():
        return artist_display.strip()
    return None


def _row_play_total(row: dict[str, Any]) -> int:
    """统一解析一条记录的播放次数。"""
    return int(row.get('play_count') or row.get('play_total') or 1)


def _row_listened_sec(row: dict[str, Any]) -> int:
    """统一解析一条记录的收听秒数。"""
    return int(row.get('listened_sec') or 0)


def _resolve_first_year_map(rows: list[dict[str, Any]], key_builder) -> dict[str, int]:
    """按任意键生成“首次出现年份”映射。"""
    first_year_map: dict[str, int] = {}
    for row in rows:
        entity_key = key_builder(row)
        row_year = row.get('year') if isinstance(row.get('year'), int) else _resolve_row_year(row)
        if not entity_key or row_year is None:
            continue
        if entity_key not in first_year_map:
            first_year_map[entity_key] = row_year
        else:
            first_year_map[entity_key] = min(first_year_map[entity_key], row_year)
    return first_year_map


def _resolve_row_year(row: dict[str, Any]) -> int | None:
    """在缺少年份字段时，从时间戳兜底解析年份。"""
    parsed_dt = _parse_datetime(row.get('played_at'))
    return parsed_dt.year if parsed_dt else None


def _resolve_month_from_row(row: dict[str, Any]) -> int | None:
    """优先从时间戳解析月份，缺失时再读 month。"""
    played_at = _parse_datetime(row.get('played_at'))
    if played_at is not None:
        return played_at.month
    month = row.get('month') or row.get('start_month')
    return month if isinstance(month, int) and 1 <= month <= 12 else None


def _resolve_weekday_from_row(row: dict[str, Any]) -> int | None:
    """解析周几，统一采用 1..7（周一到周日）。"""
    weekday = row.get('start_weekday')
    if isinstance(weekday, int) and 1 <= weekday <= 7:
        return weekday
    parsed_dt = _parse_datetime(row.get('played_at'))
    return parsed_dt.isoweekday() if parsed_dt else None


def _resolve_hour_from_row(row: dict[str, Any]) -> int | None:
    """解析小时字段，供时段页复用。"""
    hour = row.get('start_hour')
    if isinstance(hour, int) and 0 <= hour <= 23:
        return hour
    parsed_dt = _parse_datetime(row.get('played_at'))
    return parsed_dt.hour if parsed_dt else None


def _resolve_date_key(row: dict[str, Any]) -> str | None:
    """把播放记录统一成 YYYY-MM-DD。"""
    if isinstance(row.get('start_date_key'), str) and row.get('start_date_key').strip():
        return row['start_date_key'].strip()
    parsed_dt = _parse_datetime(row.get('played_at'))
    return parsed_dt.strftime('%Y-%m-%d') if parsed_dt else None


def _parse_datetime(raw_value: Any) -> datetime | None:
    """兼容常见时间字符串格式。"""
    if not isinstance(raw_value, str) or not raw_value.strip():
        return None
    normalized_value = raw_value.strip().replace('T', ' ')
    for fmt in ('%Y-%m-%d %H:%M:%S', '%Y-%m-%d %H:%M', '%Y-%m-%d'):
        try:
            return datetime.strptime(normalized_value, fmt)
        except ValueError:
            continue
    return None


def _parse_date_key(date_key: str) -> date | None:
    """解析 YYYY-MM-DD 日期串。"""
    try:
        return datetime.strptime(date_key, '%Y-%m-%d').date()
    except ValueError:
        return None


def _resolve_language_for_row(row: dict[str, Any], context: _BuilderContext) -> str | None:
    """优先从播放行取语种，缺失时回退到曲库维表。"""
    for field_name in ('language_norm', 'language', 'languageTag'):
        field_value = row.get(field_name)
        if isinstance(field_value, str) and field_value.strip():
            return field_value.strip()
    track_row = context['track_library_map'].get(row.get('track_id'))
    if not track_row:
        return None
    for field_name in ('language_norm', 'language', 'languageTag'):
        field_value = track_row.get(field_name)
        if isinstance(field_value, str) and field_value.strip():
            return field_value.strip()
    return None


def _is_foreign_language(language_name: str | None) -> bool:
    """判断语种是否视为外语。"""
    if not language_name:
        return False
    normalized = language_name.strip().lower()
    chinese_values = {'中文', '国语', '华语', 'mandarin', 'zh', 'chinese'}
    return normalized not in chinese_values


def _resolve_genre_for_row(row: dict[str, Any], context: _BuilderContext) -> str | None:
    """优先用映射表主曲风，缺失时回退播放行和曲库维表字段。"""
    track_id = row.get('track_id')
    primary_genre_map = context.get('primary_genre_map', {})
    if track_id in primary_genre_map and _has_value(primary_genre_map[track_id]):
        return str(primary_genre_map[track_id]).strip()
    for field_name in ('primary_genre', 'genre_name', 'genre_norm', 'genre'):
        field_value = row.get(field_name)
        if _has_value(field_value):
            return str(field_value).strip()
    track_row = context['track_library_map'].get(track_id)
    if track_row:
        for field_name in ('primary_genre', 'genre_name', 'genre_norm', 'genre'):
            field_value = track_row.get(field_name)
            if _has_value(field_value):
                return str(field_value).strip()
    return None


def _resolve_entry_source(row: dict[str, Any]) -> str:
    """统一解析播放来源字段，兼容 play_source 与 entry_source。"""
    return str(row.get('play_source') or row.get('entry_source') or row.get('entrySource') or '').strip().lower()


def _aggregate_year_genre_ranking(
    context: _BuilderContext,
    rows: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """按年度播放行聚合主曲风榜，并把多候选曲风按置信度折成加权播放量。"""
    target_rows = rows if rows is not None else _filter_year_rows(context['play_history'], context['year'])
    buckets: dict[str, dict[str, Any]] = {}
    for row in target_rows:
        play_total = _row_play_total(row)
        track_key = _row_track_key(row)
        genre_name = _resolve_genre_for_row(row, context)
        if genre_name:
            primary_bucket = buckets.setdefault(genre_name, {
                'genre_name': genre_name,
                'primary_play_total': 0,
                'weighted_play_total': 0.0,
                'track_keys': set(),
                'confidence_numerator': 0.0,
                'confidence_denominator': 0,
            })
            primary_bucket['primary_play_total'] += play_total
            if track_key:
                primary_bucket['track_keys'].add(track_key)

        matches = context.get('genre_matches_by_track', {}).get(row.get('track_id'), [])
        if matches:
            for match in matches:
                match_genre_name = match['genre_name']
                match_score = float(match['match_score'])
                weighted_bucket = buckets.setdefault(match_genre_name, {
                    'genre_name': match_genre_name,
                    'primary_play_total': 0,
                    'weighted_play_total': 0.0,
                    'track_keys': set(),
                    'confidence_numerator': 0.0,
                    'confidence_denominator': 0,
                })
                weighted_bucket['weighted_play_total'] += play_total * match_score
                weighted_bucket['confidence_numerator'] += match_score * play_total
                weighted_bucket['confidence_denominator'] += play_total
                if track_key:
                    weighted_bucket['track_keys'].add(track_key)
            continue

        if not genre_name:
            continue
        fallback_bucket = buckets.setdefault(genre_name, {
            'genre_name': genre_name,
            'primary_play_total': 0,
            'weighted_play_total': 0.0,
            'track_keys': set(),
            'confidence_numerator': 0.0,
            'confidence_denominator': 0,
        })
        fallback_bucket['weighted_play_total'] += play_total
        fallback_bucket['confidence_numerator'] += play_total
        fallback_bucket['confidence_denominator'] += play_total
        if track_key:
            fallback_bucket['track_keys'].add(track_key)

    ranking = [
        {
            'genre_name': item['genre_name'],
            'genre_name_zh': _resolve_genre_label_zh(item['genre_name'], context),
            'primary_play_total': item['primary_play_total'],
            'weighted_play_total': round(item['weighted_play_total'], 2),
            # 兼容旧字段名，前端未完全切换前仍可直接复用。
            'weighted_track_count': round(item['weighted_play_total'], 2),
            'track_count': len(item['track_keys']),
            'confidence_score': round(
                item['confidence_numerator'] / item['confidence_denominator'],
                4,
            ) if item['confidence_denominator'] else 0.0,
        }
        for item in sorted(
            buckets.values(),
            key=lambda item: (-item['weighted_play_total'], -item['primary_play_total'], item['genre_name']),
        )
    ]
    return ranking


def _resolve_season_from_row(row: dict[str, Any]) -> str | None:
    """按月份映射四季。"""
    month = _resolve_month_from_row(row)
    if month in (3, 4, 5):
        return 'spring'
    if month in (6, 7, 8):
        return 'summer'
    if month in (9, 10, 11):
        return 'autumn'
    if month in (12, 1, 2):
        return 'winter'
    return None


def _build_track_spotlight(
    rows: list[dict[str, Any]],
    context: _BuilderContext,
    sort_by: str = 'score',
) -> dict[str, Any] | None:
    """把一组播放行聚合成代表歌曲。"""
    if not rows:
        return None
    buckets: dict[str, dict[str, Any]] = {}
    for row in rows:
        track_key = _row_track_key(row)
        if not track_key:
            continue
        bucket = buckets.setdefault(track_key, {
            'track_title': row.get('track_title') or '未知歌曲',
            'artist_display': row.get('artist_display') or '未知歌手',
            'album_display': row.get('album_display') or '未知专辑',
            'play_count': 0,
            'active_days': 0,
            'listened_sec': 0,
            'cover_path': row.get('cover_path'),
            'track_id': row.get('track_id'),
        })
        bucket['play_count'] += _row_play_total(row)
        bucket['active_days'] += int(row.get('active_days') or 0)
        bucket['listened_sec'] += _row_listened_sec(row)
        if not bucket['cover_path'] and row.get('cover_path'):
            bucket['cover_path'] = row.get('cover_path')

    ranking = []
    for item in buckets.values():
        listened_hours = item['listened_sec'] / 3600
        score = round(item['play_count'] * 0.55 + item['active_days'] * 0.30 + listened_hours * 0.15, 3)
        ranking.append({
            **item,
            'score': score,
        })

    if not ranking:
        return None

    if sort_by == 'listened_sec':
        ranking = sorted(ranking, key=lambda item: (-item['listened_sec'], -item['play_count'], item['track_title']))
    elif sort_by == 'play_count':
        ranking = sorted(
            ranking,
            key=lambda item: (-item['play_count'], -item['active_days'], -item['listened_sec'], item['track_title']),
        )
    else:
        ranking = sorted(
            ranking,
            key=lambda item: (-item['score'], -item['play_count'], -item['active_days'], item['track_title']),
        )
    winner = dict(ranking[0])
    winner.pop('track_id', None)
    return winner


def _extract_keywords(context: _BuilderContext) -> list[dict[str, Any]]:
    """从本年听过歌曲的歌词切片与歌名中提取年度关键词。"""
    token_counter: Counter[str] = Counter()
    representative_map: dict[str, dict[str, Any]] = {}
    year_track_keys = {
        _row_track_key(row)
        for row in _filter_year_rows(context['play_history'], context['year'])
        if _row_track_key(row)
    }
    track_rows = [
        row for row in context['library_tracks']
        if row.get('track_id') in year_track_keys
    ] or [
        row for row in _filter_year_rows(context['play_history'], context['year'])
    ]
    # 先汇总本年歌曲涉及到的歌手别名，后续统一从关键词里剔除歌手名。
    blocked_artist_tokens = _collect_year_artist_keyword_aliases(track_rows)

    for row in track_rows:
        # 标题里经常混入 “歌手 - 标题 / 【VOCALOID COVER】/（翻自 xxx）” 之类元信息，
        # 先清洗掉这部分，再参与关键词提取。
        source_pairs = [
            ('lyric', row.get('lyric_text') or ''),
            ('title', _sanitize_title_for_keyword_source(row.get('track_title') or '', row.get('artist_display'))),
        ]
        for source_type, source_text in source_pairs:
            tokens = {
                token
                for token in _extract_tokens(str(source_text or ''), source_type=source_type)
                if token not in blocked_artist_tokens
            }
            for token in tokens:
                token_counter[token] += 1
                if token not in representative_map:
                    representative_map[token] = {
                        'track_title': row.get('track_title') or '未知歌曲',
                        'artist_display': row.get('artist_display') or '未知歌手',
                        'source_type': source_type,
                    }

    return [
        {
            'keyword': token,
            'count': count,
            'representative_track_title': representative_map[token]['track_title'],
            'representative_artist_display': representative_map[token]['artist_display'],
            'source_type': representative_map[token]['source_type'],
        }
        for token, count in token_counter.most_common(12)
    ]        


def _normalize_keyword_compare_text(value: Any) -> str:
    """把标题/歌手名归一成便于比较的形式，统一忽略大小写与多余空白。"""
    normalized = str(value or '').strip().lower()
    normalized = re.sub(r'\s+', ' ', normalized)
    return normalized


def _split_artist_display_for_keywords(raw_artist_display: Any) -> list[str]:
    """把歌手展示串拆成多个名字，供标题清洗与歌手词过滤共用。"""
    if not isinstance(raw_artist_display, str) or not raw_artist_display.strip():
        return []
    normalized_value = str(raw_artist_display).replace('；', ';').replace('／', '/')
    normalized_value = re.sub(r'(?i)\s+(?:feat\.?|ft\.?|vs\.?)\s+', ';', normalized_value)
    normalized_value = normalized_value.replace('&', ';').replace('、', ';').replace(',', ';').replace('/', ';')

    result = []
    seen = set()
    for part in normalized_value.split(';'):
        normalized_part = str(part or '').strip()
        if not normalized_part or normalized_part in seen:
            continue
        seen.add(normalized_part)
        result.append(normalized_part)
    return result


def _build_artist_keyword_aliases(raw_artist_display: Any) -> set[str]:
    """从歌手名生成可过滤的别名集合，兼顾完整名字与中文主体词。"""
    aliases: set[str] = set()
    for artist_name in _split_artist_display_for_keywords(raw_artist_display):
        normalized_name = _normalize_keyword_compare_text(artist_name)
        if normalized_name:
            aliases.add(normalized_name)
        for chinese_token in CHINESE_RE.findall(artist_name):
            if chinese_token not in STOPWORDS:
                aliases.add(chinese_token)
    return aliases


def _collect_year_artist_keyword_aliases(rows: list[dict[str, Any]]) -> set[str]:
    """汇总本年歌曲的歌手别名，保证关键词云不再把歌手名当作主题词。"""
    aliases: set[str] = set()
    for row in rows:
        aliases.update(_build_artist_keyword_aliases(row.get('artist_display')))
    return aliases


def _should_strip_title_segment(segment_text: str, artist_aliases: set[str]) -> bool:
    """判断标题括号片段是否属于歌手/翻唱/版本等元信息。"""
    normalized_segment = _normalize_keyword_compare_text(segment_text)
    if not normalized_segment:
        return True

    metadata_markers = (
        'cover', 'vocaloid', 'feat', 'ft', 'vs', 'ver', 'version', 'remix',
        '翻自', '翻唱', '原唱', '调教', '本家', '作词', '作曲', '编曲',
    )
    if any(marker in normalized_segment for marker in metadata_markers):
        return True
    return any(alias and alias in normalized_segment for alias in artist_aliases)


def _sanitize_title_for_keyword_source(track_title: Any, artist_display: Any) -> str:
    """清洗歌名里的歌手前缀与元信息，只保留适合做关键词的标题主体。"""
    title_text = str(track_title or '')
    if not title_text.strip():
        return ''

    artist_aliases = _build_artist_keyword_aliases(artist_display)
    full_artist_names = {
        _normalize_keyword_compare_text(artist_name)
        for artist_name in _split_artist_display_for_keywords(artist_display)
    }

    prefix_match = TITLE_PREFIX_DELIMITER_RE.match(title_text)
    if prefix_match and _normalize_keyword_compare_text(prefix_match.group('prefix')) in full_artist_names:
        title_text = prefix_match.group('body')

    def _replace_bracketed_segment(match: re.Match[str]) -> str:
        segment = match.group(0)[1:-1]
        return ' ' if _should_strip_title_segment(segment, artist_aliases) else f' {segment} '

    title_text = BRACKETED_SEGMENT_RE.sub(_replace_bracketed_segment, title_text)
    title_text = re.sub(r'(?i)\b(?:vocaloid|cover|feat|ft|vs|ver|version|remix)\b', ' ', title_text)
    title_text = re.sub(r'(?:翻自|翻唱|原唱|调教|本家|作词|作曲|编曲)', ' ', title_text)
    return re.sub(r'\s+', ' ', title_text).strip()


def _extract_tokens(text: str, source_type: str = 'lyric') -> list[str]:
    """做一版轻量关键词提取：歌词优先切中文/英文词，标题也单独参与。"""
    normalized_text = text.replace('_', ' ').replace('-', ' ')
    normalized_text = _clean_keyword_noise_text(normalized_text)
    if not normalized_text.strip():
        return []
    tokens = []
    for token in CHINESE_RE.findall(normalized_text):
        if token not in STOPWORDS:
            tokens.append(token)
    for token in LATIN_RE.findall(normalized_text):
        normalized = token.lower()
        if normalized not in STOPWORDS:
            tokens.append(normalized)
    if source_type == 'title':
        return tokens[:4]
    return tokens


def _is_keyword_noise_text(text: str) -> bool:
    """过滤假歌词、噪音元数据与纯技术串。"""
    normalized = re.sub(r'\s+', '', str(text or '')).lower()
    if not normalized:
        return True
    if normalized.startswith('lavf'):
        return True
    if normalized in {'作词', '作曲', '编曲'}:
        return True
    return False


def _clean_keyword_noise_text(text: str) -> str:
    """移除 Lavf、作词作曲等噪声片段，但保留同一行里的真实歌词。"""
    cleaned_text = re.sub(r'Lavf\d+(?:\.\d+)*', ' ', str(text or ''), flags=re.IGNORECASE)
    cleaned_text = re.sub(r'\b(?:作词|作曲|编曲|词|曲)\b', ' ', cleaned_text)
    return cleaned_text


def _resolve_bpm_for_row(row: dict[str, Any], context: _BuilderContext) -> int | None:
    """优先使用播放行 BPM，缺失时回退到曲库维表。"""
    bpm_value = row.get('bpm')
    if isinstance(bpm_value, (int, float)):
        return int(round(bpm_value))
    track_row = context['track_library_map'].get(row.get('track_id'))
    if not track_row:
        return None
    track_bpm = track_row.get('bpm')
    if isinstance(track_bpm, (int, float)):
        return int(round(track_bpm))
    return None


def _weekday_label(weekday: int) -> str:
    """输出中文星期标签。"""
    return {
        1: '周一',
        2: '周二',
        3: '周三',
        4: '周四',
        5: '周五',
        6: '周六',
        7: '周日',
    }[weekday]


def _resolve_heat_intensity(play_total: int, max_count: int) -> int:
    """把日历播放数折成 1~4 档热度。"""
    if max_count <= 0 or play_total <= 0:
        return 0
    ratio = play_total / max_count
    if ratio >= 0.75:
        return 4
    if ratio >= 0.5:
        return 3
    if ratio >= 0.25:
        return 2
    return 1


def _calculate_longest_streak(sorted_date_keys: list[str]) -> int:
    """计算最长连续活跃天数。"""
    if not sorted_date_keys:
        return 0
    parsed_dates = [parsed_date for date_key in sorted_date_keys if (parsed_date := _parse_date_key(date_key))]
    if not parsed_dates:
        return 0
    longest = 1
    current = 1
    for previous_date, current_date in zip(parsed_dates, parsed_dates[1:]):
        if (current_date - previous_date).days == 1:
            current += 1
            longest = max(longest, current)
        else:
            current = 1
    return longest


def _build_cover_color_summary_for_page(
    context: _BuilderContext,
    library_tracks: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """把底层封面颜色统计补齐成前端可直接画 treemap 的结构。"""
    color_summary_fn = getattr(context['base_module'], '_calculate_cover_color_summary', None)
    effective_library_tracks = library_tracks if library_tracks is not None else context['library_tracks']
    base_summary = color_summary_fn(effective_library_tracks) if callable(color_summary_fn) else {
        'counted_track_total': 0,
        'excluded_track_total': 0,
        'top_colors': [],
    }
    treemap_total = int(base_summary.get('counted_track_total') or 0)
    normalized_top_colors = []
    for item in list(base_summary.get('top_colors', []) or []):
        track_count = int(item.get('track_count') or 0)
        color_hex = str(item.get('color_hex') or '').strip()
        normalized_top_colors.append({
            **item,
            'color_hex': color_hex,
            'share_ratio': round(track_count / treemap_total, 4) if treemap_total else 0.0,
            'tone_label': _describe_color_tone(color_hex),
        })

    top_colors = normalized_top_colors[:5]
    remaining_colors = normalized_top_colors[5:]
    if remaining_colors:
        other_track_total = sum(int(item.get('track_count') or 0) for item in remaining_colors)
        top_colors.append({
            'color_hex': '#CFCFD6',
            'track_count': other_track_total,
            'representative_track_title': '其余颜色分布',
            'representative_artist_display': '',
            'representative_cover_path': None,
            'share_ratio': round(other_track_total / treemap_total, 4) if treemap_total else 0.0,
            'tone_label': '其他颜色',
            'is_other_bucket': True,
        })
    return {
        **base_summary,
        'treemap_total': treemap_total,
        'top_colors': top_colors,
    }


def _pad_ranking_to_ten(ranking: list[dict[str, Any]], metric_mode: str) -> list[dict[str, Any]]:
    """如果真实数据不足 10 条，就补显式占位，避免页面结构塌陷。"""
    normalized_ranking = list(ranking[:10])
    while len(normalized_ranking) < 10:
        next_rank = len(normalized_ranking) + 1
        if metric_mode == 'library':
            normalized_ranking.append({
                'rank': next_rank,
                'artist_display': f'待补位歌手 {next_rank}',
                'track_total': 0,
                'album_total': 0,
                'top_track_title': '暂无代表作',
                'is_placeholder': True,
            })
        else:
            normalized_ranking.append({
                'rank': next_rank,
                'artist_display': f'待补位歌手 {next_rank}',
                'new_track_total': 0,
                'new_album_total': 0,
                'highlight_tag': '待补位',
                'is_placeholder': True,
            })
    return normalized_ranking


def _build_genre_label_map() -> dict[str, str]:
    """尽量从历史 worktree 的曲风维表查询脚本中加载英文到中文映射。"""
    if not WORKTREE_DB_BUILD_YEAR_REPORT_PATH.exists():
        return {}
    query_module_path = WORKTREE_DB_BUILD_YEAR_REPORT_PATH.with_name('year_report_queries.py')
    if not query_module_path.exists():
        return {}
    # 当前仓库不直接内建维表脚本，这里只做轻量 DB 查询，不做大范围依赖耦合。
    try:
        db_config = _load_db_config('mssql+pymssql://sa:ifwlzs@192.168.2.156:1433/db_tgmsg')
        conn = _connect_db(db_config)
    except Exception:
        return {}
    try:
        cursor = conn.cursor(as_dict=True)
        cursor.execute(
            """
            SELECT genre_en, genre_zh
            FROM dbo.ods_jumusic_genre_dim
            WHERE is_enabled = 1
              AND genre_zh IS NOT NULL
              AND LTRIM(RTRIM(genre_zh)) <> ''
            """
        )
        return {
            str(row['genre_en']).strip(): str(row['genre_zh']).strip()
            for row in cursor.fetchall()
            if _has_value(row.get('genre_en')) and _has_value(row.get('genre_zh'))
        }
    except Exception:
        return {}
    finally:
        conn.close()


def _resolve_genre_label_zh(genre_name: str, context: _BuilderContext) -> str:
    """把 `Pop---J-pop` 这类英文路径尽量映射成中文。"""
    label_map = context.get('genre_label_map', {})
    if genre_name in GENRE_LABEL_FALLBACKS:
        return GENRE_LABEL_FALLBACKS[genre_name]
    if genre_name in label_map:
        return label_map[genre_name]
    if '---' in genre_name:
        parent_name, child_name = genre_name.split('---', 1)
        if child_name in GENRE_LABEL_FALLBACKS:
            return GENRE_LABEL_FALLBACKS[child_name]
        child_label = label_map.get(child_name)
        parent_label = label_map.get(parent_name)
        if child_label:
            return child_label
        if parent_label:
            return parent_label
    return genre_name


def _describe_color_tone(color_hex: str) -> str:
    """根据颜色的 HLS 粗分一个更适合文案展示的色调名称。"""
    rgb = _parse_hex_color(color_hex)
    if rgb is None:
        return '未命名色'
    red, green, blue = rgb
    hue, lightness, saturation = _rgb_to_hls(red, green, blue)
    if lightness >= 0.82:
        return '奶油白'
    if saturation <= 0.14:
        return '雾灰'
    if 15 <= hue < 40:
        return '奶杏'
    if 40 <= hue < 65:
        return '暖金'
    if 65 <= hue < 150:
        return '森绿'
    if 150 <= hue < 210:
        return '青雾'
    if 210 <= hue < 255:
        return '雾蓝'
    if 255 <= hue < 320:
        return '紫雾'
    return '莓红'


def _parse_hex_color(color_hex: str) -> tuple[int, int, int] | None:
    """解析 #RRGGBB 十六进制颜色。"""
    if not isinstance(color_hex, str):
        return None
    normalized = color_hex.strip().lstrip('#')
    if len(normalized) != 6 or any(char not in '0123456789abcdefABCDEF' for char in normalized):
        return None
    return (
        int(normalized[0:2], 16),
        int(normalized[2:4], 16),
        int(normalized[4:6], 16),
    )


def _rgb_to_hls(red: int, green: int, blue: int) -> tuple[float, float, float]:
    """把 RGB 转成 HLS，Hue 输出为 0~360。"""
    red_ratio = red / 255
    green_ratio = green / 255
    blue_ratio = blue / 255
    max_value = max(red_ratio, green_ratio, blue_ratio)
    min_value = min(red_ratio, green_ratio, blue_ratio)
    lightness = (max_value + min_value) / 2
    if max_value == min_value:
        return 0.0, lightness, 0.0
    delta = max_value - min_value
    saturation = delta / (1 - abs(2 * lightness - 1)) if lightness not in (0, 1) else 0.0
    if max_value == red_ratio:
        hue = ((green_ratio - blue_ratio) / delta) % 6
    elif max_value == green_ratio:
        hue = ((blue_ratio - red_ratio) / delta) + 2
    else:
        hue = ((red_ratio - green_ratio) / delta) + 4
    return hue * 60, lightness, saturation


def _build_calendar_heatmap_columns(
    year: int,
    day_counter: Counter[str],
    max_count: int,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    """构建全年周列热力图：月份在横轴，周几在纵轴。"""
    if year <= 0:
        return [], [], []
    start_date = date(year, 1, 1)
    end_date = date(year, 12, 31)
    grid_start = start_date - timedelta(days=start_date.isoweekday() - 1)
    grid_end = end_date + timedelta(days=7 - end_date.isoweekday())

    heatmap_columns = []
    heatmap_cells = []
    cursor = grid_start
    week_index = 0
    while cursor <= grid_end:
        week_cells = []
        for offset in range(7):
            current_date = cursor + timedelta(days=offset)
            in_year = start_date <= current_date <= end_date
            date_key = current_date.strftime('%Y-%m-%d')
            play_total = day_counter.get(date_key, 0) if in_year else 0
            cell = {
                'date': date_key,
                'play_total': play_total,
                'intensity': _resolve_heat_intensity(play_total, max_count),
                'month': current_date.month,
                'weekday': current_date.isoweekday(),
                'in_year': in_year,
            }
            week_cells.append(cell)
            heatmap_cells.append(cell)
        heatmap_columns.append({
            'week_index': week_index,
            'week_label': f'W{week_index + 1:02d}',
            'cells': week_cells,
        })
        cursor += timedelta(days=7)
        week_index += 1

    month_labels = [
        {
            'month': month,
            'label': f'{month}月',
            'week_index': (date(year, month, 1) - grid_start).days // 7,
        }
        for month in range(1, 13)
    ]
    return heatmap_columns, heatmap_cells, month_labels


def _time_bucket_descriptors() -> list[dict[str, str]]:
    """统一维护细粒度时段定义，保证构建端与展示端口径一致。"""
    return [
        {'bucket_key': 'after_midnight', 'bucket_label': '午夜', 'hour_range_label': '00:00-02:59'},
        {'bucket_key': 'pre_dawn', 'bucket_label': '凌晨', 'hour_range_label': '03:00-05:59'},
        {'bucket_key': 'morning', 'bucket_label': '早晨', 'hour_range_label': '06:00-09:59'},
        {'bucket_key': 'late_morning', 'bucket_label': '上午', 'hour_range_label': '10:00-11:59'},
        {'bucket_key': 'noon', 'bucket_label': '午间', 'hour_range_label': '12:00-13:59'},
        {'bucket_key': 'afternoon', 'bucket_label': '下午', 'hour_range_label': '14:00-17:59'},
        {'bucket_key': 'evening', 'bucket_label': '傍晚', 'hour_range_label': '18:00-20:59'},
        {'bucket_key': 'night', 'bucket_label': '夜间', 'hour_range_label': '21:00-23:59'},
    ]


def _resolve_time_bucket_from_hour(hour: int) -> str:
    """按更细颗粒度的时间段映射小时。"""
    if 0 <= hour <= 2:
        return 'after_midnight'
    if 3 <= hour <= 5:
        return 'pre_dawn'
    if 6 <= hour <= 9:
        return 'morning'
    if 10 <= hour <= 11:
        return 'late_morning'
    if 12 <= hour <= 13:
        return 'noon'
    if 14 <= hour <= 17:
        return 'afternoon'
    if 18 <= hour <= 20:
        return 'evening'
    return 'night'


def _has_value(value: Any) -> bool:
    """统一判断字段是否有可用值。"""
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    return True


def _load_raw_report_from_json(path: str) -> dict[str, Any]:
    """从原始 JSON 文件读取年报输入。"""
    return json.loads(Path(path).read_text(encoding='utf-8'))


def _parse_db_url(db_url: str) -> dict[str, Any]:
    """解析 `mssql+pymssql://user:pass@host:1433/db` 形式的连接串。"""
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


def _load_db_config(db_url: str | None = None) -> dict[str, Any]:
    """优先读 URL，其次兼容当前 ETL 已使用的环境变量。"""
    resolved_url = db_url or os.environ.get('JUMUSIC_DB_URL')
    if resolved_url:
        return _parse_db_url(resolved_url)
    return {
        'server': os.environ['JUMUSIC_DB_SERVER'],
        'port': int(os.environ.get('JUMUSIC_DB_PORT', '1433')),
        'user': os.environ['JUMUSIC_DB_USER'],
        'password': os.environ['JUMUSIC_DB_PASSWORD'],
        'database': os.environ['JUMUSIC_DB_DATABASE'],
    }


def _connect_db(db_config: dict[str, Any]):
    """建立 SQL Server 连接。"""
    try:
        import pymssql
    except ModuleNotFoundError as exc:
        raise RuntimeError('pymssql is required to connect to SQL Server') from exc
    return pymssql.connect(
        server=db_config['server'],
        port=db_config.get('port', 1433),
        user=db_config['user'],
        password=db_config['password'],
        database=db_config['database'],
        charset='utf8',
        tds_version='7.0',
    )


def _load_raw_report_from_db(year: int, db_url: str | None = None) -> dict[str, Any]:
    """从 ODS 表提取移动端 contract 所需的最小真实输入。"""
    db_config = _load_db_config(db_url)
    conn = _connect_db(db_config)
    try:
        cursor = conn.cursor(as_dict=True)
        play_history = _query_play_history_rows(cursor, year)
        library_tracks = _query_library_track_rows(cursor)
        genre_matches = _extract_genre_matches_from_library_rows(library_tracks)
        return {
            'year': year,
            'play_history': play_history,
            'library_tracks': library_tracks,
            'genre_matches': genre_matches,
        }
    finally:
        conn.close()


def _query_play_history_rows(cursor, year: int) -> list[dict[str, Any]]:
    """读取报告年及其之前的播放历史，用于首次相遇与历年深夜轨迹。"""
    cursor.execute(
        """
        SELECT
          start_year AS report_year,
          start_month,
          start_weekday,
          start_hour,
          start_date_key,
          entry_source,
          source_system,
          source_client_name,
          source_device_name,
          source_playback_method,
          night_sort_minute,
          COALESCE(NULLIF(song_file_name, ''), NULLIF(aggregate_song_id, ''), NULLIF(source_item_id, ''), NULLIF(title_snapshot, '')) AS track_id,
          song_file_name,
          COALESCE(NULLIF(title_snapshot, ''), NULLIF(song_title, ''), NULLIF(song_file_name, '')) AS track_title,
          COALESCE(NULLIF(artist_snapshot, ''), NULLIF(song_artist, '')) AS artist_display,
          COALESCE(NULLIF(album_snapshot, ''), NULLIF(song_album, '')) AS album_display,
          CAST(COALESCE(listened_sec, 0) AS int) AS listened_sec,
          CONVERT(varchar(19), DATEADD(hour, 8, DATEADD(second, CONVERT(bigint, started_at) / 1000, CAST('1970-01-01T00:00:00' AS datetime2))), 120) AS played_at,
          CONVERT(varchar(5), DATEADD(hour, 8, DATEADD(second, CONVERT(bigint, started_at) / 1000, CAST('1970-01-01T00:00:00' AS datetime2))), 108) AS latest_time
        FROM dbo.ods_jumusic_play_history
        WHERE start_year <= %s
        ORDER BY started_at ASC
        """,
        (year,),
    )
    rows = []
    for row in cursor.fetchall():
        played_at = row.get('played_at')
        rows.append({
            'year': int(row.get('report_year') or 0),
            'played_at': played_at,
            # 为了与曲库维表稳定对齐，这里统一使用 song_file_name 作为 track_id。
            'track_id': row.get('song_file_name') or row.get('track_id'),
            'track_title': row.get('track_title') or '未知歌曲',
            'artist_display': row.get('artist_display') or '未知歌手',
            'album_display': row.get('album_display') or '未知专辑',
            'play_count': 1,
            'active_days': 1,
            'listened_sec': int(row.get('listened_sec') or 0),
            'play_source': row.get('entry_source'),
            # 播放来源分布需要保留系统 / 客户端 / 设备 / 播放方式四套维度。
            'source_system': row.get('source_system'),
            'source_client_name': row.get('source_client_name'),
            'source_device_name': row.get('source_device_name'),
            'source_playback_method': row.get('source_playback_method'),
            'start_weekday': row.get('start_weekday'),
            'start_hour': row.get('start_hour'),
            'start_date_key': row.get('start_date_key'),
            'night_sort_minute': row.get('night_sort_minute'),
            'latest_time': row.get('latest_time'),
        })
    return rows


def _query_library_track_rows(cursor) -> list[dict[str, Any]]:
    """读取曲库维表，并用现有字段尽量补齐年报所需维度。"""
    cursor.execute(
        """
        SELECT
          file_name,
          title,
          artist,
          album,
          genre,
          embedded_lyric,
          cover_art_present,
          cover_color,
          duration_sec,
          language_norm,
          genre_essentia_label,
          genre_essentia_matches_json,
          YEAR(COALESCE(file_mtime, etl_created_at)) AS first_added_year,
          MONTH(COALESCE(file_mtime, etl_created_at)) AS first_added_month
        FROM dbo.ods_jumusic_music_info
        WHERE scan_status = 'SUCCESS'
        """
    )
    rows = []
    for row in cursor.fetchall():
        rows.append({
            'track_id': row.get('file_name'),
            'track_title': row.get('title') or '未知歌曲',
            'artist_display': row.get('artist') or '未知歌手',
            'album_display': row.get('album') or '未知专辑',
            'primary_genre': row.get('genre_essentia_label') or row.get('genre'),
            'language_norm': row.get('language_norm'),
            'lyric_text': row.get('embedded_lyric'),
            # 覆盖率与桥页统计依赖封面是否存在、歌曲时长等字段。
            'cover_art_present': row.get('cover_art_present'),
            'cover_color': row.get('cover_color'),
            'duration_sec': row.get('duration_sec'),
            'genre_essentia_matches_json': row.get('genre_essentia_matches_json'),
            'first_added_year': int(row.get('first_added_year') or 0) or None,
            'first_added_month': int(row.get('first_added_month') or 0) or None,
        })
    return rows


def _extract_genre_matches_from_library_rows(library_tracks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """把 ODS 中的 matches JSON 转成 contract builder 的统一多候选结构。"""
    matches = []
    for row in library_tracks:
        track_id = row.get('track_id')
        raw_json = row.get('genre_essentia_matches_json')
        if track_id is None or not _has_value(raw_json):
            continue
        parsed_rows = _parse_genre_matches_json(raw_json)
        for parsed_row in parsed_rows:
            matches.append({
                'track_id': track_id,
                'genre_name': parsed_row['genre_name'],
                'match_score': parsed_row['match_score'],
            })
    return matches


def _parse_genre_matches_json(raw_json: Any) -> list[dict[str, Any]]:
    """兼容不同 JSON 结构，把候选曲风统一映射成 `genre_name + match_score`。"""
    if raw_json is None:
        return []
    if isinstance(raw_json, str):
        try:
            payload = json.loads(raw_json)
        except json.JSONDecodeError:
            return []
    else:
        payload = raw_json
    if not isinstance(payload, list):
        return []

    normalized_rows = []
    for item in payload:
        if not isinstance(item, dict):
            continue
        genre_name = next((
            item.get(field_name)
            for field_name in ('genre_name', 'genre_norm', 'genre', 'label', 'genre_label')
            if _has_value(item.get(field_name))
        ), None)
        match_score = next((
            item.get(field_name)
            for field_name in ('match_score', 'score', 'confidence', 'probability')
            if isinstance(item.get(field_name), (int, float))
        ), None)
        if not _has_value(genre_name) or not isinstance(match_score, (int, float)):
            continue
        normalized_rows.append({
            'genre_name': str(genre_name).strip(),
            'match_score': float(match_score),
        })
    return normalized_rows


def parse_args(argv: list[str] | None = None):
    """解析命令行参数，支持 JSON 与 DB 两种真实数据入口。"""
    parser = argparse.ArgumentParser(description='Build year-report mobile contract from raw JSON or ODS database')
    parser.add_argument('--year', type=int, required=True)
    parser.add_argument('--input-json', default=None, help='原始 raw_report JSON 路径')
    parser.add_argument('--db-url', default=None, help='mssql+pymssql://user:pass@host:1433/db_name')
    parser.add_argument('--output', required=True, help='导出的 contract JSON 路径')
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> dict[str, Any]:
    """命令行入口：构建并写出移动端 contract。"""
    args = parse_args(argv)
    if not args.input_json and not args.db_url and not os.environ.get('JUMUSIC_DB_URL'):
        raise ValueError('either --input-json or --db-url (or JUMUSIC_DB_URL env) is required')

    if args.input_json:
        raw_report = _load_raw_report_from_json(args.input_json)
    else:
        raw_report = _load_raw_report_from_db(args.year, args.db_url)

    raw_report['year'] = args.year
    contract = build_year_report_contract(raw_report)
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(contract, ensure_ascii=False, indent=2), encoding='utf-8')
    return contract


if __name__ == '__main__':
    main()
