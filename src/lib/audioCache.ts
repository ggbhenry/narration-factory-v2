import { fetchAudioObjectUrl } from './api.js'

/**
 * Cache de áudio em nível de sessão.
 *
 * Objetivo: baixar o MP3 de uma versão UMA vez por sessão. Reabrir a mesma
 * versão (revisar de novo, navegar no histórico) reutiliza o mesmo Object URL,
 * ficando praticamente instantâneo — em vez de rebaixar do servidor toda vez.
 *
 * Estratégia:
 * - chave = `${copyId}::${versionId}`
 * - guarda a Promise (deduplica pedidos paralelos do mesmo áudio)
 * - LRU simples: mantém no máximo MAX_ENTRIES Object URLs vivos; ao exceder,
 *   revoga o mais antigo (libera memória do navegador).
 */

const MAX_ENTRIES = 12

interface Entry {
  key: string
  promise: Promise<string>
  url?: string
  lastUsed: number
}

const entries = new Map<string, Entry>()

function keyOf(copyId: string, versionId: string): string {
  return `${copyId}::${versionId}`
}

function evictIfNeeded() {
  while (entries.size > MAX_ENTRIES) {
    let oldestKey: string | null = null
    let oldest = Infinity
    for (const [k, e] of entries) {
      if (e.lastUsed < oldest) {
        oldest = e.lastUsed
        oldestKey = k
      }
    }
    if (!oldestKey) break
    const victim = entries.get(oldestKey)
    if (victim?.url) URL.revokeObjectURL(victim.url)
    entries.delete(oldestKey)
  }
}

/**
 * Retorna o Object URL do áudio, baixando só se ainda não estiver em cache.
 * Chamadas simultâneas para a mesma versão compartilham o mesmo download.
 */
export function getAudioUrl(copyId: string, versionId: string): Promise<string> {
  const key = keyOf(copyId, versionId)
  const existing = entries.get(key)
  if (existing) {
    existing.lastUsed = Date.now()
    return existing.promise
  }

  const entry: Entry = {
    key,
    lastUsed: Date.now(),
    promise: fetchAudioObjectUrl(copyId, versionId).then((url) => {
      const e = entries.get(key)
      if (e) e.url = url
      return url
    }),
  }
  entry.promise.catch(() => {
    // se falhar, remove do cache para permitir nova tentativa
    entries.delete(key)
  })
  entries.set(key, entry)
  evictIfNeeded()
  return entry.promise
}

/** Invalida uma versão específica (ex.: após exclusão permanente). */
export function invalidateAudio(copyId: string, versionId: string) {
  const key = keyOf(copyId, versionId)
  const e = entries.get(key)
  if (e?.url) URL.revokeObjectURL(e.url)
  entries.delete(key)
}

/** Limpa todo o cache (ex.: logout). */
export function clearAudioCache() {
  for (const e of entries.values()) {
    if (e.url) URL.revokeObjectURL(e.url)
  }
  entries.clear()
}
