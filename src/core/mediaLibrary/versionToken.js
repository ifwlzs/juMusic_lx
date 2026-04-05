function buildLocalVersionToken({ pathOrUri, fileSize, modifiedTime }) {
  return `${pathOrUri}__${fileSize || 0}__${modifiedTime || 0}`
}

function didVersionChange(prevToken, nextToken) {
  return Boolean(prevToken) && Boolean(nextToken) && prevToken !== nextToken
}

module.exports = {
  buildLocalVersionToken,
  didVersionChange,
}
