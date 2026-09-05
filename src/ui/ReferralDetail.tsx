import { useState } from 'react'
import {
  availableTransitions,
  TransitionError,
  type FieldValue,
  type Issue,
  type Referral,
} from '../domain'
import { referralStore } from '../store/referralStore'
import { StateBadge } from './StateBadge'
import { PathwayPanel } from './PathwayPanel'

/** Placeholder human actor until auth exists. Integration point: replace with the signed-in user. */
const DEMO_ACTOR = 'Demo Clinician'

function Field({ label, field }: { label: string; field: FieldValue<unknown> }) {
  const v = field.value
  const display = Array.isArray(v) ? (v.length ? v.join(', ') : null) : v
  return (
    <div className="field">
      <dt>{label}</dt>
      <dd>
        {display === null || display === undefined ? (
          <span className="missing">Not recorded</span>
        ) : (
          String(display)
        )}
        <span className="provenance">
          {field.source}
          {field.confidence !== undefined && ` · ${Math.round(field.confidence * 100)}%`}
        </span>
      </dd>
    </div>
  )
}

const ISSUE_LABEL: Record<Issue['kind'], string> = {
  MISSING_REQUIRED: 'Missing required information',
  CONFLICTING: 'Conflicting information',
  UNCERTAIN_EXTRACTION: 'Uncertain extraction',
  HUMAN_REVIEW_REQUIRED: 'Human review required',
}

function IssueCard({ referral, issue }: { referral: Referral; issue: Issue }) {
  const [note, setNote] = useState('')
  return (
    <li className={`issue issue--${issue.kind.toLowerCase()}`} data-testid="issue">
      <strong>{ISSUE_LABEL[issue.kind]}</strong> <code>{issue.field}</code>
      <p>{issue.message}</p>
      {issue.candidates && (
        <ul className="candidates">
          {issue.candidates.map((c) => (
            <li key={c.source}>
              <code>{c.source}</code>: {c.value}
            </li>
          ))}
        </ul>
      )}
      <div className="issue__resolve">
        <input
          placeholder="How was this resolved? (required)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          aria-label={`Resolution note for ${issue.field}`}
        />
        <button
          type="button"
          disabled={note.trim().length === 0}
          onClick={() => referralStore.resolveIssue(referral.id, issue, DEMO_ACTOR, note.trim())}
        >
          Mark resolved
        </button>
      </div>
    </li>
  )
}

export function ReferralDetail({ referral }: { referral: Referral }) {
  const [error, setError] = useState<string | null>(null)
  // 'Select pathway' is performed via the PathwayPanel, not a plain button.
  const transitions = availableTransitions(referral.state).filter((t) => t.to !== 'PATHWAY_SELECTED')

  function go(to: Referral['state'], requiresHuman: boolean) {
    setError(null)
    try {
      referralStore.transition(referral.id, to, requiresHuman ? DEMO_ACTOR : 'system')
    } catch (e) {
      setError(e instanceof TransitionError ? e.message : 'Unexpected error — see console')
      if (!(e instanceof TransitionError)) console.error(e)
    }
  }

  return (
    <article>
      <header className="detail__header">
        <div>
          <h2>{referral.patient.fullName.value ?? <em>Name not recorded</em>}</h2>
          <div className="muted">
            {referral.id} · {referral.features.presentingProblem.value ?? <em>Presenting problem not recorded</em>}
          </div>
        </div>
        <StateBadge state={referral.state} />
      </header>

      <section className="actions">
        <h3>Next steps</h3>
        {transitions.length === 0 && referral.state !== 'CLINICIAN_PATHWAY_REVIEW' && (
          <p className="muted">No further transitions. Nothing is sent automatically.</p>
        )}
        {referral.state === 'CLINICIAN_PATHWAY_REVIEW' && (
          <p className="muted">Choose or override a pathway below to continue.</p>
        )}
        <div className="actions__buttons">
          {transitions.map((t) => (
            <button
              type="button"
              key={t.to}
              className={t.requiresHuman ? 'btn--human' : ''}
              onClick={() => go(t.to, t.requiresHuman)}
              title={t.requiresHuman ? 'Requires a human decision' : 'Automatic step'}
            >
              {t.label}
              {t.requiresHuman && <span className="pill">human</span>}
            </button>
          ))}
        </div>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </section>

      <PathwayPanel referral={referral} actor={DEMO_ACTOR} onError={setError} />

      <section>
        <h3>
          Issues{' '}
          <span className={`pill ${referral.issues.length ? 'pill--warn' : ''}`}>{referral.issues.length}</span>
        </h3>
        {referral.issues.length === 0 ? (
          <p className="muted">No open issues.</p>
        ) : (
          <ul className="issues">
            {referral.issues.map((i) => (
              <IssueCard key={`${i.kind}:${i.field}`} referral={referral} issue={i} />
            ))}
          </ul>
        )}
      </section>

      <section className="columns">
        <div>
          <h3>Case features</h3>
          <dl>
            <Field label="Presenting problem" field={referral.features.presentingProblem} />
            <Field label="Findings (tags)" field={referral.features.findings} />
          </dl>
          <h3>Patient</h3>
          <dl>
            <Field label="NHS number (fictional)" field={referral.patient.nhsNumber} />
            <Field label="Date of birth" field={referral.patient.dateOfBirth} />
            <Field label="GP practice" field={referral.patient.gpPractice} />
          </dl>
        </div>
        <div>
          <h3>Clinical</h3>
          <dl>
            <Field label="Reason for referral" field={referral.clinical.reasonForReferral} />
            <Field label="Relevant history" field={referral.clinical.relevantHistory} />
            <Field label="Medications" field={referral.clinical.medications} />
            <Field label="Allergies" field={referral.clinical.allergies} />
            <Field label="Urgency" field={referral.clinical.urgency} />
          </dl>
        </div>
      </section>

      <section>
        <h3>History</h3>
        <ol className="history">
          {referral.history.map((h, i) => (
            <li key={i}>
              <span className="muted">{h.at}</span> — <strong>{h.actor}</strong>:{' '}
              {h.from && h.from !== h.to ? `${h.from} → ${h.to}` : h.to}
              {h.note && <div className="muted">{h.note}</div>}
            </li>
          ))}
        </ol>
      </section>
    </article>
  )
}
