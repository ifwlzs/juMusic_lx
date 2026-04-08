const fs = require('fs')
const { jp } = require('./index')
const chalk = require('chalk')
const changelogPath = jp('../../CHANGELOG.md')
const pkgPath = jp('../../package.json')
const versionPath = jp('../version.json')
const releaseBodyPath = jp('../releaseBody.md')
const {
  applyReleaseVersion,
  buildVersionCodeFromDisplayVersion,
  formatDisplayVersion,
  formatReleaseDate,
  getLatestChangelogBody,
  sanitizeReleaseNotesMarkdown,
} = require('../../scripts/release/versioning')

const readJson = filePath => JSON.parse(fs.readFileSync(filePath, 'utf-8'))

module.exports = async(newVerNum, {
  versionCode,
} = {}) => {
  const pkg = readJson(pkgPath)
  const version = readJson(versionPath)
  const pkg_bak = JSON.stringify(pkg, null, 2)
  const version_bak = JSON.stringify(version, null, 2)
  const changelog_bak = fs.readFileSync(changelogPath, 'utf-8')
  if (!newVerNum) newVerNum = formatDisplayVersion()
  const newMDChangeLog = fs.readFileSync(jp('../changeLog.md'), 'utf-8')
  const releaseBodyMarkdown = sanitizeReleaseNotesMarkdown(newMDChangeLog)
  const knownVersions = [
    pkg.version,
    version.version,
    ...(Array.isArray(version.history) ? version.history.map(item => item.version) : []),
  ].filter(Boolean)
  const nextVersionCode = versionCode ?? buildVersionCodeFromDisplayVersion({
    version: newVerNum,
    existingVersions: knownVersions,
  })
  const nextState = applyReleaseVersion({
    packageJson: pkg,
    versionJson: version,
    changelogMarkdown: changelog_bak,
    releaseNotesMarkdown: releaseBodyMarkdown,
    version: newVerNum,
    versionCode: nextVersionCode,
    releaseDate: formatReleaseDate(),
  })

  console.log(chalk.blue('new version: ') + chalk.green(newVerNum))
  console.log(chalk.blue('versionCode: ') + chalk.green(String(nextVersionCode)))

  fs.writeFileSync(versionPath, JSON.stringify(nextState.versionJson) + '\n', 'utf-8')

  fs.writeFileSync(pkgPath, JSON.stringify(nextState.packageJson, null, 2) + '\n', 'utf-8')

  fs.writeFileSync(changelogPath, nextState.changelogMarkdown, 'utf-8')
  fs.writeFileSync(
    releaseBodyPath,
    (getLatestChangelogBody(nextState.changelogMarkdown) || nextState.releaseNotes).trimEnd() + '\n',
    'utf-8',
  )

  return {
    pkg_bak,
    version_bak,
    changelog_bak,
  }
}
