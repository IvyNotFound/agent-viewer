/**
 * IPC Handlers — Project telemetry (language statistics)
 *
 * Provides `telemetry:scan` which walks the project directory tree and returns
 * per-language file/line counts (ignoring build artifacts and `node_modules`).
 * Results are displayed in {@link TelemetryView}.
 *
 * @module ipc-telemetry
 */
import { ipcMain } from 'electron'
import { readdir, readFile } from 'fs/promises'
import path from 'path'

const LANGUAGE_MAP: Record<string, { name: string; color: string }> = {
  '.ts': { name: 'TypeScript', color: '#3178c6' },
  '.vue': { name: 'Vue', color: '#42b883' },
  '.js': { name: 'JavaScript', color: '#f7df1e' },
  '.css': { name: 'CSS', color: '#563d7c' },
  '.html': { name: 'HTML', color: '#e44b23' },
  '.py': { name: 'Python', color: '#3572A5' },
  '.go': { name: 'Go', color: '#00ADD8' },
  '.rs': { name: 'Rust', color: '#dea584' },
  '.java': { name: 'Java', color: '#b07219' },
  '.json': { name: 'JSON', color: '#292929' },
  '.md': { name: 'Markdown', color: '#083fa1' },
  '.sh': { name: 'Shell', color: '#89e051' },
  '.sql': { name: 'SQL', color: '#e38c00' },
}

const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'out', '.cache', 'coverage', '.nyc_output'])

const TEST_NAME_RE = /\.(spec|test)\./

interface LineStats {
  total: number
  blank: number
  comment: number
  code: number
}

interface LangStat {
  name: string
  color: string
  files: number
  lines: number
  percent: number
  sourceFiles: number
  testFiles: number
  sourceLines: number
  testLines: number
  blankLines: number
  commentLines: number
  codeLines: number
}

interface TelemetryResult {
  languages: LangStat[]
  totalFiles: number
  totalLines: number
  scannedAt: string
  totalSourceLines: number
  totalTestLines: number
  testRatio: number
  totalBlankLines: number
  totalCommentLines: number
  totalCodeLines: number
  totalSourceFiles: number
  totalTestFiles: number
}

function isTestFile(filePath: string): boolean {
  const basename = path.basename(filePath)
  if (TEST_NAME_RE.test(basename)) return true
  const parts = filePath.split(/[\\/]/)
  return parts.some((p) => p === '__tests__' || p === 'test')
}

async function analyzeFile(filePath: string): Promise<LineStats> {
  const content = await readFile(filePath, 'utf-8').catch(() => '')
  const lines = content.split('\n')
  let blank = 0
  let comment = 0
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === '') {
      blank++
    } else if (
      trimmed.startsWith('//') ||
      trimmed.startsWith('#') ||
      trimmed.startsWith('*') ||
      trimmed.startsWith('/*') ||
      trimmed.startsWith('<!--')
    ) {
      comment++
    }
  }
  return { total: lines.length, blank, comment, code: lines.length - blank - comment }
}

interface ExtStats {
  files: number
  lines: number
  sourceFiles: number
  testFiles: number
  sourceLines: number
  testLines: number
  blankLines: number
  commentLines: number
  codeLines: number
}

async function scanDir(dir: string, stats: Map<string, ExtStats>): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name)) {
        await scanDir(path.join(dir, entry.name), stats)
      }
    } else {
      const ext = path.extname(entry.name).toLowerCase()
      if (!LANGUAGE_MAP[ext]) continue
      const filePath = path.join(dir, entry.name)
      const ls = await analyzeFile(filePath)
      const test = isTestFile(filePath)
      const s = stats.get(ext) ?? {
        files: 0,
        lines: 0,
        sourceFiles: 0,
        testFiles: 0,
        sourceLines: 0,
        testLines: 0,
        blankLines: 0,
        commentLines: 0,
        codeLines: 0,
      }
      stats.set(ext, {
        files: s.files + 1,
        lines: s.lines + ls.total,
        sourceFiles: s.sourceFiles + (test ? 0 : 1),
        testFiles: s.testFiles + (test ? 1 : 0),
        sourceLines: s.sourceLines + (test ? 0 : ls.total),
        testLines: s.testLines + (test ? ls.total : 0),
        blankLines: s.blankLines + ls.blank,
        commentLines: s.commentLines + ls.comment,
        codeLines: s.codeLines + ls.code,
      })
    }
  }
}

/** Register telemetry IPC handlers. */
export function registerTelemetryHandlers(): void {
  /**
   * Recursively scan `projectPath` and return per-language statistics.
   * Build directories (`dist`, `node_modules`, `.git`, etc.) are skipped.
   * @param projectPath - Absolute path to the project root
   * @returns {TelemetryResult} Language breakdown, total counts, and scan timestamp
   */
  ipcMain.handle(
    'telemetry:scan',
    async (_event, projectPath: string): Promise<TelemetryResult> => {
      if (typeof projectPath !== 'string' || !projectPath) {
        return {
          languages: [],
          totalFiles: 0,
          totalLines: 0,
          scannedAt: new Date().toISOString(),
          totalSourceLines: 0,
          totalTestLines: 0,
          testRatio: 0,
          totalBlankLines: 0,
          totalCommentLines: 0,
          totalCodeLines: 0,
          totalSourceFiles: 0,
          totalTestFiles: 0,
        }
      }
      const stats = new Map<string, ExtStats>()
      await scanDir(projectPath, stats)
      const totalLines = [...stats.values()].reduce((s, v) => s + v.lines, 0)
      const totalFiles = [...stats.values()].reduce((s, v) => s + v.files, 0)
      const totalSourceLines = [...stats.values()].reduce((s, v) => s + v.sourceLines, 0)
      const totalTestLines = [...stats.values()].reduce((s, v) => s + v.testLines, 0)
      const totalBlankLines = [...stats.values()].reduce((s, v) => s + v.blankLines, 0)
      const totalCommentLines = [...stats.values()].reduce((s, v) => s + v.commentLines, 0)
      const totalCodeLines = [...stats.values()].reduce((s, v) => s + v.codeLines, 0)
      const totalSourceFiles = [...stats.values()].reduce((s, v) => s + v.sourceFiles, 0)
      const totalTestFiles = [...stats.values()].reduce((s, v) => s + v.testFiles, 0)
      const testRatio =
        totalSourceLines + totalTestLines > 0
          ? Math.round((totalTestLines / (totalSourceLines + totalTestLines)) * 1000) / 10
          : 0
      const languages: LangStat[] = [...stats.entries()]
        .map(([ext, v]) => ({
          name: LANGUAGE_MAP[ext].name,
          color: LANGUAGE_MAP[ext].color,
          files: v.files,
          lines: v.lines,
          percent: totalLines > 0 ? Math.round((v.lines / totalLines) * 1000) / 10 : 0,
          sourceFiles: v.sourceFiles,
          testFiles: v.testFiles,
          sourceLines: v.sourceLines,
          testLines: v.testLines,
          blankLines: v.blankLines,
          commentLines: v.commentLines,
          codeLines: v.codeLines,
        }))
        .sort((a, b) => b.lines - a.lines)
      return {
        languages,
        totalFiles,
        totalLines,
        scannedAt: new Date().toISOString(),
        totalSourceLines,
        totalTestLines,
        testRatio,
        totalBlankLines,
        totalCommentLines,
        totalCodeLines,
        totalSourceFiles,
        totalTestFiles,
      }
    },
  )
}
