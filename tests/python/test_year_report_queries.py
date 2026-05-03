from pathlib import Path
import importlib.util

MODULE_PATH = Path(__file__).resolve().parents[2] / 'scripts' / 'year_report' / 'year_report_queries.py'


def load_module():
    spec = importlib.util.spec_from_file_location('year_report_queries', MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_module_file_exists():
    assert MODULE_PATH.exists()


def test_supported_datasets_cover_mvp_pages():
    module = load_module()

    assert module.SUPPORTED_DATASETS == (
        'data_p01_summary',
        'data_p02_overview',
        'data_p03_explore',
        'data_lib_overview',
        'data_l02_library_growth',
        'data_p05_explore_repeat',
        'data_p06_keyword_source_rows',
        'data_lib_structure',
        'data_p08_genres',
        'data_p09_genre_evolution',
        'data_p10_taste_inputs',
        'data_p12_spring',
        'data_p13_summer',
        'data_p14_autumn',
        'data_p15_winter',
        'data_p16_artist_of_year',
        'data_p17_weekly_pattern',
        'data_p18_calendar',
        'data_p19_time_bucket',
        'data_p20_night',
        'data_p22_repeat_tracks',
        'data_p23_album_of_year',
        'data_p24_top_albums',
        'data_p25_song_of_year',
        'data_p26_top_tracks',
        'data_p27_top_artists',
        'data_p28_artist_journey',
        'data_p29_artist_rank_detail',
        'data_p30_yearly_artist_rank',
        'data_p31_credits',
    )


def test_build_query_plan_injects_year_once_per_dataset():
    module = load_module()

    plan = module.build_query_plan(2025)

    assert set(plan) == set(module.SUPPORTED_DATASETS)
    for dataset_name, query in plan.items():
        assert query['dataset_name'] == dataset_name
        assert query['params'] == (2025,)
        assert query['sql'].count('DECLARE @year int = %s;') == 1


def test_build_query_plan_uses_real_sql_for_p06_and_p10():
    module = load_module()

    plan = module.build_query_plan(2025)

    p06_sql = plan['data_p06_keyword_source_rows']['sql']
    p10_sql = plan['data_p10_taste_inputs']['sql']

    assert plan['data_p06_keyword_source_rows']['params'] == (2025,)
    assert plan['data_p10_taste_inputs']['params'] == (2025,)

    assert 'embedded_lyric' in p06_sql
    assert "N'lyric'" in p06_sql
    assert "N'title'" in p06_sql
    assert "N'file_name'" in p06_sql
    assert 'SELECT 1 AS placeholder' not in p06_sql

    assert 'genre_play_count' in p10_sql
    assert 'genre_first_seen' in p10_sql
    assert 'is_new_genre' in p10_sql
    assert 'artist_count' in p10_sql
    assert 'SELECT 1 AS placeholder' not in p10_sql


def test_build_query_plan_uses_real_sql_for_p05_and_p09():
    module = load_module()

    plan = module.build_query_plan(2025)

    assert 'entry_source' in plan['data_p05_explore_repeat']['sql']
    assert 'year_new_unique_tracks' in plan['data_p09_genre_evolution']['sql']
    assert 'genre_split' in plan['data_p09_genre_evolution']['sql']


def test_p05_sql_exposes_stable_summary_and_top_track_contract_rows():
    module = load_module()

    sql = module.build_query_plan(2025)['data_p05_explore_repeat']['sql']

    assert sql.count("N'summary' AS row_type") == 2
    assert "N'track' AS row_type" in sql
    for metric_key in ("N'explore'", "N'repeat'", "N'search_top'", "N'repeat_top'"):
        assert metric_key in sql

    assert 'top_metric_rows AS (' in sql
    assert "SELECT N'search_top' AS metric_key" in sql
    assert "SELECT N'repeat_top' AS metric_key" in sql
    assert 'top_track_rows AS (' in sql
    assert 'FROM top_metric_rows m' in sql
    assert 'LEFT JOIN search_top s' in sql
    assert 'LEFT JOIN repeat_top r' in sql
    assert (
        'UNION ALL\n'
        'SELECT row_type, metric_key, play_count, track_count, active_days, ratio, track_id, title, artist\n'
        'FROM top_track_rows;'
    ) in sql


def test_p09_sql_builds_explicit_year_new_unique_track_layer_before_genre_aggregation():
    module = load_module()

    sql = module.build_query_plan(2025)['data_p09_genre_evolution']['sql']

    assert 'year_new_unique_tracks AS (' in sql
    assert 'GROUP BY a.track_id' in sql
    assert 'MIN(a.first_played_at) AS first_played_at' in sql
    assert 'genre_split AS (' in sql
    assert 'FROM year_new_unique_tracks y' in sql
    assert 'period_stats AS (' in sql
    assert 'COUNT(*) AS new_track_count' in sql
    assert 'period_totals AS (' in sql
    assert 'SUM(new_track_count) AS total_new_track_count' in sql


def test_p23_p24_sql_excludes_unknown_album_buckets_from_ranking():
    module = load_module()

    plan = module.build_query_plan(2025)
    p23_sql = plan['data_p23_album_of_year']['sql']
    p24_sql = plan['data_p24_top_albums']['sql']

    assert "COALESCE(NULLIF(album, ''), N'未知专辑') AS album" not in p23_sql
    assert "COALESCE(NULLIF(album, ''), N'未知专辑') AS album" not in p24_sql
    assert "GROUP BY COALESCE(NULLIF(album, ''), N'未知专辑')" not in p23_sql
    assert "GROUP BY COALESCE(NULLIF(album, ''), N'未知专辑')" not in p24_sql
    assert "WHERE NULLIF(album, '') IS NOT NULL" in p23_sql
    assert "WHERE NULLIF(album, '') IS NOT NULL" in p24_sql


def test_common_base_cte_joins_artist_alias_table_and_prefers_canonical_artist():
    module = load_module()

    sql = module.build_query_plan(2025)['data_p16_artist_of_year']['sql']

    assert 'artist_alias_map AS (' in sql
    assert 'FROM dbo.ods_jumusic_artist_alias' in sql
    assert 'LEFT JOIN artist_alias_map aam' in sql
    assert "aam.canonical_artist" in sql
    assert "REPLACE(LOWER" in sql


def test_artist_ranking_queries_exclude_group_and_unknown_artists_in_sql():
    module = load_module()

    for dataset_name in (
        'data_p16_artist_of_year',
        'data_p27_top_artists',
        'data_p28_artist_journey',
        'data_p29_artist_rank_detail',
        'data_p30_yearly_artist_rank',
    ):
        sql = module.build_query_plan(2025)[dataset_name]['sql']
        assert "N'未知歌手'" in sql
        assert "N'合唱'" in sql
        assert "N'多歌手'" in sql
        assert "N'Various Artists'" in sql
        assert 'NOT IN (SELECT artist FROM artist_rankable)' in sql


def test_build_query_plan_rejects_non_int_year():
    module = load_module()

    for invalid_year in ('2025', True, False):
        try:
            module.build_query_plan(invalid_year)
        except ValueError as exc:
            assert 'year must be an integer' in str(exc)
        else:
            raise AssertionError(f'expected build_query_plan to reject non-int year: {invalid_year!r}')


def test_map_rows_to_dataset_payload_preserves_supported_shape_contracts():
    module = load_module()

    p01 = module.map_rows_to_dataset_payload('data_p01_summary', [{
        'first_played_at': '2024-01-01T00:00:00+08:00',
        'days_since_first_play': 100,
        'years_since_first_play': 0.3,
    }])
    p04 = module.map_rows_to_dataset_payload('data_lib_overview', [{
        'track_count': 100,
        'artist_count': 40,
        'album_count': 30,
        'genre_count': 12,
        'total_duration_sec': 18000,
        'avg_duration_sec': 180,
        'new_track_count': 12,
        'new_artist_count': 5,
        'new_album_count': 4,
        'lyrics_coverage_ratio': 0.8,
        'cover_coverage_ratio': 0.7,
        'genre_coverage_ratio': 0.6,
        'album_coverage_ratio': 0.5,
        'duration_coverage_ratio': 0.95,
        'artist_coverage_ratio': 0.99,
    }])
    l02 = module.map_rows_to_dataset_payload('data_l02_library_growth', [
        {'row_type': 'month', 'period_key': '2025-01', 'track_count': 8, 'artist_count': 3, 'album_count': 2},
        {'row_type': 'summary', 'period_key': None, 'track_count': 12, 'artist_count': 5, 'album_count': 4},
        {'row_type': 'language', 'bucket_key': 'ja', 'bucket_label': '日语', 'item_count': 6, 'ratio': 0.75},
    ])
    p08 = module.map_rows_to_dataset_payload('data_p08_genres', [
        {'genre': 'J-Pop', 'play_count': 12, 'listened_sec': 3600, 'ratio': 0.4},
        {'genre': 'Anime', 'play_count': 8, 'listened_sec': 2400, 'ratio': 0.2667},
    ])
    p07 = module.map_rows_to_dataset_payload('data_lib_structure', [
        {'row_type': 'format', 'bucket_key': 'flac', 'bucket_label': 'FLAC', 'item_count': 60, 'ratio': 0.6},
        {'row_type': 'duration', 'bucket_key': '2_4', 'bucket_label': '2-4 分钟', 'item_count': 50, 'ratio': 0.5},
        {'row_type': 'genre', 'bucket_key': 'Vocaloid', 'bucket_label': 'Vocaloid', 'item_count': 20, 'ratio': 0.2},
    ])
    p12 = module.map_rows_to_dataset_payload('data_p12_spring', [{
        'season': 'spring',
        'top_track_id': 't1',
        'title': 'Song A',
        'artist': 'Artist A',
        'play_count': 5,
        'listened_sec': 900,
        'active_days': 3,
    }])
    p16 = module.map_rows_to_dataset_payload('data_p16_artist_of_year', [
        {'row_type': 'summary', 'artist': 'Artist A', 'play_count': 20, 'listened_sec': 4200, 'active_months': 6, 'month_no': None, 'month_play_count': None, 'track_id': None, 'title': None, 'track_play_count': None},
        {'row_type': 'month', 'artist': 'Artist A', 'play_count': None, 'listened_sec': None, 'active_months': None, 'month_no': 1, 'month_play_count': 3, 'track_id': None, 'title': None, 'track_play_count': None},
    ])
    p17 = module.map_rows_to_dataset_payload('data_p17_weekly_pattern', [
        {'row_type': 'weekday', 'weekday_num': 1, 'weekday_cn': '周一', 'play_count': 8, 'listened_sec': 1800, 'time_bucket': None, 'bucket_play_count': None},
        {'row_type': 'bucket', 'weekday_num': None, 'weekday_cn': None, 'play_count': None, 'listened_sec': None, 'time_bucket': 'evening', 'bucket_play_count': 20},
    ])
    p18 = module.map_rows_to_dataset_payload('data_p18_calendar', [
        {'date': '2025-01-01', 'play_count': 2, 'listened_sec': 500, 'is_active': 1},
        {'date': '2025-01-02', 'play_count': 0, 'listened_sec': 0, 'is_active': 0},
    ])
    p19 = module.map_rows_to_dataset_payload('data_p19_time_bucket', [
        {'row_type': 'bucket', 'time_bucket': 'evening', 'play_hour': None, 'track_id': None, 'title': None, 'artist_raw': None, 'play_count': 20},
        {'row_type': 'hour', 'time_bucket': None, 'play_hour': 21, 'track_id': None, 'title': None, 'artist_raw': None, 'play_count': 8},
    ])
    p22 = module.map_rows_to_dataset_payload('data_p22_repeat_tracks', [
        {'track_id': 't1', 'title': 'Song A', 'artist': 'Artist A', 'play_count': 9, 'listened_sec': 1600, 'active_days': 4},
    ])
    p23 = module.map_rows_to_dataset_payload('data_p23_album_of_year', [{
        'album': 'Album A', 'artist': 'Artist A', 'play_count': 18, 'listened_sec': 4000, 'active_days': 12, 'track_count': 5
    }])
    p24 = module.map_rows_to_dataset_payload('data_p24_top_albums', [
        {'album': 'Album A', 'artist': 'Artist A', 'play_count': 18, 'listened_sec': 4000, 'active_days': 12, 'track_count': 5, 'album_score': 34.2},
    ])
    p26 = module.map_rows_to_dataset_payload('data_p26_top_tracks', [
        {'track_id': 't1', 'title': 'Song A', 'artist': 'Artist A', 'album': 'Album A', 'play_count': 10, 'listened_sec': 1800, 'active_days': 4},
    ])
    p27 = module.map_rows_to_dataset_payload('data_p27_top_artists', [
        {'row_type': 'artist', 'artist': 'Artist A', 'play_count': 20, 'listened_sec': 3600, 'track_id': None, 'title': None, 'track_play_count': None},
        {'row_type': 'track', 'artist': 'Artist A', 'play_count': None, 'listened_sec': None, 'track_id': 't1', 'title': 'Song A', 'track_play_count': 8},
    ])
    p28 = module.map_rows_to_dataset_payload('data_p28_artist_journey', [
        {'row_type': 'summary', 'artist': 'Artist A', 'first_played_at': '2024-01-01T00:00:00+08:00', 'days_since_first_play': 485, 'peak_date': None, 'peak_play_count': None, 'track_id': None, 'title': None},
        {'row_type': 'first_track', 'artist': 'Artist A', 'first_played_at': None, 'days_since_first_play': None, 'peak_date': None, 'peak_play_count': None, 'track_id': 't1', 'title': 'Song A'},
        {'row_type': 'peak_day', 'artist': 'Artist A', 'first_played_at': None, 'days_since_first_play': None, 'peak_date': '2025-03-01', 'peak_play_count': 5, 'track_id': None, 'title': None},
    ])
    p29 = module.map_rows_to_dataset_payload('data_p29_artist_rank_detail', [
        {'row_type': 'artist', 'artist_rank': 1, 'artist': 'Artist A', 'play_count': 22, 'listened_sec': 4000, 'track_id': None, 'title': None, 'track_play_count': None},
        {'row_type': 'track', 'artist_rank': 1, 'artist': 'Artist A', 'play_count': None, 'listened_sec': None, 'track_id': 't1', 'title': 'Song A', 'track_play_count': 8},
    ])
    p30 = module.map_rows_to_dataset_payload('data_p30_yearly_artist_rank', [
        {'play_year': 2024, 'artist_rank': 1, 'artist': 'Artist A', 'play_count': 22, 'listened_sec': 4000},
    ])
    p31 = module.map_rows_to_dataset_payload('data_p31_credits', [
        {'credit_type': 'composer', 'credit_name': 'Composer A', 'play_count': 12, 'listened_sec': 2400},
    ])

    assert p01['first_played_at'] == '2024-01-01T00:00:00+08:00'
    assert p04['track_count'] == 100
    assert p04['avg_duration_sec'] == 180
    assert p04['new_track_count'] == 12
    assert p04['lyrics_coverage_ratio'] == 0.8
    assert l02[0]['row_type'] == 'month'
    assert l02[1]['row_type'] == 'summary'
    assert l02[2]['bucket_label'] == '日语'
    assert p07[0]['row_type'] == 'format'
    assert p07[2]['bucket_label'] == 'Vocaloid'
    assert p08[0]['genre'] == 'J-Pop'
    assert p12['season'] == 'spring'
    assert p16[0]['row_type'] == 'summary'
    assert p17[0]['row_type'] == 'weekday'
    assert p18[1]['is_active'] == 0
    assert p19[0]['row_type'] == 'bucket'
    assert p22[0]['track_id'] == 't1'
    assert p23['album'] == 'Album A'
    assert p24[0]['album_score'] == 34.2
    assert p26[0]['album'] == 'Album A'
    assert p27[1]['row_type'] == 'track'
    assert p28[0]['row_type'] == 'summary'
    assert p29[0]['row_type'] == 'artist'
    assert p30[0]['play_year'] == 2024
    assert p31[0]['credit_type'] == 'composer'


def test_map_rows_to_dataset_payload_returns_many_rows_for_batch2_placeholder_datasets():
    module = load_module()

    batch2_rows = {
        'data_p05_explore_repeat': [
            {'row_type': 'summary', 'metric_key': 'explore', 'play_count': 21, 'track_count': 7, 'active_days': 10, 'ratio': 0.4200, 'track_id': None, 'title': None, 'artist': None},
            {'row_type': 'track', 'metric_key': 'repeat_top', 'play_count': 9, 'track_count': None, 'active_days': 4, 'ratio': None, 'track_id': 't1', 'title': 'Song A', 'artist': 'Artist A'},
        ],
        'data_p06_keyword_source_rows': [
            {'source_type': 'lyric', 'source_value': 'tokyo', 'play_count': 6},
            {'source_type': 'title', 'source_value': 'night', 'play_count': 3},
        ],
        'data_p09_genre_evolution': [
            {'period_key': '2025-01', 'genre': 'Anime', 'new_track_count': 4, 'ratio': 0.5000},
            {'period_key': '2025-02', 'genre': 'J-Pop', 'new_track_count': 5, 'ratio': 0.6250},
        ],
        'data_p10_taste_inputs': [
            {'genre': 'J-Pop', 'artist': 'Artist A', 'track_id': 't1', 'play_count': 5},
            {'genre': 'Anime', 'artist': 'Artist B', 'track_id': 't2', 'play_count': 3},
        ],
    }

    for dataset_name, rows in batch2_rows.items():
        payload = module.map_rows_to_dataset_payload(dataset_name, rows)
        assert isinstance(payload, list)
        assert payload == rows


def test_dataset_structure_contracts():
    module = load_module()

    assert module.DATASET_SHAPES['data_p01_summary'] == 'one'
    assert module.DATASET_SHAPES['data_p02_overview'] == 'one'
    assert module.DATASET_SHAPES['data_p03_explore'] == 'one'
    assert module.DATASET_SHAPES['data_lib_overview'] == 'one'
    assert module.DATASET_SHAPES['data_l02_library_growth'] == 'many'
    assert module.DATASET_SHAPES['data_p05_explore_repeat'] == 'many'
    assert module.DATASET_SHAPES['data_p06_keyword_source_rows'] == 'many'
    assert module.DATASET_SHAPES['data_lib_structure'] == 'many'
    assert module.DATASET_SHAPES['data_p08_genres'] == 'many'
    assert module.DATASET_SHAPES['data_p09_genre_evolution'] == 'many'
    assert module.DATASET_SHAPES['data_p10_taste_inputs'] == 'many'
    assert module.DATASET_SHAPES['data_p12_spring'] == 'one'
    assert module.DATASET_SHAPES['data_p13_summer'] == 'one'
    assert module.DATASET_SHAPES['data_p14_autumn'] == 'one'
    assert module.DATASET_SHAPES['data_p15_winter'] == 'one'
    assert module.DATASET_SHAPES['data_p16_artist_of_year'] == 'many'
    assert module.DATASET_SHAPES['data_p17_weekly_pattern'] == 'many'
    assert module.DATASET_SHAPES['data_p18_calendar'] == 'many'
    assert module.DATASET_SHAPES['data_p19_time_bucket'] == 'many'
    assert module.DATASET_SHAPES['data_p20_night'] == 'one'
    assert module.DATASET_SHAPES['data_p22_repeat_tracks'] == 'many'
    assert module.DATASET_SHAPES['data_p23_album_of_year'] == 'one'
    assert module.DATASET_SHAPES['data_p24_top_albums'] == 'many'
    assert module.DATASET_SHAPES['data_p25_song_of_year'] == 'one'
    assert module.DATASET_SHAPES['data_p26_top_tracks'] == 'many'
    assert module.DATASET_SHAPES['data_p27_top_artists'] == 'many'
    assert module.DATASET_SHAPES['data_p28_artist_journey'] == 'many'
    assert module.DATASET_SHAPES['data_p30_yearly_artist_rank'] == 'many'
    assert module.DATASET_SHAPES['data_p29_artist_rank_detail'] == 'many'
    assert module.DATASET_SHAPES['data_p31_credits'] == 'many'


def test_map_rows_to_dataset_payload_returns_empty_shape_when_no_rows():
    module = load_module()

    assert module.map_rows_to_dataset_payload('data_p01_summary', []) is None
    assert module.map_rows_to_dataset_payload('data_p08_genres', []) == []


def test_library_query_sql_exposes_real_growth_and_coverage_fields():
    module = load_module()

    plan = module.build_query_plan(2025)
    overview_sql = plan['data_lib_overview']['sql']
    growth_sql = plan['data_l02_library_growth']['sql']
    structure_sql = plan['data_lib_structure']['sql']

    assert 'new_track_count' in overview_sql
    assert 'new_artist_count' in overview_sql
    assert 'new_album_count' in overview_sql
    assert 'file_mtime' in overview_sql
    assert 'etl_created_at' in overview_sql
    assert 'lyrics_coverage_ratio' in overview_sql
    assert 'embedded_lyric' in overview_sql
    assert 'cover_coverage_ratio' in overview_sql
    assert 'genre_coverage_ratio' in overview_sql
    assert 'album_coverage_ratio' in overview_sql
    assert 'duration_coverage_ratio' in overview_sql
    assert 'artist_coverage_ratio' in overview_sql

    assert 'data_l02_library_growth' in module.SUPPORTED_DATASETS
    assert "N'month' AS row_type" in growth_sql
    assert "N'summary' AS row_type" in growth_sql
    assert 'file_mtime' in growth_sql
    assert 'etl_created_at' in growth_sql
    assert 'embedded_lyric' in growth_sql
    assert "N'纯音乐'" in growth_sql
    assert "N'日语'" in growth_sql
    assert "N'中文'" in growth_sql
    assert "N'英语'" in growth_sql
    assert 'period_key' in growth_sql
    assert 'track_count' in growth_sql
    assert 'artist_count' in growth_sql
    assert 'album_count' in growth_sql
    assert "N'genre' AS row_type" in growth_sql
    assert "N'language' AS row_type" in growth_sql

    assert "N'language' AS row_type" in structure_sql
    assert 'language_rows AS (' in structure_sql
    assert 'embedded_lyric' in structure_sql
    assert "N'纯音乐'" in structure_sql
    assert "N'日语'" in structure_sql
    assert "N'中文'" in structure_sql



def test_genre_queries_prefer_structured_essentia_parent_child_path_fields():
    module = load_module()
    plan = module.build_query_plan(2025)

    p08_sql = plan['data_p08_genres']['sql']
    p09_sql = plan['data_p09_genre_evolution']['sql']
    p10_sql = plan['data_p10_taste_inputs']['sql']
    l03_sql = plan['data_lib_structure']['sql']

    assert 'genre_essentia_parent' in p08_sql or 'genre_essentia_child' in p08_sql or 'genre_essentia_path' in p08_sql
    assert 'genre_essentia_parent' in p09_sql or 'genre_essentia_child' in p09_sql or 'genre_essentia_path' in p09_sql
    assert 'genre_essentia_parent' in p10_sql or 'genre_essentia_child' in p10_sql or 'genre_essentia_path' in p10_sql
    assert 'genre_essentia_parent' in l03_sql or 'genre_essentia_child' in l03_sql or 'genre_essentia_path' in l03_sql
    assert 'ods_jumusic_genre_dim' in p08_sql
    assert 'ods_jumusic_genre_dim' in p09_sql
    assert 'ods_jumusic_genre_dim' in p10_sql
    assert 'ods_jumusic_genre_dim' in l03_sql
