import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import App from '../App.vue'
import { useReportData } from '../composables/useReportData.js'
import P01HeroCoverPage from '../pages/P01HeroCoverPage.vue'
import P10GenreScorePage from '../pages/P10GenreScorePage.vue'
import P11CoverColorPage from '../pages/P11CoverColorPage.vue'
import P16ArtistHeroPage from '../pages/P16ArtistHeroPage.vue'
import P18CalendarHeatmapPage from '../pages/P18CalendarHeatmapPage.vue'
import P19TimePreferencePage from '../pages/P19TimePreferencePage.vue'
import P21TimelineNightPage from '../pages/P21TimelineNightPage.vue'
import P23AlbumHeroPage from '../pages/P23AlbumHeroPage.vue'
import P25SongHeroPage from '../pages/P25SongHeroPage.vue'
import L04LibraryArtistRankingPage from '../pages/L04LibraryArtistRankingPage.vue'
import L04NewArtistRankingPage from '../pages/L04NewArtistRankingPage.vue'
import ExportPdfPage from '../pages/ExportPdfPage.vue'

vi.mock('echarts', () => {
  const instances = []
  return {
    init: vi.fn(() => {
      const instance = {
        setOption: vi.fn(),
        resize: vi.fn(),
        dispose: vi.fn(),
      }
      instances.push(instance)
      return instance
    }),
    __instances: instances,
  }
})

// 为 L04A/L04B 生成足量榜单数据，便于验证页面会截断到 Top10。
function createArtistRanking(prefix, metricKey, metricLabel) {
  return Array.from({ length: 12 }, (_, index) => {
    const item = {
      artist_display: `${prefix}${index + 1}`,
      [metricKey]: (12 - index) * 3,
      metric_label: metricLabel,
    }

    if (metricKey === 'track_total') {
      return {
        ...item,
        album_total: 12 - index,
        top_track_title: `代表作 ${index + 1}`,
      }
    }

    return {
      ...item,
      new_album_total: 12 - index,
      highlight_tag: index === 0 ? '继续扩坑' : `新增专辑 ${12 - index} 张`,
    }
  })
}

const sampleContract = {
  meta: {
    year: 2025,
    design_width: 390,
    page_order: [
      'P01', 'P02', 'P03', 'P04', 'P05', 'P06', 'P07', 'P08', 'P09', 'P10',
      'P11', 'P12', 'P13', 'P14', 'P15', 'P16', 'P17', 'P18', 'P19', 'P20',
      'P21', 'P23', 'P25', 'L04A', 'L04B',
    ],
  },
  pages: [
    {
      page_id: 'P02',
      template: 'overview-stats',
      title: '年度总览',
      summary_text: 'summary',
      payload: {
        overview_metrics: {
          total_play_count: 1432,
          total_listened_hours: 206.5,
          active_day_total: 302,
          new_song_ratio: 0.34,
          new_song_total: 118,
          unique_track_total: 349,
        },
      },
    },
    {
      page_id: 'P03',
      template: 'breadth-stats',
      title: '年度探索广度',
      summary_text: 'summary',
      payload: {
        breadth_metrics: {
          artist_total: 128,
          new_artist_total: 42,
          genre_total: 17,
          new_genre_total: 6,
        },
      },
    },
    {
      page_id: 'P04',
      template: 'foreign-language',
      title: '外语歌曲',
      summary_text: 'summary',
      payload: {
        foreign_language_total: 3,
        language_ranking: [
          { language_name: '日语', play_total: 128, track_total: 46 },
          { language_name: '英语', play_total: 42, track_total: 18 },
          { language_name: '韩语', play_total: 19, track_total: 7 },
        ],
        spotlight_track: {
          track_title: '群青',
          artist_display: 'YOASOBI',
          language_name: '日语',
        },
      },
    },
    {
      page_id: 'P05',
      template: 'exploration-contrast',
      title: '主动探索 vs 重复所爱',
      summary_text: 'summary',
      payload: {
        exploration_metrics: {
          explore_play_total: 231,
          search_play_total: 231,
          search_ratio: 0.41,
          repeat_play_total: 208,
          repeat_track_ratio: 0.37,
          repeat_active_day_total: 86,
        },
        spotlight_tracks: {
          search_top_track: { track_title: '海底', artist_display: '一支榴莲' },
          revisit_top_track: { track_title: '夜航星', artist_display: '不才' },
        },
      },
    },
    {
      page_id: 'P06',
      template: 'keyword-poster',
      title: '年度关键词',
      summary_text: 'summary',
      payload: {
        keywords: [
          { keyword: '月亮', count: 17, source_type: 'lyric', representative_track_title: '若月亮没来' },
          { keyword: '夜', count: 14, source_type: 'lyric', representative_track_title: '夜航星' },
          { keyword: '海', count: 11, source_type: 'title', representative_track_title: '海底' },
          { keyword: '光', count: 9, source_type: 'lyric', representative_track_title: '群青' },
          { keyword: '风', count: 8, source_type: 'title', representative_track_title: '起风了' },
        ],
      },
    },
    {
      page_id: 'P07',
      template: 'story-placeholder',
      title: '城市陪伴',
      summary_text: 'summary',
      payload: {
        story_card: {
          headline: '这一年，很多通勤和夜路都被音乐接住了',
          subline: '先保留成氛围页，后续再接真实城市轨迹。',
          note: 'City mood',
        },
      },
    },
    {
      page_id: 'P08',
      template: 'genre-ranking',
      title: '年度曲风 Top5',
      summary_text: 'summary',
      payload: {
        genre_ranking: [
          { genre_name: 'Pop---J-pop', genre_name_zh: '日系流行', weighted_track_count: 52.4, weighted_play_total: 52.4, primary_play_total: 61, confidence_score: 0.81, track_count: 61 },
          { genre_name: 'Folk', genre_name_zh: '民谣', weighted_track_count: 31.8, weighted_play_total: 31.8, primary_play_total: 34, confidence_score: 0.72, track_count: 34 },
          { genre_name: 'Mandopop', genre_name_zh: '华语流行', weighted_track_count: 29.6, weighted_play_total: 29.6, primary_play_total: 28, confidence_score: 0.69, track_count: 28 },
          { genre_name: 'Anime', genre_name_zh: '动漫', weighted_track_count: 21.1, weighted_play_total: 21.1, primary_play_total: 23, confidence_score: 0.64, track_count: 23 },
          { genre_name: 'Vocaloid', genre_name_zh: 'Vocaloid', weighted_track_count: 17.9, weighted_play_total: 17.9, primary_play_total: 16, confidence_score: 0.61, track_count: 16 },
        ],
      },
    },
    {
      page_id: 'P09',
      template: 'genre-timeline',
      title: '曲风进化历',
      summary_text: 'summary',
      payload: {
        monthly_genre_timeline: [
          { month: 1, top_genre: '华语流行', top_primary_genre: '华语流行', top_weighted_play_total: 8.2, genre_weights: [{ genre_name_zh: '华语流行', weighted_play_total: 8.2 }] },
          { month: 2, top_genre: '日系流行', top_primary_genre: '日系流行', top_weighted_play_total: 9.1, genre_weights: [{ genre_name_zh: '日系流行', weighted_play_total: 9.1 }] },
          { month: 3, top_genre: '民谣', top_primary_genre: '民谣', top_weighted_play_total: 12.3, genre_weights: [{ genre_name_zh: '民谣', weighted_play_total: 12.3 }] },
          { month: 4, top_genre: '日系流行', top_primary_genre: '日系流行', top_weighted_play_total: 6.8, genre_weights: [{ genre_name_zh: '日系流行', weighted_play_total: 6.8 }] },
        ],
      },
    },
    {
      page_id: 'P10',
      template: 'genre-score',
      title: '品味曲风分数',
      summary_text: 'summary',
      payload: {
        taste_score: 78,
        score_breakdown: {
          breadth_score: 31,
          balance_score: 29,
          new_genre_score: 18,
          confidence_score: 9,
        },
        radar_metrics: [
          { metric_key: 'breadth', metric_label: '广度', score: 31, full_score: 35 },
          { metric_key: 'balance', metric_label: '均衡', score: 29, full_score: 35 },
          { metric_key: 'novelty', metric_label: '新曲风', score: 18, full_score: 20 },
          { metric_key: 'confidence', metric_label: '识别可信度', score: 9, full_score: 10 },
        ],
      },
    },
    {
      page_id: 'P11',
      template: 'cover-color',
      title: '年度封面主色',
      summary_text: 'summary',
      payload: {
        cover_color_summary: {
          counted_track_total: 236,
          excluded_track_total: 14,
          treemap_total: 94,
          top_colors: [
            { color_hex: '#6A8FE8', track_count: 38, representative_track_title: '群青', share_ratio: 0.4043, tone_label: '雾蓝' },
            { color_hex: '#E6C6B6', track_count: 29, representative_track_title: 'Polaris', share_ratio: 0.3085, tone_label: '奶杏' },
            { color_hex: '#394B8A', track_count: 27, representative_track_title: '夜航星', share_ratio: 0.2872, tone_label: '夜航蓝' },
          ],
        },
      },
    },
    {
      page_id: 'P12',
      template: 'season-favorite',
      title: '春季最爱',
      summary_text: 'summary',
      payload: {
        season_key: 'spring',
        season_label: '春',
        favorite_track: { track_title: '夜航星', artist_display: '不才', listened_sec: 2600 },
      },
    },
    {
      page_id: 'P13',
      template: 'season-favorite',
      title: '夏季最爱',
      summary_text: 'summary',
      payload: {
        season_key: 'summer',
        season_label: '夏',
        favorite_track: { track_title: '群青', artist_display: 'YOASOBI', listened_sec: 2200 },
      },
    },
    {
      page_id: 'P14',
      template: 'season-favorite',
      title: '秋季最爱',
      summary_text: 'summary',
      payload: {
        season_key: 'autumn',
        season_label: '秋',
        favorite_track: { track_title: 'Polaris', artist_display: 'Aimer', listened_sec: 2100 },
      },
    },
    {
      page_id: 'P15',
      template: 'season-favorite',
      title: '冬季最爱',
      summary_text: 'summary',
      payload: {
        season_key: 'winter',
        season_label: '冬',
        favorite_track: { track_title: '若月亮没来', artist_display: '王宇宙Leto', listened_sec: 2300 },
      },
    },
    {
      page_id: 'P16',
      template: 'artist-hero',
      title: '年度最爱歌手',
      summary_text: 'summary',
      payload: {
        top_artist: {
          artist_display: 'Aimer',
          play_total: 158,
          listened_sec: 18200,
          track_total: 24,
          top_track_title: 'Polaris',
          monthly_distribution: [
            { month: 1, play_total: 12 },
            { month: 2, play_total: 9 },
            { month: 3, play_total: 18 },
            { month: 4, play_total: 15 },
            { month: 5, play_total: 0 },
            { month: 6, play_total: 0 },
            { month: 7, play_total: 0 },
            { month: 8, play_total: 0 },
            { month: 9, play_total: 0 },
            { month: 10, play_total: 0 },
            { month: 11, play_total: 0 },
            { month: 12, play_total: 0 },
          ],
        },
      },
    },
    {
      page_id: 'P17',
      template: 'week-rhythm',
      title: '一周听歌心情',
      summary_text: 'summary',
      payload: {
        weekday_distribution: [
          { weekday: 1, weekday_label: '周一', play_total: 31, bpm_value: 96 },
          { weekday: 2, weekday_label: '周二', play_total: 28, bpm_value: 102 },
          { weekday: 3, weekday_label: '周三', play_total: 33, bpm_value: 101 },
          { weekday: 4, weekday_label: '周四', play_total: 36, bpm_value: 98 },
          { weekday: 5, weekday_label: '周五', play_total: 42, bpm_value: 108 },
          { weekday: 6, weekday_label: '周六', play_total: 47, bpm_value: 92 },
          { weekday: 7, weekday_label: '周日', play_total: 44, bpm_value: 90 },
        ],
        mood_summary: '周末更松弛，工作日的节奏则更利落一点。',
        bpm_coverage_ratio: 0.82,
      },
    },
    {
      page_id: 'P18',
      template: 'calendar-heatmap',
      title: '年度听歌日历',
      summary_text: 'summary',
      payload: {
        active_day_total: 302,
        longest_streak_day_total: 27,
        peak_date: '2025-03-08',
        weekday_labels: ['一', '二', '三', '四', '五', '六', '日'],
        month_labels: [
          { label: '1月', week_index: 0 },
          { label: '2月', week_index: 4 },
          { label: '3月', week_index: 8 },
        ],
        heatmap_columns: [
          {
            week_index: 0,
            week_label: 'W01',
            cells: [
              { date: '2025-01-01', play_total: 0, intensity: 0, weekday: 1, month: 1 },
              { date: '2025-01-02', play_total: 1, intensity: 1, weekday: 2, month: 1 },
            ],
          },
          {
            week_index: 8,
            week_label: 'W09',
            cells: [
              { date: '2025-03-06', play_total: 2, intensity: 1, weekday: 4, month: 3 },
              { date: '2025-03-07', play_total: 5, intensity: 2, weekday: 5, month: 3 },
              { date: '2025-03-08', play_total: 8, intensity: 4, weekday: 6, month: 3 },
              { date: '2025-03-09', play_total: 3, intensity: 2, weekday: 7, month: 3 },
            ],
          },
        ],
      },
    },
    {
      page_id: 'P19',
      template: 'time-preference',
      title: '最爱时段',
      summary_text: 'summary',
      payload: {
        time_bucket_distribution: [
          { bucket_key: 'after_midnight', bucket_label: '午夜', hour_range_label: '00:00-02:59', play_total: 15 },
          { bucket_key: 'pre_dawn', bucket_label: '凌晨', hour_range_label: '03:00-05:59', play_total: 0 },
          { bucket_key: 'morning', bucket_label: '早晨', hour_range_label: '06:00-09:59', play_total: 54 },
          { bucket_key: 'late_morning', bucket_label: '上午', hour_range_label: '10:00-11:59', play_total: 32 },
          { bucket_key: 'noon', bucket_label: '午间', hour_range_label: '12:00-13:59', play_total: 26 },
          { bucket_key: 'afternoon', bucket_label: '下午', hour_range_label: '14:00-17:59', play_total: 65 },
          { bucket_key: 'evening', bucket_label: '傍晚', hour_range_label: '18:00-20:59', play_total: 92 },
          { bucket_key: 'night', bucket_label: '夜间', hour_range_label: '21:00-23:59', play_total: 49 },
        ],
        top_bucket: { bucket_key: 'evening', bucket_label: '傍晚', hour_range_label: '18:00-20:59', play_total: 92 },
        peak_hour: { hour: 22, label: '22:00-22:59', play_total: 28 },
        top_hour_ranking: [
          { hour: 22, label: '22:00-22:59', play_total: 28 },
          { hour: 21, label: '21:00-21:59', play_total: 21 },
          { hour: 1, label: '01:00-01:59', play_total: 15 },
        ],
        representative_track: { track_title: '夜航星', artist_display: '不才' },
      },
    },
    {
      page_id: 'P20',
      template: 'late-night-hero',
      title: '深夜听歌',
      summary_text: 'summary',
      payload: {
        latest_night_record: { latest_time: '02:35', track_title: '夜航星', artist_display: '不才' },
        late_night_total: 38,
        late_night_track_total: 16,
        representative_tracks: [
          { track_title: '夜航星', artist_display: '不才', late_night_play_total: 7 },
          { track_title: '海底', artist_display: '一支榴莲', late_night_play_total: 4 },
        ],
      },
    },
    {
      page_id: 'P21',
      template: 'timeline-night',
      title: '历年最晚记录',
      summary_text: 'summary',
      payload: {
        layout_mode: 'timeline',
        latest_night_history: [],
        peak_record_year: 2025,
      },
    },
    {
      page_id: 'P01',
      template: 'hero-cover',
      title: '第一次相遇',
      summary_text: 'summary',
      payload: {
        first_track: {
          track_title: '旧日来信',
          artist_display: 'Aimer',
        },
      },
    },
    {
      page_id: 'P23',
      template: 'album-hero',
      title: '年度之最专辑',
      summary_text: 'summary',
      payload: {
        top_album: {
          album_display: '不才作品集',
          artist_display: '不才',
        },
      },
    },
    {
      page_id: 'P25',
      template: 'song-hero',
      title: '年度歌曲',
      summary_text: 'summary',
      payload: {
        song_of_year: {
          track_title: '夜航星',
          artist_display: '不才',
        },
      },
    },
    {
      page_id: 'L04A',
      template: 'artist-library-ranking',
      title: '歌曲库歌手榜',
      summary_text: 'summary',
      payload: {
        ranking: createArtistRanking('馆藏歌手 ', 'track_total', '首收藏'),
      },
    },
    {
      page_id: 'L04B',
      template: 'artist-new-ranking',
      title: '年度新增歌手榜',
      summary_text: 'summary',
      payload: {
        ranking: createArtistRanking('新增歌手 ', 'new_track_total', '首新增'),
      },
    },
  ],
}

describe('useReportData', () => {
  it('按 meta.page_order 输出试点页顺序', () => {
    const { orderedPages, exportablePages } = useReportData(sampleContract)

    expect(orderedPages.value.map((page) => page.page_id)).toEqual([...sampleContract.meta.page_order, 'SYS_EXPORT'])
    expect(exportablePages.value.map((page) => page.page_id)).toEqual(sampleContract.meta.page_order)
  })
})

describe('App', () => {
  it('渲染 390 设计基准的窄栏视口与 26 个整屏分页，并在最后追加导出页', () => {
    const wrapper = mount(App, {
      props: {
        reportContract: sampleContract,
      },
    })

    expect(wrapper.find('[data-testid="report-viewport"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-testid="report-page"]')).toHaveLength(26)
    expect(wrapper.text()).toContain('第一次相遇')
    expect(wrapper.text()).toContain('年度总览')
    expect(wrapper.text()).toContain('年度关键词')
    expect(wrapper.text()).toContain('年度听歌日历')
    expect(wrapper.text()).toContain('歌曲库歌手榜')
    expect(wrapper.text()).toContain('年度新增歌手榜')
    expect(wrapper.text()).toContain('导出 PDF')
    expect(wrapper.text()).not.toContain('未注册页面')
  })

  it('移除首页顶部残留的进度条与分页数字', () => {
    const wrapper = mount(App, {
      props: {
        reportContract: sampleContract,
      },
    })

    expect(wrapper.text()).not.toContain('juMusic 年度报告')
    expect(wrapper.text()).not.toContain('2025 音乐回放')
    expect(wrapper.find('.viewport-floating-meta').exists()).toBe(false)
    expect(wrapper.find('.viewport-progress').exists()).toBe(false)
  })

  it('为 PC 端窄栏视口注入固定设计尺寸 token，并为每页注入独立主题色', () => {
    const wrapper = mount(App, {
      props: {
        reportContract: sampleContract,
      },
    })

    const viewport = wrapper.find('[data-testid="report-viewport"]')
    const pageElements = wrapper.findAll('[data-testid="report-page"]')

    expect(viewport.attributes('style')).toContain('--report-design-width: 390px;')
    expect(viewport.attributes('style')).toContain('--report-design-height: 844px;')
    expect(pageElements[0].attributes('style')).toContain('--page-accent:')
    expect(pageElements[0].attributes('style')).toContain('--page-design-height: 844px;')
    expect(pageElements[0].attributes('style')).toContain('--page-background-start:')
    expect(pageElements[0].attributes('style')).toContain('--page-background-end:')
    expect(pageElements[1].attributes('style')).toContain('--page-accent:')
    expect(pageElements[0].attributes('style')).not.toEqual(pageElements[1].attributes('style'))
    expect(pageElements[23].attributes('style')).toContain('--page-background-start: #F6EFFF;')
    expect(pageElements[24].attributes('style')).toContain('--page-background-start: #EEFAF5;')
  })

  it('首屏页面切到淡色看板背景，并增大内容安全边距 token', () => {
    const wrapper = mount(App, {
      props: {
        reportContract: sampleContract,
      },
    })

    const viewport = wrapper.find('[data-testid="report-viewport"]')
    const firstPage = wrapper.findAll('[data-testid="report-page"]')[0]

    expect(viewport.attributes('style')).toContain('--report-page-padding-x: 24px;')
    expect(viewport.attributes('style')).toContain('--report-page-padding-top: 22px;')
    expect(firstPage.attributes('style')).toContain('--page-background-start: #F7E8E4;')
    expect(firstPage.attributes('style')).toContain('--page-background-end: #F4EEF8;')
  })

  it('遇到未注册页号时显示显式占位，而不是静默回退成 P01', () => {
    const wrapper = mount(App, {
      props: {
        reportContract: {
          meta: {
            year: 2025,
            design_width: 390,
            design_height: 844,
            page_order: ['X99'],
          },
          pages: [
            {
              page_id: 'X99',
              template: 'unknown-template',
              section: '测试章节',
              title: '未知页面',
              summary_text: 'summary',
              payload: {},
            },
          ],
        },
      },
    })

    expect(wrapper.text()).toContain('未注册页面')
    expect(wrapper.text()).toContain('X99')
    expect(wrapper.text()).not.toContain('第一次相遇')
  })
})

describe('ExportPdfPage', () => {
  it('最后一页显示导出按钮，并提示只导出正式报告页', async () => {
    const onExportPdf = vi.fn()
    const wrapper = mount(ExportPdfPage, {
      props: {
        page: {
          page_id: 'SYS_EXPORT',
          section: '导出收藏',
          title: '保存这一年的音乐回放',
          summary_text: '导出页不计入最终 PDF，仅作为下载入口。',
          payload: {
            export_page_total: 6,
            export_year: 2025,
          },
        },
        exportState: {
          isExporting: false,
          progressText: '',
          errorMessage: '',
        },
        onExportPdf,
      },
    })

    expect(wrapper.text()).toContain('导出 PDF')
    expect(wrapper.text()).toContain('共 6 页')
    expect(wrapper.text()).toContain('不包含当前这一页')
    await wrapper.get('[data-testid="export-pdf-button"]').trigger('click')
    expect(onExportPdf).toHaveBeenCalledTimes(1)
  })
})

describe('L04 artist ranking pages', () => {
  it('L04A 改成纯 Top10 列表，并且只渲染前 10 名', () => {
    const wrapper = mount(L04LibraryArtistRankingPage, {
      props: {
        page: {
          page_id: 'L04A',
          section: '歌手章节',
          title: '歌曲库歌手榜',
          summary_text: '你常驻收藏最多的歌手，在这一页完整展开。',
          payload: {
            ranking: createArtistRanking('馆藏歌手 ', 'track_total', '首收藏'),
          },
        },
      },
    })

    expect(wrapper.find('.artist-ranking-page').exists()).toBe(true)
    expect(wrapper.find('.hero-subtitle').text()).toBe('全曲库收藏最多的 10 位歌手')
    expect(wrapper.find('.artist-ranking-list-card').exists()).toBe(true)
    expect(wrapper.findAll('.artist-ranking-list-item')).toHaveLength(10)
    expect(wrapper.text()).toContain('馆藏歌手 1')
    expect(wrapper.text()).toContain('馆藏歌手 10')
    expect(wrapper.text()).not.toContain('馆藏歌手 11')
    expect(wrapper.find('.page-summary-card').exists()).toBe(true)
  })

  it('L04B 改成纯 Top10 列表，并且只渲染前 10 名', () => {
    const wrapper = mount(L04NewArtistRankingPage, {
      props: {
        page: {
          page_id: 'L04B',
          section: '歌手章节',
          title: '年度新增歌手榜',
          summary_text: '这一年你不断扩充歌手版图，新面孔都在这里。',
          payload: {
            ranking: createArtistRanking('新增歌手 ', 'new_track_total', '首新增'),
          },
        },
      },
    })

    expect(wrapper.find('.artist-ranking-page').exists()).toBe(true)
    expect(wrapper.find('.hero-subtitle').text()).toBe('今年扩坑最多的 10 位歌手')
    expect(wrapper.find('.artist-ranking-list-card').exists()).toBe(true)
    expect(wrapper.findAll('.artist-ranking-list-item')).toHaveLength(10)
    expect(wrapper.text()).toContain('新增歌手 1')
    expect(wrapper.text()).toContain('新增歌手 10')
    expect(wrapper.text()).not.toContain('新增歌手 11')
    expect(wrapper.find('.page-summary-card').exists()).toBe(true)
  })
})

describe('P01HeroCoverPage', () => {
  it('首页把首次时间从封面卡底部拿出来，改成外部信息带', () => {
    const wrapper = mount(P01HeroCoverPage, {
      props: {
        page: {
          page_id: 'P01',
          section: '故事开场',
          title: '第一次相遇',
          summary_text: '最早的一次记录停在 2024-06-01 08:30:00，当时你点开的是《旧日来信》。',
          payload: {
            companionship_days: 579,
            companionship_years: 2,
            first_track: {
              played_at: '2024-06-01 08:30:00',
              track_title: '旧日来信',
              artist_display: 'Aimer',
            },
          },
        },
      },
    })

    expect(wrapper.find('.hero-layout--centered').exists()).toBe(true)
    expect(wrapper.find('.hero-copy--editorial').exists()).toBe(true)
    expect(wrapper.find('.hero-subtitle-pill').exists()).toBe(true)
    expect(wrapper.find('.cover-block--centered').exists()).toBe(true)
    expect(wrapper.find('.hero-meta-band').exists()).toBe(true)
    expect(wrapper.find('.hero-meta-band').text()).toContain('2024-06-01 08:30:00')
    expect(wrapper.find('.hero-fact-row').exists()).toBe(true)
    expect(wrapper.findAll('.hero-fact-chip')).toHaveLength(2)
    expect(wrapper.find('.metric-grid').exists()).toBe(false)
    expect(wrapper.find('.page-summary-card').exists()).toBe(true)
  })
})

describe('P25SongHeroPage', () => {
  it('年度歌曲页把构成因子与高峰信息移到评分卡外部，避免评分卡内部过满', () => {
    const wrapper = mount(P25SongHeroPage, {
      props: {
        page: {
          page_id: 'P25',
          section: '年度歌曲',
          title: '年度歌曲',
          summary_text: '《夜航星》用更长时间的陪伴，成了你的年度歌曲。',
          payload: {
            song_of_year: {
              track_title: '夜航星',
              artist_display: '不才',
              album_display: '不才作品集',
              play_count: 15,
              active_days: 12,
              listened_sec: 2600,
              score: 11.958,
              peak_month: 3,
            },
          },
        },
      },
    })

    expect(wrapper.find('.score-hero-card').exists()).toBe(true)
    expect(wrapper.find('.hero-layout--centered').exists()).toBe(true)
    expect(wrapper.find('.score-hero-value').text()).toContain('11.958')
    expect(wrapper.find('.score-hero-card').findAll('.score-factor-chip')).toHaveLength(0)
    expect(wrapper.find('.score-hero-card').find('.score-support-note').exists()).toBe(false)
    expect(wrapper.find('.score-meta-band').exists()).toBe(true)
    expect(wrapper.findAll('.score-factor-chip')).toHaveLength(3)
    expect(wrapper.find('.score-support-note').text()).toContain('3 月')
    expect(wrapper.find('.metric-grid').exists()).toBe(false)
  })
})

describe('Sparse page layouts', () => {
  it('P23 这类低信息量页使用居中 hero 布局，不再硬塞成长列表结构', () => {
    const wrapper = mount(P23AlbumHeroPage, {
      props: {
        page: {
          page_id: 'P23',
          section: '专辑章节',
          title: '年度之最专辑',
          summary_text: '今年听得最多的专辑是《不才作品集》。',
          payload: {
            top_album: {
              album_display: '不才作品集',
              artist_display: '不才',
              representative_track_title: '夜航星',
              play_total: 15,
              track_total: 1,
              active_days: 12,
            },
          },
        },
      },
    })

    expect(wrapper.find('.hero-layout--centered').exists()).toBe(true)
    expect(wrapper.find('.cover-block--centered').exists()).toBe(true)
    expect(wrapper.find('.album-spotlight-card').exists()).toBe(true)
    expect(wrapper.find('.album-spotlight-card').text()).toContain('夜航星')
    expect(wrapper.find('.hero-fact-row').exists()).toBe(true)
    expect(wrapper.findAll('.hero-fact-chip')).toHaveLength(3)
    expect(wrapper.find('.metric-grid').exists()).toBe(false)
  })

  it('P21 在 single-year 模式下使用居中主角卡，不再把少量内容顶在页面上方', () => {
    const wrapper = mount(P21TimelineNightPage, {
      props: {
        page: {
          page_id: 'P21',
          section: '深夜轨迹',
          title: '历年最晚记录',
          summary_text: 'summary',
          payload: {
            layout_mode: 'single-year',
            latest_night_history: [
              {
                latest_time: '02:35',
                track_title: '夜航星',
                artist_display: '不才',
              },
            ],
          },
        },
      },
    })

    expect(wrapper.find('.timeline-layout--centered').exists()).toBe(true)
  })
})

describe('Enhanced detail pages', () => {
  it('P11 改成矩形树图式封面颜色卡组，展示占比与色调标签', () => {
    const wrapper = mount(P11CoverColorPage, {
      props: {
        page: sampleContract.pages.find((page) => page.page_id === 'P11'),
      },
    })

    expect(wrapper.find('.cover-color-treemap-chart').exists()).toBe(true)
    expect(wrapper.find('[data-testid="p11-treemap-chart"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('雾蓝')
    expect(wrapper.text()).toContain('40.4%')
  })

  it('P11 需要限制封面色块数量并裁切长文案，避免真实数据把整页挤爆', () => {
    const wrapper = mount(P11CoverColorPage, {
      props: {
        page: {
          page_id: 'P11',
          section: '封面颜色',
          title: '年度封面主色',
          summary_text: 'summary',
          payload: {
            cover_color_summary: {
              counted_track_total: 324,
              excluded_track_total: 4,
              top_colors: [
                { color_hex: '#509EAA', track_count: 3, representative_track_title: 'Rearranging', representative_artist_display: '言和', share_ratio: 0.0093, tone_label: '青雾' },
                { color_hex: '#628BA6', track_count: 3, representative_track_title: '世末歌者', representative_artist_display: '洛天依;乐正绫', share_ratio: 0.0093, tone_label: '青雾' },
                { color_hex: '#A3A2A2', track_count: 3, representative_track_title: '东京泰迪熊/東京テディベア:cover-Neru', representative_artist_display: 'wachikiちゃん', share_ratio: 0.0093, tone_label: '雾灰' },
                { color_hex: '#01001A', track_count: 2, representative_track_title: 'DISCO之王', representative_artist_display: '乐正绫;GUMI', share_ratio: 0.0062, tone_label: '雾蓝' },
                { color_hex: '#4D636A', track_count: 2, representative_track_title: 'OVERRESONATED', representative_artist_display: '洛天依', share_ratio: 0.0062, tone_label: '青雾' },
                { color_hex: '#61A3BA', track_count: 2, representative_track_title: 'Singularity', representative_artist_display: '初音ミク', share_ratio: 0.0062, tone_label: '青雾' },
              ],
            },
          },
        },
      },
    })

    expect(wrapper.find('.cover-color-treemap-chart').exists()).toBe(true)
    expect(wrapper.find('.cover-color-treemap-chart--bounded').exists()).toBe(true)
    expect(wrapper.findAll('.cover-color-treemap-node')).toHaveLength(0)
    expect(wrapper.text()).not.toContain('Singularity')
  })

  it('P18 改成 GitHub 风格热力图，带月份与周几坐标', () => {
    const wrapper = mount(P18CalendarHeatmapPage, {
      props: {
        page: sampleContract.pages.find((page) => page.page_id === 'P18'),
      },
    })

    expect(wrapper.find('.calendar-heatmap').exists()).toBe(true)
    expect(wrapper.findAll('.calendar-weekday-label')).toHaveLength(7)
    expect(wrapper.findAll('.calendar-month-label').length).toBeGreaterThan(0)
    expect(wrapper.findAll('.calendar-heatmap-cell').length).toBeGreaterThan(0)
  })

  it('P19 把最爱时段拆成更细颗粒度，并补出 Top 小时排行', () => {
    const wrapper = mount(P19TimePreferencePage, {
      props: {
        page: sampleContract.pages.find((page) => page.page_id === 'P19'),
      },
    })

    expect(wrapper.find('.time-bucket-card-grid').exists()).toBe(true)
    expect(wrapper.findAll('.time-bucket-card')).toHaveLength(8)
    expect(wrapper.find('.time-hour-ranking').exists()).toBe(true)
    expect(wrapper.find('.time-hour-ranking--compact').exists()).toBe(true)
    expect(wrapper.text()).toContain('22:00-22:59')
    expect(wrapper.text()).toContain('18:00-20:59')
  })

  it('P10 改成雷达图式信息卡，而不是只有分数胶囊', () => {
    const wrapper = mount(P10GenreScorePage, {
      props: {
        page: sampleContract.pages.find((page) => page.page_id === 'P10'),
      },
    })

    expect(wrapper.find('.genre-radar-chart').exists()).toBe(true)
    expect(wrapper.find('[data-testid="p10-radar-chart"]').exists()).toBe(true)
    expect(wrapper.find('svg').exists()).toBe(false)
    expect(wrapper.findAll('.genre-radar-metric-chip')).toHaveLength(4)
    expect(wrapper.find('.genre-radar-summary-note').exists()).toBe(true)
    expect(wrapper.text()).toContain('识别可信度')
  })

  it('P10 需要改成紧凑雷达图布局，避免雷达图下方再堆整列进度条', () => {
    const wrapper = mount(P10GenreScorePage, {
      props: {
        page: sampleContract.pages.find((page) => page.page_id === 'P10'),
      },
    })

    expect(wrapper.find('.genre-radar-card--compact').exists()).toBe(true)
    expect(wrapper.find('.genre-radar-chart--echarts').exists()).toBe(true)
    expect(wrapper.findAll('.genre-radar-metric-chip')).toHaveLength(4)
    expect(wrapper.findAll('.genre-radar-axis')).toHaveLength(0)
    expect(wrapper.find('.score-meta-band').exists()).toBe(false)
  })

  it('P16 年度最爱歌手需要保留 12 个月位点，不能只渲染有值月份', () => {
    const wrapper = mount(P16ArtistHeroPage, {
      props: {
        page: sampleContract.pages.find((page) => page.page_id === 'P16'),
      },
    })

    expect(wrapper.findAll('.month-bar-item')).toHaveLength(12)
    expect(wrapper.find('.month-bar-list--year-grid').exists()).toBe(true)
    expect(wrapper.text()).toContain('12月')
  })

  it('P19 最爱时段升级成多卡片概览 + 高峰小时榜的青年化布局', () => {
    const wrapper = mount(P19TimePreferencePage, {
      props: {
        page: sampleContract.pages.find((page) => page.page_id === 'P19'),
      },
    })

    expect(wrapper.find('.time-preference-hero-card').exists()).toBe(true)
    expect(wrapper.find('.time-bucket-card-grid').exists()).toBe(true)
    expect(wrapper.findAll('.time-bucket-card')).toHaveLength(8)
    expect(wrapper.find('.time-bucket-card-grid--compact').exists()).toBe(true)
    expect(wrapper.findAll('.time-hour-pill')).toHaveLength(3)
  })

  it('P19 需要保留全部 7 个时段并维持原始顺序，只压缩展示密度不能删数据', () => {
    const wrapper = mount(P19TimePreferencePage, {
      props: {
        page: sampleContract.pages.find((page) => page.page_id === 'P19'),
      },
    })

    expect(wrapper.find('.time-preference-layout').exists()).toBe(true)
    expect(wrapper.find('.time-preference-layout--single-screen').exists()).toBe(true)
    expect(wrapper.find('.time-preference-hero-card--compact').exists()).toBe(true)
    expect(wrapper.find('.time-bucket-card-grid--compact').exists()).toBe(true)
    expect(wrapper.find('.time-bucket-card-grid--dense').exists()).toBe(true)
    expect(wrapper.find('.time-bucket-card-grid--microcopy').exists()).toBe(true)
    expect(wrapper.findAll('.time-bucket-range--compact')).toHaveLength(8)
    expect(wrapper.findAll('.time-bucket-card')).toHaveLength(8)
    expect(wrapper.findAll('.time-hour-pill')).toHaveLength(3)
    expect(
      wrapper.findAll('.time-bucket-card strong').map((node) => node.text()),
    ).toEqual(['午夜', '凌晨', '早晨', '上午', '午间', '下午', '傍晚', '夜间'])
    expect(wrapper.text()).toContain('03:00-05:59')
  })
})
