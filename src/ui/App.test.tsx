import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import App from './App'
import { referralStore } from '../store/referralStore'

describe('App smoke test', () => {
  beforeEach(() => referralStore.reset())

  it('renders both demo referrals and the golden path can reach TRACKING', () => {
    render(<App />)
    const list = screen.getByRole('navigation', { name: 'Referrals' })
    expect(within(list).getByText('Alex Example')).toBeInTheDocument()
    expect(within(list).getByText('Sam Placeholder')).toBeInTheDocument()

    const detail = screen.getByRole('article')
    const click = (label: RegExp) => fireEvent.click(within(detail).getByRole('button', { name: label }))

    click(/Assemble information/)
    click(/Check requirements/)
    click(/Mark ready for review/)
    click(/Clinician approves/)
    click(/Submit referral/)
    click(/Start tracking/)

    expect(within(detail).getByTestId('state-badge')).toHaveTextContent('TRACKING')
    expect(within(detail).getByText(/Demo e-Referral endpoint/)).toBeInTheDocument()
  })

  it('incomplete referral shows issues and blocks review until resolved', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Sam Placeholder/ }))
    const detail = screen.getByRole('article')
    const click = (label: RegExp) => fireEvent.click(within(detail).getByRole('button', { name: label }))

    click(/Assemble information/)
    click(/Check requirements/)
    expect(within(detail).getAllByTestId('issue').length).toBeGreaterThanOrEqual(4)
    expect(within(detail).getAllByText('Not recorded').length).toBeGreaterThan(0)

    // Only the human-review route is offered and it is the required outcome.
    expect(within(detail).queryByRole('button', { name: /Mark ready for review/ })).not.toBeNull()
    click(/Mark ready for review/)
    expect(within(detail).getByRole('alert')).toHaveTextContent(/unresolved issue/)

    click(/Flag for human review/)
    expect(within(detail).getByTestId('state-badge')).toHaveTextContent('NEEDS HUMAN REVIEW')
  })

  it('reset restores the seed', () => {
    render(<App />)
    const detail = screen.getByRole('article')
    fireEvent.click(within(detail).getByRole('button', { name: /Assemble information/ }))
    expect(within(detail).getByTestId('state-badge')).toHaveTextContent('INFORMATION ASSEMBLED')
    fireEvent.click(screen.getByRole('button', { name: 'Reset demo' }))
    expect(within(detail).getByTestId('state-badge')).toHaveTextContent('REFERRAL DECIDED')
  })
})
