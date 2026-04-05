function buildLocalVersionToken({ pathOrUri, fileSize, modifiedTime }) {
  return `${pathOrUri}__${fileSize || 0}__${modifiedTime || 0}`
}

function buildWebdavVersionToken({ etag, modifiedTime, fileSize }) {
  if (etag) return etag
  if (!modifiedTime || !fileSize) return ''
  return `${modifiedTime}__${fileSize}`
}

function didVersionChange(prevToken, nextToken) {
  return Boolean(prevToken) && Boolean(nextToken) && prevToken !== nextToken
}

module.exports = {
  buildLocalVersionToken,
  buildWebdavVersionToken,
  didVersionChange,
}
