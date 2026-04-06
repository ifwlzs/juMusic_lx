const CREDENTIAL_FIELDS = ['host', 'share', 'username', 'password', 'accountId', 'authority']

function sanitizeCredential(credential = {}) {
  const nextCredential = {}

  for (const field of CREDENTIAL_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(credential, field)) continue
    if (credential[field] == null) continue
    nextCredential[field] = credential[field]
  }

  return nextCredential
}

async function resolveConnectionCredential(connection, repository) {
  if (!connection?.credentialRef) return null
  return await repository.getCredential(connection.credentialRef)
}

module.exports = {
  sanitizeCredential,
  resolveConnectionCredential,
}
