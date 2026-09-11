import { useRef, useState } from 'react'
import { IconSend } from './Icons'

export default function InputBar({ onSend, disabled }) {
  const [text, setText] = useState('')
  const textareaRef = useRef(null)

  const submit = () => {
    const value = text.trim()
    if (!value) return
    onSend(value)
    setText('')
    textareaRef.current?.focus()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="input-bar">
      <textarea
        ref={textareaRef}
        className="input-bar__field"
        rows={1}
        placeholder={disabled ? 'Listening…' : 'Or type a note…'}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
      />

      <button
        type="button"
        className="input-bar__send"
        onClick={submit}
        disabled={!text.trim() || disabled}
        aria-label="Send"
      >
        <IconSend width={16} height={16} />
      </button>
    </div>
  )
}
