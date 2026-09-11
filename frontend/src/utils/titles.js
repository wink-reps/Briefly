// Meetings shouldn't all sit in the sidebar as an undifferentiated pile of
// "New meeting" entries. A new meeting gets a date/time-based default
// title, and once it's summarized, that default gets upgraded to
// something that actually reflects what was discussed — but only if the
// person hasn't already renamed it themselves (see `titleIsAuto` on the
// meeting object in App.jsx).

export function defaultMeetingTitle(date = new Date()) {
  const day = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `Meeting — ${day}, ${time}`
}

const MAX_TITLE_LENGTH = 48

export function deriveTopicTitle(summary) {
  const source = summary.keyPoints[0] || summary.decisions[0]
  if (!source) return null

  const trimmed = source.trim()
  const title = trimmed.length > MAX_TITLE_LENGTH
    ? `${trimmed.slice(0, MAX_TITLE_LENGTH).trimEnd()}…`
    : trimmed

  return title.charAt(0).toUpperCase() + title.slice(1)
}
