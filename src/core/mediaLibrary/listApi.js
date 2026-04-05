function isGeneratedMediaList(listInfo) {
  return Boolean(listInfo?.mediaSource?.generated)
}

function dedupeIds(ids = []) {
  return [...new Set(ids.filter(Boolean))]
}

function getSourceItemId(musicInfo) {
  return musicInfo?.meta?.mediaLibrary?.sourceItemId || musicInfo?.id || ''
}

function updateUnavailableReason(musicInfo, unavailableReason) {
  if (!musicInfo?.meta?.mediaLibrary) return musicInfo
  return {
    ...musicInfo,
    meta: {
      ...musicInfo.meta,
      mediaLibrary: {
        ...musicInfo.meta.mediaLibrary,
        unavailableReason,
      },
    },
  }
}

function createMediaLibraryListApi(deps) {
  async function reconcileGeneratedLists(generatedLists = []) {
    if (!generatedLists.length) return

    const userLists = await deps.getUserLists()
    const connectionIds = [...new Set(generatedLists
      .map(item => item?.listInfo?.mediaSource?.connectionId)
      .filter(Boolean))]
    const existingGeneratedLists = userLists.filter(listInfo => {
      return isGeneratedMediaList(listInfo) && connectionIds.includes(listInfo.mediaSource.connectionId)
    })
    const nextListIds = new Set(generatedLists.map(item => item.listInfo.id))
    const staleListIds = existingGeneratedLists
      .filter(listInfo => !nextListIds.has(listInfo.id))
      .map(listInfo => listInfo.id)
    if (staleListIds.length) {
      await deps.removeUserList(staleListIds)
    }

    const existingListIds = new Set(existingGeneratedLists.map(listInfo => listInfo.id))
    const updatedListInfos = generatedLists
      .filter(item => existingListIds.has(item.listInfo.id))
      .map(item => item.listInfo)
    if (updatedListInfos.length) {
      await deps.updateUserList(updatedListInfos)
    }

    const firstGeneratedIndex = userLists.findIndex(listInfo => {
      return isGeneratedMediaList(listInfo) && connectionIds.includes(listInfo.mediaSource.connectionId)
    })
    let insertPosition = firstGeneratedIndex < 0 ? userLists.length : firstGeneratedIndex
    for (const item of generatedLists) {
      if (existingListIds.has(item.listInfo.id)) continue
      await deps.createUserList(insertPosition, [item.listInfo])
      insertPosition += 1
    }

    if (typeof deps.updateUserListPosition === 'function') {
      await deps.updateUserListPosition(firstGeneratedIndex < 0 ? userLists.length : firstGeneratedIndex, generatedLists.map(item => item.listInfo.id))
    }

    for (const item of generatedLists) {
      await deps.overwriteListMusics(item.listInfo.id, item.list)
    }
  }

  async function removeGeneratedLists(listIds = []) {
    const ids = dedupeIds(listIds)
    if (!ids.length) return
    await deps.removeUserList(ids)
  }

  async function markSourceItemsUnavailable(sourceItemIds = [], unavailableReason) {
    const ids = new Set(dedupeIds(sourceItemIds))
    if (!ids.size) return []

    const userLists = await deps.getUserLists()
    const updates = []
    for (const listInfo of userLists) {
      if (isGeneratedMediaList(listInfo)) continue
      const musics = await deps.getListMusics(listInfo.id)
      for (const musicInfo of musics) {
        const sourceItemId = getSourceItemId(musicInfo)
        if (!ids.has(sourceItemId)) continue
        updates.push({
          id: listInfo.id,
          musicInfo: updateUnavailableReason(musicInfo, unavailableReason),
        })
      }
    }

    if (updates.length) {
      await deps.updateListMusics(updates)
    }
    return updates
  }

  async function removeMissingSongs(sourceItemIds = []) {
    const ids = new Set(dedupeIds(sourceItemIds))
    if (!ids.size) return []

    const userLists = await deps.getUserLists()
    const removed = []
    for (const listInfo of userLists) {
      const musics = await deps.getListMusics(listInfo.id)
      const matchedIds = musics
        .filter(musicInfo => ids.has(getSourceItemId(musicInfo)))
        .map(musicInfo => musicInfo.id)
      if (!matchedIds.length) continue
      await deps.removeListMusics(listInfo.id, matchedIds)
      removed.push({
        listId: listInfo.id,
        ids: matchedIds,
      })
    }
    return removed
  }

  return {
    reconcileGeneratedLists,
    removeGeneratedLists,
    markConnectionRemoved(sourceItemIds = []) {
      return markSourceItemsUnavailable(sourceItemIds, 'connection_removed')
    },
    markRuleRemoved(sourceItemIds = []) {
      return markSourceItemsUnavailable(sourceItemIds, 'rule_removed')
    },
    removeMissingSongs,
  }
}

module.exports = {
  createMediaLibraryListApi,
}
