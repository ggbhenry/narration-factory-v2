import { useMemo, useState } from 'react'
import { useCopies } from '../hooks/useCopies.js'
import { usePresets } from '../hooks/usePresets.js'
import { apiPost } from '../lib/api.js'
import { runGenerationQueue } from '../lib/generationQueue.js'
import type { CopyJobStatus } from '../lib/generationQueue.js'
import { BatchToolbar } from '../components/BatchToolbar.js'
import { CopyCard } from '../components/CopyCard.js'
import { ImportCopiesSheet } from '../components/ImportCopiesSheet.js'
import { QueueProgress } from '../components/QueueProgress.js'
import { ReviewSheet } from '../components/ReviewSheet.js'
import { EditNarrationSheet } from '../components/EditNarrationSheet.js'
import { ConfirmDialog } from '../components/ConfirmDialog.js'
import { AssignPresetSheet } from '../components/AssignPresetSheet.js'
import { useToast } from '../components/Toast.js'
import type { CopyRecord, NarrationVersion } from '../types/index.js'

const GENERATABLE = new Set<CopyRecord['status']>(['IMPORTED', 'ERROR'])

type PendingConfirm =
  | { kind: 'delete-copies'; ids: string[] }
  | { kind: 'remove-audio'; ids: string[] }
  | null

export function NarrationsPage() {
  const {
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
  } = useCopies()
  const { presets } = usePresets()
  const { showToast } = useToast()

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [importOpen, setImportOpen] = useState(false)
  const [reviewCopyId, setReviewCopyId] = useState<string | null>(null)
  const [reviewTab, setReviewTab] = useState<'review' | 'history'>('review')
  const [editCopyId, setEditCopyId] = useState<string | null>(null)
  const [assignOpen, setAssignOpen] = useState(false)
  const [confirm, setConfirm] = useState<PendingConfirm>(null)

  const [queueOpen, setQueueOpen] = useState(false)
  const [queueBusy, setQueueBusy] = useState(false)
  const [queueStatuses, setQueueStatuses] = useState<Record<string, CopyJobStatus>>({})
  const [queueErrors, setQueueErrors] = useState<Record<string, string>>({})

  const counts = useMemo(() => {
    const c = { total: copies.length, fila: 0, gerando: 0, revisar: 0, aprovadas: 0, erros: 0 }
    for (const copy of copies) {
      if (copy.status === 'QUEUED') c.fila++
      else if (copy.status === 'GENERATING') c.gerando++
      else if (copy.status === 'READY_FOR_REVIEW') c.revisar++
      else if (copy.status === 'READY_FOR_EDITING') c.aprovadas++
      else if (copy.status === 'ERROR') c.erros++
    }
    return c
  }, [copies])

  const generatableCount = useMemo(
    () => copies.filter((c) => GENERATABLE.has(c.status) && c.selected_preset_id).length,
    [copies],
  )

  const allSelected = copies.length > 0 && selectedIds.size === copies.length

  function toggleSelect(copyId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(copyId)) next.delete(copyId)
      else next.add(copyId)
      return next
    })
  }
  function toggleSelectAll() {
    setSelectedIds(allSelected ? new Set() : new Set(copies.map((c) => c.copy_id)))
  }
  function clearSelection() {
    setSelectedIds(new Set())
  }

  async function runBatch(targetCopies: CopyRecord[]) {
    const eligible = targetCopies.filter((c) => c.selected_preset_id)
    const noPreset = targetCopies.filter((c) => !c.selected_preset_id)
    if (noPreset.length > 0) {
      showToast(`${noPreset.length} copy(ies) sem preset selecionado foram ignoradas.`, 'error')
    }
    if (eligible.length === 0) {
      showToast('Nenhuma copy com preset selecionado para gerar.', 'error')
      return
    }

    const jobsByCopy = new Map<string, string[]>()
    for (const copy of eligible) {
      jobsByCopy.set(copy.copy_id, [copy.selected_preset_id as string])
    }

    setQueueStatuses((prev) => {
      const next = { ...prev }
      eligible.forEach((c) => (next[c.copy_id] = 'queued'))
      return next
    })
    setQueueErrors((prev) => {
      const next = { ...prev }
      eligible.forEach((c) => delete next[c.copy_id])
      return next
    })
    setQueueOpen(true)
    setQueueBusy(true)

    await runGenerationQueue({
      jobsByCopy,
      concurrency: 3,
      onCopyStatus: (copyId, status, errorMessage) => {
        setQueueStatuses((prev) => ({ ...prev, [copyId]: status }))
        // Feedback imediato no card: reflete o estado da fila no status da copy.
        if (status === 'generating') patchCopy(copyId, { status: 'GENERATING' })
        if (status === 'error') {
          patchCopy(copyId, { status: 'ERROR' })
          if (errorMessage) setQueueErrors((prev) => ({ ...prev, [copyId]: errorMessage }))
        }
      },
      generateOne: async (copyId, presetId) => {
        // Atualiza só a copy envolvida assim que a ElevenLabs responde —
        // a nova versão aparece na hora, sem reler a lista toda.
        const res = await apiPost<{ copy: CopyRecord; version: NarrationVersion }>('generate', {
          copy_id: copyId,
          preset_id: presetId || null,
        })
        replaceCopy(res.copy)
        setLatestVersion(res.copy.copy_id, res.version)
      },
    })

    setQueueBusy(false)
  }

  function handleGenerateSelected() {
    const targets = copies.filter((c) => selectedIds.has(c.copy_id) && GENERATABLE.has(c.status))
    runBatch(targets)
  }

  function handleGenerateAll() {
    const targets = copies.filter((c) => GENERATABLE.has(c.status))
    runBatch(targets)
  }

  function handleCardOpen(copy: CopyRecord) {
    const hasReviewable = copy.status === 'READY_FOR_REVIEW' || copy.status === 'READY_FOR_EDITING'
    if (hasReviewable) {
      setReviewTab('review')
      setReviewCopyId(copy.copy_id)
    } else {
      runBatch([copy])
    }
  }

  async function handleSelectPreset(copyId: string, presetId: string | null) {
    // Atualização otimista: muda na tela imediatamente, persiste em background.
    const previous = patchCopy(copyId, { selected_preset_id: presetId })
    try {
      await apiPost('select-preset', { copy_id: copyId, preset_id: presetId })
    } catch (err) {
      if (previous) restoreCopy(previous)
      showToast(err instanceof Error ? err.message : 'Erro ao selecionar preset.', 'error')
    }
  }

  async function handleAssignPreset(presetId: string) {
    const ids = Array.from(selectedIds)
    // Otimista: aplica em memória a todas as selecionadas de uma vez.
    const backups = new Map<string, CopyRecord>()
    for (const id of ids) {
      const prev = patchCopy(id, { selected_preset_id: presetId })
      if (prev) backups.set(id, prev)
    }
    setAssignOpen(false)
    showToast('Preset aplicado às copies selecionadas.', 'success')
    try {
      await apiPost('assign-preset', { copy_ids: ids, preset_id: presetId })
    } catch (err) {
      backups.forEach((c) => restoreCopy(c))
      showToast(err instanceof Error ? err.message : 'Erro ao aplicar preset.', 'error')
    }
  }

  async function doRemoveAudio(ids: string[]) {
    const backups = new Map<string, CopyRecord>()
    for (const id of ids) {
      const prev = patchCopy(id, { status: 'IMPORTED', master_version_id: null })
      if (prev) backups.set(id, prev)
    }
    setConfirm(null)
    showToast('Áudio removido da área principal (histórico preservado).', 'success')
    try {
      for (const id of ids) {
        await apiPost('remove-audio', { copy_id: id })
      }
    } catch (err) {
      backups.forEach((c) => restoreCopy(c))
      showToast(err instanceof Error ? err.message : 'Erro ao remover áudio.', 'error')
    }
  }

  async function doDeleteCopies(ids: string[]) {
    // Otimista: some da tela na hora.
    const backups = copies.filter((c) => ids.includes(c.copy_id))
    removeCopies(ids)
    clearSelection()
    setConfirm(null)
    showToast(`${ids.length} copy(ies) movida(s) para a lixeira.`, 'success')
    try {
      await apiPost('delete-copies', { copy_ids: ids })
    } catch (err) {
      addCopies(backups)
      showToast(err instanceof Error ? err.message : 'Erro ao excluir copies.', 'error')
    }
  }

  const reviewCopy = copies.find((c) => c.copy_id === reviewCopyId) ?? null
  const editCopy = copies.find((c) => c.copy_id === editCopyId) ?? null

  return (
    <div className="narrations-page">
      <div className="page-title-row">
        <h1 className="page-title">Narrações</h1>
        <button type="button" className="btn btn--primary btn--sm" onClick={() => setImportOpen(true)}>
          Importar
        </button>
      </div>

      <div className="stat-strip">
        <Stat label="Total" value={counts.total} />
        <Stat label="Na fila" value={counts.fila} />
        <Stat label="Gerando" value={counts.gerando} tone={counts.gerando > 0 ? 'accent' : undefined} />
        <Stat label="Revisar" value={counts.revisar} tone="accent" />
        <Stat label="Aprovadas" value={counts.aprovadas} tone="success" />
        <Stat label="Erros" value={counts.erros} tone={counts.erros > 0 ? 'error' : undefined} />
      </div>

      {!loading && copies.length > 0 && (
        <div className="action-row">
          <button type="button" className="btn btn--secondary" onClick={() => setImportOpen(true)}>
            Importar copies
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={queueBusy || generatableCount === 0}
            onClick={handleGenerateAll}
          >
            Gerar todas{generatableCount > 0 ? ` (${generatableCount})` : ''}
          </button>
        </div>
      )}

      {loading && (
        <>
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
        </>
      )}
      {error && <p className="error-text">{error}</p>}

      {!loading && copies.length === 0 && (
        <div className="empty-state">
          <div className="empty-state__icon" aria-hidden>🎙️</div>
          <p>Nenhuma copy importada ainda.</p>
          <button type="button" className="btn btn--primary" onClick={() => setImportOpen(true)}>
            Importar copies
          </button>
        </div>
      )}

      {!loading && copies.length > 0 && (
        <div className="list-controls">
          <label className="list-controls__label">
            <input type="checkbox" className="checkbox" checked={allSelected} onChange={toggleSelectAll} />
            Selecionar todos
          </label>
        </div>
      )}

      <div className="copy-list">
        {copies.map((copy) => (
          <CopyCard
            key={copy.copy_id}
            copy={copy}
            latestVersion={latestVersions[copy.copy_id] ?? null}
            presets={presets}
            selected={selectedIds.has(copy.copy_id)}
            onToggleSelect={() => toggleSelect(copy.copy_id)}
            onOpen={() => handleCardOpen(copy)}
            onSelectPreset={(presetId) => handleSelectPreset(copy.copy_id, presetId)}
            onEdit={() => setEditCopyId(copy.copy_id)}
            onHistory={() => {
              setReviewTab('history')
              setReviewCopyId(copy.copy_id)
            }}
            onRemoveAudio={() => setConfirm({ kind: 'remove-audio', ids: [copy.copy_id] })}
            onDelete={() => setConfirm({ kind: 'delete-copies', ids: [copy.copy_id] })}
            queueStatus={queueStatuses[copy.copy_id]}
          />
        ))}
      </div>

      <BatchToolbar
        selectedCount={selectedIds.size}
        busy={queueBusy}
        onGenerate={handleGenerateSelected}
        onAssignPreset={() => setAssignOpen(true)}
        onRemoveAudio={() => setConfirm({ kind: 'remove-audio', ids: Array.from(selectedIds) })}
        onDelete={() => setConfirm({ kind: 'delete-copies', ids: Array.from(selectedIds) })}
        onClear={clearSelection}
      />

      {importOpen && (
        <ImportCopiesSheet
          presets={presets}
          onClose={() => setImportOpen(false)}
          onImported={(imported) => addCopies(imported)}
        />
      )}

      {queueOpen && (
        <QueueProgress
          statuses={queueStatuses}
          errors={queueErrors}
          onClose={() => setQueueOpen(false)}
          onRetry={(copyId) => {
            const copy = copies.find((c) => c.copy_id === copyId)
            if (copy) runBatch([copy])
          }}
        />
      )}

      {reviewCopy && (
        <ReviewSheet
          copy={reviewCopy}
          presets={presets}
          initialTab={reviewTab}
          onClose={() => setReviewCopyId(null)}
          onChanged={(updated) => {
            if (updated) replaceCopy(updated)
            else refresh()
          }}
        />
      )}

      {editCopy && (
        <EditNarrationSheet
          copy={editCopy}
          baseVersion={null}
          presets={presets}
          onClose={() => setEditCopyId(null)}
          onGenerated={async () => {
            setEditCopyId(null)
            await refresh()
          }}
        />
      )}

      {assignOpen && (
        <AssignPresetSheet
          presets={presets}
          count={selectedIds.size}
          
          onClose={() => setAssignOpen(false)}
          onApply={handleAssignPreset}
        />
      )}

      {confirm?.kind === 'delete-copies' && (
        <ConfirmDialog
          title={`Excluir ${confirm.ids.length} copy${confirm.ids.length > 1 ? 'ies' : ''}?`}
          message="A copy vai para a Lixeira com todas as suas versões e áudios. Você pode restaurar depois. A exclusão definitiva é feita dentro da Lixeira."
          confirmLabel={`Excluir ${confirm.ids.length}`}
          
          onConfirm={() => doDeleteCopies(confirm.ids)}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm?.kind === 'remove-audio' && (
        <ConfirmDialog
          title={`Remover áudio de ${confirm.ids.length} copy${confirm.ids.length > 1 ? 'ies' : ''}?`}
          message="A copy sai da área operacional, mas o histórico de versões e os áudios continuam preservados. Você pode gerar novamente depois."
          confirmLabel="Remover áudio"
          danger={false}
          
          onConfirm={() => doRemoveAudio(confirm.ids)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'accent' | 'error' | 'success' }) {
  const cls = tone && (tone !== 'error' || value > 0) ? ` stat-chip--${tone}` : ''
  return (
    <div className={`stat-chip${cls}`}>
      <span className="stat-chip__value">{value}</span>
      <span className="stat-chip__label">{label}</span>
    </div>
  )
}
