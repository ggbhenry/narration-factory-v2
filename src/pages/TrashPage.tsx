import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiGet, apiPost } from '../lib/api.js'
import { ConfirmDialog } from '../components/ConfirmDialog.js'
import { useToast } from '../components/Toast.js'

interface TrashCopy {
  type: 'copy'
  copy_id: string
  copy_original: string
  deleted_at: string
  version_count: number
}
interface TrashVersion {
  type: 'version'
  copy_id: string
  version_id: string
  preset_id: string | null
  duration_seconds: number | null
  status: string
  deleted_at: string
}
interface TrashPreset {
  type: 'preset'
  id: string
  name: string
  voice_id: string
  model_id: string
  deleted_at: string
}
interface TrashResponse {
  copies: TrashCopy[]
  versions: TrashVersion[]
  presets: TrashPreset[]
}

type Tab = 'all' | 'copies' | 'versions' | 'presets'

type PendingConfirm =
  | { kind: 'delete-selected' }
  | { kind: 'empty-all' }
  | { kind: 'empty-copies' }
  | { kind: 'empty-versions' }
  | { kind: 'empty-presets' }
  | null

function keyForCopy(id: string) {
  return `copy:${id}`
}
function keyForVersion(copyId: string, versionId: string) {
  return `version:${copyId}:${versionId}`
}
function keyForPreset(id: string) {
  return `preset:${id}`
}

function relativeDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}

export function TrashPage() {
  const { showToast } = useToast()
  const [data, setData] = useState<TrashResponse>({ copies: [], versions: [], presets: [] })
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirm, setConfirm] = useState<PendingConfirm>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiGet<TrashResponse>('list-trash')
      setData(res)
      setSelected(new Set())
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao carregar a lixeira.', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    load()
  }, [load])

  const total = data.copies.length + data.versions.length + data.presets.length

  const visibleKeys = useMemo(() => {
    const keys: string[] = []
    if (tab === 'all' || tab === 'copies') data.copies.forEach((c) => keys.push(keyForCopy(c.copy_id)))
    if (tab === 'all' || tab === 'versions')
      data.versions.forEach((v) => keys.push(keyForVersion(v.copy_id, v.version_id)))
    if (tab === 'all' || tab === 'presets') data.presets.forEach((p) => keys.push(keyForPreset(p.id)))
    return keys
  }, [tab, data])

  const allVisibleSelected = visibleKeys.length > 0 && visibleKeys.every((k) => selected.has(k))

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  function toggleAllVisible() {
    setSelected(() => (allVisibleSelected ? new Set() : new Set(visibleKeys)))
  }

  /** Converte as chaves selecionadas de volta em payloads para a API. */
  function selectionToPayload() {
    const copies: string[] = []
    const versions: { copy_id: string; version_id: string }[] = []
    const presets: string[] = []
    for (const key of selected) {
      if (key.startsWith('copy:')) copies.push(key.slice(5))
      else if (key.startsWith('version:')) {
        const [, copyId, versionId] = key.split(':')
        versions.push({ copy_id: copyId, version_id: versionId })
      } else if (key.startsWith('preset:')) presets.push(key.slice(7))
    }
    return { copies, versions, presets }
  }

  async function handleRestore() {
    if (selected.size === 0) return
    setBusy(true)
    try {
      await apiPost('restore-trash', selectionToPayload())
      showToast('Itens restaurados.', 'success')
      await load()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao restaurar.', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function handlePermanentDelete() {
    setBusy(true)
    try {
      await apiPost('empty-trash', selectionToPayload())
      showToast('Itens excluídos permanentemente.', 'success')
      setConfirm(null)
      await load()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao excluir.', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function handleEmpty(kind: 'empty-all' | 'empty-copies' | 'empty-versions' | 'empty-presets') {
    setBusy(true)
    try {
      const body: Record<string, boolean> = {}
      if (kind === 'empty-all') body.empty_all = true
      if (kind === 'empty-copies') body.empty_copies = true
      if (kind === 'empty-versions') body.empty_versions = true
      if (kind === 'empty-presets') body.empty_presets = true
      await apiPost('empty-trash', body)
      showToast('Lixeira esvaziada.', 'success')
      setConfirm(null)
      await load()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao esvaziar.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const showCopies = tab === 'all' || tab === 'copies'
  const showVersions = tab === 'all' || tab === 'versions'
  const showPresets = tab === 'all' || tab === 'presets'

  return (
    <div className="trash-page">
      <div className="page-title-row">
        <h1 className="page-title">Lixeira</h1>
        {total > 0 && (
          <button type="button" className="btn btn--danger-outline btn--sm" onClick={() => setConfirm({ kind: 'empty-all' })}>
            Esvaziar tudo
          </button>
        )}
      </div>

      <div className="trash-tabs">
        {([
          ['all', `Tudo (${total})`],
          ['copies', `Copies (${data.copies.length})`],
          ['versions', `Áudios (${data.versions.length})`],
          ['presets', `Presets (${data.presets.length})`],
        ] as [Tab, string][]).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={tab === id ? 'trash-tab trash-tab--active' : 'trash-tab'}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && (
        <>
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
        </>
      )}

      {!loading && total === 0 && (
        <div className="empty-state">
          <div className="empty-state__icon" aria-hidden>🗑️</div>
          <p>A lixeira está vazia.</p>
        </div>
      )}

      {!loading && total > 0 && (
        <>
          <div className="list-controls">
            <label className="list-controls__label">
              <input type="checkbox" className="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} />
              Selecionar todos
            </label>
            {tab === 'copies' && data.copies.length > 0 && (
              <button type="button" className="btn btn--sm btn--danger-outline" onClick={() => setConfirm({ kind: 'empty-copies' })}>
                Esvaziar copies
              </button>
            )}
            {tab === 'versions' && data.versions.length > 0 && (
              <button type="button" className="btn btn--sm btn--danger-outline" onClick={() => setConfirm({ kind: 'empty-versions' })}>
                Esvaziar áudios
              </button>
            )}
            {tab === 'presets' && data.presets.length > 0 && (
              <button type="button" className="btn btn--sm btn--danger-outline" onClick={() => setConfirm({ kind: 'empty-presets' })}>
                Esvaziar presets
              </button>
            )}
          </div>

          <div className="trash-list">
            {showCopies &&
              data.copies.map((c) => (
                <div key={keyForCopy(c.copy_id)} className="trash-item">
                  <input
                    type="checkbox"
                    className="checkbox"
                    checked={selected.has(keyForCopy(c.copy_id))}
                    onChange={() => toggle(keyForCopy(c.copy_id))}
                  />
                  <div className="trash-item__main">
                    <div className="trash-item__top">
                      <span className="badge badge--neutral">Copy</span>
                      <span className="trash-item__title">{c.copy_id}</span>
                    </div>
                    <div className="trash-item__meta">
                      {c.version_count} versão(ões) • excluída {relativeDate(c.deleted_at)}
                    </div>
                    <p className="trash-item__snippet">{c.copy_original}</p>
                  </div>
                </div>
              ))}

            {showVersions &&
              data.versions.map((v) => (
                <div key={keyForVersion(v.copy_id, v.version_id)} className="trash-item">
                  <input
                    type="checkbox"
                    className="checkbox"
                    checked={selected.has(keyForVersion(v.copy_id, v.version_id))}
                    onChange={() => toggle(keyForVersion(v.copy_id, v.version_id))}
                  />
                  <div className="trash-item__main">
                    <div className="trash-item__top">
                      <span className="badge badge--info">Áudio</span>
                      <span className="trash-item__title">
                        {v.copy_id} · {v.version_id}
                      </span>
                    </div>
                    <div className="trash-item__meta">
                      {v.preset_id ?? 'manual'}
                      {typeof v.duration_seconds === 'number' ? ` • ${v.duration_seconds.toFixed(1)}s` : ''} • excluída{' '}
                      {relativeDate(v.deleted_at)}
                    </div>
                  </div>
                </div>
              ))}

            {showPresets &&
              data.presets.map((p) => (
                <div key={keyForPreset(p.id)} className="trash-item">
                  <input
                    type="checkbox"
                    className="checkbox"
                    checked={selected.has(keyForPreset(p.id))}
                    onChange={() => toggle(keyForPreset(p.id))}
                  />
                  <div className="trash-item__main">
                    <div className="trash-item__top">
                      <span className="badge badge--warning">Preset</span>
                      <span className="trash-item__title">{p.name}</span>
                    </div>
                    <div className="trash-item__meta">
                      voice {p.voice_id || '—'} • excluído {relativeDate(p.deleted_at)}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </>
      )}

      {selected.size > 0 && (
        <div className="batch-bar">
          <span className="batch-bar__count">{selected.size} selecionado{selected.size > 1 ? 's' : ''}</span>
          <div className="batch-bar__spacer" />
          <button type="button" className="btn btn--sm btn--secondary" onClick={handleRestore} disabled={busy}>
            Restaurar
          </button>
          <button
            type="button"
            className="btn btn--sm btn--danger"
            onClick={() => setConfirm({ kind: 'delete-selected' })}
            disabled={busy}
          >
            Excluir de vez
          </button>
        </div>
      )}

      {confirm?.kind === 'delete-selected' && (
        <ConfirmDialog
          title={`Excluir ${selected.size} item(ns) permanentemente?`}
          message="Os áudios e dados serão apagados de vez do armazenamento. Não pode ser desfeito."
          confirmLabel="Excluir de vez"
          busy={busy}
          onConfirm={handlePermanentDelete}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm?.kind === 'empty-all' && (
        <ConfirmDialog
          title="Esvaziar toda a lixeira?"
          message="Tudo que está na lixeira (copies, áudios e presets) será apagado permanentemente. Não pode ser desfeito."
          confirmLabel="Esvaziar tudo"
          busy={busy}
          onConfirm={() => handleEmpty('empty-all')}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm?.kind === 'empty-copies' && (
        <ConfirmDialog
          title="Esvaziar copies da lixeira?"
          message="Todas as copies na lixeira (e suas versões/áudios) serão apagadas permanentemente."
          confirmLabel="Esvaziar copies"
          busy={busy}
          onConfirm={() => handleEmpty('empty-copies')}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm?.kind === 'empty-versions' && (
        <ConfirmDialog
          title="Esvaziar áudios da lixeira?"
          message="Todos os áudios/versões na lixeira serão apagados permanentemente."
          confirmLabel="Esvaziar áudios"
          busy={busy}
          onConfirm={() => handleEmpty('empty-versions')}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm?.kind === 'empty-presets' && (
        <ConfirmDialog
          title="Esvaziar presets da lixeira?"
          message="Todos os presets na lixeira serão apagados permanentemente."
          confirmLabel="Esvaziar presets"
          busy={busy}
          onConfirm={() => handleEmpty('empty-presets')}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}
