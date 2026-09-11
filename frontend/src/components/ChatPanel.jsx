import { useEffect, useRef } from 'react'
import { initialsFor, colorFor } from '../utils/avatar'

function formatClipLength(sec) {
  if (!sec) return null
  return `${sec}s`
}

function Row({ speaker, self, time, children, waveform }) {
  const initials = initialsFor(speaker)
  const color = self ? 'var(--accent)' : colorFor(speaker)

  return (
    <div className={`feed-row${self ? ' feed-row--self' : ''}`}>
      <div className="feed-row__avatar" style={{ background: `${color}26`, color }}>
        {initials}
      </div>
      <div className="feed-row__body">
        <div className="feed-row__head">
          <span className="feed-row__name">{speaker}</span>
          {time && <span className="feed-row__time">{time}</span>}
          {waveform && (
            <span className="feed-row__clip">
              <span className="feed-row__clip-bars" aria-hidden="true">
                <i /><i /><i /><i /><i />
              </span>
              {waveform}
            </span>
          )}
        </div>
        {children}
      </div>
    </div>
  )
}

export default function ChatPanel({ meeting, isRecording }) {
  const endRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [meeting?.transcript?.length, isRecording])

  if (!meeting) {
    return (
      <div className="chat chat--empty">
        <p>Select a meeting or start a new one to see the transcript here.</p>
      </div>
    )
  }

  return (
    <div className="chat">
      <div className="chat__inner">
        {meeting.transcript.length === 0 && !isRecording && (
          <div className="chat__placeholder">
            <p>Nothing captured yet. Type a note or tap the mic to start.</p>
          </div>
        )}

        {meeting.transcript.map((msg) => (
          <Row
            key={msg.id}
            speaker={msg.speaker}
            self={msg.self}
            time={msg.time}
            waveform={formatClipLength(msg.durationSec)}
          >
            <p className="feed-row__text">{msg.text}</p>
          </Row>
        ))}

        {isRecording && (
          <Row speaker="Recording" self={false} time="now" waveform="listening">
            <div className="live-wave" aria-hidden="true">
              {Array.from({ length: 22 }).map((_, i) => (
                <span key={i} style={{ animationDelay: `${i * 0.055}s` }} />
              ))}
            </div>
          </Row>
        )}

        <div ref={endRef} />
      </div>
    </div>
  )
}
