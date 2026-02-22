import { useEffect, useMemo, useState } from 'react'
import * as d3 from 'd3'

interface GiniCsvRow {
  Entity: string
  Code: string
  Year: string
  'Gini coefficient': string
  'World region according to OWID': string
}

export interface GiniPoint {
  year: number
  value: number
}

export interface GiniCountrySeries {
  entity: string
  code: string
  region: string
  points: GiniPoint[]
  valueByYear: Map<number, number>
}

export interface GiniDataResult {
  loading: boolean
  error: string | null
  countries: GiniCountrySeries[]
  years: number[]
  regions: string[]
  giniDomain: [number, number]
}

interface ParsedRow {
  entity: string
  code: string
  year: number
  gini: number
  region: string
}

interface BuiltData {
  countries: GiniCountrySeries[]
  years: number[]
  regions: string[]
  giniDomain: [number, number]
}

interface CountryBuilder {
  entity: string
  code: string
  region: string
  valueByYear: Map<number, number>
}

const FALLBACK_DOMAIN: [number, number] = [0, 1]

const parseNumber = (value: string): number | null => {
  const parsed = Number(value.trim())
  if (!Number.isFinite(parsed)) return null
  return parsed
}

const parseRow = (row: GiniCsvRow): ParsedRow | null => {
  const entity = (row.Entity ?? '').trim()
  const code = (row.Code ?? '').trim()
  const region = (row['World region according to OWID'] ?? '').trim()
  const yearValue = parseNumber(row.Year ?? '')
  const gini = parseNumber(row['Gini coefficient'] ?? '')

  if (!entity || !code || code.startsWith('OWID')) return null
  if (yearValue === null || gini === null) return null

  const year = Math.trunc(yearValue)
  if (!Number.isFinite(year)) return null

  return {
    entity,
    code,
    year,
    gini,
    region: region || 'Unknown'
  }
}

const buildData = (rows: ParsedRow[]): BuiltData => {
  if (rows.length === 0) {
    return {
      countries: [],
      years: [],
      regions: [],
      giniDomain: FALLBACK_DOMAIN
    }
  }

  const yearSet = new Set<number>()
  const regionSet = new Set<string>()
  const countryBuilders = new Map<string, CountryBuilder>()
  let giniMin = Number.POSITIVE_INFINITY
  let giniMax = Number.NEGATIVE_INFINITY

  rows.forEach(row => {
    yearSet.add(row.year)
    regionSet.add(row.region)
    giniMin = Math.min(giniMin, row.gini)
    giniMax = Math.max(giniMax, row.gini)

    const key = `${row.code}::${row.entity}`
    const existing = countryBuilders.get(key)
    if (existing) {
      existing.valueByYear.set(row.year, row.gini)
      return
    }

    countryBuilders.set(key, {
      entity: row.entity,
      code: row.code,
      region: row.region,
      valueByYear: new Map<number, number>([[row.year, row.gini]])
    })
  })

  const years = Array.from(yearSet).sort((a, b) => a - b)
  const regions = Array.from(regionSet).sort((a, b) => a.localeCompare(b))

  const countries = Array.from(countryBuilders.values())
    .map(builder => {
      const points = Array.from(builder.valueByYear.entries())
        .map(([year, value]) => ({ year, value }))
        .sort((a, b) => a.year - b.year)

      return {
        entity: builder.entity,
        code: builder.code,
        region: builder.region,
        points,
        valueByYear: new Map(points.map(point => [point.year, point.value] as const))
      } satisfies GiniCountrySeries
    })
    .sort((a, b) => a.entity.localeCompare(b.entity))

  if (!Number.isFinite(giniMin) || !Number.isFinite(giniMax)) {
    return {
      countries,
      years,
      regions,
      giniDomain: FALLBACK_DOMAIN
    }
  }

  const roundedMin = Math.floor(giniMin * 100) / 100
  const roundedMax = Math.ceil(giniMax * 100) / 100
  const domain: [number, number] = [roundedMin, roundedMax > roundedMin ? roundedMax : roundedMin + 0.01]

  return {
    countries,
    years,
    regions,
    giniDomain: domain
  }
}

export function useGiniData(): GiniDataResult {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<ParsedRow[]>([])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}economic-inequality-gini-index.csv`)
        if (!response.ok) {
          throw new Error(`Failed to load Gini CSV (${response.status})`)
        }

        const text = await response.text()
        if (cancelled) return

        const parsed = d3
          .csvParse(text, raw => parseRow(raw as unknown as GiniCsvRow))
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
    regions: built.regions,
    giniDomain: built.giniDomain
  }
}
