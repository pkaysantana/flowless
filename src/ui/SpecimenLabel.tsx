import { useRequestStore } from '../store/requestStore'
import { labUrl } from './route'
import { PrintCard } from './PrintCard'

/**
 * Printable specimen label: a QR pointing at the lab view, plus the request id for a
 * human-readable fallback. Deliberately carries no patient name/DOB — same no-PII
 * principle as the patient-facing QR.
 */
export function SpecimenLabel({ token }: { token: string }) {
  const { requests } = useRequestStore()
  const request = requests.find((r) => r.token === token)

  if (!request) return <p className="missing">Unknown token — no request found.</p>

  return <PrintCard title="Specimen label" subtitle={request.id} qrValue={labUrl(token)} note="No patient data — scan to open the lab view." />
}
