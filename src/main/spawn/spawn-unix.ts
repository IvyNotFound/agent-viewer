/**
 * Spawn strategy for Linux / macOS.
 *
 * Routing: process.platform !== 'win32'
 *
 * Delegates to spawnWsl — on non-Windows platforms wslArgs are empty and the wsl.exe
 * path falls back to a Windows literal, preserving the existing behavior.
 *
 * TODO(future): replace with a native spawn (direct bash/sh) once Linux/macOS support
 * is formally stabilized.
 *
 * @module spawn/spawn-unix
 */
export { spawnWsl as spawnUnix } from './spawn-wsl'
