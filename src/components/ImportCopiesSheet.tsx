import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { apiPost } from '../lib/api.js'
import { parseCopiesText } from '../lib/parseCopies.js'
import { useToast } from './Toast.js'
import type { CopyRecord, ImportCopiesResponse, VoicePreset } from '../types/index.js'

interface ImportCopiesSheetProps {
  presets: VoicePreset[]
  onClose: () => void
  onImported: (copies: CopyRecord[]) => void
}

export function ImportCopiesSheet({ presets, onClose, onImported }: ImportCopiesSheetProps) {
  const { showToast } = useToast()
  const [rawText, setRawText] = useState('')
  const [busy, setBusy] = useState(false)
  const [applyPreset, setApplyPreset] = useState(true)
  const [presetId, setPresetId] = useState<string>(presets[0]?.id ?? '')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const { blocks, errors } = parseCopiesText(rawText)

  function handleFilePicked(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setRawText(String(reader.result ?? ''))
    reader.readAsText(file, 'utf-8')
  }

  async function handleImport() {
    if (blocks.length === 0) {
      showToast('Nenhuma copy válida para importar.', 'error')
      return
    }
    setBusy(true)
    try {
      const res = await apiPost<ImportCopiesResponse>('import-copies', {
        raw_text: rawText,
        apply_preset_id: applyPreset && presetId ? presetId : null,
      })
      const importedCount = res.imported.length
      const skippedCount = res.skipped.length
      if (importedCount > 0) {
        // Insere as copies direto no estado do pai (sem recarregar tudo).
        onImported(res.imported)
        showToast(
          `${importedCount} copy(ies) importada(s).${skippedCount > 0 ? ` ${skippedCount} ignorada(s).` : ''}`,
          'success',
        )
        onClose()
      } else {
        showToast(`Nenhuma copy foi importada. ${res.skipped.map((s) => s.reason).join(' ')}`, 'error')
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao importar copies.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sheet-overlay" role="dialog" aria-modal="true">
      <div className="sheet sheet--full">
        <div className="sheet__header">
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar">
            ✕
          </button>
          <h2>Importar copies</h2>
        </div>

        <div className="sheet__body">
          <section>
            <label className="field">
              <span>Arquivo .txt</span>
              <input ref={fileInputRef} type="file" accept=".txt,text/plain" onChange={handleFilePicked} />
            </label>

            <label className="field">
              <span>Ou cole o texto diretamente</span>
              <textarea
                className="textarea"
                rows={9}
                placeholder={'=== COPY 009 ===\n\nTexto da copy aqui.\n\n(o PRESET no arquivo é opcional)'}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
              />
            </label>
          </section>

          {rawText.trim().length > 0 && (
            <section>
              <h3>
                {blocks.length} {blocks.length === 1 ? 'copy encontrada' : 'copies encontradas'}
              </h3>

              <div className="field">
                <span>Preset para a importação</span>
                <div className="select-wrap">
                  <select
                    className="select"
                    value={presetId}
                    onChange={(e) => setPresetId(e.target.value)}
                    disabled={presets.length === 0}
                  >
                    {presets.length === 0 && <option value="">Nenhum preset cadastrado</option>}
                    {presets.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <label className="list-controls__label" style={{ marginBottom: 14 }}>
                <input
                  type="checkbox"
                  className="checkbox"
                  checked={applyPreset && presets.length > 0}
                  disabled={presets.length === 0}
                  onChange={(e) => setApplyPreset(e.target.checked)}
                />
                Aplicar este preset às {blocks.length} copies
              </label>

              <ul className="import-preview-list">
                {blocks.map((b) => (
                  <li key={b.copy_id}>
                    <strong>{b.copy_id}</strong>
                    {applyPreset && presetId
                      ? ` — ${presets.find((p) => p.id === presetId)?.name ?? presetId}`
                      : b.presets.length > 0
                        ? ` — ${b.presets.join(' + ')}`
                        : ' — sem preset (escolha depois no card)'}
                  </li>
                ))}
              </ul>
              {errors.length > 0 && (
                <div className="import-preview-errors">
                  {errors.map((e, i) => (
                    <p key={i} className="error-text">
                      {e}
                    </p>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>

        <div className="sheet__footer">
          <button type="button" className="btn btn--secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="button" className="btn btn--primary" disabled={busy || blocks.length === 0} onClick={handleImport}>
            {busy ? 'Importando…' : `Importar ${blocks.length || ''} ${blocks.length === 1 ? 'copy' : 'copies'}`}
          </button>
        </div>
      </div>
    </div>
  )
}
