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

describe('lab view', () => {
  it('lets the lab receive the specimen and submit a result, routing it back to the requester', () => {
    act(() => {
      requestStore.present(recurring.token, 'Provider')
      requestStore.transition(recurring.id, 'SAMPLE_COLLECTED', 'Provider')
    })

    window.location.hash = `#/present/${recurring.token}`
    render(<App />)
    expect(screen.getByRole('button', { name: /print specimen label/i })).toBeInTheDocument()

    window.location.hash = `#/lab/${recurring.token}`
    fireEvent(window, new Event('hashchange'))
    fireEvent.click(screen.getByRole('button', { name: /confirm sample received/i }))
    fireEvent.change(screen.getByLabelText(/result summary/i), { target: { value: 'Fictional INR 2.4' } })
    fireEvent.click(screen.getByRole('button', { name: /submit result/i }))

    expect(requestStore.getSnapshot().requests.find((r) => r.id === recurring.id)?.status).toBe('AWAITING_CLINICIAN_REVIEW')
  })
})

describe('specimen label', () => {
  it('renders a printable label with no patient name or DOB', () => {
    window.location.hash = `#/label/${recurring.token}`
    render(<App />)
    expect(screen.getByText(/specimen label/i)).toBeInTheDocument()
    expect(screen.getByText(recurring.id)).toBeInTheDocument()
    expect(screen.queryByText(recurring.demographics.fullName)).not.toBeInTheDocument()
  })
})

describe('new request intake', () => {
  it('creates a plan and its first request, then shows it selected in the console', () => {
    window.location.hash = ''
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /\+ new request/i }))

    fireEvent.change(screen.getByLabelText(/ward\/department code/i), { target: { value: 'HAEM-OP-C' } })
    fireEvent.change(screen.getByLabelText(/ward\/department name/i), { target: { value: 'Haematology Outpatients' } })
    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: 'Dr New Clinician' } })
    fireEvent.change(screen.getByLabelText(/^role$/i), { target: { value: 'Registrar' } })
    fireEvent.change(screen.getByLabelText(/esr number/i), { target: { value: 'ESR-1234' } })
    fireEvent.change(screen.getByLabelText(/destination label/i), { target: { value: 'Test inbox' } })
    fireEvent.change(screen.getByLabelText(/^full name$/i), { target: { value: 'New Fictional Patient' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /fbc/i }))

    fireEvent.click(screen.getByRole('button', { name: /^create request$/i }))

    const nav = screen.getByRole('navigation', { name: /monitoring requests/i })
    expect(within(nav).getByText('New Fictional Patient')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'New Fictional Patient' })).toBeInTheDocument()
  })
})

describe('patient delivery', () => {
  it('prints a patient letter that does show the patient name', () => {
    window.location.hash = `#/letter/${recurring.token}`
    render(<App />)
    expect(screen.getByText(/your test appointment/i)).toBeInTheDocument()
    expect(screen.getByText(recurring.demographics.fullName)).toBeInTheDocument()
  })

  it('renders the NHS App concept mockup with the recurrence reminder', () => {
    window.location.hash = `#/nhsapp/${recurring.token}`
    render(<App />)
    expect(screen.getByText(/concept mockup/i)).toBeInTheDocument()
    expect(screen.getByText(/reminder: repeats every 28 days/i)).toBeInTheDocument()
  })

  it('records simulated email/SMS delivery in the request history when contact details are on file', () => {
    window.location.hash = ''
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /notify patient/i }))
    expect(screen.getByText(new RegExp(`Simulated email sent to ${recurring.demographics.email}`))).toBeInTheDocument()
    expect(screen.getByText(new RegExp(`Simulated SMS sent to ${recurring.demographics.phone}`))).toBeInTheDocument()
  })

  it('falls back to a no-contact-on-file note when the patient has no email or phone', () => {
    window.location.hash = ''
    render(<App />)
    fireEvent.click(screen.getByText('Priya Placeholder'))
    fireEvent.click(screen.getByRole('button', { name: /notify patient/i }))
    expect(screen.getByText(/no email\/phone on file/i)).toBeInTheDocument()
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
