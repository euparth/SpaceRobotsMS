import { useEffect, useRef, useState } from 'react'
import { COMMANDS } from '../services/cliCommands.js'
import { Kbd, cx } from './ui.jsx'

const KIND_CLASS = Object.freeze({
  input: 'text-slate-100',
  out: 'text-slate-300',
  json: 'text-sky-200/90',
  ok: 'text-emerald-400',
  warn: 'text-amber-400',
  err: 'text-red-400',
  dim: 'text-slate-500',
  event: 'text-slate-500',
})

const PROMPT = 'gnc@twin:~$'

export default function CliTerminal({ open, lines, onSubmit, onClose }) {
  const [value, setValue] = useState('')
  const [history, setHistory] = useState([])
  const [cursor, setCursor] = useState(-1)
  const inputRef = useRef(null)
  const scrollRef = useRef(null)

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines, open])

  if (!open) return null

  const submit = () => {
    const line = value.trim()
    if (!line) return
    setHistory((h) => [...h.slice(-99), line])
    setCursor(-1)
    setValue('')
    onSubmit(line)
  }

  const onKeyDown = (e) => {
    e.stopPropagation()
    if (e.key === 'Enter') {
      e.preventDefault()
      submit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (!history.length) return
      const next = cursor < 0 ? history.length - 1 : Math.max(0, cursor - 1)
      setCursor(next)
      setValue(history[next])
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (cursor < 0) return
      const next = cursor + 1
      if (next >= history.length) {
        setCursor(-1)
        setValue('')
      } else {
        setCursor(next)
        setValue(history[next])
      }
    } else if (e.key === 'Tab') {
      e.preventDefault()
      const head = value.trim()
      const matches = COMMANDS.filter((c) => c.name.startsWith(head))
      if (matches.length === 1) setValue(`${matches[0].name} `)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-ink-950 pt-[env(safe-area-inset-top)] lg:absolute lg:inset-x-0 lg:bottom-0 lg:top-auto lg:z-30 lg:h-[48%] lg:min-h-[220px] lg:border-t lg:border-ink-600 lg:bg-ink-950/[0.94] lg:pt-0 lg:backdrop-blur-md"
      onMouseDown={() => inputRef.current?.focus()}
    >
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-ink-700 px-3 lg:h-8">
        <span className="num text-[11px] text-slate-400">
          /cli <span className="text-slate-600">· gnc workbench terminal</span>
        </span>
        <span className="flex items-center gap-2 text-[10.5px] text-slate-500">
          <span className="hidden items-center gap-2 lg:flex">
            <Kbd>↑↓</Kbd> history <Kbd>Tab</Kbd> complete <Kbd>Esc</Kbd> close
          </span>
          <button
            type="button"
            onClick={onClose}
            className="num rounded-[3px] border border-ink-600 px-2.5 py-1 text-[11px] text-slate-300 lg:hidden"
          >
            Close
          </button>
        </span>
      </div>
      <div ref={scrollRef} className="scroll-thin num min-h-0 flex-1 overflow-y-auto px-3 py-2 text-[12px] leading-[18px]">
        {lines.map((l, i) => (
          <div key={i} className={cx('whitespace-pre-wrap break-words', KIND_CLASS[l.kind] ?? 'text-slate-300')}>
            {l.kind === 'input' ? (
              <>
                <span className="text-emerald-400/80">{PROMPT}</span> {l.text}
              </>
            ) : (
              l.text
            )}
          </div>
        ))}
      </div>
      <div className="num flex h-11 shrink-0 items-center gap-2 border-t border-ink-700 px-3 pb-[env(safe-area-inset-bottom)] text-[12px] lg:h-9 lg:pb-0">
        <span className="text-emerald-400/80">{PROMPT}</span>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          spellCheck={false}
          autoComplete="off"
          aria-label="CLI command"
          placeholder="set_spin --z 4.2"
          className="min-w-0 flex-1 bg-transparent text-slate-100 caret-emerald-400 outline-none placeholder:text-slate-700"
        />
      </div>
    </div>
  )
}
