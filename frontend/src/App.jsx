import { useState } from 'react'
import Sidebar from './components/Sidebar'
import MainHeader from './components/MainHeader'
import ChatPanel from './components/ChatPanel'
import RecordControl from './components/RecordControl'
import InputBar from './components/InputBar'
import RightPanel from './components/RightPanel'
import { initialMeetings, nextId } from './data/mockMeetings'
import { summarizeTranscript } from './utils/summarize'
import { answerQuestion } from './utils/askAI'
import { createMeetingOnServer, addNoteOnServer, addSegmentOnServer, summarizeOnServer, askOnServer, minDelay } from './utils/api'
import { defaultMeetingTitle, deriveTopicTitle } from './utils/titles'
import './App.css'

function emptyMeeting() {
  const now = new Date()
  return {
    id: nextId(),
    title: defaultMeetingTitle(now),
    titleIsAuto: true, // gets replaced by a topic-derived title after summarizing, unless renamed first
    date: now.toISOString(),
    durationSec: 0,
    transcript: [],
    summary: { keyPoints: [], decisions: [], actionItems: [] },
    status: 'idle',
    askThread: [],
  }
}

export default function App() {
  const [meetings, setMeetings] = useState(initialMeetings)
  const [activeId, setActiveId] = useState(initialMeetings[0]?.id ?? null)
  const [isRecording, setIsRecording] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isThinking, setIsThinking] = useState(false)

  const activeMeeting = meetings.find((m) => m.id === activeId) ?? null

  const updateMeeting = (id, updater) => {
    setMeetings((prev) => prev.map((m) => (m.id === id ? updater(m) : m)))
  }

  const handleNewMeeting = () => {
    const meeting = emptyMeeting()
    setMeetings((prev) => [meeting, ...prev])
    setActiveId(meeting.id)
    setIsRecording(false)

    // Fire-and-forget: if the backend is running, mirror this meeting there
    // so summarize/ask can use the real pipeline instead of the local
    // placeholder logic. If it's not running, this just resolves to null
    // and the meeting stays local-only (falls back automatically below).
    createMeetingOnServer(meeting.title).then((server) => {
      if (server) updateMeeting(meeting.id, (m) => ({ ...m, serverId: server.id }))
    })
  }

  const handleSelectMeeting = (id) => {
    setActiveId(id)
    setIsRecording(false)
  }

  const handleDeleteMeeting = (id) => {
    setMeetings((prev) => prev.filter((m) => m.id !== id))
    if (activeId === id) {
      setActiveId((prev) => {
        const remaining = meetings.filter((m) => m.id !== id)
        return remaining[0]?.id ?? null
      })
    }
  }

  const handleSend = (text) => {
    if (!activeMeeting) return
    const time = new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    updateMeeting(activeMeeting.id, (m) => ({
      ...m,
      transcript: [
        ...m.transcript,
        { id: `t_${Date.now()}`, speaker: 'You', self: true, text, time, durationSec: null },
      ],
      status: 'captured',
    }))
    if (activeMeeting.serverId) addNoteOnServer(activeMeeting.serverId, text)
  }

  // Live mic capture doesn't attempt to label who's speaking. A
  // pause-based "new speaker after N seconds of silence" heuristic was
  // tried and dropped — real meetings interrupt and talk over each
  // other constantly, so a silence gap is a poor (and actively
  // misleading) proxy for turn-taking. Every live segment is stored
  // generically for now. Real diarization needs actual voice analysis
  // over the audio (see the backend's rag_pipeline.py, where the same
  // decision was made) — once that's wired in, this can just use
  // whatever speaker label it returns instead of the fixed string below.
  const handleCapturedSegments = (segments, { fromServer }) => {
    if (!activeMeeting) return
    const time = new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    const rows = segments.map((seg, i) => ({
      id: `t_${Date.now()}_${i}`,
      speaker: seg.speaker ?? 'Speaker',
      self: false,
      text: seg.text,
      time,
      durationSec: seg.durationSec ?? null,
    }))

    updateMeeting(activeMeeting.id, (m) => ({
      ...m,
      transcript: [...m.transcript, ...rows],
      status: 'captured',
    }))

    // Segments transcribed by the real Whisper backend are already stored
    // and embedded there (see POST /transcribe in main.py) — only the
    // browser-fallback path needs a separate sync call.
    if (!fromServer && activeMeeting.serverId) {
      rows.forEach((r) => addSegmentOnServer(activeMeeting.serverId, r.text, r.speaker, false))
    }
  }

  const handleRename = (title) => {
    if (!activeMeeting) return
    updateMeeting(activeMeeting.id, (m) => ({ ...m, title, titleIsAuto: false }))
  }

  const handleGenerate = async () => {
    if (!activeMeeting) return
    setIsGenerating(true)

    // If this meeting exists on the server, get a real summary from the
    // local LLM via Ollama. Otherwise (backend not running, or this is one
    // of the seeded demo meetings that was never created server-side),
    // fall back to the local keyword-bucket placeholder — which is honest
    // about being a placeholder, not a real summarizer.
    const [serverSummary] = await Promise.all([
      activeMeeting.serverId ? summarizeOnServer(activeMeeting.serverId) : Promise.resolve(null),
      minDelay(400),
    ])
    const summary = serverSummary ?? summarizeTranscript(activeMeeting.transcript)

    updateMeeting(activeMeeting.id, (m) => {
      const topicTitle = m.titleIsAuto ? deriveTopicTitle(summary) : null
      return {
        ...m,
        summary,
        status: 'summarized',
        ...(topicTitle ? { title: topicTitle, titleIsAuto: false } : {}),
      }
    })
    setIsGenerating(false)
  }

  const handleAsk = async (question) => {
    if (!activeMeeting) return
    const userMsg = { id: `a_${Date.now()}`, role: 'user', text: question }
    updateMeeting(activeMeeting.id, (m) => ({ ...m, askThread: [...m.askThread, userMsg] }))
    setIsThinking(true)

    const [serverAnswer] = await Promise.all([
      activeMeeting.serverId ? askOnServer(activeMeeting.serverId, question) : Promise.resolve(null),
      minDelay(400),
    ])
    const answer = serverAnswer ?? answerQuestion(question, activeMeeting.transcript)

    const aiMsg = { id: `a_${Date.now() + 1}`, role: 'ai', text: answer }
    updateMeeting(activeMeeting.id, (m) => ({ ...m, askThread: [...m.askThread, aiMsg] }))
    setIsThinking(false)
  }

  return (
    <div className="app">
      <Sidebar
        meetings={meetings}
        activeId={activeId}
        onSelect={handleSelectMeeting}
        onNew={handleNewMeeting}
        onDelete={handleDeleteMeeting}
      />

      <main className="main">
        <MainHeader meeting={activeMeeting} onRename={handleRename} />
        <ChatPanel meeting={activeMeeting} isRecording={isRecording} />
        {activeMeeting && (
          <>
            <RecordControl
              key={activeMeeting.id}
              meetingId={activeMeeting.serverId}
              onSegments={handleCapturedSegments}
              isRecording={isRecording}
              onRecordingChange={setIsRecording}
            />
            <InputBar onSend={handleSend} disabled={isRecording} />
          </>
        )}
      </main>

      <RightPanel
        meeting={activeMeeting}
        isGenerating={isGenerating}
        onGenerate={handleGenerate}
        onAsk={handleAsk}
        isThinking={isThinking}
      />
    </div>
  )
}
