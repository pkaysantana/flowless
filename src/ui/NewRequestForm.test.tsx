import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { NewRequestForm } from './NewRequestForm'
import { requestFromPlan, type MonitoringPlan } from '../domain'
import { DEMO_NOW } from '../data/demo'

function fill(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

function fillRequired() {
  fill(/ward \/ department code/i, 'RESP-OP-A')
  fill(/ward \/ department name/i, 'Respiratory outpatients')
  fill(/^name$/i, 'Dr Fictional Chest')
  fill(/^role$/i, 'Consultant Respiratory Physician')
  fill(/esr number/i, '12345678')
  fill(/responsible specialist service/i, 'Respiratory Medicine')
  fill(/full name/i, 'Casey Placeholder')
}

describe('NewRequestForm', () => {
  it('builds a MonitoringPlan with generated ids, defaults and team routing', () => {
    const onSubmit = vi.fn<(p: MonitoringPlan) => void>()
    render(<NewRequestForm onSubmit={onSubmit} now={DEMO_NOW} existingPlanCount={2} />)
    fillRequired()
    fireEvent.click(screen.getByLabelText(/FBC/))
    fireEvent.click(screen.getByLabelText(/recurring plan/i))
    fill(/until/i, '2026-12-31')
    fireEvent.click(screen.getByRole('button', { name: /create plan/i }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    const plan = onSubmit.mock.calls[0][0]
    expect(plan.id).toBe('PLAN-NEW-003')
    expect(plan.patientRef).toBe('PT-FICTIONAL-1003')
    expect(plan.validityDays).toBe(14)
    expect(plan.startsAt).toBe('2026-09-05T00:00:00.000Z')
    expect(plan.demographics.sex).toBeNull()
    expect(plan.tests).toEqual([{ code: 'FBC', name: 'Full blood count', snomedCode: '26604007' }])
    expect(plan.requestingClinician.esrNumber).toBe('12345678')
    expect(plan.requestingSite.wardCode).toBe('RESP-OP-A')
    expect(plan.routing).toEqual({
      kind: 'TEAM_INBOX',
      label: 'Respiratory Medicine monitoring inbox',
      address: 'inbox://demo-respiratory-medicine-monitoring',
    })
    expect(plan.recurrence).toEqual({ intervalDays: 28, endsAt: '2026-12-31T00:00:00.000Z' })
    // Compiles into a real first request.
    expect(requestFromPlan(plan, 1)?.status).toBe('ACTIVE')
  })

  it('refuses to submit without a test and shows a visible error', () => {
    const onSubmit = vi.fn()
    render(<NewRequestForm onSubmit={onSubmit} now={DEMO_NOW} existingPlanCount={0} />)
    fillRequired()
    fireEvent.click(screen.getByRole('button', { name: /create plan/i }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/at least one test/i)
  })
})
