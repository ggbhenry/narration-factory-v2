import { useState } from 'react'
import type { ReactNode } from 'react'

export interface MenuAction {
  label: string
  icon?: string
  danger?: boolean
  onClick: () => void
  hidden?: boolean
}

export function Menu({ actions, trigger }: { actions: MenuAction[]; trigger?: ReactNode }) {
  const [open, setOpen] = useState(false)
  const visible = actions.filter((a) => !a.hidden)

  return (
    <div className="menu-wrap">
      <button
        type="button"
        className="icon-btn"
        aria-label="Mais ações"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
      >
        {trigger ?? '⋯'}
      </button>
      {open && (
        <>
          <div className="menu-backdrop" onClick={() => setOpen(false)} />
          <div className="menu-pop" onClick={(e) => e.stopPropagation()}>
            {visible.map((action, i) => (
              <button
                key={i}
                type="button"
                className={`menu-item${action.danger ? ' menu-item--danger' : ''}`}
                onClick={() => {
                  setOpen(false)
                  action.onClick()
                }}
              >
                {action.icon && <span aria-hidden>{action.icon}</span>}
                {action.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
