import { useState } from 'react'
import { TransitionError } from '../domain'
import { requestStore, useRequestStore } from '../store/requestStore'
import { StateBadge } from './StateBadge'

/** Fictional participating provider. Integration point: derive from provider login/location. */
const DEMO_PROVIDER = 'Hillside Community Phlebotomy (fictional)'

/**
 * What a local phlebotomy provider sees after scanning a QR. The token resolves to the request
 * record held here; the QR itself carried nothing else.
 */
export function ProviderView({ initialToken }: { initialToken: string }) {
  const { requests } = useRequestStore()
  const [token, setToken] = useState(initialToken)
  const [error, setError] = useState<string | null>(null)
  const request = requests.find((r) => r.token === token)

  function act(fn: () => void) {
    setError(null)
    try {
      fn()
    } catch (e) {
      setError(e instanceof TransitionError || e instanceof Error ? e.message : 'Unexpected error')
    }
  }

  return (
    <main className="detail">
      <h2>Provider view — {DEMO_PROVIDER}</h2>
      <p className="muted">Scan a request QR, or paste its token below.</p>
      <div className="token-form">
        <input aria-label="Request token" value={token} onChange={(e) => setToken(e.target.value.trim())} placeholder="tok_…" />
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {token && !request && <p className="missing">Unknown token — no request found.</p>}

      {request && (
        <article className="card">
          <header className="detail__header">
            <div>
              <h2>{request.demographics.fullName}</h2>
              <div className="muted">
                DOB {request.demographics.dateOfBirth ?? 'not recorded'} · valid {request.validFrom.slice(0, 10)} → {request.expiresAt.slice(0, 10)}
              </div>
            </div>
            <StateBadge state={request.status} />
          </header>

          <h3>Tests to collect</h3>
          <ul className="plain">
            {request.tests.map((t) => (
              <li key={t.code}>
                <strong>{t.code}</strong> — {t.name}
                {t.instructions && <div className="muted">{t.instructions}</div>}
              </li>
            ))}
          </ul>

          <h3>Reasonable adjustments</h3>
          {request.reasonableAdjustments.length ? (
            <ul className="plain">
              {request.reasonableAdjustments.map((a) => <li key={a}>{a}</li>)}
            </ul>
          ) : (
            <span className="muted">None recorded</span>
          )}

          <h3>Results go to</h3>
          <p>
            {request.routing.label} · {request.requestingOrganisation.name}
          </p>

          <h3>Actions</h3>
          <div className="actions__buttons">
            {request.status === 'ACTIVE' && (
              <button type="button" className="btn--human" onClick={() => act(() => requestStore.present(token, DEMO_PROVIDER))}>
                Present token (check validity)
              </button>
            )}
            {request.status === 'PRESENTED' && (
              <button type="button" className="btn--human" onClick={() => act(() => requestStore.transition(request.id, 'SAMPLE_COLLECTED', DEMO_PROVIDER))}>
                Confirm sample collected
              </button>
            )}
            {request.status === 'EXPIRED' && <span className="missing">Expired — do not collect. Ask the requesting team for a new request.</span>}
            {!['ACTIVE', 'PRESENTED', 'EXPIRED'].includes(request.status) && <span className="muted">Nothing to do here for this request.</span>}
          </div>
        </article>
      )}
    </main>
  )
}
