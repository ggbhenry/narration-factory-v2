import { useState } from 'react'
import type { ReactNode } from 'react'
import { clearStoredToken } from '../lib/auth.js'
import { clearAudioCache } from '../lib/audioCache.js'

export type AppPage = 'narrations' | 'history' | 'presets' | 'trash'

interface AppShellProps {
  page: AppPage
  onNavigate: (page: AppPage) => void
  children: ReactNode
}

const NAV: { id: AppPage; label: string; icon: string }[] = [
  { id: 'narrations', label: 'Narrações', icon: '🎙️' },
  { id: 'history', label: 'Histórico', icon: '🕑' },
  { id: 'presets', label: 'Presets', icon: '🎚️' },
  { id: 'trash', label: 'Lixeira', icon: '🗑️' },
]

function handleLogout() {
  clearAudioCache()
  clearStoredToken()
  window.dispatchEvent(new Event('app:unauthorized'))
}

export function AppShell({ page, onNavigate, children }: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  function go(id: AppPage) {
    onNavigate(id)
    setDrawerOpen(false)
  }

  return (
    <div className="app-shell">
      {/* Sidebar fixa (desktop) */}
      <aside className="sidebar">
        <div className="sidebar__brand">
          <span className="app-shell__brand-mark" aria-hidden>N</span>
          Narration Factory
        </div>
        <nav className="sidebar__nav">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={page === item.id ? 'sidebar__link sidebar__link--active' : 'sidebar__link'}
              onClick={() => go(item.id)}
            >
              <span className="sidebar__icon" aria-hidden>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <button type="button" className="sidebar__logout" onClick={handleLogout}>
          <span aria-hidden>⏻</span> Sair
        </button>
      </aside>

      {/* Drawer (mobile) */}
      {drawerOpen && (
        <>
          <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} />
          <aside className="drawer">
            <div className="sidebar__brand">
              <span className="app-shell__brand-mark" aria-hidden>N</span>
              Narration Factory
            </div>
            <nav className="sidebar__nav">
              {NAV.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={page === item.id ? 'sidebar__link sidebar__link--active' : 'sidebar__link'}
                  onClick={() => go(item.id)}
                >
                  <span className="sidebar__icon" aria-hidden>{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </nav>
            <button type="button" className="sidebar__logout" onClick={handleLogout}>
              <span aria-hidden>⏻</span> Sair
            </button>
          </aside>
        </>
      )}

      <div className="app-shell__body">
        {/* Topbar (mobile) */}
        <header className="topbar">
          <button type="button" className="icon-btn" aria-label="Menu" onClick={() => setDrawerOpen(true)}>
            ☰
          </button>
          <span className="topbar__title">{NAV.find((n) => n.id === page)?.label}</span>
          <span className="topbar__spacer" />
        </header>

        <main className="app-shell__content">{children}</main>

        {/* Bottom nav (mobile) */}
        <nav className="bottom-nav">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={page === item.id ? 'bottom-nav__item bottom-nav__item--active' : 'bottom-nav__item'}
              onClick={() => go(item.id)}
            >
              <span className="bottom-nav__icon" aria-hidden>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
      </div>
    </div>
  )
}
