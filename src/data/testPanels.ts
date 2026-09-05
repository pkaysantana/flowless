/**
 * Curated demo subset of real NHS test panels with their SNOMED CT concept ids.
 * Not the full NHS terminology — verify against the NHS SNOMED CT UK browser
 * before using any of these codes outside this demo.
 */
export interface TestPanel {
  code: string
  name: string
  snomedCode: string
}

export const TEST_PANELS: TestPanel[] = [
  { code: 'FBC', name: 'Full blood count', snomedCode: '26604007' },
  { code: 'INR', name: 'International normalised ratio', snomedCode: '440685005' },
  { code: 'TFT', name: 'Thyroid function tests', snomedCode: '61167008' },
  { code: 'U&E', name: 'Urea and electrolytes', snomedCode: '311629008' },
  { code: 'HBA1C', name: 'Haemoglobin A1c level', snomedCode: '43396009' },
  { code: 'LFT', name: 'Liver function tests', snomedCode: '166312007' },
]
