import { useEffect, useState } from 'react'

/**
 * Tiny hash router. `#/present/<token>` is the collection-unit provider view,
 * `#/lab/<token>` the lab view, `#/nhsapp/<token>` the NHS App concept mockup;
 * anything else is the specialist console.
 */
export type Route =
  | { view: 'console' }
  | { view: 'present'; token: string }
  | { view: 'lab'; token: string }
  | { view: 'nhsapp'; token: string }
  | { view: 'label'; token: string }

const ROUTE_PATTERNS: { view: 'present' | 'lab' | 'nhsapp' | 'label'; pattern: RegExp }[] = [
  { view: 'present', pattern: /^#\/present\/([^/?]+)/ },
  { view: 'lab', pattern: /^#\/lab\/([^/?]+)/ },
  { view: 'nhsapp', pattern: /^#\/nhsapp\/([^/?]+)/ },
  { view: 'label', pattern: /^#\/label\/([^/?]+)/ },
]

export function parseRoute(hash: string): Route {
  for (const { view, pattern } of ROUTE_PATTERNS) {
    const m = pattern.exec(hash)
    if (m) return { view, token: decodeURIComponent(m[1]) }
  }
  return { view: 'console' }
}

function urlFor(path: string, token: string): string {
  return `${window.location.origin}${window.location.pathname}#/${path}/${encodeURIComponent(token)}`
}

/** Absolute URL a QR encodes. Contains only the opaque token. */
export function presentUrl(token: string): string {
  return urlFor('present', token)
}

/** URL for the lab view — printed onto the specimen label, never containing patient data. */
export function labUrl(token: string): string {
  return urlFor('lab', token)
}

/** URL for the NHS App concept mockup screen. */
export function nhsAppUrl(token: string): string {
  return urlFor('nhsapp', token)
}

/** URL for the printable specimen-label page (opened in a popup, not encoded anywhere). */
export function specimenLabelUrl(token: string): string {
  return urlFor('label', token)
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash))
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}
