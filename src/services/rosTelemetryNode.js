import { GRID } from '../physics/netTopology.js'
import { quatToMatrix } from '../physics/rigidBody.js'
import { CAPTURE_STATUS } from '../physics/stateLayout.js'

export const TOPICS = Object.freeze({
  ODOM: '/space_debris/cube_sat/odom',
  TENSION: '/space_debris/net/tension_mesh',
  CAPTURE: '/space_debris/gnc/capture_status',
  MOMENTUM: '/space_debris/gnc/angular_momentum',
})

export const QOS = Object.freeze({
  SENSOR_DATA: Object.freeze({ reliability: 'best_effort', durability: 'volatile', history: 'keep_last', depth: 5 }),
  DEFAULT: Object.freeze({ reliability: 'reliable', durability: 'volatile', history: 'keep_last', depth: 10 }),
  LATCHED: Object.freeze({ reliability: 'reliable', durability: 'transient_local', history: 'keep_last', depth: 1 }),
})

const RATE_WINDOW = 64
const NAME_PATTERN = /^\/[A-Za-z][\w]*(\/[A-Za-z][\w]*)*$/
const nowMs = () => performance.now()
const r6 = (v) => Math.round(v * 1e6) / 1e6

class TopicChannel {
  constructor(name, type, qos) {
    this.name = name
    this.type = type
    this.qos = qos
    this.publishers = new Set()
    this.subscriptions = new Set()
    this.lastMessage = null
    this.count = 0
    this.stamps = new Float64Array(RATE_WINDOW)
    this.stampHead = 0
    this.stampCount = 0
  }

  mark(t) {
    this.stamps[this.stampHead] = t
    this.stampHead = (this.stampHead + 1) % RATE_WINDOW
    this.stampCount = Math.min(this.stampCount + 1, RATE_WINDOW)
  }

  rate(t = nowMs()) {
    if (this.stampCount < 2) return 0
    const newest = this.stamps[(this.stampHead - 1 + RATE_WINDOW) % RATE_WINDOW]
    if (t - newest > 1000) return 0
    const oldest = this.stamps[(this.stampHead - this.stampCount + RATE_WINDOW) % RATE_WINDOW]
    return newest > oldest ? ((this.stampCount - 1) * 1000) / (newest - oldest) : 0
  }
}

class RosNode {
  constructor(graph, name, namespace) {
    this.graph = graph
    this.name = name
    this.namespace = namespace
    this.fullyQualifiedName = `${namespace.replace(/\/$/, '')}/${name}`
    this.handles = new Set()
  }

  createPublisher(type, topic, qos = QOS.DEFAULT) {
    const channel = this.graph.channel(topic, type, qos)
    const handle = {
      topic,
      type,
      node: this.fullyQualifiedName,
      publish: (msg) => this.graph.publish(channel, msg),
      destroy: () => {
        channel.publishers.delete(handle)
        this.handles.delete(handle)
      },
    }
    channel.publishers.add(handle)
    this.handles.add(handle)
    this.graph.notify()
    return handle
  }

  createSubscription(type, topic, callback, qos = QOS.DEFAULT) {
    const channel = this.graph.channel(topic, type, qos)
    const handle = {
      topic,
      type,
      callback,
      destroy: () => {
        channel.subscriptions.delete(handle)
        this.handles.delete(handle)
      },
    }
    channel.subscriptions.add(handle)
    this.handles.add(handle)
    if (channel.qos.durability === 'transient_local' && qos.durability === 'transient_local' && channel.lastMessage) {
      callback(channel.lastMessage)
    }
    this.graph.notify()
    return handle
  }

  destroy() {
    for (const handle of [...this.handles]) handle.destroy()
    this.graph.nodes.delete(this)
    this.graph.notify()
  }
}

/** rosbridge v2 protocol link (rosbridge_suite) for streaming topics into a live ROS 2 / Gazebo graph. */
class RosbridgeLink {
  constructor(graph, url) {
    this.graph = graph
    this.url = url
    this.status = 'connecting'
    this.sent = 0
    this.error = null
    this.advertised = new Set()
    this.lastSent = new Map()
    this.minIntervalMs = 50
    try {
      this.ws = new WebSocket(url)
    } catch (err) {
      this.status = 'error'
      this.error = err.message
      return
    }
    this.ws.onopen = () => {
      this.status = 'connected'
      for (const channel of graph.topics.values()) this.advertise(channel)
      graph.notify()
    }
    this.ws.onerror = () => {
      this.status = 'error'
      this.error = `cannot reach ${url}`
      graph.notify()
    }
    this.ws.onclose = () => {
      if (this.status !== 'error') this.status = 'closed'
      graph.notify()
    }
  }

  send(payload) {
    if (this.ws?.readyState !== 1) return
    this.ws.send(JSON.stringify(payload))
    this.sent++
  }

  advertise(channel) {
    if (this.status !== 'connected' || this.advertised.has(channel.name)) return
    this.send({ op: 'advertise', id: `advertise:${channel.name}`, topic: channel.name, type: channel.type })
    this.advertised.add(channel.name)
  }

  forward(channel, msg) {
    if (this.status !== 'connected') return
    const t = nowMs()
    if (t - (this.lastSent.get(channel.name) ?? 0) < this.minIntervalMs) return
    this.lastSent.set(channel.name, t)
    this.advertise(channel)
    this.send({ op: 'publish', topic: channel.name, msg })
  }

  close() {
    this.status = 'closed'
    try {
      this.ws?.close()
    } catch {
      // socket already torn down
    }
  }
}

/** In-memory DDS-style graph: typed topics, QoS durability, per-topic rate estimation. */
export class RosGraph {
  constructor() {
    this.topics = new Map()
    this.nodes = new Set()
    this.bridge = null
    this.listeners = new Set()
  }

  createNode(name, namespace = '/') {
    const node = new RosNode(this, name, namespace)
    this.nodes.add(node)
    this.notify()
    return node
  }

  channel(name, type, qos) {
    if (!NAME_PATTERN.test(name)) throw new Error(`Invalid ROS 2 topic name: ${name}`)
    let channel = this.topics.get(name)
    if (!channel) {
      channel = new TopicChannel(name, type, qos)
      this.topics.set(name, channel)
      this.bridge?.advertise(channel)
    } else if (channel.type !== type) {
      throw new Error(`Type mismatch on ${name}: ${channel.type} ≠ ${type}`)
    }
    return channel
  }

  publish(channel, msg) {
    channel.lastMessage = msg
    channel.count++
    channel.mark(nowMs())
    for (const sub of channel.subscriptions) sub.callback(msg)
    this.bridge?.forward(channel, msg)
  }

  listTopics() {
    const t = nowMs()
    return [...this.topics.values()].map((channel) => ({
      name: channel.name,
      type: channel.type,
      count: channel.count,
      hz: channel.rate(t),
      publishers: channel.publishers.size,
      subscriptions: channel.subscriptions.size,
      qos: channel.qos,
    }))
  }

  topic(name) {
    return this.topics.get(name) ?? null
  }

  lastMessage(name) {
    return this.topics.get(name)?.lastMessage ?? null
  }

  nodeNames() {
    return [...this.nodes].map((node) => node.fullyQualifiedName)
  }

  subscribe(fn) {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  notify() {
    for (const fn of this.listeners) fn()
  }

  connectBridge(url) {
    this.disconnectBridge()
    this.bridge = new RosbridgeLink(this, url)
    this.notify()
    return this.bridge
  }

  disconnectBridge() {
    if (!this.bridge) return
    this.bridge.close()
    this.bridge = null
    this.notify()
  }

  bridgeState() {
    if (!this.bridge) return { url: null, status: 'offline', sent: 0, error: null }
    return { url: this.bridge.url, status: this.bridge.status, sent: this.bridge.sent, error: this.bridge.error }
  }
}

export const msgs = {
  time(t) {
    const sec = Math.floor(t)
    return { sec, nanosec: Math.min(999999999, Math.round((t - sec) * 1e9)) }
  },
  header(t, frameId) {
    return { stamp: msgs.time(t), frame_id: frameId }
  },
  vector3(v) {
    return { x: r6(v[0]), y: r6(v[1]), z: r6(v[2]) }
  },
  string(data) {
    return { data }
  },
}

const ZERO_COVARIANCE = Object.freeze(new Array(36).fill(0))
const R = new Float64Array(9)

export function createTwinTelemetryNode(graph) {
  const node = graph.createNode('gnc_twin_node', '/space_debris')
  const odom = node.createPublisher('nav_msgs/msg/Odometry', TOPICS.ODOM, QOS.SENSOR_DATA)
  const tension = node.createPublisher('std_msgs/msg/Float32MultiArray', TOPICS.TENSION, QOS.SENSOR_DATA)
  const status = node.createPublisher('std_msgs/msg/String', TOPICS.CAPTURE, QOS.LATCHED)
  const momentum = node.createPublisher('geometry_msgs/msg/Vector3Stamped', TOPICS.MOMENTUM, QOS.SENSOR_DATA)
  let lastStatus = null
  let frame = 0

  return {
    node,
    publish(snapshot, strains) {
      const { t, q, w, p, v, h } = snapshot
      quatToMatrix(q[0], q[1], q[2], q[3], R)
      const vBody = [
        R[0] * v[0] + R[3] * v[1] + R[6] * v[2],
        R[1] * v[0] + R[4] * v[1] + R[7] * v[2],
        R[2] * v[0] + R[5] * v[1] + R[8] * v[2],
      ]
      odom.publish({
        header: msgs.header(t, 'lvlh'),
        child_frame_id: 'cubesat_12u/base_link',
        pose: {
          pose: {
            position: msgs.vector3(p),
            orientation: { x: r6(q[1]), y: r6(q[2]), z: r6(q[3]), w: r6(q[0]) },
          },
          covariance: ZERO_COVARIANCE,
        },
        twist: {
          twist: { linear: msgs.vector3(vBody), angular: msgs.vector3(w) },
          covariance: ZERO_COVARIANCE,
        },
      })
      momentum.publish({ header: msgs.header(t, 'lvlh'), vector: msgs.vector3(h) })

      if (frame++ % 2 === 0) {
        const data = new Array(strains.length)
        for (let i = 0; i < strains.length; i++) data[i] = r6(strains[i])
        tension.publish({
          layout: {
            dim: [
              { label: 'rows', size: GRID, stride: GRID * GRID },
              { label: 'cols', size: GRID, stride: GRID },
            ],
            data_offset: 0,
          },
          data,
        })
      }

      const current = CAPTURE_STATUS[snapshot.phase]
      if (current !== lastStatus) {
        lastStatus = current
        status.publish(msgs.string(current))
      }
    },
    destroy() {
      node.destroy()
    },
  }
}

export const rosGraph = new RosGraph()
