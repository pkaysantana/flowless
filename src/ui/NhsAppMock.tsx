import { QRCodeSVG } from 'qrcode.react'
import { useRequestStore } from '../store/requestStore'
import { presentUrl } from './route'

/**
 * Concept mockup of how this could appear inside the NHS App — not a real integration.
 * Shows the same patient-facing QR plus a recurrence reminder, phone-frame styled for pitching.
 */
export function NhsAppMock({ token }: { token: string }) {
  const { requests } = useRequestStore()
  const request = requests.find((r) => r.token === token)

  if (!request) return <p className="missing">Unknown token — no request found.</p>

  return (
    <main className="detail">
      <p className="muted">Concept mockup — illustrates NHS App integration. Not a real integration.</p>
      <div className="phone-frame">
        <div className="phone-frame__screen">
          <h2>NHS App</h2>
          <p className="muted">My tests</p>
          <div className="qr">
            <QRCodeSVG value={presentUrl(token)} size={160} aria-label="QR code for this request" />
          </div>
          <h3>{request.tests.map((t) => t.name).join(', ')}</h3>
          <p className="muted">
            Valid {request.validFrom.slice(0, 10)} – {request.expiresAt.slice(0, 10)}
          </p>
          {request.recurrence && (
            <p className="banner">
              Reminder: repeats every {request.recurrence.intervalDays} days until {request.recurrence.endsAt.slice(0, 10)}
            </p>
          )}
        </div>
      </div>
    </main>
  )
}
