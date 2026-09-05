import { useRequestStore } from '../store/requestStore'
import { presentUrl } from './route'
import { PrintCard } from './PrintCard'

/** Printable patient-facing letter: the same QR shown in the console, styled for posting/printing. */
export function PatientLetter({ token }: { token: string }) {
  const { requests } = useRequestStore()
  const request = requests.find((r) => r.token === token)

  if (!request) return <p className="missing">Unknown token — no request found.</p>

  return (
    <PrintCard
      title="Your test appointment"
      subtitle={request.demographics.fullName}
      qrValue={presentUrl(token)}
      note={`Show this QR code at any participating collection unit between ${request.validFrom.slice(0, 10)} and ${request.expiresAt.slice(0, 10)}.`}
    >
      <ul className="plain">
        {request.tests.map((t) => (
          <li key={t.code}>{t.name}</li>
        ))}
      </ul>
      {request.reasonableAdjustments.length > 0 && <p className="muted">Adjustments noted: {request.reasonableAdjustments.join(', ')}</p>}
    </PrintCard>
  )
}
