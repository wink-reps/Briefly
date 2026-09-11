// Only blue/violet hues are used anywhere in this app.
const PALETTE = ['#8b7bf7', '#5b93f5', '#a78bfa', '#6ea8fe', '#c4b5fd', '#7c93f0']

export function initialsFor(name) {
  const parts = name.trim().split(/\s+/)
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

export function colorFor(name) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return PALETTE[Math.abs(hash) % PALETTE.length]
}
