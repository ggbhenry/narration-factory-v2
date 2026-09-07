import { Menu } from './Menu.js'
import type { MenuAction } from './Menu.js'
import type { VoicePreset } from '../types/index.js'

interface PresetCardProps {
  preset: VoicePreset
  selected: boolean
  onToggleSelect: () => void
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
}

export function PresetCard({ preset, selected, onToggleSelect, onEdit, onDuplicate, onDelete }: PresetCardProps) {
  const missingVoice = !preset.voice_id?.trim()
  const missingModel = !preset.model_id?.trim()

  const actions: MenuAction[] = [
    { label: 'Editar', icon: '✏️', onClick: onEdit },
    { label: 'Duplicar', icon: '⧉', onClick: onDuplicate },
    { label: 'Excluir', icon: '🗑', danger: true, onClick: onDelete },
  ]

  return (
    <div className={`preset-card${selected ? ' preset-card--selected' : ''}`}>
      <div className="preset-card__head">
        <input
          type="checkbox"
          className="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          aria-label={`Selecionar ${preset.name}`}
        />
        <span className="preset-card__name">{preset.name}</span>
        {(missingVoice || missingModel) && (
          <span className="badge badge--warning">
            <span className="badge__dot" aria-hidden />
            Incompleto
          </span>
        )}
        <Menu actions={actions} />
      </div>

      <div className="preset-card__meta">
        <span>Voice: {missingVoice ? '— não configurado —' : <code>{preset.voice_id}</code>}</span>
        <span>Model: {missingModel ? '— não configurado —' : <code>{preset.model_id}</code>}</span>
      </div>

      <div className="preset-card__settings">
        <span className="mini-tag">Stab {preset.stability.toFixed(2)}</span>
        <span className="mini-tag">Simil {preset.similarity_boost.toFixed(2)}</span>
        <span className="mini-tag">Style {preset.style.toFixed(2)}</span>
        <span className="mini-tag">Speed {(preset.speed ?? 1).toFixed(2)}</span>
        <span className="mini-tag">Boost {preset.use_speaker_boost ? 'on' : 'off'}</span>
      </div>
    </div>
  )
}
