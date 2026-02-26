import { useEffect, useMemo, useState } from 'react'
import * as d3 from 'd3'

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
const FALLBACK_SLUG = 'share-of-individuals-using-the-internet'
const DATASET_BY_JUICY_LEVEL = new Map<number, string>([
  [0, 'share-of-the-population-with-access-to-electricity'],
  [1, 'access-to-clean-fuels-and-technologies-for-cooking'],
  [2, 'share-electricity-renewables'],
  [3, 'share-of-population-urban'],
  [4, 'share-of-children-immunized-dtp3'],
  [5, 'share-of-adults-who-smoke'],
  [6, 'share-of-adults-defined-as-obese'],
  [7, 'share-of-individuals-using-the-internet']
])

const parseNumber = (value: string | undefined | null): number | null => {
  const parsed = Number((value ?? '').trim())
  if (!Number.isFinite(parsed)) return null
  return parsed
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

const parseMetadata = (raw: InternetMetadataRaw, valueColumn: string): InternetMetadata => {
  const firstColumn = raw.columns ? Object.values(raw.columns)[0] : undefined
  const columnMeta = raw.columns?.[valueColumn] ?? firstColumn

  return {
    title: raw.chart?.title ?? columnMeta?.titleShort ?? valueColumn ?? 'N/A',
    unit: columnMeta?.unit ?? '%',
    timespan: columnMeta?.timespan ?? 'N/A',
    lastUpdated: columnMeta?.lastUpdated ?? 'N/A',
    citation: columnMeta?.citationShort ?? raw.chart?.citation ?? 'N/A'
  }
}

export function useInternetData(juicyLevel: number): InternetDataResult {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [metadata, setMetadata] = useState<InternetMetadata | null>(null)

  useEffect(() => {
    let cancelled = false
    const slug = DATASET_BY_JUICY_LEVEL.get(juicyLevel) ?? FALLBACK_SLUG

    setLoading(true)
    setError(null)
    setRows([])
    setMetadata(null)

    const load = async () => {
      try {
        const [csvResponse, metadataResponse] = await Promise.all([
          fetch(`${import.meta.env.BASE_URL}${slug}.csv`),
          fetch(`${import.meta.env.BASE_URL}${slug}.metadata.json`)
        ])

        if (!csvResponse.ok) {
          throw new Error(`Failed to load CSV for ${slug} (${csvResponse.status})`)
        }
        if (!metadataResponse.ok) {
          throw new Error(`Failed to load metadata for ${slug} (${metadataResponse.status})`)
        }

        const [csvText, metadataText] = await Promise.all([csvResponse.text(), metadataResponse.text()])
        if (cancelled) return

        const parsed = d3.csvParse(csvText)
        const valueColumn = parsed.columns.find(column => column !== 'Entity' && column !== 'Code' && column !== 'Year')
        if (!valueColumn) {
          throw new Error(`Could not detect value column for ${slug}`)
        }

        const parsedRows = parsed
          .map(row => {
            const entity = (row.Entity ?? '').trim()
            const code = (row.Code ?? '').trim()
            const yearValue = parseNumber(row.Year)
            const metricValue = parseNumber(row[valueColumn])

            if (!entity || !code || code.startsWith('OWID')) return null
            if (yearValue === null || metricValue === null) return null

            const year = Math.trunc(yearValue)
            if (!Number.isFinite(year)) return null

            return {
              entity,
              code,
              year,
              value: metricValue
            } satisfies ParsedRow
          })
          .filter((row): row is ParsedRow => row !== null)

        const metadataRaw = JSON.parse(metadataText) as InternetMetadataRaw

        setRows(parsedRows)
        setMetadata(parseMetadata(metadataRaw, valueColumn))
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
  }, [juicyLevel])

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
