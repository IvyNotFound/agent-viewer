#!/usr/bin/env node
/**
 * check-sqlite3.js
 * Checks if sqlite3 CLI is available. If not, prints install instructions.
 * Called automatically via postinstall on Linux/macOS.
 * Skipped silently on Windows (sqlite3 CLI not needed there — sql.js is used instead).
 */

const { execSync } = require('child_process');
const os = require('os');

if (os.platform() === 'win32') {
  // On Windows, sqlite3 CLI is not used — sql.js handles DB reads
  process.exit(0);
}

try {
  execSync('sqlite3 --version', { stdio: 'ignore' });
  console.log('✔ sqlite3 CLI already installed');
} catch {
  console.warn('\n⚠  sqlite3 CLI not found.');
  console.warn('   Agents use sqlite3 for direct DB access (faster than MCP server).');
  console.warn('   Install it with:');
  console.warn('     sudo apt-get install -y sqlite3   # Debian/Ubuntu/WSL');
  console.warn('     brew install sqlite               # macOS');
  console.warn('');
}
