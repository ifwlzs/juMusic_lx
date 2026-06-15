# 媒体库歌曲详情独立页实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 将「我的列表」中的本地 / 媒体库歌曲详情主入口从弹窗升级为独立详情页，并保留在线音源外链详情行为。

**架构：** 新增 `MusicDetailPage` 页面与 `MUSIC_DETAIL_SCREEN` 导航注册；页面复用现有 `MusicDetailModal/buildDetailSections.ts` 的详情分组与复制文本纯函数。`Mylist/MusicList` 内部详情目标从 `MusicDetailModal.show()` 改为 `pushMusicDetailScreen()`，旧弹窗保留但不再作为主入口。

**技术栈：** React Native、react-native-navigation、现有 `PageContent` / `StatusBar` / `Button` / `Text` / `Icon` 组件、Node `node:test` 静态与轻量行为测试。

---

## 文件结构

- 新增 `src/screens/MusicDetailPage/index.tsx`：独立详情页 UI，负责 Header 安全区、详情分组展示、复制动作和歌手入口。
- 修改 `src/navigation/screenNames.ts`：新增 `MUSIC_DETAIL_SCREEN` 常量。
- 修改 `src/navigation/registerScreens.tsx`：注册 `MusicDetailPage`。
- 修改 `src/navigation/navigation.ts`：新增 `pushMusicDetailScreen()`。
- 修改 `src/screens/index.ts`：导出 `MusicDetailPage`。
- 修改 `src/screens/Home/Views/Mylist/MusicList/index.tsx`：内部详情目标从弹窗切换到独立页。
- 修改 `src/screens/PlayDetail/components/ArtistEntry.tsx`：支持传入可选 `componentId`，保持播放页默认行为。
- 新增 `tests/media-library/music-detail-page.test.js`：覆盖独立详情页、导航注册、主入口切换。
- 修改 `tests/media-library/music-detail-modal.test.js`：把“内部详情弹窗主入口”断言更新为“内部详情独立页主入口”，保留弹窗组件自身测试。
- 修改 `tests/play-detail/artist-page-entry.test.js`：覆盖 `ArtistEntry` 可选 `componentId` 兼容契约。
- 修改 `CHANGELOG.md`：在 `[Unreleased]` 新增条目。

---

### 任务 1：导航与入口契约测试

**文件：**
- 创建：`tests/media-library/music-detail-page.test.js`
- 修改：`tests/media-library/music-detail-modal.test.js`
- 修改：`tests/play-detail/artist-page-entry.test.js`

- [ ] **步骤 1：编写失败的导航与页面契约测试**

创建 `tests/media-library/music-detail-page.test.js`：

```js
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '../..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

test('媒体库歌曲详情独立页完成导航注册', () => {
  assert.match(read('src/navigation/screenNames.ts'), /MUSIC_DETAIL_SCREEN\s*=\s*'lxm\.MusicDetailScreen'/)
  assert.match(read('src/navigation/registerScreens.tsx'), /MusicDetailPage/)
  assert.match(read('src/navigation/registerScreens.tsx'), /Navigation\.registerComponent\(MUSIC_DETAIL_SCREEN/)
  assert.match(read('src/navigation/navigation.ts'), /pushMusicDetailScreen/)
  assert.match(read('src/navigation/navigation.ts'), /name:\s*MUSIC_DETAIL_SCREEN/)
  assert.match(read('src/navigation/navigation.ts'), /passProps:\s*params/)
  assert.match(read('src/screens/index.ts'), /MusicDetailPage/)
})

test('媒体库歌曲详情独立页复用详情模型复制动作和安全区 Header', () => {
  const file = read('src/screens/MusicDetailPage/index.tsx')
  assert.match(file, /buildMusicDetailSections/)
  assert.match(file, /getMusicDetailCopyActions/)
  assert.match(file, /buildMusicDetailCopyText/)
  assert.match(file, /clipboardWriteText/)
  assert.match(file, /ScrollView/)
  assert.match(file, /useStatusbarHeight/)
  assert.match(file, /height:\s*HEADER_HEIGHT\s*\+\s*statusBarHeight/)
  assert.match(file, /paddingTop:\s*statusBarHeight/)
})

test('媒体库歌曲详情独立页接入歌手入口并从当前页面压栈歌手页', () => {
  const file = read('src/screens/MusicDetailPage/index.tsx')
  assert.match(file, /ArtistEntry/)
  assert.match(file, /componentId=\{componentId\}/)
  assert.match(file, /singer=\{musicInfo\.singer\}/)
})

test('我的列表内部详情目标改为 push 独立详情页且在线音源仍走外链', () => {
  const file = read('src/screens/Home/Views/Mylist/MusicList/index.tsx')
  assert.match(file, /pushMusicDetailScreen/)
  assert.match(file, /isInternalMusicDetailTarget\(info\.musicInfo\)/)
  assert.match(file, /pushMusicDetailScreen\([^,]+,\s*\{[\s\S]*musicInfo:\s*info\.musicInfo[\s\S]*sourceListId:\s*info\.listId/)
  assert.match(file, /handleShowMusicSourceDetail\(info\.musicInfo\)/)
  assert.doesNotMatch(file, /musicDetailModalRef\.current\?\.show\(info\.musicInfo\)/)
})
```

- [ ] **步骤 2：更新旧入口测试为失败契约**

在 `tests/media-library/music-detail-modal.test.js` 中把测试名：

```js
test('我的列表详情动作对在线音源走外链，对媒体库歌曲走应用内详情弹窗', () => {
```

改为：

```js
test('我的列表详情动作对在线音源走外链，对媒体库歌曲走应用内详情独立页', () => {
```

把同一测试中的断言：

```js
assert.match(indexFile, /MusicDetailModal/)
```

改为：

```js
assert.match(indexFile, /pushMusicDetailScreen/)
```

把测试名：

```js
test('我的列表页详情动作会排他地在应用内弹窗和在线外链之间分流', () => {
```

改为：

```js
test('我的列表页详情动作会排他地在应用内详情页和在线外链之间分流', () => {
```

把该测试中的本地歌曲断言：

```js
assert.deepEqual(musicListModule.getMusicDetailShowCalls(), [localMusicInfo])
```

改为：

```js
assert.deepEqual(musicListModule.getMusicDetailPushCalls(), [{ musicInfo: localMusicInfo, sourceListId: 'list_1' }])
assert.deepEqual(musicListModule.getMusicDetailShowCalls(), [])
```

把媒体库歌曲断言：

```js
assert.deepEqual(musicListModule.getMusicDetailShowCalls(), [mediaLibraryMusicInfo])
```

改为：

```js
assert.deepEqual(musicListModule.getMusicDetailPushCalls(), [{ musicInfo: mediaLibraryMusicInfo, sourceListId: 'list_1' }])
assert.deepEqual(musicListModule.getMusicDetailShowCalls(), [])
```

把在线歌曲断言后增加：

```js
assert.deepEqual(musicListModule.getMusicDetailPushCalls(), [])
```

- [ ] **步骤 3：更新测试加载器记录独立页 push 调用**

在 `tests/media-library/music-detail-modal.test.js` 的 `loadMylistMusicListModule()` 内，找到：

```js
  const musicDetailShowCalls = []
```

改为：

```js
  const musicDetailShowCalls = []
  const musicDetailPushCalls = []
```

在该加载器的 dependency switch 中新增 `@/navigation` 分支。如果已经有 `@/navigation` 分支，则把 `navigations.pushMusicDetailScreen` 合并进去：

```js
      case '@/navigation':
        return {
          navigations: {
            pushMusicDetailScreen: (_componentId, params) => {
              musicDetailPushCalls.push(params)
            },
          },
        }
```

在 `mod.exports` 区域增加：

```js
  mod.exports.getMusicDetailPushCalls = () => [...musicDetailPushCalls]
```

在 `resetDetailRouteCalls()` 中增加：

```js
    musicDetailPushCalls.length = 0
```

- [ ] **步骤 4：更新 ArtistEntry 兼容契约测试**

在 `tests/play-detail/artist-page-entry.test.js` 的 `ArtistEntry 负责联名歌手选择、无命中 toast 和进入歌手页` 测试中增加：

```js
  assert.match(file, /componentId\?:\s*string/)
  assert.match(file, /componentId\s*\?\?\s*commonState\.componentIds\.playDetail/)
```

- [ ] **步骤 5：运行测试验证失败**

运行：

```powershell
node --test tests/media-library/music-detail-page.test.js tests/media-library/music-detail-modal.test.js tests/play-detail/artist-page-entry.test.js
```

预期：FAIL。关键失败应包括：

- 找不到 `MUSIC_DETAIL_SCREEN`；
- 找不到 `src/screens/MusicDetailPage/index.tsx`；
- `MusicList/index.tsx` 尚未调用 `pushMusicDetailScreen`；
- `ArtistEntry` 尚未支持 `componentId`。

- [ ] **步骤 6：Commit 失败测试**

```powershell
git add tests/media-library/music-detail-page.test.js tests/media-library/music-detail-modal.test.js tests/play-detail/artist-page-entry.test.js
git commit -m "test: 添加媒体库歌曲详情独立页契约"
```

---

### 任务 2：新增详情页导航骨架

**文件：**
- 修改：`src/navigation/screenNames.ts`
- 修改：`src/navigation/registerScreens.tsx`
- 修改：`src/navigation/navigation.ts`
- 修改：`src/screens/index.ts`
- 创建：`src/screens/MusicDetailPage/index.tsx`
- 测试：`tests/media-library/music-detail-page.test.js`

- [ ] **步骤 1：确认任务 1 测试仍失败于缺少导航和页面**

运行：

```powershell
node --test tests/media-library/music-detail-page.test.js
```

预期：FAIL，至少一个断言指向缺少 `MUSIC_DETAIL_SCREEN` 或 `MusicDetailPage`。

- [ ] **步骤 2：添加 screen 常量与导出**

在 `src/navigation/screenNames.ts` 中添加：

```ts
export const MUSIC_DETAIL_SCREEN = 'lxm.MusicDetailScreen'
```

在 `src/screens/index.ts` 中添加：

```ts
export { default as MusicDetailPage } from './MusicDetailPage'
```

- [ ] **步骤 3：注册页面组件**

修改 `src/navigation/registerScreens.tsx`：

```ts
import {
  Home,
  PlayDetail,
  ArtistPage,
  MusicDetailPage,
  SonglistDetail,
  Comment,
} from '@/screens'
```

并在 screenNames import 中加入：

```ts
  MUSIC_DETAIL_SCREEN,
```

在注册列表中加入：

```tsx
  Navigation.registerComponent(MUSIC_DETAIL_SCREEN, () => WrappedComponent(MusicDetailPage))
```

- [ ] **步骤 4：新增 pushMusicDetailScreen 导航方法**

修改 `src/navigation/navigation.ts` 的 screenNames import，加入：

```ts
  MUSIC_DETAIL_SCREEN,
```

在 `pushArtistPageScreen()` 后、`pushPlayDetailScreen()` 前新增函数，避免影响旧的 `theme-customization.test.js` 对播放页状态栏代码块截取：

```ts
export function pushMusicDetailScreen(componentId: string, params: {
  musicInfo: LX.Music.MusicInfo
  sourceListId?: string | null
}) {
  requestAnimationFrame(() => {
    const theme = themeState.theme

    void Navigation.push(componentId, {
      component: {
        name: MUSIC_DETAIL_SCREEN,
        passProps: params,
        options: {
          topBar: {
            visible: false,
            height: 0,
            drawBehind: false,
          },
          statusBar: {
            drawBehind: true,
            visible: true,
            style: getStatusBarStyle(theme.isDark),
            backgroundColor: 'transparent',
          },
          navigationBar: {
            backgroundColor: theme['c-content-background'],
          },
          layout: {
            componentBackgroundColor: theme['c-content-background'],
          },
          animations: {
            push: {
              content: {
                translationX: {
                  from: windowSizeTools.getSize().width,
                  to: 0,
                  duration: 300,
                },
              },
            },
            pop: {
              content: {
                translationX: {
                  from: 0,
                  to: windowSizeTools.getSize().width,
                  duration: 300,
                },
              },
            },
          },
        },
      },
    })
  })
}
```

- [ ] **步骤 5：创建最小页面骨架**

创建 `src/screens/MusicDetailPage/index.tsx`：

```tsx
import { useCallback } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'

import PageContent from '@/components/PageContent'
import StatusBar from '@/components/common/StatusBar'
import Button from '@/components/common/Button'
import { Icon } from '@/components/common/Icon'
import Text from '@/components/common/Text'
import { useI18n } from '@/lang'
import { pop } from '@/navigation'
import { useStatusbarHeight } from '@/store/common/hook'
import { useTheme } from '@/store/theme/hook'
import {
  buildMusicDetailSections,
  getMusicDetailCopyActions,
} from '@/components/MusicDetailModal/buildDetailSections'

export interface MusicDetailPageProps {
  componentId: string
  musicInfo: LX.Music.MusicInfo
  sourceListId?: string | null
}

// 歌曲详情页顶部内容区高度，运行时叠加状态栏高度来适配异形屏。
const HEADER_HEIGHT = 56

export default ({ componentId, musicInfo }: MusicDetailPageProps) => {
  const t = useI18n()
  const theme = useTheme()
  const statusBarHeight = useStatusbarHeight()
  const sections = buildMusicDetailSections(musicInfo)
  const copyActions = getMusicDetailCopyActions(musicInfo)

  const handleBack = useCallback(() => {
    void pop(componentId)
  }, [componentId])

  return (
    <PageContent>
      <StatusBar />
      <View style={{ ...styles.container, backgroundColor: theme['c-content-background'] }}>
        <View style={{ ...styles.header, height: HEADER_HEIGHT + statusBarHeight, paddingTop: statusBarHeight, borderBottomColor: theme['c-border-background'] }}>
          <Button style={styles.backButton} onPress={handleBack}>
            <Icon name="chevron-left" size={18} color={theme['c-font']} />
          </Button>
          <Text style={styles.headerTitle} numberOfLines={1} color={theme['c-font']}>{t('music_detail_title')}</Text>
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <Text style={styles.title} color={theme['c-font']}>{musicInfo.name}</Text>
          <Text color={theme['c-font-label']}>{musicInfo.singer || '-'}</Text>
          <View style={styles.copyActionList}>
            {copyActions.map(action => (
              <Button key={action.key} disabled={action.disabled} style={{ ...styles.copyActionButton, backgroundColor: theme['c-button-background'] }}>
                <Text color={theme['c-button-font']}>{t(action.label)}</Text>
              </Button>
            ))}
          </View>
          {sections.map(section => (
            <View key={section.key} style={styles.section}>
              <Text style={styles.sectionTitle} color={theme['c-font']}>{t(`music_detail_section_${section.key}`)}</Text>
              {section.items.map(item => (
                <View key={`${section.key}_${item.key}`} style={styles.itemRow}>
                  <Text style={styles.itemLabel} color={theme['c-font-label']}>{t(item.label)}</Text>
                  <Text style={styles.itemValue} color={theme['c-font']}>{item.value}</Text>
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      </View>
    </PageContent>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    width: 48,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    paddingRight: 16,
    fontWeight: '700',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  copyActionList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  copyActionButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontWeight: '700',
  },
  itemRow: {
    gap: 4,
  },
  itemLabel: {
    fontWeight: '700',
  },
  itemValue: {
    lineHeight: 18,
  },
})
```

- [ ] **步骤 6：运行导航与页面骨架测试**

运行：

```powershell
node --test tests/media-library/music-detail-page.test.js
```

预期：仍可能 FAIL 于复制动作、歌手入口或入口分流断言；导航与页面骨架相关断言应通过。

- [ ] **步骤 7：Commit 导航骨架**

```powershell
git add src/navigation/screenNames.ts src/navigation/registerScreens.tsx src/navigation/navigation.ts src/screens/index.ts src/screens/MusicDetailPage/index.tsx
git commit -m "feat: 新增媒体库歌曲详情页导航骨架"
```

---

### 任务 3：泛化 ArtistEntry 并接入详情页歌手入口

**文件：**
- 修改：`src/screens/PlayDetail/components/ArtistEntry.tsx`
- 修改：`src/screens/MusicDetailPage/index.tsx`
- 测试：`tests/play-detail/artist-page-entry.test.js`
- 测试：`tests/media-library/music-detail-page.test.js`

- [ ] **步骤 1：运行 ArtistEntry 契约测试确认失败**

运行：

```powershell
node --test tests/play-detail/artist-page-entry.test.js tests/media-library/music-detail-page.test.js
```

预期：FAIL，`ArtistEntry` 缺少 `componentId?: string` 和 `componentId ?? commonState.componentIds.playDetail`。

- [ ] **步骤 2：给 ArtistEntry 增加可选 componentId**

修改 `src/screens/PlayDetail/components/ArtistEntry.tsx`：

```ts
export interface ArtistEntryProps {
  singer: string
  componentId?: string
  size?: number
  textStyle?: ComponentProps<typeof Text>['style']
  textColor?: ComponentProps<typeof Text>['color']
}
```

把组件参数从：

```tsx
export default memo(({ singer, size = 12, textStyle, textColor }: ArtistEntryProps) => {
```

改为：

```tsx
export default memo(({ singer, componentId, size = 12, textStyle, textColor }: ArtistEntryProps) => {
```

把 `openArtistPage()` 中的：

```ts
      const componentId = commonState.componentIds.playDetail
      if (!componentId) return
      navigations.pushArtistPageScreen(componentId, {
```

改为：

```ts
      // 默认继续使用播放页组件 ID；详情页等其他入口可显式传入当前页面 componentId。
      const targetComponentId = componentId ?? commonState.componentIds.playDetail
      if (!targetComponentId) return
      navigations.pushArtistPageScreen(targetComponentId, {
```

并把调用改为：

```ts
      navigations.pushArtistPageScreen(targetComponentId, {
```

把 `useCallback` 依赖从：

```ts
  }, [singer, t])
```

改为：

```ts
  }, [componentId, singer, t])
```

- [ ] **步骤 3：详情页接入 ArtistEntry**

修改 `src/screens/MusicDetailPage/index.tsx`，添加 import：

```tsx
import ArtistEntry from '@/screens/PlayDetail/components/ArtistEntry'
```

把摘要区歌手文本：

```tsx
<Text color={theme['c-font-label']}>{musicInfo.singer || '-'}</Text>
```

改为：

```tsx
<ArtistEntry componentId={componentId} singer={musicInfo.singer} size={13} textColor={theme['c-font-label']} />
```

如果要避免空歌手仍渲染按钮，可保留 `ArtistEntry` 自身 toast 行为，不额外分支。

- [ ] **步骤 4：运行歌手入口测试验证通过**

运行：

```powershell
node --test tests/play-detail/artist-page-entry.test.js tests/media-library/music-detail-page.test.js
```

预期：本任务相关断言 PASS；入口分流测试可能仍 FAIL。

- [ ] **步骤 5：Commit 歌手入口兼容**

```powershell
git add src/screens/PlayDetail/components/ArtistEntry.tsx src/screens/MusicDetailPage/index.tsx tests/play-detail/artist-page-entry.test.js
git commit -m "feat: 详情页复用媒体库歌手入口"
```

---

### 任务 4：详情页复制动作与可读值渲染

**文件：**
- 修改：`tests/media-library/music-detail-page.test.js`
- 修改：`src/screens/MusicDetailPage/index.tsx`

- [ ] **步骤 1：补充复制动作行为契约测试**

在 `tests/media-library/music-detail-page.test.js` 添加：

```js
test('媒体库歌曲详情独立页复制动作会写剪贴板并复用现有 toast', () => {
  const file = read('src/screens/MusicDetailPage/index.tsx')
  assert.match(file, /const\s+handleCopy\s*=\s*useCallback/)
  assert.match(file, /buildMusicDetailCopyText\(action\.key,\s*musicInfo\)/)
  assert.match(file, /clipboardWriteText\(text\)/)
  assert.match(file, /toast\(t\('copy_name_tip'\)\)/)
  assert.match(file, /onPress=\{\(\)\s*=>\s*\{\s*handleCopy\(action\)\s*\}\}/)
})

test('媒体库歌曲详情独立页会翻译详情模型中的 i18n 值而不是裸露 key', () => {
  const file = read('src/screens/MusicDetailPage/index.tsx')
  assert.match(file, /isTranslateValueKey/)
  assert.match(file, /value\.startsWith\('music_detail_'\)/)
  assert.match(file, /value\.startsWith\('source_real_'\)/)
  assert.match(file, /isTranslateValueKey\(item\.value\)\s*\?\s*t\(item\.value\)\s*:\s*item\.value/)
})
```

- [ ] **步骤 2：运行新增测试验证失败**

运行：

```powershell
node --test tests/media-library/music-detail-page.test.js
```

预期：FAIL，`MusicDetailPage` 尚未实现 `handleCopy()` 或 i18n value 翻译。

- [ ] **步骤 3：实现复制动作**

修改 `src/screens/MusicDetailPage/index.tsx` import：

```tsx
import { clipboardWriteText, toast } from '@/utils/tools'
```

在组件内加入：

```tsx
  const handleCopy = useCallback((action: ReturnType<typeof getMusicDetailCopyActions>[number]) => {
    // 页面复制动作复用详情纯函数，保证独立页与旧弹窗复制内容一致。
    const rawText = buildMusicDetailCopyText(action.key, musicInfo)
    const text = typeof rawText == 'string' ? rawText : ''
    if (!text) return
    clipboardWriteText(text)
    toast(t('copy_name_tip'))
  }, [musicInfo, t])
```

把复制按钮补上 onPress：

```tsx
<Button
  key={action.key}
  disabled={action.disabled}
  style={{ ...styles.copyActionButton, backgroundColor: theme['c-button-background'] }}
  onPress={() => { handleCopy(action) }}
>
```

- [ ] **步骤 4：实现详情 value 翻译**

在 `src/screens/MusicDetailPage/index.tsx` 组件外添加：

```tsx
const isTranslateValueKey = (value: string) => {
  // 详情模型中的来源和状态值可能是 i18n key，页面层负责转成用户可读文案。
  return value.startsWith('music_detail_') || value.startsWith('source_real_')
}
```

把详情值渲染：

```tsx
<Text style={styles.itemValue} color={theme['c-font']}>{item.value}</Text>
```

改为：

```tsx
<Text style={styles.itemValue} color={theme['c-font']}>
  {isTranslateValueKey(item.value) ? t(item.value) : item.value}
</Text>
```


- [ ] **步骤 5：运行详情页测试验证通过**

运行：

```powershell
node --test tests/media-library/music-detail-page.test.js
```

预期：详情页复制和翻译相关断言 PASS；入口分流相关断言可能仍 FAIL。

- [ ] **步骤 6：Commit 复制动作**

```powershell
git add tests/media-library/music-detail-page.test.js src/screens/MusicDetailPage/index.tsx
git commit -m "feat: 补齐详情页复制动作"
```

---

### 任务 5：我的列表入口切换到独立详情页

**文件：**
- 修改：`src/screens/Home/Views/Mylist/MusicList/index.tsx`
- 修改：`tests/media-library/music-detail-modal.test.js`
- 测试：`tests/media-library/music-detail-page.test.js`

- [ ] **步骤 1：运行入口测试确认失败**

运行：

```powershell
node --test tests/media-library/music-detail-page.test.js tests/media-library/music-detail-modal.test.js
```

预期：FAIL，内部详情目标仍调用 `MusicDetailModal.show()` 或测试加载器未捕获 `pushMusicDetailScreen()`。

- [ ] **步骤 2：修改我的列表入口**

修改 `src/screens/Home/Views/Mylist/MusicList/index.tsx`，移除不再用于主入口的 import：

```tsx
import MusicDetailModal, { type MusicDetailModalType } from '@/components/MusicDetailModal'
```

新增 import：

```tsx
import { navigations } from '@/navigation'
import commonState from '@/store/common/state'
```

删除 ref：

```tsx
const musicDetailModalRef = useRef<MusicDetailModalType>(null)
```

在 `onMusicSourceDetail` 内，把：

```tsx
if (isInternalMusicDetailTarget(info.musicInfo)) {
  musicDetailModalRef.current?.show(info.musicInfo)
  return
}
```

改为：

```tsx
if (isInternalMusicDetailTarget(info.musicInfo)) {
  // 本地歌曲与媒体库歌曲进入独立详情页，避免继续受弹窗空间限制。
  const componentId = commonState.componentIds.home
  if (!componentId) return
  navigations.pushMusicDetailScreen(componentId, {
    musicInfo: info.musicInfo,
    sourceListId: info.listId,
  })
  return
}
```

删除底部 `<MusicDetailModal ... />` 挂载。

同时删除依赖该弹窗的 `onPressArtist` 当前列表浮层逻辑；本轮歌手入口由独立详情页中的 `ArtistEntry` 统一进入媒体库歌手页。旧 `MusicDetailModal` 组件源码与组件级测试保留，但 `MusicList/index.tsx` 不再挂载它。

在 `tests/media-library/music-detail-modal.test.js` 中删除旧的 `任务 3 我的列表页会把详情弹窗歌手点击转接到歌手相关歌曲浮层` 测试，并把 `任务 3 歌手相关歌曲入口新增实现补齐中文注释` 调整为只断言弹窗组件自身注释，不再断言 `MusicList/index.tsx` 中的“歌手点击 / 当前列表内”注释。

- [ ] **步骤 3：更新旧测试加载器依赖**

在 `tests/media-library/music-detail-modal.test.js` 的 `loadMylistMusicListModule()` 中，保留 `MusicDetailModal` mock 以兼容旧弹窗组件测试，但 `Mylist/MusicList/index.tsx` 不再 import 它后不会命中。

新增 `@/navigation` mock：

```js
      case '@/navigation':
        return {
          navigations: {
            pushMusicDetailScreen: (_componentId, params) => {
              musicDetailPushCalls.push(params)
            },
          },
        }
```

新增 `@/store/common/state` mock：

```js
      case '@/store/common/state':
        return {
          __esModule: true,
          default: {
            componentIds: {
              home: 'home_component',
            },
          },
        }
```

- [ ] **步骤 4：运行入口测试验证通过**

运行：

```powershell
node --test tests/media-library/music-detail-page.test.js tests/media-library/music-detail-modal.test.js
```

预期：本地 / 媒体库歌曲 push 独立页，在线歌曲走外链；旧弹窗模型和复制测试继续 PASS。

- [ ] **步骤 5：Commit 入口切换**

```powershell
git add src/screens/Home/Views/Mylist/MusicList/index.tsx tests/media-library/music-detail-modal.test.js tests/media-library/music-detail-page.test.js
git commit -m "feat: 我的列表详情入口进入独立页"
```

---

### 任务 6：文案、变更记录与回归验证

**文件：**
- 修改：`CHANGELOG.md`
- 测试：`tests/media-library/*.test.js`
- 测试：`tests/play-detail/*.test.js`

- [ ] **步骤 1：确认是否需要新增文案 key**

检查 `MusicDetailPage` 是否只使用已有 key：

```powershell
Select-String -Path src/screens/MusicDetailPage/index.tsx -Pattern "music_detail_|copy_name_tip|artist_page_"
```

第一版必须只复用已有 `music_detail_title`、`music_detail_copy_*`、`music_detail_section_*`、`copy_name_tip` 与 `artist_page_*` 文案；如果实现时发现缺 key，先停止并修正计划，不临时扩展三语言。

- [ ] **步骤 2：更新 changelog**

在 `CHANGELOG.md` 的 `[Unreleased]` 第一个“新增”段落加入：

```md
- 新增媒体库歌曲详情独立页，「我的列表」中的本地 / 媒体库歌曲详情入口改为进入页面展示，并保留复制详情与歌手跳转能力
```

- [ ] **步骤 3：运行完整相关测试**

运行：

```powershell
node --test tests/media-library/*.test.js
node --test tests/play-detail/*.test.js
```

预期：全部 PASS。

- [ ] **步骤 4：运行 whitespace 检查**

运行：

```powershell
git diff --check
```

预期：无输出，退出码 0。

- [ ] **步骤 5：运行本轮相关路径 TypeScript 过滤检查**

运行：

```powershell
$output = npx tsc --noEmit 2>&1
$targeted = $output | Select-String -Pattern 'src/screens/MusicDetailPage|src/screens/Home/Views/Mylist/MusicList/index|src/screens/PlayDetail/components/ArtistEntry|src/navigation/navigation|src/navigation/registerScreens|src/navigation/screenNames|src/screens/index'
if ($targeted) {
  $targeted | ForEach-Object { $_.ToString() }
  exit 1
}
Write-Output "NO_TARGETED_TSC_ERRORS"
Write-Output "FULL_TSC_EXIT_CODE=$LASTEXITCODE"
exit 0
```

预期：输出 `NO_TARGETED_TSC_ERRORS`。全仓 `tsc` 可能仍因既有类型债退出 2，需要记录但不作为本轮阻塞。

- [ ] **步骤 6：Commit 文案与验证收尾**

提交 `CHANGELOG.md`：

```powershell
git add CHANGELOG.md
git commit -m "docs: 更新详情页变更记录"
```

---

## 最终验证与合并说明

实现完成后运行：

```powershell
node --test tests/media-library/*.test.js
node --test tests/play-detail/*.test.js
git diff --check
```

再运行本轮相关路径 TypeScript 过滤检查。确认通过后，按仓库约定：

1. 从干净合并 worktree 快进合并到 `main`；
2. 在合并结果上重复相关验证；
3. 推送 `origin/main`；
4. 清理 `feat/media-library-music-detail-page` worktree 和分支；
5. 不删除主目录中无关未跟踪文件：
   - `.superpowers-server.err`
   - `.superpowers-server.out`
   - `docs/superpowers/plans/2026-05-15-media-library-music-detail-modal.md`
