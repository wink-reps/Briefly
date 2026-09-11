// Talks to the FastAPI backend in /backend. Every function fails soft —
// returns null on any network error, non-2xx response, or parsing issue —
// so the UI can fall back to its local placeholder logic (utils/summarize.js,
// utils/askAI.js) when the backend isn't running yet, or a given meeting
// hasn't been created on the server.

const API_BASE = 'http://localhost:8000'

async function request(path, options = {}) {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null // backend not running, CORS misconfigured, offline, etc.
  }
}

export function minDelay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

export function createMeetingOnServer(title) {
  return request('/meetings', { method: 'POST', body: JSON.stringify({ title }) })
}

export function addNoteOnServer(meetingId, text) {
  return request(`/meetings/${meetingId}/notes`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  })
}

export function addSegmentOnServer(meetingId, text, speaker = 'Speaker', isSelf = false) {
  return request(`/meetings/${meetingId}/segments`, {
    method: 'POST',
    body: JSON.stringify({ text, speaker, is_self: isSelf }),
  })
}

export async function summarizeOnServer(meetingId) {
  const result = await request(`/meetings/${meetingId}/summarize`, { method: 'POST' })
  if (!result) return null
  return {
    keyPoints: result.key_points ?? [],
    decisions: result.decisions ?? [],
    actionItems: result.action_items ?? [],
  }
}

export async function askOnServer(meetingId, question) {
  const result = await request(`/meetings/${meetingId}/ask`, {
    method: 'POST',
    body: JSON.stringify({ question }),
  })
  return result?.text ?? null
}
