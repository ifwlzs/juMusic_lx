function buildLocalVersionToken({ pathOrUri, fileSize, modifiedTime }) {
  return `${pathOrUri}__${fileSize || 0}__${modifiedTime || 0}`
}

function buildWebdavVersionToken({ etag, modifiedTime, fileSize }) {
  if (etag) return etag
  if (!modifiedTime || !fileSize) return ''
  return `${modifiedTime}__${fileSize}`
}

function buildSmbVersionToken({ modifiedTime, fileSize, pathOrUri }) {
  if (modifiedTime == null || fileSize == null) return ''
  return `${modifiedTime}__${fileSize}__${pathOrUri || ''}`
}

function didVersionChange(prevToken, nextToken) {
  return Boolean(prevToken) && Boolean(nextToken) && prevToken !== nextToken
}

module.exports = {
  buildLocalVersionToken,
  buildWebdavVersionToken,
  buildSmbVersionToken,
  didVersionChange,
}
