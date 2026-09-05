import type { ReactNode } from 'react'
import { QRCodeSVG } from 'qrcode.react'

/** Shared print-friendly layout for the specimen label and the patient letter. */
export function PrintCard({
  title,
  subtitle,
  qrValue,
  note,
  children,
}: {
  title: string
  subtitle?: string
  qrValue: string
  note?: string
  children?: ReactNode
}) {
  return (
    <main className="print-card">
      <h1>{title}</h1>
      {subtitle && <p className="muted">{subtitle}</p>}
      <QRCodeSVG value={qrValue} size={220} />
      {note && <p className="print-card__note">{note}</p>}
      {children}
      <button type="button" className="no-print" onClick={() => window.print()}>
        Print
      </button>
    </main>
  )
}
