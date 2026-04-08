const { execFileSync } = require('node:child_process')
const updateChangeLog = require('../../publish/utils/updateChangeLog')
const {
  buildVersionCodeFromDisplayVersion,
  formatDisplayVersion,
  selectReleaseVersion,
} = require('./versioning')

const getExistingVersions = () => execFileSync('git', ['tag', '--list', 'v*'], { encoding: 'utf8' })
  .split(/\r?\n/)
  .filter(Boolean)
  .map(tag => tag.replace(/^v/, ''))

const run = async() => {
  const providedVersion = process.argv[2]
  const existingVersions = getExistingVersions()
  const fallbackDisplayVersion = formatDisplayVersion()
  const selectedRelease = providedVersion
    ? {
        displayVersion: providedVersion || fallbackDisplayVersion,
        versionCode: buildVersionCodeFromDisplayVersion({
          version: providedVersion || fallbackDisplayVersion,
          existingVersions,
        }),
      }
    : selectReleaseVersion({ existingVersions })

  await updateChangeLog(selectedRelease.displayVersion, {
    versionCode: selectedRelease.versionCode,
  })
  console.log(`Prepared release version ${selectedRelease.displayVersion} (${selectedRelease.versionCode})`)
}

run().catch(error => {
  console.error(error)
  process.exitCode = 1
})
