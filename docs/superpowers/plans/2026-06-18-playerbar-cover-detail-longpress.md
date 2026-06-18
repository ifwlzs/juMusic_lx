# 小播放器封面长按打开歌曲详情页 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 将小播放器封面长按改为打开应用内歌曲详情页，同时保留标题区域长按定位当前播放歌曲到列表位置的能力。

**架构：** 小播放器封面组件继续负责播放页入口和封面错误处理；长按逻辑改为读取完整的 `playerState.playMusicInfo.musicInfo` 并调用既有 `navigations.pushMusicDetailScreen`。标题组件不改动，继续承载 `global.app_event.jumpListPosition()`。

**技术栈：** React Native、react-native-navigation、Node.js `node:test` 静态行为测试。

---

## 文件结构

- 修改：`src/components/player/PlayerBar/components/Pic.tsx`
  - 职责：封面短按打开播放页；封面长按打开歌曲详情页；封面加载失败时清理播放封面。
- 不修改：`src/components/player/PlayerBar/components/Title.tsx`
  - 职责：标题短按打开播放页；标题长按定位当前播放歌曲列表位置。
- 测试：`tests/player/playerbar-cover-detail-longpress.test.js`
  - 职责：用源码结构锁定封面与标题的交互分工，避免回归。
- 文档：`CHANGELOG.md`
  - 职责：记录用户可感知交互变更。
- 文档：`docs/todo/todolist.md`
  - 职责：如存在对应交互候选项则回填；没有则不新增泛化待办。

### 任务 1：锁定封面长按详情入口

**文件：**
- 创建：`tests/player/playerbar-cover-detail-longpress.test.js`
- 修改：`src/components/player/PlayerBar/components/Pic.tsx`

- [ ] **步骤 1：编写失败的测试**

```js
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const readFile = relativePath => fs.readFileSync(path.resolve(__dirname, '../../', relativePath), 'utf8')

test('小播放器封面长按打开歌曲详情页', () => {
  const file = readFile('src/components/player/PlayerBar/components/Pic.tsx')
  const longPressBlock = file.slice(file.indexOf('const handleLongPress'), file.indexOf('const handleError'))

  assert.match(longPressBlock, /playerState\.playMusicInfo\.musicInfo/)
  assert.match(longPressBlock, /navigations\.pushMusicDetailScreen\(targetComponentId,\s*\{\s*musicInfo/)
  assert.doesNotMatch(longPressBlock, /jumpListPosition/)
})

test('小播放器标题长按继续定位当前播放歌曲到列表位置', () => {
  const file = readFile('src/components/player/PlayerBar/components/Title.tsx')
  const longPressBlock = file.slice(file.indexOf('const handleLongPress'), file.indexOf('// console.log'))

  assert.match(longPressBlock, /global\.app_event\.jumpListPosition\(\)/)
})
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test tests/player/playerbar-cover-detail-longpress.test.js`

预期：FAIL，封面长按仍包含 `jumpListPosition` 且没有 `pushMusicDetailScreen`。

- [ ] **步骤 3：编写最少实现代码**

在 `Pic.tsx` 的 `handleLongPress` 中：

```ts
const handleLongPress = () => {
  const fullMusicInfo = playerState.playMusicInfo.musicInfo
  if (!musicInfo.id || !fullMusicInfo) return
  const targetComponentId = isHome ? commonState.componentIds.home! : commonState.componentIds.songlistDetail!
  navigations.pushMusicDetailScreen(targetComponentId, {
    musicInfo: fullMusicInfo,
    sourceListId: playerState.playMusicInfo.listId,
  })
}
```

同时移除 `LIST_IDS` 导入，因为封面不再判断下载列表定位。

- [ ] **步骤 4：运行测试验证通过**

运行：`node --test tests/player/playerbar-cover-detail-longpress.test.js`

预期：PASS。

- [ ] **步骤 5：记录变更**

修改 `CHANGELOG.md`，在 Unreleased / 当前开发段添加：

```md
- 小播放器封面长按改为打开歌曲详情页，标题长按继续保留定位当前播放歌曲到列表位置。
```

- [ ] **步骤 6：完整目标验证**

运行：

```powershell
node --test tests/player/playerbar-cover-detail-longpress.test.js
node --test tests/player/*.test.js
node --test tests/play-detail/*.test.js
node --test tests/media-library/*.test.js
git diff --check
$output = npx tsc --noEmit 2>&1
$tscExit = $LASTEXITCODE
$targeted = $output | Select-String -Pattern 'src/components/player/PlayerBar/components/Pic|src/components/player/PlayerBar/components/Title|src/navigation|tests/player/playerbar-cover-detail-longpress'
if ($targeted) { $targeted | ForEach-Object { $_.ToString() }; exit 1 }
"NO_TARGETED_TSC_ERRORS"
"FULL_TSC_EXIT_CODE=$tscExit"
```

预期：目标测试通过；`git diff --check` 通过；目标路径无 TypeScript 错误。

- [ ] **步骤 7：Commit**

```bash
git add src/components/player/PlayerBar/components/Pic.tsx tests/player/playerbar-cover-detail-longpress.test.js CHANGELOG.md docs/superpowers/plans/2026-06-18-playerbar-cover-detail-longpress.md
git commit -m "feat: 小播放器封面长按打开歌曲详情页"
```
