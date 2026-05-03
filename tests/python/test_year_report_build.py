from pathlib import Path
import importlib.util

MODULE_PATH = Path(__file__).resolve().parents[2] / 'scripts' / 'year_report' / 'build_year_report.py'


def load_module():
    """按文件路径加载年报构建模块，避免当前仓库尚未配置 Python 包结构时导入失败。"""
    spec = importlib.util.spec_from_file_location('build_year_report', MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module



def test_year_report_module_file_exists():
    assert MODULE_PATH.exists()



def test_build_year_report_includes_confirmed_pages_in_order():
    module = load_module()

    report = module.build_year_report({'year': 2025})
    page_ids = [page['page_id'] for page in report['pages']]
    expected_sequence = ['P20', 'P21', 'P23', 'P24', 'P31', 'L01', 'L04', 'L02', 'L03', 'P32']

    indices = [page_ids.index(page_id) for page_id in expected_sequence]

    assert indices == sorted(indices)



def test_build_year_report_exposes_minimum_contract_for_priority_pages():
    module = load_module()

    report = module.build_year_report({'year': 2025})
    pages = {page['page_id']: page for page in report['pages']}

    assert pages['P21']['title']
    assert isinstance(pages['P21']['latest_night_history'], list)
    assert 'summary_text' in pages['P21']

    assert pages['P31']['title']
    assert isinstance(pages['P31']['coverage'], dict)
    assert isinstance(pages['P31']['cover_color_summary'], dict)
    assert isinstance(pages['P31']['cover_color_summary']['top_colors'], list)

    assert pages['L04']['title']
    assert isinstance(pages['L04']['library_artist_ranking'], list)
    assert isinstance(pages['L04']['new_artist_ranking'], list)



def test_build_year_report_aggregates_p21_latest_night_history_by_year():
    module = load_module()

    report = module.build_year_report({
        'year': 2025,
        'play_history': [
            {
                'year': 2024,
                'night_sort_minute': 1595,
                'latest_time': '02:35',
                'track_title': '夜航星',
                'artist_display': '不才',
                'cover_path': 'covers/2024-a.jpg',
            },
            {
                'year': 2024,
                'night_sort_minute': 1510,
                'latest_time': '01:10',
                'track_title': '海底',
                'artist_display': '一支榴莲',
                'cover_path': 'covers/2024-b.jpg',
            },
            {
                'year': 2025,
                'night_sort_minute': 1628,
                'latest_time': '03:08',
                'track_title': '若月亮没来',
                'artist_display': '王宇宙Leto',
                'cover_path': 'covers/2025-a.jpg',
            },
            {
                'year': 2023,
                'night_sort_minute': 1465,
                'latest_time': '00:25',
                'track_title': '夜空中最亮的星',
                'artist_display': '逃跑计划',
                'cover_path': 'covers/2023-a.jpg',
            },
        ],
    })
    pages = {page['page_id']: page for page in report['pages']}
    p21 = pages['P21']

    assert p21['peak_record_year'] == 2025
    assert [item['year'] for item in p21['latest_night_history']] == [2023, 2024, 2025]
    assert p21['latest_night_history'][1]['track_title'] == '夜航星'
    assert p21['latest_night_history'][2]['latest_time'] == '03:08'
    assert p21['latest_night_history'][2]['is_peak_record'] is True



def test_build_year_report_aggregates_p20_latest_night_record_and_representative_tracks():
    module = load_module()

    report = module.build_year_report({
        'year': 2025,
        'play_history': [
            {
                'year': 2025,
                'track_id': 't1',
                'track_title': '夜航星',
                'artist_display': '不才',
                'latest_time': '02:35',
                'night_sort_minute': 1595,
                'cover_path': 'covers/t1.jpg',
            },
            {
                'year': 2025,
                'track_id': 't1',
                'track_title': '夜航星',
                'artist_display': '不才',
                'latest_time': '01:45',
                'night_sort_minute': 1545,
                'cover_path': 'covers/t1.jpg',
            },
            {
                'year': 2025,
                'track_id': 't2',
                'track_title': '海底',
                'artist_display': '一支榴莲',
                'latest_time': '01:20',
                'night_sort_minute': 1520,
                'cover_path': 'covers/t2.jpg',
            },
            {
                'year': 2024,
                'track_id': 'old',
                'track_title': '旧年深夜歌',
                'artist_display': '旧歌手',
                'latest_time': '03:00',
                'night_sort_minute': 1620,
                'cover_path': 'covers/old.jpg',
            },
        ],
    })
    p20 = {page['page_id']: page for page in report['pages']}['P20']

    assert p20['latest_night_record']['track_title'] == '夜航星'
    assert p20['latest_night_record']['latest_time'] == '02:35'
    assert p20['late_night_total'] == 3
    assert p20['late_night_track_total'] == 2
    assert [item['track_title'] for item in p20['representative_tracks']] == ['夜航星', '海底']
    assert p20['representative_tracks'][0]['late_night_play_total'] == 2


def test_build_year_report_aggregates_p31_coverage_and_cover_colors():
    module = load_module()

    report = module.build_year_report({
        'year': 2025,
        'library_tracks': [
            {
                'track_id': 't1',
                'artist_display': 'Aimer',
                'album_display': 'Open α Door',
                'duration_sec': 245,
                'lyric_text': 'hello',
                'cover_path': 'covers/a.jpg',
                'cover_color': '#112233',
                'primary_genre': 'J-Pop',
                'composer': '梶浦由记',
            },
            {
                'track_id': 't2',
                'artist_display': 'Aimer',
                'album_display': 'Open α Door',
                'duration_sec': 255,
                'lyric_text': None,
                'cover_path': 'covers/b.jpg',
                'cover_color': '#112233',
                'primary_genre': None,
                'composer': None,
            },
            {
                'track_id': 't3',
                'artist_display': 'YOASOBI',
                'album_display': None,
                'duration_sec': None,
                'lyric_text': 'world',
                'cover_path': None,
                'cover_color': None,
                'primary_genre': 'J-Pop',
                'composer': 'Ayase',
            },
            {
                'track_id': 't4',
                'artist_display': None,
                'album_display': '散曲集',
                'duration_sec': 199,
                'lyric_text': None,
                'cover_path': 'covers/d.jpg',
                'cover_color': '#445566',
                'primary_genre': 'Anime',
                'composer': None,
            },
        ],
    })
    pages = {page['page_id']: page for page in report['pages']}
    p31 = pages['P31']

    assert p31['coverage']['lyrics_ratio'] == 0.5
    assert p31['coverage']['cover_ratio'] == 0.75
    assert p31['coverage']['genre_ratio'] == 0.75
    assert p31['coverage']['album_ratio'] == 0.75
    assert p31['coverage']['artist_ratio'] == 0.75
    assert p31['coverage']['duration_ratio'] == 0.75
    assert p31['coverage']['credit_ratio'] == 0.5
    assert p31['cover_color_summary']['counted_track_total'] == 3
    assert p31['cover_color_summary']['excluded_track_total'] == 1
    assert p31['cover_color_summary']['top_colors'][0]['color_hex'] == '#112233'
    assert p31['cover_color_summary']['top_colors'][0]['track_count'] == 2



def test_build_year_report_aggregates_p23_top_album_and_p24_album_ranking():
    module = load_module()

    report = module.build_year_report({
        'year': 2025,
        'play_history': [
            {
                'year': 2025,
                'track_id': 'a1',
                'track_title': 'Song A1',
                'artist_display': 'Aimer',
                'album_display': 'Album A',
                'play_count': 5,
                'active_days': 3,
                'listened_sec': 500,
                'cover_path': 'covers/a.jpg',
            },
            {
                'year': 2025,
                'track_id': 'a2',
                'track_title': 'Song A2',
                'artist_display': 'Aimer',
                'album_display': 'Album A',
                'play_count': 4,
                'active_days': 2,
                'listened_sec': 420,
                'cover_path': 'covers/a.jpg',
            },
            {
                'year': 2025,
                'track_id': 'b1',
                'track_title': 'Song B1',
                'artist_display': 'YOASOBI',
                'album_display': 'Album B',
                'play_count': 6,
                'active_days': 2,
                'listened_sec': 360,
                'cover_path': 'covers/b.jpg',
            },
            {
                'year': 2025,
                'track_id': 'x1',
                'track_title': 'Unknown Song',
                'artist_display': 'Unknown',
                'album_display': 'unknown',
                'play_count': 100,
                'active_days': 10,
                'listened_sec': 999,
                'cover_path': 'covers/x.jpg',
            },
        ],
    })
    pages = {page['page_id']: page for page in report['pages']}
    p23 = pages['P23']
    p24 = pages['P24']

    assert p23['top_album']['album_display'] == 'Album A'
    assert p23['top_album']['play_total'] == 9
    assert p23['top_album']['track_total'] == 2
    assert p23['top_album']['representative_track_title'] == 'Song A1'
    assert [item['album_display'] for item in p24['album_ranking']] == ['Album A', 'Album B']
    assert p24['album_ranking'][0]['rank'] == 1
    assert p24['album_ranking'][1]['rank'] == 2


def test_build_year_report_aggregates_l04_artist_rankings():
    module = load_module()

    report = module.build_year_report({
        'year': 2025,
        'library_tracks': [
            {
                'track_id': 'a1',
                'artist_display': 'Aimer',
                'album_display': 'Album A',
                'track_title': 'Song A1',
                'first_added_year': 2025,
            },
            {
                'track_id': 'a2',
                'artist_display': 'Aimer',
                'album_display': 'Album B',
                'track_title': 'Song A2',
                'first_added_year': 2024,
            },
            {
                'track_id': 'a3',
                'artist_display': 'Aimer',
                'album_display': 'Album B',
                'track_title': 'Song A3',
                'first_added_year': 2025,
            },
            {
                'track_id': 'y1',
                'artist_display': 'YOASOBI',
                'album_display': 'Album Y',
                'track_title': 'Song Y1',
                'first_added_year': 2025,
            },
            {
                'track_id': 'z1',
                'artist_display': 'ZUTOMAYO',
                'album_display': 'Album Z',
                'track_title': 'Song Z1',
                'first_added_year': 2023,
            },
            {
                'track_id': 'u1',
                'artist_display': None,
                'album_display': 'Unknown Album',
                'track_title': 'Unknown Song',
                'first_added_year': 2025,
            },
        ],
    })
    pages = {page['page_id']: page for page in report['pages']}
    l04 = pages['L04']

    assert [item['artist_display'] for item in l04['library_artist_ranking']] == ['Aimer', 'YOASOBI', 'ZUTOMAYO']
    assert l04['library_artist_ranking'][0]['track_total'] == 3
    assert l04['library_artist_ranking'][0]['album_total'] == 2
    assert l04['library_artist_ranking'][0]['top_track_title'] == 'Song A1'
    assert [item['artist_display'] for item in l04['new_artist_ranking']] == ['Aimer', 'YOASOBI']
    assert l04['new_artist_ranking'][0]['new_track_total'] == 2
    assert l04['new_artist_ranking'][1]['new_album_total'] == 1


def test_build_year_report_supports_primary_and_weighted_genre_views():
    module = load_module()

    report = module.build_year_report({
        'year': 2025,
        'library_tracks': [
            {
                'track_id': 't1',
                'track_title': 'Song T1',
                'primary_genre': None,
            },
            {
                'track_id': 't2',
                'track_title': 'Song T2',
                'primary_genre': None,
            },
            {
                'track_id': 't3',
                'track_title': 'Song T3',
                'primary_genre': 'Vocaloid',
            },
        ],
        'genre_matches': [
            {
                'track_id': 't1',
                'genre_name': 'Pop',
                'match_score': 0.62,
            },
            {
                'track_id': 't1',
                'genre_name': 'Anime',
                'match_score': 0.21,
            },
            {
                'track_id': 't1',
                'genre_name': 'Rock',
                'match_score': 0.11,
            },
            {
                'track_id': 't2',
                'genre_name': 'Anime',
                'match_score': 0.80,
            },
            {
                'track_id': 't2',
                'genre_name': 'Pop',
                'match_score': 0.20,
            },
        ],
    })
    pages = {page['page_id']: page for page in report['pages']}
    l03 = pages['L03']

    # 主曲风口径应取每首歌最高置信度的曲风，并保留无映射歌曲的原始主曲风。
    assert l03['primary_genre_distribution'] == [
        {'genre_name': 'Anime', 'track_count': 1},
        {'genre_name': 'Pop', 'track_count': 1},
        {'genre_name': 'Vocaloid', 'track_count': 1},
    ]
    # 加权口径应把同一首歌的多个候选曲风都累加进来，按置信度折算歌曲条数。
    assert l03['weighted_genre_distribution'] == [
        {'genre_name': 'Anime', 'weighted_track_count': 1.01},
        {'genre_name': 'Vocaloid', 'weighted_track_count': 1.0},
        {'genre_name': 'Pop', 'weighted_track_count': 0.82},
        {'genre_name': 'Rock', 'weighted_track_count': 0.11},
    ]


def test_build_year_report_aggregates_l02_growth_metrics_and_monthly_growth():
    module = load_module()

    report = module.build_year_report({
        'year': 2025,
        'library_tracks': [
            {'track_id': 't1', 'artist_display': 'Aimer', 'album_display': 'Album A', 'first_added_year': 2025, 'first_added_month': 1},
            {'track_id': 't2', 'artist_display': 'Aimer', 'album_display': 'Album A', 'first_added_year': 2025, 'first_added_month': 1},
            {'track_id': 't3', 'artist_display': 'YOASOBI', 'album_display': 'Album B', 'first_added_year': 2025, 'first_added_month': 2},
            {'track_id': 't4', 'artist_display': 'ZUTOMAYO', 'album_display': 'Album Z', 'first_added_year': 2024, 'first_added_month': 12},
        ],
    })
    l02 = {page['page_id']: page for page in report['pages']}['L02']

    assert l02['growth_metrics'] == {
        'new_track_total': 3,
        'new_artist_total': 2,
        'new_album_total': 2,
    }
    assert l02['monthly_growth'] == [
        {'month': 1, 'new_track_total': 2, 'new_artist_total': 1, 'new_album_total': 1},
        {'month': 2, 'new_track_total': 1, 'new_artist_total': 1, 'new_album_total': 1},
    ]


def test_build_year_report_returns_empty_l02_monthly_growth_when_month_is_missing():
    module = load_module()

    report = module.build_year_report({
        'year': 2025,
        'library_tracks': [
            {'track_id': 't1', 'artist_display': 'Aimer', 'album_display': 'Album A', 'first_added_year': 2025},
        ],
    })
    l02 = {page['page_id']: page for page in report['pages']}['L02']

    assert l02['growth_metrics']['new_track_total'] == 1
    assert l02['monthly_growth'] == []


def test_build_year_report_builds_p32_summary_cards_from_existing_sections():
    module = load_module()

    report = module.build_year_report({
        'year': 2025,
        'play_history': [
            {
                'year': 2025,
                'track_id': 't1',
                'track_title': '夜航星',
                'artist_display': '不才',
                'latest_time': '02:35',
                'night_sort_minute': 1595,
                'album_display': 'Album A',
                'play_count': 5,
                'active_days': 3,
                'listened_sec': 500,
                'cover_path': 'covers/t1.jpg',
            },
            {
                'year': 2025,
                'track_id': 't2',
                'track_title': 'Song A2',
                'artist_display': 'Aimer',
                'album_display': 'Album A',
                'play_count': 4,
                'active_days': 2,
                'listened_sec': 420,
                'cover_path': 'covers/t1.jpg',
            },
        ],
        'library_tracks': [
            {
                'track_id': 'n1',
                'artist_display': 'Aimer',
                'album_display': 'Album A',
                'first_added_year': 2025,
                'primary_genre': 'J-Pop',
                'cover_color': '#112233',
                'track_title': 'Add A',
            },
            {
                'track_id': 'n2',
                'artist_display': 'YOASOBI',
                'album_display': 'Album B',
                'first_added_year': 2025,
                'primary_genre': 'Anime',
                'cover_color': '#223344',
                'track_title': 'Add B',
            },
        ],
    })
    p32 = {page['page_id']: page for page in report['pages']}['P32']

    card_ids = [card['card_id'] for card in p32['summary_cards']]

    assert 'latest-night' in card_ids
    assert 'top-album' in card_ids
    assert 'top-new-artist' in card_ids
    assert 'library-structure' in card_ids
    assert p32['summary_text']


def test_build_year_report_uses_genre_matches_for_genre_coverage_when_primary_is_missing():
    module = load_module()

    report = module.build_year_report({
        'year': 2025,
        'library_tracks': [
            {
                'track_id': 't1',
                'primary_genre': None,
            },
            {
                'track_id': 't2',
                'primary_genre': None,
            },
        ],
        'genre_matches': [
            {
                'track_id': 't1',
                'genre_name': 'J-Pop',
                'match_score': 0.66,
            },
        ],
    })
    pages = {page['page_id']: page for page in report['pages']}
    p31 = pages['P31']

    # 即使旧字段 primary_genre 缺失，只要曲风映射表中存在候选结果，也应视为已识别曲风。
    assert p31['coverage']['genre_ratio'] == 0.5


def test_build_year_report_cli_writes_output_json(tmp_path):
    import json
    import subprocess
    import sys

    output_path = tmp_path / 'report_preview.json'
    input_path = tmp_path / 'input.json'
    input_path.write_text(json.dumps({'year': 2025, 'play_history': [], 'library_tracks': []}), encoding='utf-8')

    completed = subprocess.run(
        [sys.executable, str(MODULE_PATH), '--input-json', str(input_path), '--output', str(output_path)],
        check=True,
        capture_output=True,
        text=True,
    )

    assert output_path.exists()
    payload = json.loads(output_path.read_text(encoding='utf-8'))
    assert payload['year'] == 2025
    assert isinstance(payload['pages'], list)
    assert 'Wrote year report JSON' in completed.stdout
