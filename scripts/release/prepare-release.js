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

const getCommitSubjectsSinceLastRelease = () => {
  let range = 'HEAD'
  try {
    const lastTag = execFileSync('git', ['describe', '--tags', '--abbrev=0', '--match', 'v*'], { encoding: 'utf8' }).trim()
    if (lastTag) range = `${lastTag}..HEAD`
  } catch {}
  return execFileSync('git', ['log', range, '--pretty=format:%s'], { encoding: 'utf8' })
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
}

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
    commitSubjects: getCommitSubjectsSinceLastRelease(),
  })
  console.log(`Prepared release version ${selectedRelease.displayVersion} (${selectedRelease.versionCode})`)
}

run().catch(error => {
  console.error(error)
  process.exitCode = 1
})
