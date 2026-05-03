"""构建年度听歌报告的最小 Python 骨架。"""

from __future__ import annotations

from collections import defaultdict
from typing import Any


# 按当前阶段确认的顺序输出关键页面，后续再逐页补充详细统计逻辑。
CONFIRMED_PAGE_SEQUENCE = [
    'P20',
    'P21',
    'P23',
    'P24',
    'P31',
    'L01',
    'L04',
    'L02',
    'L03',
    'P32',
]


# 统一维护最小标题映射，避免测试与后续页面注册各写一份常量。
PAGE_TITLES = {
    'P20': '深夜听歌',
    'P21': '历年最晚记录',
    'P23': '年度之最专辑',
    'P24': '年度最爱专辑榜',
    'P31': '元数据完成度与封面颜色',
    'L01': '歌曲库总览',
    'L04': '歌曲库歌手榜',
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
        'P23': _build_p23,
        'P24': _build_p24,
        'P31': _build_p31,
        'L01': _build_l01,
        'L04': _build_l04,
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



def _build_l04(context: dict[str, Any]) -> dict[str, Any]:
    """L04 固化为双榜页：左侧全曲库歌手榜，右侧年度新增歌手榜。"""
    library_ranking = _build_library_artist_ranking(context['library_tracks'])
    new_ranking = _build_new_artist_ranking(context['library_tracks'], context['year'])
    summary_text = '对照展示全曲库歌手排名与本年度新增歌曲歌手排名。'
    if library_ranking:
        summary_text = f"全曲库收藏最多的歌手目前是 {library_ranking[0]['artist_display']}，今年新增也可单独看扩坑方向。"

    page = _base_page('L04', context['year'], summary_text)
    page['library_artist_ranking'] = library_ranking
    page['new_artist_ranking'] = new_ranking
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
    page = _base_page('L03', context['year'], '展示曲库语种、时长与曲风结构分布。')
    page['language_distribution'] = []
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
        'cover_ratio': sum(1 for row in library_tracks if _has_value(row.get('cover_path'))),
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
    l04 = page_map.get('L04') or {}
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

    new_artist_ranking = l04.get('new_artist_ranking') or []
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
            'value': top_genre.get('genre_name') or '未知曲风',
            'support_text': f"加权歌曲数 {top_genre.get('weighted_track_count') or 0}",
        })

    return cards



def _build_library_artist_ranking(library_tracks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """按全曲库维度统计歌手收藏数量与专辑覆盖，用于 L04 左榜。"""
    grouped_rows = _group_tracks_by_artist(library_tracks)
    ranking = []
    for artist_display, rows in grouped_rows.items():
        ranking.append({
            'artist_display': artist_display,
            'track_total': len(rows),
            'album_total': len({str(row.get('album_display')).strip() for row in rows if _has_value(row.get('album_display'))}),
            'top_track_title': next((row.get('track_title') for row in rows if _has_value(row.get('track_title'))), '未知歌曲'),
        })

    return sorted(
        ranking,
        key=lambda item: (-item['track_total'], -item['album_total'], item['artist_display'])
    )



def _build_new_artist_ranking(library_tracks: list[dict[str, Any]], year: int) -> list[dict[str, Any]]:
    """按本年度新增歌曲统计歌手扩坑数量，用于 L04 右榜。"""
    new_tracks = [row for row in library_tracks if row.get('first_added_year') == year]
    grouped_rows = _group_tracks_by_artist(new_tracks)
    ranking = []
    for artist_display, rows in grouped_rows.items():
        ranking.append({
            'artist_display': artist_display,
            'new_track_total': len(rows),
            'new_album_total': len({str(row.get('album_display')).strip() for row in rows if _has_value(row.get('album_display'))}),
            'highlight_tag': '年度重点新增' if len(rows) >= 2 else None,
        })

    return sorted(
        ranking,
        key=lambda item: (-item['new_track_total'], -item['new_album_total'], item['artist_display'])
    )


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
    """按歌手分组，并自动过滤空歌手，避免未知值进入 L04 榜单。"""
    grouped_rows: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        artist_display = row.get('artist_display')
        if not _has_value(artist_display):
            continue
        grouped_rows[str(artist_display).strip()].append(row)
    return grouped_rows



def _has_value(value: Any) -> bool:
    """统一判断字段是否有可用值，避免空字符串或全空白字符串误算进覆盖率。"""
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    return True
