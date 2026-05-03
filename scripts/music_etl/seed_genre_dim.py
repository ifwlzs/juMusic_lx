"""Seed / refresh Essentia genre dimension table."""

import sys
from pathlib import Path

MODULE_DIR = Path(__file__).resolve().parent
if str(MODULE_DIR) not in sys.path:
    sys.path.insert(0, str(MODULE_DIR))

from load_music_info import (  # noqa: E402
    GENRE_DIM_TABLE_NAME,
    connect_db,
    ensure_table,
    load_db_config_from_env,
)

DEFAULT_GENRE_TRANSLATIONS = {
    'Acoustic': '原声',
    'African': '非洲音乐',
    'AOR': '成人摇滚',
    'Atmospheric Black Metal': '氛围黑金属',
    'Baroque': '巴洛克',
    'Bassline': '贝斯线电子',
    'Berlin-School': '柏林学派电子',
    'Big Beat': '大节拍',
    'Black Metal': '黑金属',
    'Blues': '布鲁斯',
    'Blues Rock': '布鲁斯摇滚',
    'Boogie Woogie': '布吉伍吉',
    'Boom Bap': 'Boom Bap 说唱',
    'Bossa Nova': '波萨诺瓦',
    'Brass & Military': '军乐/铜管',
    'Breakcore': '碎核',
    'Brit Pop': '英伦流行摇滚',
    'Bubblegum': '泡泡糖流行',
    'Celtic': '凯尔特',
    "Children's": '儿童音乐',
    'Chanson': '香颂',
    'Chillwave': '驰放浪潮',
    'Choral': '合唱',
    'City Pop': '城市流行',
    'Cloud Rap': '云说唱',
    'Coldwave': '冷潮',
    'Compas': '康帕斯',
    'Conscious': '意识流说唱',
    'Pop': '流行',
    'J-pop': '日系流行',
    'Ballad': '抒情流行',
    'Rock': '摇滚',
    'Pop Rock': '流行摇滚',
    'Alternative Rock': '另类摇滚',
    'Contemporary Jazz': '当代爵士',
    'Contemporary R&B': '当代节奏布鲁斯',
    'Country': '乡村',
    'Crunk': 'Crunk 说唱',
    'Dancehall': '牙买加舞厅',
    'Darkwave': '暗潮',
    'Deep House': '深浩室',
    'Depressive Black Metal': '抑郁黑金属',
    'Disco': '迪斯科',
    'Disco Polo': '波兰迪斯科',
    'Donk': 'Donk 电子',
    'Dream Pop': '梦幻流行',
    'Drum n Bass': '鼓打贝斯',
    'Dubstep': '回响贝斯',
    'Dungeon Synth': '地下城合成器',
    'Easy Listening': '轻松聆听',
    'Educational': '教育类',
    'Electronic': '电子',
    'Electro': '电气电子',
    'Electro House': '电浩室',
    'Éntekhno': '希腊艺术民谣',
    'Ethereal': '空灵摇滚',
    'Euro House': '欧式浩室',
    'Eurobeat': '欧陆节拍',
    'Eurodance': '欧陆舞曲',
    'Euro-Disco': '欧陆迪斯科',
    'Europop': '欧陆流行',
    'Experimental': '实验音乐',
    'Fado': '法朵',
    'Field Recording': '田野录音',
    'Flamenco': '弗拉门戈',
    'Folk': '民谣',
    'Folk Metal': '民谣金属',
    'Folk Rock': '民谣摇滚',
    'Folk, World, & Country': '民谣/世界/乡村',
    'Free Improvisation': '自由即兴',
    'Funk': '放克',
    'Funk / Soul': '放克/灵魂',
    'Future Jazz': '未来爵士',
    'Gangsta': '帮派说唱',
    'G-Funk': '西岸放克说唱',
    'Glitch': '故障电子',
    'Goa Trance': '果阿迷幻',
    'Gospel': '福音',
    'Goth Rock': '哥特摇滚',
    'Gothic Metal': '哥特金属',
    'Grime': '英式脏拍',
    'Halftime': '半拍电子',
    'House': '浩室',
    'Happy Hardcore': '快乐硬核',
    'Hard Rock': '硬摇滚',
    'Hard Trance': '硬迷幻',
    'Hardcore': '硬核电子',
    'Hardcore Hip-Hop': '硬核嘻哈',
    'Hardstyle': '硬派舞曲',
    'Heavy Metal': '重金属',
    'Honky Tonk': '酒吧乡村',
    'Horrorcore': '恐怖核说唱',
    'IDM': '智能舞曲',
    'Impressionist': '印象派',
    'Indie Pop': '独立流行',
    'Indie Rock': '独立摇滚',
    'Industrial': '工业',
    'Instrumental': '器乐',
    'Italodance': '意大利舞曲',
    'Italo-Disco': '意大利迪斯科',
    'Jazz': '爵士',
    'Jazzy Hip-Hop': '爵士嘻哈',
    'Juke': 'Juke 舞曲',
    'Kayōkyoku': '歌谣曲',
    'Downtempo': '慢拍电子',
    'Dance-pop': '舞曲流行',
    'Synth-pop': '合成器流行',
    'Hip Hop': '嘻哈',
    'Pop Rap': '流行说唱',
    'Pop Punk': '流行朋克',
    'K-pop': '韩系流行',
    'Laïkó': '莱科民谣',
    'Latin': '拉丁',
    'Light Music': '轻音乐',
    'Lounge': '沙发音乐',
    'Lovers Rock': '情人摇滚',
    'Makina': '马基纳',
    'Marches': '进行曲',
    'Math Rock': '数学摇滚',
    'Medieval': '中世纪音乐',
    'Melodic Hardcore': '旋律硬核',
    'Metalcore': '金属核',
    'Military': '军乐',
    'Modern': '现代古典',
    'Modern Electric Blues': '现代电声布鲁斯',
    'Neo Soul': '新灵魂',
    'Neo-Classical': '新古典',
    'Neofolk': '新民谣',
    'Neo-Romantic': '新古典浪漫派',
    'New Age': '新世纪',
    'New Jack Swing': '新杰克摇摆',
    'New Wave': '新浪潮',
    'Non-Music': '非音乐',
    'Nordic': '北欧民谣',
    'Norteño': '墨西哥北方音乐',
    'Nu Metal': '新金属',
    'Nu-Disco': '新迪斯科',
    'Nursery Rhymes': '童谣',
    'Opera': '歌剧',
    'Parody': '恶搞流行',
    'Piano Blues': '钢琴布鲁斯',
    'Poetry': '诗歌朗诵',
    'Polka': '波尔卡',
    'Post Rock': '后摇',
    'Post-Hardcore': '后硬核',
    'Post-Modern': '后现代古典',
    'Power Metal': '力量金属',
    'Prog Rock': '前卫摇滚',
    'Progressive Breaks': '前卫碎拍',
    'Progressive House': '前卫浩室',
    'Progressive Metal': '前卫金属',
    'Psychobilly': '心理比利',
    'Punk': '朋克',
    'Ragga HipHop': '雷鬼嘻哈',
    'Ragtime': '拉格泰姆',
    'Reggae': '雷鬼',
    'Reggae-Pop': '雷鬼流行',
    'Reggaeton': '雷鬼顿',
    'Religious': '宗教音乐',
    'Renaissance': '文艺复兴古典',
    'RnB/Swing': '节奏布鲁斯/摇摆',
    'Rock & Roll': '摇滚乐',
    'Romani': '罗姆民谣',
    'Romantic': '浪漫主义古典',
    'Schlager': '德式流行',
    'Score': '配乐',
    'Ska': '斯卡',
    'Smooth Jazz': '轻柔爵士',
    'Soukous': '苏库斯',
    'Soul': '灵魂乐',
    'Soundtrack': '原声带',
    'Speedcore': '极速硬核',
    'Stage & Screen': '舞台与影视',
    'Story': '故事朗读',
    'Swingbeat': '摇摆节拍',
    'Symphonic Rock': '交响摇滚',
    'Synthwave': '合成器浪潮',
    'Tango': '探戈',
    'Tech House': '科技浩室',
    'Tech Trance': '科技迷幻',
    'Techno': '科技舞曲',
    'Trance': '迷幻舞曲',
    'Trap': '陷阱说唱',
    'Trip Hop': '神游舞曲',
    'Turntablism': '唱盘主义',
    'UK Garage': '英式车库',
    'UK Street Soul': '英式街头灵魂',
    'Vaporwave': '蒸汽波',
    'Vocal': '人声流行',
    'Volksmusik': '德奥民间音乐',
    'Ambient': '氛围音乐',
    'Chiptune': '芯片电子',
    'Hands Up': '高能舞曲',
    'Tropical House': '热带浩室',
    'Classical': '古典',
    'Contemporary': '当代古典',
}


def translate_genre_label(label):
    if not label:
        return None
    if '---' in label:
        parts = [part.strip() for part in str(label).split('---') if part and part.strip()]
        if parts:
            translated_parts = [DEFAULT_GENRE_TRANSLATIONS.get(part) or part for part in parts]
            return ' / '.join(translated_parts)
    return DEFAULT_GENRE_TRANSLATIONS.get(label) or label


def build_genre_dim_rows(source_rows):
    result = {}

    def add_row(genre_level, genre_en, parent_genre_en=None, child_genre_en=None, genre_depth=None):
        if not genre_en:
            return
        key = (genre_level, genre_en)
        if key in result:
            return
        result[key] = {
            'genre_level': genre_level,
            'genre_en': genre_en,
            'genre_zh': translate_genre_label(genre_en),
            'genre_zh_short': translate_genre_label(genre_en),
            'parent_genre_en': parent_genre_en,
            'child_genre_en': child_genre_en,
            'genre_depth': genre_depth,
            'note': 'generated from ods_jumusic_music_info essentia labels',
        }

    for item in source_rows or []:
        parent = (item.get('genre_essentia_parent') or '').strip() or None
        child = (item.get('genre_essentia_child') or '').strip() or None
        path = (item.get('genre_essentia_path') or '').strip() or None
        if parent:
            add_row('parent', parent, parent_genre_en=parent, genre_depth=1)
        if child:
            add_row('child', child, parent_genre_en=parent, child_genre_en=child, genre_depth=1)
        if path:
            add_row('path', path, parent_genre_en=parent, child_genre_en=child, genre_depth=2 if child else 1)

    return list(result.values())


def load_source_rows(conn):
    cursor = conn.cursor(as_dict=True)
    cursor.execute(
        """
SELECT DISTINCT
    NULLIF(genre_essentia_parent, '') AS genre_essentia_parent,
    NULLIF(genre_essentia_child, '') AS genre_essentia_child,
    NULLIF(genre_essentia_path, '') AS genre_essentia_path
FROM dbo.ods_jumusic_music_info
WHERE NULLIF(genre_essentia_parent, '') IS NOT NULL
   OR NULLIF(genre_essentia_child, '') IS NOT NULL
   OR NULLIF(genre_essentia_path, '') IS NOT NULL
        """
    )
    rows = cursor.fetchall()
    cursor.close()
    return rows


def upsert_genre_dim(conn, rows):
    cursor = conn.cursor()
    affected = 0
    for row in rows or []:
        cursor.execute(
            f"""
IF EXISTS (SELECT 1 FROM dbo.{GENRE_DIM_TABLE_NAME} WHERE genre_level = %s AND genre_en = %s)
BEGIN
    UPDATE dbo.{GENRE_DIM_TABLE_NAME}
    SET genre_zh = %s,
        genre_zh_short = %s,
        parent_genre_en = %s,
        child_genre_en = %s,
        genre_depth = %s,
        note = %s,
        is_enabled = 1,
        etl_updated_at = SYSDATETIME()
    WHERE genre_level = %s AND genre_en = %s
END
ELSE
BEGIN
    INSERT INTO dbo.{GENRE_DIM_TABLE_NAME}(
        genre_level, genre_en, genre_zh, genre_zh_short, parent_genre_en, child_genre_en, genre_depth,
        is_enabled, note, etl_created_at, etl_updated_at
    )
    VALUES (%s, %s, %s, %s, %s, %s, %s, 1, %s, SYSDATETIME(), SYSDATETIME())
END
            """,
            (
                row['genre_level'],
                row['genre_en'],
                row['genre_zh'],
                row['genre_zh_short'],
                row['parent_genre_en'],
                row['child_genre_en'],
                row['genre_depth'],
                row['note'],
                row['genre_level'],
                row['genre_en'],
                row['genre_level'],
                row['genre_en'],
                row['genre_zh'],
                row['genre_zh_short'],
                row['parent_genre_en'],
                row['child_genre_en'],
                row['genre_depth'],
                row['note'],
            ),
        )
        affected += 1
    conn.commit()
    cursor.close()
    return affected


def main():
    conn = connect_db(load_db_config_from_env())
    try:
        ensure_table(conn)
        rows = build_genre_dim_rows(load_source_rows(conn))
        affected = upsert_genre_dim(conn, rows)
        print(f'seeded_genre_dim={affected}')
    finally:
        conn.close()


if __name__ == '__main__':
    main()
