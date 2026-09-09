import { useCallback, useEffect, useRef, useState } from 'react'
import { apiGet } from '../lib/api.js'
import type { CopyRecord, NarrationVersion } from '../types/index.js'

interface ListCopiesResponse {
  copies: CopyRecord[]
  latest_versions: Record<string, NarrationVersion | null>
}

export function useCopies() {
  const [copies, setCopies] = useState<CopyRecord[]>([])
  const [latestVersions, setLatestVersions] = useState<Record<string, NarrationVersion | null>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const loadedOnce = useRef(false)

  const refresh = useCallback(async () => {
    setError(null)
    try {
      const data = await apiGet<ListCopiesResponse>('list-copies')
      setCopies(data.copies)
      setLatestVersions(data.latest_versions)
      loadedOnce.current = true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar copies.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  /**
   * Atualiza UMA copy em memória imediatamente (atualização otimista), sem
   * recarregar a lista inteira do servidor. Retorna o estado anterior daquela
   * copy para permitir rollback caso a persistência falhe.
   */
  const patchCopy = useCallback((copyId: string, patch: Partial<CopyRecord>): CopyRecord | undefined => {
    let previous: CopyRecord | undefined
    setCopies((prev) =>
      prev.map((c) => {
        if (c.copy_id !== copyId) return c
        previous = c
        return { ...c, ...patch }
      }),
    )
    return previous
  }, [])

  /** Reaplica um estado anterior de copy (rollback). */
  const restoreCopy = useCallback((copy: CopyRecord) => {
    setCopies((prev) => prev.map((c) => (c.copy_id === copy.copy_id ? copy : c)))
  }, [])

  /** Substitui uma copy inteira pelo registro autoritativo vindo do servidor. */
  const replaceCopy = useCallback((copy: CopyRecord) => {
    setCopies((prev) => {
      const exists = prev.some((c) => c.copy_id === copy.copy_id)
      const next = exists ? prev.map((c) => (c.copy_id === copy.copy_id ? copy : c)) : [...prev, copy]
      next.sort((a, b) => a.copy_id.localeCompare(b.copy_id, 'pt-BR', { numeric: true }))
      return next
    })
  }, [])

  /** Remove copies da lista em memória imediatamente. */
  const removeCopies = useCallback((copyIds: string[]) => {
    const idSet = new Set(copyIds)
    setCopies((prev) => prev.filter((c) => !idSet.has(c.copy_id)))
  }, [])

  /** Insere copies recém-importadas sem recarregar tudo. */
  const addCopies = useCallback((incoming: CopyRecord[]) => {
    setCopies((prev) => {
      const map = new Map(prev.map((c) => [c.copy_id, c]))
      for (const c of incoming) map.set(c.copy_id, c)
      const next = Array.from(map.values())
      next.sort((a, b) => a.copy_id.localeCompare(b.copy_id, 'pt-BR', { numeric: true }))
      return next
    })
  }, [])

  /** Atualiza a última versão conhecida de uma copy (após gerar). */
  const setLatestVersion = useCallback((copyId: string, version: NarrationVersion | null) => {
    setLatestVersions((prev) => ({ ...prev, [copyId]: version }))
  }, [])

  return {
    copies,
    latestVersions,
    loading,
    error,
    refresh,
    patchCopy,
    restoreCopy,
    replaceCopy,
    removeCopies,
    addCopies,
    setLatestVersion,
  }
}
