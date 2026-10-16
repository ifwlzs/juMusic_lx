const headersByUrl = new Map()

function setPlayHeaders(url, headers) {
  if (!url || !headers || typeof headers !== 'object') return
  if (!Object.keys(headers).length) return
  headersByUrl.set(String(url), headers)
}

function getPlayHeaders(url) {
  if (!url) return null
  return headersByUrl.get(String(url)) || null
}

module.exports = {
  setPlayHeaders,
  getPlayHeaders,
}
