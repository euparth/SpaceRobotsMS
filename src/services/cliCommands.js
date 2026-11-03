import { CAPTURE, UI_PRESETS as PRESETS } from '../physics/constants.js'
import { predictOutcome } from '../physics/rigidBody.js'
import { CAPTURE_STATUS, PHASE } from '../physics/stateLayout.js'
import { compactMessage } from './messageFormat.js'

export const COMMANDS = Object.freeze([
  { name: 'help', usage: 'help', summary: 'List commands' },
  { name: 'set_spin', usage: 'set_spin [--x n] [--y n] [--z n]', summary: 'Command initial body rates ω₀ [rad/s, 0–5]' },
  { name: 'preset', usage: 'preset <S1|S2|S3|S4|S5>', summary: 'Load a thesis scenario' },
  { name: 'launch_net', usage: 'launch_net', summary: 'Fire the Kevlar 49 net at 10.0 m/s' },
  { name: 'reset', usage: 'reset', summary: 'Re-initialise target and stow net' },
  { name: 'pause', usage: 'pause', summary: 'Freeze the physics worker' },
  { name: 'resume', usage: 'resume', summary: 'Resume integration' },
  { name: 'time_scale', usage: 'time_scale <0.02–1.0>', summary: 'Sim-time / wall-time ratio' },
  { name: 'predict', usage: 'predict', summary: 'Polhode envelope of |ωz| for ω₀' },
  { name: 'status', usage: 'status', summary: 'Current GNC state vector' },
  { name: 'set_param', usage: 'set_param --eta <1e-4–0.1> | --coupling <one-way|two-way> | --drawstring <on|off>', summary: 'Mesh efficiency η, net→body coupling, drawstring servo' },
  { name: 'export_telemetry', usage: 'export_telemetry [--format json|csv]', summary: 'Download the telemetry dataset' },
  { name: 'ros2', usage: 'ros2 topic list|echo|hz|info · node list · bridge', summary: 'ROS 2 graph introspection' },
  { name: 'show_topics', usage: 'show_topics', summary: 'Topic table: type, rate, message count' },
  { name: 'view', usage: 'view <iso|front|side|top|track>', summary: 'Viewport camera preset' },
  { name: 'ai', usage: 'ai status | fire | toggle', summary: 'PINN surrogate status, arm auto-fire, or toggle' },
  { name: 'clear', usage: 'clear', summary: 'Clear the terminal' },
])

const line = (text, kind = 'out') => ({ kind, text })
const ok = (text) => ({ lines: [line(text, 'ok')] })
const warn = (text) => ({ lines: [line(text, 'warn')] })
const fail = (text) => ({ lines: [line(text, 'err')] })
const f3 = (v) => (Number.isFinite(v) ? v.toFixed(3) : '—')

export function tokenize(input) {
  return (input.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map((t) => t.replace(/^['"]|['"]$/g, ''))
}

export function parseArgs(tokens) {
  const flags = {}
  const args = []
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (t.startsWith('--')) {
      const [key, inline] = t.slice(2).split('=')
      if (inline !== undefined) flags[key] = inline
      else if (i + 1 < tokens.length && !tokens[i + 1].startsWith('--')) flags[key] = tokens[++i]
      else flags[key] = true
    } else if (/^-[a-z]$/i.test(t)) {
      flags[t.slice(1)] = true
    } else {
      args.push(t)
    }
  }
  return { flags, args }
}

function forecastLine(w) {
  const p = predictOutcome(w)
  return line(
    `polhode peak |ωz| ${f3(p.peak)} rad/s · limit ${f3(CAPTURE.wzLimit)} · forecast ${p.verdict}`,
    p.verdict === 'SECURE' ? 'dim' : 'warn',
  )
}

function ros2(args, flags, ctx) {
  const graph = ctx.sim.graph
  const [group, verb, target] = args

  if (group === 'node' && verb === 'list') return { lines: graph.nodeNames().map((n) => line(n)) }

  if (group === 'topic') {
    if (verb === 'list') {
      return { lines: graph.listTopics().map((t) => line(flags.t ? `${t.name} [${t.type}]` : t.name)) }
    }
    if (!['echo', 'hz', 'info'].includes(verb)) return fail('usage: ros2 topic <list|echo|hz|info> [topic]')
    if (!target) return fail(`usage: ros2 topic ${verb} <topic>`)
    const channel = graph.topic(target)
    if (!channel) return fail(`unknown topic ${target}`)
    if (verb === 'echo') {
      const msg = graph.lastMessage(target)
      if (!msg) return warn('no message received yet')
      return { lines: JSON.stringify(compactMessage(msg), null, 2).split('\n').map((l) => line(l, 'json')) }
    }
    if (verb === 'hz') {
      return { lines: [line(`average rate: ${channel.rate().toFixed(2)} Hz`), line(`messages: ${channel.count}`, 'dim')] }
    }
    return {
      lines: [
        line(`Type: ${channel.type}`),
        line(`Publisher count: ${channel.publishers.size}`),
        line(`Subscription count: ${channel.subscriptions.size}`),
        line(`QoS: ${channel.qos.reliability} · ${channel.qos.durability} · depth ${channel.qos.depth}`, 'dim'),
      ],
    }
  }

  if (group === 'bridge') {
    if (verb === 'connect') {
      const url = target ?? 'ws://localhost:9090'
      if (!/^wss?:\/\//.test(url)) return fail('bridge URL must start with ws:// or wss://')
      graph.connectBridge(url)
      return ok(`rosbridge → connecting to ${url}`)
    }
    if (verb === 'disconnect') {
      graph.disconnectBridge()
      return ok('rosbridge disconnected')
    }
    const state = graph.bridgeState()
    return { lines: [line(`rosbridge: ${state.status}${state.url ? ` · ${state.url}` : ''} · ${state.sent} msgs sent`)] }
  }

  return fail('usage: ros2 topic <list|echo|hz|info> [topic] · ros2 node list · ros2 bridge <connect [url]|disconnect|status>')
}

export function executeCommand(input, ctx) {
  const tokens = tokenize(input.trim())
  if (!tokens.length) return { lines: [] }
  if (tokens[0] === '/cli') tokens.shift()
  if (!tokens.length) return { lines: [] }
  const name = tokens[0].replace(/^\//, '')
  const { flags, args } = parseArgs(tokens.slice(1))
  const { sim } = ctx

  switch (name) {
    case 'help':
      return {
        lines: [
          line('GNC workbench CLI · commands', 'dim'),
          ...COMMANDS.map((c) => line(`  ${c.usage.padEnd(44)} ${c.summary}`)),
          line('keys: L launch · R reset · Space pause · 1–5 presets · / or ` toggle CLI · ↑↓ history · Tab complete', 'dim'),
        ],
      }
    case 'clear':
      return { lines: [], clear: true }
    case 'set_spin': {
      const next = [...sim.getCommanded()]
      let touched = false
      for (const [i, axis] of ['x', 'y', 'z'].entries()) {
        if (flags[axis] === undefined) continue
        const v = Number(flags[axis])
        if (!Number.isFinite(v)) return fail(`invalid --${axis} value "${flags[axis]}"`)
        next[i] = v
        touched = true
      }
      if (!touched) return fail('usage: set_spin [--x n] [--y n] [--z n]')
      const { armed, w } = sim.setSpin(next)
      return {
        lines: [
          line(`ω₀ ← [${w.map(f3).join(', ')}] rad/s${armed ? '' : ' · staged until reset'}`, 'ok'),
          forecastLine(w),
        ],
      }
    }
    case 'preset': {
      const preset = sim.applyPreset(args[0] ?? '')
      if (!preset) return fail(`usage: preset <${PRESETS.map((p) => p.id).join('|')}>`)
      return { lines: [line(`${preset.id} ${preset.name} · ω₀ [${preset.w.map(f3).join(', ')}] rad/s`, 'ok'), forecastLine(preset.w)] }
    }
    case 'launch_net': {
      const s = sim.getSnapshot()
      if (s && s.phase !== PHASE.IDLE) return warn('net already deployed — run reset first')
      sim.launch()
      return ok('launch_net → command dispatched to physics worker')
    }
    case 'reset':
      sim.reset()
      return ok('reset → target re-initialised, net stowed')
    case 'pause':
      sim.pause()
      return ok('physics worker paused')
    case 'resume':
      sim.resume()
      return ok('physics worker resumed')
    case 'time_scale': {
      const v = Number(args[0] ?? flags.value)
      if (!(v >= 0.02 && v <= 1)) return fail('usage: time_scale <0.02–1.0>')
      sim.setTimeScale(v)
      return ok(`time scale ← ${v.toFixed(2)}×`)
    }
    case 'predict': {
      const w = sim.getCommanded()
      const p = predictOutcome(w)
      return {
        lines: [
          line(`ω₀ [${w.map(f3).join(', ')}] rad/s`),
          line(`|ωz| envelope ${f3(p.floor)} … ${f3(p.peak)} rad/s${p.constant ? ' (constant — equilibrium spin)' : ''}`),
          forecastLine(w),
        ],
      }
    }
    case 'status': {
      const s = sim.getSnapshot()
      if (!s) return warn('no telemetry yet')
      return {
        lines: [
          line(`phase ${s.phaseLabel} · status ${CAPTURE_STATUS[s.phase]} · t ${s.t.toFixed(3)} s`),
          line(`ω [${s.w.map(f3).join(', ')}] rad/s · |ωz| ${f3(Math.abs(s.w[2]))} / ${f3(CAPTURE.wzLimit)}`),
          line(`q [${s.q.map((v) => v.toFixed(4)).join(', ')}] · θ_nut ${s.nutation.toFixed(2)}°`),
          line(`H [${s.h.map(f3).join(', ')}] N·m·s · T ${f3(s.ke)} J · J_net ${f3(s.eNet)} J`),
          line(`enclosure ${(s.enclosure * 100).toFixed(1)}% · ε_max ${(s.strainMax * 100).toFixed(2)}% · contacts ${s.contacts}`, 'dim'),
        ],
      }
    }
    case 'set_param': {
      if (flags.coupling !== undefined) {
        if (flags.coupling !== 'one-way' && flags.coupling !== 'two-way') return fail('--coupling takes one-way | two-way')
        sim.setParam('coupling', flags.coupling)
        return ok(`net→body coupling ← ${flags.coupling}${flags.coupling === 'two-way' ? ' (experimental; see /methods#two-way)' : ''}`)
      }
      if (flags.drawstring !== undefined) {
        if (flags.drawstring !== 'on' && flags.drawstring !== 'off') return fail('--drawstring takes on | off')
        sim.setParam('drawstring', flags.drawstring === 'on')
        return ok(`drawstring servo ← ${flags.drawstring}`)
      }
      if (flags.eta === undefined) return fail('usage: set_param --eta <1e-4–0.1> | --coupling <one-way|two-way> | --drawstring <on|off>')
      const v = Number(flags.eta)
      if (!(v >= 1e-4 && v <= 0.1)) return fail('η must be within 1e-4 … 0.1')
      sim.setParam('eta', v)
      return ok(`η_weave ← ${v}`)
    }
    case 'export_telemetry': {
      const format = String(flags.format ?? args[0] ?? 'json').toLowerCase()
      if (!['json', 'csv'].includes(format)) return fail('usage: export_telemetry [--format json|csv]')
      const result = sim.exportTelemetry(format)
      return result.ok ? ok(`exported ${result.samples} samples → ${result.filename}`) : warn(result.message)
    }
    case 'ros2':
      return ros2(args, flags, ctx)
    case 'show_topics':
      return {
        lines: sim.graph.listTopics().map((t) =>
          line(`${t.name.padEnd(36)} ${t.type.padEnd(34)} ${t.hz.toFixed(1).padStart(5)} Hz ${String(t.count).padStart(7)} msgs`),
        ),
      }
    case 'view': {
      if (!ctx.views.includes(args[0])) return fail(`usage: view <${ctx.views.join('|')}>`)
      ctx.setView(args[0])
      return ok(`viewport → ${args[0]}`)
    }
    case 'ai': {
      const sub = (args[0] ?? 'status').toLowerCase()
      const ai = ctx.ai
      if (!ai) return fail('AI surrogate not wired')
      if (sub === 'toggle') {
        ai.toggle()
        return ok(`AI predictor → ${ai.enabled ? 'OFF' : 'ON'} (toggled)`)
      }
      if (sub === 'fire') {
        if (!ai.enabled) return warn('AI predictor is OFF — ai toggle first')
        const p = ai.prediction
        if (!p) return warn('no prediction yet')
        const n = sim.getVerdicts?.()?.numeric
        const okArm = ai.armAutoFire()
        const delay = n ? (n.fireNowSecure ? 0 : n.firstSecureDelayMs) : null
        return okArm
          ? ok(`auto-fire armed · delay ${delay} ms sim (RK4 secure window) · PINN estimate ${p.firstSecureMs ?? (p.fireNowSecure ? 0 : 'none')} ms (test MAE 703 ms)`)
          : warn('could not arm auto-fire (no secure window in 0–3.2 s, or not idle)')
      }
      if (sub === 'status') {
        const p = ai.prediction
        if (!ai.enabled) return ok('AI predictor OFF')
        if (!p) return warn('AI predictor ON · waiting for first inference')
        return {
          lines: [
            line(`AI ${p.modelLabel} · fidelity ${(100 * (p.pinnFidelityScore ?? 0)).toFixed(1)}% · latency ${f3(p.inferenceLatencyMs)} ms`),
            line(p.statusText, p.fireNowSecure ? 'ok' : 'warn'),
            line(
              `P(secure)=${f3(p.captureProbability)}% · peak |ωz|̂ ${f3(p.peakWzPred)} · delay ${p.optimalLaunchDelayMs} ms · ε̂ ${(100 * p.peakStrain).toFixed(2)}% · T̂ ${f3(p.peakTensionN)} N`,
            ),
            line(
              `speedup ${f3(p.solverSpeedupFactor)}× vs coupled ${f3(p.coupledRolloutMs)} ms (rigid ${f3(p.rigidRolloutMs)} ms)`,
              'dim',
            ),
          ],
        }
      }
      return fail('usage: ai status | fire | toggle')
    }
    default:
      return fail(`command not found: ${name} — type 'help'`)
  }
}
