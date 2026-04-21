const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const readFile = filePath => fs.readFileSync(path.resolve(__dirname, '../../', filePath), 'utf8')

const LANGS = ['zh-cn', 'zh-tw', 'en-us']

test('android manifest defines icon aliases and launcher moved away from MainActivity', () => {
  const manifest = readFile('android/app/src/main/AndroidManifest.xml')

  const mainActivityMatch = manifest.match(/<activity\s+android:name="\.MainActivity"[\s\S]*?<\/activity>/)
  assert.ok(mainActivityMatch, 'MainActivity block missing')

  const mainActivityBlock = mainActivityMatch[0]
  assert.doesNotMatch(mainActivityBlock, /android\.intent\.category\.LAUNCHER/)

  assert.match(manifest, /<activity-alias[\s\S]*android:name="\.MainActivityIcon1"/)
  assert.match(manifest, /<activity-alias[\s\S]*android:name="\.MainActivityIcon2"/)
  assert.match(manifest, /<activity-alias[\s\S]*android:name="\.MainActivityIcon1"[\s\S]*android:enabled="true"/)
  assert.match(manifest, /<activity-alias[\s\S]*android:name="\.MainActivityIcon2"[\s\S]*android:enabled="false"/)
})

test('android icon2 resources exist in all mipmap buckets', () => {
  const base = path.resolve(__dirname, '../../android/app/src/main/res')
  const dirs = ['mipmap-mdpi', 'mipmap-hdpi', 'mipmap-xhdpi', 'mipmap-xxhdpi', 'mipmap-xxxhdpi']

  for (const dir of dirs) {
    assert.equal(fs.existsSync(path.join(base, dir, 'ic_launcher_alt.png')), true, `${dir}/ic_launcher_alt.png missing`)
    assert.equal(fs.existsSync(path.join(base, dir, 'ic_launcher_alt_round.png')), true, `${dir}/ic_launcher_alt_round.png missing`)
  }

  assert.equal(fs.existsSync(path.join(base, 'mipmap-anydpi-v26', 'ic_launcher_alt.xml')), true)
})

test('app icon native module and settings bindings are wired', () => {
  const mainApp = readFile('android/app/src/main/java/io/ifwlzs/jumusic/lx/MainApplication.java')
  const basicIndex = readFile('src/screens/Home/Views/Setting/settings/Basic/index.tsx')
  const wrapper = readFile('src/utils/nativeModules/appIcon.ts')

  assert.match(mainApp, /new\s+AppIconPackage\s*\(\s*\)/)
  assert.match(basicIndex, /import\s+AppIcon\s+from\s+'\.\/AppIcon'/)
  assert.match(basicIndex, /<AppIcon\s*\/\s*>/)
  assert.match(wrapper, /NativeModules/)
  assert.match(wrapper, /setCurrentAppIcon|setIcon/)
  assert.match(wrapper, /getCurrentAppIcon|getCurrentIcon/)
})

test('app icon setting key exists in default settings and type declarations', () => {
  const defaultSetting = readFile('src/config/defaultSetting.ts')
  const settingType = readFile('src/types/app_setting.d.ts')

  assert.match(defaultSetting, /'common\.appIcon'\s*:\s*'icon1'/)
  assert.match(settingType, /'common\.appIcon'\s*:\s*'icon1'\s*\|\s*'icon2'/)
})

test('app icon i18n keys exist in all languages', () => {
  for (const lang of LANGS) {
    const content = readFile(`src/lang/${lang}.json`)
    assert.match(content, /"setting_basic_app_icon"\s*:/)
    assert.match(content, /"setting_basic_app_icon_icon1"\s*:/)
    assert.match(content, /"setting_basic_app_icon_icon2"\s*:/)
  }
})