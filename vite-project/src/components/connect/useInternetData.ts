import { useEffect, useMemo, useState } from 'react'
import * as d3 from 'd3'

interface InternetCsvRow {
  Entity: string
  Code: string
  Year: string
  'Share of the population using the Internet': string
}

export interface InternetPoint {
  year: number
  value: number
}

export interface InternetCountrySeries {
  entity: string
  code: string
  points: InternetPoint[]
  valueByYear: Map<number, number>
}

export interface InternetDataResult {
  loading: boolean
  error: string | null
  countries: InternetCountrySeries[]
  years: number[]
  valueDomain: [number, number]
}

interface ParsedRow {
  entity: string
  code: string
  year: number
  value: number
}

interface BuiltData {
  countries: InternetCountrySeries[]
  years: number[]
  valueDomain: [number, number]
}

interface CountryBuilder {
  entity: string
  code: string
  valueByYear: Map<number, number>
}

const FALLBACK_DOMAIN: [number, number] = [0, 100]

const parseNumber = (value: string): number | null => {
  const parsed = Number((value ?? '').trim())
  if (!Number.isFinite(parsed)) return null
  return parsed
}

const parseRow = (row: InternetCsvRow): ParsedRow | null => {
  const entity = (row.Entity ?? '').trim()
  const code = (row.Code ?? '').trim()
  const yearValue = parseNumber(row.Year ?? '')
  const shareValue = parseNumber(row['Share of the population using the Internet'] ?? '')

  if (!entity || !code || code.startsWith('OWID')) return null
  if (yearValue === null || shareValue === null) return null

  const year = Math.trunc(yearValue)
  if (!Number.isFinite(year)) return null

  return {
    entity,
    code,
    year,
    value: shareValue
  }
}

const buildData = (rows: ParsedRow[]): BuiltData => {
  if (rows.length === 0) {
    return {
      countries: [],
      years: [],
      valueDomain: FALLBACK_DOMAIN
    }
  }

  const yearSet = new Set<number>()
  const countryBuilders = new Map<string, CountryBuilder>()
  let valueMin = Number.POSITIVE_INFINITY
  let valueMax = Number.NEGATIVE_INFINITY

  rows.forEach(row => {
    yearSet.add(row.year)
    valueMin = Math.min(valueMin, row.value)
    valueMax = Math.max(valueMax, row.value)

    const key = `${row.code}::${row.entity}`
    const existing = countryBuilders.get(key)
    if (existing) {
      existing.valueByYear.set(row.year, row.value)
      return
    }

    countryBuilders.set(key, {
      entity: row.entity,
      code: row.code,
      valueByYear: new Map<number, number>([[row.year, row.value]])
    })
  })

  const years = Array.from(yearSet).sort((a, b) => a - b)

  const countries = Array.from(countryBuilders.values())
    .map(builder => {
      const points = Array.from(builder.valueByYear.entries())
        .map(([year, value]) => ({ year, value }))
        .sort((a, b) => a.year - b.year)

      return {
        entity: builder.entity,
        code: builder.code,
        points,
        valueByYear: new Map(points.map(point => [point.year, point.value] as const))
      } satisfies InternetCountrySeries
    })
    .sort((a, b) => a.entity.localeCompare(b.entity))

  if (!Number.isFinite(valueMin) || !Number.isFinite(valueMax)) {
    return {
      countries,
      years,
      valueDomain: FALLBACK_DOMAIN
    }
  }

  const clampedMin = Math.max(0, Math.floor(valueMin))
  const clampedMax = Math.min(100, Math.ceil(valueMax))
  if (!Number.isFinite(clampedMin) || !Number.isFinite(clampedMax) || clampedMax < clampedMin) {
    return {
      countries,
      years,
      valueDomain: FALLBACK_DOMAIN
    }
  }

  return {
    countries,
    years,
    valueDomain: FALLBACK_DOMAIN
  }
}

export function useInternetData(): InternetDataResult {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<ParsedRow[]>([])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}share-of-individuals-using-the-internet.csv`)
        if (!response.ok) {
          throw new Error(`Failed to load internet-use CSV (${response.status})`)
        }

        const text = await response.text()
        if (cancelled) return

        const parsed = d3
          .csvParse(text, raw => parseRow(raw as unknown as InternetCsvRow))
          .filter((row): row is ParsedRow => row !== null)

        setRows(parsed)
        setError(null)
        setLoading(false)
      } catch (fetchError) {
        if (cancelled) return
        setRows([])
        setError(fetchError instanceof Error ? fetchError.message : String(fetchError))
        setLoading(false)
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [])

  const built = useMemo(() => buildData(rows), [rows])

  return {
    loading,
    error,
    countries: built.countries,
    years: built.years,
    valueDomain: built.valueDomain
  }
}
