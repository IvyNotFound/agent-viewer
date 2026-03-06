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

const SQLITE_VERSION = '3510200' // 3.51.2
const SQLITE_YEAR = '2026'

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
    if (arch === 'arm64') {
      console.warn(
        'Warning: SQLite.org does not provide native arm64 binaries for macOS. Downloading x86_64 (runs via Rosetta 2).',
      )
    }
    return {
      zipName: `sqlite-tools-osx-x86-${SQLITE_VERSION}.zip`,
      binaryName: 'sqlite3',
      extract: (zipPath, destDir) => {
        execSync(`unzip -o "${zipPath}" "*/sqlite3" -d "${destDir}"`)
        execSync(
          `find "${destDir}" -name sqlite3 ! -path "${path.join(destDir, 'sqlite3')}" -exec mv {} "${path.join(destDir, 'sqlite3')}" \\;`,
        )
      },
      chmod: true,
    }
  }

  if (platform === 'linux') {
    return {
      zipName: `sqlite-tools-linux-x64-${SQLITE_VERSION}.zip`,
      binaryName: 'sqlite3',
      extract: (zipPath, destDir) => {
        execSync(`unzip -o "${zipPath}" "*/sqlite3" -d "${destDir}"`)
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
