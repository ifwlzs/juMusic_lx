"""Continuously backfill Essentia genre predictions into ods_jumusic_music_info.

This script is designed for long-running / resumable batch processing:
- fetch pending songs from SQL Server in batches
- upload tasks to a Linux VM with Essentia installed
- run genre inference remotely
- download raw predictions
- normalize / split structured genre fields
- update ods_jumusic_music_info
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path

import paramiko
import pymssql


DEFAULT_DB = {
    'server': '192.168.2.156',
    'port': 1433,
    'user': 'sa',
    'password': 'ifwlzs',
    'database': 'db_tgmsg',
}

DEFAULT_REMOTE = {
    'host': '192.168.194.133',
    'user': 'root',
    'password': 'root',
    'dir': '/root/juMusic_tmp',
    'python': '/root/essentia-venv/bin/python',
}

DEFAULT_MODEL_NAME = 'essentia-discogs400-discogs-effnet-1'
DEFAULT_SOURCE_NAME = 'linux-vm'
DEFAULT_BATCH_SIZE = 100
DEFAULT_POLL_SEC = 30
DEFAULT_START_BATCH_NO = 1
TZ = timezone(timedelta(hours=8))


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument('--db-server', default=DEFAULT_DB['server'])
    parser.add_argument('--db-port', type=int, default=DEFAULT_DB['port'])
    parser.add_argument('--db-user', default=DEFAULT_DB['user'])
    parser.add_argument('--db-password', default=DEFAULT_DB['password'])
    parser.add_argument('--db-name', default=DEFAULT_DB['database'])
    parser.add_argument('--remote-host', default=DEFAULT_REMOTE['host'])
    parser.add_argument('--remote-user', default=DEFAULT_REMOTE['user'])
    parser.add_argument('--remote-password', default=DEFAULT_REMOTE['password'])
    parser.add_argument('--remote-dir', default=DEFAULT_REMOTE['dir'])
    parser.add_argument('--remote-python', default=DEFAULT_REMOTE['python'])
    parser.add_argument('--batch-size', type=int, default=DEFAULT_BATCH_SIZE)
    parser.add_argument('--poll-sec', type=int, default=DEFAULT_POLL_SEC)
    parser.add_argument('--start-batch-no', type=int, default=DEFAULT_START_BATCH_NO)
    parser.add_argument('--tmp-dir', default=None)
    parser.add_argument('--model-name', default=DEFAULT_MODEL_NAME)
    parser.add_argument('--source-name', default=DEFAULT_SOURCE_NAME)
    parser.add_argument('--music-root-prefix', default=r'Z:\Music')
    return parser.parse_args()


def load_state(state_path, default_batch_no=DEFAULT_START_BATCH_NO):
    if Path(state_path).exists():
        return json.loads(Path(state_path).read_text(encoding='utf-8'))
    return {'current_batch': default_batch_no, 'completed_batches': [], 'last_error': None}


def save_state(state_path, state):
    Path(state_path).write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding='utf-8')


def _load_splitter(repo_root):
    module_path = Path(repo_root) / 'scripts' / 'music_etl' / 'load_music_info.py'
    spec = importlib.util.spec_from_file_location('load_music_info_for_backfill', str(module_path))
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module.split_genre_essentia_label


def build_remote_task_items(file_paths, windows_prefix=r'Z:\Music', linux_prefix='/mnt/hgfs/Music'):
    items = []
    for value in file_paths or []:
        if not value:
            continue
        linux_path = str(value).replace(windows_prefix, linux_prefix).replace('\\', '/')
        items.append({
            'file_path': linux_path,
            'file_name': Path(linux_path).name,
        })
    return items


def build_structured_rows(raw_items, inferred_at, model_name, source_name, windows_prefix=r'Z:\Music', linux_prefix='/mnt/hgfs/Music', split_genre_essentia_label=None):
    if split_genre_essentia_label is None:
        split_genre_essentia_label = _load_splitter(Path(__file__).resolve().parents[2])
    rows = []
    for item in raw_items or []:
        linux_path = str(item.get('file_path') or '')
        if not linux_path:
            continue
        win_path = linux_path.replace(linux_prefix, windows_prefix).replace('/', '\\')
        label = item.get('label')
        row = {
            'file_path': win_path,
            'genre_essentia_confidence': item.get('confidence'),
            'genre_essentia_model': model_name,
            'genre_essentia_source': source_name,
            'genre_essentia_inferred_at': inferred_at,
        }
        row.update(split_genre_essentia_label(label))
        rows.append(row)
    return rows


def remote_paths(remote_dir, batch_no):
    return {
        'pending': f'{remote_dir}/pending_paths_batch{batch_no}.json',
        'tasks': f'{remote_dir}/tasks_batch{batch_no}_100.json',
        'runner': f'{remote_dir}/run_batch{batch_no}_100.py',
        'raw': f'{remote_dir}/raw_predictions_batch{batch_no}_100.json',
        'partial': f'{remote_dir}/raw_predictions_batch{batch_no}_100.partial.json',
        'stdout': f'{remote_dir}/run_batch{batch_no}_100.stdout.log',
        'stderr': f'{remote_dir}/run_batch{batch_no}_100.stderr.log',
        'pid': f'{remote_dir}/run_batch{batch_no}_100.pid',
        'helper': f'{remote_dir}/run_essentia_genre_inference.py',
    }


def build_remote_runner_script(paths):
    return f'''import contextlib
import json
import os
import time
from pathlib import Path

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
TASKS_JSON = Path({paths["tasks"]!r})
OUTPUT_JSON = Path({paths["raw"]!r})
PARTIAL_JSON = Path({paths["partial"]!r})
EMBEDDING_MODEL = "/root/juMusic_tmp/discogs-effnet-bs64-1.pb"
CLASSIFIER_MODEL = "/root/juMusic_tmp/genre_discogs400-discogs-effnet-1.pb"
METADATA_JSON = "/root/juMusic_tmp/genre_discogs400-discogs-effnet-1.json"
from run_essentia_genre_inference import build_essentia_predictor

def main():
    tasks = json.loads(TASKS_JSON.read_text(encoding="utf-8"))
    with open(os.devnull, "w") as devnull, contextlib.redirect_stderr(devnull):
        predictor = build_essentia_predictor(
            embedding_model_pb=EMBEDDING_MODEL,
            classifier_model_pb=CLASSIFIER_MODEL,
            metadata_json=METADATA_JSON,
        )
    results = []
    total = len(tasks)
    start_all = time.time()
    for index, item in enumerate(tasks, start=1):
        file_path = item.get("file_path")
        row = {{"file_path": file_path, "label": None, "confidence": None, "elapsed_sec": None}}
        start = time.time()
        try:
            with open(os.devnull, "w") as devnull, contextlib.redirect_stderr(devnull):
                result = predictor(file_path) or {{}}
            row["label"] = result.get("label")
            row["confidence"] = result.get("confidence")
        except Exception as exc:
            row["error"] = f"{{type(exc).__name__}}: {{exc}}"
        row["elapsed_sec"] = round(time.time() - start, 3)
        results.append(row)
        print(f"[{{index}}/{{total}}] {{file_path}} -> {{row.get('label')}} conf={{row.get('confidence')}} elapsed={{row['elapsed_sec']}}", flush=True)
        if index % 5 == 0:
            PARTIAL_JSON.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    OUTPUT_JSON.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    PARTIAL_JSON.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"done total={{total}} elapsed_all={{round(time.time()-start_all,3)}} output={{OUTPUT_JSON}}", flush=True)

if __name__ == "__main__":
    main()
'''


def main():
    args = parse_args()
    repo_root = Path(__file__).resolve().parents[2]
    tmp_dir = Path(args.tmp_dir) if args.tmp_dir else repo_root / 'tmp' / 'essentia'
    tmp_dir.mkdir(parents=True, exist_ok=True)
    state_path = tmp_dir / 'backfill_all_state.json'
    log_path = tmp_dir / 'backfill_all.log'
    pid_path = tmp_dir / 'backfill_all.pid'
    helper_local = repo_root / 'scripts' / 'music_etl' / 'run_essentia_genre_inference.py'
    split_genre_essentia_label = _load_splitter(repo_root)

    def log(message):
        ts = datetime.now(TZ).strftime('%Y-%m-%d %H:%M:%S%z')
        line = f'[{ts}] {message}'
        print(line, flush=True)
        with log_path.open('a', encoding='utf-8') as f:
            f.write(line + '\n')

    def db_connect():
        return pymssql.connect(
            server=args.db_server,
            port=args.db_port,
            user=args.db_user,
            password=args.db_password,
            database=args.db_name,
            charset='utf8',
            tds_version='7.0',
        )

    def fetch_pending_batch(batch_no):
        conn = db_connect()
        try:
            cur = conn.cursor()
            cur.execute(
                """
                SELECT TOP %s file_path
                FROM dbo.ods_jumusic_music_info
                WHERE genre_essentia_parent IS NULL
                  AND genre_essentia_inferred_at IS NULL
                  AND is_readable = 1
                  AND file_path LIKE %s
                ORDER BY file_path ASC
                """,
                (args.batch_size, args.music_root_prefix + '%'),
            )
            rows = [row[0] for row in cur.fetchall()]
        finally:
            conn.close()
        out = tmp_dir / f'pending_paths_batch{batch_no}.json'
        out.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding='utf-8')
        return rows, out

    def stats_summary():
        conn = db_connect()
        try:
            cur = conn.cursor()
            cur.execute('SELECT COUNT(*) FROM dbo.ods_jumusic_music_info')
            total = cur.fetchone()[0]
            cur.execute('SELECT COUNT(*) FROM dbo.ods_jumusic_music_info WHERE genre_essentia_parent IS NOT NULL')
            done = cur.fetchone()[0]
            cur.execute('SELECT COUNT(*) FROM dbo.ods_jumusic_music_info WHERE genre_essentia_parent IS NULL')
            pending = cur.fetchone()[0]
            return {'total': total, 'done': done, 'pending': pending}
        finally:
            conn.close()

    def connect_remote():
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(
            args.remote_host,
            username=args.remote_user,
            password=args.remote_password,
            timeout=20,
            banner_timeout=20,
            auth_timeout=20,
        )
        return client

    def exec_remote(client, command):
        stdin, stdout, stderr = client.exec_command(command)
        out = stdout.read().decode('utf-8', 'ignore')
        err = stderr.read().decode('utf-8', 'ignore')
        code = stdout.channel.recv_exit_status()
        return code, out, err

    def start_remote_batch(client, batch_no, local_pending_path):
        paths = remote_paths(args.remote_dir, batch_no)
        sftp = client.open_sftp()
        try:
            exec_remote(client, f'mkdir -p {args.remote_dir}')
            sftp.put(str(local_pending_path), paths['pending'])
            sftp.put(str(helper_local), paths['helper'])
            tasks = build_remote_task_items(
                json.loads(local_pending_path.read_text(encoding='utf-8')),
                windows_prefix=args.music_root_prefix,
            )
            with sftp.file(paths['tasks'], 'w') as f:
                f.write(json.dumps(tasks, ensure_ascii=False, indent=2))
            with sftp.file(paths['runner'], 'w') as f:
                f.write(build_remote_runner_script(paths))
            try:
                sftp.chmod(paths['runner'], 0o755)
                sftp.chmod(paths['helper'], 0o755)
            except Exception:
                pass
        finally:
            sftp.close()

        start_cmd = (
            f"bash -lc 'rm -f {paths['pid']} {paths['raw']} {paths['partial']} {paths['stdout']} {paths['stderr']}; "
            f"nohup {args.remote_python} {paths['runner']} >{paths['stdout']} 2>{paths['stderr']} < /dev/null & echo $! > {paths['pid']}; "
            f"sleep 2; echo started pid=$(cat {paths['pid']}); ps -p $(cat {paths['pid']}) -o pid,etime,%cpu,%mem,cmd --no-headers || true'"
        )
        _code, out, err = exec_remote(client, start_cmd)
        log(f'remote batch {batch_no} started: {out.strip()} {err.strip()}')

    def get_remote_batch_status(client, batch_no):
        paths = remote_paths(args.remote_dir, batch_no)
        script = f'''import json, subprocess
from pathlib import Path
pid_path=Path({paths["pid"]!r})
partial=Path({paths["partial"]!r})
final=Path({paths["raw"]!r})
stdout=Path({paths["stdout"]!r})
stderr=Path({paths["stderr"]!r})
pid = pid_path.read_text().strip() if pid_path.exists() else ""
running = bool(pid and subprocess.run(["ps","-p",pid], capture_output=True, text=True).returncode == 0)
partial_count = len(json.loads(partial.read_text(encoding="utf-8"))) if partial.exists() else 0
print(json.dumps({{
    "pid": pid,
    "running": running,
    "partial_exists": partial.exists(),
    "partial_count": partial_count,
    "final_exists": final.exists(),
    "stdout_tail": stdout.read_text(encoding="utf-8", errors="ignore").splitlines()[-2:] if stdout.exists() else [],
    "stderr_tail": stderr.read_text(encoding="utf-8", errors="ignore").splitlines()[-2:] if stderr.exists() else [],
}}, ensure_ascii=False))
'''
        code, out, err = exec_remote(client, "python3 - <<'PY'\n" + script + "\nPY")
        if code != 0:
            raise RuntimeError(f'status failed: {err or out}')
        return json.loads(out.strip())

    def download_remote_raw(client, batch_no):
        paths = remote_paths(args.remote_dir, batch_no)
        local_raw = tmp_dir / f'raw_predictions_batch{batch_no}_100_linux.json'
        sftp = client.open_sftp()
        try:
            sftp.get(paths['raw'], str(local_raw))
        finally:
            sftp.close()
        return local_raw

    def import_structured_rows(batch_no):
        raw_local = tmp_dir / f'raw_predictions_batch{batch_no}_100_linux.json'
        normalized_local = tmp_dir / f'normalized_predictions_batch{batch_no}_100_windows.json'
        structured_local = tmp_dir / f'normalized_predictions_batch{batch_no}_100_windows_structured.json'
        raw_items = json.loads(raw_local.read_text(encoding='utf-8'))
        inferred_at = datetime.now(TZ).isoformat()
        rows = build_structured_rows(
            raw_items=raw_items,
            inferred_at=inferred_at,
            model_name=args.model_name,
            source_name=args.source_name,
            windows_prefix=args.music_root_prefix,
            split_genre_essentia_label=split_genre_essentia_label,
        )
        normalized_local.write_text(json.dumps([
            {
                'file_path': row['file_path'],
                'genre_essentia_label': row['genre_essentia_label'],
                'genre_essentia_confidence': row['genre_essentia_confidence'],
                'genre_essentia_model': row['genre_essentia_model'],
                'genre_essentia_source': row['genre_essentia_source'],
                'genre_essentia_inferred_at': row['genre_essentia_inferred_at'],
            }
            for row in rows
        ], ensure_ascii=False, indent=2), encoding='utf-8')
        structured_local.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding='utf-8')

        conn = db_connect()
        try:
            cur = conn.cursor()
            sql = """
            UPDATE dbo.ods_jumusic_music_info
            SET genre_essentia_label = %s,
                genre_essentia_raw_label = %s,
                genre_essentia_path = %s,
                genre_essentia_parent = %s,
                genre_essentia_child = %s,
                genre_essentia_depth = %s,
                genre_essentia_confidence = %s,
                genre_essentia_model = %s,
                genre_essentia_source = %s,
                genre_essentia_inferred_at = %s,
                etl_updated_at = SYSDATETIME()
            WHERE file_path = %s
            """
            params = [
                (
                    item.get('genre_essentia_label'),
                    item.get('genre_essentia_raw_label'),
                    item.get('genre_essentia_path'),
                    item.get('genre_essentia_parent'),
                    item.get('genre_essentia_child'),
                    item.get('genre_essentia_depth'),
                    item.get('genre_essentia_confidence'),
                    item.get('genre_essentia_model'),
                    item.get('genre_essentia_source'),
                    item.get('genre_essentia_inferred_at'),
                    item.get('file_path'),
                )
                for item in rows
            ]
            cur.executemany(sql, params)
            conn.commit()
            return len(params)
        finally:
            conn.close()

    pid_path.write_text(str(os.getpid()), encoding='utf-8')
    state = load_state(state_path, default_batch_no=args.start_batch_no)
    save_state(state_path, state)
    log(f'backfill daemon started: state={json.dumps(state, ensure_ascii=False)}')

    while True:
        try:
            summary = stats_summary()
            batch_no = int(state.get('current_batch') or args.start_batch_no)
            log(f"summary total={summary['total']} done={summary['done']} pending={summary['pending']} current_batch={batch_no}")
            if summary['pending'] <= 0:
                log('all songs finished, exiting')
                return

            client = connect_remote()
            try:
                status = get_remote_batch_status(client, batch_no)
                log(f"batch {batch_no} remote status: pid={status['pid']} running={status['running']} partial={status['partial_count']} final={status['final_exists']}")
                if status['final_exists']:
                    local_raw = download_remote_raw(client, batch_no)
                    log(f'batch {batch_no} downloaded raw -> {local_raw}')
                    updated = import_structured_rows(batch_no)
                    log(f'batch {batch_no} imported rows={updated}')
                    if batch_no not in state['completed_batches']:
                        state['completed_batches'].append(batch_no)
                    state['current_batch'] = batch_no + 1
                    state['last_error'] = None
                    state['last_completed_at'] = datetime.now(TZ).isoformat()
                    state['last_updated_rows'] = updated
                    save_state(state_path, state)
                    continue
                if status['running']:
                    time.sleep(args.poll_sec)
                    continue

                rows, pending_path = fetch_pending_batch(batch_no)
                if not rows:
                    log('no pending rows fetched, exiting')
                    return
                log(f'batch {batch_no} fetched pending={len(rows)} first={rows[0]}')
                start_remote_batch(client, batch_no, pending_path)
                time.sleep(args.poll_sec)
            finally:
                client.close()
        except Exception as exc:
            state['last_error'] = f'{type(exc).__name__}: {exc}'
            save_state(state_path, state)
            log(f"error: {state['last_error']}")
            time.sleep(60)


if __name__ == '__main__':
    main()
