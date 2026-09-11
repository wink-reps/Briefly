// Stand-in for a real local retrieval step (your backend's /ask endpoint,
// which embeds the question and retrieves matching segments from
// ChromaDB before asking Ollama). Keeps this frontend demo fully
// offline and gives it real, working behavior to build against.

const STOPWORDS = new Set(['what', 'when', 'where', 'were', 'that', 'this', 'with', 'about', 'have', 'does', 'from', 'they', 'their'])

// Meta-questions like "what is this about" or "summarize this" have no
// content word that will literally appear in the transcript text, so the
// keyword matcher below always misses them. Handle these separately with
// a plain overview instead of a false "couldn't find anything."
const GENERAL_QUESTION_PATTERNS = [
  /what('?s| is| was).{0,20}(discussion|meeting|call).{0,10}about/i,
  /what.{0,15}(happened|discussed|covered|talked about)/i,
  /\bsummar(y|ize|ise)\b/i,
  /what.{0,10}(is|was) (this|the) meeting/i,
]

export function answerQuestion(question, transcript) {
  if (transcript.length === 0) {
    return "There's no transcript yet for this meeting — capture some notes first."
  }

  if (GENERAL_QUESTION_PATTERNS.some((pattern) => pattern.test(question))) {
    const overview = transcript.slice(0, 5).map((m) => `${m.speaker}: “${m.text}”`)
    return `Here's what's been discussed so far:\n\n${overview.join('\n\n')}`
  }

  const words = question
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w))

  const scored = transcript
    .map((msg) => ({
      msg,
      score: words.filter((w) => msg.text.toLowerCase().includes(w)).length,
    }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)

  if (scored.length === 0) {
    // No literal keyword match — fall back to recent context instead of a
    // flat "not found," which reads as broken more often than it's right.
    const recent = transcript.slice(-3).map((m) => `${m.speaker}: “${m.text}”`)
    return `I couldn't find an exact match for that, but here's the most recent part of the conversation:\n\n${recent.join('\n\n')}`
  }

  const lines = scored.slice(0, 3).map((s) => `${s.msg.speaker}: “${s.msg.text}”`)
  return `Here's what came up:\n\n${lines.join('\n\n')}`
}
