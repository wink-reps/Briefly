import { useEffect, useRef } from 'react'
import { IconMic } from './Icons'

// Two capture paths:
//
// 1. Whisper path (used whenever this meeting has a `meetingId`, i.e. it
//    exists on the backend): records real audio with MediaRecorder and
//    uploads it in chunks to POST /meetings/{id}/transcribe, which runs
//    it through faster-whisper server-side. This is what actually gives
//    accurate transcription — Whisper is dramatically better than the
//    browser's built-in engine at handling accents, jargon, and noise.
//
// 2. Browser fallback (used when there's no backend meeting to talk to):
//    the browser's own SpeechRecognition API. It's convenient and needs
//    no setup, but it's a generic, general-purpose engine — expect more
//    mistakes than Whisper, especially on anything domain-specific.
//
// Neither path attempts to label who's speaking — see the note in
// rag_pipeline.py's assign_speakers() for why, and where real
// diarization would plug in later.

const API_BASE = 'http://localhost:8000'
const CHUNK_MS = 8000 // upload ~8s of audio to Whisper at a time

const SpeechRecognitionAPI =
  typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)

export default function RecordControl({ meetingId, onSegments, isRecording, onRecordingChange }) {
  const usingWhisper = Boolean(meetingId)

  const streamRef = useRef(null)
  const chunkTimerRef = useRef(null)
  const recognitionRef = useRef(null)
  const manualStopRef = useRef(false)
  const fallbackTimerRef = useRef(null)

  // ---------------- Whisper path ----------------

  const uploadChunk = async (blob) => {
    if (blob.size === 0) return
    const form = new FormData()
    form.append('file', blob, 'chunk.webm')
    try {
      const res = await fetch(`${API_BASE}/meetings/${meetingId}/transcribe`, {
        method: 'POST',
        body: form,
      })
      if (!res.ok) return
      const segments = await res.json() // [{speaker, text, duration_sec, ...}]
      if (segments.length) {
        onSegments(
          segments.map((s) => ({ text: s.text, speaker: s.speaker, durationSec: s.duration_sec })),
          { fromServer: true }
        )
      }
    } catch {
      // Backend hiccup mid-meeting — drop this chunk and keep recording
      // rather than interrupting the meeting.
    }
  }

  // Records one self-contained audio file at a time (stop + restart every
  // CHUNK_MS) rather than a single continuous stream. MediaRecorder's
  // timeslice mode produces fragments that aren't independently valid
  // audio files after the first one — restarting keeps every chunk a
  // complete, Whisper-decodable file.
  const recordNextChunk = (stream) => {
    const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
    const parts = []

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) parts.push(event.data)
    }
    recorder.onstop = () => {
      uploadChunk(new Blob(parts, { type: 'audio/webm' }))
      if (!manualStopRef.current) recordNextChunk(stream)
    }

    recorder.start()
    chunkTimerRef.current = window.setTimeout(() => {
      if (recorder.state !== 'inactive') recorder.stop()
    }, CHUNK_MS)
  }

  const startWhisperCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      recordNextChunk(stream)
    } catch {
      // Mic permission denied, no getUserMedia support, etc.
      onRecordingChange(false)
    }
  }

  const stopWhisperCapture = () => {
    window.clearTimeout(chunkTimerRef.current)
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }

  // ---------------- Browser fallback path ----------------

  useEffect(() => {
    if (usingWhisper || !SpeechRecognitionAPI) return
    const recognition = new SpeechRecognitionAPI()
    recognition.continuous = true
    recognition.interimResults = false
    recognition.lang = 'en-US'

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          onSegments([{ text: result[0].transcript.trim(), speaker: 'Speaker' }], { fromServer: false })
        }
      }
    }
    recognition.onend = () => {
      if (manualStopRef.current) onRecordingChange(false)
      else recognition.start()
    }
    recognition.onerror = (event) => {
      if (event.error === 'no-speech' || event.error === 'audio-capture') return
      manualStopRef.current = true
      onRecordingChange(false)
    }

    recognitionRef.current = recognition
    return () => {
      manualStopRef.current = true
      recognition.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usingWhisper])

  useEffect(() => {
    return () => {
      manualStopRef.current = true
      stopWhisperCapture()
      window.clearTimeout(fallbackTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------------- Shared toggle ----------------

  const toggle = async () => {
    if (isRecording) {
      manualStopRef.current = true
      if (usingWhisper) stopWhisperCapture()
      else recognitionRef.current?.stop()
      window.clearTimeout(fallbackTimerRef.current)
      onRecordingChange(false)
      return
    }

    manualStopRef.current = false
    onRecordingChange(true)

    if (usingWhisper) {
      await startWhisperCapture()
    } else if (recognitionRef.current) {
      recognitionRef.current.start()
    } else {
      // No backend AND no browser speech API — simulate periodic segments
      // so the flow still demos end-to-end.
      const speakOnce = () => {
        onSegments(
          [{ text: 'This is a simulated voice segment — connect the backend for real transcription.', speaker: 'Speaker' }],
          { fromServer: false }
        )
        fallbackTimerRef.current = window.setTimeout(speakOnce, 6000)
      }
      fallbackTimerRef.current = window.setTimeout(speakOnce, 1600)
    }
  }

  return (
    <div className="record-control">
      <button
        type="button"
        className={`record-control__button${isRecording ? ' record-control__button--active' : ''}`}
        onClick={toggle}
        aria-label={isRecording ? 'Stop recording the meeting' : 'Start recording the meeting'}
      >
        {isRecording && (
          <>
            <span className="record-control__ring" />
            <span className="record-control__ring record-control__ring--delay" />
          </>
        )}
        <IconMic width={26} height={26} />
      </button>
      <p className="record-control__label">
        {isRecording
          ? usingWhisper
            ? 'Recording… transcribing locally with Whisper'
            : 'Recording the meeting… tap to stop'
          : 'Tap to start recording'}
      </p>
      {!usingWhisper && (
        <p className="record-control__hint">Start the backend for more accurate transcription</p>
      )}
    </div>
  )
}
