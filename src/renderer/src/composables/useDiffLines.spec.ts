import { describe, it, expect } from 'vitest'
import { computeDiffLines, computeWriteLines } from '@renderer/composables/useDiffLines'

describe('composables/useDiffLines', () => {
  // ---------------------------------------------------------------------------
  // computeDiffLines
  // ---------------------------------------------------------------------------
  describe('computeDiffLines', () => {
    it('empty input (no old_string / no new_string) → []', () => {
      expect(computeDiffLines({})).toEqual([])
    })

    it('old_string="" new_string="" → [] (both falsy)', () => {
      expect(computeDiffLines({ old_string: '', new_string: '' })).toEqual([])
    })

    it('only new_string → all lines as add type', () => {
      const result = computeDiffLines({ new_string: 'line1\nline2\nline3' })
      expect(result).toHaveLength(3)
      expect(result.every((l) => l.type === 'add')).toBe(true)
      expect(result.every((l) => l.prefix === '+')).toBe(true)
      expect(result.map((l) => l.text)).toEqual(['line1', 'line2', 'line3'])
    })

    it('only old_string → all lines as remove type', () => {
      const result = computeDiffLines({ old_string: 'line1\nline2\nline3' })
      expect(result).toHaveLength(3)
      expect(result.every((l) => l.type === 'remove')).toBe(true)
      expect(result.every((l) => l.prefix === '-')).toBe(true)
      expect(result.map((l) => l.text)).toEqual(['line1', 'line2', 'line3'])
    })

    it('identical strings → [] (no visible diff)', () => {
      const s = 'line1\nline2\nline3'
      expect(computeDiffLines({ old_string: s, new_string: s })).toEqual([])
    })

    it('single-line change → remove + add with context lines', () => {
      const old_string = 'ctx1\nctx2\nctx3\nold-line\nctx4\nctx5\nctx6'
      const new_string = 'ctx1\nctx2\nctx3\nnew-line\nctx4\nctx5\nctx6'
      const result = computeDiffLines({ old_string, new_string })
      const types = result.map((l) => l.type)
      expect(types).toContain('remove')
      expect(types).toContain('add')
      expect(types).toContain('context')
      const removeIdx = result.findIndex((l) => l.type === 'remove')
      expect(result[removeIdx].text).toBe('old-line')
      expect(result[removeIdx + 1].type).toBe('add')
      expect(result[removeIdx + 1].text).toBe('new-line')
    })

    it('only new_string > MAX_DIFF_LINES (80) → truncation with hunk marker', () => {
      const lines = Array.from({ length: 100 }, (_, i) => `line${i}`)
      const result = computeDiffLines({ new_string: lines.join('\n') })
      expect(result).toHaveLength(81) // 80 visible + 1 hunk
      expect(result[80].type).toBe('hunk')
      expect(result[80].text).toBe('(20 more lines)')
    })

    it('only old_string > MAX_DIFF_LINES (80) → truncation with hunk marker', () => {
      const lines = Array.from({ length: 100 }, (_, i) => `line${i}`)
      const result = computeDiffLines({ old_string: lines.join('\n') })
      expect(result).toHaveLength(81)
      expect(result[80].type).toBe('hunk')
      expect(result[80].text).toBe('(20 more lines)')
    })

    it('large diff both sides > MAX_DIFF_LINES → truncation', () => {
      // 50 unique old + 50 unique new = 100 diff lines > MAX_DIFF_LINES=80
      const oldLines = Array.from({ length: 50 }, (_, i) => `old-${i}`)
      const newLines = Array.from({ length: 50 }, (_, i) => `new-${i}`)
      const result = computeDiffLines({
        old_string: oldLines.join('\n'),
        new_string: newLines.join('\n'),
      })
      expect(result).toHaveLength(81)
      expect(result[80].type).toBe('hunk')
      expect(result[80].text).toBe('(20 more lines)')
    })

    it('LCS fallback when m*n > 100_000 → all old as remove first, then adds', () => {
      // 350 old × 300 new = 105 000 > 100 000 → triggers early-return fallback
      const oldLines = Array.from({ length: 350 }, (_, i) => `old-${i}`)
      const newLines = Array.from({ length: 300 }, (_, i) => `new-${i}`)
      const result = computeDiffLines({
        old_string: oldLines.join('\n'),
        new_string: newLines.join('\n'),
      })
      // Fallback: all old removes come first → first 80 entries are removes
      expect(result[0].type).toBe('remove')
      expect(result[0].text).toBe('old-0')
      expect(result[79].type).toBe('remove')
      // Entry 80 is the hunk truncation marker
      expect(result[80].type).toBe('hunk')
    })

    it('char-level highlight applied on consecutive remove+add pair', () => {
      // Similar lines differing only in one word → ratio ≥ 0.3 → parts populated on add line
      const result = computeDiffLines({
        old_string: 'hello world',
        new_string: 'hello earth',
      })
      const addLine = result.find((l) => l.type === 'add')
      expect(addLine).toBeDefined()
      expect(Array.isArray(addLine!.parts)).toBe(true)
      expect(addLine!.parts!.length).toBeGreaterThan(0)
    })

    it('ratio < 0.3 → no char highlight (computeCharDiff returns null)', () => {
      // Completely different strings → lcsLength = 0, ratio = 0 → no parts
      const result = computeDiffLines({
        old_string: 'aaaaaaaaaa',
        new_string: 'bbbbbbbbbb',
      })
      const addLine = result.find((l) => l.type === 'add')
      expect(addLine).toBeDefined()
      expect(addLine!.parts).toBeUndefined()
    })
  })

  // ---------------------------------------------------------------------------
  // withContext — tested indirectly via computeDiffLines
  // ---------------------------------------------------------------------------
  describe('withContext (indirect)', () => {
    it('context window: only 3 lines around each change are included', () => {
      // 10-line file, change at index 5
      const old_string = Array.from({ length: 10 }, (_, i) => `line-${i}`).join('\n')
      const new_string = old_string.replace('line-5', 'changed-5')
      const result = computeDiffLines({ old_string, new_string })
      const texts = result.map((l) => l.text)
      // ctx lines 2,3,4 (before) and 6,7,8 (after) should be present
      expect(texts).toContain('line-2')
      expect(texts).toContain('line-3')
      expect(texts).toContain('line-4')
      expect(texts).toContain('line-6')
      expect(texts).toContain('line-7')
      expect(texts).toContain('line-8')
      // Lines 0 and 1 are too far from the change → excluded
      expect(texts).not.toContain('line-0')
      expect(texts).not.toContain('line-1')
      // Line 9 is also too far
      expect(texts).not.toContain('line-9')
    })

    it('hunk separator ("...") inserted between non-adjacent change groups', () => {
      // Changes at index 0 and index 15 — more than 3+3 lines apart → hunk between them
      const oldLines = Array.from({ length: 20 }, (_, i) => `line-${i}`)
      const newLines = [...oldLines]
      newLines[0] = 'changed-0'
      newLines[15] = 'changed-15'
      const result = computeDiffLines({
        old_string: oldLines.join('\n'),
        new_string: newLines.join('\n'),
      })
      const hunkLines = result.filter((l) => l.type === 'hunk')
      expect(hunkLines.length).toBeGreaterThanOrEqual(1)
      expect(hunkLines[0].text).toBe('...')
    })
  })

  // ---------------------------------------------------------------------------
  // computeWriteLines
  // ---------------------------------------------------------------------------
  describe('computeWriteLines', () => {
    it('empty content → []', () => {
      expect(computeWriteLines({})).toEqual([])
      expect(computeWriteLines({ content: '' })).toEqual([])
    })

    it('normal content → all lines as add type with + prefix', () => {
      const result = computeWriteLines({ content: 'line1\nline2\nline3' })
      expect(result).toHaveLength(3)
      expect(result.every((l) => l.type === 'add')).toBe(true)
      expect(result.every((l) => l.prefix === '+')).toBe(true)
    })

    it('correct idx, text and type per line', () => {
      const result = computeWriteLines({ content: 'a\nb\nc' })
      expect(result[0]).toMatchObject({ idx: 0, type: 'add', prefix: '+', text: 'a' })
      expect(result[1]).toMatchObject({ idx: 1, type: 'add', prefix: '+', text: 'b' })
      expect(result[2]).toMatchObject({ idx: 2, type: 'add', prefix: '+', text: 'c' })
    })

    it('content > 50 lines → truncation with "(N more lines)" entry', () => {
      const lines = Array.from({ length: 60 }, (_, i) => `line${i}`)
      const result = computeWriteLines({ content: lines.join('\n') })
      expect(result).toHaveLength(51) // 50 lines + 1 truncation entry
      expect(result[50].text).toBe('(10 more lines)')
    })

    it('content exactly 50 lines → no truncation', () => {
      const lines = Array.from({ length: 50 }, (_, i) => `line${i}`)
      const result = computeWriteLines({ content: lines.join('\n') })
      expect(result).toHaveLength(50)
      expect(result.every((l) => l.text !== '...')).toBe(true)
    })
  })
})
