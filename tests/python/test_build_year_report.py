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
        'data_p05_explore_repeat': [
            {'metric_key': 'explore_ratio', 'metric_value': 0.4, 'track_id': None, 'title': None, 'artist': None, 'play_count': None},
            {'metric_key': 'repeat_ratio', 'metric_value': 0.6, 'track_id': None, 'title': None, 'artist': None, 'play_count': None},
            {'metric_key': 'top_search_track', 'metric_value': None, 'track_id': 't9', 'title': 'Song Search', 'artist': 'Artist Search', 'play_count': 4},
            {'metric_key': 'top_repeat_track', 'metric_value': None, 'track_id': 't1', 'title': 'Song A', 'artist': 'Artist A', 'play_count': 9},
        ],
        'data_p06_keyword_source_rows': [
            {'text_value': 'hello', 'source_type': 'keyword', 'source_value': '搜索', 'weight': 0.9},
            {'text_value': 'world', 'source_type': 'lyric', 'source_value': '歌词', 'weight': 0.5},
        ],
        'data_p08_genres': [
            {'genre': 'J-Pop', 'play_count': 40, 'listened_sec': 8000, 'ratio': 0.4},
            {'genre': 'Anime', 'play_count': 30, 'listened_sec': 6000, 'ratio': 0.3},
        ],
        'data_p09_genre_evolution': [
            {'period_key': '2025-01', 'genre': 'J-Pop', 'play_count': 12, 'listened_sec': 2400},
            {'period_key': '2025-02', 'genre': 'Anime', 'play_count': 10, 'listened_sec': 2000},
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
    assert set(report['pages']) == {'P01', 'P02', 'P03', 'P05', 'P06', 'P08', 'P09', 'P10', 'P12', 'P13', 'P14', 'P15', 'P16', 'P17', 'P18', 'P19', 'P20', 'P22', 'P23', 'P24', 'P25', 'P26', 'P27', 'P28', 'P29', 'P30', 'P31', 'P32'}
    assert report['pages']['P05']['explore_ratio'] == 0.4
    assert report['pages']['P05']['top_search_track']['track_id'] == 't9'
    assert report['pages']['P06'][0]['keyword'] == 'hello'
    assert report['pages']['P09'][0]['period_key'] == '2025-01'
    assert report['pages']['P10']['taste_score'] >= 0
    assert report['pages']['P10']['summary_label']
    assert report['pages']['P20']['latest_night_track']['track_id'] == 't3'
    assert report['pages']['P25']['track_id'] == 't1'
    assert report['pages']['P12']['season'] == 'spring'
    assert report['pages']['P16']['artist'] == 'Artist A'
    assert report['pages']['P17']['most_active_weekday']['weekday_cn'] == '周六'
    assert report['pages']['P19']['top_time_bucket'] == 'evening'
    assert report['pages']['P22'][0]['track_id'] == 't1'
    assert report['pages']['P23']['album'] == 'Album A'
    assert report['pages']['P24'][0]['album'] == 'Album A'
    assert report['pages']['P26'][0]['track_id'] == 't1'
    assert report['pages']['P27'][0]['artist'] == 'Artist A'
    assert report['pages']['P28']['first_track']['track_id'] == 't1'
    assert report['pages']['P29'][0]['artist'] == 'Artist A'
    assert report['pages']['P30'][0]['play_year'] == 2024
    assert report['pages']['P31'][0]['credit_type'] == 'composer'


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

    def __init__(self, dataset_rows):
        self.dataset_rows = dataset_rows
        self.executed = []
        self._current_rows = []
        self.description = []
        self._placeholder_index = 0

    def execute(self, sql, params=None):
        self.executed.append((sql, params))
        marker_map = {
            'data_p01_summary': 'days_since_first_play',
            'data_p02_overview': 'year_play_count',
            'data_p03_explore': 'artist_count',
            'data_p05_explore_repeat': 'metric_key',
            'data_p06_keyword_source_rows': 'text_value',
            'data_p08_genres': 'TOP 5',
            'data_p09_genre_evolution': 'period_key',
            'data_p10_taste_inputs': 'is_new_genre',
            'data_p12_spring': "@season = N'spring'",
            'data_p13_summer': "@season = N'summer'",
            'data_p14_autumn': "@season = N'autumn'",
            'data_p15_winter': "@season = N'winter'",
            'data_p16_artist_of_year': "N'summary' AS row_type",
            'data_p17_weekly_pattern': "N'weekday' AS row_type",
            'data_p18_calendar': 'AS [date]',
            'data_p19_time_bucket': "N'bucket' AS row_type",
            'data_p20_night': 'night_session_count',
            'data_p22_repeat_tracks': 'active_days',
            'data_p23_album_of_year': 'album_score',
            'data_p24_top_albums': 'TOP 10',
            'data_p25_song_of_year': 'song_score',
            'data_p26_top_tracks': 'TOP 20',
            'data_p27_top_artists': "N'artist' AS row_type",
            'data_p28_artist_journey': "N'summary' AS row_type",
            'data_p29_artist_rank_detail': 'artist_rank',
            'data_p30_yearly_artist_rank': 'artist_rank',
            'data_p31_credits': 'credit_type',
        }
        dataset_name = next((name for name, marker in marker_map.items() if marker in sql), None)
        if dataset_name is None and 'SELECT 1 AS placeholder WHERE 1 = 0;' in sql:
            dataset_name = self.PLACEHOLDER_DATASETS[self._placeholder_index]
            self._placeholder_index += 1
        if dataset_name is None:
            raise AssertionError(f'unrecognized SQL in FakeCursor: {sql}')
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


def test_collect_dataset_payloads_uses_query_module():
    module = load_module()
    cursor = FakeCursor(sample_dataset_payloads())

    payloads = module.collect_dataset_payloads(cursor, year=2025)

    assert payloads['data_p01_summary']['days_since_first_play'] == 485
    assert payloads['data_p08_genres'][0]['genre'] == 'J-Pop'
    assert len(cursor.executed) == 27


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
    assert saved['pages']['P31'][0]['credit_type'] == 'composer'


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
