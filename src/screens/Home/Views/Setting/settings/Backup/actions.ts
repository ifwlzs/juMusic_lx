import { LIST_IDS, storageDataPrefix } from '@/config/constant'
import { createList, getListMusics, overwriteList, overwriteListFull, overwriteListMusics } from '@/core/list'
import { mediaLibraryRepository } from '@/core/mediaLibrary/storage'
import { getData, saveData } from '@/plugins/storage'
import settingState from '@/store/setting/state'
import { writeFile } from '@/utils/fs'
import { filterMusicList, fixNewMusicInfoQuality, toNewMusicInfo } from '@/utils'
import { log } from '@/utils/log'
import { AES_MODE, aesEncrypt, hashSHA1 } from '@/utils/nativeModules/crypto'
import { confirmDialog, handleReadFile, handleSaveFile, showImportTip, toast } from '@/utils/tools'
import { btoa } from 'react-native-quick-base64'
import listState from '@/store/list/state'
import {
  buildAccountSyncPayload,
  createAccountSyncValidationKey,
  createEmptyAccountSyncState,
  normalizeAccountSyncProfile,
  normalizeAccountSyncState,
} from './accountSync'
import { createAccountSyncEncryptedEnvelope } from './accountSyncCrypto'
import { uploadAccountSyncEnvelope, validateAccountSyncProfile } from './accountSyncWebdav'
import { createMediaSourceBackupPayload, restoreMediaSourceBackupPayload } from './mediaSourceBackup'
import { buildPlayHistoryExportFileName, buildPlayHistoryExportPayload, resolvePlayHistoryExportRange } from './playHistoryExport'

type PlayHistoryExportPreset = 'all' | 'year' | 'last30Days' | 'custom'

interface PlayHistoryExportSelection {
  preset: PlayHistoryExportPreset
  startDate?: string
  endDate?: string
}


const getAllLists = async() => {
  const lists = []
  lists.push(await getListMusics(listState.defaultList.id).then(musics => ({ ...listState.defaultList, list: musics })))
  lists.push(await getListMusics(listState.loveList.id).then(musics => ({ ...listState.loveList, list: musics })))

  for await (const list of listState.userList) {
    lists.push(await getListMusics(list.id).then(musics => ({ ...list, list: musics })))
  }

  return lists
}
const importOldListData = async(lists: any[]) => {
  const allLists = await getAllLists()
  for (const list of lists) {
    try {
      const targetList = allLists.find(l => l.id == list.id)
      if (targetList) {
        targetList.list = filterMusicList((list.list as any[]).map(m => toNewMusicInfo(m)))
      } else {
        const listInfo = {
          name: list.name,
          id: list.id,
          list: filterMusicList((list.list as any[]).map(m => toNewMusicInfo(m))),
          source: list.source,
          sourceListId: list.sourceListId,
          locationUpdateTime: list.locationUpdateTime ?? null,
        }
        allLists.push(listInfo as LX.List.UserListInfoFull)
      }
    } catch (err) {
      console.log(err)
    }
  }
  const defaultList = allLists.shift()!.list
  const loveList = allLists.shift()!.list
  await overwriteListFull({ defaultList, loveList, userList: allLists as LX.List.UserListInfoFull[] })
}
const importNewListData = async(lists: Array<LX.List.MyDefaultListInfoFull | LX.List.MyLoveListInfoFull | LX.List.UserListInfoFull>) => {
  const allLists = await getAllLists()
  for (const list of lists) {
    try {
      const targetList = allLists.find(l => l.id == list.id)
      if (targetList) {
        targetList.list = filterMusicList(list.list).map(m => fixNewMusicInfoQuality(m))
      } else {
        const data = {
          name: list.name,
          id: list.id,
          list: filterMusicList(list.list).map(m => fixNewMusicInfoQuality(m)),
          source: (list as LX.List.UserListInfoFull).source,
          sourceListId: (list as LX.List.UserListInfoFull).sourceListId,
          locationUpdateTime: (list as LX.List.UserListInfoFull).locationUpdateTime ?? null,
        }
        allLists.push(data as LX.List.UserListInfoFull)
      }
    } catch (err) {
      console.log(err)
    }
  }
  const defaultList = allLists.shift()!.list
  const loveList = allLists.shift()!.list
  await overwriteListFull({ defaultList, loveList, userList: allLists as LX.List.UserListInfoFull[] })
}

/**
 * 导入单个列表
 * @param listData
 * @param position
 * @returns
 */
export const handleImportListPart = async(listData: LX.ConfigFile.MyListInfoPart['data'], position: number = listState.userList.length) => {
  const targetList = listState.allList.find(l => l.id === listData.id)
  if (targetList) {
    const confirm = await confirmDialog({
      message: global.i18n.t('list_import_part_confirm', { importName: listData.name, localName: targetList.name }),
      cancelButtonText: global.i18n.t('list_import_part_button_cancel'),
      confirmButtonText: global.i18n.t('list_import_part_button_confirm'),
      bgClose: false,
    })
    if (confirm) {
      listData.name = targetList.name
      void overwriteList(listData).then(() => {
        toast(global.i18n.t('setting_backup_part_import_list_tip_success'))
      }).catch((err) => {
        log.error(err)
        toast(global.i18n.t('setting_backup_part_import_list_tip_error'))
      })
      return
    }
    listData.id += `__${Date.now()}`
  }
  const userList = listData as LX.List.UserListInfoFull
  void createList({
    name: userList.name,
    id: userList.id,
    list: userList.list,
    source: userList.source,
    sourceListId: userList.sourceListId,
    position: Math.max(position, -1),
  }).then(() => {
    toast(global.i18n.t('setting_backup_part_import_list_tip_success'))
  }).catch((err) => {
    log.error(err)
    toast(global.i18n.t('setting_backup_part_import_list_tip_error'))
  })
}

const showConfirm = async() => {
  return confirmDialog({
    message: global.i18n.t('list_import_part_confirm_tip'),
    cancelButtonText: global.i18n.t('dialog_cancel'),
    confirmButtonText: global.i18n.t('confirm_button_text'),
    bgClose: false,
  })
}

const readBackupFile = async(path: string) => {
  let configData: any
  try {
    configData = await handleReadFile(path)
  } catch (error: any) {
    log.error(error.stack)
    throw error
  }
  return configData
}

const importPlayList = async(path: string) => {
  const configData = await readBackupFile(path)

  switch (configData.type) {
    case 'defautlList': // 兼容0.6.2及以前版本的列表数据
      if (!await showConfirm()) return true
      await overwriteListMusics(LIST_IDS.DEFAULT, filterMusicList((configData.data as LX.List.MyDefaultListInfoFull).list.map(m => toNewMusicInfo(m))))
      break
    case 'playList':
      if (!await showConfirm()) return true
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      await importOldListData(configData.data)
      break
    case 'playList_v2':
      if (!await showConfirm()) return true
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      await importNewListData(configData.data)
      break
    case 'allData':
      if (!await showConfirm()) return true
      // 兼容0.6.2及以前版本的列表数据
      if (configData.defaultList) await overwriteListMusics(LIST_IDS.DEFAULT, filterMusicList((configData.defaultList as LX.List.MyDefaultListInfoFull).list.map(m => toNewMusicInfo(m))))
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      else await importOldListData(configData.playList)
      break
    case 'allData_v2':
      if (!await showConfirm()) return true
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      await importNewListData(configData.playList)
      break
    case 'allData_v3':
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      showImportTip(configData.type)
      return true
    case 'playListPart':
      configData.data.list = filterMusicList((configData.data as LX.ConfigFile.MyListInfoPart['data']).list.map(m => toNewMusicInfo(m)))
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      void handleImportListPart(configData.data)
      return true
    case 'playListPart_v2':
      configData.data.list = filterMusicList((configData.data as LX.ConfigFile.MyListInfoPart['data']).list).map(m => fixNewMusicInfoQuality(m))
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      void handleImportListPart(configData.data)
      return true
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    default: showImportTip(configData.type)
  }
}

export const handleImportList = (path: string) => {
  toast(global.i18n.t('setting_backup_part_import_list_tip_unzip'))
  void importPlayList(path).then((skipTip) => {
    if (skipTip) return
    toast(global.i18n.t('setting_backup_part_import_list_tip_success'))
  }).catch((err) => {
    log.error(err)
    toast(global.i18n.t('setting_backup_part_import_list_tip_error'))
  })
}


const exportAllList = async(path: string) => {
  const data = JSON.parse(JSON.stringify({
    type: 'playList_v2',
    data: await getAllLists(),
  }))

  try {
    await handleSaveFile(path + '/lx_list.lxmc', data)
  } catch (error: any) {
    log.error(error.stack)
  }
}
export const handleExportList = (path: string) => {
  toast(global.i18n.t('setting_backup_part_export_list_tip_zip'))
  void exportAllList(path).then(() => {
    toast(global.i18n.t('setting_backup_part_export_list_tip_success'))
  }).catch((err: any) => {
    log.error(err.message)
    toast(global.i18n.t('setting_backup_part_export_list_tip_failed') + ': ' + (err.message as string))
  })
}

const importAllData = async(path: string) => {
  const configData = await readBackupFile(path)

  switch (configData.type) {
    case 'allData':
      if (!await showConfirm()) return true
      if (configData.defaultList) {
        await overwriteListMusics(LIST_IDS.DEFAULT, filterMusicList((configData.defaultList as LX.List.MyDefaultListInfoFull).list.map(m => toNewMusicInfo(m))))
      } else {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        await importOldListData(configData.playList)
      }
      break
    case 'allData_v2':
      if (!await showConfirm()) return true
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      await importNewListData(configData.playList)
      break
    case 'allData_v3':
      if (!await showConfirm()) return true
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      await importNewListData(configData.playList)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      await restoreMediaSourceBackupPayload(mediaLibraryRepository, configData.mediaSource)
      break
    default:
      showImportTip(configData.type)
      return true
  }
}

const exportAllData = async(path: string) => {
  const data = JSON.parse(JSON.stringify({
    type: 'allData_v3',
    playList: await getAllLists(),
    mediaSource: await createMediaSourceBackupPayload(mediaLibraryRepository),
  }))

  try {
    await handleSaveFile(path + '/lx_all_data.lxmc', data)
  } catch (error: any) {
    log.error(error.stack)
  }
}

export const handleImportAllData = (path: string) => {
  toast(global.i18n.t('setting_backup_part_import_list_tip_unzip'))
  void importAllData(path).then((skipTip) => {
    if (skipTip) return
    toast(global.i18n.t('setting_backup_part_import_list_tip_success'))
  }).catch((err) => {
    log.error(err)
    toast(global.i18n.t('setting_backup_part_import_list_tip_error'))
  })
}

export const handleExportAllData = (path: string) => {
  toast(global.i18n.t('setting_backup_part_export_list_tip_zip'))
  void exportAllData(path).then(() => {
    toast(global.i18n.t('setting_backup_part_export_list_tip_success'))
  }).catch((err: any) => {
    log.error(err.message)
    toast(global.i18n.t('setting_backup_part_export_list_tip_failed') + ': ' + (err.message as string))
  })
}

export const loadAccountSyncState = async() => {
  const state = await getData<any>(storageDataPrefix.accountSync)
  return normalizeAccountSyncState(state ?? createEmptyAccountSyncState())
}

export const saveAccountSyncState = async(state: any) => {
  const normalizedState = normalizeAccountSyncState(state)
  await saveData(storageDataPrefix.accountSync, normalizedState)
  return normalizedState
}

const getAccountSyncErrorMessage = (error: any) => {
  switch (error?.message) {
    case 'account_sync_validation_required':
      return global.i18n.t('setting_backup_account_sync_error_validation_required')
    case 'account_sync_password_required':
      return global.i18n.t('setting_backup_account_sync_error_password_required')
    case 'account_sync_hash_unavailable':
    case 'account_sync_base64_unavailable':
    case 'account_sync_encrypt_unavailable':
      return global.i18n.t('setting_backup_account_sync_error_encrypt_unavailable')
    case 'account_sync_remote_dir_unreachable':
      return global.i18n.t('setting_backup_account_sync_error_remote_dir_unreachable')
    case 'account_sync_remote_dir_parent_unreachable':
      return global.i18n.t('setting_backup_account_sync_error_remote_dir_parent_unreachable')
    case 'account_sync_remote_dir_create_failed':
      return global.i18n.t('setting_backup_account_sync_error_remote_dir_create_failed')
    case 'account_sync_upload_failed':
      return global.i18n.t('setting_backup_account_sync_error_upload_failed')
    default:
      return error?.message as string || ''
  }
}

export const handleValidateAccountSyncProfile = (profile: any, deps: any = {}) => {
  void (async() => {
    const prevState = await loadAccountSyncState()
    const normalizedProfile = normalizeAccountSyncProfile(profile ?? prevState.profile)
    const result = await validateAccountSyncProfile(normalizedProfile, deps)
    const message = result.willCreateRemoteDir
      ? global.i18n.t('setting_backup_account_sync_validate_success_new_dir')
      : global.i18n.t('setting_backup_account_sync_validate_success')

    await saveAccountSyncState({
      ...prevState,
      profile: normalizedProfile,
      validationKey: createAccountSyncValidationKey(normalizedProfile),
      lastValidatedAt: Date.now(),
      lastUploadMessage: message,
    })
    toast(message)
  })().catch((error: any) => {
    log.error(error)
    const message = getAccountSyncErrorMessage(error)
    toast(global.i18n.t('setting_backup_account_sync_validate_failed') + (message ? ': ' + message : ''))
    void loadAccountSyncState().then(state => saveAccountSyncState({
      ...state,
      lastUploadMessage: message,
    }))
  })
}

export const handleUploadAccountSync = (profile?: any, syncPassword?: string, deps: any = {}) => {
  toast(global.i18n.t('setting_backup_account_sync_upload_tip_running'))
  return void (async() => {
    const prevState = await loadAccountSyncState()
    const normalizedProfile = normalizeAccountSyncProfile(profile ?? prevState.profile)
    const computedValidationKey = createAccountSyncValidationKey(normalizedProfile)
    if (prevState.validationKey !== computedValidationKey || !prevState.lastValidatedAt) {
      throw new Error('account_sync_validation_required')
    }

    const payload = await buildAccountSyncPayload({
      appVersion: '',
      setting: settingState.setting,
      repository: mediaLibraryRepository,
    })
    const envelope = await createAccountSyncEncryptedEnvelope(payload, syncPassword, {
      now: () => Date.now(),
      random: Math.random,
      hashSHA1,
      btoa,
      aesEncrypt,
      AES_MODE,
      ...(deps.crypto || {}),
    })
    const { remoteFilePath } = await uploadAccountSyncEnvelope(normalizedProfile, JSON.stringify(envelope), deps)
    const successMessage = `${global.i18n.t('setting_backup_account_sync_upload_tip_success')}: ${remoteFilePath}`

    const nextState = await saveAccountSyncState({
      ...prevState,
      profile: normalizedProfile,
      validationKey: computedValidationKey,
      lastUploadAt: Date.now(),
      lastUploadStatus: 'success',
      lastUploadMessage: successMessage,
    })
    toast(nextState.lastUploadMessage)
    return remoteFilePath
  })().catch((error: any) => {
    log.error(error)
    const message = getAccountSyncErrorMessage(error)
    toast(global.i18n.t('setting_backup_account_sync_upload_tip_failed') + (message ? ': ' + message : ''))
    void loadAccountSyncState().then(state => saveAccountSyncState({
      ...state,
      lastUploadAt: Date.now(),
      lastUploadStatus: 'failed',
      lastUploadMessage: message,
    }))
  })
}

const exportPlayHistoryJson = async(path: string, selection: PlayHistoryExportSelection) => {
  const range = resolvePlayHistoryExportRange(selection)
  const [playHistory, aggregateSongs, connections] = await Promise.all([
    mediaLibraryRepository.getPlayHistory() as Promise<LX.MediaLibrary.PlayHistoryEntry[]>,
    mediaLibraryRepository.getAggregateSongs() as Promise<LX.MediaLibrary.AggregateSong[]>,
    mediaLibraryRepository.getConnections() as Promise<LX.MediaLibrary.SourceConnection[]>,
  ])

  const sourceItems = connections.length
    ? (await mediaLibraryRepository.getAllSourceItems(connections.map(item => item.connectionId))) as LX.MediaLibrary.SourceItem[]
    : []

  const payload = buildPlayHistoryExportPayload({
    range,
    playHistory,
    aggregateSongs,
    sourceItems,
  })

  const fileName = buildPlayHistoryExportFileName(range)
  await writeFile(path + '/' + fileName, JSON.stringify(payload, null, 2), 'utf8')
}

const getPlayHistoryExportErrorMessage = (error: any) => {
  switch (error?.message) {
    case 'invalid_start_date':
      return global.i18n.t('setting_backup_play_history_range_invalid_start')
    case 'invalid_end_date':
      return global.i18n.t('setting_backup_play_history_range_invalid_end')
    case 'invalid_date_range':
      return global.i18n.t('setting_backup_play_history_range_invalid_order')
    default:
      return error?.message as string || ''
  }
}

export const handleExportPlayHistoryJson = (path: string, selection: PlayHistoryExportSelection) => {
  toast(global.i18n.t('setting_backup_play_history_export_tip_running'))
  void exportPlayHistoryJson(path, selection).then(() => {
    toast(global.i18n.t('setting_backup_play_history_export_tip_success'))
  }).catch((err: any) => {
    log.error(err)
    const message = getPlayHistoryExportErrorMessage(err)
    toast(global.i18n.t('setting_backup_play_history_export_tip_failed') + (message ? ': ' + message : ''))
  })
}
