from pathlib import Path
import importlib.util
import json

MODULE_PATH = Path(__file__).resolve().parents[2] / 'scripts' / 'play_history_etl' / 'load_play_history.py'


def load_module():
    spec = importlib.util.spec_from_file_location('load_play_history', MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def sample_payload():
    return {
        'type': 'playHistoryExport_v1',
        'exportedAt': 1710000000000,
        'timezone': 'Asia/Shanghai',
        'range': {'preset': 'all', 'start': None, 'end': None},
        'count': 1,
        'items': [
            {
                'aggregateSongId': 'agg-1',
                'sourceItemId': 'src-1',
                'startedAt': 1710000000000,
                'endedAt': 1710000180000,
                'listenedSec': 180,
                'durationSec': 200,
                'countedPlay': True,
                'completionRate': 0.9,
                'endReason': 'completed',
                'entrySource': 'queue',
                'seekCount': 2,
                'seekForwardSec': 8,
                'seekBackwardSec': 3,
                'startYear': 2024,
                'startMonth': 3,
                'startDay': 9,
                'startDateKey': '2024-03-09',
                'startWeekday': 6,
                'startHour': 22,
                'startSeason': 'spring',
                'startTimeBucket': 'night',
                'nightOwningDateKey': '2024-03-09',
                'nightSortMinute': 1320,
                'titleSnapshot': 'Song A',
                'artistSnapshot': 'Singer A',
                'albumSnapshot': 'Album A',
                'providerTypeSnapshot': 'local',
                'fileNameSnapshot': 'a.mp3',
                'remotePathSnapshot': '/music/a.mp3',
                'listIdSnapshot': 'list-1',
                'listTypeSnapshot': 'playlist',
                'song': {
                    'title': 'Song A',
                    'artist': 'Singer A',
                    'album': 'Album A',
                    'canonicalDurationSec': 200,
                    'providerType': 'local',
                    'pathOrUri': '/music/a.mp3',
                    'fileName': 'a.mp3',
                },
            }
        ],
    }


def test_module_file_exists():
    assert MODULE_PATH.exists()


def test_validate_payload_rejects_wrong_top_level_type():
    module = load_module()
    payload = sample_payload()
    payload['type'] = 'unexpected'

    try:
        module.validate_payload(payload)
    except ValueError as exc:
        assert 'playHistoryExport_v1' in str(exc)
    else:
        raise AssertionError('expected validate_payload to reject wrong type')


def test_compute_session_hash_is_stable():
    module = load_module()
    item = sample_payload()['items'][0]

    first = module.compute_session_hash(item)
    second = module.compute_session_hash(dict(item))

    assert first == second
    assert len(first) == 32


def test_normalize_item_returns_expected_fields():
    module = load_module()
    item = sample_payload()['items'][0]

    row = module.normalize_item(item, batch_id='batch-1', imported_at='2026-04-30T12:00:00')

    assert row['batch_id'] == 'batch-1'
    assert row['aggregate_song_id'] == 'agg-1'
    assert row['source_item_id'] == 'src-1'
    assert row['session_hash'] == module.compute_session_hash(item)
    assert row['title_snapshot'] == 'Song A'
    assert row['song_title'] == 'Song A'
    assert row['song_path_or_uri'] == '/music/a.mp3'
    assert row['list_id_snapshot'] == 'list-1'
    assert row['imported_at'] == '2026-04-30T12:00:00'


def test_normalize_item_preserves_fractional_second_fields():
    module = load_module()
    item = sample_payload()['items'][0]
    item['listenedSec'] = 30.618999999999996
    item['durationSec'] = 277.629
    item['seekForwardSec'] = 37.983000000000004
    item['seekBackwardSec'] = 19.195
    item['song']['canonicalDurationSec'] = 277.629

    row = module.normalize_item(item, batch_id='batch-1', imported_at='2026-04-30T12:00:00')

    assert row['listened_sec'] == 30.618999999999996
    assert row['duration_sec'] == 277.629
    assert row['seek_forward_sec'] == 37.983000000000004
    assert row['seek_backward_sec'] == 19.195
    assert row['song_canonical_duration_sec'] == 277.629


class FakeCursor:
    def __init__(self, existing_hashes=None):
        self.existing_hashes = set(existing_hashes or [])
        self.executed = []
        self.executemany_calls = []
        self._fetchall_result = []

    def execute(self, sql, params=None):
        self.executed.append((sql, params))
        sql_upper = ' '.join(sql.upper().split())
        if sql_upper.startswith('SELECT SESSION_HASH'):
            requested_hashes = list(params or [])
            self._fetchall_result = [
                (session_hash,)
                for session_hash in requested_hashes
                if session_hash in self.existing_hashes
            ]
        else:
            self._fetchall_result = []

    def executemany(self, sql, seq_of_params):
        batched_params = [list(item) for item in seq_of_params]
        self.executemany_calls.append((sql, batched_params))
        for params in batched_params:
            self.existing_hashes.add(params[1])

    def fetchall(self):
        return self._fetchall_result

    def close(self):
        pass


class FakeConnection:
    def __init__(self, existing_hashes=None):
        self.cursor_obj = FakeCursor(existing_hashes=existing_hashes)
        self.commit_count = 0
        self.closed = False

    def cursor(self):
        return self.cursor_obj

    def commit(self):
        self.commit_count += 1

    def close(self):
        self.closed = True


def test_ensure_table_executes_create_table_sql():
    module = load_module()
    conn = FakeConnection()

    module.ensure_table(conn)

    sql_text = '\n'.join(item[0] for item in conn.cursor_obj.executed)
    assert 'ods_jumusic_play_history' in sql_text
    assert 'CREATE TABLE' in sql_text
    assert 'session_hash' in sql_text
    assert 'CREATE UNIQUE INDEX' in sql_text
    assert conn.commit_count == 1


def test_create_table_sql_allows_long_remote_identity_fields():
    module = load_module()

    sql_text = module.CREATE_TABLE_SQL
    assert 'aggregate_song_id nvarchar(1024) not null' in sql_text
    assert 'source_item_id nvarchar(1024) null' in sql_text
    assert 'list_id_snapshot nvarchar(512) null' in sql_text


def test_comment_sql_contains_table_and_column_descriptions():
    module = load_module()

    sql_text = '\n'.join(module.COMMENT_SQLS)
    assert 'ods_jumusic_play_history' in sql_text
    assert '播放历史事实表' in sql_text
    assert 'session_hash' in sql_text
    assert 'aggregate_song_id' in sql_text
    assert 'listened_sec' in sql_text


def test_insert_play_history_rows_skips_existing_session_hashes_and_uses_bulk_insert():
    module = load_module()
    payload = sample_payload()
    rows = [
        module.normalize_item(payload['items'][0], batch_id='batch-1', imported_at='2026-04-30T12:00:00'),
        module.normalize_item({**payload['items'][0], 'sourceItemId': 'src-2'}, batch_id='batch-1', imported_at='2026-04-30T12:00:00'),
        module.normalize_item({**payload['items'][0], 'sourceItemId': 'src-3'}, batch_id='batch-1', imported_at='2026-04-30T12:00:00'),
    ]
    conn = FakeConnection(existing_hashes={rows[0]['session_hash']})

    stats = module.insert_play_history_rows(conn, rows)

    sql_text = '\n'.join(item[0] for item in conn.cursor_obj.executed)
    assert 'SELECT session_hash FROM dbo.ods_jumusic_play_history' in sql_text
    assert conn.cursor_obj.executemany_calls, 'expected executemany bulk insert path'
    bulk_sql, bulk_params = conn.cursor_obj.executemany_calls[0]
    assert 'INSERT INTO dbo.ods_jumusic_play_history' in bulk_sql
    assert len(bulk_params) == 2
    assert {params[1] for params in bulk_params} == {rows[1]['session_hash'], rows[2]['session_hash']}
    assert stats == {'inserted': 2, 'skipped': 1}
    assert conn.commit_count == 1


def test_load_rows_from_payload_normalizes_all_items():
    module = load_module()
    payload = sample_payload()
    payload['items'].append({**payload['items'][0], 'sourceItemId': 'src-2', 'startedAt': 1710001000000})

    rows = module.load_rows_from_payload(payload, batch_id='batch-9', imported_at='2026-04-30T12:00:00')

    assert len(rows) == 2
    assert rows[0]['batch_id'] == 'batch-9'
    assert rows[1]['source_item_id'] == 'src-2'


def test_parse_args_supports_input_and_dry_run(monkeypatch):
    module = load_module()
    monkeypatch.setattr('sys.argv', ['load_play_history.py', '--input', 'sample.json', '--dry-run'])

    args = module.parse_args()

    assert args.input == 'sample.json'
    assert args.dry_run is True


def test_main_dry_run_loads_json_and_skips_db(monkeypatch, tmp_path, capsys):
    module = load_module()
    payload_file = tmp_path / 'sample.json'
    payload_file.write_text(json.dumps(sample_payload()), encoding='utf-8')
    calls = []

    monkeypatch.setattr(module, 'ensure_table', lambda conn: calls.append(('ensure_table', conn)))
    monkeypatch.setattr(module, 'connect_db', lambda config: calls.append(('connect', config)))
    monkeypatch.setattr(module, 'load_db_config', lambda args: {'server': 'x'})

    result = module.main(input_path=payload_file, dry_run=True)
    output = capsys.readouterr().out

    assert result['load'] == {'inserted': 0, 'skipped': 0}
    assert result['rows'] == 1
    assert calls == []
    assert 'dry-run' in output.lower()


def test_main_closes_db_connection_after_load(monkeypatch, tmp_path):
    module = load_module()
    payload_file = tmp_path / 'sample.json'
    payload_file.write_text(json.dumps(sample_payload()), encoding='utf-8')
    conn = FakeConnection()

    monkeypatch.setattr(module, 'connect_db', lambda config: conn)
    monkeypatch.setattr(module, 'ensure_table', lambda actual_conn: None)
    monkeypatch.setattr(module, 'insert_play_history_rows', lambda actual_conn, rows: {'inserted': len(rows), 'skipped': 0})

    result = module.main(
        input_path=payload_file,
        dry_run=False,
        db_config={'server': 'x', 'port': 1433, 'user': 'u', 'password': 'p', 'database': 'd'},
    )

    assert result['load']['inserted'] == 1
    assert conn.closed is True


def test_load_db_config_accepts_db_url(monkeypatch):
    module = load_module()

    monkeypatch.setenv('JUMUSIC_DB_URL', 'mssql+pymssql://sa:ifwlzs@192.168.2.156:1433/db_tgmsg')
    config = module.load_db_config(type('Args', (), {
        'db_server': None,
        'db_port': None,
        'db_user': None,
        'db_password': None,
        'db_database': None,
        'db_url': None,
    })())

    assert config == {
        'server': '192.168.2.156',
        'port': 1433,
        'user': 'sa',
        'password': 'ifwlzs',
        'database': 'db_tgmsg',
    }
