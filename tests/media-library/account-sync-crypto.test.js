const test = require('node:test')
const assert = require('node:assert/strict')

const {
  deriveAccountSyncKey,
  createAccountSyncEncryptedEnvelope,
} = require('../../src/screens/Home/Views/Setting/settings/Backup/accountSyncCrypto.js')

const toB64 = text => Buffer.from(text, 'binary').toString('base64')

test('deriveAccountSyncKey hashes `${password}\\n${salt}` then encodes first 16 SHA1 bytes as base64', async() => {
  const hashInputs = []
  const key = await deriveAccountSyncKey('pass_123', 'salt_456', {
    async hashSHA1(text) {
      hashInputs.push(text)
      return '00112233445566778899aabbccddeeff12345678'
    },
    btoa: toB64,
  })

  assert.deepEqual(hashInputs, ['pass_123\nsalt_456'])
  assert.equal(key, 'ABEiM0RVZneImaq7zN3u/w==')
})

test('deriveAccountSyncKey throws explicit errors for missing password/hash/base64 dependency', async() => {
  await assert.rejects(
    deriveAccountSyncKey('', 'salt_1', {
      async hashSHA1() { return '00112233445566778899aabbccddeeff12345678' },
      btoa: toB64,
    }),
    /account_sync_password_required/,
  )

  await assert.rejects(
    deriveAccountSyncKey('pass_1', 'salt_1', {
      btoa: toB64,
    }),
    /account_sync_hash_unavailable/,
  )

  await assert.rejects(
    deriveAccountSyncKey('pass_1', 'salt_1', {
      async hashSHA1() { return '00112233445566778899aabbccddeeff12345678' },
    }),
    /account_sync_base64_unavailable/,
  )
})

test('createAccountSyncEncryptedEnvelope builds AES-128-CBC envelope with salt/iv and payload metadata', async() => {
  const payload = {
    type: 'accountSyncPlain_v1',
    appVersion: '2.9.0',
    exportedAt: 1711111111000,
    mediaSource: { connections: [] },
  }
  const encryptCalls = []
  const hashInputs = []
  const randomValues = [0.111111, 0.222222, 0.333333, 0.444444]
  const deps = {
    now: () => 1712345678901,
    random: () => randomValues.shift(),
    async hashSHA1(text) {
      hashInputs.push(text)
      if (text === 'strong_password\nEREREREREREREREREREREQ==') {
        return '00112233445566778899aabbccddeeff12345678'
      }
      if (text === 'account-sync::salt::1712345678901::0.111111::0.222222') {
        return '11111111111111111111111111111111aabbccdd'
      }
      if (text === 'account-sync::iv::1712345678901::0.333333::0.444444') {
        return '22222222222222222222222222222222aabbccdd'
      }
      throw new Error(`unexpected_hash_input:${text}`)
    },
    btoa: toB64,
    AES_MODE: {
      CBC_128_PKCS7Padding: 'CBC_128_PKCS7Padding',
    },
    async aesEncrypt(text, key, iv, mode) {
      encryptCalls.push({ text, key, iv, mode })
      return 'encrypted_payload_base64'
    },
  }

  const envelope = await createAccountSyncEncryptedEnvelope(payload, 'strong_password', deps)

  assert.equal(envelope.type, 'accountSyncEncrypted_v1')
  assert.equal(envelope.appVersion, '2.9.0')
  assert.equal(envelope.exportedAt, 1711111111000)
  assert.deepEqual(envelope.cipher, {
    algorithm: 'AES-128-CBC',
    kdf: 'sha1(password\\nsalt)->first16bytes',
    payloadType: 'accountSyncPlain_v1',
    salt: 'EREREREREREREREREREREQ==',
    iv: 'IiIiIiIiIiIiIiIiIiIiIg==',
    ciphertext: 'encrypted_payload_base64',
  })
  assert.notEqual(envelope.cipher.salt, envelope.cipher.iv)

  assert.deepEqual(hashInputs, [
    'account-sync::salt::1712345678901::0.111111::0.222222',
    'account-sync::iv::1712345678901::0.333333::0.444444',
    'strong_password\nEREREREREREREREREREREQ==',
  ])
  assert.deepEqual(encryptCalls, [{
    text: Buffer.from(JSON.stringify(payload)).toString('base64'),
    key: 'ABEiM0RVZneImaq7zN3u/w==',
    iv: 'IiIiIiIiIiIiIiIiIiIiIg==',
    mode: 'CBC_128_PKCS7Padding',
  }])
})

test('createAccountSyncEncryptedEnvelope falls back to now() exportedAt and empty appVersion by default', async() => {
  const deps = {
    now: () => 222,
    random: () => 0.5,
    async hashSHA1(text) {
      if (text === 'account-sync::salt::222::0.5::0.5') return '33333333333333333333333333333333abcdabcd'
      if (text === 'account-sync::iv::222::0.5::0.5') return '44444444444444444444444444444444abcdabcd'
      if (text === 'pass\nMzMzMzMzMzMzMzMzMzMzMw==') return '00112233445566778899aabbccddeeff12345678'
      throw new Error(`unexpected_hash_input:${text}`)
    },
    btoa: toB64,
    AES_MODE: { CBC_128_PKCS7Padding: 'CBC_128_PKCS7Padding' },
    async aesEncrypt() { return 'cipher_x' },
  }
  const envelope = await createAccountSyncEncryptedEnvelope({ type: 'accountSyncPlain_v1' }, 'pass', deps)
  assert.equal(envelope.exportedAt, 222)
  assert.equal(envelope.appVersion, '')
})

test('createAccountSyncEncryptedEnvelope throws explicit errors for missing password/hash/base64/encrypt dependencies', async() => {
  await assert.rejects(
    createAccountSyncEncryptedEnvelope({ type: 'accountSyncPlain_v1' }, '', {
      now: () => 1,
      random: () => 0.5,
      async hashSHA1() { return '00112233445566778899aabbccddeeff12345678' },
      btoa: toB64,
      AES_MODE: { CBC_128_PKCS7Padding: 'CBC_128_PKCS7Padding' },
      async aesEncrypt() { return 'x' },
    }),
    /account_sync_password_required/,
  )

  await assert.rejects(
    createAccountSyncEncryptedEnvelope({ type: 'accountSyncPlain_v1' }, 'pass', {
      now: () => 1,
      random: () => 0.5,
      btoa: toB64,
      AES_MODE: { CBC_128_PKCS7Padding: 'CBC_128_PKCS7Padding' },
      async aesEncrypt() { return 'x' },
    }),
    /account_sync_hash_unavailable/,
  )

  await assert.rejects(
    createAccountSyncEncryptedEnvelope({ type: 'accountSyncPlain_v1' }, 'pass', {
      now: () => 1,
      random: () => 0.5,
      async hashSHA1() { return '00112233445566778899aabbccddeeff12345678' },
      AES_MODE: { CBC_128_PKCS7Padding: 'CBC_128_PKCS7Padding' },
      async aesEncrypt() { return 'x' },
    }),
    /account_sync_base64_unavailable/,
  )

  await assert.rejects(
    createAccountSyncEncryptedEnvelope({ type: 'accountSyncPlain_v1' }, 'pass', {
      now: () => 1,
      random: () => 0.5,
      async hashSHA1() { return '00112233445566778899aabbccddeeff12345678' },
      btoa: toB64,
      AES_MODE: { CBC_128_PKCS7Padding: 'CBC_128_PKCS7Padding' },
    }),
    /account_sync_encrypt_unavailable/,
  )
})
