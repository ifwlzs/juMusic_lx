import { getPlayInfo } from '@/utils/data'
import { getListMusics } from '@/core/list'
import { playList, play } from '@/core/player/player'


export default async(setting: LX.AppSetting) => {
  const info = await getPlayInfo()
  global.lx.restorePlayInfo = null
  if (!info?.listId || info.index < 0) return

  const list = await getListMusics(info.listId)

  // 中文注释：优先按歌曲 id 定位，index 只作兜底。
  // 媒体库同步用 overwriteListMusics 整体重写列表，顺序和长度都会变，
  // 光靠 index 会恢复成另一首歌——这就是「每次重启都像随机播了一首」的来源。
  let index = info.musicId
    ? list.findIndex(item => item.id == info.musicId)
    : -1
  if (index < 0) index = info.index
  if (!list[index]) return
  global.lx.restorePlayInfo = info

  await playList(info.listId, index, { entrySource: 'restore' })

  if (setting['player.startupAutoPlay']) setTimeout(play)


  // if (!info.list || !info.list[info.index]) {
  //   const info2 = { ...info }
  //   if (info2.list) {
  //     info2.music = info2.list[info2.index]?.name
  //     info2.list = info2.list.length
  //   }
  //   toast('恢复播放数据失败，请去错误日志查看', 'long')
  //   log.warn('Restore Play Info failed: ', JSON.stringify(info2, null, 2))

  //   return
  // }

  // let setting = store.getState().common.setting
  // global.restorePlayInfo = {
  //   info,
  //   startupAutoPlay: setting.startupAutoPlay,
  // }

  // store.dispatch(playerAction.setList({
  //   list: {
  //     list: info.list,
  //     id: info.listId,
  //   },
  //   index: info.index,
  // }))
}
