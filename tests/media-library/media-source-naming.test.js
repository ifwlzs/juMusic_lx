const test = require('node:test')
const assert = require('node:assert/strict')

const {
  resolveConnectionDisplayName,
  resolveRuleDisplayName,
} = require('../../src/core/mediaLibrary/naming.js')

test('onedrive fallback display names do not collapse to root slash', () => {
  assert.equal(resolveConnectionDisplayName({
    providerType: 'onedrive',
    displayName: '',
    rootPathOrUri: '/',
    credential: {
      username: 'user@tenant.com',
    },
    connectionId: 'conn_1',
  }), 'user@tenant.com')

  assert.equal(resolveConnectionDisplayName({
    providerType: 'onedrive',
    displayName: '/',
    rootPathOrUri: '/',
    credential: {},
    connectionId: 'conn_1',
  }), 'OneDrive')
})

test('onedrive rule fallback names ignore legacy slash placeholders', () => {
  assert.equal(resolveRuleDisplayName({
    providerType: 'onedrive',
    ruleName: '',
    connectionDisplayName: '/',
    connectionCredential: {
      username: 'user@tenant.com',
    },
    selectedConnectionId: 'conn_1',
  }), 'user@tenant.com')

  assert.equal(resolveRuleDisplayName({
    providerType: 'onedrive',
    ruleName: '/',
    connectionDisplayName: '/',
    connectionCredential: {},
    selectedConnectionId: 'conn_1',
  }), 'OneDrive')
})
