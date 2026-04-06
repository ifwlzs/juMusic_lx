function trimValue(value = '') {
  return String(value || '').trim()
}

function isLegacyRootPlaceholder(providerType, value) {
  return providerType === 'onedrive' && trimValue(value) === '/'
}

function resolveConnectionDisplayName({
  providerType,
  displayName = '',
  rootPathOrUri = '',
  credential = null,
  connectionId = '',
} = {}) {
  const normalizedDisplayName = trimValue(displayName)
  if (normalizedDisplayName && !isLegacyRootPlaceholder(providerType, normalizedDisplayName)) {
    return normalizedDisplayName
  }

  if (providerType === 'onedrive') {
    const accountName = trimValue(credential?.username)
    if (accountName) return accountName
    return 'OneDrive'
  }

  const normalizedRootPath = trimValue(rootPathOrUri)
  if (normalizedRootPath) return normalizedRootPath

  return trimValue(connectionId)
}

function resolveRuleDisplayName({
  providerType,
  ruleName = '',
  connectionDisplayName = '',
  connectionCredential = null,
  selectedConnectionId = '',
} = {}) {
  const normalizedRuleName = trimValue(ruleName)
  if (normalizedRuleName && !isLegacyRootPlaceholder(providerType, normalizedRuleName)) {
    return normalizedRuleName
  }

  return resolveConnectionDisplayName({
    providerType,
    displayName: connectionDisplayName,
    credential: connectionCredential,
    connectionId: selectedConnectionId,
  })
}

module.exports = {
  resolveConnectionDisplayName,
  resolveRuleDisplayName,
}
