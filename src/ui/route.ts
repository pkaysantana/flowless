import { useEffect, useState } from 'react'

/** Tiny hash router: `#/present/<token>` is the provider view; anything else is the specialist console. */
export type Route = { view: 'console' } | { view: 'present'; token: string }

export function parseRoute(hash: string): Route {
  const m = /^#\/present\/([^/?]+)/.exec(hash)
  return m ? { view: 'present', token: decodeURIComponent(m[1]) } : { view: 'console' }
}

/** Absolute URL a QR encodes. Contains only the opaque token. */
export function presentUrl(token: string): string {
  return `${window.location.origin}${window.location.pathname}#/present/${encodeURIComponent(token)}`
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
