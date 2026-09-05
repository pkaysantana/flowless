import { describe, expect, it } from 'vitest'
import { TEST_PANELS } from './testPanels'

describe('curated SNOMED test panels', () => {
  it('every panel has a non-empty code, name, and numeric SNOMED CT id', () => {
    expect(TEST_PANELS.length).toBeGreaterThan(0)
    for (const panel of TEST_PANELS) {
      expect(panel.code.length).toBeGreaterThan(0)
      expect(panel.name.length).toBeGreaterThan(0)
      expect(panel.snomedCode).toMatch(/^\d+$/)
    }
  })

  it('has no duplicate codes or SNOMED ids', () => {
    const codes = TEST_PANELS.map((p) => p.code)
    const snomedCodes = TEST_PANELS.map((p) => p.snomedCode)
    expect(new Set(codes).size).toBe(codes.length)
    expect(new Set(snomedCodes).size).toBe(snomedCodes.length)
  })
})
