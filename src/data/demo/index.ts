import type { MonitoringPlan, MonitoringRequest } from '../../domain'
import { requestFromPlan } from '../../domain'
import plansJson from './plans.json'

/**
 * Frozen demo clock so the scenarios are deterministic regardless of the real date.
 * PLAN-DEMO-001 request #1 is valid 2026-09-01 → 2026-09-15 (in window).
 * PLAN-DEMO-002 request #1 was valid 2026-07-01 → 2026-07-15 (expired).
 */
export const DEMO_NOW = '2026-09-05T09:00:00.000Z'
export const demoClock = () => DEMO_NOW

export const DEMO_PLANS = plansJson as MonitoringPlan[]

/** Fresh copies of the seed requests: the first request of every plan. */
export function loadDemoRequests(): MonitoringRequest[] {
  return DEMO_PLANS.map((p) => requestFromPlan(p, 1)).filter((r): r is MonitoringRequest => r !== null)
}

export function loadDemoPlans(): MonitoringPlan[] {
  return structuredClone(DEMO_PLANS)
}
