const { XMLParser } = require('fast-xml-parser')

function asArray(value) {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function parseModifiedTime(value) {
  if (!value) return undefined
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? undefined : parsed
}

function parseFileSize(value) {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'string' && value.trim() === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function parseMultiStatus(xml = '') {
  if (!xml) return []
  const parser = new XMLParser({
    ignoreAttributes: true,
    removeNSPrefix: true,
    trimValues: true,
  })
  const parsed = parser.parse(xml) || {}
  const multistatus = parsed.multistatus || parsed['d:multistatus'] || parsed['D:multistatus'] || {}
  const responses = asArray(multistatus.response || multistatus['d:response'] || multistatus['D:response'])

  return responses.map(response => {
    const href = response?.href || response?.['d:href'] || response?.['D:href']
    const propstats = asArray(response?.propstat || response?.['d:propstat'] || response?.['D:propstat'])
    let etag
    let modifiedTime
    let fileSize
    for (const propstat of propstats) {
      const prop = propstat?.prop || propstat?.['d:prop'] || propstat?.['D:prop']
      if (!prop) continue
      if (etag == null && prop.getetag != null) etag = prop.getetag
      if (modifiedTime == null && prop.getlastmodified != null) {
        const parsedTime = parseModifiedTime(prop.getlastmodified)
        if (parsedTime != null) modifiedTime = parsedTime
      }
      if (fileSize == null && prop.getcontentlength != null) {
        const parsedSize = parseFileSize(prop.getcontentlength)
        if (parsedSize != null) fileSize = parsedSize
      }
    }
    return {
      href,
      etag,
      modifiedTime,
      fileSize,
    }
  }).filter(item => item.href)
}

module.exports = {
  parseMultiStatus,
}
