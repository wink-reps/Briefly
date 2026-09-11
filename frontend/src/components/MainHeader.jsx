export default function MainHeader({ meeting, onRename }) {
  if (!meeting) {
    return (
      <header className="main-header">
        <h1 className="main-header__title main-header__title--muted">No meeting selected</h1>
      </header>
    )
  }

  return (
    <header className="main-header">
      <input
        className="main-header__title"
        value={meeting.title}
        onChange={(e) => onRename(e.target.value)}
        aria-label="Meeting title"
      />
      <div className="main-header__status">
        <span className="main-header__status-dot" aria-hidden="true" />
        Local model loaded
      </div>
    </header>
  )
}
