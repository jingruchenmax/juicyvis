import { useEffect, useMemo, useState } from 'react'
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

export interface MeatCountryTimeSeriesValue {
  year: number
  totalKg: number
}

export interface MeatCountryTimeSeries {
  country: string
  code: string
  values: MeatCountryTimeSeriesValue[]
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

interface SelectedCountry {
  country: string
  code: string
}

interface MeatDataBundle {
  dataset: MeatDataset | null
  years: number[]
  datasetsByYear: Map<number, MeatDataset>
  timeSeries: MeatCountryTimeSeries[]
  latestYear: number | null
}

const buildCountrySelection = (rows: MeatCsvRow[], latestYear: number): SelectedCountry[] => {
  const rowsOfYear = rows.filter(row => row.Year === latestYear)
  const preferred = rowsOfYear.filter(row => TARGET_COUNTRIES.includes(row.Entity))
  const candidates = preferred.length >= COUNTRY_COUNT ? preferred : rowsOfYear

  return [...candidates]
    .map(row => {
      const total = d3.sum(MEAT_CATEGORIES, category => parseNumber(row[category.key]))
      return { row, total }
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, COUNTRY_COUNT)
    .map(({ row }) => ({
      country: row.Entity,
      code: row.Code
    }))
}

const makeYearCountryKey = (year: number, country: string): string => `${year}::${country}`

const emptyKgRecord = (): Record<MeatCategoryKey, number> => {
  return MEAT_CATEGORIES.reduce<Record<MeatCategoryKey, number>>((acc, category) => {
    acc[category.key] = 0
    return acc
  }, {} as Record<MeatCategoryKey, number>)
}

const buildDatasetForYear = (
  year: number,
  selectedCountries: SelectedCountry[],
  rowsByYearCountry: Map<string, MeatCsvRow>
): MeatDataset => {
  const countries: MeatCountryDatum[] = selectedCountries.map(countryMeta => {
    const row = rowsByYearCountry.get(makeYearCountryKey(year, countryMeta.country))
    const kg = row
      ? MEAT_CATEGORIES.reduce<Record<MeatCategoryKey, number>>((acc, category) => {
          acc[category.key] = parseNumber(row[category.key])
          return acc
        }, {} as Record<MeatCategoryKey, number>)
      : emptyKgRecord()

    const totalKg = d3.sum(MEAT_CATEGORIES, category => kg[category.key])
    const percent = MEAT_CATEGORIES.reduce<Record<MeatCategoryKey, number>>((acc, category) => {
      const raw = totalKg > 0 ? (kg[category.key] / totalKg) * 100 : 0
      acc[category.key] = Number.isFinite(raw) ? raw : 0
      return acc
    }, {} as Record<MeatCategoryKey, number>)

    return {
      country: countryMeta.country,
      code: row?.Code ?? countryMeta.code,
      year,
      kg,
      percent,
      totalKg
    }
  })

  const maxTotalKg = d3.max(countries, datum => datum.totalKg) ?? 1
  const maxCategoryKg =
    d3.max(countries.flatMap(country => MEAT_CATEGORIES.map(category => country.kg[category.key]))) ?? 1

  return {
    year,
    categories: MEAT_CATEGORIES,
    countries,
    maxTotalKg: maxTotalKg > 0 ? maxTotalKg : 1,
    maxCategoryKg: maxCategoryKg > 0 ? maxCategoryKg : 1
  }
}

const buildDataBundle = (rows: MeatCsvRow[]): MeatDataBundle => {
  if (!rows.length) {
    return {
      dataset: null,
      years: [],
      datasetsByYear: new Map<number, MeatDataset>(),
      timeSeries: [],
      latestYear: null
    }
  }

  const latestYear = d3.max(rows, row => row.Year) ?? null
  if (latestYear === null) {
    return {
      dataset: null,
      years: [],
      datasetsByYear: new Map<number, MeatDataset>(),
      timeSeries: [],
      latestYear: null
    }
  }

  const selectedCountries = buildCountrySelection(rows, latestYear)
  const allYears = Array.from(new Set(rows.map(row => row.Year))).sort((a, b) => a - b)
  const boundedYears = allYears.filter(year => year >= 1994 && year <= 2022)
  const years = boundedYears.length > 0 ? boundedYears : allYears

  const rowsByYearCountry = new Map<string, MeatCsvRow>()
  rows.forEach(row => {
    rowsByYearCountry.set(makeYearCountryKey(row.Year, row.Entity), row)
  })

  const datasetsByYear = new Map<number, MeatDataset>()
  years.forEach(year => {
    datasetsByYear.set(year, buildDatasetForYear(year, selectedCountries, rowsByYearCountry))
  })

  if (!datasetsByYear.has(latestYear)) {
    datasetsByYear.set(
      latestYear,
      buildDatasetForYear(latestYear, selectedCountries, rowsByYearCountry)
    )
  }

  const dataset = datasetsByYear.get(latestYear) ?? null
  const totalsByYearCountry = new Map<string, number>()
  datasetsByYear.forEach((yearDataset, year) => {
    yearDataset.countries.forEach(country => {
      totalsByYearCountry.set(makeYearCountryKey(year, country.country), country.totalKg)
    })
  })

  const timeSeries: MeatCountryTimeSeries[] = selectedCountries.map(country => ({
    country: country.country,
    code: country.code,
    values: years.map(year => ({
      year,
      totalKg: totalsByYearCountry.get(makeYearCountryKey(year, country.country)) ?? 0
    }))
  }))

  return {
    dataset,
    years,
    datasetsByYear,
    timeSeries,
    latestYear
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
  const initialData = useMemo(() => {
    if (!seedData || seedData.length === 0) {
      return buildDataBundle([])
    }
    return buildDataBundle(normalizeSeedRows(seedData))
  }, [seedData])

  const [dataset, setDataset] = useState<MeatDataset | null>(initialData.dataset)
  const [years, setYears] = useState<number[]>(initialData.years)
  const [datasetsByYear, setDatasetsByYear] = useState<Map<number, MeatDataset>>(initialData.datasetsByYear)
  const [timeSeries, setTimeSeries] = useState<MeatCountryTimeSeries[]>(initialData.timeSeries)
  const [latestYear, setLatestYear] = useState<number | null>(initialData.latestYear)
  const [loading, setLoading] = useState(!initialData.dataset)
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

        const built = buildDataBundle(rows)
        if (!disposed) {
          if (built.dataset) {
            setDataset(built.dataset)
            setYears(built.years)
            setDatasetsByYear(built.datasetsByYear)
            setTimeSeries(built.timeSeries)
            setLatestYear(built.latestYear)
            setError(null)
          } else {
            setError('No usable rows were found in per-capita-meat-type.csv.')
          }
          setLoading(false)
        }
      } catch (err) {
        if (disposed) return

        if (seedData && seedData.length > 0) {
          const fallback = buildDataBundle(normalizeSeedRows(seedData))
          if (fallback.dataset) {
            setDataset(fallback.dataset)
            setYears(fallback.years)
            setDatasetsByYear(fallback.datasetsByYear)
            setTimeSeries(fallback.timeSeries)
            setLatestYear(fallback.latestYear)
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

  return { dataset, years, datasetsByYear, timeSeries, latestYear, loading, error }
}
