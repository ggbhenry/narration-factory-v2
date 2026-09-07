import { useState } from 'react'
import { usePresets } from '../hooks/usePresets.js'
import { apiPost } from '../lib/api.js'
import { PresetCard } from '../components/PresetCard.js'
import { PresetEditor } from '../components/PresetEditor.js'
import { ConfirmDialog } from '../components/ConfirmDialog.js'
import { useToast } from '../components/Toast.js'
import type { VoicePreset } from '../types/index.js'

export function PresetsPage() {
  const { presets, loading, error, refresh } = usePresets()
  const { showToast } = useToast()
  const [editing, setEditing] = useState<Partial<VoicePreset> | null | 'new'>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [confirmDelete, setConfirmDelete] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)

  const allSelected = presets.length > 0 && selectedIds.size === presets.length

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function toggleSelectAll() {
    setSelectedIds(allSelected ? new Set() : new Set(presets.map((p) => p.id)))
  }

  function handleDuplicate(preset: VoicePreset) {
    const { id, created_at, updated_at, ...rest } = preset
    void id
    void created_at
    void updated_at
    setEditing({ ...rest, name: `${preset.name} (cópia)` })
  }

  async function doDelete(ids: string[]) {
    setBusy(true)
    try {
      await apiPost('delete-preset', { ids })
      showToast(`${ids.length} preset(s) excluído(s).`, 'success')
      setSelectedIds(new Set())
      setConfirmDelete(null)
      await refresh()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao excluir preset.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="presets-page">
      <div className="page-title-row">
        <h1 className="page-title">Presets</h1>
        <button type="button" className="btn btn--primary btn--sm" onClick={() => setEditing('new')}>
          Novo preset
        </button>
      </div>

      {loading && (
        <>
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
        </>
      )}
      {error && <p className="error-text">{error}</p>}

      {!loading && presets.length === 0 && (
        <div className="empty-state">
          <div className="empty-state__icon" aria-hidden>🎚️</div>
          <p>Nenhum preset cadastrado. Crie o primeiro para poder gerar narrações.</p>
          <button type="button" className="btn btn--primary" onClick={() => setEditing('new')}>
            Novo preset
          </button>
        </div>
      )}

      {!loading && presets.length > 0 && (
        <div className="list-controls">
          <label className="list-controls__label">
            <input type="checkbox" className="checkbox" checked={allSelected} onChange={toggleSelectAll} />
            Selecionar todos
          </label>
          {selectedIds.size > 0 && (
            <button
              type="button"
              className="btn btn--sm btn--danger-outline"
              onClick={() => setConfirmDelete(Array.from(selectedIds))}
            >
              Excluir selecionados ({selectedIds.size})
            </button>
          )}
        </div>
      )}

      <div className="preset-list">
        {presets.map((preset) => (
          <PresetCard
            key={preset.id}
            preset={preset}
            selected={selectedIds.has(preset.id)}
            onToggleSelect={() => toggleSelect(preset.id)}
            onEdit={() => setEditing(preset)}
            onDuplicate={() => handleDuplicate(preset)}
            onDelete={() => setConfirmDelete([preset.id])}
          />
        ))}
      </div>

      {editing !== null && (
        <PresetEditor
          preset={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            refresh()
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title={`Excluir ${confirmDelete.length} preset${confirmDelete.length > 1 ? 's' : ''}?`}
          message="Copies que usam esses presets ficarão sem preset e precisarão de um novo antes de gerar. Versões já geradas não são afetadas (cada uma guarda seu próprio snapshot)."
          confirmLabel={`Excluir ${confirmDelete.length}`}
          busy={busy}
          onConfirm={() => doDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}
