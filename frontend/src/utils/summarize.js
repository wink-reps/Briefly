// A small heuristic "summarizer" used only as a fallback when the backend
// isn't reachable (see utils/api.js summarizeOnServer). This is NOT real
// summarization — it buckets transcript lines by keyword and returns them
// close to verbatim, just truncated. Real compression/paraphrasing needs
// an actual model: that's what the backend's summarize_transcript()
// (rag_pipeline.py, via Ollama) does. Prefer that whenever it's available.

const DECISION_HINTS = ['decided', 'decide', 'agreed', 'we will go with', "let's go with"]
const ACTION_HINTS = ['action item', 'i will', "i'll", 'will own', 'to do', 'follow up', 'draft', 'update']
const MAX_LINE_LENGTH = 140

function truncate(text) {
  if (text.length <= MAX_LINE_LENGTH) return text
  return `${text.slice(0, MAX_LINE_LENGTH).trimEnd()}…`
}

export function summarizeTranscript(transcript) {
  const sentences = transcript.map((m) => truncate(m.text.trim())).filter(Boolean)

  const decisions = sentences.filter((s) =>
    DECISION_HINTS.some((hint) => s.toLowerCase().includes(hint))
  )

  const actionItems = sentences
    .filter((s) => ACTION_HINTS.some((hint) => s.toLowerCase().includes(hint)))
    .map((text) => ({ text, owner: 'Unassigned', due: '—' }))

  const rest = sentences.filter((s) => !decisions.includes(s) && !actionItems.some((a) => a.text === s))
  const keyPoints = (rest.length ? rest : sentences).slice(0, 4)

  return { keyPoints, decisions, actionItems }
}
