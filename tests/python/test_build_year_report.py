from pathlib import Path
import importlib.util
import json
from decimal import Decimal

MODULE_PATH = Path(__file__).resolve().parents[2] / 'scripts' / 'year_report' / 'build_year_report.py'


def load_module():
    spec = importlib.util.spec_from_file_location('build_year_report', MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def sample_dataset_payloads():
    return {
        'data_p01_summary': {
            'first_played_at': '2024-01-01T00:00:00+08:00',
            'days_since_first_play': 485,
            'years_since_first_play': 1.3,
        },
        'data_p02_overview': {
            'year_play_count': 100,
            'year_distinct_tracks': 50,
            'year_new_track_count': 20,
            'year_new_track_ratio': 0.4,
            'year_listened_sec': 18000,
            'year_listened_hours': 5,
            'year_listened_minutes_remainder': 0,
        },
        'data_p03_explore': {
            'artist_count': 10,
            'new_artist_count': 3,
            'genre_count': 6,
            'new_genre_count': 2,
        },
        'data_lib_overview': {
            'track_count': 1000,
            'artist_count': 300,
            'album_count': 200,
            'genre_count': 18,
            'total_duration_sec': 180000,
            'avg_duration_sec': 180,
            'new_track_count': 120,
            'new_artist_count': 42,
            'new_album_count': 35,
            'lyrics_coverage_ratio': 0.8,
            'cover_coverage_ratio': 0.7,
            'genre_coverage_ratio': 0.65,
            'album_coverage_ratio': 0.6,
            'duration_coverage_ratio': 0.95,
            'artist_coverage_ratio': 0.98,
        },
        'data_p05_explore_repeat': [
            {'row_type': 'summary', 'metric_key': 'explore', 'play_count': 40, 'track_count': 30, 'active_days': 20, 'ratio': 0.4, 'track_id': None, 'title': None, 'artist': None},
            {'row_type': 'summary', 'metric_key': 'repeat', 'play_count': 60, 'track_count': 12, 'active_days': 18, 'ratio': 0.6, 'track_id': None, 'title': None, 'artist': None},
            {'row_type': 'track', 'metric_key': 'search_top', 'play_count': 4, 'track_count': None, 'active_days': 3, 'ratio': None, 'track_id': 't9', 'title': 'Song Search', 'artist': 'Artist Search'},
            {'row_type': 'track', 'metric_key': 'repeat_top', 'play_count': 9, 'track_count': None, 'active_days': 6, 'ratio': None, 'track_id': 't8', 'title': 'Song Repeat', 'artist': 'Artist Repeat'},
        ],
        'data_p06_keyword_source_rows': [
            {
                'text_value': '[00:01.00] hello world hello dream',
                'source_type': 'lyric',
                'source_value': '[00:01.00] hello world hello dream',
                'weight': 0.9,
                'track_id': 't1',
                'title': 'Song A',
                'artist': 'Artist A',
            },
            {
                'text_value': 'dream',
                'source_type': 'keyword',
                'source_value': '搜索',
                'weight': 0.5,
                'track_id': None,
                'title': None,
                'artist': None,
            },
        ],
        'data_lib_structure': [
            {'row_type': 'format', 'bucket_key': 'flac', 'bucket_label': 'FLAC', 'item_count': 600, 'ratio': 0.6},
            {'row_type': 'format', 'bucket_key': 'mp3', 'bucket_label': 'MP3', 'item_count': 400, 'ratio': 0.4},
            {'row_type': 'duration', 'bucket_key': '2_4', 'bucket_label': '2-4 分钟', 'item_count': 500, 'ratio': 0.5},
            {'row_type': 'duration', 'bucket_key': '4_6', 'bucket_label': '4-6 分钟', 'item_count': 300, 'ratio': 0.3},
            {'row_type': 'genre', 'bucket_key': 'Vocaloid', 'bucket_label': 'Vocaloid', 'item_count': 200, 'ratio': 0.2},
            {'row_type': 'genre', 'bucket_key': 'J-Pop', 'bucket_label': 'J-Pop', 'item_count': 150, 'ratio': 0.15},
            {'row_type': 'language', 'bucket_key': 'ja', 'bucket_label': '日语', 'item_count': 520, 'ratio': 0.52},
            {'row_type': 'language', 'bucket_key': 'zh', 'bucket_label': '中文', 'item_count': 260, 'ratio': 0.26},
        ],
        'data_l02_library_growth': [
            {'row_type': 'month', 'period_key': '2025-01', 'track_count': 8, 'artist_count': 3, 'album_count': 2},
            {'row_type': 'month', 'period_key': '2025-02', 'track_count': 12, 'artist_count': 5, 'album_count': 4},
            {'row_type': 'month', 'period_key': '2025-04', 'track_count': 30, 'artist_count': 12, 'album_count': 10},
            {'row_type': 'genre', 'bucket_label': 'Vocaloid', 'item_count': 20, 'ratio': 0.4},
            {'row_type': 'genre', 'bucket_label': 'J-Pop', 'item_count': 12, 'ratio': 0.24},
            {'row_type': 'language', 'bucket_label': '日语', 'item_count': 22, 'ratio': 0.44},
            {'row_type': 'language', 'bucket_label': '中文', 'item_count': 18, 'ratio': 0.36},
            {'row_type': 'artist', 'bucket_label': '洛天依', 'item_count': 15, 'ratio': 0.3},
            {'row_type': 'artist', 'bucket_label': '初音未来', 'item_count': 10, 'ratio': 0.2},
            {'row_type': 'album', 'bucket_label': 'Album New', 'item_count': 8, 'ratio': 0.16},
        ],
        'data_p08_genres': [
            {'genre': 'J-Pop', 'play_count': 40, 'listened_sec': 8000, 'ratio': 0.4},
            {'genre': 'Anime', 'play_count': 30, 'listened_sec': 6000, 'ratio': 0.3},
        ],
        'data_p09_genre_evolution': [
            {'period_key': '2025-01', 'genre': 'J-Pop', 'new_track_count': 12, 'ratio': 0.6667},
            {'period_key': '2025-01', 'genre': 'Anime', 'new_track_count': 6, 'ratio': 0.3333},
            {'period_key': '2025-02', 'genre': 'Vocaloid', 'new_track_count': 11, 'ratio': 0.7333},
            {'period_key': '2025-02', 'genre': 'J-Rock', 'new_track_count': 4, 'ratio': 0.2667},
        ],
        'data_p10_taste_inputs': [
            {'genre': 'J-Pop', 'play_count': 40, 'is_new_genre': 0, 'artist_count': 4},
            {'genre': 'Anime', 'play_count': 20, 'is_new_genre': 1, 'artist_count': 3},
        ],
        'data_p12_spring': {
            'season': 'spring',
            'top_track_id': 't1',
            'title': 'Song A',
            'artist': 'Artist A',
            'play_count': 6,
            'listened_sec': 1200,
            'active_days': 4,
        },
        'data_p13_summer': {
            'season': 'summer',
            'top_track_id': 't2',
            'title': 'Song B',
            'artist': 'Artist B',
            'play_count': 7,
            'listened_sec': 1500,
            'active_days': 3,
        },
        'data_p14_autumn': {
            'season': 'autumn',
            'top_track_id': 't3',
            'title': 'Song C',
            'artist': 'Artist C',
            'play_count': 5,
            'listened_sec': 1000,
            'active_days': 2,
        },
        'data_p15_winter': {
            'season': 'winter',
            'top_track_id': 't4',
            'title': 'Song D',
            'artist': 'Artist D',
            'play_count': 8,
            'listened_sec': 1800,
            'active_days': 5,
        },
        'data_p16_artist_of_year': [
            {'row_type': 'summary', 'artist': 'Artist A', 'play_count': 28, 'listened_sec': 6200, 'active_months': 8, 'month_no': None, 'month_play_count': None, 'track_id': None, 'title': None, 'track_play_count': None},
            {'row_type': 'month', 'artist': 'Artist A', 'play_count': None, 'listened_sec': None, 'active_months': None, 'month_no': 1, 'month_play_count': 3, 'track_id': None, 'title': None, 'track_play_count': None},
            {'row_type': 'month', 'artist': 'Artist A', 'play_count': None, 'listened_sec': None, 'active_months': None, 'month_no': 2, 'month_play_count': 5, 'track_id': None, 'title': None, 'track_play_count': None},
            {'row_type': 'track', 'artist': 'Artist A', 'play_count': None, 'listened_sec': None, 'active_months': None, 'month_no': None, 'month_play_count': None, 'track_id': 't1', 'title': 'Song A', 'track_play_count': 12},
        ],
        'data_p17_weekly_pattern': [
            {'row_type': 'weekday', 'weekday_num': 1, 'weekday_cn': '周一', 'play_count': 8, 'listened_sec': 1800, 'time_bucket': None, 'bucket_play_count': None},
            {'row_type': 'weekday', 'weekday_num': 6, 'weekday_cn': '周六', 'play_count': 18, 'listened_sec': 4200, 'time_bucket': None, 'bucket_play_count': None},
            {'row_type': 'bucket', 'weekday_num': None, 'weekday_cn': None, 'play_count': None, 'listened_sec': None, 'time_bucket': 'evening', 'bucket_play_count': 20},
            {'row_type': 'bucket', 'weekday_num': None, 'weekday_cn': None, 'play_count': None, 'listened_sec': None, 'time_bucket': 'late_night', 'bucket_play_count': 5},
        ],
        'data_p18_calendar': [
            {'date': '2025-01-01', 'play_count': 2, 'listened_sec': 500, 'is_active': 1},
            {'date': '2025-01-02', 'play_count': 0, 'listened_sec': 0, 'is_active': 0},
            {'date': '2025-01-03', 'play_count': 1, 'listened_sec': 250, 'is_active': 1},
            {'date': '2025-01-04', 'play_count': 1, 'listened_sec': 300, 'is_active': 1},
        ],
        'data_p19_time_bucket': [
            {'row_type': 'bucket', 'time_bucket': 'evening', 'play_hour': None, 'track_id': None, 'title': None, 'artist_raw': None, 'play_count': 25},
            {'row_type': 'bucket', 'time_bucket': 'night', 'play_hour': None, 'track_id': None, 'title': None, 'artist_raw': None, 'play_count': 10},
            {'row_type': 'hour', 'time_bucket': None, 'play_hour': 21, 'track_id': None, 'title': None, 'artist_raw': None, 'play_count': 8},
            {'row_type': 'track', 'time_bucket': 'evening', 'play_hour': None, 'track_id': 't2', 'title': 'Song B', 'artist_raw': 'Artist B', 'play_count': 6},
        ],
        'data_p20_night': {
            'night_session_count': 12,
            'latest_night_date': '2025-12-04',
            'latest_night_time': '01:10',
            'track_id': 't3',
            'title': 'Song C',
            'artist_raw': 'Artist C',
            'night_sort_minute': 1510,
        },
        'data_p22_repeat_tracks': [
            {'track_id': 't1', 'title': 'Song A', 'artist': 'Artist A', 'play_count': 9, 'listened_sec': 1600, 'active_days': 4},
            {'track_id': 't2', 'title': 'Song B', 'artist': 'Artist B', 'play_count': 7, 'listened_sec': 1400, 'active_days': 3},
        ],
        'data_p23_album_of_year': {
            'album': 'Album A',
            'artist': 'Artist A',
            'play_count': 22,
            'listened_sec': 4200,
            'active_days': 10,
            'track_count': 5,
            'album_score': 39.8,
        },
        'data_p24_top_albums': [
            {'album': 'Album A', 'artist': 'Artist A', 'play_count': 22, 'listened_sec': 4200, 'active_days': 10, 'track_count': 5, 'album_score': 39.8},
            {'album': 'Album B', 'artist': 'Artist B', 'play_count': 15, 'listened_sec': 3000, 'active_days': 7, 'track_count': 4, 'album_score': 28.0},
        ],
        'data_p25_song_of_year': {
            'track_id': 't1',
            'title': 'Song A',
            'artist': 'Artist A',
            'album': 'Album A',
            'first_played_at': '2025-01-01T00:30:00+08:00',
            'year_play_count': 18,
            'year_listened_sec': 4000,
            'year_active_days': 12,
            'song_score': 37.2,
        },
        'data_p26_top_tracks': [
            {'track_id': 't1', 'title': 'Song A', 'artist': 'Artist A', 'album': 'Album A', 'play_count': 18, 'listened_sec': 4000, 'active_days': 12},
            {'track_id': 't2', 'title': 'Song B', 'artist': 'Artist B', 'album': 'Album B', 'play_count': 10, 'listened_sec': 2100, 'active_days': 6},
        ],
        'data_p27_top_artists': [
            {'row_type': 'artist', 'artist': 'Artist A', 'play_count': 28, 'listened_sec': 6200, 'track_id': None, 'title': None, 'track_play_count': None},
            {'row_type': 'track', 'artist': 'Artist A', 'play_count': None, 'listened_sec': None, 'track_id': 't1', 'title': 'Song A', 'track_play_count': 12},
            {'row_type': 'artist', 'artist': 'Artist B', 'play_count': 18, 'listened_sec': 4200, 'track_id': None, 'title': None, 'track_play_count': None},
            {'row_type': 'track', 'artist': 'Artist B', 'play_count': None, 'listened_sec': None, 'track_id': 't2', 'title': 'Song B', 'track_play_count': 7},
        ],
        'data_p28_artist_journey': [
            {'row_type': 'summary', 'artist': 'Artist A', 'first_played_at': '2024-01-01T00:00:00+08:00', 'days_since_first_play': 485, 'peak_date': None, 'peak_play_count': None, 'track_id': None, 'title': None},
            {'row_type': 'first_track', 'artist': 'Artist A', 'first_played_at': None, 'days_since_first_play': None, 'peak_date': None, 'peak_play_count': None, 'track_id': 't1', 'title': 'Song A'},
            {'row_type': 'peak_day', 'artist': 'Artist A', 'first_played_at': None, 'days_since_first_play': None, 'peak_date': '2025-03-01', 'peak_play_count': 5, 'track_id': None, 'title': None},
        ],
        'data_p30_yearly_artist_rank': [
            {'play_year': 2024, 'artist_rank': 1, 'artist': 'Artist A', 'play_count': 22, 'listened_sec': 4000},
            {'play_year': 2024, 'artist_rank': 2, 'artist': 'Artist B', 'play_count': 18, 'listened_sec': 3200},
            {'play_year': 2025, 'artist_rank': 1, 'artist': 'Artist A', 'play_count': 28, 'listened_sec': 6200},
        ],
        'data_p29_artist_rank_detail': [
            {'row_type': 'artist', 'artist_rank': 1, 'artist': 'Artist A', 'play_count': 28, 'listened_sec': 6200, 'track_id': None, 'title': None, 'track_play_count': None},
            {'row_type': 'track', 'artist_rank': 1, 'artist': 'Artist A', 'play_count': None, 'listened_sec': None, 'track_id': 't1', 'title': 'Song A', 'track_play_count': 12},
            {'row_type': 'artist', 'artist_rank': 2, 'artist': 'Artist B', 'play_count': 18, 'listened_sec': 4200, 'track_id': None, 'title': None, 'track_play_count': None},
            {'row_type': 'track', 'artist_rank': 2, 'artist': 'Artist B', 'play_count': None, 'listened_sec': None, 'track_id': 't2', 'title': 'Song B', 'track_play_count': 7},
        ],
        'data_p31_credits': [
            {'credit_type': 'composer', 'credit_name': 'Composer A', 'play_count': 12, 'listened_sec': 2400},
            {'credit_type': 'lyricist', 'credit_name': 'Lyricist A', 'play_count': 9, 'listened_sec': 1800},
        ],
    }


def query_plan_for_test(year=2025):
    return load_module().build_query_plan(year)


def test_module_file_exists():
    assert MODULE_PATH.exists()


def test_build_report_from_dataset_payloads_returns_required_pages():
    module = load_module()

    report = module.build_report_from_dataset_payloads(
        year=2025,
        dataset_payloads=sample_dataset_payloads(),
        generated_at='2026-04-30T15:00:00+08:00',
    )

    assert report['year'] == 2025
    assert report['generated_at'] == '2026-04-30T15:00:00+08:00'
    assert report['timezone'] == 'Asia/Shanghai'
    assert set(report['pages']) == {'P01', 'P02', 'P03', 'P04', 'P05', 'P06', 'P07', 'P08', 'P09', 'P10', 'P12', 'P13', 'P14', 'P15', 'P16', 'P17', 'P18', 'P19', 'P20', 'P22', 'P23', 'P24', 'P25', 'P26', 'P27', 'P28', 'P29', 'P30', 'P31', 'P32', 'L01', 'L02', 'L03'}
    assert report['pages']['P04']['track_count'] == 1000
    assert report['pages']['P04']['artist_count'] == 300
    assert report['pages']['P07']['format_distribution'][0]['bucket_label'] == 'FLAC'
    assert report['pages']['P07']['genre_distribution'][0]['bucket_label'] == 'Vocaloid'
    assert report['pages']['P05']['explore_ratio'] == 0.4
    assert report['pages']['P05']['top_search_track']['track_id'] == 't9'
    assert report['pages']['P05']['top_repeat_track']['track_id'] == 't8'
    assert report['pages']['P05']['summary_text']
    assert report['pages']['P09'][0]['period_key'] == '2025-01'
    assert report['pages']['P09'][0]['top_genre'] == 'J-Pop'
    assert report['pages']['P09'][1]['top_genre'] == 'Vocaloid'
    assert report['pages']['P20']['latest_night_track']['track_id'] == 't3'
    assert report['pages']['P25']['track_id'] == 't1'
    assert report['pages']['P12']['season'] == 'spring'
    assert report['pages']['P16']['artist'] == 'Artist A'
    assert report['pages']['P17']['most_active_weekday']['weekday_cn'] == '周六'
    assert report['pages']['P19']['top_time_bucket'] == 'evening'
    assert report['pages']['P22'][0]['track_id'] == 't2'
    assert report['pages']['P22'][0]['repeat_index'] > report['pages']['P22'][1]['repeat_index']
    assert report['pages']['P23']['album'] == 'Album A'
    assert report['pages']['P24'][0]['album'] == 'Album A'
    assert report['pages']['P26'][0]['track_id'] == 't1'
    assert report['pages']['P27'][0]['artist'] == 'Artist A'
    assert report['pages']['P28']['first_track']['track_id'] == 't1'
    assert report['pages']['P29'][0]['artist'] == 'Artist A'
    assert report['pages']['P30'][0]['play_year'] == 2024
    assert report['pages']['P31']['items'][0]['credit_type'] == 'composer'
    assert report['pages']['L01']['metrics']['track_total'] == 1000
    assert report['pages']['L01']['coverage']['lyrics_coverage_ratio'] == 0.8
    assert report['pages']['L02']['peak_new_month'] == '2025-04'
    assert report['pages']['L03']['language_distribution'][0]['bucket_label'] == '日语'
    assert 'Vocaloid' in report['pages']['L03']['summary_text']


def test_p06_keywords_are_built_independently_of_p05_and_preserve_non_ascii_text():
    module = load_module()

    cleaned = module._clean_keyword_text('[00:01.00] きらきら カタカナ café ā')

    assert cleaned == 'きらきら カタカナ café ā'

    report = module.build_report_from_dataset_payloads(
        year=2025,
        dataset_payloads=sample_dataset_payloads(),
        generated_at='2026-04-30T15:00:00+08:00',
    )

    assert report['pages']['P06'][0] == {
        'keyword': 'hello',
        'hit_count': 2,
        'source_type': 'lyric',
        'representative_track': {
            'track_id': 't1',
            'title': 'Song A',
            'artist': 'Artist A',
        },
        'representative_snippet': 'hello world hello dream',
    }


def test_p06_keywords_filter_generic_english_fillers_and_truncate_long_snippets():
    module = load_module()

    rows = [
        {
            'text_value': 'you love me dream tokyo dream starlight ' + ('shine ' * 80),
            'source_type': 'lyric',
            'source_value': 'you love me dream tokyo dream starlight',
            'weight': 1.0,
            'track_id': 't100',
            'title': 'Song Long',
            'artist': 'Artist Long',
        },
    ]

    result = module._extract_keywords(rows)
    keywords = [item['keyword'] for item in result]

    assert 'you' not in keywords
    assert 'me' not in keywords
    assert 'love' not in keywords
    assert keywords[:3] == ['dream', 'shine', 'starlight']
    assert len(result[0]['representative_snippet']) <= 240


def test_p06_keywords_filter_credit_headers_and_common_lyric_filler_words():
    module = load_module()

    rows = [
        {
            'text_value': '作词 作曲 编曲 混音 by produced by written by oh oh all up but so 星空 夜空 夜空',
            'source_type': 'lyric',
            'source_value': '作词 作曲 编曲 混音 by',
            'weight': 1.0,
            'track_id': 't101',
            'title': 'Song Credit',
            'artist': 'Artist Credit',
        },
    ]

    result = module._extract_keywords(rows)
    keywords = [item['keyword'] for item in result]

    assert '作词' not in keywords
    assert '作曲' not in keywords
    assert '编曲' not in keywords
    assert '混音' not in keywords
    assert 'by' not in keywords
    assert 'oh' not in keywords
    assert 'all' not in keywords
    assert 'up' not in keywords
    assert 'but' not in keywords
    assert 'so' not in keywords
    assert keywords[:2] == ['夜空', '星空']


def test_p06_keywords_filter_short_header_tokens_and_more_spoken_fillers():
    module = load_module()

    rows = [
        {
            'text_value': 'ti ar al music 制作人 no yeah can now down 星光 星光 东京',
            'source_type': 'lyric',
            'source_value': 'ti ar al music 制作人',
            'weight': 1.0,
            'track_id': 't102',
            'title': 'Song Header',
            'artist': 'Artist Header',
        },
    ]

    result = module._extract_keywords(rows)
    keywords = [item['keyword'] for item in result]

    assert 'ti' not in keywords
    assert 'ar' not in keywords
    assert 'al' not in keywords
    assert 'music' not in keywords
    assert '制作人' not in keywords
    assert 'no' not in keywords
    assert 'yeah' not in keywords
    assert 'can' not in keywords
    assert 'now' not in keywords
    assert 'down' not in keywords
    assert keywords[:2] == ['星光', '东京']


def test_p06_keywords_drop_metadata_heavy_lines_entirely():
    module = load_module()

    rows = [
        {
            'text_value': '作词 张三 作曲 李四 编曲 王五 制作人 赵六 album music by written by produced by',
            'source_type': 'lyric',
            'source_value': '作词 张三 作曲 李四 编曲 王五',
            'weight': 1.0,
            'track_id': 't103',
            'title': 'Song Meta',
            'artist': 'Artist Meta',
        },
        {
            'text_value': '银河 银河 列车',
            'source_type': 'lyric',
            'source_value': '银河 银河 列车',
            'weight': 1.0,
            'track_id': 't104',
            'title': 'Song Real',
            'artist': 'Artist Real',
        },
    ]

    result = module._extract_keywords(rows)

    assert result[:2] == [
        {
            'keyword': '银河',
            'hit_count': 2,
            'source_type': 'lyric',
            'representative_track': {
                'track_id': 't104',
                'title': 'Song Real',
                'artist': 'Artist Real',
            },
            'representative_snippet': '银河 银河 列车',
        },
        {
            'keyword': '列车',
            'hit_count': 1,
            'source_type': 'lyric',
            'representative_track': {
                'track_id': 't104',
                'title': 'Song Real',
                'artist': 'Artist Real',
            },
            'representative_snippet': '银河 银河 列车',
        },
    ]


def test_p10_taste_scores_are_built_independently_of_p05_with_exact_contract():
    module = load_module()

    report = module.build_report_from_dataset_payloads(
        year=2025,
        dataset_payloads=sample_dataset_payloads(),
        generated_at='2026-04-30T15:00:00+08:00',
    )

    assert report['pages']['P10'] == {
        'taste_score': 65.4,
        'breadth_score': 85.0,
        'depth_score': 60.0,
        'freshness_score': 50.0,
        'balance_score': 66.7,
        'summary_label': '探索型乐迷',
        'summary_text': '你今年覆盖了 2 种曲风，听了 60 次，其中 1 种是新鲜尝试。',
    }


def test_p07_library_structure_normalizes_genres_and_summarizes_unknown_dominance():
    module = load_module()

    rows = [
        {'row_type': 'genre', 'bucket_key': '未识别', 'bucket_label': '未识别', 'item_count': 80, 'ratio': 0.8},
        {'row_type': 'genre', 'bucket_key': 'Other', 'bucket_label': 'Other', 'item_count': 10, 'ratio': 0.1},
        {'row_type': 'genre', 'bucket_key': 'Miscellaneous', 'bucket_label': 'Miscellaneous', 'item_count': 5, 'ratio': 0.05},
        {'row_type': 'genre', 'bucket_key': 'JPop', 'bucket_label': 'JPop', 'item_count': 3, 'ratio': 0.03},
        {'row_type': 'genre', 'bucket_key': 'J-Pop', 'bucket_label': 'J-Pop', 'item_count': 7, 'ratio': 0.07},
        {'row_type': 'genre', 'bucket_key': 'Vocaloid', 'bucket_label': 'Vocaloid', 'item_count': 12, 'ratio': 0.12},
    ]

    result = module._build_library_structure(rows)

    assert result['genre_distribution'][0] == {
        'bucket_key': 'Vocaloid',
        'bucket_label': 'Vocaloid',
        'item_count': 12,
        'ratio': 0.12,
    }
    assert result['genre_distribution'][1] == {
        'bucket_key': 'J-Pop',
        'bucket_label': 'J-Pop',
        'item_count': 10,
        'ratio': 0.1,
    }
    assert result['genre_distribution'][2] == {
        'bucket_key': '未识别',
        'bucket_label': '未识别',
        'item_count': 95,
        'ratio': 0.95,
    }
    assert result['genre_summary_text'] == '曲库里未识别曲风较多，已识别部分以 Vocaloid 最多，共 12 首。'


def test_p07_library_structure_accepts_decimal_ratios_from_real_db_rows():
    module = load_module()

    rows = [
        {'row_type': 'genre', 'bucket_key': 'JPop', 'bucket_label': 'JPop', 'item_count': 3, 'ratio': Decimal('0.03')},
        {'row_type': 'genre', 'bucket_key': 'J-Pop', 'bucket_label': 'J-Pop', 'item_count': 7, 'ratio': Decimal('0.07')},
        {'row_type': 'genre', 'bucket_key': 'Other', 'bucket_label': 'Other', 'item_count': 90, 'ratio': Decimal('0.90')},
    ]

    result = module._build_library_structure(rows)

    assert result['genre_distribution'] == [
        {
            'bucket_key': 'J-Pop',
            'bucket_label': 'J-Pop',
            'item_count': 10,
            'ratio': 0.1,
        },
        {
            'bucket_key': '未识别',
            'bucket_label': '未识别',
            'item_count': 90,
            'ratio': 0.9,
        },
    ]


def test_p07_duration_distribution_uses_fixed_bucket_order_instead_of_sql_arrival_order():
    module = load_module()

    rows = [
        {'row_type': 'duration', 'bucket_key': '2_4', 'bucket_label': '2-4 分钟', 'item_count': 500, 'ratio': 0.5},
        {'row_type': 'duration', 'bucket_key': '6_plus', 'bucket_label': '6 分钟以上', 'item_count': 30, 'ratio': 0.03},
        {'row_type': 'duration', 'bucket_key': 'lt_2', 'bucket_label': '2 分钟以下', 'item_count': 70, 'ratio': 0.07},
        {'row_type': 'duration', 'bucket_key': '4_6', 'bucket_label': '4-6 分钟', 'item_count': 300, 'ratio': 0.3},
    ]

    result = module._build_library_structure(rows)

    assert [item['bucket_key'] for item in result['duration_distribution']] == ['lt_2', '2_4', '4_6', '6_plus']


def test_album_rankings_exclude_unknown_and_single_buckets():
    module = load_module()

    report = module.build_report_from_dataset_payloads(
        year=2025,
        dataset_payloads={
            **sample_dataset_payloads(),
            'data_p23_album_of_year': {
                'album': 'unknown',
                'artist': 'Artist Unknown',
                'play_count': 99,
                'listened_sec': 9999,
                'active_days': 20,
                'track_count': 8,
                'album_score': 100,
            },
            'data_p24_top_albums': [
                {'album': 'unknown', 'artist': 'Artist Unknown', 'play_count': 99, 'listened_sec': 9999, 'active_days': 20, 'track_count': 8, 'album_score': 100},
                {'album': '单曲', 'artist': 'Artist Single', 'play_count': 80, 'listened_sec': 8888, 'active_days': 18, 'track_count': 6, 'album_score': 95},
                {'album': 'Album Real', 'artist': 'Artist Real', 'play_count': 18, 'listened_sec': 3600, 'active_days': 12, 'track_count': 5, 'album_score': 40},
            ],
        },
        generated_at='2026-04-30T15:00:00+08:00',
    )

    assert report['pages']['P23']['album'] == 'Album Real'
    assert [item['album'] for item in report['pages']['P24']] == ['Album Real']


def test_p23_is_forced_to_match_p24_top_ranked_album_when_query_winner_drifts():
    module = load_module()

    report = module.build_report_from_dataset_payloads(
        year=2025,
        dataset_payloads={
            **sample_dataset_payloads(),
            'data_p23_album_of_year': {
                'album': 'Album Drift',
                'artist': 'Artist Drift',
                'play_count': 2,
                'listened_sec': 500,
                'active_days': 1,
                'track_count': 1,
                'album_score': 2.0,
            },
            'data_p24_top_albums': [
                {'album': 'Album Real', 'artist': 'Artist Real', 'play_count': 3, 'listened_sec': 900, 'active_days': 2, 'track_count': 2, 'album_score': 3.0},
                {'album': 'Album Drift', 'artist': 'Artist Drift', 'play_count': 2, 'listened_sec': 500, 'active_days': 1, 'track_count': 1, 'album_score': 2.0},
            ],
        },
        generated_at='2026-05-02T10:30:00+08:00',
    )

    assert report['pages']['P24'][0]['album'] == 'Album Real'
    assert report['pages']['P23']['album'] == 'Album Real'
    assert 'Album Real' in report['pages']['P23']['summary_text']


def test_p31_summary_becomes_conservative_when_coverage_is_low():
    module = load_module()

    report = module.build_report_from_dataset_payloads(
        year=2025,
        dataset_payloads={
            **sample_dataset_payloads(),
            'data_lib_overview': {
                **sample_dataset_payloads()['data_lib_overview'],
                'lyrics_coverage_ratio': 0.0,
                'cover_coverage_ratio': 0.0,
                'genre_coverage_ratio': 0.0,
            },
            'data_p31_credits': [
                {'credit_type': 'composer', 'credit_name': 'MEMORIAL DAY', 'play_count': 3, 'listened_sec': 600},
            ],
        },
        generated_at='2026-05-02T10:30:00+08:00',
    )

    assert '最突出的是' not in report['pages']['P31']['summary_text']
    assert '覆盖率不足' in report['pages']['P31']['summary_text']


def test_l01_l02_can_reflect_sparse_incremental_newness_without_looking_like_full_import():
    module = load_module()

    report = module.build_report_from_dataset_payloads(
        year=2026,
        dataset_payloads={
            **sample_dataset_payloads(),
            'data_lib_overview': {
                **sample_dataset_payloads()['data_lib_overview'],
                'track_count': 10301,
                'artist_count': 3963,
                'album_count': 5494,
                'new_track_count': 451,
                'new_artist_count': 320,
                'new_album_count': 288,
            },
            'data_l02_library_growth': [
                {'row_type': 'month', 'period_key': '2026-01', 'track_count': 111, 'artist_count': 80, 'album_count': 72},
                {'row_type': 'month', 'period_key': '2026-02', 'track_count': 189, 'artist_count': 140, 'album_count': 126},
                {'row_type': 'month', 'period_key': '2026-03', 'track_count': 98, 'artist_count': 73, 'album_count': 65},
                {'row_type': 'month', 'period_key': '2026-04', 'track_count': 8, 'artist_count': 8, 'album_count': 8},
                {'row_type': 'month', 'period_key': '2026-05', 'track_count': 45, 'artist_count': 40, 'album_count': 37},
                {'row_type': 'summary', 'period_key': None, 'track_count': 451, 'artist_count': 320, 'album_count': 288},
                {'row_type': 'genre', 'bucket_label': 'Vocaloid', 'item_count': 120, 'ratio': 0.2661},
            ],
        },
        generated_at='2026-05-02T12:00:00+08:00',
    )

    assert report['pages']['L01']['metrics']['new_track_total'] == 451
    assert report['pages']['L02']['new_track_total'] == 451
    assert report['pages']['L02']['new_artist_total'] == 320
    assert report['pages']['L02']['new_album_total'] == 288
    assert report['pages']['L02']['peak_new_month'] == '2026-02'
    assert '451 首歌' in report['pages']['L01']['summary_text']
    assert '2026-02' in report['pages']['L02']['summary_text']


def test_l03_prefers_lyric_inferred_languages_when_available():
    module = load_module()

    structure = module._build_library_structure([
        {'row_type': 'language', 'bucket_key': 'inst', 'bucket_label': '纯音乐', 'item_count': 20, 'ratio': 1.0},
        {'row_type': 'language', 'bucket_key': 'ja', 'bucket_label': '日语', 'item_count': 12, 'ratio': 0.6},
        {'row_type': 'language', 'bucket_key': 'zh', 'bucket_label': '中文', 'item_count': 5, 'ratio': 0.25},
        {'row_type': 'language', 'bucket_key': 'unknown', 'bucket_label': '未知语种', 'item_count': 3, 'ratio': 0.15},
        {'row_type': 'genre', 'bucket_key': 'Vocaloid', 'bucket_label': 'Vocaloid', 'item_count': 8, 'ratio': 0.4},
        {'row_type': 'genre', 'bucket_key': '未识别', 'bucket_label': '未识别', 'item_count': 12, 'ratio': 0.6},
        {'row_type': 'duration', 'bucket_key': '2_4', 'bucket_label': '2-4 分钟', 'item_count': 10, 'ratio': 0.5},
    ])

    page = module._build_l03_library_profile(structure)

    assert page['language_distribution'][0]['bucket_label'] == '纯音乐'
    assert page['language_distribution'][1]['bucket_label'] == '日语'
    assert '日语' in page['summary_text']


def test_l03_summary_does_not_treat_pure_instrumental_as_unknown_language():
    module = load_module()

    page = module._build_l03_library_profile({
        'language_distribution': [
            {'bucket_key': 'inst', 'bucket_label': '纯音乐', 'item_count': 60, 'ratio': 0.6},
            {'bucket_key': 'zh', 'bucket_label': '中文', 'item_count': 25, 'ratio': 0.25},
            {'bucket_key': 'unknown', 'bucket_label': '未知语种', 'item_count': 15, 'ratio': 0.15},
        ],
        'duration_distribution': [
            {'bucket_key': '2_4', 'bucket_label': '2-4 分钟', 'item_count': 80, 'ratio': 0.8},
        ],
        'genre_distribution': [
            {'bucket_key': 'Vocaloid', 'bucket_label': 'Vocaloid', 'item_count': 10, 'ratio': 0.1},
            {'bucket_key': '未识别', 'bucket_label': '未识别', 'item_count': 90, 'ratio': 0.9},
        ],
    })

    assert '未知语种' not in page['summary_text']
    assert '纯音乐' in page['summary_text']


def test_l02_summary_avoids_saying_unknown_language_is_the_main_growth_language():
    module = load_module()

    page = module._build_l02_library_growth(2026, [
        {'row_type': 'month', 'period_key': '2026-02', 'track_count': 10, 'artist_count': 8, 'album_count': 6},
        {'row_type': 'language', 'bucket_label': '未知语种', 'item_count': 8, 'ratio': 0.8},
        {'row_type': 'language', 'bucket_label': '日语', 'item_count': 2, 'ratio': 0.2},
        {'row_type': 'genre', 'bucket_label': '未识别', 'item_count': 9, 'ratio': 0.9},
        {'row_type': 'genre', 'bucket_label': 'Vocaloid', 'item_count': 1, 'ratio': 0.1},
    ])

    assert '扩得最多的是 未识别' not in page['summary_text']
    assert 'Vocaloid' in page['summary_text']


def test_song_of_year_prefers_consistent_companion_over_short_spike():
    module = load_module()

    report = module.build_report_from_dataset_payloads(
        year=2025,
        dataset_payloads={
            **sample_dataset_payloads(),
            'data_p25_song_of_year': None,
            'data_p26_top_tracks': [
                {'track_id': 'steady', 'title': 'Steady Song', 'artist': 'Artist A', 'album': 'Album A', 'play_count': 40, 'listened_sec': 7200, 'active_days': 25},
                {'track_id': 'spike', 'title': 'Spike Song', 'artist': 'Artist B', 'album': 'Album B', 'play_count': 45, 'listened_sec': 5400, 'active_days': 5},
            ],
            'data_p22_repeat_tracks': [
                {'track_id': 'steady', 'title': 'Steady Song', 'artist': 'Artist A', 'play_count': 40, 'listened_sec': 7200, 'active_days': 25},
                {'track_id': 'spike', 'title': 'Spike Song', 'artist': 'Artist B', 'play_count': 45, 'listened_sec': 5400, 'active_days': 5},
            ],
        },
        generated_at='2026-04-30T15:00:00+08:00',
    )

    assert report['pages']['P25']['track_id'] == 'steady'
    assert report['pages']['P25']['title'] == 'Steady Song'
    assert report['pages']['P25']['song_score'] > report['pages']['P26'][1]['song_score']
    assert report['pages']['P22'][0]['track_id'] == 'spike'


def test_artist_aliases_are_collapsed_for_artist_pages():
    module = load_module()

    report = module.build_report_from_dataset_payloads(
        year=2025,
        dataset_payloads={
            **sample_dataset_payloads(),
            'data_p16_artist_of_year': [
                {'row_type': 'summary', 'artist': '洛天依office', 'play_count': 18, 'listened_sec': 3600, 'active_months': 6, 'month_no': None, 'month_play_count': None, 'track_id': None, 'title': None, 'track_play_count': None},
                {'row_type': 'month', 'artist': '洛天依office', 'play_count': None, 'listened_sec': None, 'active_months': None, 'month_no': 4, 'month_play_count': 8, 'track_id': None, 'title': None, 'track_play_count': None},
                {'row_type': 'track', 'artist': '洛天依office', 'play_count': None, 'listened_sec': None, 'active_months': None, 'month_no': None, 'month_play_count': None, 'track_id': 't100', 'title': 'Song Luo', 'track_play_count': 9},
            ],
            'data_p27_top_artists': [
                {'row_type': 'artist', 'artist': '洛天依office', 'play_count': 18, 'listened_sec': 3600, 'track_id': None, 'title': None, 'track_play_count': None},
                {'row_type': 'track', 'artist': '洛天依office', 'play_count': None, 'listened_sec': None, 'track_id': 't100', 'title': 'Song Luo', 'track_play_count': 9},
                {'row_type': 'artist', 'artist': 'HatsuneMiku', 'play_count': 16, 'listened_sec': 3200, 'track_id': None, 'title': None, 'track_play_count': None},
                {'row_type': 'track', 'artist': 'HatsuneMiku', 'play_count': None, 'listened_sec': None, 'track_id': 't200', 'title': 'Song Miku', 'track_play_count': 7},
            ],
            'data_p28_artist_journey': [
                {'row_type': 'summary', 'artist': '洛天依office', 'first_played_at': '2024-02-01T00:00:00+08:00', 'days_since_first_play': 420, 'peak_date': None, 'peak_play_count': None, 'track_id': None, 'title': None},
                {'row_type': 'first_track', 'artist': '洛天依office', 'first_played_at': None, 'days_since_first_play': None, 'peak_date': None, 'peak_play_count': None, 'track_id': 't100', 'title': 'Song Luo'},
                {'row_type': 'peak_day', 'artist': '洛天依office', 'first_played_at': None, 'days_since_first_play': None, 'peak_date': '2025-04-01', 'peak_play_count': 5, 'track_id': None, 'title': None},
            ],
            'data_p29_artist_rank_detail': [
                {'row_type': 'artist', 'artist_rank': 1, 'artist': '洛天依office', 'play_count': 18, 'listened_sec': 3600, 'track_id': None, 'title': None, 'track_play_count': None},
                {'row_type': 'track', 'artist_rank': 1, 'artist': '洛天依office', 'play_count': None, 'listened_sec': None, 'track_id': 't100', 'title': 'Song Luo', 'track_play_count': 9},
                {'row_type': 'artist', 'artist_rank': 2, 'artist': 'HatsuneMiku', 'play_count': 16, 'listened_sec': 3200, 'track_id': None, 'title': None, 'track_play_count': None},
                {'row_type': 'track', 'artist_rank': 2, 'artist': 'HatsuneMiku', 'play_count': None, 'listened_sec': None, 'track_id': 't200', 'title': 'Song Miku', 'track_play_count': 7},
            ],
            'data_p30_yearly_artist_rank': [
                {'play_year': 2024, 'artist_rank': 1, 'artist': '洛天依office', 'play_count': 12, 'listened_sec': 2400},
                {'play_year': 2025, 'artist_rank': 1, 'artist': 'HatsuneMiku', 'play_count': 16, 'listened_sec': 3200},
            ],
        },
        generated_at='2026-04-30T15:00:00+08:00',
    )

    assert report['pages']['P16']['artist'] == '洛天依'
    assert report['pages']['P27'][0]['artist'] == '洛天依'
    assert report['pages']['P27'][1]['artist'] == '初音未来'
    assert report['pages']['P28']['artist'] == '洛天依'
    assert report['pages']['P29'][0]['artist'] == '洛天依'
    assert report['pages']['P30'][0]['artist'] == '洛天依'
    assert report['pages']['P30'][1]['artist'] == '初音未来'


def test_group_or_unknown_artists_do_not_become_artist_of_year():
    module = load_module()

    report = module.build_report_from_dataset_payloads(
        year=2025,
        dataset_payloads={
            **sample_dataset_payloads(),
            'data_p16_artist_of_year': [
                {'row_type': 'summary', 'artist': '合唱', 'play_count': 30, 'listened_sec': 6000, 'active_months': 8, 'month_no': None, 'month_play_count': None, 'track_id': None, 'title': None, 'track_play_count': None},
                {'row_type': 'summary', 'artist': '洛天依', 'play_count': 18, 'listened_sec': 3600, 'active_months': 6, 'month_no': None, 'month_play_count': None, 'track_id': None, 'title': None, 'track_play_count': None},
                {'row_type': 'month', 'artist': '洛天依', 'play_count': None, 'listened_sec': None, 'active_months': None, 'month_no': 4, 'month_play_count': 8, 'track_id': None, 'title': None, 'track_play_count': None},
                {'row_type': 'track', 'artist': '洛天依', 'play_count': None, 'listened_sec': None, 'active_months': None, 'month_no': None, 'month_play_count': None, 'track_id': 't100', 'title': 'Song Luo', 'track_play_count': 9},
            ],
            'data_p27_top_artists': [
                {'row_type': 'artist', 'artist': '合唱', 'play_count': 30, 'listened_sec': 6000, 'track_id': None, 'title': None, 'track_play_count': None},
                {'row_type': 'track', 'artist': '合唱', 'play_count': None, 'listened_sec': None, 'track_id': 't999', 'title': 'Group Song', 'track_play_count': 12},
                {'row_type': 'artist', 'artist': '未知歌手', 'play_count': 22, 'listened_sec': 4400, 'track_id': None, 'title': None, 'track_play_count': None},
                {'row_type': 'track', 'artist': '未知歌手', 'play_count': None, 'listened_sec': None, 'track_id': 't998', 'title': 'Unknown Song', 'track_play_count': 10},
                {'row_type': 'artist', 'artist': '洛天依', 'play_count': 18, 'listened_sec': 3600, 'track_id': None, 'title': None, 'track_play_count': None},
                {'row_type': 'track', 'artist': '洛天依', 'play_count': None, 'listened_sec': None, 'track_id': 't100', 'title': 'Song Luo', 'track_play_count': 9},
            ],
        },
        generated_at='2026-04-30T15:00:00+08:00',
    )

    assert report['pages']['P16']['artist'] == '洛天依'
    assert report['pages']['P27'][0]['artist'] == '洛天依'


def test_v2_summary_texts_exist_for_core_pages_and_coverage_warning_is_appended():
    module = load_module()

    report = module.build_report_from_dataset_payloads(
        year=2025,
        dataset_payloads={
            **sample_dataset_payloads(),
            'data_lib_overview': {
                **sample_dataset_payloads()['data_lib_overview'],
                'album_coverage_ratio': 0.35,
            },
        },
        generated_at='2026-04-30T15:00:00+08:00',
    )

    assert report['pages']['P08']['summary_text']
    assert 'J-Pop' in report['pages']['P08']['summary_text']
    assert report['pages']['P16']['summary_text']
    assert 'Artist A' in report['pages']['P16']['summary_text']
    assert report['pages']['P23']['summary_text']
    assert 'Album A' in report['pages']['P23']['summary_text']
    assert report['pages']['P25']['summary_text']
    assert 'Song A' in report['pages']['P25']['summary_text']
    assert report['pages']['P31']['summary_text']
    assert '覆盖率' in report['pages']['P31']['summary_text']
    assert '专辑信息仍在补全中' in report['pages']['L01']['summary_text']


def test_build_p05_consumes_only_current_contract_rows():
    module = load_module()

    rows = [
        {'row_type': 'summary', 'metric_key': 'explore', 'play_count': 40, 'active_days': 20, 'ratio': 0.4},
        {'row_type': 'summary', 'metric_key': 'repeat', 'play_count': 60, 'active_days': 18, 'ratio': 0.6},
        {
            'row_type': 'track',
            'metric_key': 'search_top',
            'track_id': 't9',
            'title': 'Song Search',
            'artist': 'Artist Search',
            'play_count': 4,
            'active_days': 3,
        },
        {
            'row_type': 'track',
            'metric_key': 'repeat_top',
            'track_id': 't8',
            'title': 'Song Repeat',
            'artist': 'Artist Repeat',
            'play_count': 9,
            'active_days': 6,
        },
        {
            'row_type': 'summary',
            'metric_key': 'search_top',
            'track_id': 'drifted-search-row-should-be-ignored',
            'title': 'Wrong Search Row',
            'artist': 'Wrong Artist',
            'play_count': 999,
            'active_days': 99,
        },
    ]

    result = module._build_p05(rows)

    assert result == {
        'explore_ratio': 0.4,
        'repeat_ratio': 0.6,
        'explore_play_count': 40,
        'repeat_play_count': 60,
        'search_play_count': 4,
        'repeat_active_days': 18,
        'top_search_track': {
            'track_id': 't9',
            'title': 'Song Search',
            'artist': 'Artist Search',
            'play_count': 4,
            'active_days': 3,
        },
        'top_repeat_track': {
            'track_id': 't8',
            'title': 'Song Repeat',
            'artist': 'Artist Repeat',
            'play_count': 9,
            'active_days': 6,
        },
        'summary_text': '今年你有 40 次探索型播放，60 次循环回听，其中搜索触发了 4 次播放。',
    }


def test_build_p09_preserves_new_track_contract_and_sort_order():
    module = load_module()

    rows = [
        {'period_key': '2025-02', 'genre': 'J-Rock', 'new_track_count': 4, 'ratio': 0.2667},
        {'period_key': '2025-01', 'genre': 'Anime', 'new_track_count': 6, 'ratio': 0.3333},
        {'period_key': '2025-01', 'genre': 'J-Pop', 'new_track_count': 12, 'ratio': 0.6667},
        {'period_key': '2025-02', 'genre': 'Vocaloid', 'new_track_count': 11, 'ratio': 0.7333},
        {'period_key': '2025-02', 'genre': 'Drifted Row', 'play_count': 999, 'ratio': 0.9999},
    ]

    result = module._build_p09(rows)

    assert result == [
        {
            'period_key': '2025-01',
            'top_genre': 'J-Pop',
            'genres': [
                {'genre': 'J-Pop', 'new_track_count': 12, 'ratio': 0.6667},
                {'genre': 'Anime', 'new_track_count': 6, 'ratio': 0.3333},
            ],
            'summary_text': '2025-01 的新歌探索重心是 J-Pop，共发现 12 首。',
        },
        {
            'period_key': '2025-02',
            'top_genre': 'Vocaloid',
            'genres': [
                {'genre': 'Vocaloid', 'new_track_count': 11, 'ratio': 0.7333},
                {'genre': 'J-Rock', 'new_track_count': 4, 'ratio': 0.2667},
            ],
            'summary_text': '2025-02 的新歌探索重心是 Vocaloid，共发现 11 首。',
        },
    ]


def test_build_p09_summary_prefers_recognized_genre_when_unrecognized_is_dominant():
    module = load_module()

    rows = [
        {'period_key': '2025-04', 'genre': '未识别', 'new_track_count': 10, 'ratio': 0.70},
        {'period_key': '2025-04', 'genre': 'Vocaloid', 'new_track_count': 3, 'ratio': 0.21},
        {'period_key': '2025-04', 'genre': 'J-Pop', 'new_track_count': 1, 'ratio': 0.09},
    ]

    result = module._build_p09(rows)

    assert result == [
        {
            'period_key': '2025-04',
            'top_genre': '未识别',
            'genres': [
                {'genre': '未识别', 'new_track_count': 10, 'ratio': 0.70},
                {'genre': 'Vocaloid', 'new_track_count': 3, 'ratio': 0.21},
                {'genre': 'J-Pop', 'new_track_count': 1, 'ratio': 0.09},
            ],
            'summary_text': '2025-04 新歌里未识别曲风较多，已识别部分以 Vocaloid 最突出，共发现 3 首。',
        },
    ]


def test_calendar_summary_is_derived_from_calendar_rows():
    module = load_module()

    report = module.build_report_from_dataset_payloads(
        year=2025,
        dataset_payloads=sample_dataset_payloads(),
        generated_at='2026-04-30T15:00:00+08:00',
    )

    assert report['pages']['P18']['active_day_count'] == 3
    assert report['pages']['P18']['longest_streak_days'] == 2
    assert len(report['pages']['P18']['calendar_heatmap']) == 4


def test_p32_summary_reuses_other_pages():
    module = load_module()

    report = module.build_report_from_dataset_payloads(
        year=2025,
        dataset_payloads=sample_dataset_payloads(),
        generated_at='2026-04-30T15:00:00+08:00',
    )

    p32 = report['pages']['P32']
    assert p32['song_of_year']['track_id'] == 't1'
    assert p32['latest_night_track']['track_id'] == 't3'
    assert p32['year_play_count'] == 100
    assert p32['active_day_count'] == 3
    assert p32['days_since_first_play'] == 485
    assert p32['top_time_bucket'] == 'evening'
    assert p32['artist_of_year']['artist'] == 'Artist A'
    assert p32['album_of_year']['album'] == 'Album A'
    assert p32['most_active_weekday']['weekday_cn'] == '周六'
    assert p32['artist_journey']['first_track']['track_id'] == 't1'
    assert p32['top_credit']['credit_type'] == 'composer'


class FakeCursor:
    PLACEHOLDER_DATASETS = [
        'data_p05_explore_repeat',
        'data_p06_keyword_source_rows',
        'data_p09_genre_evolution',
        'data_p10_taste_inputs',
    ]
    _QUERY_SQL_DATASETS = None

    def __init__(self, dataset_rows):
        self.dataset_rows = dataset_rows
        self.executed = []
        self._current_rows = []
        self.description = []
        self._placeholder_index = 0
        self._sql_match_counts = {}

    @classmethod
    def _normalize_sql(cls, sql):
        return '\n'.join(line.rstrip() for line in sql.strip().splitlines())

    @classmethod
    def _query_sql_datasets(cls):
        if cls._QUERY_SQL_DATASETS is None:
            sql_dataset_map = {}
            for dataset_name, query in query_plan_for_test().items():
                normalized_sql = cls._normalize_sql(query['sql'])
                sql_dataset_map.setdefault(normalized_sql, []).append(dataset_name)
            cls._QUERY_SQL_DATASETS = sql_dataset_map
        return cls._QUERY_SQL_DATASETS

    def _resolve_dataset_name(self, sql):
        normalized_sql = self._normalize_sql(sql)
        dataset_names = self._query_sql_datasets().get(normalized_sql)
        if not dataset_names:
            raise AssertionError(f'unrecognized SQL in FakeCursor: {sql}')
        if len(dataset_names) == 1:
            return dataset_names[0]

        match_index = self._sql_match_counts.get(normalized_sql, 0)
        if match_index >= len(dataset_names):
            raise AssertionError(f'ambiguous SQL exceeded expected executions in FakeCursor: {sql}')
        self._sql_match_counts[normalized_sql] = match_index + 1
        return dataset_names[match_index]

    def execute(self, sql, params=None):
        self.executed.append((sql, params))
        dataset_name = self._resolve_dataset_name(sql)
        if dataset_name in self.PLACEHOLDER_DATASETS:
            expected_dataset_name = self.PLACEHOLDER_DATASETS[self._placeholder_index]
            if dataset_name != expected_dataset_name:
                raise AssertionError(
                    f'placeholder dataset order mismatch: expected {expected_dataset_name}, got {dataset_name}'
                )
            self._placeholder_index += 1
        rows = self.dataset_rows[dataset_name]
        if isinstance(rows, dict):
            rows = [rows]
        self._current_rows = rows
        if rows:
            self.description = [(key,) for key in rows[0].keys()]
        else:
            self.description = []

    def fetchall(self):
        return [tuple(row.values()) for row in self._current_rows]


def test_fake_cursor_keeps_collision_prone_queries_on_expected_datasets():
    cursor = FakeCursor(sample_dataset_payloads())
    query_plan = query_plan_for_test()

    collision_prone_datasets = [
        'data_p16_artist_of_year',
        'data_p28_artist_journey',
        'data_lib_structure',
        'data_p24_top_albums',
        'data_p29_artist_rank_detail',
        'data_p30_yearly_artist_rank',
    ]

    for dataset_name in collision_prone_datasets:
        query = query_plan[dataset_name]
        cursor.execute(query['sql'], query['params'])

        expected_rows = sample_dataset_payloads()[dataset_name]
        expected_first_key = next(iter(expected_rows[0]))
        assert cursor.description[0][0] == expected_first_key


def test_collect_dataset_payloads_uses_query_module():
    module = load_module()
    cursor = FakeCursor(sample_dataset_payloads())

    payloads = module.collect_dataset_payloads(cursor, year=2025)

    assert payloads['data_p01_summary']['days_since_first_play'] == 485
    assert payloads['data_lib_overview']['track_count'] == 1000
    assert payloads['data_lib_structure'][0]['row_type'] == 'format'
    assert payloads['data_p08_genres'][0]['genre'] == 'J-Pop'
    assert len(cursor.executed) == 30


def test_collect_dataset_payloads_feed_build_report_for_p05_and_p09_contract():
    module = load_module()
    cursor = FakeCursor(sample_dataset_payloads())

    payloads = module.collect_dataset_payloads(cursor, year=2025)
    report = module.build_report_from_dataset_payloads(
        year=2025,
        dataset_payloads=payloads,
        generated_at='2026-04-30T15:00:00+08:00',
    )

    assert report['pages']['P05']['search_play_count'] == 4
    assert report['pages']['P05']['repeat_active_days'] == 18
    assert report['pages']['P09'][0]['genres'][0] == {
        'genre': 'J-Pop',
        'new_track_count': 12,
        'ratio': 0.6667,
    }


def test_cli_writes_report_json(tmp_path):
    module = load_module()
    input_path = tmp_path / 'dataset_payloads.json'
    output_path = tmp_path / 'report_2025.json'
    input_path.write_text(json.dumps(sample_dataset_payloads(), ensure_ascii=False), encoding='utf-8')

    result = module.main([
        '--year', '2025',
        '--input-json', str(input_path),
        '--output', str(output_path),
        '--generated-at', '2026-04-30T15:00:00+08:00',
    ])

    saved = json.loads(output_path.read_text(encoding='utf-8'))
    assert result['pages']['P02']['year_play_count'] == 100
    assert saved['pages']['P32']['song_of_year']['track_id'] == 't1'
    assert saved['pages']['P23']['album'] == 'Album A'
    assert saved['pages']['P27'][0]['artist'] == 'Artist A'
    assert saved['pages']['P28']['artist'] == 'Artist A'
    assert saved['pages']['P31']['items'][0]['credit_type'] == 'composer'


def test_parse_db_url_returns_expected_config():
    module = load_module()

    config = module.parse_db_url('mssql+pymssql://sa:ifwlzs@192.168.2.156:1433/db_tgmsg')

    assert config == {
        'server': '192.168.2.156',
        'port': 1433,
        'user': 'sa',
        'password': 'ifwlzs',
        'database': 'db_tgmsg',
    }


def test_cli_can_build_report_from_db_url(monkeypatch, tmp_path):
    module = load_module()
    output_path = tmp_path / 'report_2025.json'
    calls = []

    class FakeConnection:
        def __init__(self):
            self.closed = False

        def cursor(self):
            return object()

        def close(self):
            self.closed = True

    fake_conn = FakeConnection()
    payloads = sample_dataset_payloads()

    monkeypatch.setattr(module, 'connect_db', lambda config: calls.append(('connect', config)) or fake_conn)
    monkeypatch.setattr(module, 'collect_dataset_payloads', lambda cursor, year: calls.append(('collect', year)) or payloads)

    result = module.main([
        '--year', '2025',
        '--db-url', 'mssql+pymssql://sa:ifwlzs@192.168.2.156:1433/db_tgmsg',
        '--output', str(output_path),
        '--generated-at', '2026-04-30T15:00:00+08:00',
    ])

    saved = json.loads(output_path.read_text(encoding='utf-8'))
    assert calls[0][0] == 'connect'
    assert calls[1] == ('collect', 2025)
    assert fake_conn.closed is True
    assert result['pages']['P01']['days_since_first_play'] == 485
    assert saved['pages']['P25']['track_id'] == 't1'


def test_make_json_safe_converts_decimal_values():
    module = load_module()

    payload = {
        'a': Decimal('12.5'),
        'b': [Decimal('1.2'), {'c': Decimal('3')}],
    }

    safe = module.make_json_safe(payload)

    assert safe == {
        'a': 12.5,
        'b': [1.2, {'c': 3.0}],
    }
