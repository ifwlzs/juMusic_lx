const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const readFile = filePath => fs.readFileSync(path.resolve(__dirname, '../../', filePath), 'utf8')

const getHandlePushedHomeScreenBody = () => {
  const initFile = readFile('src/core/init/index.ts')
  const startMarker = 'const handlePushedHomeScreen = async() => {'
  const endMarker = '\n}\n\nlet isInited = false'
  const startIndex = initFile.indexOf(startMarker)
  const endIndex = initFile.indexOf(endMarker)

  assert.notEqual(startIndex, -1, 'startup handler should exist')
  assert.notEqual(endIndex, -1, 'startup handler terminator should exist')

  return initFile.slice(startIndex, endIndex)
}

test('startup no longer auto shows pact or version popups', () => {
  const startupBody = getHandlePushedHomeScreenBody()

  assert.equal(startupBody.includes('cheatTip()'), false)
  assert.equal(startupBody.includes('showPactModal()'), false)
  assert.equal(startupBody.includes('checkUpdate()'), false)
  assert.equal(startupBody.includes('initDeeplink()'), true)
})

test('about settings page still exposes the pact modal entry', () => {
  const aboutFile = readFile('src/screens/Home/Views/Setting/settings/About.tsx')

  assert.equal(aboutFile.includes('showPactModal()'), true)
})

test('version settings page still exposes the manual version modal entry', () => {
  const versionFile = readFile('src/screens/Home/Views/Setting/settings/Version.tsx')

  assert.equal(versionFile.includes('showModal()'), true)
})
