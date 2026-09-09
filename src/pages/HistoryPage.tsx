import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiGet } from '../lib/api.js'
import { usePresets } from '../hooks/usePresets.js'
import { StatusBadge } from '../components/StatusBadge.js'
import { ReviewSheet } from '../components/ReviewSheet.js'
import { useToast } from '../components/Toast.js'
import type { CopyRecord, NarrationVersion, VersionStatus } from '../types/index.js'

interface HistoryEntry {
  copy_id: string
  version_id: string
  preset_id: string | null
  status: string
  duration_seconds: number | null
  created_at: string
  is_master: boolean
}

interface HistoryResponse {
  entries: HistoryEntry[]
  preset_ids: string[]
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'Todos os status' },
  { value: 'GENERATED', label: 'Gerada' },
  { value: 'APPROVED', label: 'Aprovada' },
  { value: 'REJECTED', label: 'Rejeitada' },
  { value: 'ERROR', label: 'Erro' },
]

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso)
    const today = new Date()
    const sameDay = d.toDateString() === today.toDateString()
    const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    if (sameDay) return `Hoje ${time}`
    return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${time}`
  } catch {
    return iso
  }
}

export function HistoryPage() {
  const { presets } = usePresets()
  const { showToast } = useToast()
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [copyFilter, setCopyFilter] = useState('all')
  const [presetFilter, setPresetFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  // para abrir a revisão daquela copy/versão
  const [reviewCopy, setReviewCopy] = useState<CopyRecord | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiGet<HistoryResponse>('list-history')
      setEntries(res.entries)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao carregar o histórico.', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    load()
  }, [load])

  const copyIds = useMemo(() => Array.from(new Set(entries.map((e) => e.copy_id))).sort(), [entries])
  const presetIds = useMemo(
    () => Array.from(new Set(entries.map((e) => e.preset_id).filter((p): p is string => !!p))).sort(),
    [entries],
  )

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (copyFilter !== 'all' && e.copy_id !== copyFilter) return false
      if (presetFilter !== 'all' && e.preset_id !== presetFilter) return false
      if (statusFilter !== 'all' && e.status !== statusFilter) return false
      return true
    })
  }, [entries, copyFilter, presetFilter, statusFilter])

  function presetName(id: string | null): string {
    if (!id) return 'manual'
    return presets.find((p) => p.id === id)?.name ?? id
  }

  async function openReview(entry: HistoryEntry) {
    // busca a copy para abrir a ReviewSheet na versão certa
    try {
      const data = await apiGet<{ copies: CopyRecord[] }>('list-copies')
      const copy = data.copies.find((c) => c.copy_id === entry.copy_id)
      if (!copy) {
        showToast('Copy não encontrada (pode estar na lixeira).', 'error')
        return
      }
      setReviewCopy(copy)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao abrir revisão.', 'error')
    }
  }

  return (
    <div className="history-page">
      <div className="page-title-row">
        <h1 className="page-title">Histórico</h1>
      </div>

      <div className="history-filters">
        <div className="select-wrap">
          <select className="select" value={copyFilter} onChange={(e) => setCopyFilter(e.target.value)}>
            <option value="all">Todas as copies</option>
            {copyIds.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </div>
        <div className="select-wrap">
          <select className="select" value={presetFilter} onChange={(e) => setPresetFilter(e.target.value)}>
            <option value="all">Todos os presets</option>
            {presetIds.map((id) => (
              <option key={id} value={id}>
                {presetName(id)}
              </option>
            ))}
          </select>
        </div>
        <div className="select-wrap">
          <select className="select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && (
        <>
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
        </>
      )}

      {!loading && filtered.length === 0 && (
        <div className="empty-state">
          <div className="empty-state__icon" aria-hidden>🕑</div>
          <p>{entries.length === 0 ? 'Nenhuma geração ainda.' : 'Nenhum resultado com esses filtros.'}</p>
        </div>
      )}

      <div className="history-list">
        {filtered.map((e) => (
          <button
            key={`${e.copy_id}:${e.version_id}`}
            type="button"
            className="history-row"
            onClick={() => openReview(e)}
          >
            <div className="history-row__main">
              <div className="history-row__top">
                <span className="history-row__copy">{e.copy_id}</span>
                <span className="history-row__vid">{e.version_id}</span>
                {e.is_master && (
                  <span className="badge badge--success">
                    <span className="badge__dot" aria-hidden />
                    MASTER
                  </span>
                )}
              </div>
              <div className="history-row__meta">
                {presetName(e.preset_id)}
                {typeof e.duration_seconds === 'number' ? ` • ${e.duration_seconds.toFixed(1)}s` : ''} •{' '}
                {formatWhen(e.created_at)}
              </div>
            </div>
            <StatusBadge status={e.status as VersionStatus} />
          </button>
        ))}
      </div>

      {reviewCopy && (
        <ReviewSheet
          copy={reviewCopy}
          presets={presets}
          initialTab="review"
          onClose={() => setReviewCopy(null)}
          onChanged={() => {
            void load()
          }}
        />
      )}
    </div>
  )
}
