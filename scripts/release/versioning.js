const SHANGHAI_TIME_ZONE = 'Asia/Shanghai'

const versionFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: SHANGHAI_TIME_ZONE,
  year: '2-digit',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const hourFormatter = new Intl.DateTimeFormat('en-GB', {
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

const formatDisplayVersion = (date = new Date()) => {
  const parts = getFormattedParts(versionFormatter, date)
  return `0.${parts.year}.${parts.month}${parts.day}${parts.hour}${parts.minute}`
}

const formatReleaseVersion = formatDisplayVersion

const formatHourCode = (date = new Date()) => {
  const parts = getFormattedParts(hourFormatter, date)
  return Number(`${parts.year}${parts.month}${parts.day}${parts.hour}`)
}

const normalizeReleaseVersion = version => String(version).replace(/^v/, '')

const parseDisplayVersion = version => {
  const match = normalizeReleaseVersion(version).match(/^0\.(\d{2})\.(\d{2})(\d{2})(\d{2})(\d{2})(?:\.(\d+))?$/)
  if (!match) return null

  return {
    year: match[1],
    month: match[2],
    day: match[3],
    hour: match[4],
    minute: match[5],
    suffix: match[6] ? Number(match[6]) : 0,
  }
}

const compareDisplayVersions = (leftVersion, rightVersion) => {
  const left = parseDisplayVersion(leftVersion)
  const right = parseDisplayVersion(rightVersion)

  if (!left || !right) return normalizeReleaseVersion(leftVersion).localeCompare(normalizeReleaseVersion(rightVersion))

  const leftKey = `${left.year}${left.month}${left.day}${left.hour}${left.minute}${String(left.suffix).padStart(4, '0')}`
  const rightKey = `${right.year}${right.month}${right.day}${right.hour}${right.minute}${String(right.suffix).padStart(4, '0')}`
  return leftKey.localeCompare(rightKey)
}

const getDisplayHourCode = version => {
  const parsed = parseDisplayVersion(version)
  if (!parsed) return null
  return Number(`${parsed.year}${parsed.month}${parsed.day}${parsed.hour}`)
}

const selectHourlySerial = ({
  date = new Date(),
  existingVersions = [],
} = {}) => {
  const targetHourCode = formatHourCode(date)
  return existingVersions
    .map(normalizeReleaseVersion)
    .filter(version => getDisplayHourCode(version) === targetHourCode)
    .length
}

const buildVersionCode = ({
  date = new Date(),
  hourlySerial = 0,
} = {}) => formatHourCode(date) * 50 + hourlySerial * 5

const buildVersionCodeFromDisplayVersion = ({
  version,
  existingVersions = [],
} = {}) => {
  const hourCode = getDisplayHourCode(version)
  if (hourCode == null) return Number(version)
  const normalizedVersion = normalizeReleaseVersion(version)
  const hourlyVersions = [...new Set([
    ...existingVersions.map(normalizeReleaseVersion),
    normalizedVersion,
  ])]
    .filter(existingVersion => getDisplayHourCode(existingVersion) === hourCode)
    .sort(compareDisplayVersions)
  const hourlySerial = Math.max(hourlyVersions.indexOf(normalizedVersion), 0)
  return hourCode * 50 + hourlySerial * 5
}

const selectReleaseVersion = ({
  date = new Date(),
  existingVersions = [],
} = {}) => {
  const baseVersion = formatDisplayVersion(date)
  const normalizedVersions = new Set(existingVersions.map(normalizeReleaseVersion))
  let displayVersion = baseVersion
  let minuteSuffix = 0

  while (normalizedVersions.has(displayVersion)) {
    minuteSuffix += 1
    displayVersion = `${baseVersion}.${minuteSuffix}`
  }

  const hourlySerial = selectHourlySerial({ date, existingVersions })
  return {
    displayVersion,
    versionCode: buildVersionCode({ date, hourlySerial }),
    hourlySerial,
  }
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

const parseChangelog = text => {
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

const getLatestChangelogBody = changelogMarkdown => parseChangelog(changelogMarkdown)[0]?.desc || ''

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
  versionCode = buildVersionCodeFromDisplayVersion({ version }),
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
    versionCode,
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
  buildVersionCode,
  buildVersionCodeFromDisplayVersion,
  formatDisplayVersion,
  formatReleaseDate,
  formatReleaseVersion,
  getLatestChangelogBody,
  parseChangelog,
  selectHourlySerial,
  selectReleaseVersion,
  sanitizeReleaseNotesMarkdown,
}
