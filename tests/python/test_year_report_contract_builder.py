from pathlib import Path
import importlib.util
import json

MODULE_PATH = Path(__file__).resolve().parents[2] / 'scripts' / 'year_report' / 'year_report_contract_builder.py'


def load_module():
    """按文件路径加载移动端年报 contract builder，避免仓库尚未配置包结构时导入失败。"""
    spec = importlib.util.spec_from_file_location('year_report_contract_builder', MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module



def test_build_year_report_contract_returns_meta_and_pages():
    module = load_module()

    contract = module.build_year_report_contract({
        'year': 2025,
        'play_history': [
            {
                'year': 2024,
                'played_at': '2024-06-01 08:30:00',
                'track_id': 'legacy-1',
                'track_title': '旧日来信',
                'artist_display': 'Aimer',
                'album_display': 'Penny Rain',
                'play_count': 2,
                'active_days': 2,
                'listened_sec': 420,
                'night_sort_minute': 1505,
                'latest_time': '01:05',
                'cover_path': 'covers/legacy-1.jpg',
            },
            {
                'year': 2025,
                'played_at': '2025-01-03 09:00:00',
                'track_id': 't1',
                'track_title': '若月亮没来',
                'artist_display': '王宇宙Leto',
                'album_display': '若月亮没来',
                'play_count': 12,
                'active_days': 8,
                'listened_sec': 1800,
                'night_sort_minute': 1628,
                'latest_time': '03:08',
                'cover_path': 'covers/t1.jpg',
                'play_source': 'search',
                'start_weekday': 5,
                'start_hour': 9,
                'bpm': 112,
            },
            {
                'year': 2025,
                'played_at': '2025-03-08 21:10:00',
                'track_id': 't2',
                'track_title': '夜航星',
                'artist_display': '不才',
                'album_display': '不才作品集',
                'play_count': 15,
                'active_days': 12,
                'listened_sec': 2600,
                'night_sort_minute': 1555,
                'latest_time': '01:55',
                'cover_path': 'covers/t2.jpg',
                'play_source': 'list_click',
                'start_weekday': 6,
                'start_hour': 21,
                'bpm': 88,
            },
            {
                'year': 2025,
                'played_at': '2025-03-09 01:15:00',
                'track_id': 't2',
                'track_title': '夜航星',
                'artist_display': '不才',
                'album_display': '不才作品集',
                'play_count': 6,
                'active_days': 3,
                'listened_sec': 900,
                'night_sort_minute': 1515,
                'latest_time': '01:15',
                'cover_path': 'covers/t2.jpg',
                'play_source': 'auto_next',
                'start_weekday': 7,
                'start_hour': 1,
                'bpm': 90,
            },
            {
                'year': 2025,
                'played_at': '2025-06-18 20:30:00',
                'track_id': 'lib-2',
                'track_title': '群青',
                'artist_display': 'YOASOBI',
                'album_display': 'THE BOOK',
                'play_count': 5,
                'active_days': 4,
                'listened_sec': 1200,
                'cover_path': 'covers/lib-2.jpg',
                'play_source': 'search',
                'start_weekday': 3,
                'start_hour': 20,
                'bpm': 126,
            },
        ],
        'library_tracks': [
            {
                'track_id': 'lib-1',
                'track_title': 'Polaris',
                'artist_display': 'Aimer',
                'album_display': 'Sun Dance',
                'first_added_year': 2025,
                'cover_path': 'covers/lib-1.jpg',
                'primary_genre': 'J-Pop',
                'language_norm': '日语',
                'lyric_text': 'polaris shining star',
                'cover_color': '#e6c6b6',
            },
            {
                'track_id': 'lib-2',
                'track_title': '群青',
                'artist_display': 'YOASOBI',
                'album_display': 'THE BOOK',
                'first_added_year': 2025,
                'cover_path': 'covers/lib-2.jpg',
                'primary_genre': 'J-Pop',
                'language_norm': '日语',
                'lyric_text': '群青へ 続く',
                'cover_color': '#6a8fe8',
            },
            {
                'track_id': 'lib-3',
                'track_title': '残響散歌',
                'artist_display': 'Aimer',
                'album_display': '残響散歌',
                'first_added_year': 2024,
                'cover_path': 'covers/lib-3.jpg',
                'primary_genre': 'Anime',
                'language_norm': '日语',
                'lyric_text': '残響 散歌',
                'cover_color': '#d88d5f',
            },
            {
                'track_id': 't1',
                'track_title': '若月亮没来',
                'artist_display': '王宇宙Leto',
                'album_display': '若月亮没来',
                'first_added_year': 2025,
                'cover_path': 'covers/t1.jpg',
                'primary_genre': '国语流行',
                'language_norm': '中文',
                'lyric_text': '若月亮没来 路灯也可照窗台',
                'cover_color': '#f0d7a2',
            },
            {
                'track_id': 't2',
                'track_title': '夜航星',
                'artist_display': '不才',
                'album_display': '不才作品集',
                'first_added_year': 2024,
                'cover_path': 'covers/t2.jpg',
                'primary_genre': '古风',
                'language_norm': '中文',
                'lyric_text': '借一盏午夜街灯照亮归航',
                'cover_color': '#394b8a',
            },
        ],
        'genre_matches': [
            {
                'track_id': 't1',
                'genre_name': '国语流行',
                'match_score': 0.82,
            },
            {
                'track_id': 't2',
                'genre_name': '古风',
                'match_score': 0.73,
            },
            {
                'track_id': 't2',
                'genre_name': '民谣',
                'match_score': 0.11,
            },
            {
                'track_id': 'lib-2',
                'genre_name': 'J-Pop',
                'match_score': 0.88,
            },
            {
                'track_id': 'lib-2',
                'genre_name': 'Anime',
                'match_score': 0.12,
            },
            {
                'track_id': 'lib-3',
                'genre_name': 'Anime',
                'match_score': 0.66,
            },
        ],
    })

    assert contract['meta']['year'] == 2025
    assert contract['meta']['design_width'] == 390
    # 当前移动端 contract 已串起 P01-P20，并继续接入专辑榜、P31/L01 桥页、曲库专题与总结收尾页。
    assert contract['meta']['page_order'] == [
        'P01', 'P02', 'P03', 'P04', 'P05', 'P06', 'P07', 'P08', 'P09', 'P10',
        'P11', 'P12', 'P13', 'P14', 'P15', 'P16', 'P17', 'P18', 'P19', 'P20',
        'P21', 'P23', 'P24', 'P25', 'P31', 'L01', 'L02', 'L03', 'L04A', 'L04B', 'P32',
    ]
    assert [page['page_id'] for page in contract['pages']] == contract['meta']['page_order']

    pages = {page['page_id']: page for page in contract['pages']}

    assert pages['P01']['template'] == 'hero-cover'
    assert pages['P02']['template'] == 'overview-stats'
    assert pages['P03']['template'] == 'breadth-stats'
    assert pages['P04']['template'] == 'foreign-language'
    assert pages['P05']['template'] == 'exploration-contrast'
    assert pages['P06']['template'] == 'keyword-poster'
    assert pages['P07']['template'] == 'story-placeholder'
    assert pages['P08']['template'] == 'genre-ranking'
    assert pages['P09']['template'] == 'genre-timeline'
    assert pages['P10']['template'] == 'genre-score'
    assert pages['P11']['template'] == 'cover-color'
    assert pages['P12']['template'] == 'season-favorite'
    assert pages['P16']['template'] == 'artist-hero'
    assert pages['P17']['template'] == 'week-rhythm'
    assert pages['P18']['template'] == 'calendar-heatmap'
    assert pages['P19']['template'] == 'time-preference'
    assert pages['P20']['template'] == 'late-night-hero'
    assert pages['P21']['template'] == 'timeline-night'
    assert pages['P23']['template'] == 'album-hero'
    assert pages['P24']['template'] == 'album-ranking'
    assert pages['P25']['template'] == 'song-hero'
    assert pages['P31']['template'] == 'library-coverage'
    assert pages['L01']['template'] == 'library-overview'
    assert pages['L02']['template'] == 'library-growth'
    assert pages['L03']['template'] == 'library-structure'
    assert pages['L04A']['template'] == 'artist-library-ranking'
    assert pages['L04B']['template'] == 'artist-new-ranking'
    assert pages['P32']['template'] == 'year-summary'

    assert pages['P01']['payload']['first_track']['track_title'] == '旧日来信'
    assert pages['P02']['payload']['overview_metrics']['total_play_count'] == 38
    assert pages['P03']['payload']['breadth_metrics']['artist_total'] == 3
    assert pages['P04']['payload']['foreign_language_total'] == 1
    assert pages['P05']['payload']['exploration_metrics']['search_play_total'] == 17
    assert pages['P05']['payload']['exploration_metrics']['explore_play_total'] >= pages['P05']['payload']['exploration_metrics']['search_play_total']
    assert pages['P05']['payload']['exploration_metrics']['explore_play_total'] > 0
    assert pages['P06']['payload']['keywords'][0]['keyword']
    assert pages['P06']['payload']['keywords'][0]['source_type'] in {'lyric', 'title'}
    assert pages['P07']['payload']['story_card']['headline']
    assert pages['P08']['payload']['genre_ranking'][0]['genre_name']
    assert pages['P08']['payload']['genre_ranking'][0]['genre_name_zh']
    assert pages['P08']['payload']['genre_ranking'][0]['primary_play_total'] >= pages['P08']['payload']['genre_ranking'][0]['track_count']
    assert pages['P08']['payload']['genre_ranking'][0]['weighted_play_total'] >= 0
    assert pages['P08']['payload']['genre_ranking'][0]['confidence_score'] >= 0
    assert pages['P09']['payload']['monthly_genre_timeline']
    assert pages['P09']['payload']['monthly_genre_timeline'][0]['genre_weights']
    assert isinstance(pages['P10']['payload']['taste_score'], int)
    assert pages['P10']['payload']['score_breakdown']['confidence_score'] >= 0
    assert len(pages['P10']['payload']['radar_metrics']) >= 4
    assert pages['P11']['payload']['cover_color_summary']['counted_track_total'] == 3
    assert pages['P11']['payload']['cover_color_summary']['treemap_total'] == 3
    assert pages['P11']['payload']['cover_color_summary']['top_colors'][0]['share_ratio'] > 0
    assert pages['P11']['payload']['cover_color_summary']['top_colors'][0]['tone_label']
    assert pages['P12']['payload']['favorite_track']['track_title'] == '夜航星'
    assert pages['P16']['payload']['top_artist']['artist_display'] == '不才'
    assert len(pages['P16']['payload']['top_artist']['monthly_distribution']) == 12
    assert len(pages['P17']['payload']['weekday_distribution']) == 7
    assert pages['P18']['payload']['active_day_total'] == 4
    assert len(pages['P18']['payload']['weekday_labels']) == 7
    assert pages['P18']['payload']['heatmap_columns']
    assert pages['P18']['payload']['heatmap_columns'][0]['cells']
    assert pages['P19']['payload']['top_bucket']['bucket_label']
    assert len(pages['P19']['payload']['time_bucket_distribution']) >= 4
    assert pages['P19']['payload']['top_bucket']['hour_range_label']
    assert pages['P19']['payload']['top_hour_ranking']
    assert pages['P20']['payload']['latest_night_record']['track_title'] == '若月亮没来'
    assert pages['P21']['payload']['layout_mode'] == 'timeline'
    assert pages['P23']['payload']['top_album']['album_display'] == '不才作品集'
    assert pages['P24']['payload']['album_ranking'][0]['album_display'] == '不才作品集'
    assert pages['P24']['payload']['album_ranking'][0]['play_total'] == 21
    assert pages['P25']['payload']['song_of_year']['track_title'] == '夜航星'
    assert pages['P31']['payload']['coverage']
    assert pages['P31']['payload']['cover_color_summary']
    assert pages['L01']['payload']['metrics']
    assert pages['L01']['payload']['coverage']
    assert pages['L02']['payload']['growth_metrics']['new_track_total'] == 3
    assert isinstance(pages['L02']['payload']['monthly_growth'], list)
    assert pages['L03']['payload']['language_distribution'][0]['language_name'] == '日语'
    assert pages['L03']['payload']['weighted_genre_distribution'][0]['genre_name'] == 'J-Pop'
    assert pages['L03']['payload']['weighted_genre_distribution'][0]['genre_name_zh'] == '日系流行'
    # 两个 L04 子页统一走 payload.ranking，旧双榜字段不再出现在 contract 中。
    assert pages['L04A']['payload']['ranking'][0]['artist_display'] == 'Aimer'
    assert pages['L04A']['payload']['ranking'][0]['track_total'] == 2
    assert pages['L04B']['payload']['ranking'][0]['artist_display'] == 'Aimer'
    assert pages['L04B']['payload']['ranking'][0]['new_track_total'] == 1
    assert len(pages['P32']['payload']['summary_cards']) == 4
    assert pages['P32']['payload']['summary_cards'][0]['value'] == '03:08'
    assert pages['P32']['payload']['summary_cards'][-1]['value'] == '日系流行'
    assert 'library_artist_ranking' not in pages['L04A']['payload']
    assert 'new_artist_ranking' not in pages['L04B']['payload']



def test_build_year_report_contract_marks_p21_as_single_year_when_only_one_record():
    module = load_module()

    contract = module.build_year_report_contract({
        'year': 2025,
        'play_history': [
            {
                'year': 2025,
                'played_at': '2025-03-08 21:10:00',
                'track_id': 't2',
                'track_title': '夜航星',
                'artist_display': '不才',
                'album_display': '不才作品集',
                'play_count': 15,
                'active_days': 12,
                'listened_sec': 2600,
                'night_sort_minute': 1555,
                'latest_time': '01:55',
                'cover_path': 'covers/t2.jpg',
            },
        ],
    })
    pages = {page['page_id']: page for page in contract['pages']}
    p21 = pages['P21']

    assert p21['payload']['layout_mode'] == 'single-year'
    assert p21['payload']['peak_record_year'] == 2025
    assert len(p21['payload']['latest_night_history']) == 1


def test_build_year_report_contract_splits_l04_pages_and_keeps_top10_ranking():
    module = load_module()

    library_tracks = [
        {
            'track_id': 'a1',
            'track_title': 'Song A1',
            'artist_display': 'Aimer',
            'album_display': 'Album A',
            'first_added_year': 2025,
        },
        {
            'track_id': 'a2',
            'track_title': 'Song A2',
            'artist_display': 'Aimer',
            'album_display': 'Album B',
            'first_added_year': 2025,
        },
    ]
    # 额外补 10 位歌手，验证 contract 中的两个排行都只保留 Top10。
    for index in range(1, 11):
        library_tracks.append({
            'track_id': f'extra-{index}',
            'track_title': f'Song {index:02d}',
            'artist_display': f'Artist {index:02d}',
            'album_display': f'Album {index:02d}',
            'first_added_year': 2025,
        })

    contract = module.build_year_report_contract({
        'year': 2025,
        'library_tracks': library_tracks,
    })
    pages = {page['page_id']: page for page in contract['pages']}
    l04a = pages['L04A']
    l04b = pages['L04B']

    assert l04a['title'] == '歌曲库歌手榜'
    assert l04b['title'] == '年度新增歌手榜'
    assert len(l04a['payload']['ranking']) == 10
    assert len(l04b['payload']['ranking']) == 10
    assert l04a['payload']['ranking'][0]['rank'] == 1
    assert l04a['payload']['ranking'][0]['artist_display'] == 'Aimer'
    assert l04a['payload']['ranking'][0]['top_track_title'] == 'Song A1'
    assert l04b['payload']['ranking'][0]['rank'] == 1
    assert l04b['payload']['ranking'][0]['artist_display'] == 'Aimer'
    assert l04b['payload']['ranking'][0]['highlight_tag'] == '年度重点新增'


def test_build_year_report_contract_supports_more_granular_time_buckets_and_full_year_heatmap():
    module = load_module()

    contract = module.build_year_report_contract({
        'year': 2025,
        'play_history': [
            {
                'year': 2025,
                'played_at': '2025-01-01 00:20:00',
                'track_id': 't1',
                'track_title': 'Song 1',
                'artist_display': 'Artist 1',
            },
            {
                'year': 2025,
                'played_at': '2025-01-02 04:20:00',
                'track_id': 't2',
                'track_title': 'Song 2',
                'artist_display': 'Artist 2',
            },
            {
                'year': 2025,
                'played_at': '2025-01-03 08:20:00',
                'track_id': 't3',
                'track_title': 'Song 3',
                'artist_display': 'Artist 3',
            },
            {
                'year': 2025,
                'played_at': '2025-01-04 12:20:00',
                'track_id': 't4',
                'track_title': 'Song 4',
                'artist_display': 'Artist 4',
            },
            {
                'year': 2025,
                'played_at': '2025-01-05 19:20:00',
                'track_id': 't5',
                'track_title': 'Song 5',
                'artist_display': 'Artist 5',
            },
            {
                'year': 2025,
                'played_at': '2025-01-06 22:20:00',
                'track_id': 't6',
                'track_title': 'Song 6',
                'artist_display': 'Artist 6',
            },
        ],
    })
    pages = {page['page_id']: page for page in contract['pages']}
    p18 = pages['P18']['payload']
    p19 = pages['P19']['payload']

    assert len(p18['weekday_labels']) == 7
    assert len(p18['month_labels']) >= 12
    assert sum(len(column['cells']) for column in p18['heatmap_columns']) >= 365
    bucket_keys = [item['bucket_key'] for item in p19['time_bucket_distribution']]
    assert 'after_midnight' in bucket_keys
    assert 'pre_dawn' in bucket_keys
    assert 'night' in bucket_keys
    assert p19['top_hour_ranking'][0]['play_total'] >= p19['top_hour_ranking'][-1]['play_total']


def test_p19_keeps_zero_play_pre_dawn_bucket_in_contract_for_fixed_page_layout():
    module = load_module()

    contract = module.build_year_report_contract({
        'year': 2025,
        'play_history': [
            {
                'year': 2025,
                'played_at': '2025-01-01 00:20:00',
                'track_id': 't1',
                'track_title': 'Song 1',
                'artist_display': 'Artist 1',
            },
            {
                'year': 2025,
                'played_at': '2025-01-01 08:20:00',
                'track_id': 't2',
                'track_title': 'Song 2',
                'artist_display': 'Artist 2',
            },
            {
                'year': 2025,
                'played_at': '2025-01-01 19:20:00',
                'track_id': 't3',
                'track_title': 'Song 3',
                'artist_display': 'Artist 3',
            },
        ],
    })
    pages = {page['page_id']: page for page in contract['pages']}
    distribution = pages['P19']['payload']['time_bucket_distribution']

    assert len(distribution) == 8
    assert distribution[1]['bucket_key'] == 'pre_dawn'
    assert distribution[1]['hour_range_label'] == '03:00-05:59'
    assert distribution[1]['play_total'] == 0


def test_cli_can_build_mobile_contract_from_input_json(tmp_path, monkeypatch):
    module = load_module()
    input_path = tmp_path / 'raw_report.json'
    output_path = tmp_path / 'report-contract.json'
    input_path.write_text(json.dumps({
        'year': 2025,
        'play_history': [],
        'library_tracks': [],
        'genre_matches': [],
    }, ensure_ascii=False), encoding='utf-8')

    monkeypatch.setattr('sys.argv', [
        'year_report_contract_builder.py',
        '--year', '2025',
        '--input-json', str(input_path),
        '--output', str(output_path),
    ])

    contract = module.main()

    assert contract['meta']['year'] == 2025
    assert output_path.exists()
    persisted_contract = json.loads(output_path.read_text(encoding='utf-8'))
    assert persisted_contract['meta']['year'] == 2025


def test_extract_keywords_prefers_current_year_lyrics_and_titles_and_filters_noise():
    module = load_module()
    contract = module.build_year_report_contract({
        'year': 2026,
        'play_history': [
            {
                'year': 2026,
                'played_at': '2026-04-13 11:34:50',
                'track_id': 'track-1',
                'track_title': '月亮备忘录',
                'artist_display': '歌手A',
            },
            {
                'year': 2026,
                'played_at': '2026-04-14 11:34:50',
                'track_id': 'track-2',
                'track_title': '拂晓来信',
                'artist_display': '歌手B',
            },
        ],
        'library_tracks': [
            {
                'track_id': 'track-1',
                'track_title': '月亮备忘录',
                'artist_display': '歌手A',
                'lyric_text': '月亮 落在 口袋 里 月亮',
            },
            {
                'track_id': 'track-2',
                'track_title': '拂晓来信',
                'artist_display': '歌手B',
                'lyric_text': 'Lavf58.76.100 作词 作曲 拂晓 来信',
            },
            {
                'track_id': 'track-3',
                'track_title': '旧年歌曲',
                'artist_display': '歌手C',
                'lyric_text': '旧年 不该 进入',
            },
        ],
    })
    p06 = {page['page_id']: page for page in contract['pages']}['P06']['payload']
    keywords = [item['keyword'] for item in p06['keywords']]

    assert '月亮' in keywords
    assert '拂晓' in keywords or '拂晓来信' in keywords
    assert 'lavf' not in keywords
    assert '作词' not in keywords


def test_p05_uses_real_entry_sources_and_revisit_is_based_on_library_added_year():
    module = load_module()
    contract = module.build_year_report_contract({
        'year': 2026,
        'play_history': [
            {
                'year': 2026,
                'played_at': '2026-04-13 11:34:50',
                'track_id': 'legacy-track',
                'track_title': '旧日来信',
                'artist_display': '歌手A',
                'entry_source': 'list_click',
            },
            {
                'year': 2026,
                'played_at': '2026-04-13 21:34:50',
                'track_id': 'new-track',
                'track_title': '今年新歌',
                'artist_display': '歌手B',
                'entry_source': 'auto_next',
            },
            {
                'year': 2026,
                'played_at': '2026-04-14 08:34:50',
                'track_id': 'search-track',
                'track_title': '搜索命中',
                'artist_display': '歌手C',
                'entry_source': 'search',
            },
        ],
        'library_tracks': [
            {'track_id': 'legacy-track', 'track_title': '旧日来信', 'artist_display': '歌手A', 'first_added_year': 2025},
            {'track_id': 'new-track', 'track_title': '今年新歌', 'artist_display': '歌手B', 'first_added_year': 2026},
            {'track_id': 'search-track', 'track_title': '搜索命中', 'artist_display': '歌手C', 'first_added_year': 2026},
        ],
    })
    p05 = {page['page_id']: page for page in contract['pages']}['P05']['payload']

    assert p05['exploration_metrics']['search_play_total'] == 1
    assert p05['exploration_metrics']['explore_play_total'] == 2
    assert p05['exploration_metrics']['repeat_play_total'] == 1
    assert p05['spotlight_tracks']['search_top_track']['track_title'] == '搜索命中'
    assert p05['spotlight_tracks']['revisit_top_track']['track_title'] == '旧日来信'


def test_p09_emits_top_genre_zh_for_timeline_headline():
    module = load_module()

    contract = module.build_year_report_contract({
        'year': 2026,
        'play_history': [
            {
                'year': 2026,
                'played_at': '2026-04-13 11:34:50',
                'track_id': 'track-1',
                'track_title': '月亮备忘录',
                'artist_display': '歌手A',
                'play_count': 2,
            },
        ],
        'library_tracks': [
            {
                'track_id': 'track-1',
                'track_title': '月亮备忘录',
                'artist_display': '歌手A',
                'primary_genre': 'Pop---J-pop',
            },
        ],
        'genre_matches': [
            {
                'track_id': 'track-1',
                'genre_name': 'Pop---J-pop',
                'match_score': 0.9,
            },
        ],
    })
    p09 = next(page for page in contract['pages'] if page['page_id'] == 'P09')
    first_month = p09['payload']['monthly_genre_timeline'][0]

    assert first_month['top_genre'] == 'Pop---J-pop'
    assert first_month['top_genre_zh'] == '日系流行'
    assert first_month['top_primary_genre_zh'] == '日系流行'


def test_p11_collapses_remaining_colors_into_other_bucket():
    module = load_module()

    report = module.build_year_report_contract({
        'year': 2026,
        'play_history': [
            {'year': 2026, 'track_id': f't{i}', 'track_title': f'Song {i}', 'artist_display': f'歌手{i}', 'played_at': '2026-01-01 08:00:00'}
            for i in range(1, 8)
        ],
        'library_tracks': [
            {'track_id': 't1', 'track_title': 'Song 1', 'artist_display': '歌手1', 'cover_color': '#111111'},
            {'track_id': 't2', 'track_title': 'Song 2', 'artist_display': '歌手2', 'cover_color': '#222222'},
            {'track_id': 't3', 'track_title': 'Song 3', 'artist_display': '歌手3', 'cover_color': '#333333'},
            {'track_id': 't4', 'track_title': 'Song 4', 'artist_display': '歌手4', 'cover_color': '#444444'},
            {'track_id': 't5', 'track_title': 'Song 5', 'artist_display': '歌手5', 'cover_color': '#555555'},
            {'track_id': 't6', 'track_title': 'Song 6', 'artist_display': '歌手6', 'cover_color': '#666666'},
            {'track_id': 't7', 'track_title': 'Song 7', 'artist_display': '歌手7', 'cover_color': '#777777'},
        ],
    })
    p11 = next(page for page in report['pages'] if page['page_id'] == 'P11')
    other_bucket = next(item for item in p11['payload']['cover_color_summary']['top_colors'] if item.get('is_other_bucket'))

    assert other_bucket['tone_label'] == '其他颜色'
    assert other_bucket['track_count'] == 2
    assert other_bucket['share_ratio'] == 0.2857


def test_l04b_splits_semicolon_separated_artist_display():
    module = load_module()

    report = module.build_year_report_contract({
        'year': 2026,
        'play_history': [],
        'library_tracks': [
            {'track_id': 'a1', 'track_title': '合唱 1', 'artist_display': '浅影阿;汐音社', 'album_display': '专辑A', 'first_added_year': 2026},
            {'track_id': 'a2', 'track_title': '合唱 2', 'artist_display': '浅影阿;汐音社', 'album_display': '专辑B', 'first_added_year': 2026},
            {'track_id': 'a3', 'track_title': '独唱 1', 'artist_display': '浅影阿', 'album_display': '专辑C', 'first_added_year': 2026},
        ],
    })
    l04b = next(page for page in report['pages'] if page['page_id'] == 'L04B')
    names = [item['artist_display'] for item in l04b['payload']['ranking']]

    assert '浅影阿;汐音社' not in names
    assert '浅影阿' in names
    assert '汐音社' in names
