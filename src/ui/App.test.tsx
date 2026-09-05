import { beforeEach, describe, expect, it } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import App from './App'
import { requestStore } from '../store/requestStore'
import { loadDemoRequests } from '../data/demo'

const [recurring, expired] = loadDemoRequests()

beforeEach(() => {
  window.location.hash = ''
  requestStore.reset()
})

describe('specialist console', () => {
  it('lists both demo requests and shows a token-only QR link', async () => {
    render(<App />)
    const nav = screen.getByRole('navigation', { name: /monitoring requests/i })
    expect(within(nav).getByText('Jordan Sample')).toBeInTheDocument()
    expect(within(nav).getByText('Priya Placeholder')).toBeInTheDocument()
    expect(screen.getByTestId('token')).toHaveTextContent(recurring.token)
    const link = screen.getByRole('link', { name: /open provider view/i }) as HTMLAnchorElement
    expect(link.href).toContain(`#/present/${recurring.token}`)
    expect(link.href).not.toMatch(/Jordan|INR|PT-FICTIONAL/)
  })

  it('walks the golden path and schedules the next recurring request', async () => {
    render(<App />)
    // Provider side
    act(() => {
      requestStore.present(recurring.token, 'Provider')
      requestStore.transition(recurring.id, 'SAMPLE_COLLECTED', 'Provider')
    })
    const nav = screen.getByRole('navigation', { name: /monitoring requests/i })
    expect(within(nav).getByText(/PLAN-DEMO-001-R02/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /lab receives sample/i }))
    fireEvent.click(screen.getByRole('button', { name: /lab result available/i }))
    expect(screen.getAllByTestId('state-badge').some((b) => b.textContent === 'AWAITING CLINICIAN REVIEW')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /mark reviewed/i }))
    expect(screen.getByText(/Routed to Anticoagulation team inbox/)).toBeInTheDocument()
  })
})

describe('provider view', () => {
  it('blocks collection of an expired request with a visible error', async () => {
    window.location.hash = `#/present/${expired.token}`
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /present token/i }))
    expect(screen.getByRole('alert')).toHaveTextContent(/expired/i)
    expect(screen.queryByRole('button', { name: /confirm sample collected/i })).not.toBeInTheDocument()
    expect(requestStore.getSnapshot().requests.find((r) => r.id === expired.id)?.status).toBe('EXPIRED')
  })

  it('reports an unknown token', () => {
    window.location.hash = '#/present/tok_bogus'
    render(<App />)
    expect(screen.getByText(/unknown token/i)).toBeInTheDocument()
  })
})
