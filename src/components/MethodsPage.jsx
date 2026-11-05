import { useEffect } from 'react'
import { BUILD, buildLabel } from '../build.js'
import { CAPTURE, CUBESAT, NET, PRESET_S5, SOLVER } from '../physics/constants.js'
import { NET_MASS, NODE_COUNT, SEGMENT_COUNT } from '../physics/netTopology.js'
import { FLIGHT_TIME, CONTACT_WINDOW } from '../physics/captureLabel.js'
import priorsSource from '../physics/priors.js?raw'
import {
  CLOSED_FORM,
  CONVERGENCE,
  CONVERGENCE_FINE,
  DATASET_HASHES,
  DRIFT,
  INERTIA_BOX,
  MACHINE,
  MISCLASS,
  PINN_METRICS,
  PRESET_TABLE,
  PRIOR_HASHES,
  PRIOR_TABLE,
  SINGLE_AXIS,
  TIMING,
  TWO_WAY,
  WEIGHTS_SHA256,
} from '../methods/measured.js'
import { README_LIMITATIONS, RELEASE_LIMITATIONS } from '../methods/limitations.js'

const [IX, IY, IZ] = CUBESAT.inertia

/** The sampling code as shipped, quoted from the module source (Vite ?raw import). */
function quoteFunction(src, name) {
  const start = src.indexOf(`export function ${name}(`)
  if (start < 0) return `// ${name} not found`
  let depth = 0
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') {
      depth--
      if (depth === 0) return src.slice(start, i + 1)
    }
  }
  return src.slice(start)
}

const NAV = [
  ['model', '1. Model'],
  ['verification', '2. Verification'],
  ['results', '3. Results'],
  ['limitations', '4. Limitations'],
  ['provenance', '5. Provenance'],
  ['reproduce', '6. Reproduction'],
]

function H2({ id, children }) {
  return (
    <h2 id={id} className="mt-12 scroll-mt-20 border-b border-ink-700 pb-2 text-[20px] font-medium text-slate-100">
      <a href={`#${id}`} className="hover:underline">
        {children}
      </a>
    </h2>
  )
}
function H3({ id, children }) {
  return (
    <h3 id={id} className="mt-8 scroll-mt-20 text-[15px] font-medium text-slate-200">
      {id ? (
        <a href={`#${id}`} className="hover:underline">
          {children}
        </a>
      ) : (
        children
      )}
    </h3>
  )
}
function P({ children }) {
  return <p className="mt-3 text-[13.5px] leading-relaxed text-slate-300">{children}</p>
}
function Code({ children }) {
  return <code className="num rounded-[2px] bg-ink-850 px-1 py-px text-[12px] text-slate-200">{children}</code>
}
function Pre({ children, label }) {
  return (
    <pre className="num mt-3 overflow-x-auto rounded-[3px] border border-ink-700 bg-ink-925 p-3 text-[11.5px] leading-relaxed text-slate-300" aria-label={label}>
      {children}
    </pre>
  )
}
function Eq({ children }) {
  return <div className="num mt-3 overflow-x-auto rounded-[3px] bg-ink-900 px-3 py-2 text-[13px] text-slate-100">{children}</div>
}
function Table({ caption, head, rows, className }) {
  return (
    <div className={`mt-3 overflow-x-auto ${className ?? ''}`}>
      <table className="num w-full border-collapse text-[12px]">
        {caption && <caption className="pb-1.5 text-left text-[12px] text-slate-500">{caption}</caption>}
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} className="border-b border-ink-600 px-2 py-1 text-left font-medium text-slate-400">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="odd:bg-ink-925/60">
              {r.map((c, j) => (
                <td key={j} className="whitespace-nowrap border-b border-ink-800 px-2 py-1 text-slate-200">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
const f = (v, d = 6) => (v == null ? '—' : typeof v === 'number' ? v.toFixed(d) : String(v))
const e = (v, d = 4) => (v == null ? '—' : v.toExponential(d))
const NM = 'NOT MEASURED'

export default function MethodsPage() {
  useEffect(() => {
    document.title = 'Methods & verification — Space Debris Capture Simulator'
    if (window.location.hash) document.getElementById(window.location.hash.slice(1))?.scrollIntoView()
  }, [])

  const samplePriorSrc = quoteFunction(priorsSource, 'samplePrior')
  const sampleOmegaSrc = quoteFunction(priorsSource, 'sampleOmega')
  const mulberrySrc = quoteFunction(priorsSource, 'mulberry32')

  return (
    <div className="min-h-full bg-ink-950 text-slate-200">
      <header className="sticky top-0 z-10 border-b border-ink-700 bg-ink-925/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-5 gap-y-1 px-4 py-2.5">
          <a href="/" className="text-[13px] font-medium text-slate-100 hover:underline">
            ← Workbench
          </a>
          <span className="text-[13px] text-slate-500">Methods &amp; verification</span>
          <nav className="ml-auto flex flex-wrap gap-x-3 gap-y-1 text-[12px]" aria-label="Sections">
            {NAV.map(([id, label]) => (
              <a key={id} href={`#${id}`} className="text-slate-400 hover:text-slate-100">
                {label}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-24 pt-8">
        <h1 className="text-[26px] font-medium leading-tight text-slate-50">Methods and verification</h1>
        <P>
          This page states the model the simulator integrates, the checks that were run against it, the measured results, and what
          was not measured. Values are quoted from <Code>reports/validation_2026-11.md</Code> (V), <Code>reports/research_2026-11.md</Code> (R)
          and <Code>reports/release_1.0.md</Code> (REL), with the raw output file for each table. Machine for every timing: {MACHINE.cpu},{' '}
          {MACHINE.os}, Node {MACHINE.node}, run on {MACHINE.date}. Build shown: <Code>{buildLabel()}</Code>
          {BUILD.date && <> ({BUILD.date})</>}.
        </P>

        {/* ------------------------------------------------------------------ 1 MODEL */}
        <H2 id="model">1. Model</H2>

        <H3 id="equations">1.1 Rigid body</H3>
        <P>
          Torque-free Euler equations in the body principal frame with the quaternion kinematics, integrated by classical fourth-order
          Runge–Kutta at a fixed step H = 1/3000 s (<Code>src/physics/rigidBody.js</Code>, <Code>rk4Step</Code>). The quaternion is
          renormalised after every step. During a live capture a viscous restraint torque −c·I·ω is applied after the verdict (closure
          model only); the verdict itself is computed on the torque-free body.
        </P>
        <Eq>
          Ix ω̇x = (Iy − Iz) ωy ωz + τx &nbsp;&nbsp; Iy ω̇y = (Iz − Ix) ωz ωx + τy &nbsp;&nbsp; Iz ω̇z = (Ix − Iy) ωx ωy + τz &nbsp;&nbsp; q̇ = ½ q ⊗ [0, ω]
        </Eq>
        <Eq>
          2T = Ix ωx² + Iy ωy² + Iz ωz² &nbsp;&nbsp; H² = Ix² ωx² + Iy² ωy² + Iz² ωz² &nbsp;&nbsp; (both conserved for τ = 0)
        </Eq>
        <Table
          caption="Constants (src/physics/constants.js CUBESAT). The moments are stored constants, not computed from the box at runtime (V Task A)."
          head={['Quantity', 'Value', 'Uniform box m/12·(…)', 'Solver − box']}
          rows={[
            ['Mass', `${CUBESAT.mass.toFixed(1)} kg`, '', ''],
            ['Dimensions x, y, z', CUBESAT.dims.map((d) => d.toFixed(3)).join(' × ') + ' m', '', ''],
            ['Ix', `${IX} kg·m²`, INERTIA_BOX.ix.toFixed(6), INERTIA_BOX.delta[0].toExponential(3)],
            ['Iy', `${IY} kg·m²`, INERTIA_BOX.iy.toFixed(6), INERTIA_BOX.delta[1].toExponential(3)],
            ['Iz', `${IZ} kg·m²`, INERTIA_BOX.iz.toFixed(6), INERTIA_BOX.delta[2].toExponential(3)],
            ['Axis ordering', `Iy ${IY} < Iz ${IZ} < Ix ${IX} — z is the intermediate axis`, '', ''],
            ['Step H', `${SOLVER.substep.toExponential(4)} s (1/3000)`, '', ''],
          ]}
        />

        <H3 id="net">1.2 Net</H3>
        <P>
          Tension-only XPBD cable lattice (<Code>src/physics/netSolver.js</Code>): {Math.sqrt(NODE_COUNT)} × {Math.sqrt(NODE_COUNT)} knots,{' '}
          {SEGMENT_COUNT} distance constraints solved sequentially (Gauss–Seidel) once per substep with compliance α = 1/(EA·η)/h²; threads
          go slack in compression. Contact: each knot inside the margin-expanded box is projected to the nearest face and Coulomb friction
          is applied against the body surface velocity. With one-way coupling the body is read-only for the net.
        </P>
        <Table
          head={['Parameter', 'Value']}
          rows={[
            ['Material / yarn modulus E', `${NET.material} / ${(NET.youngsModulus / 1e9).toFixed(0)} GPa`],
            ['Mesh', `${NET.size.toFixed(1)} × ${NET.size.toFixed(1)} m, ${NET.grid} × ${NET.grid} knots, mesh mass ${(NET_MASS * 1000).toFixed(1)} g, corner masses 4 × ${(NET.cornerMass * 1000).toFixed(0)} g`],
            ['Thread Ø / area', `${(NET.threadDiameter * 1000).toFixed(1)} mm / ${NET.threadArea.toExponential(4)} m²`],
            ['Woven efficiency η (axial stiffness EA·η)', `${NET.wovenEfficiency}`],
            ['Friction μ', NET.friction.toFixed(2)],
            ['Approach speed / standoff / flight time', `${NET.approachSpeed.toFixed(1)} m/s / ${NET.standoff.toFixed(1)} m / ${FLIGHT_TIME.toFixed(2)} s`],
            ['Drawstring servo at contact', `K = ${NET.drawstringStiffness} N/m, D = ${NET.drawstringDamping} N·s/m on the four corners (external force; no reaction)`],
            ['Contact margin', `${CAPTURE.contactMargin} m`],
          ]}
        />

        <H3 id="verdict">1.3 Verdict definition</H3>
        <P>
          The capture verdict is binary. Over the contact window of {CONTACT_WINDOW.toFixed(2)} s starting at first knot contact, the
          solver records max |ωz| of the body. If it exceeds {CAPTURE.wzLimit.toFixed(1)} rad/s the target is EJECTED (twist-out), else it is
          SECURED and the closure model runs. There is no partial category (V Task B). Four predictors of the same event are shown side by
          side in the Verdicts panel:
        </P>
        <Table
          head={['Predictor', 'Definition', 'Code']}
          rows={[
            ['Static rule', `|ωz(0)| ≤ ${CAPTURE.wzLimit.toFixed(1)}`, 'genData.mjs naiveEject'],
            ['Envelope', `closed-form max |ωz| on the polhode ≤ ${CAPTURE.wzLimit.toFixed(1)} (infinite horizon)`, 'src/physics/envelope.js omegaZMax'],
            ['Numeric label', `peakWzInContactWindow(ω0, delay 0) ≤ ${CAPTURE.wzLimit.toFixed(1)}: torque-free RK4 for ${FLIGHT_TIME.toFixed(2)} s then max |ωz| over ${CONTACT_WINDOW.toFixed(2)} s`, 'src/physics/captureLabel.js (dataset fireNowSecure)'],
            ['PINN', 'runSurrogateInference(ω0).fireNowSecure with the committed weights', 'src/surrogate/inference.js'],
            ['Solver', 'the live rollout above (RK4 body + XPBD net) after decide()', 'src/workers/physicsWorker.js'],
          ]}
        />
        <P>
          Closed-form envelope (R 1c): with a = ωx², b = ωy², c = ωz² the two invariants are linear in (a, b, c); maximising c subject to
          a, b ≥ 0 is a one-dimensional linear programme whose optimum lies on a = 0 or b = 0. Branch a = 0: c = (H² − 2T·Iy)/(Iz(Iz − Iy));
          branch b = 0: c = (H² − 2T·Ix)/(Iz(Iz − Ix)). Exactly one branch is feasible for a polhode that encircles the x- or y-axis. The
          tooltip on the Envelope cell shows 2T, H² and the active branch for the current ω0.
        </P>

        <H3 id="dataset">1.4 Dataset</H3>
        <P>
          <Code>npm run gen:surrogate</Code> (<Code>scripts/surrogate/genData.mjs</Code>) writes six files to <Code>scripts/surrogate/data/</Code>{' '}
          (gitignored). Seeds: trajectories 20260419 (the first rows are S1–S4), strain base 424242, capture base 777001; rows are split
          over min(cores, 8) worker threads, chunk c uses mulberry32(base + 9973·c). capture.json has 1,200 rows with the label{' '}
          <Code>fireNowSecure = peak0 ≤ 3</Code>, <Code>naiveEject = |wz| &gt; 3</Code>, and the fire schedule scanned at 0.04 s over 0–3.2 s.
        </P>
        <Table
          caption="SHA-256 of the reference dataset, 8 worker threads (V Task F; regenerated byte-identically in R 2b and REL Phase 7)."
          head={['File', 'Bytes', 'SHA-256']}
          rows={DATASET_HASHES.map((h) => [h.file, h.bytes.toLocaleString('en-US'), h.sha256])}
        />
        <P>
          Committed surrogate weights <Code>src/surrogate/weights.json</Code>: {PINN_METRICS.weightsBytes.toLocaleString('en-US')} bytes, SHA-256{' '}
          <Code>{WEIGHTS_SHA256}</Code>; MLP sizes pinn [6, 48, 48, 3], peak [6, 48, 32, 1], strain [6, 32, 32, 1]. Not retrained for this release.
        </P>

        <H3 id="prior">1.5 Prior</H3>
        <P>
          The default prior is <Code>uniform-box</Code>: each component uniform on [0, {5}) rad/s, positive octant. Measured on the reference set:
          mean |ω| 4.818759, min 0.488718, max 8.224481 rad/s. Three alternative priors were generated with the same seeds (R 2b). The sampling
          code shipped in this build (<Code>src/physics/priors.js</Code>, used by the dataset generator and the in-browser Monte Carlo):
        </P>
        <Pre label="mulberry32 source">{mulberrySrc}</Pre>
        <Pre label="sampleOmega source">{sampleOmegaSrc}</Pre>
        <Pre label="samplePrior source">{samplePriorSrc}</Pre>
        <Table
          caption="capture.json SHA-256 per alternative prior (R 2b)."
          head={['Prior', 'SHA-256']}
          rows={PRIOR_HASHES.map((h) => [h.prior, h.sha256])}
        />

        {/* ------------------------------------------------------------------ 2 VERIFICATION */}
        <H2 id="verification">2. Verification</H2>

        <H3 id="drift">2.1 Invariant drift (R 1a)</H3>
        <P>
          {DRIFT.spins} spins from capture.json selected with mulberry32({DRIFT.seed}), 30,000 steps at H (10 s), damping 0. Drift = max over
          steps of |X(t) − X(0)|/X(0). Raw: <Code>{DRIFT.raw}</Code>.
        </P>
        <Table
          head={['Quantity', 'Max over 50 spins', 'Median']}
          rows={[
            ['Relative drift of |H|', e(DRIFT.hMax, 16), e(DRIFT.hMedian, 16)],
            ['Relative drift of T', e(DRIFT.tMax, 16), e(DRIFT.tMedian, 16)],
          ]}
        />

        <H3 id="order">2.2 Observed order of convergence (R 1b)</H3>
        <P>
          Error = max over the 50 spins of |ω_h(t) − ω_H/8(t)| at t = 0.30 s and 0.55 s. At H, H/2, H/4 the error is at double-precision
          round-off so the order is not observable there; on the coarse sweep the observed order is 4.00.
        </P>
        <Table
          head={['Step', 'max |Δω| t = 0.30', 'max |Δω| t = 0.55']}
          rows={CONVERGENCE_FINE.map((r) => [r.step, e(r.e030, 15), e(r.e055, 15)])}
        />
        <Table
          head={['Step', 'max |Δω| t = 0.30', 'max |Δω| t = 0.55', 'order (t = 0.30)', 'order (t = 0.55)']}
          rows={CONVERGENCE.map((r) => [r.step, e(r.e030, 15), e(r.e055, 15), r.order030 == null ? '—' : r.order030.toFixed(4), r.order055 == null ? '—' : r.order055.toFixed(4)])}
        />

        <H3 id="closed-form">2.3 Closed form vs numeric (R 1c)</H3>
        <Table
          head={['Check over 1,200 rows', 'Value']}
          rows={[
            ['max(window peak − bound)', '0 (numeric never exceeds the bound)'],
            ['max(20 s numeric peak − bound)', e(CLOSED_FORM.maxNumericOverBound, 16)],
            ['max(bound − 20 s numeric peak)', e(CLOSED_FORM.maxBoundOverNumeric, 16) + ' rad/s (sampling resolution of the peak at H)'],
            ['Rows with bound − peak > 1e-3', String(CLOSED_FORM.rowsOver1e3)],
            ['bound − peak percentiles p50 / p90 / p99', `${e(CLOSED_FORM.p50, 3)} / ${e(CLOSED_FORM.p90, 3)} / ${e(CLOSED_FORM.p99, 3)}`],
            ['Time of the 20 s numeric peak, p50', `${CLOSED_FORM.peakTimeP50S} s`],
            ['Closed form vs rigidBody.polhodeEnvelope', '0 difference on 1,200 rows; < 1e-12 on 200 seeded spins (tests/envelope.test.mjs)'],
          ]}
        />

        <H3 id="single-axis">2.4 Single-axis sweep (V Task B, R 3d)</H3>
        <P>
          Net fired at t = 0, coupled rollout (RK4 body + XPBD net). Verdict and peak |ωz| are the one-way values; the last column is the
          two-way peak from R 3d (0 verdict changes). Raw: <Code>reports/raw/taskB_axis_sweep.txt</Code>, <Code>{TWO_WAY.raw}</Code>.
        </P>
        <Table
          head={['axis', 'ω (rad/s)', 'verdict', 'peak |ωz| contact', 'tContact (s)', 'max strain', 'two-way peak |ωz|']}
          rows={SINGLE_AXIS.map((r) => [r.axis, r.w.toFixed(1), r.verdict, f(r.peakWz), f(r.tContact), f(r.maxStrain), f(r.twoWayPeak)])}
          className="max-h-[420px] overflow-y-auto"
        />

        <H3 id="two-way">2.5 Two-way coupling (R 3, experimental)</H3>
        <P>
          <Code>NetSolver.twoWay</Code> accumulates the knot contact impulses J = m_k(x_final − x_pre)/h and the angular impulse about the body
          centre; the body receives them one substep later (333 µs lag) as a zero-order-hold torque over the four RK4 stages and a linear
          impulse v += J/m. The default path is unchanged (bit-identical with <Code>torque = null</Code>). Momentum budget of body + net from
          t = 0.28 s to the end of the window, 20 spins, seed 20261103:
        </P>
        <Table
          head={['Mode', 'max |ΔP_total| (N·s)', 'max |P_before|', 'max |ΔL_total| (N·m·s)', 'max |L_before|']}
          rows={TWO_WAY.budget.map((r) => [r.mode, e(r.dP, 4), r.pBefore.toFixed(4), e(r.dL, 4), r.lBefore.toFixed(4)])}
        />
        <P>
          The drawstring is an external spring on the net with no reaction, so with it engaged ≈4.9 N·s of the net's 5.4 N·s is removed from the
          system; one-way coupling removes the whole contact impulse. With two-way coupling and the drawstring off linear momentum closes to
          2.5e-12 N·s. The angular-momentum residual (3.2e-2 N·m·s, ≈1 % of |L|) is attributed on spin {TWO_WAY.angMomAttribution.spin} to the
          sequential XPBD projection of the distance constraints ({e(TWO_WAY.angMomAttribution.distanceConstraints, 3)}) versus contact + body
          reaction ({e(TWO_WAY.angMomAttribution.contactAndReaction, 3)}). Over the 1,200 reference rows two-way coupling changes{' '}
          {TWO_WAY.verdictChanges} verdicts (all eject → capture, rows {TWO_WAY.changedRows.map((r) => r.i).join(', ')}, one-way peaks{' '}
          {TWO_WAY.changedRows.map((r) => r.oneWay.toFixed(4)).join(' / ')}), max |Δpeak| {TWO_WAY.maxDeltaPeak.toFixed(4)}, unstable runs{' '}
          {TWO_WAY.unstableRuns}. The workbench toggle (left panel, "Net→body coupling") runs this schedule live and shows ΔP_total and ΔL_total
          since t_launch + 0.28 s; in the browser, S2 with two-way coupling and the drawstring off measured |ΔP_total| 9.8e-13 to 1.8e-12 N·s
          (REL Phase 4).
        </P>

        <H3 id="timing">2.6 Timing</H3>
        <P>
          {TIMING.spins} spins (seed {TIMING.seed}), one untimed warm-up, one timed call per spin per path, two passes. Machine: {MACHINE.cpu},
          Node {MACHINE.node}. Browser timing of these paths: {NM}. Raw: <Code>reports/raw/taskD_timing.txt</Code>, <Code>{TWO_WAY.raw}</Code>.
        </P>
        <Table
          head={['Source', 'Pass', 'Path', 'Mean (ms)', 'Median', 'Min', 'Max']}
          rows={TIMING.rows.map((r) => [r.source, String(r.pass), r.path, r.mean.toFixed(4), r.median.toFixed(4), r.min.toFixed(4), r.max.toFixed(4)])}
        />
        <P>
          Coupled/PINN ratio: pass 1 mean {TIMING.ratios[0].meanRatio}, median {TIMING.ratios[0].medianRatio}; pass 2 mean {TIMING.ratios[1].meanRatio},
          median {TIMING.ratios[1].medianRatio}. The <Code>coupledRolloutMsEstimate: {TIMING.metricsCoupledEstimateMs}</Code> in metrics.json is a
          literal from train.mjs, not a measurement; the HUD replaces it with the worker's own benchmark once that arrives.
        </P>

        {/* ------------------------------------------------------------------ 3 RESULTS */}
        <H2 id="results">3. Results</H2>

        <H3 id="presets">3.1 Presets S1–S5</H3>
        <Table
          caption="Headless values (R Phase 4, scripts/research/phase4_presets.mjs; S5 from REL Phase 2, scripts/release/findS5.mjs)."
          head={['id', 'ω0 (rad/s)', 'closed-form max |ωz|', 'predictOutcome', 'window peak, fire now', 'coupled one-way peak / verdict', 'max strain', 'first secure delay (ms)']}
          rows={PRESET_TABLE.map((r) => [
            r.id,
            r.w.map((v) => v.toFixed(2)).join(', '),
            f(r.envMax),
            r.predict,
            f(r.windowPeak),
            `${f(r.coupledPeak)} / ${r.coupledVerdict}`,
            f(r.maxStrain),
            r.firstSecureMs == null ? 'never within 3.2 s' : String(r.firstSecureMs),
          ])}
        />
        <P>
          S5 "{PRESET_S5.name}" ω0 = [{PRESET_S5.w.join(', ')}] was found by bisection on ωx with ωy = 1.00, ωz0 = 2.00 so that |ωz0| ≤ 3 and the
          closed-form ωz,max = 2.977154 rad/s lies within 0.05 of the limit (0.0228 below). The dataset presets S1–S4 are unchanged because the
          generator seeds its first trajectories with them.
        </P>

        <H3 id="priors">3.2 Four priors (R 2c)</H3>
        <Table
          head={['Prior', 'n', 'Rule SECURE', 'False-secure', '% of rule-SECURE', 'False-eject', 'Physics-limited', 'Physics SECURE', 'mean / min / max |ω|']}
          rows={PRIOR_TABLE.map((r) => [r.prior, String(r.n), String(r.ruleSecure), String(r.falseSecure), r.pctRuleSecure.toFixed(4), String(r.falseEject), String(r.physicsLimited), String(r.physicsSecure), r.mag])}
        />
        <Table
          head={['Prior', 'PINN = physics label', 'PINN = naive rule', 'PINN false-secure', 'PINN false-eject']}
          rows={PRIOR_TABLE.map((r) => [r.prior, `${r.pinnAgree} (${r.pinnAgreePct.toFixed(4)} %)`, String(r.pinnRule), String(r.pinnFalseSecure), String(r.pinnFalseEject)])}
        />
        <P>
          On the default dataset (uniform-box): rule SECURE {MISCLASS.ruleSecure}, physics SECURE {MISCLASS.physicsSecure}; false-secure{' '}
          {MISCLASS.falseSecure} ({MISCLASS.falseSecurePctOfRuleSecure.toFixed(2)} % of rule-SECURE), false-eject {MISCLASS.falseEject}; total
          disagreements {MISCLASS.disagreements} ({MISCLASS.disagreementPct} %). Physics-limited rows (rule SECURE and closed-form max &gt; 3, no
          fire delay can help): {CLOSED_FORM.physicsLimited}. Window-limited rows (closed-form max &gt; 3 but window peak ≤ 3, would eject with a
          later arrival): {CLOSED_FORM.windowLimited}. Under <Code>slow</Code> and <Code>moderate</Code> every row is physics-SECURE because |ω| ≤ 3
          implies |ωz| ≤ 3 at all times, so those priors measure only PINN false-ejects.
        </P>
        <P>
          <strong className="font-medium text-slate-100">
            The 20.75 % disagreement on the default dataset is a property of its prior and is not an operational failure rate.
          </strong>
        </P>
        <Table
          caption="|ω0| histogram of the 245 false-secure rows, bin 0.5 rad/s (V Task C). The Monte Carlo tab reproduces this live."
          head={['bin (rad/s)', 'count']}
          rows={MISCLASS.histogram.map(([b, c]) => [b, String(c)])}
        />
        <P>
          PINN on the committed weights: held-out fire-now accuracy {(100 * PINN_METRICS.captureAccuracy).toFixed(2)} % vs naive rule{' '}
          {(100 * PINN_METRICS.naiveAccuracy).toFixed(2)} % ({PINN_METRICS.nTestCapture} fresh spins, <Code>npm run check:surrogate</Code>);
          optimal-delay MAE {PINN_METRICS.optimalDelayMaeMs} ms ({PINN_METRICS.nTestPinn} spins); strain head R² {PINN_METRICS.strainR2.toFixed(3)}{' '}
          (excluded from verdicts). Coupled one-way verdict equals the dataset label on {MISCLASS.coupledAgree} of 1,200 rows (two-way:{' '}
          {TWO_WAY.agreeWithLabel.twoWay}).
        </P>

        {/* ------------------------------------------------------------------ 4 LIMITATIONS */}
        <H2 id="limitations">4. Limitations</H2>
        <P>From the README "Status and limitations" section, verbatim:</P>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-[13.5px] leading-relaxed text-slate-300">
          {README_LIMITATIONS.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <P>Added for release 1.0:</P>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-[13.5px] leading-relaxed text-slate-300">
          {RELEASE_LIMITATIONS.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <P>
          Not measured in this release: comparison with Shin et al.&apos;s published results, browser-side timing of the coupled and
          PINN paths, byte-identity of the dataset on machines with fewer than 8 cores, and anonymous public access to the Vercel
          preview (Deployment Protection is on). GitHub Actions on <Code>ubuntu-latest</Code> and the Vercel preview URL are recorded
          in <Code>reports/release_1.0.md</Code> Phase 6–7. Lighthouse mobile scores for the workbench are below 85 on this machine
          under Lighthouse&apos;s simulated 4× CPU / Slow 4G throttle (three runs: 72, 74, 84); accessibility 100, CLS 0.
        </P>

        {/* ------------------------------------------------------------------ 5 PROVENANCE */}
        <H2 id="provenance">5. Provenance</H2>
        <P>
          Built October–November 2026. The author's 2023 M.Sc. thesis (TH OWL) reviewed Shin et al.'s ABAQUS net-capture study; this simulator
          is an independent re-implementation of that scenario. Developed with AI coding assistance (Cursor). The author specified the research
          questions and reviewed the results; numbers come from the committed scripts and tests.
        </P>
        <Table
          head={['Item', 'Value']}
          rows={[
            ['Author', 'Parth Sharma'],
            ['Repository', BUILD.repository],
            ['This build', buildLabel() + (BUILD.date ? ` (${BUILD.date})` : '')],
            ['Validation reference commit', '0da6f6985d59467ff87709d93d339dd461a438dc (tag validation-2026-11)'],
            ['Reports', 'reports/validation_2026-11.md · reports/research_2026-11.md · reports/release_1.0.md'],
            ['Raw outputs', 'reports/raw/*.txt · reports/raw/research/*.txt · reports/raw/release/*.txt'],
            ['Ground truth', 'this solver (no experiment, no hardware)'],
          ]}
        />

        {/* ------------------------------------------------------------------ 6 REPRODUCTION */}
        <H2 id="reproduce">6. Reproduction</H2>
        <P>From a clean clone, Node v18.20.8 (a machine with 8 or more cores reproduces the dataset hashes exactly):</P>
        <Pre label="reproduction commands">{`git clone ${BUILD.repository}.git SpaceRobotsMS && cd SpaceRobotsMS
git checkout v1.0.0-rc1
npm ci
npm test                                   # node:test, tests/*.test.mjs
npm run build                              # vite build, writes dist/

# reference dataset (gitignored); compare with the SHA-256 table in §1.4
npm run gen:surrogate
(cd scripts/surrogate/data && shasum -a 256 trajectories.bin trajectories.meta.json strain.json capture.json audit.json summary.json)

# surrogate gate (uses the committed weights; rewrites src/surrogate/metrics.json)
npm run check:surrogate

# validation note (V)
node scripts/validation/inertia.mjs
node scripts/validation/axisSweep.mjs
node scripts/validation/misclass.mjs
node --experimental-loader ./scripts/validation/jsonLoader.mjs scripts/validation/timing.mjs

# research note (R)
node scripts/research/phase1_integrator.mjs
for p in uniform-box log-uniform-mag slow moderate; do
  node scripts/surrogate/genData.mjs --only capture --prior $p --out scripts/surrogate/data/priors/$p
done
node --experimental-loader ./scripts/validation/jsonLoader.mjs scripts/research/phase2_priors.mjs
node scripts/research/phase3_twoway.mjs
node scripts/research/phase3_diag_angmom.mjs
node scripts/research/phase4_presets.mjs

# release 1.0 (REL)
node --experimental-loader ./scripts/validation/jsonLoader.mjs scripts/release/findS5.mjs
npx playwright install chromium && npx playwright test          # browser smoke test`}</Pre>
        <P>
          Expected: every validation and research output equals the file in <Code>reports/raw/</Code> except wall-clock timing lines (REL Phase 7
          lists the diff). Browser Monte Carlo: uniform-box, N 1200, seed 777001 must give rule-secure 731, false-secure 245, false-eject 4.
        </P>

        <footer className="mt-16 border-t border-ink-700 pt-4 text-[12px] text-slate-500">
          Space Debris Capture Simulator · build <span className="num text-slate-300">{buildLabel()}</span>
          {BUILD.date && <> · {BUILD.date}</>} · <a href={BUILD.repository} className="hover:text-slate-200 hover:underline">{BUILD.repository}</a>
        </footer>
      </main>
    </div>
  )
}
