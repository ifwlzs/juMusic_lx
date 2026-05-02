"""Seed artist alias mappings into SQL Server."""

import sys
from pathlib import Path

MODULE_DIR = Path(__file__).resolve().parent
if str(MODULE_DIR) not in sys.path:
    sys.path.insert(0, str(MODULE_DIR))

from load_music_info import (  # noqa: E402
    _normalize_artist_alias_key,
    connect_db,
    ensure_table,
    load_db_config_from_env,
)

SEED_ALIASES = [
    ('洛天依Official', '洛天依', 'virtual-singer canonical alias'),
    ('洛天依 office', '洛天依', 'virtual-singer canonical alias'),
    ('言和Official', '言和', 'virtual-singer canonical alias'),
    ('乐正绫Official', '乐正绫', 'virtual-singer canonical alias'),
    ('初音ミクOfficial', '初音ミク', 'virtual-singer canonical alias'),
    ('初音未来', '初音ミク', 'virtual-singer canonical alias'),
    ('初音未来V4C', '初音ミク', 'virtual-singer canonical alias'),
    ('HatsuneMiku', '初音ミク', 'virtual-singer canonical alias'),
    ('HATSUNE MIKU', '初音ミク', 'virtual-singer canonical alias'),
]


def upsert_aliases(conn, rows=SEED_ALIASES):
    cursor = conn.cursor()
    for alias_name, canonical_artist, note in rows:
        alias_name_norm = _normalize_artist_alias_key(alias_name)
        cursor.execute(
            """
IF EXISTS (SELECT 1 FROM dbo.ods_jumusic_artist_alias WHERE alias_name_norm = %s)
BEGIN
    UPDATE dbo.ods_jumusic_artist_alias
    SET alias_name = %s,
        canonical_artist = %s,
        note = %s,
        is_enabled = 1,
        etl_updated_at = SYSDATETIME()
    WHERE alias_name_norm = %s
END
ELSE
BEGIN
    INSERT INTO dbo.ods_jumusic_artist_alias(alias_name, alias_name_norm, canonical_artist, is_enabled, note, etl_created_at, etl_updated_at)
    VALUES (%s, %s, %s, 1, %s, SYSDATETIME(), SYSDATETIME())
END
            """,
            (
                alias_name_norm,
                alias_name,
                canonical_artist,
                note,
                alias_name_norm,
                alias_name,
                alias_name_norm,
                canonical_artist,
                note,
            ),
        )
    conn.commit()
    cursor.close()


def main():
    conn = connect_db(load_db_config_from_env())
    try:
        ensure_table(conn)
        upsert_aliases(conn)
        print(f'seeded_aliases={len(SEED_ALIASES)}')
    finally:
        conn.close()


if __name__ == '__main__':
    main()
