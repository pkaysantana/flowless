import { useState } from 'react'
import { TransitionError } from '../domain'
import { requestStore, useRequestStore } from '../store/requestStore'
import { StateBadge } from './StateBadge'

/** Integration point: derive from lab login/location. */
const DEMO_LAB = 'Demo Reference Lab'

/**
 * What a lab sees after scanning the specimen label printed by the collection unit.
 * The label carries the same opaque token as the patient's QR — no separate transport
 * of clinical data is needed between collection and lab.
 */
export function LabView({ initialToken }: { initialToken: string }) {
  const { requests } = useRequestStore()
  const [token, setToken] = useState(initialToken)
  const [summary, setSummary] = useState('')
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
      <h2>Lab view — {DEMO_LAB}</h2>
      <p className="muted">Scan the specimen label, or paste its token below.</p>
      <div className="token-form">
        <input aria-label="Specimen token" value={token} onChange={(e) => setToken(e.target.value.trim())} placeholder="tok_…" />
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
                {request.id} · results to {request.routing.label}
              </div>
            </div>
            <StateBadge state={request.status} />
          </header>

          <h3>Tests requested</h3>
          <ul className="plain">
            {request.tests.map((t) => (
              <li key={t.code}>
                <strong>{t.code}</strong> — {t.name} <span className="muted">(SNOMED {t.snomedCode})</span>
              </li>
            ))}
          </ul>

          <h3>Actions</h3>
          <div className="actions__buttons">
            {request.status === 'SAMPLE_COLLECTED' && (
              <button
                type="button"
                className="btn--human"
                onClick={() => act(() => requestStore.transition(request.id, 'LAB_PROCESSING', DEMO_LAB))}
              >
                Confirm sample received
              </button>
            )}
            {request.status === 'LAB_PROCESSING' && (
              <>
                <input
                  aria-label="Result summary"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="Result summary"
                />
                <button
                  type="button"
                  className="btn--human"
                  disabled={!summary.trim()}
                  onClick={() => act(() => requestStore.receiveResult(request.id, summary.trim(), DEMO_LAB))}
                >
                  Submit result → route to requester
                </button>
              </>
            )}
            {!['SAMPLE_COLLECTED', 'LAB_PROCESSING'].includes(request.status) && (
              <span className="muted">Nothing to do here for this request.</span>
            )}
          </div>
        </article>
      )}
    </main>
  )
}
