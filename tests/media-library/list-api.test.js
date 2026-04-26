const test = require('node:test')
const assert = require('node:assert/strict')

const { createMediaLibraryListApi } = require('../../src/core/mediaLibrary/listApi.js')

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function createGeneratedListInfo(id, connectionId, name) {
  return {
    id,
    name,
    locationUpdateTime: null,
    mediaSource: {
      generated: true,
      readOnly: true,
      connectionId,
      kind: id.includes('account_all') ? 'account_all' : 'rule_merged',
    },
  }
}

function createMusic(id, connectionId = 'conn_1') {
  return {
    id,
    name: id,
    singer: '',
    source: 'local',
    interval: '03:00',
    meta: {
      songId: id,
      albumName: '',
      filePath: `/${id}.mp3`,
      ext: 'mp3',
      mediaLibrary: {
        connectionId,
        sourceItemId: id,
        aggregateSongId: id,
        providerType: 'local',
        remotePathOrUri: `/${id}.mp3`,
        versionToken: `v_${id}`,
      },
    },
  }
}

function createHarness() {
  const state = {
    userLists: [
      {
        id: 'custom_1',
        name: 'Custom',
        locationUpdateTime: null,
      },
      createGeneratedListInfo('media__conn_1__account_all', 'conn_1', 'Old All'),
      createGeneratedListInfo('media__conn_1__rule_old__merged', 'conn_1', 'Old Rule'),
      createGeneratedListInfo('media__conn_2__account_all', 'conn_2', 'Other All'),
    ],
    musicLists: new Map([
      ['custom_1', [createMusic('item_1'), createMusic('item_2')]],
      ['media__conn_1__account_all', [createMusic('item_legacy')]],
      ['media__conn_1__rule_old__merged', [createMusic('item_legacy')]],
      ['media__conn_2__account_all', [createMusic('item_other', 'conn_2')]],
    ]),
  }
  const calls = []

  const deps = {
    async getUserLists() {
      return clone(state.userLists)
    },
    async getListMusics(listId) {
      return clone(state.musicLists.get(listId) || [])
    },
    async createUserList(position, listInfos) {
      calls.push(['createUserList', position, listInfos.map(item => item.id)])
      const nextInfos = clone(listInfos)
      state.userLists.splice(Math.min(position, state.userLists.length), 0, ...nextInfos)
    },
    async updateUserList(listInfos) {
      calls.push(['updateUserList', listInfos.map(item => item.id)])
      for (const listInfo of listInfos) {
        const index = state.userLists.findIndex(item => item.id === listInfo.id)
        if (index > -1) state.userLists.splice(index, 1, clone(listInfo))
      }
    },
    async updateUserListPosition(position, ids) {
      calls.push(['updateUserListPosition', position, ids])
      const movingMap = new Map()
      const idSet = new Set(ids)
      const remained = []
      for (const listInfo of state.userLists) {
        if (idSet.has(listInfo.id)) movingMap.set(listInfo.id, listInfo)
        else remained.push(listInfo)
      }
      const moving = ids.map(id => movingMap.get(id)).filter(Boolean)
      remained.splice(Math.min(position, remained.length), 0, ...moving)
      state.userLists = remained
    },
    async removeUserList(ids) {
      calls.push(['removeUserList', ids])
      state.userLists = state.userLists.filter(item => !ids.includes(item.id))
      for (const id of ids) state.musicLists.delete(id)
    },
    async overwriteListMusics(listId, musicInfos) {
      calls.push(['overwriteListMusics', listId, musicInfos.map(item => item.id)])
      state.musicLists.set(listId, clone(musicInfos))
    },
    async updateListMusics(updates) {
      calls.push(['updateListMusics', updates.map(item => `${item.id}:${item.musicInfo.id}`)])
      for (const update of updates) {
        const list = state.musicLists.get(update.id) || []
        const index = list.findIndex(item => item.id === update.musicInfo.id)
        if (index > -1) list.splice(index, 1, clone(update.musicInfo))
        state.musicLists.set(update.id, list)
      }
    },
    async removeListMusics(listId, ids) {
      calls.push(['removeListMusics', listId, ids])
      const list = state.musicLists.get(listId) || []
      state.musicLists.set(listId, list.filter(item => !ids.includes(item.id)))
    },
  }

  return {
    state,
    calls,
    api: createMediaLibraryListApi(deps),
  }
}

test('reconcileGeneratedLists upserts generated lists for a connection and removes stale ones', async() => {
  const { state, api } = createHarness()

  await api.reconcileGeneratedLists([
    {
      listInfo: createGeneratedListInfo('media__conn_1__account_all', 'conn_1', 'Disk · 全部媒体'),
      list: [createMusic('item_1')],
    },
    {
      listInfo: createGeneratedListInfo('media__conn_1__rule_1__merged', 'conn_1', 'Albums'),
      list: [createMusic('item_2')],
    },
  ])

  assert.deepEqual(state.userLists.map(item => item.id), [
    'custom_1',
    'media__conn_1__account_all',
    'media__conn_1__rule_1__merged',
    'media__conn_2__account_all',
  ])
  assert.equal(state.userLists[1].name, 'Disk · 全部媒体')
  assert.deepEqual(state.musicLists.get('media__conn_1__account_all').map(item => item.id), ['item_1'])
  assert.deepEqual(state.musicLists.get('media__conn_1__rule_1__merged').map(item => item.id), ['item_2'])
  assert.equal(state.musicLists.has('media__conn_1__rule_old__merged'), false)
})

test('markConnectionRemoved, markRuleRemoved, and removeMissingSongs update the expected entries', async() => {
  const { state, api } = createHarness()

  await api.markConnectionRemoved(['item_1'])
  await api.markRuleRemoved(['item_2'])
  await api.removeMissingSongs(['item_1'])

  const customSongs = state.musicLists.get('custom_1')
  assert.deepEqual(customSongs.map(item => item.id), ['item_2'])
  assert.equal(customSongs[0].meta.mediaLibrary.unavailableReason, 'rule_removed')
  assert.deepEqual(state.musicLists.get('media__conn_1__account_all').map(item => item.id), ['item_legacy'])
})


test('reconcileGeneratedLists skips overwrite when generated list order and metadata are unchanged', async() => {
  const { calls, api } = createHarness()

  await api.reconcileGeneratedLists([
    {
      listInfo: createGeneratedListInfo('media__conn_1__account_all', 'conn_1', 'Old All'),
      list: [createMusic('item_legacy')],
    },
  ])

  const overwriteCalls = calls.filter(call => call[0] === 'overwriteListMusics' && call[1] === 'media__conn_1__account_all')
  assert.equal(overwriteCalls.length, 0)
})

test('reconcileGeneratedLists uses updateListMusics for in-place metadata changes with stable order', async() => {
  const { calls, state, api } = createHarness()

  await api.reconcileGeneratedLists([
    {
      listInfo: createGeneratedListInfo('media__conn_1__account_all', 'conn_1', 'Old All'),
      list: [{
        ...createMusic('item_legacy'),
        name: 'item_legacy (new)',
      }],
    },
  ])

  const updateCalls = calls.filter(call => call[0] === 'updateListMusics')
  assert.equal(updateCalls.length > 0, true)
  assert.equal(state.musicLists.get('media__conn_1__account_all')[0].name, 'item_legacy (new)')
})
