import { useState } from 'react'
import { requestStore, useRequestStore } from '../store/requestStore'
import { StateBadge } from './StateBadge'
import { RequestDetail } from './RequestDetail'
import { ProviderView } from './ProviderView'
import { LabView } from './LabView'
import { SpecimenLabel } from './SpecimenLabel'
import { PatientLetter } from './PatientLetter'
import { NhsAppMock } from './NhsAppMock'
import { NewRequestForm } from './NewRequestForm'
import { useRoute } from './route'

const TITLE = import.meta.env.VITE_APP_TITLE || 'Care Relay — Demo'
const RESET_ENABLED = import.meta.env.VITE_ENABLE_DEMO_RESET !== 'false'

export default function App() {
  const route = useRoute()
  const { requests } = useRequestStore()
  const [selectedId, setSelectedId] = useState<string | null>(requests[0]?.id ?? null)
  const [showNewRequestForm, setShowNewRequestForm] = useState(false)
  const selected = requests.find((r) => r.id === selectedId) ?? requests[0]

  return (
    <div className="app">
      <header className="app__header">
        <h1>{TITLE}</h1>
        <div className="app__header-actions">
          <span className="banner">Fictional demo data only — no real patients</span>
          <span className="muted">Demo clock: {requestStore.now().slice(0, 10)}</span>
          {route.view !== 'console' && <a href="#/">Specialist console</a>}
          {RESET_ENABLED && (
            <button type="button" onClick={() => requestStore.reset()}>
              Reset demo
            </button>
          )}
        </div>
      </header>

      {route.view === 'present' ? (
        <ProviderView initialToken={route.token} />
      ) : route.view === 'lab' ? (
        <LabView initialToken={route.token} />
      ) : route.view === 'label' ? (
        <SpecimenLabel token={route.token} />
      ) : route.view === 'letter' ? (
        <PatientLetter token={route.token} />
      ) : route.view === 'nhsapp' ? (
        <NhsAppMock token={route.token} />
      ) : (
        <div className="app__body">
          <nav className="list" aria-label="Monitoring requests">
            <button type="button" className="btn--human" style={{ margin: '0.75rem' }} onClick={() => setShowNewRequestForm(true)}>
              + New request
            </button>
            {requests.map((r) => (
              <button
                key={r.id}
                type="button"
                className={`list__item ${!showNewRequestForm && r.id === selected?.id ? 'list__item--active' : ''}`}
                onClick={() => {
                  setSelectedId(r.id)
                  setShowNewRequestForm(false)
                }}
              >
                <span className="list__item-title">{r.demographics.fullName}</span>
                <span className="list__item-meta">
                  {r.id} · {r.tests.map((t) => t.code).join(', ')}
                </span>
                <StateBadge state={r.status} />
              </button>
            ))}
          </nav>
          {showNewRequestForm ? (
            <NewRequestForm
              onCreated={(r) => {
                setSelectedId(r.id)
                setShowNewRequestForm(false)
              }}
              onCancel={() => setShowNewRequestForm(false)}
            />
          ) : (
            <main className="detail">{selected ? <RequestDetail request={selected} /> : <p>No requests loaded.</p>}</main>
          )}
        </div>
      )}
    </div>
  )
}
