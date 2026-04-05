function normalizeText(value = '') {
  return String(value).trim().replace(/\s+/g, ' ').toLowerCase()
}

module.exports = {
  normalizeText,
}
