import { useEffect, useMemo, useState } from 'react'
import * as d3 from 'd3'

interface InternetCsvRow {
  Entity: string
  Code: string
  Year: string
  'Share of the population using the Internet': string
}

interface InternetMetadataColumn {
  titleShort?: string
  titleLong?: string
  unit?: string
  timespan?: string
  lastUpdated?: string
  citationShort?: string
}

interface InternetMetadataRaw {
  columns?: Record<string, InternetMetadataColumn>
  chart?: {
    title?: string
    citation?: string
  }
}

export interface InternetMetadata {
  title: string
  unit: string
  timespan: string
  lastUpdated: string
  citation: string
}

export interface InternetPoint {
  year: number
  value: number
}

export interface InternetCountrySeries {
  entity: string
  code: string
  key: string
  points: InternetPoint[]
  valueByYear: Map<number, number>
}

export interface InternetDataResult {
  loading: boolean
  error: string | null
  countries: InternetCountrySeries[]
  years: number[]
  valueDomain: [number, number]
  metadata: InternetMetadata | null
}

interface ParsedRow {
  entity: string
  code: string
  year: number
  value: number
}

interface CountryBuilder {
  entity: string
  code: string
  valueByYear: Map<number, number>
}

const DEFAULT_DOMAIN: [number, number] = [0, 100]

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

const buildCountries = (rows: ParsedRow[]): { countries: InternetCountrySeries[]; years: number[] } => {
  const yearSet = new Set<number>()
  const countryBuilders = new Map<string, CountryBuilder>()

  rows.forEach(row => {
    yearSet.add(row.year)

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
        key: `${builder.code}::${builder.entity}`,
        points,
        valueByYear: new Map(points.map(point => [point.year, point.value] as const))
      } satisfies InternetCountrySeries
    })
    .sort((a, b) => a.entity.localeCompare(b.entity))

  return {
    countries,
    years
  }
}

const parseMetadata = (raw: InternetMetadataRaw): InternetMetadata => {
  const firstColumn = raw.columns ? Object.values(raw.columns)[0] : undefined

  return {
    title: firstColumn?.titleShort ?? raw.chart?.title ?? 'Share of the population using the Internet',
    unit: firstColumn?.unit ?? '% of population',
    timespan: firstColumn?.timespan ?? 'N/A',
    lastUpdated: firstColumn?.lastUpdated ?? 'N/A',
    citation: firstColumn?.citationShort ?? raw.chart?.citation ?? 'N/A'
  }
}

export function useInternetData(): InternetDataResult {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [metadata, setMetadata] = useState<InternetMetadata | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const [csvResponse, metadataResponse] = await Promise.all([
          fetch(`${import.meta.env.BASE_URL}share-of-individuals-using-the-internet.csv`),
          fetch(`${import.meta.env.BASE_URL}share-of-individuals-using-the-internet.metadata.json`)
        ])

        if (!csvResponse.ok) {
          throw new Error(`Failed to load internet-use CSV (${csvResponse.status})`)
        }
        if (!metadataResponse.ok) {
          throw new Error(`Failed to load internet-use metadata (${metadataResponse.status})`)
        }

        const [csvText, metadataText] = await Promise.all([csvResponse.text(), metadataResponse.text()])
        if (cancelled) return

        const parsedRows = d3
          .csvParse(csvText, raw => parseRow(raw as unknown as InternetCsvRow))
          .filter((row): row is ParsedRow => row !== null)

        const metadataRaw = JSON.parse(metadataText) as InternetMetadataRaw

        setRows(parsedRows)
        setMetadata(parseMetadata(metadataRaw))
        setError(null)
        setLoading(false)
      } catch (loadError) {
        if (cancelled) return
        setRows([])
        setMetadata(null)
        setError(loadError instanceof Error ? loadError.message : String(loadError))
        setLoading(false)
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [])

  const built = useMemo(() => buildCountries(rows), [rows])

  return {
    loading,
    error,
    countries: built.countries,
    years: built.years,
    valueDomain: DEFAULT_DOMAIN,
    metadata
  }
}
