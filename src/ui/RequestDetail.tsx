import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { availableTransitions, TransitionError, type MonitoringRequest, type RequestState } from '../domain'
import { requestStore } from '../store/requestStore'
import { StateBadge } from './StateBadge'
import { presentUrl } from './route'

/** Placeholder actor until a demo login exists. Integration point: replace with the signed-in user. */
const DEMO_ACTOR = 'Demo Specialist'

/** Placeholder lab actor until the lab view (PLAN.md §6) exists — lab steps now require a named human. */
const DEMO_LAB = 'Demo Pathology Lab (fictional)'

/** Steps driven from this console. Provider steps live in ProviderView; lab/routing steps are simulated below. */
const CONSOLE_STEPS: ReadonlySet<RequestState> = new Set<RequestState>(['ACTIVE', 'CANCELLED', 'REVIEWED', 'AWAITING_CLINICIAN_REVIEW'])

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="field">
      <dt>{label}</dt>
      <dd>{value === null || value === undefined || value === '' ? <span className="missing">Not recorded</span> : value}</dd>
    </div>
  )
}

export function RequestDetail({ request: r }: { request: MonitoringRequest }) {
  // Errors are tied to the record revision they occurred on, so they vanish once the record changes.
  const [errorAt, setErrorAt] = useState<{ id: string; rev: number; message: string } | null>(null)
  const rev = r.history.length
  const error = errorAt && errorAt.id === r.id && errorAt.rev === rev ? errorAt.message : null

  function run(fn: () => void) {
    setErrorAt(null)
    try {
      fn()
    } catch (e) {
      const message = e instanceof TransitionError ? e.message : e instanceof Error ? e.message : 'Unexpected error'
      setErrorAt({ id: r.id, rev, message })
    }
  }

  const steps = availableTransitions(r.status).filter((t) => CONSOLE_STEPS.has(t.to))
  const url = presentUrl(r.token)

  return (
    <article>
      <header className="detail__header">
        <div>
          <h2>{r.demographics.fullName}</h2>
          <div className="muted">
            {r.id} · request #{r.sequence} of plan {r.planId}
            {r.recurrence ? ` · every ${r.recurrence.intervalDays} days until ${r.recurrence.endsAt.slice(0, 10)}` : ' · one-off'}
          </div>
        </div>
        <StateBadge state={r.status} />
      </header>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <div className="columns">
        <section>
          <h3>Portable request (QR)</h3>
          <div className="qr">
            <QRCodeSVG value={url} size={144} aria-label={`QR code for request ${r.id}`} />
            <div>
              <p className="muted">
                Encodes only an opaque token — no clinical or demographic data. Any participating provider can scan it.
              </p>
              <p>
                Token: <code data-testid="token">{r.token}</code>
              </p>
              <p className="muted">
                <a href={url}>Open provider view for this token</a>
              </p>
            </div>
          </div>
          <dl>
            <Field label="Valid from" value={r.validFrom.slice(0, 10)} />
            <Field label="Expires" value={r.expiresAt.slice(0, 10)} />
            <Field label="Fulfilled by" value={r.fulfilledBy} />
          </dl>
        </section>

        <section>
          <h3>Actions</h3>
          <div className="actions__buttons">
            {steps.map((t) => (
              <button key={t.to} type="button" className="btn--human" onClick={() => run(() => requestStore.transition(r.id, t.to, DEMO_ACTOR))}>
                {t.label}
              </button>
            ))}
            {r.status === 'SAMPLE_COLLECTED' && (
              <button type="button" onClick={() => run(() => requestStore.transition(r.id, 'LAB_PROCESSING', DEMO_LAB))}>
                Simulate: lab receives sample
              </button>
            )}
            {r.status === 'LAB_PROCESSING' && (
              <button type="button" onClick={() => run(() => requestStore.receiveResult(r.id, 'Fictional result received (not interpreted)', DEMO_LAB))}>
                Simulate: lab result available → route
              </button>
            )}
            {steps.length === 0 && !['SAMPLE_COLLECTED', 'LAB_PROCESSING'].includes(r.status) && (
              <span className="muted">
                {r.status === 'PRESENTED' ? 'Waiting for provider to confirm collection.' : 'No further actions.'}
              </span>
            )}
          </div>

          <h3>Result routing</h3>
          <dl>
            <Field label="Destination" value={`${r.routing.label} (${r.routing.kind.replaceAll('_', ' ').toLowerCase()})`} />
            <Field label="Address" value={r.routing.address} />
            <Field label="Result" value={r.result ? `${r.result.summary} — ${r.result.receivedAt.slice(0, 10)}` : undefined} />
          </dl>
        </section>
      </div>

      <div className="columns">
        <section>
          <h3>Patient (fictional)</h3>
          <dl>
            <Field label="Patient reference" value={r.patientRef} />
            <Field label="Date of birth" value={r.demographics.dateOfBirth} />
            <Field label="Sex" value={r.demographics.sex} />
            <Field label="NHS number (fictional)" value={r.demographics.nhsNumber} />
          </dl>
          <h3>Reasonable adjustments</h3>
          {r.reasonableAdjustments.length ? (
            <ul className="plain">
              {r.reasonableAdjustments.map((a) => <li key={a}>{a}</li>)}
            </ul>
          ) : (
            <span className="missing">None recorded</span>
          )}
        </section>
        <section>
          <h3>Requested tests</h3>
          <ul className="plain">
            {r.tests.map((t) => (
              <li key={t.code}>
                <strong>{t.code}</strong> — {t.name}
                {t.instructions && <div className="muted">{t.instructions}</div>}
              </li>
            ))}
          </ul>
          <h3>Requested by</h3>
          <dl>
            <Field label="Clinician" value={`${r.requestingClinician.name} · ${r.requestingClinician.role}`} />
            <Field label="Organisation" value={r.requestingOrganisation.name} />
          </dl>
        </section>
      </div>

      <section>
        <h3>History</h3>
        <ol className="history">
          {r.history.map((h, i) => (
            <li key={i}>
              {h.at} — <strong>{h.actor}</strong>: {h.from ? `${h.from} → ` : ''}{h.to}
              {h.note && <div className="muted">{h.note}</div>}
            </li>
          ))}
        </ol>
      </section>
    </article>
  )
}
