const updateChangeLog = require('../../publish/utils/updateChangeLog')
const { formatReleaseVersion } = require('./versioning')

const run = async() => {
  const version = process.argv[2] || formatReleaseVersion()
  await updateChangeLog(version)
  console.log(`Prepared release version ${version}`)
}

run().catch(error => {
  console.error(error)
  process.exitCode = 1
})
