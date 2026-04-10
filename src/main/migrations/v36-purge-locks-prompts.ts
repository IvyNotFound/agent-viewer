import type { MigrationDb } from '../migration-db-adapter'

/**
 * Migration v36: Purge all references to the dropped `locks` table from agent
 * prompts stored in project DBs (T1916).
 *
 * The `locks` table was dropped in migration v26, but agent system_prompt and
 * system_prompt_suffix columns still contain instructions referencing it
 * (check locks, INSERT/UPDATE locks, release locks, etc.) in all supported
 * languages.
 *
 * Uses parameterized REPLACE calls — no string concatenation needed.
 */
export function runPurgeLocksPromptsMigration(db: MigrationDb): void {
  // ── Helpers ──────────────────────────────────────────────────────────
  const repSuffix = (old: string, repl: string): void => {
    db.run(
      `UPDATE agents SET system_prompt_suffix = REPLACE(system_prompt_suffix, ?, ?) WHERE system_prompt_suffix LIKE ?`,
      [old, repl, `%${old}%`]
    )
  }
  const repPrompt = (old: string, repl: string): void => {
    db.run(
      `UPDATE agents SET system_prompt = REPLACE(system_prompt, ?, ?) WHERE system_prompt LIKE ?`,
      [old, repl, `%${old}%`]
    )
  }
  const repBoth = (old: string, repl: string): void => {
    repSuffix(old, repl)
    repPrompt(old, repl)
  }

  // ────────────────────────────────────────────────────────────────────
  // 1. Suffix — remove "check locks / INSERT OR REPLACE INTO locks" lines
  // ────────────────────────────────────────────────────────────────────
  const checkLocksLines = [
    '- Before modifying a file: check locks, INSERT OR REPLACE INTO locks',               // EN + FR
    '- Vor Dateiänderungen: Locks prüfen, INSERT OR REPLACE INTO locks ausführen',         // DE
    '- ファイル変更前: ロックを確認し、INSERT OR REPLACE INTO locks を実行',                   // JA
    '- Antes de modificar un archivo: verificar locks, INSERT OR REPLACE INTO locks',      // ES
    '- Prima di modificare un file: verificare i lock, INSERT OR REPLACE INTO locks',      // IT
    '- 파일 변경 전: 락 확인 후 INSERT OR REPLACE INTO locks 실행',                          // KO
    '- Przed zmianą pliku: sprawdzić locks, INSERT OR REPLACE INTO locks',                 // PL
    '- Innan filändringar: Kontrollera lås, kör INSERT OR REPLACE INTO locks',             // SV
    '- Antes de modificar um ficheiro: verifique locks, INSERT OR REPLACE INTO locks',     // PT
    '- Antes de modificar um arquivo: verifique locks, INSERT OR REPLACE INTO locks',      // PT-BR
    '- Ennen tiedostomuutoksia: Tarkista lukot, suorita INSERT OR REPLACE INTO locks',     // FI
    '- Перед изменением файла: проверить locks, INSERT OR REPLACE INTO locks',             // RU
    '- 修改文件前：检查锁，执行 INSERT OR REPLACE INTO locks',                                // ZH-CN
  ]
  for (const line of checkLocksLines) {
    repSuffix(line + '\n', '')
  }

  // ────────────────────────────────────────────────────────────────────
  // 2. Suffix — simplify "ending session" line: strip UPDATE locks clause
  // ────────────────────────────────────────────────────────────────────
  repSuffix(
    'UPDATE locks SET released_at=CURRENT_TIMESTAMP WHERE agent_id=:agent_id AND session_id=:session_id AND released_at IS NULL + UPDATE sessions',
    'UPDATE sessions'
  )
  // Scoped suffix variant
  repSuffix('release locks + UPDATE sessions', 'UPDATE sessions')

  // ────────────────────────────────────────────────────────────────────
  // 3. Both — remove ", <locks-word>" from context injection lines
  // ────────────────────────────────────────────────────────────────────
  const contextPairs: [string, string][] = [
    ['tasks, locks)', 'tasks)'],
    ['tâches, locks)', 'tâches)'],
    ['Aufgaben, Locks)', 'Aufgaben)'],
    ['タスク, ロック)', 'タスク)'],
    ['tareas, locks)', 'tareas)'],
    ['attività, lock)', 'attività)'],
    ['작업, 락)', '작업)'],
    ['zadania, locks)', 'zadania)'],
    ['uppgifter, lås)', 'uppgifter)'],
    ['tarefas, locks)', 'tarefas)'],
    ['tehtävät, lukot)', 'tehtävät)'],
    ['задачи, locks)', 'задачи)'],
    ['任务, 锁)', '任务)'],
  ]
  for (const [old, repl] of contextPairs) {
    repBoth(old, repl)
  }

  // ────────────────────────────────────────────────────────────────────
  // 4. Prompt — remove "lock files in DB" from dev agents (full line with SQL)
  // ────────────────────────────────────────────────────────────────────
  const lockFilesFullLines = [
    '- Lock files in project.db before any modification: INSERT OR REPLACE INTO locks (file, agent_id, session_id) VALUES (?, ?, ?)',
    '- Locker les fichiers dans project.db avant toute modification : INSERT OR REPLACE INTO locks (file, agent_id, session_id) VALUES (?, ?, ?)',
    '- Dateien in project.db sperren vor jeder Änderung: INSERT OR REPLACE INTO locks (file, agent_id, session_id) VALUES (?, ?, ?)',
    '- ファイル変更前に project.db でロック: INSERT OR REPLACE INTO locks (file, agent_id, session_id) VALUES (?, ?, ?)',
    '- Bloquear archivos en project.db antes de cualquier modificación: INSERT OR REPLACE INTO locks (file, agent_id, session_id) VALUES (?, ?, ?)',
    '- Bloccare i file in project.db prima di qualsiasi modifica: INSERT OR REPLACE INTO locks (file, agent_id, session_id) VALUES (?, ?, ?)',
    '- 파일 변경 전 project.db에 락 설정: INSERT OR REPLACE INTO locks (file, agent_id, session_id) VALUES (?, ?, ?)',
    '- Zablokuj pliki w project.db przed każdą zmianą: INSERT OR REPLACE INTO locks (file, agent_id, session_id) VALUES (?, ?, ?)',
    '- Lås filer i project.db innan varje ändring: INSERT OR REPLACE INTO locks (file, agent_id, session_id) VALUES (?, ?, ?)',
    '- Bloquear ficheiros no project.db antes de qualquer modificação: INSERT OR REPLACE INTO locks (file, agent_id, session_id) VALUES (?, ?, ?)',
    '- Bloquear arquivos no project.db antes de qualquer modificação: INSERT OR REPLACE INTO locks (file, agent_id, session_id) VALUES (?, ?, ?)',
    '- Lukitse tiedostot project.db:ssä ennen jokaista muutosta: INSERT OR REPLACE INTO locks (file, agent_id, session_id) VALUES (?, ?, ?)',
    '- Заблокировать файлы в project.db перед любым изменением: INSERT OR REPLACE INTO locks (file, agent_id, session_id) VALUES (?, ?, ?)',
    '- 修改文件前在 project.db 中加锁：INSERT OR REPLACE INTO locks (file, agent_id, session_id) VALUES (?, ?, ?)',
  ]
  for (const line of lockFilesFullLines) {
    repPrompt(line + '\n', '')
  }

  // ────────────────────────────────────────────────────────────────────
  // 5. Prompt — remove "lock files" short line from doc agents (no SQL)
  // ────────────────────────────────────────────────────────────────────
  const lockFilesShortLines = [
    '- Lock files in project.db before any modification',
    '- Locker les fichiers dans project.db avant toute modification',
    '- Dateien in project.db sperren vor jeder Änderung',
    '- ファイル変更前に project.db でロック',
    '- Bloquear archivos en project.db antes de cualquier modificación',
    '- Bloccare i file in project.db prima di qualsiasi modifica',
    '- 파일 변경 전 project.db에 락 설정',
    '- Zablokuj pliki w project.db przed każdą zmianą',
    '- Lås filer i project.db innan varje ändring',
    '- Bloquear ficheiros no project.db antes de qualquer modificação',
    '- Bloquear arquivos no project.db antes de qualquer modificação',
    '- Lukitse tiedostot project.db:ssä ennen jokaista muutosta',
    '- Заблокировать файлы в project.db перед любым изменением',
    '- 修改文件前在 project.db 中加锁',
  ]
  for (const line of lockFilesShortLines) {
    repPrompt(line + '\n', '')
  }

  // ────────────────────────────────────────────────────────────────────
  // 6. Prompt — remove "Locks released" checklist items (all langs)
  // ────────────────────────────────────────────────────────────────────
  const locksReleasedLines = [
    '- [ ] Locks released',
    '- [ ] Locks libérés',
    '- [ ] Locks freigegeben',
    '- [ ] ロック解放済み',
    '- [ ] Locks liberados',
    '- [ ] Lock rilasciati',
    '- [ ] 락 해제 완료',
    '- [ ] Locks zwolnione',
    '- [ ] Lås frigjorda',
    '- [ ] Locks libertados',
    '- [ ] Lukot vapautettu',
    '- [ ] Locks освобождены',
    '- [ ] 已释放锁',
  ]
  for (const line of locksReleasedLines) {
    repPrompt(line + '\n', '')
  }

  // ────────────────────────────────────────────────────────────────────
  // 7. Prompt — KanbAgent-specific patterns (agents-default.ts)
  // ────────────────────────────────────────────────────────────────────
  repPrompt(
    '- Vérifier que les locks ont été libérés et que la DB est cohérente\n',
    ''
  )
  repPrompt('locks libérés, sessions closes', 'sessions closes')
  repPrompt(
    'lock fichiers avant modification, commentaire de sortie obligatoire, libérer les locks',
    'commentaire de sortie obligatoire'
  )
}
