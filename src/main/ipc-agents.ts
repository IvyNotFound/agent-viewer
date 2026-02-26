/**
 * IPC handlers — Agent & session management
 *
 * Handles agent CRUD, session operations, prompt building, and task search.
 *
 * @module ipc-agents
 */

import { ipcMain } from 'electron'
import { readFile, writeFile, rename } from 'fs/promises'
import { join } from 'path'
import { assertDbPathAllowed, assertProjectPathAllowed, queryLive, writeDb } from './db'

// ── Constants ────────────────────────────────────────────────────────────────

const STANDARD_AGENT_SUFFIX = [
  '---',
  'AGENT PROTOCOL REMINDER (mandatory — do not override):',
  '- On startup: read input session (sessions.summary) + open tasks from project.db',
  '- Before modifying a file: check locks, then INSERT OR REPLACE INTO locks',
  "- When taking a task: UPDATE tasks SET statut='in_progress'",
  "- When finishing a task: UPDATE tasks SET statut='done' + INSERT INTO task_comments (task_id, agent_id, contenu) VALUES (?, ?, '<files changed · what was done · what remains>')",
  "- When ending session: release all locks + UPDATE sessions SET statut='completed', summary='Done:... Pending:... Next:...' (this IS the input session for next startup)",
  '- Never commit directly to main in multi-user mode',
  '- Never edit project.db manually',
].join('\n')

const SCOPED_TYPES = new Set(['dev', 'test', 'ux'])

// ── Helpers ──────────────────────────────────────────────────────────────────

interface SearchFilters {
  statut?: string
  agent_id?: number
  perimetre?: string
}

function insertAgentIntoClaudeMd(content: string, agentType: string, agentName: string, agentDescription: string): string {
  const isScoped = SCOPED_TYPES.has(agentType)
  const sectionHeader = isScoped ? '### Scopés par périmètre' : '### Globaux'
  const newRow = isScoped
    ? `| **${agentType}** | \`${agentName}\` | ${agentDescription} |`
    : `| **${agentName}** | ${agentDescription} |`

  const sectionIdx = content.indexOf(sectionHeader)
  if (sectionIdx === -1) return content

  const afterSection = content.slice(sectionIdx)
  const lines = afterSection.split('\n')
  let lastTableLineIdx = -1
  let inTable = false
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('|')) {
      inTable = true
      lastTableLineIdx = i
    } else if (inTable && lines[i].trim() === '') {
      break
    }
  }
  if (lastTableLineIdx === -1) return content
  lines.splice(lastTableLineIdx + 1, 0, newRow)
  return content.slice(0, sectionIdx) + lines.join('\n')
}

// ── Handler registration ─────────────────────────────────────────────────────

export function registerAgentHandlers(): void {
  ipcMain.handle('close-agent-sessions', async (_event, dbPath: string, agentName: string) => {
    try {
      assertDbPathAllowed(dbPath)
      await writeDb(dbPath, (db) => {
        db.run(
          `UPDATE sessions SET statut='completed', ended_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
           WHERE statut='started'
             AND agent_id=(SELECT id FROM agents WHERE name=?)`,
          [agentName]
        )
      })
      return { success: true }
    } catch (err) {
      console.error('[IPC close-agent-sessions]', err)
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('rename-agent', async (_event, dbPath: string, agentId: number, newName: string) => {
    try {
      assertDbPathAllowed(dbPath)
      await writeDb(dbPath, (db) => {
        db.run('UPDATE agents SET name = ? WHERE id = ?', [newName, agentId])
      })
      return { success: true }
    } catch (err) {
      console.error('[IPC rename-agent]', err)
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('update-perimetre', async (_event, dbPath: string, id: number, oldName: string, newName: string, description: string) => {
    try {
      assertDbPathAllowed(dbPath)
      await writeDb(dbPath, (db) => {
        db.run('UPDATE perimetres SET name = ?, description = ? WHERE id = ?', [newName, description || null, id])
        if (newName !== oldName) {
          db.run('UPDATE tasks SET perimetre = ? WHERE perimetre = ?', [newName, oldName])
          db.run('UPDATE agents SET perimetre = ? WHERE perimetre = ?', [newName, oldName])
        }
      })
      return { success: true }
    } catch (err) {
      console.error('[IPC update-perimetre]', err)
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('update-agent-system-prompt', async (_event, dbPath: string, agentId: number, systemPrompt: string) => {
    try {
      assertDbPathAllowed(dbPath)
      await writeDb(dbPath, (db) => {
        db.run('UPDATE agents SET system_prompt = ? WHERE id = ?', [systemPrompt || null, agentId])
      })
      return { success: true }
    } catch (err) {
      console.error('[IPC update-agent-system-prompt]', err)
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('build-agent-prompt', async (_event, agentName: string, userPrompt: string, dbPath?: string, agentId?: number) => {
    const HIDDEN_SUFFIX = `Tu es agent ${agentName}. Va voir ton prompt system dans la table agent.`
    const body = userPrompt && userPrompt.trim() ? `${userPrompt.trim()}\n\n` : ''
    const base = `${body}${HIDDEN_SUFFIX}`

    if (!dbPath || !agentId) return base

    try {
      const [sessionRows, taskRows] = await Promise.all([
        queryLive(
          dbPath,
          `SELECT summary FROM sessions
           WHERE agent_id = ? AND statut = 'completed' AND summary IS NOT NULL
           ORDER BY id DESC LIMIT 1`,
          [agentId]
        ) as Promise<Array<{ summary: string }>>,
        queryLive(
          dbPath,
          `SELECT id, titre, statut FROM tasks
           WHERE agent_assigne_id = ? AND statut IN ('todo','in_progress')
           ORDER BY id ASC LIMIT 5`,
          [agentId]
        ) as Promise<Array<{ id: number; titre: string; statut: string }>>
      ])

      const parts: string[] = []

      if (sessionRows.length > 0 && sessionRows[0].summary) {
        const summary = sessionRows[0].summary.slice(0, 120)
        parts.push(`Session préc.: ${summary}`)
      }

      if (taskRows.length > 0) {
        const taskList = taskRows.map(t => `#${t.id}[${t.statut}]`).join(' ')
        parts.push(`Tâches: ${taskList}`)
      }

      if (parts.length === 0) return base

      const contextPrefix = parts.join(' | ').slice(0, 300)
      return `${contextPrefix} -> ${base}`
    } catch {
      return base
    }
  })

  ipcMain.handle('session:setConvId', async (_event, dbPath: string, agentId: number, convId: string) => {
    if (!dbPath || typeof agentId !== 'number' || !convId) {
      return { success: false, error: 'Invalid arguments' }
    }
    try {
      assertDbPathAllowed(dbPath)
      await writeDb(dbPath, (db) => {
        db.run(
          `UPDATE sessions SET claude_conv_id = ?
           WHERE id = (
             SELECT id FROM sessions WHERE agent_id = ? ORDER BY id DESC LIMIT 1
           )`,
          [convId, agentId]
        )
      })
      console.log(`[IPC session:setConvId] agent=${agentId} conv_id=${convId}`)
      return { success: true }
    } catch (err) {
      console.error('[IPC session:setConvId]', err)
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('get-agent-system-prompt', async (_event, dbPath: string, agentId: number) => {
    try {
      const rows = await queryLive(
        dbPath,
        'SELECT system_prompt, system_prompt_suffix, thinking_mode FROM agents WHERE id = ?',
        [agentId]
      )
      if (rows.length === 0) {
        return { success: false, error: 'Agent not found', systemPrompt: null, systemPromptSuffix: null, thinkingMode: null }
      }
      const row = rows[0] as { system_prompt: string | null; system_prompt_suffix: string | null; thinking_mode: string | null }
      return {
        success: true,
        systemPrompt: row.system_prompt,
        systemPromptSuffix: row.system_prompt_suffix,
        thinkingMode: row.thinking_mode
      }
    } catch (err) {
      console.error('[IPC get-agent-system-prompt]', err)
      return { success: false, error: String(err), systemPrompt: null, systemPromptSuffix: null, thinkingMode: null }
    }
  })

  ipcMain.handle('update-agent-thinking-mode', async (_event, dbPath: string, agentId: number, thinkingMode: string | null) => {
    if (thinkingMode !== null && thinkingMode !== 'auto' && thinkingMode !== 'disabled') {
      return { success: false, error: `Invalid thinkingMode value: '${thinkingMode}'. Accepted: 'auto', 'disabled', null` }
    }
    try {
      assertDbPathAllowed(dbPath)
      await writeDb(dbPath, (db) => {
        db.run('UPDATE agents SET thinking_mode = ? WHERE id = ?', [thinkingMode || null, agentId])
      })
      return { success: true }
    } catch (err) {
      console.error('[IPC update-agent-thinking-mode]', err)
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('update-agent', async (_event, dbPath: string, agentId: number, updates: {
    name?: string
    type?: string
    perimetre?: string | null
    thinkingMode?: string | null
    allowedTools?: string | null
    systemPrompt?: string | null
    systemPromptSuffix?: string | null
  }) => {
    try {
      assertDbPathAllowed(dbPath)
      await writeDb(dbPath, (db) => {
        if (updates.name !== undefined) {
          db.run('UPDATE agents SET name = ? WHERE id = ?', [updates.name, agentId])
        }
        if (updates.type !== undefined) {
          db.run('UPDATE agents SET type = ? WHERE id = ?', [updates.type, agentId])
        }
        if (updates.perimetre !== undefined) {
          db.run('UPDATE agents SET perimetre = ? WHERE id = ?', [updates.perimetre || null, agentId])
        }
        if (updates.thinkingMode !== undefined) {
          db.run('UPDATE agents SET thinking_mode = ? WHERE id = ?', [updates.thinkingMode || null, agentId])
        }
        if (updates.allowedTools !== undefined) {
          db.run('UPDATE agents SET allowed_tools = ? WHERE id = ?', [updates.allowedTools || null, agentId])
        }
        if (updates.systemPrompt !== undefined) {
          db.run('UPDATE agents SET system_prompt = ? WHERE id = ?', [updates.systemPrompt || null, agentId])
        }
        if (updates.systemPromptSuffix !== undefined) {
          db.run('UPDATE agents SET system_prompt_suffix = ? WHERE id = ?', [updates.systemPromptSuffix || null, agentId])
        }
      })
      return { success: true }
    } catch (err) {
      console.error('[IPC update-agent]', err)
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('search-tasks', async (
    _event,
    dbPath: string,
    query: string,
    filters?: SearchFilters
  ) => {
    try {
      const conditions: string[] = []
      const params: unknown[] = []

      if (query && query.trim()) {
        const q = `%${query.trim()}%`
        conditions.push('(t.titre LIKE ? OR t.description LIKE ?)')
        params.push(q, q)
      }

      if (filters?.statut) {
        conditions.push('t.statut = ?')
        params.push(filters.statut)
      }
      if (filters?.agent_id) {
        conditions.push('t.agent_assigne_id = ?')
        params.push(filters.agent_id)
      }
      if (filters?.perimetre) {
        conditions.push('t.perimetre = ?')
        params.push(filters.perimetre)
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

      const sql = `
        SELECT
          t.id,
          t.titre,
          t.statut,
          t.perimetre,
          t.updated_at,
          t.description,
          SUBSTR(t.description, 1, 100) as description_excerpt,
          a.name as agent_assigne
        FROM tasks t
        LEFT JOIN agents a ON a.id = t.agent_assigne_id
        ${whereClause}
        ORDER BY t.updated_at DESC
        LIMIT 50
      `

      const rows = await queryLive(dbPath, sql, params)
      return { success: true, results: rows }
    } catch (err) {
      console.error('[IPC search-tasks]', err)
      return { success: false, error: String(err), results: [] }
    }
  })

  ipcMain.handle('create-agent', async (
    _event,
    dbPath: string,
    projectPath: string,
    data: { name: string; type: string; perimetre: string | null; thinkingMode: string | null; systemPrompt: string | null; description: string }
  ) => {
    try {
      assertDbPathAllowed(dbPath)
      assertProjectPathAllowed(projectPath)

      const agentId = await writeDb<number>(dbPath, (db) => {
        db.run(
          'INSERT INTO agents (name, type, perimetre, thinking_mode, system_prompt, system_prompt_suffix) VALUES (?, ?, ?, ?, ?, ?)',
          [data.name, data.type, data.perimetre ?? null, data.thinkingMode ?? null, data.systemPrompt ?? null, STANDARD_AGENT_SUFFIX]
        )
        const rows = db.exec('SELECT last_insert_rowid() as id')
        return rows[0].values[0][0] as number
      })

      let claudeMdUpdated = false
      try {
        const claudeMdPath = join(projectPath, 'CLAUDE.md')
        const claudeMdContent = await readFile(claudeMdPath, 'utf-8')
        const updated = insertAgentIntoClaudeMd(claudeMdContent, data.type, data.name, data.description)
        if (updated !== claudeMdContent) {
          const tmpPath = claudeMdPath + '.tmp'
          await writeFile(tmpPath, updated, 'utf-8')
          await rename(tmpPath, claudeMdPath)
          claudeMdUpdated = true
        }
      } catch (claudeErr) {
        console.warn('[IPC create-agent] CLAUDE.md update skipped:', claudeErr)
      }

      return { success: true, agentId, claudeMdUpdated }
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
        return { success: false, error: `Un agent nommé "${data.name}" existe déjà` }
      }
      console.error('[IPC create-agent]', err)
      return { success: false, error: String(err) }
    }
  })
}
