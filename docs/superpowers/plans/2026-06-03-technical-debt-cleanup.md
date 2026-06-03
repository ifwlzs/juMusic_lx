# 技术债第一批清理实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 按方案 C 清理低风险源码 TODO，并把仍需产品语义确认的事项收口到 `docs/todo/todolist.md`。

**架构：** 使用一个静态契约测试锁定第一批清理范围：源码中不再保留裸 `TODO` 注释，已确认完成的技术债在待办文档中标记完成，待确认行为继续保留在文档而不是散落在源码。对歌词链路单独移除 `any` 类型兜底，使用已有 SDK 调用形态直接读取 `.promise`。对资源缓存页保留现有清理行为，只删除过期列表缓存注释，因为当前没有可复用的列表缓存清理 API。

**技术栈：** Node `node:test`、TypeScript / TSX 静态契约、React Native 现有源码、Markdown 待办文档。

---

## 文件结构

- 创建：`tests/technical-debt/todo-cleanup.test.js`
  - 扫描第一批目标源码，确保不再保留 `TODO` / `FIXME` 注释。
  - 检查 `src/core/music/utils.ts` 不再通过 `as any` 读取歌词请求。
  - 检查 `docs/todo/todolist.md` 对已完成项和待确认项有明确状态。
- 修改：`src/core/syncSourceList.ts`
  - 删除已被 `setListUpdateTime(...)` 替代的旧更新时间 TODO。
- 修改：`src/core/music/utils.ts`
  - 删除两处 `as any` 歌词请求兜底，直接使用 SDK 返回对象的 `.promise`。
- 修改：`src/core/music/local.ts`
  - 删除“是否保存本地 URL”的裸 TODO，保留已存在的线上候选源 URL 缓存逻辑。
- 修改：`src/core/music/download.ts`
  - 删除下载封面 URL 持久化的裸 TODO，并把该未确认行为保留在待办文档。
- 修改：`src/screens/Home/Views/Setting/settings/Other/ResourceCache.tsx`
  - 删除过期的列表缓存清理注释；当前页面继续清理 App 缓存、播放器缓存、音乐 URL 缓存和权限检查状态。
- 修改：`src/plugins/sync/client/modules/list/localEvent.ts`
  - 删除裸 TODO，补充中文注释说明当前失败策略，并将状态上报保留在待办文档。
- 修改：`src/plugins/sync/client/modules/dislike/localEvent.ts`
  - 删除裸 TODO，补充中文注释说明当前失败策略，并将状态上报保留在待办文档。
- 修改：`src/plugins/player/playList.ts`
  - 删除裸 TODO，保留恢复播放信息后的当前行为；启动自动播放继续作为待确认项。
- 修改：`src/types/list.d.ts`
  - 删除裸 TODO，保留默认列表元信息结构；默认列表持久化继续作为待确认项。
- 修改：`docs/todo/todolist.md`
  - 把本批已清理项标记为完成。
  - 明确仍需语义确认的项保持未完成。
- 修改：`CHANGELOG.md`
  - 记录本批技术债清理。

## 任务 1：写技术债清理红灯测试

**文件：**
- 创建：`tests/technical-debt/todo-cleanup.test.js`

- [ ] **步骤 1：编写失败测试**

测试扫描第一批目标源码，期望不出现 `TODO` / `FIXME`；扫描歌词逻辑，期望不出现 `as any).promise`；扫描待办文档，期望已完成和待确认状态分明。

- [ ] **步骤 2：运行测试验证失败**

运行：`node --test tests/technical-debt/todo-cleanup.test.js`
预期：FAIL，因为源码中仍有 `TODO` 注释，且 `src/core/music/utils.ts` 仍包含 `as any).promise`。

## 任务 2：清理源码 TODO 与歌词类型兜底

**文件：**
- 修改：任务 1 中列出的源码文件。

- [ ] **步骤 1：删除过期 TODO 或替换为中文说明**

只删除当前已有行为已经覆盖或无法直接实现的裸 TODO；未确认行为不在源码中继续裸写 TODO，统一进入 `docs/todo/todolist.md`。

- [ ] **步骤 2：移除歌词请求中的 `any` 兜底**

把：

```ts
reqPromise = (musicSdk[musicInfo.source].getLyric(toOldMusicInfo(musicInfo)) as any).promise
```

替换为：

```ts
reqPromise = musicSdk[musicInfo.source].getLyric(toOldMusicInfo(musicInfo)).promise
```

- [ ] **步骤 3：运行测试验证通过**

运行：`node --test tests/technical-debt/todo-cleanup.test.js`
预期：PASS。

## 任务 3：更新待办文档与变更记录

**文件：**
- 修改：`docs/todo/todolist.md`
- 修改：`CHANGELOG.md`

- [ ] **步骤 1：更新 `docs/todo/todolist.md`**

把已经清理为源码无裸 TODO 的项标记完成；仍需产品语义确认的行为保留未完成并补充“已从源码 TODO 收口到文档”说明。

- [ ] **步骤 2：更新 `CHANGELOG.md`**

在 Unreleased 的“优化”或“修复”区域记录技术债清理，避免发版记录缺失。

- [ ] **步骤 3：运行完整目标验证**

运行：

```powershell
node --test tests/technical-debt/todo-cleanup.test.js tests/media-library/mylist-fast-scroll.test.js
npx eslint src/core/syncSourceList.ts src/core/music/utils.ts src/core/music/local.ts src/core/music/download.ts src/plugins/sync/client/modules/list/localEvent.ts src/plugins/sync/client/modules/dislike/localEvent.ts src/plugins/player/playList.ts src/screens/Home/Views/Setting/settings/Other/ResourceCache.tsx tests/technical-debt/todo-cleanup.test.js --ext .js,.ts,.tsx --quiet
git diff --check
```

预期：全部 exit 0。
