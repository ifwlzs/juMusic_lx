(function attachYearReportDataUtils(globalScope) {
  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  function formatDateTime(value) {
    if (!value) return '--'
    try {
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return String(value)
      return date.toLocaleString('zh-CN', { hour12: false })
    } catch {
      return String(value)
    }
  }

  function formatDuration(seconds) {
    if (seconds == null || Number.isNaN(Number(seconds))) return '--'
    const totalSeconds = Math.round(Number(seconds))
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const remainSeconds = totalSeconds % 60
    if (hours > 0) return `${hours}小时${minutes}分`
    if (minutes > 0) return `${minutes}分${remainSeconds}秒`
    return `${remainSeconds}秒`
  }

  function formatPercent(value) {
    if (value == null || Number.isNaN(Number(value))) return '--'
    return `${(Number(value) * 100).toFixed(1)}%`
  }

  globalScope.YearReportDataUtils = {
    escapeHtml,
    formatDateTime,
    formatDuration,
    formatPercent,
  }
  window.YearReportDataUtils = globalScope.YearReportDataUtils
})(window)
