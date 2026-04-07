const SHANGHAI_TIME_ZONE = 'Asia/Shanghai'

const versionFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: SHANGHAI_TIME_ZONE,
  year: '2-digit',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hour12: false,
})

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: SHANGHAI_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const getFormattedParts = (formatter, date) => formatter.formatToParts(date).reduce((result, part) => {
  if (part.type !== 'literal') result[part.type] = part.value
  return result
}, {})

const formatReleaseVersion = (date = new Date()) => {
  const parts = getFormattedParts(versionFormatter, date)
  return `${parts.year}${parts.month}${parts.day}${parts.hour}`
}

const formatReleaseDate = (date = new Date()) => {
  const parts = getFormattedParts(dateFormatter, date)
  return `${parts.year}-${parts.month}-${parts.day}`
}

const normalizeRepositoryUrl = repositoryUrl => repositoryUrl
  .replace(/^git\+/, '')
  .replace(/\.git$/, '')

const sanitizeParentheticalContent = content => content
  .replace(/@[\w-]+/g, '')
  .replace(/\bthanks\b/gi, '')
  .replace(/\bby\s*:/gi, '')
  .replace(/感谢/gu, '')
  .replace(/\s+/g, ' ')
  .replace(/\s*([,，、;；])\s*/g, '$1 ')
  .trim()
  .replace(/^[,，、;；\s]+|[,，、;；\s]+$/g, '')

const sanitizeReleaseNoteLine = line => line
  .replace(/([（(])([^()（）]*)([）)])/g, (match, open, content, close) => {
    const sanitized = sanitizeParentheticalContent(content)
    if (!sanitized) return ''
    return `${open}${sanitized}${close}`
  })
  .replace(/(^|[\s(（,，、])@[\w-]+(?=$|[\s)）,，、])/g, '$1')
  .replace(/\s+([)）,，、;；])/g, '$1')
  .replace(/([（(])\s+/g, '$1')
  .replace(/\s{2,}/g, ' ')
  .trimEnd()

const sanitizeReleaseNotesMarkdown = markdown => markdown
  .split(/\r\n|\r|\n/)
  .map(sanitizeReleaseNoteLine)
  .join('\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim()

const parseReleaseNotes = markdown => sanitizeReleaseNotesMarkdown(markdown)
  .replace(/(?:^|(\n))#{1,6}\s+(.+)\n/g, '$1$2\n')
  .trim()

const parseChangelog = async text => {
  const versions = []
  const lines = text.split(/\r\n|\r|\n/)
  let currentVersion = null
  let currentDate = null
  let currentDesc = ''

  for (const line of lines) {
    const versionMatch = line.match(/^\s*##\s+\[?([^\]\s]+)\]?.*?-\s+(\d{4}-\d{2}-\d{2})$/)
    if (versionMatch) {
      if (currentVersion) {
        versions.push({
          version: currentVersion,
          date: currentDate,
          desc: currentDesc.trim(),
        })
      }
      currentVersion = versionMatch[1]
      currentDate = versionMatch[2]
      currentDesc = ''
      continue
    }
    if (currentVersion) currentDesc += `${line}\n`
  }

  if (currentVersion) {
    versions.push({
      version: currentVersion,
      date: currentDate,
      desc: currentDesc.trim(),
    })
  }

  return versions
}

const getHeadingMatches = changelogMarkdown => [...changelogMarkdown.matchAll(/^##\s+\[?([^\]\s]+)\]?.*?-\s+\d{4}-\d{2}-\d{2}.*$/gm)]

const upsertLatestChangelogEntry = ({ changelogMarkdown, entry, version }) => {
  const headingMatches = getHeadingMatches(changelogMarkdown)
  if (!headingMatches.length) return `${changelogMarkdown.trimEnd()}\n\n${entry}\n`

  const [firstHeading, secondHeading] = headingMatches
  const start = firstHeading.index
  const end = secondHeading ? secondHeading.index : changelogMarkdown.length
  const prefix = changelogMarkdown.slice(0, start).trimEnd()
  const suffix = changelogMarkdown.slice(end).replace(/^\s+/, '')
  const latestVersion = firstHeading[1]

  if (latestVersion === version) {
    return `${prefix}\n\n${entry}\n\n${suffix}`.trimEnd() + '\n'
  }

  return `${prefix}\n\n${entry}\n\n${changelogMarkdown.slice(start).replace(/^\s+/, '')}`.trimEnd() + '\n'
}

const buildChangelogEntry = ({ version, previousVersion, releaseDate, releaseNotes, repositoryUrl }) => {
  return `## [${version}](${normalizeRepositoryUrl(repositoryUrl)}/compare/v${previousVersion}...v${version}) - ${releaseDate}\n\n${releaseNotes}`
}

const applyReleaseVersion = ({
  packageJson,
  versionJson,
  changelogMarkdown,
  releaseNotesMarkdown,
  version = formatReleaseVersion(),
  releaseDate = formatReleaseDate(),
}) => {
  const releaseNotes = parseReleaseNotes(releaseNotesMarkdown)
  const previousVersion = versionJson.version || packageJson.version
  const history = Array.isArray(versionJson.history) ? [...versionJson.history] : []
  const sameVersion = previousVersion === version
  const compareBaseVersion = sameVersion ? (history[0]?.version || previousVersion) : previousVersion

  const nextVersionJson = {
    ...versionJson,
    version,
    desc: releaseNotes,
    history: sameVersion ? history : [
      {
        version: previousVersion,
        desc: versionJson.desc,
      },
      ...history,
    ],
  }

  const nextPackageJson = {
    ...packageJson,
    version,
    versionCode: Number(version),
  }

  const nextChangelogMarkdown = upsertLatestChangelogEntry({
    changelogMarkdown,
    version,
    entry: buildChangelogEntry({
      version,
      previousVersion: compareBaseVersion,
      releaseDate,
      releaseNotes,
      repositoryUrl: packageJson.repository.url,
    }),
  })

  return {
    packageJson: nextPackageJson,
    versionJson: nextVersionJson,
    changelogMarkdown: nextChangelogMarkdown,
    releaseNotes,
  }
}

module.exports = {
  applyReleaseVersion,
  formatReleaseDate,
  formatReleaseVersion,
  parseChangelog,
  sanitizeReleaseNotesMarkdown,
}
