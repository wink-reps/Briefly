// Seed data so the UI has something to show on first load.
// Speakers are labeled generically ("Speaker") since this app doesn't
// attempt diarization yet — see the note in RecordControl.jsx / the
// backend's rag_pipeline.py for why, and how to add it later.
let idCounter = 100

export function nextId() {
  idCounter += 1
  return `m_${idCounter}`
}

export const initialMeetings = [
  {
    id: 'm_1',
    title: 'Q3 Roadmap Sync',
    titleIsAuto: false,
    date: '2026-08-19T10:00:00',
    durationSec: 1860,
    transcript: [
      { id: 't1', speaker: 'Speaker', self: false, text: 'Let\'s start with the API rewrite. Where are we?', time: '10:00', durationSec: 4 },
      { id: 't2', speaker: 'You', self: true, text: 'Backend is on track. We decided to ship the v2 endpoints behind a feature flag first.', time: '10:02', durationSec: 8 },
      { id: 't3', speaker: 'Speaker', self: false, text: 'Good. I\'ll own the migration script, targeting end of next week.', time: '10:05', durationSec: 6 },
      { id: 't4', speaker: 'You', self: true, text: 'Action item: I will draft the deprecation notice for v1 consumers by Friday.', time: '10:09', durationSec: 7 },
      { id: 't5', speaker: 'Speaker', self: false, text: 'We also need to decide on the rate limit tiers before launch.', time: '10:14', durationSec: 5 },
    ],
    summary: {
      keyPoints: [
        'Backend rewrite is on track; v2 endpoints ship behind a feature flag.',
        'Rate limit tiers still need to be finalized before launch.',
      ],
      decisions: [
        'Ship v2 API behind a feature flag rather than a hard cutover.',
      ],
      actionItems: [
        { text: 'Own the migration script', owner: 'Unassigned', due: 'Next week' },
        { text: 'Draft the v1 deprecation notice', owner: 'You', due: 'Friday' },
      ],
    },
    status: 'summarized',
    askThread: [
      { id: 'a1', role: 'user', text: 'What did we decide about the API rewrite?' },
      {
        id: 'a2',
        role: 'ai',
        text: 'Here\'s what came up:\n\nYou: "Backend is on track. We decided to ship the v2 endpoints behind a feature flag first."\n\nSpeaker: "We also need to decide on the rate limit tiers before launch."',
      },
    ],
  },
  {
    id: 'm_2',
    title: '1:1 catch-up',
    titleIsAuto: false,
    date: '2026-08-18T15:30:00',
    durationSec: 900,
    transcript: [
      { id: 't1', speaker: 'Speaker', self: false, text: 'How is onboarding going for the new hire?', time: '15:30', durationSec: 3 },
      { id: 't2', speaker: 'You', self: true, text: 'Good, she shipped her first PR yesterday.', time: '15:31', durationSec: 4 },
    ],
    summary: {
      keyPoints: ['New hire onboarding is going smoothly — first PR already shipped.'],
      decisions: [],
      actionItems: [],
    },
    status: 'summarized',
    askThread: [],
  },
  {
    id: 'm_3',
    title: 'Design Review — Onboarding Flow',
    titleIsAuto: false,
    date: '2026-08-15T13:00:00',
    durationSec: 2400,
    transcript: [
      { id: 't1', speaker: 'Speaker', self: false, text: 'The three-step flow tests better than the single-page form.', time: '13:00', durationSec: 5 },
      { id: 't2', speaker: 'You', self: true, text: 'Agreed, we decided to go with the three-step version for the next release.', time: '13:04', durationSec: 6 },
    ],
    summary: {
      keyPoints: ['Three-step onboarding flow outperformed the single-page form in testing.'],
      decisions: ['Ship the three-step onboarding flow in the next release.'],
      actionItems: [{ text: 'Update Figma spec to match final flow', owner: 'You', due: 'Mon' }],
    },
    status: 'summarized',
    askThread: [],
  },
]
