import { useState } from 'react'
import type { VoicePreset } from '../types/index.js'

interface AssignPresetSheetProps {
  presets: VoicePreset[]
  count: number
  onClose: () => void
  onApply: (presetId: string) => void
  busy?: boolean
}

export function AssignPresetSheet({ presets, count, onClose, onApply, busy }: AssignPresetSheetProps) {
  const [presetId, setPresetId] = useState<string>(presets[0]?.id ?? '')

  return (
    <div className="sheet-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="sheet sheet--compact" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__body">
          <h2 className="confirm-title">Aplicar preset a {count} copy{count > 1 ? 'ies' : ''}</h2>
          <label className="field">
            <span>Preset</span>
            <div className="select-wrap">
              <select className="select" value={presetId} onChange={(e) => setPresetId(e.target.value)}>
                {presets.length === 0 && <option value="">Nenhum preset disponível</option>}
                {presets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </label>
        </div>
        <div className="sheet__footer">
          <button type="button" className="btn btn--secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy || !presetId}
            onClick={() => onApply(presetId)}
          >
            {busy ? 'Aplicando…' : 'Aplicar'}
          </button>
        </div>
      </div>
    </div>
  )
}
