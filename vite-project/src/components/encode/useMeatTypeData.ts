import { useEffect, useState } from 'react'
import * as d3 from 'd3'

export type MeatCategoryKey =
  | 'Poultry'
  | 'Beef and buffalo'
  | 'Sheep and goat'
  | 'Pork'
  | 'Other meats'
  | 'Fish and seafood'

export interface MeatCsvRow {
  Entity: string
  Code: string
  Year: number
  Poultry: number
  'Beef and buffalo': number
  'Sheep and goat': number
  Pork: number
  'Other meats': number
  'Fish and seafood': number
}

export interface MeatCategoryDef {
  key: MeatCategoryKey
  label: string
  color: string
}

export interface MeatCountryDatum {
  country: string
  code: string
  year: number
  kg: Record<MeatCategoryKey, number>
  percent: Record<MeatCategoryKey, number>
  totalKg: number
}

export interface MeatDataset {
  year: number
  categories: MeatCategoryDef[]
  countries: MeatCountryDatum[]
  maxTotalKg: number
  maxCategoryKg: number
}

export const MEAT_CATEGORIES: MeatCategoryDef[] = [
  { key: 'Poultry', label: 'Poultry', color: '#c83a4a' },
  { key: 'Beef and buffalo', label: 'Beef & Buffalo', color: '#b8781f' },
  { key: 'Sheep and goat', label: 'Sheep & Goat', color: '#5b9d1c' },
  { key: 'Pork', label: 'Pork', color: '#1497a8' },
  { key: 'Other meats', label: 'Other Meats', color: '#2f63d1' },
  { key: 'Fish and seafood', label: 'Fish & Seafood', color: '#6a2ea7' }
]

const TARGET_COUNTRIES = [
  'Spain',
  'United States',
  'Australia',
  'Argentina',
  'France',
  'China',
  'Canada',
  'Brazil',
  'Japan',
  'Russia',
  'Italy',
  'Poland',
  'Vietnam',
  'Mexico',
  'Germany',
  'Netherlands',
  'Indonesia',
  'Thailand',
  'India'
]

const COUNTRY_COUNT = 9

const parseNumber = (value: string | number | undefined): number => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }
  const parsed = Number(value ?? '')
  return Number.isFinite(parsed) ? parsed : 0
}

const parseRow = (row: d3.DSVRowString<string>): MeatCsvRow | null => {
  const entity = (row.Entity ?? '').trim()
  const code = (row.Code ?? '').trim()
  const year = Number(row.Year)

  if (!entity || Number.isNaN(year)) {
    return null
  }

  return {
    Entity: entity,
    Code: code,
    Year: year,
    Poultry: parseNumber(row.Poultry),
    'Beef and buffalo': parseNumber(row['Beef and buffalo']),
    'Sheep and goat': parseNumber(row['Sheep and goat']),
    Pork: parseNumber(row.Pork),
    'Other meats': parseNumber(row['Other meats']),
    'Fish and seafood': parseNumber(row['Fish and seafood'])
  }
}

const buildDataset = (rows: MeatCsvRow[]): MeatDataset | null => {
  if (!rows.length) return null

  const latestYear = d3.max(rows, d => d.Year) ?? 2022
  const rowsOfYear = rows.filter(d => d.Year === latestYear)

  const preferred = rowsOfYear.filter(d => TARGET_COUNTRIES.includes(d.Entity))
  const candidates = preferred.length >= COUNTRY_COUNT ? preferred : rowsOfYear

  const sorted = [...candidates]
    .map(row => {
      const total = d3.sum(MEAT_CATEGORIES, category => parseNumber(row[category.key]))
      return { row, total }
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, COUNTRY_COUNT)

  const countries: MeatCountryDatum[] = sorted.map(({ row }) => {
    const kg = MEAT_CATEGORIES.reduce<Record<MeatCategoryKey, number>>((acc, category) => {
      acc[category.key] = parseNumber(row[category.key])
      return acc
    }, {} as Record<MeatCategoryKey, number>)

    const totalKg = d3.sum(MEAT_CATEGORIES, category => kg[category.key])
    const percent = MEAT_CATEGORIES.reduce<Record<MeatCategoryKey, number>>((acc, category) => {
      const raw = totalKg > 0 ? (kg[category.key] / totalKg) * 100 : 0
      acc[category.key] = Number.isFinite(raw) ? raw : 0
      return acc
    }, {} as Record<MeatCategoryKey, number>)

    return {
      country: row.Entity,
      code: row.Code,
      year: row.Year,
      kg,
      percent,
      totalKg
    }
  })

  const maxTotalKg = d3.max(countries, d => d.totalKg) ?? 1
  const maxCategoryKg =
    d3.max(
      countries.flatMap(country => MEAT_CATEGORIES.map(category => country.kg[category.key]))
    ) ?? 1

  return {
    year: latestYear,
    categories: MEAT_CATEGORIES,
    countries,
    maxTotalKg,
    maxCategoryKg
  }
}

const normalizeSeedRows = (seedData: MeatCsvRow[]): MeatCsvRow[] => {
  return seedData.map(row => ({
    Entity: row.Entity,
    Code: row.Code,
    Year: Number(row.Year),
    Poultry: parseNumber(row.Poultry),
    'Beef and buffalo': parseNumber(row['Beef and buffalo']),
    'Sheep and goat': parseNumber(row['Sheep and goat']),
    Pork: parseNumber(row.Pork),
    'Other meats': parseNumber(row['Other meats']),
    'Fish and seafood': parseNumber(row['Fish and seafood'])
  }))
}

export const useMeatTypeData = (seedData?: MeatCsvRow[]) => {
  const [dataset, setDataset] = useState<MeatDataset | null>(() => {
    if (!seedData || seedData.length === 0) return null
    return buildDataset(normalizeSeedRows(seedData))
  })
  const [loading, setLoading] = useState(!dataset)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let disposed = false

    const load = async () => {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}per-capita-meat-type.csv`)
        if (!response.ok) {
          throw new Error(`Failed to load meat CSV: ${response.status}`)
        }

        const text = await response.text()
        const rows = d3
          .csvParse(text, raw => parseRow(raw))
          .filter((d): d is MeatCsvRow => d !== null)

        const built = buildDataset(rows)
        if (!disposed) {
          if (built) {
            setDataset(built)
            setError(null)
          } else {
            setError('No usable rows were found in per-capita-meat-type.csv.')
          }
          setLoading(false)
        }
      } catch (err) {
        if (disposed) return

        if (seedData && seedData.length > 0) {
          const fallback = buildDataset(normalizeSeedRows(seedData))
          if (fallback) {
            setDataset(fallback)
            setError(null)
            setLoading(false)
            return
          }
        }

        const message = err instanceof Error ? err.message : 'Unknown data loading error.'
        setError(message)
        setLoading(false)
      }
    }

    void load()

    return () => {
      disposed = true
    }
  }, [seedData])

  return { dataset, loading, error }
}
