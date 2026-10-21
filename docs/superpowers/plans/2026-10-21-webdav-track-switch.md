# WebDAV 切歌修复计划

**目标：** 自动下一首和手动切歌后，应用歌曲、原生当前轨道、实际文件 URL 保持一致；慢下载与快速切歌不能把旧资源重新播放。

**已确认方案：** 用户在根因审查后授权开修。保留 WebDAV 本地文件缓存与单首真实歌曲队列；先暂停、加入目标轨道并明确 skip，再删除旧轨道。不恢复静音占位轨，也不修改缓存失效策略。

**请求约束：** 每次取链使用递增请求号和所选播放信息快照，在重试、成功、失败、清理及原生异步操作边界检查有效性。旧歌曲仍在播放不代表新请求失效。曲终清零只更新显示，不能向仍在队列内的旧歌曲发送 seek(0)。

**技术栈：** React Native、TypeScript、当前锁定的 Android TrackPlayer、Node test runner。

## 执行步骤

- [x] 在 `tests/player/helpers/playbackHarness.js` 建立隔离测试环境：执行真实事件总线、播放状态、取链、WebDAV 缓存解析、原生队列调用；只替换设备、网络、文件与持久化边界。原生替身遵循当前轨道不可 remove 的实际契约。
- [x] 在 `tests/player/track-switch.test.js` 添加失败行为测试：自动连续切歌、手动下一首/上一首、缓存/慢下载、快速跳过下载中的歌曲、同曲新旧请求乱序、原生切换期间请求失效、曲终不 seek 旧曲、原生失败后重试。先运行 `node --test tests/player/track-switch.test.js` 确认失败原因。
- [x] 修改 `src/core/player/player.ts` 的请求归属检查；修改 `src/plugins/player/playList.ts` 的加入/选中/清理顺序及串行任务；通过 `src/plugins/player/utils.ts` 传递请求守卫和异步结果。仅在行为测试显示必要时调整曲终事件处理。
- [x] 更新过时的源码形状断言，并运行播放器、媒体库、发布相关测试与修改文件 ESLint；对基线已有的两个详情页依赖模拟失败单独记录。
- [x] 验证 Android JavaScript bundle，更新 `CHANGELOG.md`，进行独立代码审查；修复审查中与本次范围相关的问题。
- [x] 在干净 worktree 合并最新远端 main 并复验合并结果，保留原 main 工作区的本地未跟踪文件。发布命令为 `git push origin HEAD:main`，推送结果以远端 main 的合并提交记录为准。

## 验收边界

自动测试断言实际原生当前轨道与 URL，不以源码中出现某个单词代替行为验证。当前没有连接 Android 设备，不能把模块测试或 bundle 验证表述成真机听音验收。

## 验证结果（2026-10-21）

- `node --test tests/player/track-switch.test.js tests/player/playback-lifecycle.test.js`：27 项通过，其中 16 项为新增行为测试。
- 播放器、媒体库、发布测试：439 项中 437 项通过。两项失败位于 `music-detail-modal.test.js`，均因测试加载器缺少 `@/utils/musicSearchRanking`；已在干净的 `origin/main`（`88229fa`）复现相同失败。
- 修改文件 ESLint：现有 8 个错误与基线一致（7 个统计上下文的空值回退规则、1 个播放状态事件的 any 参数）。其余修改文件及新增测试检查通过，没有新增错误。
- `tsc --noEmit --pretty false`：修复前后均为 76 个已有错误；按文件、错误编号及消息比较，没有新增或移除的错误。
- Android production JavaScript bundle（`--platform android --dev false --max-workers 2`）成功，资源输出位于系统临时目录。
- 独立复审通过。审查发现的停止后恢复旧曲、停止未取消暂停等待中的切歌、快速播放后暂停被迟到查询覆盖，均先以失败测试复现再修复。
- 合并结果复验：439 项测试仍为 437 项通过和相同两项基线失败；Android production JavaScript bundle 再次成功。
