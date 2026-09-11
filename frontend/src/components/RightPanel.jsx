import { useEffect, useRef, useState } from 'react'
import { IconSparkle, IconCheck, IconSend } from './Icons'

function SummaryTab({ meeting, isGenerating, onGenerate }) {
  const { summary, transcript } = meeting
  const hasContent = summary.keyPoints.length || summary.decisions.length || summary.actionItems.length

  return (
    <div className="summary-tab">
      <button
        type="button"
        className="summary-tab__generate"
        onClick={onGenerate}
        disabled={isGenerating || transcript.length === 0}
      >
        <IconSparkle width={14} height={14} />
        {isGenerating ? 'Summarizing…' : hasContent ? 'Regenerate summary' : 'Generate summary'}
      </button>

      {isGenerating && (
        <div className="summary-tab__loading">
          <div className="summary-tab__loading-bar" />
          <p>Running the local model over the transcript…</p>
        </div>
      )}

      {!isGenerating && !hasContent && (
        <p className="summary-tab__prompt">
          Capture a few notes on the left, then generate a summary — key
          points, decisions, and action items, pulled out locally.
        </p>
      )}

      {!isGenerating && hasContent && (
        <div className="summary-tab__body">
          {summary.keyPoints.length > 0 && (
            <div className="summary-tab__section">
              <p className="summary-tab__label">Key points</p>
              <ul className="summary-tab__points">
                {summary.keyPoints.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          )}

          {summary.decisions.length > 0 && (
            <div className="summary-tab__section">
              <p className="summary-tab__label">Decisions</p>
              <ul className="summary-tab__points summary-tab__points--decision">
                {summary.decisions.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          )}

          {summary.actionItems.length > 0 && (
            <div className="summary-tab__section">
              <p className="summary-tab__label">Action items</p>
              <ul className="summary-tab__actions">
                {summary.actionItems.map((a, i) => (
                  <li key={i}>
                    <span className="summary-tab__check">
                      <IconCheck width={11} height={11} />
                    </span>
                    <div>
                      <p>{a.text}</p>
                      <span className="summary-tab__action-meta">
                        {a.owner} · {a.due}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AskAiTab({ meeting, onAsk, isThinking }) {
  const [question, setQuestion] = useState('')
  const endRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [meeting.askThread.length, isThinking])

  const submit = () => {
    const value = question.trim()
    if (!value) return
    onAsk(value)
    setQuestion('')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="ask-ai">
      <div className="ask-ai__feed">
        {meeting.askThread.length === 0 && !isThinking && (
          <p className="ask-ai__empty">
            Ask anything about this meeting — “what did we decide about the
            API?”, “who owns the migration script?”
          </p>
        )}

        {meeting.askThread.map((m) => (
          <div key={m.id} className={`ask-msg ask-msg--${m.role}`}>
            {m.role === 'ai' && <span className="ask-msg__label">AI</span>}
            <p>{m.text}</p>
          </div>
        ))}

        {isThinking && (
          <div className="ask-msg ask-msg--ai">
            <span className="ask-msg__label">AI</span>
            <span className="typing-dots">
              <i /><i /><i />
            </span>
          </div>
        )}

        <div ref={endRef} />
      </div>

      <div className="ask-ai__input-row">
        <textarea
          rows={1}
          placeholder="Ask about this meeting…"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button type="button" onClick={submit} disabled={!question.trim()} aria-label="Ask">
          <IconSend width={14} height={14} />
        </button>
      </div>
    </div>
  )
}

export default function RightPanel({ meeting, isGenerating, onGenerate, onAsk, isThinking }) {
  const [tab, setTab] = useState('summary')

  if (!meeting) return <aside className="right-panel" />

  return (
    <aside className="right-panel">
      <div className="right-panel__tabs">
        <button
          type="button"
          className={`right-panel__tab${tab === 'summary' ? ' right-panel__tab--active' : ''}`}
          onClick={() => setTab('summary')}
        >
          Summary
        </button>
        <button
          type="button"
          className={`right-panel__tab${tab === 'ask' ? ' right-panel__tab--active' : ''}`}
          onClick={() => setTab('ask')}
        >
          Ask AI
        </button>
      </div>

      {tab === 'summary' ? (
        <SummaryTab meeting={meeting} isGenerating={isGenerating} onGenerate={onGenerate} />
      ) : (
        <AskAiTab meeting={meeting} onAsk={onAsk} isThinking={isThinking} />
      )}
    </aside>
  )
}
