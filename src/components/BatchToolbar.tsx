import { Menu } from './Menu.js'
import type { MenuAction } from './Menu.js'

interface BatchToolbarProps {
  selectedCount: number
  busy: boolean
  onGenerate: () => void
  onAssignPreset: () => void
  onRemoveAudio: () => void
  onDelete: () => void
  onClear: () => void
}

/**
 * Barra contextual de ações em lote — só aparece quando há copies selecionadas.
 */
export function BatchToolbar({
  selectedCount,
  busy,
  onGenerate,
  onAssignPreset,
  onRemoveAudio,
  onDelete,
  onClear,
}: BatchToolbarProps) {
  if (selectedCount === 0) return null

  const moreActions: MenuAction[] = [
    { label: 'Remover áudio das selecionadas', icon: '↩', onClick: onRemoveAudio },
    { label: 'Excluir selecionadas', icon: '🗑', danger: true, onClick: onDelete },
    { label: 'Limpar seleção', icon: '✕', onClick: onClear },
  ]

  return (
    <div className="batch-bar">
      <span className="batch-bar__count">{selectedCount} selecionada{selectedCount > 1 ? 's' : ''}</span>
      <div className="batch-bar__spacer" />
      <button type="button" className="btn btn--sm btn--primary" onClick={onGenerate} disabled={busy}>
        Gerar
      </button>
      <button type="button" className="btn btn--sm btn--secondary" onClick={onAssignPreset} disabled={busy}>
        Preset
      </button>
      <Menu actions={moreActions} />
    </div>
  )
}
