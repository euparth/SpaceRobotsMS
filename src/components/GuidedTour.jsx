import { useEffect, useRef } from 'react'
import { cx } from './ui.jsx'

export const TOUR_STEPS = [
  {
    id: 'kinematics',
    stepNumber: '1/3',
    title: '1. Target Satellite Dynamics',
    body: '12U CubeSat (30.0 kg) tumbling under 6-DOF Euler rotational equations in Low Earth Orbit (LEO).',
    detail: 'Analytical box moments of inertia: Ix = 0.479, Iy = 0.273, Iz = 0.464 kg·m² (Dzhanibekov intermediate-axis effect).',
    actionHighlight: 'left spin sliders and target mesh',
    highlightKey: 'step1',
  },
  {
    id: 'net',
    stepNumber: '2/3',
    title: '2. Kevlar 49 Space Net & Stress Shader',
    body: '2.0m x 2.0m woven mesh (E = 120 GPa, mu = 0.20) solved via 60Hz WebWorker RK4 + custom GLSL strain shader.',
    detail: 'Real-time GLSL fragment shader dynamically colours thread tension: Blue (<5% strain), Amber (5-15%), Crimson (>15% yield).',
    actionHighlight: 'active mesh deformation and right energy telemetry graph',
    highlightKey: 'step2',
  },
  {
    id: 'instability',
    stepNumber: '3/3',
    title: '3. Test Rotational Instability',
    body: "Select 'Scenario S3 (High-Spin Z)' in the left panel to test the |wz| > 3.0 rad/s twist-out ejection threshold live!",
    detail: 'When rotational kinetic energy overcomes net tensile restraint, conformal wrap fails and the target is ejected.',
    actionHighlight: 'Scenario S3 button in control panel',
    highlightKey: 'step3',
  },
]

export const TOUR_STORAGE_KEY = 'space_debris_tour_seen_v1'

export function shouldShowTourOnFirstVisit() {
  try {
    return localStorage.getItem(TOUR_STORAGE_KEY) !== 'true'
  } catch {
    return true
  }
}

export default function GuidedTour({
  isTourActive,
  currentStep,
  onStepChange,
  onClose,
}) {
  const modalRef = useRef(null)

  useEffect(() => {
    if (!isTourActive) return
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'ArrowRight') {
        if (currentStep < TOUR_STEPS.length - 1) onStepChange(currentStep + 1)
        else onClose()
      } else if (e.key === 'ArrowLeft') {
        if (currentStep > 0) onStepChange(currentStep - 1)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isTourActive, currentStep, onStepChange, onClose])

  if (!isTourActive) return null

  const stepData = TOUR_STEPS[currentStep] || TOUR_STEPS[0]
  const isFirst = currentStep === 0
  const isLast = currentStep === TOUR_STEPS.length - 1

  return (
    <>
      {/* Non-intrusive backdrop allowing 3D canvas interaction */}
      <div
        className="fixed inset-0 z-40 bg-ink-950/20 backdrop-blur-[1px] transition-opacity duration-300"
        onClick={onClose}
        aria-hidden
      />

      {/* Tour Modal Overlay anchored top-center */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={stepData.title}
        className="fixed left-1/2 top-3 z-50 w-[calc(100vw-1.5rem)] max-w-lg -translate-x-1/2 rounded-xl border border-cyan-500/40 bg-slate-950/85 p-4 shadow-2xl backdrop-blur-xl transition-all duration-300 ease-out sm:top-5 sm:p-5"
      >
        {/* Subtle cyan glow line */}
        <div className="absolute inset-x-0 -top-px h-0.5 rounded-t-xl bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />

        {/* Step Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500/20 text-[11px] font-bold text-cyan-300 ring-1 ring-cyan-500/50">
              {currentStep + 1}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-widest text-cyan-400">
              Step {stepData.stepNumber} · Guided Tour
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-slate-400 transition hover:bg-slate-800/80 hover:text-slate-200"
            aria-label="Skip tour"
          >
            Skip Tour
          </button>
        </div>

        {/* Title */}
        <h3 className="mt-2 text-sm font-semibold tracking-wide text-slate-100 sm:text-base">
          {stepData.title}
        </h3>

        {/* Body */}
        <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
          {stepData.body}
        </p>

        {/* Detail Callout */}
        <div className="mt-2 rounded-md border border-slate-800 bg-slate-900/60 p-2.5">
          <p className="font-mono text-[11px] leading-relaxed text-slate-400">
            {stepData.detail}
          </p>
          <div className="mt-1 flex items-center gap-1.5 text-[10px] font-medium text-cyan-300/90">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-cyan-400 animate-ping" />
            <span>Action Focus: {stepData.actionHighlight}</span>
          </div>
        </div>

        {/* Footer controls: Prev, Next, Skip, and Step indicator dots */}
        <div className="mt-4 flex items-center justify-between border-t border-slate-800/80 pt-3">
          {/* Progress dots indicator */}
          <div className="flex items-center gap-1.5" role="tablist" aria-label="Tour progress">
            {TOUR_STEPS.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onStepChange(i)}
                className={cx(
                  'h-2 rounded-full transition-all duration-300',
                  i === currentStep
                    ? 'w-6 bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]'
                    : 'w-2 bg-slate-700 hover:bg-slate-500',
                )}
                aria-label={`Go to step ${i + 1}`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {!isFirst && (
              <button
                type="button"
                onClick={() => onStepChange(currentStep - 1)}
                className="rounded-md border border-slate-700 bg-slate-900/80 px-3 py-1 font-mono text-xs font-medium text-slate-300 transition hover:border-slate-500 hover:text-white"
              >
                Prev
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                if (isLast) onClose()
                else onStepChange(currentStep + 1)
              }}
              className="rounded-md border border-cyan-400/80 bg-cyan-500/20 px-3.5 py-1 font-mono text-xs font-medium text-cyan-200 shadow-[0_0_12px_rgba(34,211,238,0.3)] transition hover:bg-cyan-500/30 hover:text-white active:scale-95"
            >
              {isLast ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
