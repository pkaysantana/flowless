import { useState } from 'react'
import { useReferrals, referralStore } from '../store/referralStore'
import { ReferralDetail } from './ReferralDetail'
import { StateBadge } from './StateBadge'

const TITLE = import.meta.env.VITE_APP_TITLE || 'Referral Coordination — Demo'
const RESET_ENABLED = import.meta.env.VITE_ENABLE_DEMO_RESET !== 'false'

export default function App() {
  const referrals = useReferrals()
  const [selectedId, setSelectedId] = useState<string>(referrals[0]?.id ?? '')
  const selected = referrals.find((r) => r.id === selectedId) ?? referrals[0]

  return (
    <div className="app">
      <header className="app__header">
        <h1>{TITLE}</h1>
        <div className="app__header-actions">
          <span className="banner">Fictional demo data only — no real patients</span>
          {RESET_ENABLED && (
            <button type="button" onClick={() => referralStore.reset()}>
              Reset demo
            </button>
          )}
        </div>
      </header>

      <main className="app__body">
        <nav className="list" aria-label="Referrals">
          {referrals.map((r) => (
            <button
              type="button"
              key={r.id}
              className={`list__item ${r.id === selected?.id ? 'list__item--active' : ''}`}
              onClick={() => setSelectedId(r.id)}
            >
              <div className="list__item-title">
                {r.patient.fullName.value ?? <em>Name not recorded</em>}
              </div>
              <div className="list__item-meta">
                {r.id} · {r.specialty}
                {r.issues.length > 0 && <span className="pill pill--warn">{r.issues.length} issue(s)</span>}
              </div>
              <StateBadge state={r.state} />
            </button>
          ))}
        </nav>

        <section className="detail">
          {selected ? <ReferralDetail referral={selected} /> : <p>No referrals loaded.</p>}
        </section>
      </main>
    </div>
  )
}
