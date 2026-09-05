import { useState, type FormEvent } from 'react'
import type { MonitoringPlan, RequestedTest } from '../domain'
import { TEST_PANELS } from '../data/testPanels'

/**
 * Specialist intake form. Standalone: builds a `MonitoringPlan` and hands it to `onSubmit`;
 * the caller decides what to do with it (typically `requestStore.createPlan(plan)`).
 * All identifiers generated here are fictional demo values.
 */
export interface NewRequestFormProps {
  onSubmit: (plan: MonitoringPlan) => void
  onCancel?: () => void
  /** ISO timestamp used as the default start date. */
  now: string
  /** Number of plans that already exist — used to generate a unique, deterministic id. */
  existingPlanCount: number
}

const DEFAULT_VALIDITY_DAYS = 14
const SEX_OPTIONS = ['Not recorded', 'Female', 'Male', 'Other'] as const

/** Deterministic, demo-safe ids: PLAN-NEW-001 / PT-FICTIONAL-1001 for the first created plan. */
function nextIds(existingPlanCount: number) {
  const n = existingPlanCount + 1
  return {
    planId: `PLAN-NEW-${String(n).padStart(3, '0')}`,
    patientRef: `PT-FICTIONAL-${String(1000 + n).padStart(4, '0')}`,
  }
}

/** "Respiratory Medicine" → "inbox://demo-respiratory-medicine-monitoring" */
function routingAddressFor(service: string): string {
  const slug = service.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  return `inbox://demo-${slug || 'unassigned'}-monitoring`
}

function toIso(date: string): string {
  return new Date(`${date}T00:00:00.000Z`).toISOString()
}

function blankOrNull(v: string): string | null {
  return v.trim() === '' ? null : v.trim()
}

export function NewRequestForm({ onSubmit, onCancel, now, existingPlanCount }: NewRequestFormProps) {
  const today = now.slice(0, 10)

  // Requester
  const [trustName, setTrustName] = useState('Demo Teaching Hospital NHS Trust (fictional)')
  const [odsOrgCode, setOdsOrgCode] = useState('RRK')
  const [odsSiteCode, setOdsSiteCode] = useState('RRK01')
  const [siteName, setSiteName] = useState('Demo General Hospital')
  const [wardCode, setWardCode] = useState('')
  const [wardName, setWardName] = useState('')
  const [clinicianName, setClinicianName] = useState('')
  const [clinicianRole, setClinicianRole] = useState('')
  const [esrNumber, setEsrNumber] = useState('')
  const [service, setService] = useState('')

  // Patient
  const [fullName, setFullName] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [sex, setSex] = useState<(typeof SEX_OPTIONS)[number]>('Not recorded')
  const [nhsNumber, setNhsNumber] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')

  // Request
  const [selectedCodes, setSelectedCodes] = useState<string[]>([])
  const [instructions, setInstructions] = useState('')
  const [adjustments, setAdjustments] = useState('')
  const [startsAt, setStartsAt] = useState(today)
  const [validityDays, setValidityDays] = useState(DEFAULT_VALIDITY_DAYS)
  const [recurring, setRecurring] = useState(false)
  const [intervalDays, setIntervalDays] = useState(28)
  const [endsAt, setEndsAt] = useState('')

  const [error, setError] = useState<string | null>(null)

  function toggleTest(code: string) {
    setSelectedCodes((cur) => (cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code]))
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (selectedCodes.length === 0) return setError('Select at least one test.')
    if (recurring && !endsAt) return setError('Recurring plans need an end date.')
    if (recurring && endsAt <= startsAt) return setError('Recurrence end date must be after the start date.')
    if (validityDays < 1) return setError('Validity must be at least 1 day.')

    const { planId, patientRef } = nextIds(existingPlanCount)
    const tests: RequestedTest[] = TEST_PANELS.filter((p) => selectedCodes.includes(p.code)).map((p) => ({
      code: p.code,
      name: p.name,
      snomedCode: p.snomedCode,
      ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
    }))

    const plan: MonitoringPlan = {
      id: planId,
      patientRef,
      demographics: {
        fullName: fullName.trim(),
        dateOfBirth: blankOrNull(dateOfBirth),
        sex: sex === 'Not recorded' ? null : sex,
        nhsNumber: blankOrNull(nhsNumber),
        email: blankOrNull(email),
        phone: blankOrNull(phone),
      },
      tests,
      requestingClinician: {
        id: `CLIN-ESR-${esrNumber.trim()}`,
        name: clinicianName.trim(),
        role: clinicianRole.trim(),
        esrNumber: esrNumber.trim(),
      },
      requestingOrganisation: { id: `ORG-${odsOrgCode.trim()}`, name: trustName.trim(), odsOrgCode: odsOrgCode.trim() },
      requestingSite: {
        odsSiteCode: odsSiteCode.trim(),
        siteName: siteName.trim(),
        wardCode: wardCode.trim(),
        wardName: wardName.trim(),
      },
      // Results go to the responsible service/team, not the individual clinician.
      routing: {
        kind: 'TEAM_INBOX',
        label: `${service.trim()} monitoring inbox`,
        address: routingAddressFor(service),
      },
      reasonableAdjustments: adjustments
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
      validityDays,
      recurrence: recurring ? { intervalDays, endsAt: toIso(endsAt) } : null,
      startsAt: toIso(startsAt),
    }
    onSubmit(plan)
  }

  return (
    <form className="intake" onSubmit={handleSubmit} aria-label="New monitoring request">
      <h2>New monitoring request</h2>
      <p className="muted">Fictional demo data only. Creates a plan and its first portable request.</p>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <div className="columns">
        <section>
          <h3>Requesting organisation</h3>
          <label>
            Trust name
            <input required value={trustName} onChange={(e) => setTrustName(e.target.value)} />
          </label>
          <label>
            ODS trust code
            <input required value={odsOrgCode} onChange={(e) => setOdsOrgCode(e.target.value)} placeholder="e.g. RRK" />
          </label>
          <label>
            ODS site code
            <input required value={odsSiteCode} onChange={(e) => setOdsSiteCode(e.target.value)} placeholder="e.g. RRK01" />
          </label>
          <label>
            Site name
            <input required value={siteName} onChange={(e) => setSiteName(e.target.value)} />
          </label>
          <label>
            Ward / department code
            <input required value={wardCode} onChange={(e) => setWardCode(e.target.value)} placeholder="e.g. RESP-OP-A" />
          </label>
          <label>
            Ward / department name
            <input required value={wardName} onChange={(e) => setWardName(e.target.value)} placeholder="e.g. Respiratory outpatients" />
          </label>

          <h3>Requesting clinician</h3>
          <label>
            Name
            <input required value={clinicianName} onChange={(e) => setClinicianName(e.target.value)} />
          </label>
          <label>
            Role
            <input required value={clinicianRole} onChange={(e) => setClinicianRole(e.target.value)} placeholder="e.g. Consultant Respiratory Physician" />
          </label>
          <label>
            ESR number
            <input required value={esrNumber} onChange={(e) => setEsrNumber(e.target.value)} placeholder="e.g. 12345678" />
          </label>

          <h3>Result routing</h3>
          <label>
            Responsible specialist service
            <input required value={service} onChange={(e) => setService(e.target.value)} placeholder="e.g. Respiratory Medicine" />
          </label>
          <p className="muted">
            Results will route to <strong>{service.trim() ? `${service.trim()} monitoring inbox` : '…'}</strong>
            {service.trim() && <code> ({routingAddressFor(service)})</code>}
          </p>
        </section>

        <section>
          <h3>Patient (fictional)</h3>
          <label>
            Full name
            <input required value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </label>
          <label>
            Date of birth
            <input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
          </label>
          <label>
            Sex
            <select value={sex} onChange={(e) => setSex(e.target.value as (typeof SEX_OPTIONS)[number])}>
              {SEX_OPTIONS.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </label>
          <label>
            NHS number (fictional)
            <input value={nhsNumber} onChange={(e) => setNhsNumber(e.target.value)} placeholder="999 000 0003" />
          </label>
          <label>
            Email (for simulated delivery)
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            Phone (for simulated SMS)
            <input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>

          <h3>Tests</h3>
          <fieldset className="intake__tests">
            {TEST_PANELS.map((p) => (
              <label key={p.code} className="intake__check">
                <input type="checkbox" checked={selectedCodes.includes(p.code)} onChange={() => toggleTest(p.code)} />
                <strong>{p.code}</strong> — {p.name} <span className="muted">SNOMED {p.snomedCode}</span>
              </label>
            ))}
          </fieldset>
          <label>
            Collection instructions (optional)
            <input value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="e.g. fasting; citrate tube" />
          </label>
          <label>
            Reasonable adjustments (one per line)
            <textarea rows={3} value={adjustments} onChange={(e) => setAdjustments(e.target.value)} />
          </label>

          <h3>Schedule</h3>
          <label>
            First request valid from
            <input type="date" required value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </label>
          <label>
            Valid for (days)
            <input type="number" min={1} required value={validityDays} onChange={(e) => setValidityDays(Number(e.target.value))} />
          </label>
          <label className="intake__check">
            <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
            Recurring plan
          </label>
          {recurring && (
            <>
              <label>
                Repeat every (days)
                <input type="number" min={1} required value={intervalDays} onChange={(e) => setIntervalDays(Number(e.target.value))} />
              </label>
              <label>
                Until
                <input type="date" required value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
              </label>
            </>
          )}
        </section>
      </div>

      <div className="actions__buttons">
        <button type="submit" className="btn--human">
          Create plan and first request
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}
