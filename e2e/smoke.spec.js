import { expect, test } from '@playwright/test'

/**
 * Release 1.0 smoke test (PHASE 6a). Expected values are the measured S4 verdicts from
 * reports/research_2026-11.md Phase 4 / tests/envelope.test.mjs, and the Monte Carlo parity
 * counts from tests/montecarlo.test.mjs.
 */

function collectErrors(page) {
  const errors = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`)
  })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  return errors
}

async function openWorkbench(page) {
  await page.goto('/')
  await expect(page.getByRole('tab', { name: 'Verdicts' })).toBeVisible()
  const skip = page.getByRole('button', { name: 'Skip tour' })
  if (await skip.count()) await skip.click()
}

test('workbench loads with no console errors and runs S4 to the measured verdicts', async ({ page }) => {
  const errors = collectErrors(page)
  await openWorkbench(page)

  // S4 preset: static rule SECURE (|ωz0| 2.500), envelope EJECT (4.034), PINN EJECT, numeric label EJECT
  await page.getByRole('button', { name: /^S4/ }).first().click()
  const verdicts = page.locator('aside').last()
  await expect(verdicts).toContainText('ω₀ [3.00, 3.00, 2.50]')
  const cells = verdicts.locator('[data-verdict-cell]')
  await expect(cells).toHaveCount(4)
  await expect(cells.nth(0)).toContainText('2.500') // |ωz0|
  await expect(cells.nth(1)).toContainText('4.034') // closed-form ωz,max
  await expect(verdicts).toContainText('EJECT · peak 3.925') // numeric label
  await expect(cells.nth(0)).toHaveAttribute('data-verdict', 'SECURE') // static rule
  await expect(cells.nth(1)).toHaveAttribute('data-verdict', 'EJECT') // envelope
  await expect(cells.nth(2)).toHaveAttribute('data-verdict', 'EJECT') // PINN
  await expect(cells.nth(3)).toHaveAttribute('data-verdict', 'PENDING') // solver: not yet run

  // run the live solver: S4 fired now ejects (measured peak 3.9–4.0 rad/s)
  await page.keyboard.press('l')
  await expect(page.getByText(/TWIST-OUT EJECTION/).first()).toBeVisible({ timeout: 90_000 })
  await expect(cells.nth(3)).toHaveAttribute('data-verdict', 'EJECT', { timeout: 30_000 })
  const solverText = await cells.nth(3).innerText()
  const peak = Number(/(\d\.\d{3})/.exec(solverText)?.[1])
  expect(peak).toBeGreaterThan(3.0)
  expect(peak).toBeLessThan(4.2)

  expect(errors).toEqual([])
})

test('Monte Carlo N=100 completes; N=1200 seed 777001 uniform-box reproduces 731 / 245 / 4', async ({ page }) => {
  const errors = collectErrors(page)
  await openWorkbench(page)
  await page.getByRole('tab', { name: 'Monte Carlo' }).click()
  await page.getByLabel('number of samples').fill('100')
  await page.getByRole('button', { name: 'Run' }).click()
  await expect(page.getByText('Confusion vs solver label')).toBeVisible()
  await expect(page.locator('span', { hasText: /^N 100 · / })).toBeVisible()

  await page.getByLabel('number of samples').fill('1200')
  await page.getByLabel('random seed').fill('777001')
  await page.getByRole('button', { name: 'Run' }).click()
  await expect(page.locator('span', { hasText: /^N 1200 · / })).toBeVisible({ timeout: 60_000 })
  const rule = page.locator('[data-confusion="rule"]')
  await expect(rule).toContainText('false-secure 245')
  await expect(rule).toContainText('false-eject 4')
  await expect(rule).toContainText('predicted SECURE 731')
  expect(errors).toEqual([])
})

test('/methods renders without loading three.js', async ({ page }) => {
  const errors = collectErrors(page)
  const assets = []
  page.on('response', (r) => {
    if (r.url().includes('/assets/')) assets.push(r.url())
  })
  await page.goto('/methods')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Methods and verification')
  await expect(page.getByText('is a property of its prior and is not an operational failure rate')).toBeVisible()
  await expect(page.locator('pre[aria-label="samplePrior source"]')).toContainText('export function samplePrior')
  await expect(page.locator('footer')).toContainText('build')
  expect(assets.some((u) => /\/three-/.test(u))).toBe(false)
  expect(errors).toEqual([])
})
