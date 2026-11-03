import { useEffect, useReducer, useRef, useState } from 'react'
import { TOPICS } from '../services/rosTelemetryNode.js'
import { compactMessage, highlightJson } from '../services/messageFormat.js'
import { Button, Label, Led, cx } from './ui.jsx'

const BRIDGE_TONE = Object.freeze({ connected: 'ok', connecting: 'warn', error: 'alert', closed: 'off', offline: 'off' })

export default function TopicMonitor({ graph }) {
  const [, refresh] = useReducer((x) => x + 1, 0)
  const [selected, setSelected] = useState(TOPICS.ODOM)
  const [frozen, setFrozen] = useState(false)
  const [url, setUrl] = useState('ws://localhost:9090')
  const frozenMessage = useRef(null)

  useEffect(() => {
    const id = setInterval(refresh, 250)
    const unsubscribe = graph.subscribe(refresh)
    return () => {
      clearInterval(id)
      unsubscribe()
    }
  }, [graph])

  const topics = graph.listTopics()
  const live = graph.lastMessage(selected)
  const message = frozen ? frozenMessage.current : live
  const json = message ? JSON.stringify(compactMessage(message), null, 2) : null
  const bridge = graph.bridgeState()
  const channel = graph.topic(selected)

  const toggleFreeze = () => {
    frozenMessage.current = live
    setFrozen((f) => !f)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-ink-700 px-3 py-2.5">
        <div className="flex items-center justify-between">
          <Label>ROS 2 graph</Label>
          <span className="num text-[10px] text-slate-600">DDS emulation · in-memory</span>
        </div>
        <div className="num mt-1 truncate text-[11px] text-slate-300">{graph.nodeNames()[0] ?? '—'}</div>
      </div>

      <div className="border-b border-ink-700">
        <div className="num grid grid-cols-[minmax(0,1fr)_52px_56px] px-3 py-1.5 text-[9.5px] uppercase tracking-[0.1em] text-slate-600">
          <span>Topic</span>
          <span className="text-right">Rate</span>
          <span className="text-right">Msgs</span>
        </div>
        {topics.map((t) => (
          <button
            key={t.name}
            type="button"
            onClick={() => {
              setSelected(t.name)
              setFrozen(false)
            }}
            className={cx(
              'grid w-full grid-cols-[minmax(0,1fr)_52px_56px] items-center px-3 py-[6px] text-left transition-colors',
              selected === t.name ? 'bg-ink-800' : 'hover:bg-ink-850',
            )}
          >
            <span className="min-w-0">
              <span className="num block truncate text-[11px] text-slate-200">{t.name}</span>
              <span className="num block truncate text-[10px] text-slate-500">{t.type}</span>
            </span>
            <span className={cx('num text-right text-[11px]', t.hz > 0 ? 'text-emerald-400' : 'text-slate-600')}>
              {t.hz > 0 ? t.hz.toFixed(1) : '—'}
            </span>
            <span className="num text-right text-[11px] text-slate-400">{t.count.toLocaleString()}</span>
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <span className="num truncate text-[10.5px] text-slate-400">
            <span className="text-slate-600">$ ros2 topic echo </span>
            {selected}
          </span>
          <div className="flex shrink-0 gap-1">
            <Button variant="subtle" className="h-6 px-2 text-[10.5px]" onClick={toggleFreeze}>
              {frozen ? 'Live' : 'Freeze'}
            </Button>
            <Button
              variant="subtle"
              className="h-6 px-2 text-[10.5px]"
              disabled={!message}
              onClick={() => navigator.clipboard?.writeText(JSON.stringify(message, null, 2))}
            >
              Copy
            </Button>
          </div>
        </div>
        {channel && (
          <div className="num px-3 pb-1.5 text-[10px] text-slate-600">
            QoS {channel.qos.reliability} · {channel.qos.durability} · depth {channel.qos.depth}
          </div>
        )}
        <pre
          className="scroll-thin num mx-3 mb-3 min-h-[140px] flex-1 overflow-auto border border-ink-700 bg-ink-950 p-2.5 text-[10.5px] leading-[15px] text-slate-300"
          dangerouslySetInnerHTML={{ __html: json ? highlightJson(json) : '<span class="text-slate-600">waiting for first message…</span>' }}
        />
      </div>

      <div className="border-t border-ink-700 px-3 py-2.5">
        <div className="flex items-center justify-between">
          <Label>rosbridge link</Label>
          <Led label={bridge.status.toUpperCase()} tone={BRIDGE_TONE[bridge.status] ?? 'off'} />
        </div>
        <div className="mt-2 flex gap-1.5">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            spellCheck={false}
            className="num h-7 min-w-0 flex-1 rounded-[3px] border border-ink-600 bg-ink-950 px-2 text-[11px] text-slate-200 outline-none focus:border-slate-400"
          />
          {bridge.status === 'connected' || bridge.status === 'connecting' ? (
            <Button variant="ghost" className="h-7 px-2.5" onClick={() => graph.disconnectBridge()}>
              Disconnect
            </Button>
          ) : (
            <Button variant="ghost" className="h-7 px-2.5" onClick={() => graph.connectBridge(url)}>
              Connect
            </Button>
          )}
        </div>
        <p className="mt-1.5 text-[10.5px] leading-snug text-slate-500">
          rosbridge v2 client (rosbridge_suite protocol), ≤20 Hz per topic. Not exercised against a live rosbridge_server in this release: NOT MEASURED
          {bridge.sent ? ` · ${bridge.sent.toLocaleString()} msgs sent` : ''}.
        </p>
      </div>
    </div>
  )
}
