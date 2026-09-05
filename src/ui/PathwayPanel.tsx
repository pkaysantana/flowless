import { useState } from 'react'
import { PATHWAY_KINDS, type PathwayKind, type Referral } from '../domain'
import { knownServices } from '../data/demo'
import { referralStore } from '../store/referralStore'
import { PATHWAY_LABEL } from './labels'

interface Props {
  referral: Referral
  actor: string
  onError: (message: string | null) => void
}

/**
 * Shows generated pathway options (recommendations only) and lets the clinician
 * explicitly choose one — or override with a different pathway plus a note.
 */
export function PathwayPanel({ referral, actor, onError }: Props) {
  const canSelect = referral.state === 'CLINICIAN_PATHWAY_REVIEW'
  const [overrideKind, setOverrideKind] = useState<PathwayKind>('MANAGE_IN_PRIMARY_CARE')
  const [overrideService, setOverrideService] = useState<string>(knownServices()[0] ?? '')
  const [note, setNote] = useState('')

  function choose(kind: PathwayKind, service: string | undefined, n: string) {
    onError(null)
    try {
      referralStore.selectPathway(referral.id, kind, service, actor, n)
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Unexpected error')
    }
  }

  if (referral.pathway) {
    const p = referral.pathway
    return (
      <section data-testid="pathway-decision">
        <h3>Pathway decision</h3>
        <p>
          <strong>{PATHWAY_LABEL[p.kind]}</strong>
          {p.service && <> → {p.service}</>} {p.override && <span className="pill pill--warn">clinician override</span>}
        </p>
        <p className="muted">
          {p.actor} · {p.at}
          {p.note && <> · {p.note}</>}
        </p>
      </section>
    )
  }

  if (referral.state === 'CASE_OPENED') return null

  return (
    <section data-testid="pathway-options">
      <h3>Pathway options <span className="pill">recommendations only</span></h3>
      {referral.pathwayOptions.length === 0 ? (
        <p className="muted">No guidance matched this case. The clinician must choose a pathway below.</p>
      ) : (
        <ul className="options">
          {referral.pathwayOptions.map((o) => (
            <li key={`${o.guidanceId}:${o.kind}:${o.service ?? ''}`} className="option" data-testid="pathway-option">
              <div>
                <strong>{o.title}</strong>{' '}
                <span className="pill">{PATHWAY_LABEL[o.kind]}</span>
                <p>{o.rationale}</p>
                <div className="muted">
                  {o.source} · <code>{o.guidanceId}</code>
                  {o.service && <> · {o.service}</>}
                </div>
              </div>
              {canSelect && (
                <button type="button" className="btn--human" onClick={() => choose(o.kind, o.service, 'Selected from guidance options')}>
                  Choose
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canSelect && (
        <details className="override">
          <summary>Choose a different pathway (override)</summary>
          <div className="override__form">
            <select aria-label="Override pathway" value={overrideKind} onChange={(e) => setOverrideKind(e.target.value as PathwayKind)}>
              {PATHWAY_KINDS.map((k) => (
                <option key={k} value={k}>
                  {PATHWAY_LABEL[k]}
                </option>
              ))}
            </select>
            {overrideKind === 'SECONDARY_CARE_REFERRAL' && (
              <select aria-label="Receiving service" value={overrideService} onChange={(e) => setOverrideService(e.target.value)}>
                {knownServices().map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            )}
            <input
              aria-label="Override reason"
              placeholder="Reason for override (required)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <button
              type="button"
              className="btn--human"
              disabled={note.trim().length === 0}
              onClick={() =>
                choose(overrideKind, overrideKind === 'SECONDARY_CARE_REFERRAL' ? overrideService : undefined, note.trim())
              }
            >
              Confirm override
            </button>
          </div>
        </details>
      )}
    </section>
  )
}
