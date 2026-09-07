import { StatusBadge } from './StatusBadge.js'
import { Menu } from './Menu.js'
import type { MenuAction } from './Menu.js'
import type { CopyJobStatus } from '../lib/generationQueue.js'
import type { CopyRecord, NarrationVersion, VoicePreset } from '../types/index.js'

interface CopyCardProps {
  copy: CopyRecord
  latestVersion: NarrationVersion | null
  presets: VoicePreset[]
  selected: boolean
  onToggleSelect: () => void
  onOpen: () => void
  onSelectPreset: (presetId: string | null) => void
  onEdit: () => void
  onHistory: () => void
  onRemoveAudio: () => void
  onDelete: () => void
  queueStatus?: CopyJobStatus
}

export function CopyCard({
  copy,
  latestVersion,
  presets,
  selected,
  onToggleSelect,
  onOpen,
  onSelectPreset,
  onEdit,
  onHistory,
  onRemoveAudio,
  onDelete,
  queueStatus,
}: CopyCardProps) {
  const hasReviewable = copy.status === 'READY_FOR_REVIEW' || copy.status === 'READY_FOR_EDITING'
  const isBusy = copy.status === 'GENERATING' || queueStatus === 'generating' || queueStatus === 'queued'
  const presetMissing = !copy.selected_preset_id

  const menuActions: MenuAction[] = [
    { label: 'Editar', icon: '✏️', onClick: onEdit },
    { label: 'Revisar', icon: '▶', onClick: onOpen, hidden: !hasReviewable },
    { label: 'Remover áudio atual', icon: '↩', onClick: onRemoveAudio, hidden: !hasReviewable },
    { label: 'Ver histórico', icon: '🕑', onClick: onHistory },
    { label: 'Excluir copy', icon: '🗑', danger: true, onClick: onDelete },
  ]

  return (
    <div className={`copy-card${selected ? ' copy-card--selected' : ''}${isBusy ? ' copy-card--busy' : ''}`}>
      <div className="copy-card__head">
        <input
          type="checkbox"
          className="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          aria-label={`Selecionar ${copy.copy_id}`}
        />
        <span className="copy-card__id">{copy.copy_id}</span>
        <StatusBadge status={copy.status} />
        <Menu actions={menuActions} />
      </div>

      <p className="copy-card__snippet">{copy.copy_original}</p>

      <div>
        <div className="copy-card__preset-label">Preset</div>
        <div className="select-wrap">
          <select
            className="select"
            value={copy.selected_preset_id ?? ''}
            onChange={(e) => onSelectPreset(e.target.value || null)}
          >
            <option value="">— selecione um preset —</option>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="copy-card__footer">
        <div className="copy-card__meta">
          {latestVersion && (
            <span className="copy-card__version">
              {latestVersion.version_id}
              {typeof latestVersion.duration_seconds === 'number'
                ? ` · ${latestVersion.duration_seconds.toFixed(1)}s`
                : ''}
            </span>
          )}
          {queueStatus === 'queued' && <span className="copy-card__queue-tag">Na fila</span>}
          {queueStatus === 'generating' && <span className="copy-card__queue-tag">Gerando…</span>}
          {queueStatus === 'error' && <span className="copy-card__queue-tag copy-card__queue-tag--error">Erro no lote</span>}
        </div>
        <button
          type="button"
          className={`btn btn--sm ${hasReviewable ? 'btn--primary' : 'btn--outline'}`}
          onClick={onOpen}
          disabled={!hasReviewable && presetMissing}
          title={!hasReviewable && presetMissing ? 'Selecione um preset primeiro' : undefined}
        >
          {hasReviewable ? '▶ Revisar' : copy.status === 'ERROR' ? 'Tentar novamente' : 'Gerar'}
        </button>
      </div>
    </div>
  )
}
