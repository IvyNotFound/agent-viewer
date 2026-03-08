#!/usr/bin/env node
/**
 * Downloads the sqlite3 precompiled binary from sqlite.org
 * and places it in resources/bin/ for electron-builder to bundle.
 * Supports win32, darwin (x64 + arm64 via Rosetta), and linux.
 */

const https = require('https')
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const SQLITE_VERSION = '3460000' // 3.46.0
const SQLITE_YEAR = '2024'

const DEST_DIR = path.join(__dirname, '..', 'resources', 'bin')

function getPlatformConfig() {
  const platform = process.platform
  const arch = process.arch

  if (platform === 'win32') {
    return {
      zipName: `sqlite-tools-win-x64-${SQLITE_VERSION}.zip`,
      binaryName: 'sqlite3.exe',
      extract: (zipPath, destDir) => {
        execSync(
          `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`,
        )
        // Move sqlite3.exe from subfolder to root of bin/
        execSync(
          `powershell -Command "Get-ChildItem -Path '${destDir}' -Recurse -Filter 'sqlite3.exe' | Where-Object { $_.DirectoryName -ne '${destDir}' } | Move-Item -Destination '${destDir}' -Force"`,
        )
      },
      chmod: false,
    }
  }

  if (platform === 'darwin') {
    // sqlite.org does not reliably provide prebuilt macOS CLI binaries.
    // Fall back to the system sqlite3 (pre-installed on macOS and CI runners).
    const systemSqlite = '/usr/bin/sqlite3'
    const fs2 = require('fs')
    if (fs2.existsSync(systemSqlite)) {
      const destFile = path.join(DEST_DIR, 'sqlite3')
      fs2.mkdirSync(DEST_DIR, { recursive: true })
      fs2.copyFileSync(systemSqlite, destFile)
      fs2.chmodSync(destFile, 0o755)
      console.log(`sqlite3 copied from system (${systemSqlite}) to ${destFile}`)
      process.exit(0)
    }
    console.warn('Warning: system sqlite3 not found at /usr/bin/sqlite3, skipping.')
    process.exit(0)
  }

  if (platform === 'linux') {
    return {
      zipName: `sqlite-tools-linux-x64-${SQLITE_VERSION}.zip`,
      binaryName: 'sqlite3',
      extract: (zipPath, destDir) => {
        // Extract all files; handle both subdirectory and flat zip structures
        execSync(`unzip -o "${zipPath}" -d "${destDir}"`)
        execSync(
          `find "${destDir}" -name sqlite3 ! -path "${path.join(destDir, 'sqlite3')}" -exec mv {} "${path.join(destDir, 'sqlite3')}" \\;`,
        )
      },
      chmod: true,
    }
  }

  throw new Error(`Unsupported platform: ${platform}`)
}

const config = getPlatformConfig()
const DOWNLOAD_URL = `https://www.sqlite.org/${SQLITE_YEAR}/${config.zipName}`
const DEST_FILE = path.join(DEST_DIR, config.binaryName)
const ZIP_TMP = path.join(DEST_DIR, 'sqlite-tools.zip')

if (fs.existsSync(DEST_FILE)) {
  console.log(`${config.binaryName} already present, skipping download.`)
  process.exit(0)
}

fs.mkdirSync(DEST_DIR, { recursive: true })

console.log(`Downloading ${config.binaryName} from ${DOWNLOAD_URL} ...`)

const file = fs.createWriteStream(ZIP_TMP)

function download(url, dest, cb) {
  https
    .get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return download(res.headers.location, dest, cb)
      }
      if (res.statusCode !== 200) {
        cb(new Error(`HTTP ${res.statusCode}`))
        return
      }
      res.pipe(dest)
      dest.on('finish', () => dest.close(cb))
    })
    .on('error', cb)
}

download(DOWNLOAD_URL, file, (err) => {
  if (err) {
    fs.unlink(ZIP_TMP, () => {})
    console.error('Download failed:', err.message)
    process.exit(1)
  }

  console.log(`Extracting ${config.binaryName} ...`)
  try {
    config.extract(ZIP_TMP, DEST_DIR)
    fs.unlinkSync(ZIP_TMP)
    if (config.chmod) {
      fs.chmodSync(DEST_FILE, 0o755)
    }
    console.log(`${config.binaryName} extracted to ${DEST_FILE}`)
  } catch (e) {
    console.error('Extraction failed:', e.message)
    process.exit(1)
  }
})
