import { playNext } from '@/core/player/player'
import { updatePlayIndex } from '@/core/player/playInfo'
import { throttleBackgroundTimer } from '@/utils/tools'
import playerState from '@/store/player/state'

const changedListIds = new Set<string | null>()

export default () => {
  const throttleListChange = throttleBackgroundTimer(() => {
    const isSkip = !changedListIds.has(playerState.playInfo.playerListId) && !changedListIds.has(playerState.playMusicInfo.listId)
    changedListIds.clear()
    if (isSkip) return

    const { playIndex } = updatePlayIndex()
    if (playIndex < 0) { // 歌曲被移除
      // if (global.lx.isPlayedStop) {
      //   stop()
      //   setTimeout(() => {
      //     setPlayMusicInfo(null, null)
      //   })
      // } else
      // 中文注释：正在播放时不要因为「在列表里找不到」就切歌。
      // 媒体库的 aggregateSongId 由标题+艺术家+时长派生，webdav 等远程源首次扫描
      // 若读不到元数据会先写入 degraded 记录（时长 0、艺术家空），后续补全转为 ready 时
      // 这三个字段全变，id 随之变化，当前歌曲就会被误判为已移除。
      // 此时音频仍在正常播放，切歌只会打断用户；真正被删除的歌曲播放会自行失败并走重试逻辑。
      if (!playerState.playMusicInfo.isTempPlay && !playerState.isPlay) {
        // console.log('current music removed')
        void playNext(true)
      }
    }
  })

  const handleListChange = (listIds: string[]) => {
    for (const id of listIds) {
      changedListIds.add(id)
    }
    throttleListChange()
  }

  const handleDownloadListChange = () => {
    handleListChange(['download'])
  }

  global.app_event.on('myListMusicUpdate', handleListChange)
  global.app_event.on('downloadListUpdate', handleDownloadListChange)
}
