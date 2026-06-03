const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '../..')

const readRepoFile = filePath => fs.readFileSync(path.resolve(repoRoot, filePath), 'utf8')

const sourceTodoFiles = [
  'src/core/syncSourceList.ts',
  'src/core/music/utils.ts',
  'src/core/music/local.ts',
  'src/core/music/download.ts',
  'src/plugins/sync/client/modules/list/localEvent.ts',
  'src/plugins/sync/client/modules/dislike/localEvent.ts',
  'src/plugins/player/playList.ts',
  'src/types/list.d.ts',
  'src/screens/Home/Views/Setting/settings/Other/ResourceCache.tsx',
]

test('第一批技术债目标源码不再保留裸 TODO 注释', () => {
  const remaining = []

  for (const filePath of sourceTodoFiles) {
    const source = readRepoFile(filePath)
    const lines = source.split(/\r?\n/)
    lines.forEach((line, index) => {
      // 只扫描源码中的显式待办标记；未确认事项必须进入 docs/todo/todolist.md 统一管理。
      if (/\b(?:TODO|FIXME)\b/i.test(line)) remaining.push(`${filePath}:${index + 1}: ${line.trim()}`)
    })
  }

  assert.deepEqual(remaining, [])
})

test('在线歌词请求不再通过 any 类型兜底读取 promise', () => {
  const source = readRepoFile('src/core/music/utils.ts')

  // SDK 的 getLyric 返回对象已经和 getMusicUrl 一样带 promise 字段，这里应直接使用类型化调用。
  assert.doesNotMatch(source, /getLyric\(toOldMusicInfo\(musicInfo\)\)\s+as\s+any\)\.promise/)
  assert.match(source, /musicSdk\[musicInfo\.source\]\.getLyric\(toOldMusicInfo\(musicInfo\)\)\.promise/)
})

test('技术债待办文档区分已清源码 TODO 与仍需语义确认的项目', () => {
  const todo = readRepoFile('docs/todo/todolist.md')

  assert.match(todo, /- \[x\] 补齐同步来源列表更新时间逻辑。/)
  assert.match(todo, /- \[x\] 移除歌词获取链路中的 `any` 类型兜底。/)
  assert.match(todo, /源码 TODO 已清理/)
  assert.match(todo, /仍需语义确认/)
})
