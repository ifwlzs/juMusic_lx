(function attachYearReportApp(windowScope) {
  const {
    formatDateTime,
    formatDuration,
    formatPercent,
    escapeHtml,
  } = windowScope.YearReportDataUtils

  const DEFAULT_REPORT_PATH = '../../publish/report_2025.json'

  function getReportPath() {
    const url = new URL(window.location.href)
    return url.searchParams.get('report') || DEFAULT_REPORT_PATH
  }

  async function loadReport(reportPath) {
    const response = await fetch(reportPath, { cache: 'no-store' })
    if (!response.ok) {
      throw new Error(`加载报告失败：${response.status} ${response.statusText}`)
    }
    return response.json()
  }

  function setHtml(pageId, html) {
    const host = document.querySelector(`[data-page="${pageId}"] [data-role="content"]`)
    if (host) host.innerHTML = html
  }

  function renderMetricGrid(items) {
    return `
      <div class="metric-grid">
        ${items.map(item => `
          <div class="metric-card">
            <div class="metric-card__label">${escapeHtml(item.label)}</div>
            <div class="metric-card__value">${escapeHtml(item.value)}</div>
          </div>
        `).join('')}
      </div>
    `
  }

  function renderSummaryGrid(items) {
    return `
      <div class="summary-grid">
        ${items.map(item => `
          <div class="summary-card">
            <div class="summary-card__label">${escapeHtml(item.label)}</div>
            <div class="summary-card__value ${item.accent ? 'summary-card__value--accent' : ''}">${escapeHtml(item.value)}</div>
          </div>
        `).join('')}
      </div>
    `
  }

  function renderRankList(items, mapper) {
    return `
      <ol class="rank-list">
        ${items.map((item, index) => {
          const row = mapper(item, index)
          return `
            <li class="rank-item">
              <div class="rank-item__index">${escapeHtml(row.index ?? String(index + 1))}</div>
              <div>
                <div class="rank-item__title">${escapeHtml(row.title)}</div>
                <div class="rank-item__meta">${escapeHtml(row.meta || '--')}</div>
                <div class="rank-item__extra">${escapeHtml(row.extra || '--')}</div>
              </div>
            </li>
          `
        }).join('')}
      </ol>
    `
  }

  function renderBarChart(items, mapper) {
    const maxValue = items.reduce((best, item) => Math.max(best, Number(mapper(item).valueRaw) || 0), 0) || 1
    return `
      <div class="bar-chart">
        ${items.map(item => {
          const row = mapper(item)
          const width = Math.max(6, Math.round(((Number(row.valueRaw) || 0) / maxValue) * 100))
          return `
            <div class="bar-chart__row">
              <div class="bar-chart__label">${escapeHtml(row.label)}</div>
              <div class="bar-chart__track"><div class="bar-chart__fill" style="width:${width}%"></div></div>
              <div class="bar-chart__value">${escapeHtml(row.valueLabel)}</div>
            </div>
          `
        }).join('')}
      </div>
    `
  }

  function renderYearGroups(items, groupKey, renderGroup) {
    const groups = []
    items.forEach(item => {
      const key = item[groupKey]
      let group = groups.find(entry => entry.key === key)
      if (!group) {
        group = { key, items: [] }
        groups.push(group)
      }
      group.items.push(item)
    })
    return groups.map(group => `
      <section class="year-group">
        <h3 class="year-group__title">${escapeHtml(group.key)}</h3>
        ${renderGroup(group.items, group.key)}
      </section>
    `).join('')
  }

  function renderPageP01(page) {
    if (!page) return '<div class="empty">暂无数据</div>'
    return `
      <div class="stat">${escapeHtml(page.days_since_first_play)} 天</div>
      <ul class="kv">
        <li>首次听歌：${escapeHtml(formatDateTime(page.first_played_at))}</li>
        <li>陪伴年数：${escapeHtml(page.years_since_first_play)} 年</li>
      </ul>
    `
  }

  function renderPageP02(page) {
    if (!page) return '<div class="empty">暂无数据</div>'
    return `
      <div class="stat">${escapeHtml(page.year_play_count)} 次</div>
      <ul class="kv">
        <li>听过歌曲：${escapeHtml(page.year_distinct_tracks)} 首</li>
        <li>新歌数量：${escapeHtml(page.year_new_track_count)} 首</li>
        <li>新歌占比：${escapeHtml(formatPercent(page.year_new_track_ratio))}</li>
        <li>听歌时长：${escapeHtml(formatDuration(page.year_listened_sec))}</li>
      </ul>
    `
  }

  function renderPageP03(page) {
    if (!page) return '<div class="empty">暂无数据</div>'
    return `
      <div class="pill">歌手 ${escapeHtml(page.artist_count)}</div>
      <div class="pill">新歌手 ${escapeHtml(page.new_artist_count)}</div>
      <div class="pill">曲风 ${escapeHtml(page.genre_count)}</div>
      <div class="pill">新曲风 ${escapeHtml(page.new_genre_count)}</div>
    `
  }

  function renderPageP04(page) {
    if (!page) return '<div class="empty">暂无曲库总览</div>'
    return `
      <div class="card__eyebrow">Library Overview</div>
      ${renderMetricGrid([
        { label: '歌曲总数', value: `${page.track_count ?? 0} 首` },
        { label: '歌手数', value: `${page.artist_count ?? 0}` },
        { label: '专辑数', value: `${page.album_count ?? 0}` },
        { label: '曲风数', value: `${page.genre_count ?? 0}` },
        { label: '总时长', value: formatDuration(page.total_duration_sec) },
        { label: '平均时长', value: formatDuration(page.avg_duration_sec) },
      ])}
    `
  }

  function renderPageP05(page) {
    if (!page) return '<div class="empty">暂无数据</div>'
    return `
      <div class="card__eyebrow">P05 主动探索</div>
      ${renderMetricGrid([
        { label: '主动探索', value: formatPercent(page.explore_ratio) },
        { label: '重复所爱', value: formatPercent(page.repeat_ratio) },
        { label: '搜索触发', value: `${page.search_play_count ?? 0} 次` },
        { label: '反复心动天数', value: `${page.repeat_active_days ?? 0} 天` },
      ])}
      <div class="muted">${escapeHtml(page.summary_text || '--')}</div>
      ${renderRankList(
        [page.top_search_track, page.top_repeat_track].filter(Boolean),
        (item, index) => ({
          index: String(index + 1),
          title: `${item.title || '--'} - ${item.artist || '--'}`,
          meta: `播放 ${item.play_count ?? 0} 次`,
          extra: `track_id: ${item.track_id || '--'}`,
        }),
      )}
    `
  }

  function renderPageP06(page) {
    if (!Array.isArray(page) || !page.length) return '<div class="empty">暂无数据</div>'
    return `
      <div class="card__eyebrow">关键词</div>
      ${renderRankList(page, (item, index) => ({
        index: String(index + 1),
        title: item.keyword || '--',
        meta: `${item.hit_count ?? 0} 次 · ${item.source_type || '--'}`,
        extra: `${item.representative_track?.title || '--'} · ${item.representative_snippet || '--'}`,
      }))}
    `
  }

  function renderPageP07(page) {
    if (!page) return '<div class="empty">暂无曲库结构</div>'
    return `
      <div class="card__eyebrow">Library Structure</div>
      <div class="muted">文件格式</div>
      ${renderBarChart(page.format_distribution || [], item => ({
        label: item.bucket_label,
        valueRaw: item.item_count,
        valueLabel: `${item.item_count ?? 0} 首`,
      }))}
      <div class="muted">时长区间</div>
      ${renderBarChart(page.duration_distribution || [], item => ({
        label: item.bucket_label,
        valueRaw: item.item_count,
        valueLabel: `${item.item_count ?? 0} 首`,
      }))}
      <div class="muted">曲风分布</div>
      ${renderBarChart(page.genre_distribution || [], item => ({
        label: item.bucket_label,
        valueRaw: item.item_count,
        valueLabel: `${item.item_count ?? 0} 首`,
      }))}
    `
  }

  function renderPageP08(page) {
    if (!page || !Array.isArray(page.top_genres) || !page.top_genres.length) {
      return '<div class="empty">暂无曲风数据</div>'
    }
    return `
      <div class="muted">覆盖率：${escapeHtml(formatPercent(page.data_coverage))}</div>
      <div class="muted">${escapeHtml(page.summary_text || '--')}</div>
      <ol class="list">
        ${page.top_genres.map(item => `
          <li>${escapeHtml(item.genre)} · ${escapeHtml(item.play_count)} 次 · ${escapeHtml(formatPercent(item.ratio))}</li>
        `).join('')}
      </ol>
    `
  }

  function renderSeasonFavorite(page, seasonLabel) {
    if (!page) return '<div class="empty">暂无季节歌曲数据</div>'
    return `
      <div class="stat">${escapeHtml(page.title || '--')}</div>
      <ul class="kv">
        <li>${escapeHtml(seasonLabel)}代表：${escapeHtml(page.artist || '--')}</li>
        <li>播放次数：${escapeHtml(page.play_count ?? '--')} 次</li>
        <li>聆听时长：${escapeHtml(formatDuration(page.listened_sec))}</li>
        <li>活跃天数：${escapeHtml(page.active_days ?? '--')} 天</li>
      </ul>
    `
  }

  function renderPageP12(page) {
    return renderSeasonFavorite(page, '春天')
  }

  function renderPageP13(page) {
    return renderSeasonFavorite(page, '夏天')
  }

  function renderPageP14(page) {
    return renderSeasonFavorite(page, '秋天')
  }

  function renderPageP15(page) {
    return renderSeasonFavorite(page, '冬天')
  }

  function renderPageP16(page) {
    if (!page) return '<div class="empty">暂无年度歌手数据</div>'
    const months = Array.isArray(page.monthly_distribution) ? page.monthly_distribution : []
    const topTrack = page.top_track
    return `
      <div class="card__eyebrow">Artist of the year</div>
      <div class="stat">${escapeHtml(page.artist || '--')}</div>
      ${renderMetricGrid([
        { label: '播放次数', value: `${page.play_count ?? '--'} 次` },
        { label: '活跃月份', value: `${page.active_months ?? '--'} 个月` },
        { label: '聆听时长', value: formatDuration(page.listened_sec) },
      ])}
      <div class="muted">${escapeHtml(page.summary_text || '--')}</div>
      <ol class="list">
        ${months.map(item => `
          <li>${escapeHtml(item.month_no)} 月 · ${escapeHtml(item.month_play_count)} 次</li>
        `).join('')}
      </ol>
      <div class="muted">最常听歌曲：${topTrack ? `${escapeHtml(topTrack.title)} · ${escapeHtml(topTrack.play_count)} 次` : '--'}</div>
    `
  }

  function renderPageP17(page) {
    if (!page) return '<div class="empty">暂无周内分布数据</div>'
    const rows = Array.isArray(page.weekday_distribution) ? page.weekday_distribution : []
    return `
      <div class="card__eyebrow">Weekly pattern</div>
      ${renderMetricGrid([
        { label: '最常听', value: page.most_active_weekday?.weekday_cn || '--' },
        { label: '最少听', value: page.least_active_weekday?.weekday_cn || '--' },
        { label: '偏好时段', value: page.top_time_bucket || '--' },
      ])}
      ${renderBarChart(rows, item => ({
        label: item.weekday_cn,
        valueRaw: item.play_count,
        valueLabel: `${item.play_count} 次`,
      }))}
    `
  }

  function renderPageP18(page) {
    if (!page) return '<div class="empty">暂无数据</div>'
    const rows = Array.isArray(page.calendar_heatmap) ? page.calendar_heatmap : []
    return `
      <div class="pill">活跃天数 ${escapeHtml(page.active_day_count)}</div>
      <div class="pill">最长连续 ${escapeHtml(page.longest_streak_days)} 天</div>
      <div class="calendar-list">
        ${rows.slice(0, 12).map(item => `
          <div class="calendar-item">
            <div>${escapeHtml(item.date)}</div>
            <div class="muted">${escapeHtml(item.play_count)} 次 · ${escapeHtml(formatDuration(item.listened_sec))}</div>
          </div>
        `).join('')}
      </div>
    `
  }

  function renderPageP19(page) {
    if (!page) return '<div class="empty">暂无活跃时段数据</div>'
    const distribution = Array.isArray(page.time_bucket_distribution) ? page.time_bucket_distribution : []
    const representativeTrack = page.representative_track
    return `
      <div class="card__eyebrow">Time bucket</div>
      ${renderMetricGrid([
        { label: '最爱时段', value: page.top_time_bucket || '--' },
        { label: '最活跃小时', value: page.top_hour_range || '--' },
      ])}
      ${renderBarChart(distribution, item => ({
        label: item.time_bucket,
        valueRaw: item.play_count,
        valueLabel: `${item.play_count} 次`,
      }))}
      <div class="muted">代表歌曲：${representativeTrack ? `${escapeHtml(representativeTrack.title)} - ${escapeHtml(representativeTrack.artist)}` : '--'}</div>
    `
  }

  function renderPageP20(page) {
    if (!page) return '<div class="empty">暂无深夜听歌数据</div>'
    const track = page.latest_night_track
    return `
      <div class="stat">${escapeHtml(page.night_session_count)} 晚</div>
      <ul class="kv">
        <li>最近最晚：${escapeHtml(page.latest_night_date || '--')} ${escapeHtml(page.latest_night_time || '--')}</li>
        <li>代表歌曲：${track ? `${escapeHtml(track.title)} - ${escapeHtml(track.artist)}` : '--'}</li>
      </ul>
    `
  }

  function renderPageP22(page) {
    if (!Array.isArray(page) || !page.length) return '<div class="empty">暂无反复听歌数据</div>'
    return `
      <ol class="list">
        ${page.map(item => `
          <li>${escapeHtml(item.title)} - ${escapeHtml(item.artist)} · ${escapeHtml(item.play_count)} 次 · ${escapeHtml(item.active_days)} 天</li>
        `).join('')}
      </ol>
    `
  }

  function renderPageP09(page) {
    if (!Array.isArray(page) || !page.length) return '<div class="empty">暂无数据</div>'
    return renderYearGroups(page, 'period_key', items => {
      const group = items[0]
      const displayGenres = [...(group.genres || [])].sort((a, b) => {
        const aUnknown = /^(未识别|unknown|other)$/i.test(String(a.genre || ''))
        const bUnknown = /^(未识别|unknown|other)$/i.test(String(b.genre || ''))
        if (aUnknown !== bUnknown) return aUnknown ? 1 : -1
        return (b.new_track_count ?? 0) - (a.new_track_count ?? 0)
      })
      return `
        <div class="muted">top_genre：${escapeHtml(group.top_genre || '--')}</div>
        <div class="muted">${escapeHtml(group.summary_text || '--')}</div>
        ${renderBarChart(displayGenres, item => ({
          label: item.genre,
          valueRaw: item.new_track_count,
          valueLabel: `${item.new_track_count ?? 0} 首`,
        }))}
      `
    })
  }

  function renderPageP10(page) {
    if (!page) return '<div class="empty">暂无数据</div>'
    return `
      <div class="card__eyebrow">Taste Score</div>
      <div class="stat">${escapeHtml(page.taste_score ?? '--')}</div>
      ${renderMetricGrid([
        { label: 'taste_score', value: String(page.taste_score ?? 0) },
        { label: '广度', value: String(page.breadth_score ?? 0) },
        { label: '深度', value: String(page.depth_score ?? 0) },
        { label: '新鲜度', value: String(page.freshness_score ?? 0) },
        { label: '均衡度', value: String(page.balance_score ?? 0) },
      ])}
      <div class="muted">${escapeHtml(page.summary_label || '--')} · ${escapeHtml(page.summary_text || '--')}</div>
    `
  }

  function renderPageP23(page) {
    if (!page) return '<div class="empty">暂无年度专辑数据</div>'
    return `
      <div class="card__eyebrow">Album of the year</div>
      <div class="stat">${escapeHtml(page.album || '--')}</div>
      ${renderMetricGrid([
        { label: '歌手', value: page.artist || '--' },
        { label: '播放次数', value: `${page.play_count ?? '--'} 次` },
        { label: '活跃天数', value: `${page.active_days ?? '--'} 天` },
        { label: '歌曲数', value: `${page.track_count ?? '--'} 首` },
        { label: '聆听时长', value: formatDuration(page.listened_sec) },
      ])}
      <div class="muted">${escapeHtml(page.summary_text || '--')}</div>
    `
  }

  function renderPageP24(page) {
    if (!Array.isArray(page) || !page.length) return '<div class="empty">暂无专辑榜单</div>'
    return `
      <div class="muted">${escapeHtml(page[0]?.summary_text || '--')}</div>
      <ol class="list">
        ${page.map(item => `
          <li>${escapeHtml(item.album)} - ${escapeHtml(item.artist)} · ${escapeHtml(item.play_count)} 次 · ${escapeHtml(item.track_count)} 首</li>
        `).join('')}
      </ol>
    `
  }

  function renderPageP25(page) {
    if (!page) return '<div class="empty">暂无年度歌曲</div>'
    return `
      <div class="card__eyebrow">Song of the year</div>
      <div class="stat">${escapeHtml(page.title)}</div>
      ${renderMetricGrid([
        { label: '歌手', value: page.artist || '--' },
        { label: '专辑', value: page.album || '--' },
        { label: '首次遇见', value: formatDateTime(page.first_played_at) },
        { label: '年度播放', value: `${page.year_play_count} 次` },
        { label: '陪伴天数', value: `${page.year_active_days} 天` },
      ])}
      <div class="muted">${escapeHtml(page.summary_text || '--')}</div>
    `
  }

  function renderPageP26(page) {
    if (!Array.isArray(page) || !page.length) return '<div class="empty">暂无年度歌曲榜</div>'
    return renderRankList(page, (item, index) => ({
      index: String(index + 1),
      title: `${item.title} - ${item.artist}`,
      meta: `播放 ${item.play_count} 次 · 活跃 ${item.active_days} 天`,
      extra: `专辑：${item.album || '--'} · 时长：${formatDuration(item.listened_sec)}`,
    }))
  }

  function renderPageP27(page) {
    if (!Array.isArray(page) || !page.length) return '<div class="empty">暂无年度歌手榜</div>'
    return renderRankList(page, (item, index) => ({
      index: String(index + 1),
      title: item.artist,
      meta: `播放 ${item.play_count} 次 · 时长 ${formatDuration(item.listened_sec)}`,
      extra: `代表作：${item.top_track ? `${item.top_track.title} (${item.top_track.play_count} 次)` : '--'}`,
    }))
  }

  function renderPageP28(page) {
    if (!page) return '<div class="empty">暂无年度歌手轨迹</div>'
    return `
      <div class="card__eyebrow">Journey</div>
      <div class="stat">${escapeHtml(page.artist || '--')}</div>
      ${renderMetricGrid([
        { label: '首次遇见', value: formatDateTime(page.first_played_at) },
        { label: '陪伴天数', value: `${page.days_since_first_play ?? '--'} 天` },
        { label: '第一首歌', value: page.first_track ? page.first_track.title : '--' },
        { label: '单日峰值', value: page.peak_day ? `${page.peak_day.date} · ${page.peak_day.play_count} 次` : '--' },
      ])}
    `
  }

  function renderPageP29(page) {
    if (!Array.isArray(page) || !page.length) return '<div class="empty">暂无年度最爱歌手榜单</div>'
    return renderRankList(page, item => ({
      index: String(item.artist_rank ?? '--'),
      title: item.artist || '--',
      meta: `播放 ${item.play_count ?? 0} 次 · 时长 ${formatDuration(item.listened_sec)}`,
      extra: `代表曲：${item.top_track ? `${item.top_track.title} (${item.top_track.play_count} 次)` : '--'}`,
    }))
  }

  function renderPageP30(page) {
    if (!Array.isArray(page) || !page.length) return '<div class="empty">暂无历年歌手榜单</div>'
    return renderYearGroups(page, 'play_year', items => renderRankList(items, item => ({
      index: String(item.artist_rank),
      title: item.artist,
      meta: `播放 ${item.play_count} 次`,
      extra: `聆听时长：${formatDuration(item.listened_sec)}`,
    })))
  }

  function renderPageP31(page) {
    if (!page || !Array.isArray(page.items) || !page.items.length) return '<div class="empty">暂无年度词曲人</div>'
    return `
      <div class="muted">${escapeHtml(page.summary_text || '--')}</div>
      ${renderYearGroups(page.items, 'credit_type', (items, creditType) => renderRankList(items, item => ({
      title: item.credit_name || '--',
      meta: `类型：${creditType || '--'} · 播放 ${item.play_count ?? 0} 次`,
      extra: `聆听时长：${formatDuration(item.listened_sec)}`,
    })))}
    `
  }

  function renderPageL01(page) {
    if (!page) return '<div class="empty">暂无歌曲库总览</div>'
    const metrics = page.metrics || {}
    const coverage = page.coverage || {}
    return `
      <div class="card__eyebrow">Library Summary</div>
      ${renderMetricGrid([
        { label: '歌曲总数', value: `${metrics.track_total ?? 0} 首` },
        { label: '歌手总数', value: `${metrics.artist_total ?? 0}` },
        { label: '专辑总数', value: `${metrics.album_total ?? 0}` },
        { label: '总时长', value: formatDuration(metrics.duration_total_sec) },
        { label: '年度新增歌曲', value: `${metrics.new_track_total ?? 0} 首` },
        { label: '年度新增歌手', value: `${metrics.new_artist_total ?? 0}` },
      ])}
      <div class="muted">${escapeHtml(page.summary_text || '--')}</div>
      ${renderMetricGrid([
        { label: '歌词覆盖率', value: formatPercent(coverage.lyrics_coverage_ratio) },
        { label: '封面覆盖率', value: formatPercent(coverage.cover_coverage_ratio) },
        { label: '曲风覆盖率', value: formatPercent(coverage.genre_coverage_ratio) },
        { label: '专辑覆盖率', value: formatPercent(coverage.album_coverage_ratio) },
      ])}
    `
  }

  function renderPageL02(page) {
    if (!page) return '<div class="empty">暂无年度新增分析</div>'
    return `
      <div class="card__eyebrow">Library Growth</div>
      ${renderMetricGrid([
        { label: '新增歌曲', value: `${page.new_track_total ?? 0} 首` },
        { label: '新增歌手', value: `${page.new_artist_total ?? 0}` },
        { label: '新增专辑', value: `${page.new_album_total ?? 0}` },
        { label: '峰值月份', value: page.peak_new_month || '--' },
      ])}
      <div class="muted">${escapeHtml(page.summary_text || '--')}</div>
      <div class="muted">月度新增</div>
      ${renderBarChart(page.monthly_new_tracks || [], item => ({
        label: item.month,
        valueRaw: item.track_count,
        valueLabel: `${item.track_count ?? 0} 首`,
      }))}
    `
  }

  function renderPageL03(page) {
    if (!page) return '<div class="empty">暂无歌曲库结构分析</div>'
    return `
      <div class="card__eyebrow">Library Profile</div>
      <div class="muted">${escapeHtml(page.summary_text || '--')}</div>
      <div class="muted">语种分布</div>
      ${renderBarChart(page.language_distribution || [], item => ({
        label: item.bucket_label,
        valueRaw: item.item_count,
        valueLabel: `${item.item_count ?? 0} 首`,
      }))}
      <div class="muted">时长分布</div>
      ${renderBarChart(page.duration_distribution || [], item => ({
        label: item.bucket_label,
        valueRaw: item.item_count,
        valueLabel: `${item.item_count ?? 0} 首`,
      }))}
      <div class="muted">曲风分布</div>
      ${renderBarChart(page.genre_distribution || [], item => ({
        label: item.bucket_label,
        valueRaw: item.item_count,
        valueLabel: `${item.item_count ?? 0} 首`,
      }))}
    `
  }

  function renderPageP32(page) {
    if (!page) return '<div class="empty">暂无总结</div>'
    return `
      <div class="card__eyebrow">Year in review</div>
      ${renderSummaryGrid([
        { label: '年度歌曲', value: page.song_of_year ? page.song_of_year.title : '--', accent: true },
        { label: '年度歌手', value: page.artist_of_year ? page.artist_of_year.artist : '--', accent: true },
        { label: '年度专辑', value: page.album_of_year ? page.album_of_year.album : '--', accent: true },
        { label: '歌手初见', value: page.artist_journey ? formatDateTime(page.artist_journey.first_played_at) : '--' },
        { label: '最活跃星期', value: page.most_active_weekday ? page.most_active_weekday.weekday_cn : '--' },
        { label: '深夜代表曲', value: page.latest_night_track ? page.latest_night_track.title : '--' },
        { label: '总播放次数', value: `${page.year_play_count ?? '--'} 次` },
        { label: '总时长', value: formatDuration(page.year_listened_sec) },
        { label: '活跃天数', value: `${page.active_day_count ?? '--'} 天` },
        { label: '陪伴天数', value: `${page.days_since_first_play ?? '--'} 天` },
      ])}
      ${renderMetricGrid([
        { label: '年度歌手首曲', value: page.artist_journey?.first_track?.title || '--' },
        { label: '歌手峰值日', value: page.artist_journey?.peak_day ? `${page.artist_journey.peak_day.date} · ${page.artist_journey.peak_day.play_count} 次` : '--' },
        { label: '夜晚代表', value: page.latest_night_track?.title || '--' },
      ])}
    `
  }

  function renderReport(report) {
    document.querySelector('[data-role="report-year"]').textContent = report.year ?? '--'
    document.querySelector('[data-role="generated-at"]').textContent = formatDateTime(report.generated_at)

    renderers().forEach(([pageId, render]) => {
      setHtml(pageId, render(report.pages?.[pageId]))
    })
  }

  function renderers() {
    return [
      ['P01', renderPageP01],
      ['P02', renderPageP02],
      ['P03', renderPageP03],
      ['P04', renderPageP04],
      ['P05', renderPageP05],
      ['P06', renderPageP06],
      ['P07', renderPageP07],
      ['P08', renderPageP08],
      ['P09', renderPageP09],
      ['P10', renderPageP10],
      ['P12', renderPageP12],
      ['P13', renderPageP13],
      ['P14', renderPageP14],
      ['P15', renderPageP15],
      ['P16', renderPageP16],
      ['P17', renderPageP17],
      ['P18', renderPageP18],
      ['P19', renderPageP19],
      ['P20', renderPageP20],
      ['P22', renderPageP22],
      ['P23', renderPageP23],
      ['P24', renderPageP24],
      ['P25', renderPageP25],
      ['P26', renderPageP26],
      ['P27', renderPageP27],
      ['P28', renderPageP28],
      ['P29', renderPageP29],
      ['P30', renderPageP30],
      ['L01', renderPageL01],
      ['L02', renderPageL02],
      ['L03', renderPageL03],
      ['P31', renderPageP31],
      ['P32', renderPageP32],
    ]
  }

  async function bootstrap() {
    const errorNode = document.querySelector('[data-role="error-message"]')
    try {
      const report = await loadReport(getReportPath())
      renderReport(report)
      errorNode.hidden = true
      errorNode.textContent = ''
    } catch (error) {
      errorNode.hidden = false
      errorNode.textContent = error instanceof Error ? error.message : String(error)
    }
  }

  windowScope.YearReportApp = {
    loadReport,
    bootstrap,
    renderPageP01,
    renderPageP02,
    renderPageP03,
    renderPageP04,
    renderPageP05,
    renderPageP06,
    renderPageP07,
    renderPageP08,
    renderPageP09,
    renderPageP10,
    renderPageP12,
    renderPageP13,
    renderPageP14,
    renderPageP15,
    renderPageP16,
    renderPageP17,
    renderPageP18,
    renderPageP19,
    renderPageP20,
    renderPageP22,
    renderPageP23,
    renderPageP24,
    renderPageP25,
    renderPageP26,
    renderPageP27,
    renderPageP28,
    renderPageP29,
    renderPageP30,
    renderPageL01,
    renderPageL02,
    renderPageL03,
    renderPageP31,
    renderPageP32,
  }

  window.addEventListener('DOMContentLoaded', bootstrap)
})(window)

