import { SYNC_CLOSE_CODE } from '@/plugins/sync/constants'
import { registerDislikeActionEvent } from '../../../dislikeEvent'

let unregisterLocalListAction: (() => void) | null

export const registerEvent = (socket: LX.Sync.Socket) => {
  // socket = _socket
  // socket.onClose(() => {
  //   unregisterLocalListAction?.()
  //   unregisterLocalListAction = null
  // })
  unregisterEvent()
  unregisterLocalListAction = registerDislikeActionEvent((action) => {
    if (!socket.moduleReadys?.dislike) return
    void socket.remoteQueueDislike.onDislikeSyncAction(action).catch(err => {
      // 不喜欢列表同步动作失败时先关闭连接，具体状态提示由同步重连与错误展示链路统一处理。
      socket.moduleReadys.dislike = false
      socket.close(SYNC_CLOSE_CODE.failed)
      console.log(err.message)
    })
  })
}

export const unregisterEvent = () => {
  unregisterLocalListAction?.()
  unregisterLocalListAction = null
}
