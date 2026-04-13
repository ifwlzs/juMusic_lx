function isObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function ensurePassword(password) {
  if (typeof password !== 'string' || !password.trim()) {
    throw new Error('account_sync_password_required')
  }
  return password
}

function resolveHashFn(deps = {}) {
  const hashSHA1 = deps.hashSHA1
  if (typeof hashSHA1 !== 'function') throw new Error('account_sync_hash_unavailable')
  return hashSHA1
}

function resolveBase64Fn(deps = {}) {
  const btoa = deps.btoa
  if (typeof btoa !== 'function') throw new Error('account_sync_base64_unavailable')
  return btoa
}

function resolveEncryptFn(deps = {}) {
  const aesEncrypt = deps.aesEncrypt
  if (typeof aesEncrypt !== 'function') throw new Error('account_sync_encrypt_unavailable')
  return aesEncrypt
}

function readHexByte(hex, index) {
  return parseInt(hex.slice(index * 2, index * 2 + 2), 16)
}

function encodeFirst16HexBytesToBase64(hex, btoa) {
  const normalizedHex = String(hex || '').trim().slice(0, 32)
  let binary = ''
  for (let index = 0; index < 16; index += 1) {
    const byteValue = readHexByte(normalizedHex, index)
    binary += String.fromCharCode(Number.isFinite(byteValue) ? byteValue : 0)
  }
  return btoa(binary)
}

function encodeUtf8Base64(text, btoa) {
  if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
    return Buffer.from(text, 'utf8').toString('base64')
  }

  const byteString = encodeURIComponent(text).replace(/%([0-9a-f]{2})/gi, (_, hex) => {
    return String.fromCharCode(parseInt(hex, 16))
  })
  return btoa(byteString)
}

async function deriveAccountSyncKey(password, salt, deps = {}) {
  const nextPassword = ensurePassword(password)
  const hashSHA1 = resolveHashFn(deps)
  const btoa = resolveBase64Fn(deps)
  const hashInput = `${nextPassword}\n${salt || ''}`
  const sha1Hex = await hashSHA1(hashInput)
  return encodeFirst16HexBytesToBase64(sha1Hex, btoa)
}

function createRandomHashInput(kind, now, random) {
  return `account-sync::${kind}::${now()}::${random()}::${random()}`
}

async function createAccountSyncEncryptedEnvelope(payload = {}, password, deps = {}) {
  const inputPayload = isObject(payload) ? payload : {}
  const inputDeps = isObject(deps) ? deps : {}
  const hashSHA1 = resolveHashFn(inputDeps)
  const btoa = resolveBase64Fn(inputDeps)
  const aesEncrypt = resolveEncryptFn(inputDeps)
  const now = typeof inputDeps.now === 'function' ? inputDeps.now : () => Date.now()
  const random = typeof inputDeps.random === 'function' ? inputDeps.random : Math.random
  const exportedAt = inputPayload.exportedAt ?? now()
  const appVersion = typeof inputPayload.appVersion === 'string' ? inputPayload.appVersion : ''
  const mode = inputDeps.AES_MODE?.CBC_128_PKCS7Padding ?? 'CBC_128_PKCS7Padding'

  const saltHash = await hashSHA1(createRandomHashInput('salt', now, random))
  const ivHash = await hashSHA1(createRandomHashInput('iv', now, random))
  const salt = encodeFirst16HexBytesToBase64(saltHash, btoa)
  const iv = encodeFirst16HexBytesToBase64(ivHash, btoa)
  const key = await deriveAccountSyncKey(password, salt, { hashSHA1, btoa })
  const plainText = encodeUtf8Base64(JSON.stringify(inputPayload), btoa)
  const ciphertext = await aesEncrypt(plainText, key, iv, mode)

  return {
    type: 'accountSyncEncrypted_v1',
    appVersion,
    exportedAt,
    cipher: {
      algorithm: 'AES-128-CBC',
      kdf: 'sha1(password\\nsalt)->first16bytes',
      payloadType: inputPayload.type,
      salt,
      iv,
      ciphertext,
    },
  }
}

module.exports = {
  deriveAccountSyncKey,
  createAccountSyncEncryptedEnvelope,
}
