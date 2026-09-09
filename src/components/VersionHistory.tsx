import { StatusBadge } from './StatusBadge.js'
import { Menu } from './Menu.js'
import type { MenuAction } from './Menu.js'
import type { CopyRecord, NarrationVersion } from '../types/index.js'

interface VersionHistoryProps {
  copy: CopyRecord
  versions: NarrationVersion[]
  selectedVersionId: string | null
  checkedIds: Set<string>
  onSelect: (versionId: string) => void
  onToggleCheck: (versionId: string) => void
  onMakeMaster: (versionId: string) => void
  onDeleteOne: (versionId: string) => void
}

export function VersionHistory({
  copy,
  versions,
  selectedVersionId,
  checkedIds,
  onSelect,
  onToggleCheck,
  onMakeMaster,
  onDeleteOne,
}: VersionHistoryProps) {
  if (versions.length === 0) {
    return <p className="muted">Nenhuma versão gerada ainda.</p>
  }

  return (
    <ul className="version-history">
      {versions.map((v) => {
        const isMaster = copy.master_version_id === v.version_id
        const isSelected = selectedVersionId === v.version_id
        const canMaster = v.status !== 'ERROR' && !!v.audio_key && !isMaster

        const actions: MenuAction[] = [
          { label: 'Ouvir / selecionar', icon: '▶', onClick: () => onSelect(v.version_id) },
          { label: 'Tornar master', icon: '★', onClick: () => onMakeMaster(v.version_id), hidden: !canMaster },
          { label: 'Excluir (mover p/ lixeira)', icon: '🗑', danger: true, onClick: () => onDeleteOne(v.version_id) },
        ]

        return (
          <li
            key={v.version_id}
            className={`version-row${isSelected ? ' version-row--selected' : isMaster ? ' version-row--active' : ''}`}
          >
            <input
              type="checkbox"
              className="checkbox"
              checked={checkedIds.has(v.version_id)}
              onChange={() => onToggleCheck(v.version_id)}
              aria-label={`Selecionar ${v.version_id}`}
            />
            <div className="version-row__main" onClick={() => onSelect(v.version_id)}>
              <div className="version-row__top">
                <span className="version-row__vid">{v.version_id}</span>
                {isMaster && (
                  <span className="badge badge--success">
                    <span className="badge__dot" aria-hidden />
                    MASTER
                  </span>
                )}
                <StatusBadge status={v.status} />
              </div>
              <div className="version-row__meta">
                <span>{v.preset_id ? v.preset_id : 'manual'}</span>
                {typeof v.duration_seconds === 'number' && <span>{v.duration_seconds.toFixed(1)}s</span>}
              </div>
              {v.error_message && <div className="version-row__error">{v.error_message}</div>}
            </div>
            <Menu actions={actions} />
          </li>
        )
      })}
    </ul>
  )
}
