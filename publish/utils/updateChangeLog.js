const fs = require('fs')
const { jp } = require('./index')
const chalk = require('chalk')
const changelogPath = jp('../../CHANGELOG.md')
const pkgPath = jp('../../package.json')
const versionPath = jp('../version.json')
const releaseBodyPath = jp('../releaseBody.md')
const {
  applyReleaseVersion,
  formatReleaseDate,
  formatReleaseVersion,
  sanitizeReleaseNotesMarkdown,
} = require('../../scripts/release/versioning')

const readJson = filePath => JSON.parse(fs.readFileSync(filePath, 'utf-8'))

module.exports = async newVerNum => {
  const pkg = readJson(pkgPath)
  const version = readJson(versionPath)
  const pkg_bak = JSON.stringify(pkg, null, 2)
  const version_bak = JSON.stringify(version, null, 2)
  const changelog_bak = fs.readFileSync(changelogPath, 'utf-8')
  if (!newVerNum) newVerNum = formatReleaseVersion()
  const newMDChangeLog = fs.readFileSync(jp('../changeLog.md'), 'utf-8')
  const releaseBodyMarkdown = sanitizeReleaseNotesMarkdown(newMDChangeLog)
  const nextState = applyReleaseVersion({
    packageJson: pkg,
    versionJson: version,
    changelogMarkdown: changelog_bak,
    releaseNotesMarkdown: releaseBodyMarkdown,
    version: newVerNum,
    releaseDate: formatReleaseDate(),
  })

  console.log(chalk.blue('new version: ') + chalk.green(newVerNum))

  fs.writeFileSync(versionPath, JSON.stringify(nextState.versionJson) + '\n', 'utf-8')

  fs.writeFileSync(pkgPath, JSON.stringify(nextState.packageJson, null, 2) + '\n', 'utf-8')

  fs.writeFileSync(changelogPath, nextState.changelogMarkdown, 'utf-8')
  fs.writeFileSync(releaseBodyPath, releaseBodyMarkdown.trimEnd() + '\n', 'utf-8')

  return {
    pkg_bak,
    version_bak,
    changelog_bak,
  }
}
