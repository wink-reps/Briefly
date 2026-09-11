import { useMemo, useState } from 'react'
import { IconPlus, IconSearch, IconTrash, IconClock } from './Icons'

function formatDuration(sec) {
  const m = Math.round(sec / 60)
  return `${m} min`
}

function formatDay(iso) {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)

  const sameDay = (a, b) => a.toDateString() === b.toDateString()
  if (sameDay(d, today)) return 'Today'
  if (sameDay(d, yesterday)) return 'Yesterday'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export default function Sidebar({ meetings, activeId, onSelect, onNew, onDelete }) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    if (!query.trim()) return meetings
    const q = query.toLowerCase()
    return meetings.filter((m) => m.title.toLowerCase().includes(q))
  }, [meetings, query])

  const groups = useMemo(() => {
    const map = new Map()
    for (const m of filtered) {
      const label = formatDay(m.date)
      if (!map.has(label)) map.set(label, [])
      map.get(label).push(m)
    }
    return Array.from(map.entries())
  }, [filtered])

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <span className="sidebar__dot" aria-hidden="true" />
        <span className="sidebar__wordmark">Briefly</span>
      </div>

      <button type="button" className="sidebar__new" onClick={onNew}>
        <IconPlus width={16} height={16} />
        New meeting
      </button>

      <div className="sidebar__search">
        <IconSearch width={15} height={15} />
        <input
          type="text"
          placeholder="Search meetings"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <nav className="sidebar__list">
        {groups.length === 0 && (
          <p className="sidebar__empty">No meetings match “{query}”.</p>
        )}

        {groups.map(([label, items]) => (
          <div key={label} className="sidebar__group">
            <p className="sidebar__group-label">{label}</p>
            {items.map((m) => (
              <div
                key={m.id}
                className={`sidebar__item${m.id === activeId ? ' sidebar__item--active' : ''}`}
                onClick={() => onSelect(m.id)}
              >
                <div className="sidebar__item-main">
                  <p className="sidebar__item-title">{m.title}</p>
                  <div className="sidebar__item-meta">
                    <IconClock width={12} height={12} />
                    <span>{formatTime(m.date)}</span>
                    <span className="sidebar__item-dot">·</span>
                    <span>{formatDuration(m.durationSec)}</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="sidebar__item-delete"
                  aria-label={`Delete ${m.title}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete(m.id)
                  }}
                >
                  <IconTrash width={14} height={14} />
                </button>
              </div>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar__footer">
        <span className="sidebar__status-dot" aria-hidden="true" />
        Running fully on-device — no audio leaves this machine
      </div>
    </aside>
  )
}
