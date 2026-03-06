#!/usr/bin/env node
/**
 * check-i18n.js — Verifies all locale files have the same keys as en.json.
 * Exit 0 if all locales are complete, exit 1 otherwise.
 * No external dependencies (Node stdlib only).
 */

const fs = require('fs')
const path = require('path')

const LOCALES_DIR = path.join(__dirname, '..', 'src', 'renderer', 'src', 'locales')
const REFERENCE = 'en.json'

/**
 * Recursively flattens a nested object into dot-notation keys.
 * @param {object} obj
 * @param {string} prefix
 * @returns {string[]}
 */
function flattenKeys(obj, prefix = '') {
  return Object.keys(obj).flatMap((key) => {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (obj[key] !== null && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
      return flattenKeys(obj[key], fullKey)
    }
    return [fullKey]
  })
}

function loadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (err) {
    console.error(`ERROR: Cannot parse ${filePath}: ${err.message}`)
    process.exit(1)
  }
}

const refPath = path.join(LOCALES_DIR, REFERENCE)
if (!fs.existsSync(refPath)) {
  console.error(`ERROR: Reference file not found: ${refPath}`)
  process.exit(1)
}

const refKeys = flattenKeys(loadJson(refPath))

const localeFiles = fs
  .readdirSync(LOCALES_DIR)
  .filter((f) => f.endsWith('.json') && f !== REFERENCE)
  .sort()

const errors = []

for (const file of localeFiles) {
  const filePath = path.join(LOCALES_DIR, file)
  const keys = flattenKeys(loadJson(filePath))
  const refSet = new Set(refKeys)
  const keySet = new Set(keys)

  const missing = refKeys.filter((k) => !keySet.has(k))
  const extra = keys.filter((k) => !refSet.has(k))

  if (missing.length > 0 || extra.length > 0) {
    errors.push({ file, missing, extra })
  }
}

if (errors.length === 0) {
  console.log(`i18n check OK — all ${localeFiles.length} locale(s) match ${REFERENCE} (${refKeys.length} keys)`)
  process.exit(0)
}

console.error(`\ni18n check FAILED — ${errors.length} locale(s) have key mismatches:\n`)
for (const { file, missing, extra } of errors) {
  console.error(`  ${file}:`)
  if (missing.length > 0) {
    console.error(`    Missing (${missing.length}):`)
    for (const k of missing) console.error(`      - ${k}`)
  }
  if (extra.length > 0) {
    console.error(`    Extra (${extra.length}):`)
    for (const k of extra) console.error(`      + ${k}`)
  }
  console.error('')
}

process.exit(1)
