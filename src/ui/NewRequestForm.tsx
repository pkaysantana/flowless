import { useState, type FormEvent } from 'react'
import type { MonitoringPlan, MonitoringRequest, RoutingDestination } from '../domain'
import { requestStore } from '../store/requestStore'
import { TEST_PANELS } from '../data/testPanels'

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

export function NewRequestForm({ onCreated, onCancel }: { onCreated: (r: MonitoringRequest) => void; onCancel: () => void }) {
  const [odsOrgCode, setOdsOrgCode] = useState('RRK')
  const [orgName, setOrgName] = useState('Demo Teaching Hospital NHS Trust')
  const [odsSiteCode, setOdsSiteCode] = useState('RRK01')
  const [siteName, setSiteName] = useState('Demo Teaching Hospital — Main Site')
  const [wardCode, setWardCode] = useState('')
  const [wardName, setWardName] = useState('')
  const [clinicianName, setClinicianName] = useState('')
  const [clinicianRole, setClinicianRole] = useState('')
  const [esrNumber, setEsrNumber] = useState('')
  const [routingKind, setRoutingKind] = useState<RoutingDestination['kind']>('TEAM_INBOX')
  const [routingLabel, setRoutingLabel] = useState('')
  const [routingAddress, setRoutingAddress] = useState('')

  const [fullName, setFullName] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [nhsNumber, setNhsNumber] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [adjustments, setAdjustments] = useState('')

  const [selectedTests, setSelectedTests] = useState<string[]>([])
  const [validityDays, setValidityDays] = useState(14)
  const [isRecurring, setIsRecurring] = useState(false)
  const [intervalDays, setIntervalDays] = useState(28)
  const [endsAt, setEndsAt] = useState('')
  const [error, setError] = useState<string | null>(null)

  function toggleTest(code: string) {
    setSelectedTests((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]))
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (selectedTests.length === 0) {
      setError('Select at least one test.')
      return
    }
    if (isRecurring && !endsAt) {
      setError('Recurring plans need an end date.')
      return
    }

    const tests = TEST_PANELS.filter((p) => selectedTests.includes(p.code))
    const plan: MonitoringPlan = {
      id: newId('PLAN'),
      patientRef: newId('PT'),
      demographics: {
        fullName,
        dateOfBirth: dateOfBirth || null,
        sex: null,
        nhsNumber: nhsNumber || null,
        email: email || null,
        phone: phone || null,
      },
      tests,
      requestingClinician: { id: newId('CLIN'), name: clinicianName, role: clinicianRole, esrNumber },
      requestingOrganisation: { id: newId('ORG'), name: orgName, odsOrgCode },
      requestingSite: { odsSiteCode, siteName, wardCode, wardName },
      routing: { kind: routingKind, label: routingLabel, address: routingAddress || null },
      reasonableAdjustments: adjustments
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean),
      validityDays,
      recurrence: isRecurring ? { intervalDays, endsAt: new Date(endsAt).toISOString() } : null,
      startsAt: requestStore.now(),
    }

    try {
      const created = requestStore.createPlan(plan)
      onCreated(created)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create request')
    }
  }

  return (
    <form className="detail" onSubmit={handleSubmit}>
      <h2>New monitoring request</h2>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <h3>Requesting organisation</h3>
      <div className="columns">
        <label>
          ODS trust code
          <input required value={odsOrgCode} onChange={(e) => setOdsOrgCode(e.target.value)} />
        </label>
        <label>
          Trust name
          <input required value={orgName} onChange={(e) => setOrgName(e.target.value)} />
        </label>
      </div>
      <div className="columns">
        <label>
          ODS site code
          <input required value={odsSiteCode} onChange={(e) => setOdsSiteCode(e.target.value)} />
        </label>
        <label>
          Site name
          <input required value={siteName} onChange={(e) => setSiteName(e.target.value)} />
        </label>
      </div>
      <div className="columns">
        <label>
          Ward/department code
          <input required placeholder="e.g. HAEM-OP-C" value={wardCode} onChange={(e) => setWardCode(e.target.value)} />
        </label>
        <label>
          Ward/department name
          <input required placeholder="e.g. Haematology Outpatients" value={wardName} onChange={(e) => setWardName(e.target.value)} />
        </label>
      </div>

      <h3>Requesting clinician</h3>
      <div className="columns">
        <label>
          Name
          <input required value={clinicianName} onChange={(e) => setClinicianName(e.target.value)} />
        </label>
        <label>
          Role
          <input required value={clinicianRole} onChange={(e) => setClinicianRole(e.target.value)} />
        </label>
      </div>
      <label>
        ESR number
        <input required value={esrNumber} onChange={(e) => setEsrNumber(e.target.value)} />
      </label>

      <h3>Results routing</h3>
      <div className="columns">
        <label>
          Destination type
          <select value={routingKind} onChange={(e) => setRoutingKind(e.target.value as RoutingDestination['kind'])}>
            <option value="TEAM_INBOX">Team inbox</option>
            <option value="CLINICIAN_INBOX">Clinician inbox</option>
          </select>
        </label>
        <label>
          Destination label
          <input required placeholder="e.g. Anticoagulation team inbox" value={routingLabel} onChange={(e) => setRoutingLabel(e.target.value)} />
        </label>
      </div>
      <label>
        Destination address (mailbox id)
        <input placeholder="inbox://…" value={routingAddress} onChange={(e) => setRoutingAddress(e.target.value)} />
      </label>

      <h3>Patient</h3>
      <div className="columns">
        <label>
          Full name
          <input required value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </label>
        <label>
          Date of birth
          <input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
        </label>
      </div>
      <div className="columns">
        <label>
          NHS number
          <input value={nhsNumber} onChange={(e) => setNhsNumber(e.target.value)} />
        </label>
        <label>
          Email (optional, for delivery)
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
      </div>
      <label>
        Phone (optional, for delivery)
        <input value={phone} onChange={(e) => setPhone(e.target.value)} />
      </label>
      <label>
        Reasonable adjustments (comma-separated)
        <input placeholder="e.g. Interpreter (BSL), Wheelchair access" value={adjustments} onChange={(e) => setAdjustments(e.target.value)} />
      </label>

      <h3>Tests requested</h3>
      <div className="actions__buttons">
        {TEST_PANELS.map((p) => (
          <label key={p.code} className="pill">
            <input type="checkbox" checked={selectedTests.includes(p.code)} onChange={() => toggleTest(p.code)} />
            {' '}
            {p.code} — {p.name}
          </label>
        ))}
      </div>

      <h3>Validity &amp; recurrence</h3>
      <label>
        Valid for (days after issue)
        <input type="number" min={1} required value={validityDays} onChange={(e) => setValidityDays(Number(e.target.value))} />
      </label>
      <label>
        <input type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} /> Recurring
      </label>
      {isRecurring && (
        <div className="columns">
          <label>
            Repeat every (days)
            <input type="number" min={1} required value={intervalDays} onChange={(e) => setIntervalDays(Number(e.target.value))} />
          </label>
          <label>
            Ends on
            <input type="date" required value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </label>
        </div>
      )}

      <div className="actions__buttons" style={{ marginTop: '1rem' }}>
        <button type="submit" className="btn--human">
          Create request
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
