import type { CopyJobStatus } from '../lib/generationQueue.js'

interface QueueProgressProps {
  statuses: Record<string, CopyJobStatus>
  errors: Record<string, string>
  onClose: () => void
  onRetry?: (copyId: string) => void
}

const LABELS: Record<CopyJobStatus, string> = {
  queued: 'Na fila',
  generating: 'Gerando…',
  done: 'Concluída',
  error: 'Erro',
}

export function QueueProgress({ statuses, errors, onClose, onRetry }: QueueProgressProps) {
  const entries = Object.entries(statuses)
  const done = entries.filter(([, s]) => s === 'done').length
  const errored = entries.filter(([, s]) => s === 'error').length
  const generating = entries.filter(([, s]) => s === 'generating').length
  const queued = entries.filter(([, s]) => s === 'queued').length
  const total = entries.length
  const finished = entries.every(([, s]) => s === 'done' || s === 'error')

  return (
    <div className="sheet-overlay" role="dialog" aria-modal="true">
      <div className="sheet sheet--full">
        <div className="sheet__header">
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar" disabled={!finished}>
            ✕
          </button>
          <h2>
            Gerando {done + errored} de {total}
          </h2>
        </div>

        <div className="sheet__body">
          <div className="queue-summary">
            <span className="queue-summary__chip">{generating} processando</span>
            <span className="queue-summary__chip">{queued} aguardando</span>
            <span className="queue-summary__chip queue-summary__chip--done">{done} concluídas</span>
            {errored > 0 && <span className="queue-summary__chip queue-summary__chip--error">{errored} com erro</span>}
          </div>

          <ul className="queue-progress-list">
            {entries.map(([copyId, status]) => (
              <li key={copyId} className={`queue-progress-item queue-progress-item--${status}`}>
                <span className="queue-progress-item__id">{copyId}</span>
                <span className="queue-progress-item__status">{LABELS[status]}</span>
                {status === 'error' && onRetry && (
                  <button type="button" className="btn btn--sm btn--outline" onClick={() => onRetry(copyId)}>
                    Tentar novamente
                  </button>
                )}
                {status === 'error' && errors[copyId] && (
                  <span className="queue-progress-item__error">{errors[copyId]}</span>
                )}
              </li>
            ))}
          </ul>
        </div>

        {finished && (
          <div className="sheet__footer">
            <button type="button" className="btn btn--primary btn--block" onClick={onClose}>
              Fechar ({done} concluídas{errored > 0 ? `, ${errored} com erro` : ''})
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
