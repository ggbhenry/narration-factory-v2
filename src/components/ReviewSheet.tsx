import { useEffect, useState } from 'react'
import { apiGet, apiPost } from '../lib/api.js'
import { AudioPlayer } from './AudioPlayer.js'
import { StatusBadge } from './StatusBadge.js'
import { VersionHistory } from './VersionHistory.js'
import { EditNarrationSheet } from './EditNarrationSheet.js'
import { ConfirmDialog } from './ConfirmDialog.js'
import { useToast } from './Toast.js'
import type { CopyRecord, NarrationVersion, VoicePreset } from '../types/index.js'

interface ReviewSheetProps {
  copy: CopyRecord
  presets: VoicePreset[]
  initialTab?: 'review' | 'history'
  onClose: () => void
  onChanged: () => void
}

type PendingConfirm =
  | { kind: 'delete-selected'; count: number }
  | { kind: 'clear-history' }
  | { kind: 'delete-one'; versionId: string }
  | null

export function ReviewSheet({ copy: initialCopy, presets, initialTab = 'review', onClose, onChanged }: ReviewSheetProps) {
  const { showToast } = useToast()
  const [copy, setCopy] = useState<CopyRecord>(initialCopy)
  const [versions, setVersions] = useState<NarrationVersion[]>([])
  const [loadingVersions, setLoadingVersions] = useState(true)
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [confirm, setConfirm] = useState<PendingConfirm>(null)

  async function loadVersions(preferVersionId?: string | null) {
    setLoadingVersions(true)
    try {
      const data = await apiGet<{ versions: NarrationVersion[] }>(
        `list-versions?copy_id=${encodeURIComponent(copy.copy_id)}`,
      )
      setVersions(data.versions)
      const preferred = preferVersionId ?? copy.master_version_id ?? data.versions[0]?.version_id ?? null
      setSelectedVersionId(preferred)
      setCheckedIds(new Set())
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao carregar versões.', 'error')
    } finally {
      setLoadingVersions(false)
    }
  }

  useEffect(() => {
    loadVersions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copy.copy_id])

  const selectedVersion = versions.find((v) => v.version_id === selectedVersionId) ?? null
  const allChecked = versions.length > 0 && checkedIds.size === versions.length

  function toggleCheck(versionId: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev)
      if (next.has(versionId)) next.delete(versionId)
      else next.add(versionId)
      return next
    })
  }
  function toggleCheckAll() {
    setCheckedIds(allChecked ? new Set() : new Set(versions.map((v) => v.version_id)))
  }

  async function handleApprove() {
    if (!selectedVersion) return
    setBusy(true)
    try {
      const res = await apiPost<{ copy: CopyRecord; version: NarrationVersion }>('approve', {
        copy_id: copy.copy_id,
        version_id: selectedVersion.version_id,
      })
      setCopy(res.copy)
      showToast(`${selectedVersion.version_id} aprovada como master.`, 'success')
      await loadVersions(res.version.version_id)
      onChanged()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao aprovar.', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function handleReject(andRegenerate: boolean) {
    if (!selectedVersion) return
    setBusy(true)
    try {
      const res = await apiPost<{ copy: CopyRecord; version: NarrationVersion }>('reject', {
        copy_id: copy.copy_id,
        version_id: selectedVersion.version_id,
      })
      setCopy(res.copy)
      showToast(`${selectedVersion.version_id} rejeitada.`, 'info')
      onChanged()
      if (andRegenerate) {
        const genRes = await apiPost<{ copy: CopyRecord; version: NarrationVersion }>('generate', {
          copy_id: copy.copy_id,
          preset_id: selectedVersion.preset_id,
          voice_id: selectedVersion.voice_id,
          model_id: selectedVersion.model_id,
          settings: selectedVersion.settings,
          copy_tts: selectedVersion.copy_tts,
        })
        setCopy(genRes.copy)
        showToast(`${genRes.version.version_id} gerada.`, 'success')
        await loadVersions(genRes.version.version_id)
        onChanged()
      } else {
        await loadVersions()
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao rejeitar/regerar.', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function handleMakeMaster(versionId: string) {
    setBusy(true)
    try {
      const res = await apiPost<{ copy: CopyRecord }>('make-master', { copy_id: copy.copy_id, version_id: versionId })
      setCopy(res.copy)
      showToast(`${versionId} agora é o master.`, 'success')
      await loadVersions(versionId)
      onChanged()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao tornar master.', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function doDelete(versionIds: string[] | 'all') {
    setBusy(true)
    try {
      const body =
        versionIds === 'all'
          ? { copy_id: copy.copy_id, clear_all: true }
          : { copy_id: copy.copy_id, version_ids: versionIds }
      const res = await apiPost<{ copy: CopyRecord }>('delete-versions', body)
      setCopy(res.copy)
      showToast(versionIds === 'all' ? 'Histórico limpo.' : 'Versões excluídas.', 'success')
      await loadVersions()
      onChanged()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao excluir.', 'error')
    } finally {
      setBusy(false)
      setConfirm(null)
    }
  }

  return (
    <div className="sheet-overlay" role="dialog" aria-modal="true">
      <div className="sheet sheet--full">
        <div className="sheet__header">
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar">
            ✕
          </button>
          <h2>{copy.copy_id}</h2>
          <StatusBadge status={copy.status} />
        </div>

        <div className="sheet__body">
          {initialTab === 'review' && (
            <section className="review-copy-text">
              <h3>Copy original</h3>
              <p className="readonly-block">{copy.copy_original}</p>
            </section>
          )}

          {loadingVersions && <p className="muted">Carregando versões…</p>}

          {!loadingVersions && selectedVersion && initialTab === 'review' && (
            <section>
              <h3>
                {selectedVersion.version_id}
                {selectedVersion.preset_id ? ` — ${selectedVersion.preset_id}` : ''}
              </h3>
              {selectedVersion.status === 'ERROR' ? (
                <p className="error-text">{selectedVersion.error_message ?? 'Falha ao gerar este áudio.'}</p>
              ) : (
                <AudioPlayer
                  copyId={copy.copy_id}
                  versionId={selectedVersion.version_id}
                  durationSeconds={selectedVersion.duration_seconds}
                />
              )}
              <div className="review-actions">
                <button
                  type="button"
                  className="btn btn--success"
                  disabled={busy || selectedVersion.status !== 'GENERATED'}
                  onClick={handleApprove}
                >
                  Aprovar
                </button>
                <button
                  type="button"
                  className="btn btn--danger-outline"
                  disabled={busy || selectedVersion.status !== 'GENERATED'}
                  onClick={() => handleReject(false)}
                >
                  Rejeitar
                </button>
                <button
                  type="button"
                  className="btn btn--outline btn--wide"
                  disabled={busy || selectedVersion.status !== 'GENERATED'}
                  onClick={() => handleReject(true)}
                >
                  Rejeitar e regerar
                </button>
                <button type="button" className="btn btn--secondary btn--wide" disabled={busy} onClick={() => setShowEdit(true)}>
                  Editar / Regerar
                </button>
              </div>
            </section>
          )}

          {!loadingVersions && (
            <section>
              <h3>Histórico de versões</h3>
              {versions.length > 0 && (
                <div className="history-toolbar">
                  <label className="history-toolbar__label">
                    <input type="checkbox" className="checkbox" checked={allChecked} onChange={toggleCheckAll} />
                    Selecionar todas
                  </label>
                  <button
                    type="button"
                    className="btn btn--sm btn--danger-outline"
                    disabled={busy || checkedIds.size === 0}
                    onClick={() => setConfirm({ kind: 'delete-selected', count: checkedIds.size })}
                  >
                    Excluir selecionadas
                  </button>
                  <button
                    type="button"
                    className="btn btn--sm btn--danger-outline"
                    disabled={busy}
                    onClick={() => setConfirm({ kind: 'clear-history' })}
                  >
                    Limpar histórico
                  </button>
                </div>
              )}
              <VersionHistory
                copy={copy}
                versions={versions}
                selectedVersionId={selectedVersionId}
                checkedIds={checkedIds}
                onSelect={setSelectedVersionId}
                onToggleCheck={toggleCheck}
                onMakeMaster={handleMakeMaster}
                onDeleteOne={(versionId) => setConfirm({ kind: 'delete-one', versionId })}
              />
            </section>
          )}
        </div>
      </div>

      {showEdit && (
        <EditNarrationSheet
          copy={copy}
          baseVersion={selectedVersion}
          presets={presets}
          onClose={() => setShowEdit(false)}
          onGenerated={async (updatedCopy, newVersion) => {
            setCopy(updatedCopy)
            setShowEdit(false)
            await loadVersions(newVersion.version_id)
            onChanged()
          }}
        />
      )}

      {confirm?.kind === 'delete-selected' && (
        <ConfirmDialog
          title={`Excluir ${confirm.count} ${confirm.count > 1 ? 'versões' : 'versão'}?`}
          message="Esta ação apagará permanentemente os áudios e não poderá ser desfeita."
          confirmLabel={`Excluir ${confirm.count}`}
          busy={busy}
          onConfirm={() => doDelete(Array.from(checkedIds))}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm?.kind === 'clear-history' && (
        <ConfirmDialog
          title="Limpar todo o histórico?"
          message="Todas as versões e áudios desta copy serão apagados permanentemente. A copy continua existindo e pode gerar novas narrações. A numeração não recomeça do zero."
          confirmLabel="Limpar histórico"
          busy={busy}
          onConfirm={() => doDelete('all')}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm?.kind === 'delete-one' && (
        <ConfirmDialog
          title={`Excluir ${confirm.versionId}?`}
          message="Esta versão e seu áudio serão apagados permanentemente."
          confirmLabel="Excluir"
          busy={busy}
          onConfirm={() => doDelete([confirm.versionId])}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}
