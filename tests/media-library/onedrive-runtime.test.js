const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const readFile = filePath => fs.readFileSync(path.resolve(__dirname, '../../', filePath), 'utf8')

test('runtime registry wires an onedrive provider through graph auth helpers', () => {
  const file = readFile('src/core/mediaLibrary/runtimeRegistry.js')

  assert.match(file, /createOneDriveProvider/)
  assert.match(file, /getOneDriveBusinessAccessToken/)
  assert.match(file, /getOneDriveBusinessAccount/)
  assert.match(file, /providerType: 'onedrive'|type: 'onedrive'/)
})

test('onedrive graph helper uses Microsoft Graph v1.0 with bearer auth and download url fallback', () => {
  const file = readFile('src/core/mediaLibrary/oneDriveGraph.js')

  assert.match(file, /graph\.microsoft\.com\/v1\.0/)
  assert.match(file, /Authorization: `Bearer \$\{accessToken\}`|Authorization: 'Bearer '/)
  assert.match(file, /@microsoft\.graph\.downloadUrl/)
  assert.match(file, /buildChildrenUrl/)
  assert.match(file, /root:\$\{encodedPath\}:\/children|\/me\/drive\/root\/children/)
})

test('onedrive graph helper requests audio metadata for direct item lookups', () => {
  const file = readFile('src/core/mediaLibrary/oneDriveGraph.js')

  assert.match(file, /DRIVE_ITEM_SELECT_FIELDS[\s\S]*audio/)
  assert.match(file, /getItemByPath[\s\S]*buildDriveItemUrl\(pathOrUri,\s*DRIVE_ITEM_SELECT_FIELDS\)/)
})
