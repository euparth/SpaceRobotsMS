export function cx(...parts) {
  return parts.filter(Boolean).join(' ')
}

export function fmt(value, digits = 3, { sign = false } = {}) {
  if (value == null || Number.isNaN(value)) return '—'
  if (!Number.isFinite(value)) return '∞'
  const rounded = Number(value.toFixed(digits))
  const body = Math.abs(rounded).toFixed(digits)
  if (sign) return `${rounded < 0 ? '−' : '+'}${body}`
  return rounded < 0 ? `−${body}` : body
}

export const TONE_TEXT = Object.freeze({
  default: 'text-slate-100',
  muted: 'text-slate-500',
  ok: 'text-emerald-400',
  warn: 'text-amber-400',
  alert: 'text-red-400',
  info: 'text-sky-300',
})

const LED_TONE = Object.freeze({
  ok: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.75)]',
  warn: 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.7)]',
  alert: 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.9)] animate-blink',
  info: 'bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.7)]',
  off: 'bg-ink-600',
})

export function Led({ label, short, tone = 'off', title }) {
  return (
    <div title={title} className="flex shrink-0 items-center gap-1.5">
      <span className={cx('h-[7px] w-[7px] rounded-[1px]', LED_TONE[tone])} />
      <span className={cx('num whitespace-nowrap text-[10.5px] tracking-[0.06em]', tone === 'off' ? 'text-slate-600' : 'text-slate-300')}>
        {short ? (
          <>
            <span className="lg:hidden">{short}</span>
            <span className="hidden lg:inline">{label}</span>
          </>
        ) : (
          label
        )}
      </span>
    </div>
  )
}

export function Label({ children, className }) {
  return (
    <span className={cx('text-[10.5px] font-medium uppercase tracking-[0.13em] text-slate-500', className)}>{children}</span>
  )
}

export function Section({ title, aside, children, className, bodyClassName }) {
  return (
    <section className={cx('border-b border-ink-700/80', className)}>
      <header className="flex h-8 items-center justify-between px-3">
        <Label>{title}</Label>
        {aside}
      </header>
      <div className={cx('px-3 pb-3', bodyClassName)}>{children}</div>
    </section>
  )
}

export function Readout({ label, value, unit, tone = 'default', className }) {
  return (
    <div className={cx('flex h-[22px] items-center justify-between gap-3', className)}>
      <span className="truncate text-[11.5px] text-slate-400">{label}</span>
      <span className={cx('num whitespace-nowrap text-[12px]', TONE_TEXT[tone])}>
        {value}
        {unit && <span className="ml-1 text-[10.5px] text-slate-500">{unit}</span>}
      </span>
    </div>
  )
}

export function Metric({ label, value, unit, tone = 'default', fill }) {
  return (
    <div className="relative bg-ink-900 px-2.5 py-2">
      <Label className="text-[9.5px]">{label}</Label>
      <div className={cx('num mt-1 text-[15px] leading-none', TONE_TEXT[tone])}>
        {value}
        {unit && <span className="ml-1 text-[10px] text-slate-500">{unit}</span>}
      </div>
      {fill != null && (
        <div className="mt-2 h-[2px] bg-ink-700">
          <div
            className={cx('h-full transition-[width] duration-150', tone === 'alert' ? 'bg-red-400' : tone === 'ok' ? 'bg-emerald-400' : 'bg-slate-300')}
            style={{ width: `${Math.max(0, Math.min(1, fill)) * 100}%` }}
          />
        </div>
      )}
    </div>
  )
}

const BUTTON_VARIANT = Object.freeze({
  primary: 'bg-slate-100 text-ink-950 hover:bg-white disabled:bg-ink-700 disabled:text-slate-500',
  ghost: 'border border-ink-600 text-slate-300 hover:border-slate-400 hover:text-slate-100 disabled:opacity-40',
  danger: 'border border-red-500/40 text-red-300 hover:border-red-400 hover:bg-red-500/10 disabled:opacity-40',
  subtle: 'text-slate-400 hover:bg-ink-800 hover:text-slate-200 disabled:opacity-40',
})

export function Button({ variant = 'ghost', className, children, ...props }) {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex h-8 items-center justify-center gap-2 rounded-[3px] px-3 text-[12px] font-medium tracking-[0.02em] transition-colors disabled:cursor-not-allowed',
        BUTTON_VARIANT[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export function Kbd({ children }) {
  return (
    <kbd className="num rounded-[3px] border border-ink-600 bg-ink-850 px-1 text-[10px] leading-[16px] text-slate-400">{children}</kbd>
  )
}

export function Segmented({ options, value, onChange, className }) {
  return (
    <div className={cx('flex h-7 items-stretch rounded-[3px] border border-ink-600 bg-ink-950/80 p-[2px] backdrop-blur', className)}>
      {options.map((opt) => {
        const active = Array.isArray(value) ? value.includes(opt.id) : value === opt.id
        return (
          <button
            key={opt.id}
            type="button"
            title={opt.title}
            onClick={() => onChange(opt.id)}
            className={cx(
              'num rounded-[2px] px-2 text-[10.5px] tracking-[0.06em] transition-colors',
              active ? 'bg-ink-700 text-slate-100' : 'text-slate-500 hover:text-slate-300',
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
