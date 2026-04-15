# WebDAV 手动上传账号同步 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在“设置 -> 备份与恢复”中新增一个独立的 WebDAV 账号同步入口，支持把“设置 + 媒体来源连接 / 凭据 / 导入规则”用用户输入的同步密码加密后，手动上传到固定远端路径。

**Architecture:** 实现拆成四层：`accountSync.js` 负责同步包组装与同步账号状态归一化，`accountSyncCrypto.js` 负责把明文包加密成版本化 envelope，`accountSyncWebdav.js` 负责目录检查 / `MKCOL` / `PUT` 上传，`AccountSync.tsx + actions.ts` 负责备份页 UI、同步账号持久化和实际上传流程。所有纯逻辑模块都保持可注入依赖，优先用 `node:test` 做可执行测试，UI 接线继续沿用现有 regex contract test 风格。

**Tech Stack:** React Native, TypeScript/JavaScript mixed codebase, AsyncStorage (`src/plugins/storage.ts`), existing WebDAV helpers (`src/core/mediaLibrary/webdav.js`), native crypto bridge (`src/utils/nativeModules/crypto.ts`), `node:test`.

---

## File Structure

- `tests/media-library/account-sync-backup.test.js`
  - 负责锁定同步账号状态归一化、validation key、明文同步包只包含 `settings + mediaSource(connections/credentials/importRules)`。
- `tests/media-library/account-sync-crypto.test.js`
  - 负责锁定加密 envelope 的结构、密钥派生输入、随机 `salt / iv` 与 `AES/CBC/PKCS7Padding` 调用约定。
- `tests/media-library/account-sync-webdav.test.js`
  - 负责锁定远端目录规范化、逐级 `MKCOL`、固定上传路径和 actions 的存储 / handler 接线。
- `tests/media-library/account-sync-ui.test.js`
  - 负责锁定备份页“账号同步”分组、配置 / 上传弹窗接线和文案键。
- `src/config/constant.ts`
  - 新增独立的同步账号存储 key。
- `src/screens/Home/Views/Setting/settings/Backup/accountSync.js`
  - 负责同步账号 profile / state 归一化、validation key 和明文同步包组装。
- `src/screens/Home/Views/Setting/settings/Backup/accountSyncCrypto.js`
  - 负责基于同步密码生成 `accountSyncEncrypted_v1`。
- `src/screens/Home/Views/Setting/settings/Backup/accountSyncWebdav.js`
  - 负责 `remoteDir` 规范化、`PROPFIND / MKCOL / PUT` 封装和固定路径上传。
- `src/screens/Home/Views/Setting/settings/Backup/actions.ts`
  - 负责同步账号配置读写、连接验证、错误文案映射、调用 payload / crypto / webdav 模块完成上传。
- `src/screens/Home/Views/Setting/settings/Backup/AccountSync.tsx`
  - 负责账号同步区块 UI、WebDAV 配置弹窗、同步密码弹窗与状态摘要展示。
- `src/screens/Home/Views/Setting/settings/Backup/Part.tsx`
  - 挂载账号同步区块与组件。
- `src/lang/zh-cn.json`
- `src/lang/zh-tw.json`
- `src/lang/en-us.json`
  - 新增账号同步文案。
- `CHANGELOG.md`
  - 记录账号同步能力。

### Task 1: Add account sync state normalization and plain payload builder

**Files:**
- Create: `tests/media-library/account-sync-backup.test.js`
- Modify: `src/config/constant.ts`
- Create: `src/screens/Home/Views/Setting/settings/Backup/accountSync.js`
- Test: `tests/media-library/account-sync-backup.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/media-library/account-sync-backup.test.js
const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildAccountSyncPayload,
  createAccountSyncValidationKey,
  createEmptyAccountSyncState,
  normalizeAccountSyncState,
  normalizeAccountSyncProfile,
} = require('../../src/screens/Home/Views/Setting/settings/Backup/accountSync.js')

test('account sync payload only exports settings plus minimal media source state', async() => {
  const payload = await buildAccountSyncPayload({
    exportedAt: 123456789,
    appVersion: '0.26.04131202',
    setting: {
      version: '1.0.0',
      'theme.id': 'happy_new_year',
      'common.langId': 'zh-CN',
    },
    repository: {
      async getConnections() {
        return [{
          connectionId: 'conn_1',
          providerType: 'webdav',
          displayName: 'NAS',
          rootPathOrUri: '/Music',
          credentialRef: 'cred_1',
          lastScanAt: 999,
          lastScanStatus: 'success',
          lastScanSummary: 'stale field that should not export',
          listProjectionEnabled: true,
        }]
      },
      async getImportRules() {
        return [{
          ruleId: 'rule_1',
          connectionId: 'conn_1',
          name: 'Albums',
          mode: 'merged',
          directories: [{ selectionId: 'dir_1', kind: 'directory', pathOrUri: '/Albums', displayName: 'Albums' }],
          tracks: [],
          generatedListIds: ['generated_should_not_export'],
          lastSyncAt: 1000,
          lastSyncStatus: 'success',
          lastSyncSummary: 'stale field that should not export',
        }]
      },
      async getCredential(credentialRef) {
        if (credentialRef !== 'cred_1') return null
        return {
          username: 'admin',
          password: 'secret',
        }
      },
      async getPlayHistory() { return [{ aggregateSongId: 'agg_should_not_export' }] },
      async getPlayStats() { return [{ aggregateSongId: 'agg_should_not_export' }] },
      async getAggregateSongs() { return [{ aggregateSongId: 'agg_should_not_export' }] },
      async getAllSourceItems() { return [{ sourceItemId: 'item_should_not_export' }] },
      async getImportSnapshot() { return { ruleId: 'rule_1', scannedAt: 100 } },
      async getSyncSnapshot() { return { ruleId: 'rule_1', capturedAt: 120 } },
    },
  })

  assert.deepEqual(payload, {
    type: 'accountSyncPlain_v1',
    appVersion: '0.26.04131202',
    exportedAt: 123456789,
    settings: {
      version: '1.0.0',
      'theme.id': 'happy_new_year',
      'common.langId': 'zh-CN',
    },
    mediaSource: {
      connections: [{
        connectionId: 'conn_1',
        providerType: 'webdav',
        displayName: 'NAS',
        rootPathOrUri: '/Music',
        credentialRef: 'cred_1',
      }],
      credentials: {
        cred_1: {
          username: 'admin',
          password: 'secret',
        },
      },
      importRules: [{
        ruleId: 'rule_1',
        connectionId: 'conn_1',
        name: 'Albums',
        mode: 'merged',
        directories: [{ selectionId: 'dir_1', kind: 'directory', pathOrUri: '/Albums', displayName: 'Albums' }],
        tracks: [],
      }],
    },
  })
})

test('account sync state normalizes profile fields and produces a stable validation key', () => {
  assert.deepEqual(createEmptyAccountSyncState(), {
    version: 1,
    profile: {
      displayName: '',
      serverUrl: '',
      username: '',
      password: '',
      remoteDir: '/',
    },
    validationKey: null,
    lastValidatedAt: null,
    lastUploadAt: null,
    lastUploadStatus: 'idle',
    lastUploadMessage: '',
  })

  const normalizedProfile = normalizeAccountSyncProfile({
    displayName: '  家里 NAS  ',
    serverUrl: ' https://dav.example.com/root/ ',
    username: ' admin ',
    password: 'secret',
    remoteDir: ' /Apps/juMusicSync/ ',
  })

  assert.deepEqual(normalizedProfile, {
    displayName: '家里 NAS',
    serverUrl: 'https://dav.example.com/root/',
    username: 'admin',
    password: 'secret',
    remoteDir: '/Apps/juMusicSync',
  })

  assert.equal(
    createAccountSyncValidationKey(normalizedProfile),
    JSON.stringify({
      serverUrl: 'https://dav.example.com/root/',
      username: 'admin',
      password: 'secret',
      remoteDir: '/Apps/juMusicSync',
    }),
  )

  assert.deepEqual(normalizeAccountSyncState({
    profile: normalizedProfile,
    validationKey: 'v1',
    lastValidatedAt: 111,
    lastUploadAt: 222,
    lastUploadStatus: 'failed',
    lastUploadMessage: '401 Unauthorized',
  }), {
    version: 1,
    profile: normalizedProfile,
    validationKey: 'v1',
    lastValidatedAt: 111,
    lastUploadAt: 222,
    lastUploadStatus: 'failed',
    lastUploadMessage: '401 Unauthorized',
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/media-library/account-sync-backup.test.js`

Expected: FAIL because `accountSync.js` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```js
// src/screens/Home/Views/Setting/settings/Backup/accountSync.js
function trimValue(value) {
  return String(value ?? '').trim()
}

function normalizeServerUrl(serverUrl = '') {
  const trimmed = trimValue(serverUrl)
  if (!trimmed) return ''
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`
}

function normalizeRemoteDir(remoteDir = '') {
  const trimmed = trimValue(remoteDir)
  if (!trimmed || trimmed === '/') return '/'
  return `/${trimmed.replace(/^\/+/, '').replace(/\/+$/, '')}`
}

function normalizeAccountSyncProfile(profile = {}) {
  return {
    displayName: trimValue(profile.displayName),
    serverUrl: normalizeServerUrl(profile.serverUrl),
    username: trimValue(profile.username),
    password: String(profile.password ?? ''),
    remoteDir: normalizeRemoteDir(profile.remoteDir),
  }
}

function createAccountSyncValidationKey(profile = {}) {
  const normalized = normalizeAccountSyncProfile(profile)
  return JSON.stringify({
    serverUrl: normalized.serverUrl,
    username: normalized.username,
    password: normalized.password,
    remoteDir: normalized.remoteDir,
  })
}

function createEmptyAccountSyncState() {
  return {
    version: 1,
    profile: {
      displayName: '',
      serverUrl: '',
      username: '',
      password: '',
      remoteDir: '/',
    },
    validationKey: null,
    lastValidatedAt: null,
    lastUploadAt: null,
    lastUploadStatus: 'idle',
    lastUploadMessage: '',
  }
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value))
}

function pickSelectionForAccountSync(selection = {}) {
  return {
    selectionId: selection.selectionId,
    kind: selection.kind,
    pathOrUri: selection.pathOrUri,
    displayName: selection.displayName,
  }
}

function pickConnectionForAccountSync(connection = {}) {
  return {
    connectionId: connection.connectionId,
    providerType: connection.providerType,
    displayName: connection.displayName,
    rootPathOrUri: connection.rootPathOrUri,
    credentialRef: connection.credentialRef ?? null,
  }
}

function pickImportRuleForAccountSync(rule = {}) {
  return {
    ruleId: rule.ruleId,
    connectionId: rule.connectionId,
    name: rule.name,
    mode: rule.mode,
    directories: Array.isArray(rule.directories) ? rule.directories.map(pickSelectionForAccountSync) : [],
    tracks: Array.isArray(rule.tracks) ? rule.tracks.map(pickSelectionForAccountSync) : [],
  }
}

function normalizeAccountSyncState(state = {}) {
  const base = createEmptyAccountSyncState()
  return {
    ...base,
    ...state,
    profile: normalizeAccountSyncProfile(state.profile || {}),
    validationKey: state.validationKey ?? null,
    lastValidatedAt: Number.isFinite(state.lastValidatedAt) ? state.lastValidatedAt : null,
    lastUploadAt: Number.isFinite(state.lastUploadAt) ? state.lastUploadAt : null,
    lastUploadStatus: ['idle', 'success', 'failed'].includes(state.lastUploadStatus)
      ? state.lastUploadStatus
      : 'idle',
    lastUploadMessage: String(state.lastUploadMessage ?? ''),
  }
}

async function buildAccountSyncPayload({
  exportedAt = Date.now(),
  appVersion = '',
  setting = {},
  repository,
}) {
  const connections = ((await repository.getConnections()) || []).map(pickConnectionForAccountSync)
  const importRules = ((await repository.getImportRules()) || []).map(pickImportRuleForAccountSync)
  const credentials = Object.fromEntries((await Promise.all(connections.map(async connection => {
    if (!connection?.credentialRef) return null
    const credential = await repository.getCredential(connection.credentialRef)
    return credential ? [connection.credentialRef, cloneJson(credential)] : null
  }))).filter(Boolean))

  return {
    type: 'accountSyncPlain_v1',
    appVersion,
    exportedAt,
    settings: cloneJson(setting || {}),
    mediaSource: {
      connections,
      credentials,
      importRules,
    },
  }
}

module.exports = {
  buildAccountSyncPayload,
  createAccountSyncValidationKey,
  createEmptyAccountSyncState,
  normalizeAccountSyncProfile,
  normalizeAccountSyncState,
  normalizeRemoteDir,
}
```

```ts
// src/config/constant.ts
export const storageDataPrefix = {
  setting: '@setting_v1',
  userList: '@user_list',
  mediaLibrary: '@media_library__',
  viewPrevState: '@view_prev_state',
  accountSync: '@account_sync',

  list: '@list__',
} as const
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/media-library/account-sync-backup.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/media-library/account-sync-backup.test.js src/config/constant.ts src/screens/Home/Views/Setting/settings/Backup/accountSync.js
git commit -m "feat: add account sync payload builder"
```

### Task 2: Add encrypted envelope builder for account sync uploads

**Files:**
- Create: `tests/media-library/account-sync-crypto.test.js`
- Create: `src/screens/Home/Views/Setting/settings/Backup/accountSyncCrypto.js`
- Test: `tests/media-library/account-sync-crypto.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/media-library/account-sync-crypto.test.js
const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createAccountSyncEncryptedEnvelope,
  deriveAccountSyncKey,
} = require('../../src/screens/Home/Views/Setting/settings/Backup/accountSyncCrypto.js')

test('deriveAccountSyncKey hashes password plus salt and keeps the first 16 bytes as AES-128 key', async() => {
  const key = await deriveAccountSyncKey('sync-password', 'c2FsdA==', {
    hashSHA1: async(input) => {
      assert.equal(input, 'sync-password\nc2FsdA==')
      return '00112233445566778899aabbccddeeff00112233'
    },
  })

  assert.equal(key, Buffer.from('00112233445566778899aabbccddeeff', 'hex').toString('base64'))
})

test('createAccountSyncEncryptedEnvelope emits a versioned AES-CBC envelope with fresh salt and iv', async() => {
  const encryptCalls = []
  const randomInputs = []
  const expectedSalt = Buffer.from('00112233445566778899aabbccddeeff', 'hex').toString('base64')
  const expectedIv = Buffer.from('8899aabbccddeeff0011223344556677', 'hex').toString('base64')
  const expectedKey = Buffer.from('ffeeddccbbaa99887766554433221100', 'hex').toString('base64')

  const envelope = await createAccountSyncEncryptedEnvelope({
    type: 'accountSyncPlain_v1',
    appVersion: '0.26.04131202',
    exportedAt: 987654321,
    settings: { 'theme.id': 'happy_new_year' },
    mediaSource: { connections: [], credentials: {}, importRules: [] },
  }, 'sync-password', {
    btoa(text) {
      return Buffer.from(text).toString('base64')
    },
    now() {
      return 987654321
    },
    random() {
      return 0.5
    },
    async hashSHA1(input) {
      if (input === `sync-password\n${expectedSalt}`) return 'ffeeddccbbaa9988776655443322110000112233'
      if (input.startsWith('account-sync::salt::')) {
        randomInputs.push(input)
        return '00112233445566778899aabbccddeeff00112233'
      }
      if (input.startsWith('account-sync::iv::')) {
        randomInputs.push(input)
        return '8899aabbccddeeff001122334455667700112233'
      }
      throw new Error(`unexpected hash input: ${input}`)
    },
    async aesEncrypt(payloadB64, keyB64, ivB64, mode) {
      encryptCalls.push({ payloadB64, keyB64, ivB64, mode })
      return 'cipher_b64'
    },
    AES_MODE: {
      CBC_128_PKCS7Padding: 'AES/CBC/PKCS7Padding',
      },
  })

  assert.equal(randomInputs.length, 2)
  assert.equal(envelope.type, 'accountSyncEncrypted_v1')
  assert.equal(envelope.exportedAt, 987654321)
  assert.equal(envelope.cipher.algorithm, 'AES-128-CBC')
  assert.equal(envelope.cipher.payloadType, 'accountSyncPlain_v1')
  assert.equal(envelope.cipher.kdf, 'sha1(password\\nsalt)->first16bytes')
  assert.equal(envelope.cipher.salt, expectedSalt)
  assert.equal(envelope.cipher.iv, expectedIv)
  assert.equal(envelope.cipher.ciphertext, 'cipher_b64')
  assert.equal(encryptCalls[0].keyB64, expectedKey)
  assert.equal(encryptCalls[0].mode, 'AES/CBC/PKCS7Padding')
  assert.notEqual(envelope.cipher.salt, envelope.cipher.iv)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/media-library/account-sync-crypto.test.js`

Expected: FAIL because `accountSyncCrypto.js` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```js
// src/screens/Home/Views/Setting/settings/Backup/accountSyncCrypto.js
function toBase64FromHex(hex = '', byteLength = 16) {
  const normalized = String(hex).replace(/[^0-9a-f]/ig, '')
  return Buffer.from(normalized.slice(0, byteLength * 2).padEnd(byteLength * 2, '0'), 'hex').toString('base64')
}

async function deriveAccountSyncKey(password, salt, {
  hashSHA1,
} = {}) {
  if (!password) throw new Error('account_sync_password_required')
  if (typeof hashSHA1 !== 'function') throw new Error('account_sync_hash_unavailable')

  const digest = await hashSHA1(`${password}\n${salt}`)
  return toBase64FromHex(digest)
}

async function createRandomBase64(label, {
  hashSHA1,
  now = Date.now,
  random = Math.random,
} = {}) {
  if (typeof hashSHA1 !== 'function') throw new Error('account_sync_hash_unavailable')
  const digest = await hashSHA1(`account-sync::${label}::${now()}::${random()}::${random()}`)
  return toBase64FromHex(digest, 16)
}

async function createAccountSyncEncryptedEnvelope(payload, password, {
  btoa,
  now = Date.now,
  random = Math.random,
  hashSHA1,
  aesEncrypt,
  AES_MODE,
} = {}) {
  if (!password) throw new Error('account_sync_password_required')
  if (typeof btoa !== 'function') throw new Error('account_sync_base64_unavailable')
  if (typeof aesEncrypt !== 'function') throw new Error('account_sync_encrypt_unavailable')

  const salt = await createRandomBase64('salt', { hashSHA1, now, random })
  const iv = await createRandomBase64('iv', { hashSHA1, now, random })
  const key = await deriveAccountSyncKey(password, salt, { hashSHA1 })
  const ciphertext = await aesEncrypt(
    btoa(JSON.stringify(payload)),
    key,
    iv,
    AES_MODE.CBC_128_PKCS7Padding,
  )

  return {
    type: 'accountSyncEncrypted_v1',
    appVersion: payload.appVersion || '',
    exportedAt: payload.exportedAt ?? now(),
    cipher: {
      algorithm: 'AES-128-CBC',
      kdf: 'sha1(password\\nsalt)->first16bytes',
      payloadType: payload.type,
      salt,
      iv,
      ciphertext,
    },
  }
}

module.exports = {
  createAccountSyncEncryptedEnvelope,
  deriveAccountSyncKey,
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/media-library/account-sync-crypto.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/media-library/account-sync-crypto.test.js src/screens/Home/Views/Setting/settings/Backup/accountSyncCrypto.js
git commit -m "feat: add account sync encryption envelope"
```

### Task 3: Add WebDAV validation/upload helper and backup actions wiring

**Files:**
- Create: `tests/media-library/account-sync-webdav.test.js`
- Create: `src/screens/Home/Views/Setting/settings/Backup/accountSyncWebdav.js`
- Modify: `src/screens/Home/Views/Setting/settings/Backup/actions.ts`
- Test: `tests/media-library/account-sync-webdav.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/media-library/account-sync-webdav.test.js
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const readFile = filePath => fs.readFileSync(path.resolve(__dirname, '../../', filePath), 'utf8')

const {
  buildAccountSyncRemoteFilePath,
  ensureAccountSyncRemoteDir,
  validateAccountSyncProfile,
  uploadAccountSyncEnvelope,
} = require('../../src/screens/Home/Views/Setting/settings/Backup/accountSyncWebdav.js')

test('validateAccountSyncProfile allows a missing remoteDir when the parent directory is reachable', async() => {
  const calls = []
  const requestWebdav = async(_profile, request) => {
    calls.push(`${request.method}:${request.pathOrUri}`)
    if (request.pathOrUri === '/Apps/juMusicSync') return { status: 404, text: '' }
    if (request.pathOrUri === '/Apps') return { status: 207, text: '' }
    throw new Error(`unexpected path ${request.pathOrUri}`)
  }

  const result = await validateAccountSyncProfile({
    serverUrl: 'https://dav.example.com/root/',
    username: 'admin',
    password: 'secret',
    remoteDir: '/Apps/juMusicSync',
  }, { requestWebdav })

  assert.deepEqual(result, {
    remoteDir: '/Apps/juMusicSync',
    willCreateRemoteDir: true,
  })
  assert.deepEqual(calls, [
    'PROPFIND:/Apps/juMusicSync',
    'PROPFIND:/Apps',
  ])
})

test('account sync upload uses a fixed latest path under remoteDir/jumusic-sync', async() => {
  assert.equal(buildAccountSyncRemoteFilePath('/Apps/juMusicSync'), '/Apps/juMusicSync/jumusic-sync/account-sync.latest.json')
  assert.equal(buildAccountSyncRemoteFilePath('/'), '/jumusic-sync/account-sync.latest.json')

  const calls = []
  const existing = new Set(['/Apps'])

  const requestWebdav = async(_profile, request) => {
    calls.push(`${request.method}:${request.pathOrUri}`)
    if (request.method === 'PROPFIND') {
      return {
        status: existing.has(request.pathOrUri) ? 207 : 404,
        text: '',
      }
    }
    if (request.method === 'MKCOL') {
      existing.add(request.pathOrUri)
      return { status: 201, text: '' }
    }
    if (request.method === 'PUT') {
      return { status: 201, text: '' }
    }
    throw new Error(`unexpected method ${request.method}`)
  }

  const ensuredDir = await ensureAccountSyncRemoteDir({
    serverUrl: 'https://dav.example.com/root/',
    username: 'admin',
    password: 'secret',
    remoteDir: '/Apps',
  }, { requestWebdav })
  assert.equal(ensuredDir, '/Apps/jumusic-sync')

  const uploadedPath = await uploadAccountSyncEnvelope({
    serverUrl: 'https://dav.example.com/root/',
    username: 'admin',
    password: 'secret',
    remoteDir: '/Apps',
  }, '{"type":"accountSyncEncrypted_v1"}', { requestWebdav })

  assert.equal(uploadedPath, '/Apps/jumusic-sync/account-sync.latest.json')
  assert.deepEqual(calls, [
    'PROPFIND:/Apps',
    'PROPFIND:/Apps/jumusic-sync',
    'MKCOL:/Apps/jumusic-sync',
    'PROPFIND:/Apps',
    'PROPFIND:/Apps/jumusic-sync',
    'PUT:/Apps/jumusic-sync/account-sync.latest.json',
  ])
})

test('backup actions persist a dedicated account sync state and expose validate/upload handlers', () => {
  const constantFile = readFile('src/config/constant.ts')
  const actionsFile = readFile('src/screens/Home/Views/Setting/settings/Backup/actions.ts')

  assert.match(constantFile, /accountSync:\s*'@account_sync'/)
  assert.match(actionsFile, /mediaLibraryRepository/)
  assert.match(actionsFile, /handleValidateAccountSyncProfile/)
  assert.match(actionsFile, /handleUploadAccountSync/)
  assert.match(actionsFile, /storageDataPrefix\.accountSync/)
  assert.match(actionsFile, /validateAccountSyncProfile/)
  assert.match(actionsFile, /getAccountSyncErrorMessage/)
  assert.match(actionsFile, /buildAccountSyncPayload/)
  assert.match(actionsFile, /createAccountSyncEncryptedEnvelope/)
  assert.match(actionsFile, /uploadAccountSyncEnvelope/)
  assert.match(actionsFile, /setting_backup_account_sync_upload_tip_running/)
  assert.match(actionsFile, /setting_backup_account_sync_validate_success_new_dir/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/media-library/account-sync-webdav.test.js`

Expected: FAIL because `accountSyncWebdav.js` and the new account-sync actions do not exist yet.

- [ ] **Step 3: Write minimal implementation**

```js
// src/screens/Home/Views/Setting/settings/Backup/accountSyncWebdav.js
const { buildWebdavHeaders, buildWebdavUrl } = require('../../../../../../core/mediaLibrary/webdav.js')
const { normalizeRemoteDir } = require('./accountSync.js')

function splitRemoteDir(pathOrUri = '/') {
  const normalized = normalizeRemoteDir(pathOrUri)
  if (normalized === '/') return []
  return normalized.replace(/^\/+/, '').split('/')
}

function joinCollectionPath(parts = []) {
  return parts.length ? `/${parts.join('/')}` : '/'
}

function getParentCollectionPath(pathOrUri = '/') {
  const normalized = normalizeRemoteDir(pathOrUri)
  if (normalized === '/') return '/'
  const parts = splitRemoteDir(normalized)
  parts.pop()
  return joinCollectionPath(parts)
}

function buildAccountSyncRemoteFilePath(remoteDir = '/') {
  const normalized = normalizeRemoteDir(remoteDir)
  return normalized === '/'
    ? '/jumusic-sync/account-sync.latest.json'
    : `${normalized}/jumusic-sync/account-sync.latest.json`
}

function assertRequiredProfile(profile = {}) {
  if (!profile.serverUrl) throw new Error('account_sync_server_url_required')
  if (!profile.username) throw new Error('account_sync_username_required')
  if (!profile.password) throw new Error('account_sync_profile_password_required')
}

async function requestWebdav(profile, request, {
  fetchImpl = fetch,
} = {}) {
  let response
  try {
    response = await fetchImpl(buildWebdavUrl(profile.serverUrl, request.pathOrUri), {
      method: request.method,
      headers: {
        ...(request.method === 'PROPFIND' ? { Depth: String(request.depth ?? '0') } : {}),
        ...(request.body != null ? { 'Content-Type': 'application/json; charset=utf-8' } : {}),
        ...buildWebdavHeaders({
          username: profile.username,
          password: profile.password,
        }),
        ...(request.headers || {}),
      },
      body: request.body,
    })
  } catch {
    throw new Error('account_sync_network_error')
  }

  const text = await response.text()
  if ([401, 403].includes(response.status)) throw new Error('account_sync_auth_failed')
  return {
    status: response.status,
    text,
  }
}

async function probeCollection(profile, pathOrUri, {
  requestWebdav: requestImpl = requestWebdav,
} = {}) {
  return requestImpl(profile, {
    method: 'PROPFIND',
    pathOrUri,
    depth: '0',
  })
}

async function validateAccountSyncProfile(profile, {
  requestWebdav: requestImpl = requestWebdav,
} = {}) {
  assertRequiredProfile(profile)

  const remoteDir = normalizeRemoteDir(profile.remoteDir)
  const remoteProbe = await probeCollection(profile, remoteDir, { requestWebdav: requestImpl })
  if ([200, 207, 301, 302].includes(remoteProbe.status)) {
    return { remoteDir, willCreateRemoteDir: false }
  }
  if (remoteProbe.status !== 404) throw new Error('account_sync_remote_dir_unreachable')

  const parentPath = getParentCollectionPath(remoteDir)
  const parentProbe = await probeCollection(profile, parentPath, { requestWebdav: requestImpl })
  if ([200, 207, 301, 302].includes(parentProbe.status)) {
    return { remoteDir, willCreateRemoteDir: true }
  }
  throw new Error('account_sync_remote_dir_parent_unreachable')
}

async function ensureAccountSyncRemoteDir(profile, {
  requestWebdav: requestImpl = requestWebdav,
} = {}) {
  assertRequiredProfile(profile)
  const parts = [...splitRemoteDir(profile.remoteDir), 'jumusic-sync']
  const built = []

  for (const part of parts) {
    built.push(part)
    const currentPath = joinCollectionPath(built)
    const probe = await probeCollection(profile, currentPath, { requestWebdav: requestImpl })

    if ([200, 207, 301, 302].includes(probe.status)) continue
    if (probe.status !== 404) throw new Error('account_sync_remote_dir_unreachable')

    const create = await requestImpl(profile, {
      method: 'MKCOL',
      pathOrUri: currentPath,
    })
    if (![201, 405].includes(create.status)) throw new Error('account_sync_remote_dir_create_failed')
  }

  return joinCollectionPath(parts)
}

async function uploadAccountSyncEnvelope(profile, envelopeText, {
  requestWebdav: requestImpl = requestWebdav,
} = {}) {
  await ensureAccountSyncRemoteDir(profile, { requestWebdav: requestImpl })
  const remotePath = buildAccountSyncRemoteFilePath(profile.remoteDir)
  const response = await requestImpl(profile, {
    method: 'PUT',
    pathOrUri: remotePath,
    body: envelopeText,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
  if (![200, 201, 204].includes(response.status)) throw new Error('account_sync_upload_failed')
  return remotePath
}

module.exports = {
  buildAccountSyncRemoteFilePath,
  ensureAccountSyncRemoteDir,
  requestWebdav,
  validateAccountSyncProfile,
  uploadAccountSyncEnvelope,
}
```

```ts
// src/screens/Home/Views/Setting/settings/Backup/actions.ts
import { storageDataPrefix } from '@/config/constant'
import { mediaLibraryRepository } from '@/core/mediaLibrary/storage'
import { getData, saveData } from '@/plugins/storage'
import settingState from '@/store/setting/state'
import { toast } from '@/utils/tools'
import { version as appVersion } from '../../../../../../../package.json'
import { AES_MODE, aesEncrypt, hashSHA1 } from '@/utils/nativeModules/crypto'
import { btoa } from 'react-native-quick-base64'
import {
  buildAccountSyncPayload,
  createAccountSyncValidationKey,
  normalizeAccountSyncProfile,
  normalizeAccountSyncState,
} from './accountSync'
import { createAccountSyncEncryptedEnvelope } from './accountSyncCrypto'
import { uploadAccountSyncEnvelope, validateAccountSyncProfile } from './accountSyncWebdav'

export const loadAccountSyncState = async() => {
  const saved = await getData(storageDataPrefix.accountSync)
  return normalizeAccountSyncState(saved)
}

export const saveAccountSyncState = async(nextState: any) => {
  await saveData(storageDataPrefix.accountSync, normalizeAccountSyncState(nextState))
}

export const getAccountSyncErrorMessage = (error: any) => {
  switch (error?.message) {
    case 'account_sync_profile_required':
      return global.i18n.t('setting_backup_account_sync_profile_required')
    case 'account_sync_validation_required':
      return global.i18n.t('setting_backup_account_sync_validation_required')
    case 'account_sync_server_url_required':
      return global.i18n.t('setting_backup_account_sync_server_url_required')
    case 'account_sync_username_required':
      return global.i18n.t('setting_backup_account_sync_username_required')
    case 'account_sync_profile_password_required':
      return global.i18n.t('setting_backup_account_sync_profile_password_required')
    case 'account_sync_auth_failed':
      return global.i18n.t('setting_backup_account_sync_auth_failed')
    case 'account_sync_remote_dir_unreachable':
      return global.i18n.t('setting_backup_account_sync_remote_dir_unreachable')
    case 'account_sync_remote_dir_parent_unreachable':
      return global.i18n.t('setting_backup_account_sync_remote_dir_parent_unreachable')
    case 'account_sync_remote_dir_create_failed':
      return global.i18n.t('setting_backup_account_sync_remote_dir_create_failed')
    case 'account_sync_upload_failed':
      return global.i18n.t('setting_backup_account_sync_upload_request_failed')
    case 'account_sync_network_error':
      return global.i18n.t('setting_backup_account_sync_network_error')
    case 'account_sync_password_required':
      return global.i18n.t('setting_backup_account_sync_password_required')
    case 'account_sync_hash_unavailable':
    case 'account_sync_base64_unavailable':
    case 'account_sync_encrypt_unavailable':
      return global.i18n.t('setting_backup_account_sync_encrypt_failed')
    default:
      return String(error?.message ?? error ?? global.i18n.t('setting_backup_account_sync_upload_tip_failed'))
  }
}

export const handleValidateAccountSyncProfile = async(profile: any) => {
  const normalized = normalizeAccountSyncProfile(profile)
  try {
    const result = await validateAccountSyncProfile(normalized)
    return {
      profile: normalized,
      validationKey: createAccountSyncValidationKey(normalized),
      validatedAt: Date.now(),
      willCreateRemoteDir: result.willCreateRemoteDir,
      successMessage: result.willCreateRemoteDir
        ? global.i18n.t('setting_backup_account_sync_validate_success_new_dir')
        : global.i18n.t('setting_backup_account_sync_validate_success'),
    }
  } catch (error) {
    throw new Error(getAccountSyncErrorMessage(error))
  }
}

export const handleUploadAccountSync = async(password: string) => {
  const currentState = await loadAccountSyncState()
  const validationKey = createAccountSyncValidationKey(currentState.profile)
  if (!currentState.profile.serverUrl) throw new Error(getAccountSyncErrorMessage(new Error('account_sync_profile_required')))
  if (currentState.validationKey !== validationKey || !currentState.lastValidatedAt) {
    throw new Error(getAccountSyncErrorMessage(new Error('account_sync_validation_required')))
  }

  toast(global.i18n.t('setting_backup_account_sync_upload_tip_running'))

  try {
    const payload = await buildAccountSyncPayload({
      exportedAt: Date.now(),
      appVersion,
      setting: settingState.setting,
      repository: mediaLibraryRepository,
    })
    const encrypted = await createAccountSyncEncryptedEnvelope(payload, password, {
      btoa,
      hashSHA1,
      aesEncrypt,
      AES_MODE,
    })
    const remotePath = await uploadAccountSyncEnvelope(currentState.profile, JSON.stringify(encrypted, null, 2))

    await saveAccountSyncState({
      ...currentState,
      lastUploadAt: Date.now(),
      lastUploadStatus: 'success',
      lastUploadMessage: remotePath,
    })

    return remotePath
  } catch (error) {
    const message = getAccountSyncErrorMessage(error)
    await saveAccountSyncState({
      ...currentState,
      lastUploadStatus: 'failed',
      lastUploadMessage: message,
    })
    throw new Error(message)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/media-library/account-sync-webdav.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/media-library/account-sync-webdav.test.js src/screens/Home/Views/Setting/settings/Backup/accountSyncWebdav.js src/screens/Home/Views/Setting/settings/Backup/actions.ts
git commit -m "feat: add webdav account sync upload actions"
```

### Task 4: Add backup page account sync UI and localized copy

**Files:**
- Create: `tests/media-library/account-sync-ui.test.js`
- Create: `src/screens/Home/Views/Setting/settings/Backup/AccountSync.tsx`
- Modify: `src/screens/Home/Views/Setting/settings/Backup/Part.tsx`
- Modify: `src/lang/zh-cn.json`
- Modify: `src/lang/zh-tw.json`
- Modify: `src/lang/en-us.json`
- Test: `tests/media-library/account-sync-ui.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/media-library/account-sync-ui.test.js
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const readFile = filePath => fs.readFileSync(path.resolve(__dirname, '../../', filePath), 'utf8')

test('backup page exposes an account sync section with config and upload actions', () => {
  const partFile = readFile('src/screens/Home/Views/Setting/settings/Backup/Part.tsx')
  const accountSyncFile = readFile('src/screens/Home/Views/Setting/settings/Backup/AccountSync.tsx')
  const zhCnFile = readFile('src/lang/zh-cn.json')
  const zhTwFile = readFile('src/lang/zh-tw.json')
  const enUsFile = readFile('src/lang/en-us.json')

  assert.match(partFile, /AccountSync/)
  assert.match(partFile, /setting_backup_account_sync/)
  assert.match(partFile, /<AccountSync \/>/)

  assert.match(accountSyncFile, /Dialog/)
  assert.match(accountSyncFile, /Input/)
  assert.match(accountSyncFile, /loadAccountSyncState/)
  assert.match(accountSyncFile, /handleValidateAccountSyncProfile/)
  assert.match(accountSyncFile, /handleUploadAccountSync/)
  assert.match(accountSyncFile, /createAccountSyncValidationKey/)
  assert.match(accountSyncFile, /const canSaveProfile =/)
  assert.match(accountSyncFile, /disabled=\{!canSaveProfile\}/)
  assert.match(accountSyncFile, /setting_backup_account_sync_password_confirm/)
  assert.match(accountSyncFile, /setting_backup_account_sync_last_validated/)
  assert.match(accountSyncFile, /setting_backup_account_sync_last_upload/)
  assert.match(accountSyncFile, /setting_backup_account_sync_profile_name/)

  assert.match(zhCnFile, /"setting_backup_account_sync": "账号同步"/)
  assert.match(zhCnFile, /"setting_backup_account_sync_config_webdav": "配置 WebDAV"/)
  assert.match(zhCnFile, /"setting_backup_account_sync_upload": "上传同步"/)
  assert.match(zhCnFile, /"setting_backup_account_sync_password": "同步密码"/)
  assert.match(zhCnFile, /"setting_backup_account_sync_password_confirm": "确认同步密码"/)
  assert.match(zhCnFile, /"setting_backup_account_sync_validation_required": "请先测试并保存当前同步配置"/)
  assert.match(zhCnFile, /"setting_backup_account_sync_validate_success_new_dir": "同步 WebDAV 验证成功，首次上传时会自动创建远端目录"/)

  assert.match(zhTwFile, /"setting_backup_account_sync": "帳號同步"/)
  assert.match(enUsFile, /"setting_backup_account_sync_upload": "Upload Sync"/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/media-library/account-sync-ui.test.js`

Expected: FAIL because the account sync UI and copy do not exist yet.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/screens/Home/Views/Setting/settings/Backup/AccountSync.tsx
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View } from 'react-native'
import Button from '@/components/common/Button'
import Dialog, { type DialogType } from '@/components/common/Dialog'
import Input from '@/components/common/Input'
import Text from '@/components/common/Text'
import { useI18n } from '@/lang'
import { useTheme } from '@/store/theme/hook'
import { createStyle, dateFormat2, toast } from '@/utils/tools'
import SettingButton from '../../components/Button'
import { createAccountSyncValidationKey, normalizeAccountSyncProfile } from './accountSync'
import {
  handleUploadAccountSync,
  handleValidateAccountSyncProfile,
  loadAccountSyncState,
  saveAccountSyncState,
} from './actions'

export default memo(() => {
  const t = useI18n()
  const theme = useTheme()
  const configDialogRef = useRef<DialogType>(null)
  const passwordDialogRef = useRef<DialogType>(null)
  const [state, setState] = useState<any>(null)
  const [draft, setDraft] = useState<any>(normalizeAccountSyncProfile())
  const [validatedKey, setValidatedKey] = useState<string | null>(null)
  const [validatedAt, setValidatedAt] = useState<number | null>(null)
  const [validationMessage, setValidationMessage] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const reload = useCallback(async() => {
    const nextState = await loadAccountSyncState()
    setState(nextState)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const openConfig = useCallback(() => {
    if (!state) return
    const nextDraft = normalizeAccountSyncProfile(state.profile)
    const nextValidationKey = state.validationKey === createAccountSyncValidationKey(nextDraft)
      ? state.validationKey
      : null

    setDraft(nextDraft)
    setValidatedKey(nextValidationKey)
    setValidatedAt(nextValidationKey ? state.lastValidatedAt : null)
    setValidationMessage(nextValidationKey ? t('setting_backup_account_sync_validation_saved') : t('setting_backup_account_sync_validation_required'))
    configDialogRef.current?.setVisible(true)
  }, [state, t])

  const openUpload = useCallback(() => {
    if (!state) return
    const currentValidationKey = createAccountSyncValidationKey(state.profile)
    if (!state.validationKey || state.validationKey !== currentValidationKey || !state.lastValidatedAt) {
      toast(t('setting_backup_account_sync_validation_required'))
      return
    }

    setPassword('')
    setConfirmPassword('')
    passwordDialogRef.current?.setVisible(true)
  }, [state, t])

  const updateDraft = useCallback((key: string, value: string) => {
    setDraft((prev: any) => {
      const next = normalizeAccountSyncProfile({
        ...prev,
        [key]: value,
      })
      if (createAccountSyncValidationKey(next) !== validatedKey) {
        setValidatedKey(null)
        setValidatedAt(null)
        setValidationMessage(t('setting_backup_account_sync_validation_required'))
      }
      return next
    })
  }, [t, validatedKey])

  const canSaveProfile = useMemo(() => {
    return Boolean(validatedAt) && createAccountSyncValidationKey(draft) === validatedKey
  }, [draft, validatedAt, validatedKey])

  const handleValidate = useCallback(async() => {
    try {
      const result = await handleValidateAccountSyncProfile(draft)
      setDraft(result.profile)
      setValidatedKey(result.validationKey)
      setValidatedAt(result.validatedAt)
      setValidationMessage(result.successMessage)
      toast(result.successMessage)
    } catch (error) {
      const message = String((error as Error | undefined)?.message ?? error ?? t('setting_backup_account_sync_upload_tip_failed'))
      setValidatedKey(null)
      setValidatedAt(null)
      setValidationMessage(message)
      toast(message)
    }
  }, [draft, t])

  const handleSave = useCallback(async() => {
    if (!state || !canSaveProfile) return

    await saveAccountSyncState({
      ...state,
      profile: draft,
      validationKey: validatedKey,
      lastValidatedAt: validatedAt,
      lastUploadAt: null,
      lastUploadStatus: 'idle',
      lastUploadMessage: '',
    })
    configDialogRef.current?.setVisible(false)
    await reload()
  }, [canSaveProfile, draft, reload, state, validatedAt, validatedKey])

  const handleConfirmUpload = useCallback(async() => {
    if (!password || !confirmPassword) {
      toast(t('setting_backup_account_sync_password_required'))
      return
    }
    if (password !== confirmPassword) {
      toast(t('setting_backup_account_sync_password_mismatch'))
      return
    }

    try {
      await handleUploadAccountSync(password)
      passwordDialogRef.current?.setVisible(false)
      setPassword('')
      setConfirmPassword('')
      await reload()
      toast(t('setting_backup_account_sync_upload_tip_success'))
    } catch (error) {
      toast(String((error as Error | undefined)?.message ?? error ?? t('setting_backup_account_sync_upload_tip_failed')))
    }
  }, [confirmPassword, password, reload, t])

  if (!state) return null

  const lastStatusText = state.lastUploadMessage || (
    state.lastUploadStatus === 'success'
      ? t('setting_backup_account_sync_upload_tip_success')
      : state.lastUploadStatus === 'failed'
        ? t('setting_backup_account_sync_upload_tip_failed')
        : t('setting_backup_account_sync_never')
  )

  return (
    <>
      <View style={styles.actions}>
        <SettingButton onPress={openConfig}>{t('setting_backup_account_sync_config_webdav')}</SettingButton>
        <SettingButton onPress={openUpload}>{t('setting_backup_account_sync_upload')}</SettingButton>
      </View>

      <View style={styles.summary}>
        <Text size={13}>{t('setting_backup_account_sync_profile_name')}: {state.profile.displayName || '--'}</Text>
        <Text size={13}>{t('setting_backup_account_sync_remote_dir')}: {state.profile.remoteDir || '/'}</Text>
        <Text size={13}>{t('setting_backup_account_sync_last_validated')}: {state.lastValidatedAt ? dateFormat2(state.lastValidatedAt) : t('setting_backup_account_sync_never')}</Text>
        <Text size={13}>{t('setting_backup_account_sync_last_upload')}: {state.lastUploadAt ? dateFormat2(state.lastUploadAt) : t('setting_backup_account_sync_never')}</Text>
        <Text size={13}>{t('setting_backup_account_sync_last_status')}: {lastStatusText}</Text>
      </View>

      <Dialog ref={configDialogRef} title={t('setting_backup_account_sync_config_webdav')} bgHide={false}>
        <View style={styles.content}>
          <Text size={13} color={theme['c-font-label']} style={styles.fieldLabel}>{t('setting_backup_account_sync_display_name')}</Text>
          <Input value={draft.displayName} onChangeText={value => { updateDraft('displayName', value) }} size={13} style={{ ...styles.input, backgroundColor: theme['c-primary-input-background'] }} />

          <Text size={13} color={theme['c-font-label']} style={styles.fieldLabel}>{t('setting_backup_account_sync_server_url')}</Text>
          <Input value={draft.serverUrl} onChangeText={value => { updateDraft('serverUrl', value) }} size={13} style={{ ...styles.input, backgroundColor: theme['c-primary-input-background'] }} />

          <Text size={13} color={theme['c-font-label']} style={styles.fieldLabel}>{t('source_lists_form_username')}</Text>
          <Input value={draft.username} onChangeText={value => { updateDraft('username', value) }} size={13} style={{ ...styles.input, backgroundColor: theme['c-primary-input-background'] }} />

          <Text size={13} color={theme['c-font-label']} style={styles.fieldLabel}>{t('source_lists_form_password')}</Text>
          <Input value={draft.password} onChangeText={value => { updateDraft('password', value) }} secureTextEntry size={13} style={{ ...styles.input, backgroundColor: theme['c-primary-input-background'] }} />

          <Text size={13} color={theme['c-font-label']} style={styles.fieldLabel}>{t('setting_backup_account_sync_remote_dir')}</Text>
          <Input value={draft.remoteDir} onChangeText={value => { updateDraft('remoteDir', value) }} size={13} style={{ ...styles.input, backgroundColor: theme['c-primary-input-background'] }} />

          <Text size={12} color={theme['c-font-label']} style={styles.validationMessage}>{validationMessage}</Text>
        </View>
        <View style={styles.btns}>
          <Button style={{ ...styles.btn, backgroundColor: theme['c-button-background'] }} onPress={() => { configDialogRef.current?.setVisible(false) }}>
            <Text size={14} color={theme['c-button-font']}>{t('cancel')}</Text>
          </Button>
          <Button style={{ ...styles.btn, backgroundColor: theme['c-button-background'] }} onPress={() => { void handleValidate() }}>
            <Text size={14} color={theme['c-button-font']}>{t('media_source_validate_connection')}</Text>
          </Button>
          <Button style={{ ...styles.btn, backgroundColor: theme['c-button-background'] }} onPress={() => { void handleSave() }} disabled={!canSaveProfile}>
            <Text size={14} color={theme['c-button-font']}>{t('source_lists_form_save')}</Text>
          </Button>
        </View>
      </Dialog>

      <Dialog ref={passwordDialogRef} title={t('setting_backup_account_sync_upload')} bgHide={false}>
        <View style={styles.content}>
          <Text size={13} color={theme['c-font-label']} style={styles.desc}>{t('setting_backup_account_sync_password_desc')}</Text>

          <Text size={13} color={theme['c-font-label']} style={styles.fieldLabel}>{t('setting_backup_account_sync_password')}</Text>
          <Input value={password} onChangeText={setPassword} secureTextEntry size={13} style={{ ...styles.input, backgroundColor: theme['c-primary-input-background'] }} />

          <Text size={13} color={theme['c-font-label']} style={styles.fieldLabel}>{t('setting_backup_account_sync_password_confirm')}</Text>
          <Input value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry size={13} style={{ ...styles.input, backgroundColor: theme['c-primary-input-background'] }} />
        </View>
        <View style={styles.btns}>
          <Button style={{ ...styles.btn, backgroundColor: theme['c-button-background'] }} onPress={() => { passwordDialogRef.current?.setVisible(false) }}>
            <Text size={14} color={theme['c-button-font']}>{t('cancel')}</Text>
          </Button>
          <Button style={{ ...styles.btn, backgroundColor: theme['c-button-background'] }} onPress={() => { void handleConfirmUpload() }}>
            <Text size={14} color={theme['c-button-font']}>{t('confirm')}</Text>
          </Button>
        </View>
      </Dialog>
    </>
  )
})

const styles = createStyle({
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  summary: {
    marginTop: 10,
  },
  content: {
    paddingTop: 15,
    paddingHorizontal: 15,
    paddingBottom: 8,
  },
  desc: {
    marginBottom: 12,
  },
  fieldLabel: {
    marginBottom: 6,
  },
  input: {
    borderRadius: 4,
    paddingRight: 8,
    marginBottom: 10,
  },
  validationMessage: {
    marginTop: 2,
  },
  btns: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingBottom: 15,
    paddingLeft: 15,
  },
  btn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 4,
    marginRight: 15,
  },
})
```

```tsx
// src/screens/Home/Views/Setting/settings/Backup/Part.tsx
import AccountSync from './AccountSync'

<SubTitle title={t('setting_backup_account_sync')}>
  <AccountSync />
</SubTitle>
```

```json
// src/lang/zh-cn.json
"setting_backup_account_sync": "账号同步",
"setting_backup_account_sync_config_webdav": "配置 WebDAV",
"setting_backup_account_sync_upload": "上传同步",
"setting_backup_account_sync_display_name": "同步名称",
"setting_backup_account_sync_server_url": "服务地址",
"setting_backup_account_sync_remote_dir": "远端目录",
"setting_backup_account_sync_profile_name": "当前同步名称",
"setting_backup_account_sync_password": "同步密码",
"setting_backup_account_sync_password_confirm": "确认同步密码",
"setting_backup_account_sync_password_desc": "同步密码只用于本次加密上传，不会保存在本地",
"setting_backup_account_sync_last_validated": "最近验证",
"setting_backup_account_sync_last_upload": "最近上传",
"setting_backup_account_sync_last_status": "最近结果",
"setting_backup_account_sync_never": "从未",
"setting_backup_account_sync_profile_required": "请先配置同步 WebDAV",
"setting_backup_account_sync_validate_success": "同步 WebDAV 验证成功",
"setting_backup_account_sync_validate_success_new_dir": "同步 WebDAV 验证成功，首次上传时会自动创建远端目录",
"setting_backup_account_sync_validation_required": "请先测试并保存当前同步配置",
"setting_backup_account_sync_validation_saved": "当前同步配置已测试通过，可以保存",
"setting_backup_account_sync_server_url_required": "请输入同步 WebDAV 服务地址",
"setting_backup_account_sync_username_required": "请输入同步 WebDAV 用户名",
"setting_backup_account_sync_profile_password_required": "请输入同步 WebDAV 密码",
"setting_backup_account_sync_auth_failed": "同步 WebDAV 认证失败，请检查用户名和密码",
"setting_backup_account_sync_remote_dir_unreachable": "远端目录不可访问，请检查目录配置",
"setting_backup_account_sync_remote_dir_parent_unreachable": "远端目录不存在，且父目录不可访问或不可写",
"setting_backup_account_sync_remote_dir_create_failed": "远端目录创建失败，请检查目录权限",
"setting_backup_account_sync_network_error": "网络异常或超时，请稍后重试",
"setting_backup_account_sync_encrypt_failed": "账号同步加密失败",
"setting_backup_account_sync_upload_request_failed": "同步文件上传失败",
"setting_backup_account_sync_password_required": "请输入同步密码",
"setting_backup_account_sync_password_mismatch": "两次同步密码输入不一致",
"setting_backup_account_sync_upload_tip_running": "📤正在上传账号同步...\n若网络较慢可能需要一些时间⏳",
"setting_backup_account_sync_upload_tip_success": "账号同步上传成功",
"setting_backup_account_sync_upload_tip_failed": "账号同步上传失败"
```

```json
// src/lang/zh-tw.json
"setting_backup_account_sync": "帳號同步",
"setting_backup_account_sync_config_webdav": "設定 WebDAV",
"setting_backup_account_sync_upload": "上傳同步",
"setting_backup_account_sync_display_name": "同步名稱",
"setting_backup_account_sync_server_url": "服務位址",
"setting_backup_account_sync_remote_dir": "遠端目錄",
"setting_backup_account_sync_profile_name": "目前同步名稱",
"setting_backup_account_sync_password": "同步密碼",
"setting_backup_account_sync_password_confirm": "確認同步密碼",
"setting_backup_account_sync_password_desc": "同步密碼只用於本次加密上傳，不會保存在本機",
"setting_backup_account_sync_last_validated": "最近驗證",
"setting_backup_account_sync_last_upload": "最近上傳",
"setting_backup_account_sync_last_status": "最近結果",
"setting_backup_account_sync_never": "從未",
"setting_backup_account_sync_profile_required": "請先設定同步 WebDAV",
"setting_backup_account_sync_validate_success": "同步 WebDAV 驗證成功",
"setting_backup_account_sync_validate_success_new_dir": "同步 WebDAV 驗證成功，首次上傳時會自動建立遠端目錄",
"setting_backup_account_sync_validation_required": "請先測試並儲存目前同步設定",
"setting_backup_account_sync_validation_saved": "目前同步設定已測試通過，可以儲存",
"setting_backup_account_sync_server_url_required": "請輸入同步 WebDAV 服務位址",
"setting_backup_account_sync_username_required": "請輸入同步 WebDAV 使用者名稱",
"setting_backup_account_sync_profile_password_required": "請輸入同步 WebDAV 密碼",
"setting_backup_account_sync_auth_failed": "同步 WebDAV 驗證失敗，請檢查使用者名稱與密碼",
"setting_backup_account_sync_remote_dir_unreachable": "遠端目錄不可存取，請檢查目錄設定",
"setting_backup_account_sync_remote_dir_parent_unreachable": "遠端目錄不存在，且父目錄不可存取或不可寫入",
"setting_backup_account_sync_remote_dir_create_failed": "遠端目錄建立失敗，請檢查目錄權限",
"setting_backup_account_sync_network_error": "網路異常或逾時，請稍後再試",
"setting_backup_account_sync_encrypt_failed": "帳號同步加密失敗",
"setting_backup_account_sync_upload_request_failed": "同步檔案上傳失敗",
"setting_backup_account_sync_password_required": "請輸入同步密碼",
"setting_backup_account_sync_password_mismatch": "兩次同步密碼輸入不一致",
"setting_backup_account_sync_upload_tip_running": "📤正在上傳帳號同步...\n若網路較慢可能需要一些時間⏳",
"setting_backup_account_sync_upload_tip_success": "帳號同步上傳成功",
"setting_backup_account_sync_upload_tip_failed": "帳號同步上傳失敗"
```

```json
// src/lang/en-us.json
"setting_backup_account_sync": "Account Sync",
"setting_backup_account_sync_config_webdav": "Configure WebDAV",
"setting_backup_account_sync_upload": "Upload Sync",
"setting_backup_account_sync_display_name": "Sync Name",
"setting_backup_account_sync_server_url": "Server URL",
"setting_backup_account_sync_remote_dir": "Remote Directory",
"setting_backup_account_sync_profile_name": "Current Sync Name",
"setting_backup_account_sync_password": "Sync Password",
"setting_backup_account_sync_password_confirm": "Confirm Sync Password",
"setting_backup_account_sync_password_desc": "The sync password is used only for this encrypted upload and is never saved locally.",
"setting_backup_account_sync_last_validated": "Last Validated",
"setting_backup_account_sync_last_upload": "Last Upload",
"setting_backup_account_sync_last_status": "Last Result",
"setting_backup_account_sync_never": "Never",
"setting_backup_account_sync_profile_required": "Please configure the sync WebDAV first.",
"setting_backup_account_sync_validate_success": "Sync WebDAV validated successfully.",
"setting_backup_account_sync_validate_success_new_dir": "Sync WebDAV validated successfully. The remote directory will be created automatically on first upload.",
"setting_backup_account_sync_validation_required": "Please test and save the current sync configuration first.",
"setting_backup_account_sync_validation_saved": "The current sync configuration has been validated and can be saved.",
"setting_backup_account_sync_server_url_required": "Please enter the sync WebDAV server URL.",
"setting_backup_account_sync_username_required": "Please enter the sync WebDAV username.",
"setting_backup_account_sync_profile_password_required": "Please enter the sync WebDAV password.",
"setting_backup_account_sync_auth_failed": "Sync WebDAV authentication failed. Please check the username and password.",
"setting_backup_account_sync_remote_dir_unreachable": "The remote directory is not reachable. Please check the directory setting.",
"setting_backup_account_sync_remote_dir_parent_unreachable": "The remote directory does not exist and its parent directory is not reachable or writable.",
"setting_backup_account_sync_remote_dir_create_failed": "Failed to create the remote directory. Please check directory permissions.",
"setting_backup_account_sync_network_error": "Network error or timeout. Please try again later.",
"setting_backup_account_sync_encrypt_failed": "Failed to encrypt the account sync payload.",
"setting_backup_account_sync_upload_request_failed": "Failed to upload the sync file.",
"setting_backup_account_sync_password_required": "Please enter the sync password.",
"setting_backup_account_sync_password_mismatch": "The two sync passwords do not match.",
"setting_backup_account_sync_upload_tip_running": "📤 Uploading account sync...\nThis may take a while on a slow network ⏳",
"setting_backup_account_sync_upload_tip_success": "Account sync uploaded successfully.",
"setting_backup_account_sync_upload_tip_failed": "Account sync upload failed."
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/media-library/account-sync-ui.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/media-library/account-sync-ui.test.js src/screens/Home/Views/Setting/settings/Backup/AccountSync.tsx src/screens/Home/Views/Setting/settings/Backup/Part.tsx src/lang/zh-cn.json src/lang/zh-tw.json src/lang/en-us.json
git commit -m "feat: add account sync backup ui"
```

### Task 5: Update changelog and run final verification

**Files:**
- Modify: `CHANGELOG.md`
- Test: `tests/media-library/account-sync-backup.test.js`
- Test: `tests/media-library/account-sync-crypto.test.js`
- Test: `tests/media-library/account-sync-webdav.test.js`
- Test: `tests/media-library/account-sync-ui.test.js`
- Test: `tests/media-library/play-history-export.test.js`
- Test: `tests/media-library/media-source-backup.test.js`
- Test: `tests/media-library/media-source-settings-ui.test.js`

- [ ] **Step 1: Write the failing changelog/documentation test**

```js
// tests/media-library/account-sync-ui.test.js
test('changelog notes the new encrypted webdav account sync upload flow', () => {
  const changelog = readFile('CHANGELOG.md')
  assert.match(changelog, /WebDAV/)
  assert.match(changelog, /账号同步/)
  assert.match(changelog, /同步密码/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/media-library/account-sync-ui.test.js`

Expected: FAIL because `CHANGELOG.md` does not mention the feature yet.

- [ ] **Step 3: Write minimal implementation**

```md
<!-- CHANGELOG.md -->
## [Unreleased]

优化

- 新增 WebDAV 手动上传账号同步入口，支持将设置与媒体来源配置使用同步密码加密后上传到固定远端目录
```

- [ ] **Step 4: Run the full verification suite**

Run:

```bash
node --test tests/media-library/account-sync-backup.test.js tests/media-library/account-sync-crypto.test.js tests/media-library/account-sync-webdav.test.js tests/media-library/account-sync-ui.test.js tests/media-library/play-history-export.test.js tests/media-library/media-source-backup.test.js tests/media-library/media-source-settings-ui.test.js
git diff --check
```

Expected:

1. All listed tests PASS
2. `git diff --check` has no output

- [ ] **Step 5: Commit**

```bash
git add CHANGELOG.md tests/media-library/account-sync-backup.test.js tests/media-library/account-sync-crypto.test.js tests/media-library/account-sync-webdav.test.js tests/media-library/account-sync-ui.test.js src/config/constant.ts src/screens/Home/Views/Setting/settings/Backup/accountSync.js src/screens/Home/Views/Setting/settings/Backup/accountSyncCrypto.js src/screens/Home/Views/Setting/settings/Backup/accountSyncWebdav.js src/screens/Home/Views/Setting/settings/Backup/actions.ts src/screens/Home/Views/Setting/settings/Backup/AccountSync.tsx src/screens/Home/Views/Setting/settings/Backup/Part.tsx src/lang/zh-cn.json src/lang/zh-tw.json src/lang/en-us.json
git commit -m "feat: add encrypted webdav account sync upload"
```
