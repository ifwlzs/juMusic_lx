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
    mediaSource: { connections: [] },
  }
  const encryptCalls = []
  const hashInputs = []
  const deps = {
    now: () => 1712345678901,
    random: () => 0.123456789,
    async hashSHA1(text) {
      hashInputs.push(text)
      if (text === 'strong_password\nEREREREREREREREREREREQ==') {
        return '00112233445566778899aabbccddeeff12345678'
      }
      if (text.startsWith('salt\n')) {
        return '11111111111111111111111111111111aabbccdd'
      }
      if (text.startsWith('iv\n')) {
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

  assert.deepEqual(Object.keys(envelope).sort(), ['cipher', 'exportedAt', 'type'])
  assert.equal(envelope.type, 'accountSyncEncrypted_v1')
  assert.equal(envelope.exportedAt, 1712345678901)
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
    'salt\n1712345678901\n0.123456789',
    'iv\n1712345678901\n0.123456789',
    'strong_password\nEREREREREREREREREREREQ==',
  ])
  assert.deepEqual(encryptCalls, [{
    text: Buffer.from(JSON.stringify(payload)).toString('base64'),
    key: 'ABEiM0RVZneImaq7zN3u/w==',
    iv: 'IiIiIiIiIiIiIiIiIiIiIg==',
    mode: 'CBC_128_PKCS7Padding',
  }])
})

test('createAccountSyncEncryptedEnvelope throws explicit encrypt dependency error', async() => {
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
