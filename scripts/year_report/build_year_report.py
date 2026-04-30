"""Build MVP annual report JSON from SQL dataset payloads."""

import argparse
import json
import os
import sys
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
    p05_rows = dataset_payloads.get('data_p05_explore_repeat') or []
    p06_rows = dataset_payloads.get('data_p06_keyword_source_rows') or []
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

    p05 = {'explore_ratio': 0, 'repeat_ratio': 0, 'top_search_track': None, 'top_repeat_track': None}
    p06 = []
    p09 = []
    p10 = {'taste_score': 0, 'summary_label': '--', 'summary_text': '--'}

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

    p16_summary_row = next((row for row in p16_rows if row.get('row_type') == 'summary'), None)
    p16_month_rows = [row for row in p16_rows if row.get('row_type') == 'month']
    p16_track_row = next((row for row in p16_rows if row.get('row_type') == 'track'), None)
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

    p28_summary_row = next((row for row in p28_rows if row.get('row_type') == 'summary'), None)
    p28_first_track_row = next((row for row in p28_rows if row.get('row_type') == 'first_track'), None)
    p28_peak_day_row = next((row for row in p28_rows if row.get('row_type') == 'peak_day'), None)
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

    p27_artist_rows = [row for row in p27_rows if row.get('row_type') == 'artist']
    p27_track_rows = [row for row in p27_rows if row.get('row_type') == 'track']
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

    p29_artist_rows = [row for row in p29_rows if row.get('row_type') == 'artist']
    p29_track_rows = [row for row in p29_rows if row.get('row_type') == 'track']
    p29 = []
    for artist_row in sorted(p29_artist_rows, key=lambda row: row.get('artist_rank') or 999):
        artist_rank = artist_row.get('artist_rank')
        top_track = next((row for row in p29_track_rows if row.get('artist_rank') == artist_rank), None)
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

    p30 = list(sorted(
        p30_rows,
        key=lambda row: ((row.get('play_year') or 0), (row.get('artist_rank') or 0))
    ))

    p31 = list(sorted(
        p31_rows,
        key=lambda row: (row.get('credit_type') or '', -(row.get('play_count') or 0), -(row.get('listened_sec') or 0))
    ))

    pages = {
        'P01': p01,
        'P02': p02,
        'P03': p03,
        'P05': p05,
        'P06': p06,
        'P08': {
            'top_genres': list(p08),
            'data_coverage': 1.0 if p08 else 0.0,
        },
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
        'P22': list(p22_rows),
        'P23': p23,
        'P24': list(p24_rows),
        'P25': p25,
        'P26': list(p26_rows),
        'P27': p27,
        'P28': p28,
        'P29': p29,
        'P30': p30,
        'P31': p31,
    }

    pages['P32'] = {
        'artist_of_year': p16,
        'album_of_year': p23,
        'artist_journey': p28,
        'most_active_weekday': p17['most_active_weekday'] if p17 else None,
        'song_of_year': p25,
        'top_credit': p31[0] if p31 else None,
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
