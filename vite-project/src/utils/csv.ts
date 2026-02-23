import { csvParse, type DSVRowArray } from 'd3'

export const parseCsv = (text: string): DSVRowArray<string> => csvParse(text)

export const toNumber = (value: string): number | null => {
  const trimmed = value.trim()
  if (trimmed.length === 0) return null

  const parsed = Number.parseFloat(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}
