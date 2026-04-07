const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const readFile = filePath => fs.readFileSync(path.resolve(__dirname, '../../', filePath), 'utf8')

test('user-visible app name uses JuMusic in app shell surfaces', () => {
  const appJson = readFile('app.json')
  const androidStrings = readFile('android/app/src/main/res/values/strings.xml')
  const infoPlist = readFile('ios/LxMusicMobile/Info.plist')
  const drawer = readFile('src/screens/Home/Vertical/DrawerNav.tsx')
  const zhCn = readFile('src/lang/zh-cn.json')

  assert.match(appJson, /"displayName": "JuMusic"/)
  assert.match(androidStrings, />JuMusic</)
  assert.match(infoPlist, /<key>CFBundleDisplayName<\/key>\s*<string>JuMusic<\/string>/s)
  assert.match(drawer, />JuMusic</)
  assert.match(zhCn, /"setting_about": "关于 JuMusic"/)
})

test('update checks and visible links point to the current GitHub repository only', () => {
  const versionFile = readFile('src/utils/version.js')
  const aboutFile = readFile('src/screens/Home/Views/Setting/settings/About.tsx')
  const pactFile = readFile('src/navigation/components/PactModal.tsx')

  assert.match(versionFile, /repository\.url/)
  assert.match(versionFile, /raw\.githubusercontent\.com\/ifwlzs\/juMusic_lx\/main\/publish\/version\.json/)
  assert.match(versionFile, /github\.com\/ifwlzs\/juMusic_lx\/releases\/download/)
  assert.doesNotMatch(versionFile, /registry\.npmjs\.org/)
  assert.doesNotMatch(versionFile, /registry\.npmmirror\.com/)
  assert.doesNotMatch(versionFile, /gitee\.com\/lyswhut/)
  assert.doesNotMatch(versionFile, /stsky\.cn/)
  assert.match(aboutFile, /github\.com\/ifwlzs\/juMusic_lx/)
  assert.match(pactFile, /github\.com\/ifwlzs\/juMusic_lx/)
  assert.doesNotMatch(aboutFile, /lyswhut\/lx-music-mobile/)
  assert.doesNotMatch(pactFile, /lyswhut\/lx-music-mobile/)
})
