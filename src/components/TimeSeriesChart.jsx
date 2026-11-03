import { memo, useEffect, useRef } from 'react'

const GRID = 'rgba(148, 163, 184, 0.07)'
const AXIS_TEXT = '#64748b'
const FONT = '9.5px "IBM Plex Mono", ui-monospace, monospace'

function niceStep(range, target = 4) {
  const raw = range / target
  const mag = 10 ** Math.floor(Math.log10(raw || 1))
  const norm = raw / mag
  const step = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10
  return step * mag
}

function formatTick(v, step) {
  const digits = Math.max(0, Math.min(4, -Math.floor(Math.log10(step || 1))))
  return v.toFixed(digits)
}

/**
 * @param bandsRef   optional ref; .current = [{ from, to, color, label }] time intervals shaded behind the series
 *                   (read on every draw so the parent can update it without re-mounting the chart)
 * @param fillBand   optional { lo, hi, color } value band shaded on the left axis
 */
function TimeSeriesChart({ history, series, thresholds = [], windowSec = 6, symmetric = false, fixedRange, bandsRef, fillBand }) {
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const hasRight = series.some((s) => s.axis === 'right')
    let width = 0
    let height = 0
    let dpr = 1
    let raf = 0
    let lastVersion = -1
    let lastDraw = 0

    const resize = () => {
      const rect = wrapRef.current.getBoundingClientRect()
      dpr = Math.min(2, window.devicePixelRatio || 1)
      width = Math.max(1, rect.width)
      height = Math.max(1, rect.height)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      lastVersion = -1
    }
    const observer = new ResizeObserver(resize)
    observer.observe(wrapRef.current)
    resize()

    const range = (axis, tStart) => {
      if (axis === 'left' && fixedRange) return fixedRange
      let lo = Infinity
      let hi = -Infinity
      for (const s of series) {
        if ((s.axis ?? 'left') !== axis) continue
        const data = history.series[s.key]
        for (let k = 0; k < history.count; k++) {
          const i = history.index(k)
          if (history.series.t[i] < tStart) continue
          const v = data[i]
          if (!Number.isFinite(v)) continue
          if (v < lo) lo = v
          if (v > hi) hi = v
        }
      }
      if (axis === 'left') {
        for (const t of thresholds) {
          lo = Math.min(lo, t.value)
          hi = Math.max(hi, t.value)
        }
      }
      if (!Number.isFinite(lo)) return [0, 1]
      if (symmetric && axis === 'left') {
        const m = Math.max(Math.abs(lo), Math.abs(hi), 1e-6) * 1.12
        return [-m, m]
      }
      if (hi - lo < 1e-9) {
        const pad = Math.max(Math.abs(hi) * 0.1, 1e-3)
        return [lo - pad, hi + pad]
      }
      const pad = (hi - lo) * 0.1
      return [Math.min(lo - pad, lo >= 0 ? 0 : lo - pad), hi + pad]
    }

    const render = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)
      ctx.font = FONT
      const padL = 40
      const padR = hasRight ? 44 : 10
      const padT = 6
      const padB = 16
      const pw = Math.max(1, width - padL - padR)
      const ph = Math.max(1, height - padT - padB)

      if (history.count < 2) {
        ctx.fillStyle = AXIS_TEXT
        ctx.textAlign = 'center'
        ctx.fillText('AWAITING TELEMETRY', padL + pw / 2, padT + ph / 2)
        return
      }

      const tEnd = history.latest('t')
      const tFirst = history.get('t', 0)
      const tStart = Math.max(tFirst, tEnd - windowSec)
      const span = Math.max(tEnd - tStart, 1e-3)
      const left = range('left', tStart)
      const right = hasRight ? range('right', tStart) : null
      const x = (t) => padL + ((t - tStart) / span) * pw
      const yOf = (v, [lo, hi]) => padT + ph - ((v - lo) / (hi - lo)) * ph

      if (fillBand) {
        const y1 = Math.max(padT, Math.min(padT + ph, yOf(fillBand.hi, left)))
        const y2 = Math.max(padT, Math.min(padT + ph, yOf(fillBand.lo, left)))
        ctx.fillStyle = fillBand.color
        ctx.fillRect(padL, y1, pw, Math.max(0, y2 - y1))
      }
      const bands = bandsRef?.current ?? []
      for (const b of bands) {
        if (!Number.isFinite(b.from)) continue
        const to = Number.isFinite(b.to) ? b.to : tEnd
        if (to < tStart || b.from > tEnd) continue
        const x1 = Math.max(padL, x(b.from))
        const x2 = Math.min(padL + pw, x(to))
        ctx.fillStyle = b.color
        ctx.fillRect(x1, padT, Math.max(1, x2 - x1), ph)
        if (b.label && x2 - x1 > 30) {
          ctx.fillStyle = b.labelColor ?? AXIS_TEXT
          ctx.textAlign = 'left'
          ctx.textBaseline = 'top'
          ctx.fillText(b.label, x1 + 3, padT + 3)
        }
      }

      ctx.strokeStyle = GRID
      ctx.lineWidth = 1
      ctx.fillStyle = AXIS_TEXT
      const yStep = niceStep(left[1] - left[0])
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      for (let v = Math.ceil(left[0] / yStep) * yStep; v <= left[1] + 1e-9; v += yStep) {
        const yy = Math.round(yOf(v, left)) + 0.5
        ctx.beginPath()
        ctx.moveTo(padL, yy)
        ctx.lineTo(padL + pw, yy)
        ctx.stroke()
        ctx.fillText(formatTick(v, yStep), padL - 6, yy)
      }
      if (right) {
        const rStep = niceStep(right[1] - right[0])
        ctx.textAlign = 'left'
        for (let v = Math.ceil(right[0] / rStep) * rStep; v <= right[1] + 1e-9; v += rStep) {
          ctx.fillText(formatTick(v, rStep), padL + pw + 6, yOf(v, right))
        }
      }
      const tStep = niceStep(span, 5)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      for (let t = Math.ceil(tStart / tStep) * tStep; t <= tEnd + 1e-9; t += tStep) {
        const xx = Math.round(x(t)) + 0.5
        ctx.beginPath()
        ctx.moveTo(xx, padT)
        ctx.lineTo(xx, padT + ph)
        ctx.stroke()
        ctx.fillText(`${formatTick(t, tStep)}s`, xx, padT + ph + 4)
      }

      for (const th of thresholds) {
        const yy = Math.round(yOf(th.value, left)) + 0.5
        ctx.save()
        ctx.strokeStyle = th.color
        ctx.globalAlpha = 0.75
        ctx.setLineDash([4, 3])
        ctx.beginPath()
        ctx.moveTo(padL, yy)
        ctx.lineTo(padL + pw, yy)
        ctx.stroke()
        ctx.restore()
        if (th.label) {
          ctx.fillStyle = th.color
          ctx.textAlign = 'left'
          ctx.textBaseline = 'bottom'
          ctx.fillText(th.label, padL + 4, yy - 2)
        }
      }

      const stride = Math.max(1, Math.floor(history.count / (pw * 1.5)))
      ctx.save()
      ctx.beginPath()
      ctx.rect(padL, padT, pw, ph)
      ctx.clip()
      for (const s of series) {
        const axisRange = s.axis === 'right' ? right : left
        const data = history.series[s.key]
        ctx.strokeStyle = s.color
        ctx.lineWidth = 1.35
        ctx.setLineDash(s.dashed ? [3, 3] : [])
        ctx.beginPath()
        let started = false
        for (let k = 0; k < history.count; k += stride) {
          const i = history.index(k)
          const t = history.series.t[i]
          if (t < tStart) continue
          const v = data[i]
          if (!Number.isFinite(v)) continue
          const px = x(t)
          const py = yOf(v, axisRange)
          if (started) ctx.lineTo(px, py)
          else {
            ctx.moveTo(px, py)
            started = true
          }
        }
        ctx.stroke()
      }
      ctx.restore()

      ctx.textBaseline = 'middle'
      for (const s of series) {
        const v = history.latest(s.key)
        if (!Number.isFinite(v)) continue
        const axisRange = s.axis === 'right' ? right : left
        const py = Math.min(padT + ph - 6, Math.max(padT + 6, yOf(v, axisRange)))
        ctx.fillStyle = s.color
        ctx.beginPath()
        ctx.arc(padL + pw, py, 2.2, 0, Math.PI * 2)
        ctx.fill()
      }

      ctx.strokeStyle = 'rgba(148, 163, 184, 0.18)'
      ctx.strokeRect(padL + 0.5, padT + 0.5, pw - 1, ph - 1)
    }

    const loop = (now) => {
      raf = requestAnimationFrame(loop)
      if (history.version === lastVersion || now - lastDraw < 33) return
      lastVersion = history.version
      lastDraw = now
      render()
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [history, series, thresholds, windowSec, symmetric, fixedRange, bandsRef, fillBand])

  return (
    <div ref={wrapRef} className="absolute inset-0">
      <canvas
        ref={canvasRef}
        className="block"
        role="img"
        aria-label={`Time series of ${series.map((s) => s.label ?? s.key).join(', ')} over the last ${windowSec} s`}
      />
    </div>
  )
}

export default memo(TimeSeriesChart)
