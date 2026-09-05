import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import App from './App'
import { referralStore } from '../store/referralStore'

describe('App smoke test', () => {
  beforeEach(() => referralStore.reset())

  it('golden path: pathway chosen from guidance, pre-flight clean, reaches READY_TO_SEND', () => {
    render(<App />)
    const list = screen.getByRole('navigation', { name: 'Referrals' })
    expect(within(list).getByText('Alex Example')).toBeInTheDocument()
    expect(within(list).getByText('Sam Placeholder')).toBeInTheDocument()

    const detail = screen.getByRole('article')
    const click = (label: RegExp) => fireEvent.click(within(detail).getByRole('button', { name: label }))

    click(/Generate pathway options/)
    expect(within(detail).getAllByTestId('pathway-option')).toHaveLength(2)
    click(/Clinician reviews options/)
    // Choose the referral option (first "Choose" button = RACPC referral).
    fireEvent.click(within(detail).getAllByRole('button', { name: 'Choose' })[0])
    expect(within(detail).getByTestId('pathway-decision')).toHaveTextContent('Rapid Access Chest Pain Clinic')

    click(/Draft referral/)
    click(/Run pre-flight check/)
    click(/Ready for clinician approval/)
    click(/Clinician approves/)
    click(/Mark ready to send/)

    expect(within(detail).getByTestId('state-badge')).toHaveTextContent('READY TO SEND')
    expect(within(detail).getByText(/Nothing is sent automatically/)).toBeInTheDocument()
  })

  it('failure case: referral pre-flight surfaces issues and blocks approval', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Sam Placeholder/ }))
    const detail = screen.getByRole('article')
    const click = (label: RegExp) => fireEvent.click(within(detail).getByRole('button', { name: label }))

    click(/Generate pathway options/)
    click(/Clinician reviews options/)
    // Use the override form to pick a referral service explicitly (with a note).
    fireEvent.click(within(detail).getByText(/Choose a different pathway/))
    fireEvent.change(within(detail).getByLabelText('Override pathway'), { target: { value: 'SECONDARY_CARE_REFERRAL' } })
    fireEvent.change(within(detail).getByLabelText('Receiving service'), { target: { value: 'Cardiology Outpatients' } })
    fireEvent.change(within(detail).getByLabelText('Override reason'), { target: { value: 'Clinical concern despite no ECG' } })
    click(/Confirm override/)
    expect(within(detail).getByTestId('pathway-decision')).toHaveTextContent('Cardiology Outpatients')

    click(/Draft referral/)
    click(/Run pre-flight check/)
    expect(within(detail).getAllByTestId('issue').length).toBeGreaterThanOrEqual(5)
    expect(within(detail).getAllByText('Not recorded').length).toBeGreaterThan(0)

    // Only the computed pre-flight outcome is offered; approval is not even presented while issues remain.
    expect(within(detail).queryByRole('button', { name: /Ready for clinician approval/ })).toBeNull()

    click(/Flag for review/)
    expect(within(detail).getByTestId('state-badge')).toHaveTextContent('NEEDS REVIEW')
  })

  it('reset restores the seed', () => {
    render(<App />)
    const detail = screen.getByRole('article')
    fireEvent.click(within(detail).getByRole('button', { name: /Generate pathway options/ }))
    expect(within(detail).getByTestId('state-badge')).toHaveTextContent('PATHWAY OPTIONS GENERATED')
    fireEvent.click(screen.getByRole('button', { name: 'Reset demo' }))
    expect(within(detail).getByTestId('state-badge')).toHaveTextContent('CASE OPENED')
  })
})
