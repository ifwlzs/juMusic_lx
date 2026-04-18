#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

function printUsage() {
  console.log('Usage: node scripts/play-history/merge-play-history.js [--output <file>] <export1.json> <export2.json> [...]')
}

function parseArgs(argv) {
  const inputs = []
  let output = ''

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--output' || arg === '-o') {
      output = argv[i + 1] || ''
      i += 1
      continue
    }
    inputs.push(arg)
  }

  if (!output) output = path.resolve(process.cwd(), 'lx_play_history_merged.json')
  else output = path.resolve(process.cwd(), output)

  return { inputs, output }
}

function readJsonFile(filePath) {
  const absPath = path.resolve(process.cwd(), filePath)
  const raw = fs.readFileSync(absPath, 'utf8')
  const payload = JSON.parse(raw)
  if (payload.type !== 'playHistoryExport_v1' || !Array.isArray(payload.items)) {
    throw new Error(`invalid_play_history_export: ${absPath}`)
  }
  return { absPath, payload }
}

function createFingerprint(item = {}) {
  const normalized = {
    aggregateSongId: item.aggregateSongId || '',
    sourceItemId: item.sourceItemId || '',
    startedAt: Number(item.startedAt) || 0,
    endedAt: Number(item.endedAt) || 0,
    listenedSec: Number(item.listenedSec) || 0,
    durationSec: Number(item.durationSec) || 0,
    countedPlay: item.countedPlay === true,
    completionRate: Number(item.completionRate) || 0,
    endReason: item.endReason || '',
    entrySource: item.entrySource || '',
    seekCount: Number(item.seekCount) || 0,
    seekForwardSec: Number(item.seekForwardSec) || 0,
    seekBackwardSec: Number(item.seekBackwardSec) || 0,
    titleSnapshot: item.titleSnapshot || '',
    artistSnapshot: item.artistSnapshot || '',
    albumSnapshot: item.albumSnapshot || '',
    providerTypeSnapshot: item.providerTypeSnapshot || '',
    fileNameSnapshot: item.fileNameSnapshot || '',
    remotePathSnapshot: item.remotePathSnapshot || '',
    listIdSnapshot: item.listIdSnapshot || null,
    listTypeSnapshot: item.listTypeSnapshot || '',
  }
  return crypto.createHash('sha1').update(JSON.stringify(normalized)).digest('hex')
}

function mergePlayHistory(payloadInfos = []) {
  const dedupMap = new Map()
  const mergedFrom = []
  let inputItems = 0

  for (const { absPath, payload } of payloadInfos) {
    const items = Array.isArray(payload.items) ? payload.items : []
    inputItems += items.length
    mergedFrom.push({
      file: absPath,
      exportedAt: Number(payload.exportedAt) || null,
      timezone: payload.timezone || '',
      count: Number(payload.count) || items.length,
    })
    for (const item of items) {
      dedupMap.set(createFingerprint(item), item)
    }
  }

  const mergedItems = [...dedupMap.values()].sort((a, b) => {
    const startA = Number(a.startedAt) || 0
    const startB = Number(b.startedAt) || 0
    if (startA !== startB) return startA - startB
    const endA = Number(a.endedAt) || 0
    const endB = Number(b.endedAt) || 0
    return endA - endB
  })

  return {
    type: 'playHistoryExport_v1',
    exportedAt: Date.now(),
    timezone: 'Asia/Shanghai',
    range: {
      preset: 'all',
      start: null,
      end: null,
    },
    count: mergedItems.length,
    mergedFrom,
    mergeMeta: {
      inputFiles: payloadInfos.length,
      inputItems,
      dedupedItems: inputItems - mergedItems.length,
    },
    items: mergedItems,
  }
}

function main() {
  const { inputs, output } = parseArgs(process.argv.slice(2))
  if (inputs.length < 2) {
    printUsage()
    process.exitCode = 1
    return
  }

  const payloadInfos = inputs.map(readJsonFile)
  const merged = mergePlayHistory(payloadInfos)
  fs.writeFileSync(output, JSON.stringify(merged, null, 2), 'utf8')

  console.log(`Merged file written: ${output}`)
  console.log(`Input files: ${merged.mergeMeta.inputFiles}`)
  console.log(`Input sessions: ${merged.mergeMeta.inputItems}`)
  console.log(`Merged sessions: ${merged.count}`)
  console.log(`Deduplicated sessions: ${merged.mergeMeta.dedupedItems}`)
}

main()

