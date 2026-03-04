/**
 * Converts a Windows-style path to its WSL equivalent.
 * @param winPath - Windows-style path (e.g. `C:\Users\foo`).
 * @returns WSL path (e.g. `/mnt/c/Users/foo`).
 */
export function toWslPath(winPath: string): string {
  return winPath
    .replace(/\\/g, '/')
    .replace(/^([A-Za-z]):/, (_, d) => `/mnt/${d.toLowerCase()}`)
}
