import { useCallback, useEffect, useMemo, useState } from 'react'
import * as d3 from 'd3'

const YEAR_START = 2000
const YEAR_END = 2023

interface PopulationCsvRow {
  Entity: string
  Code: string
  Year: string
  Total: string
  'Ages 65+': string
  'Ages 25-64': string
  'Under-25s': string
  'Under-15s': string
  'Under-5s': string
}

interface ParsedRow {
  entity: string
  code: string
  year: number
  total: number
  age65plus: number
  age25_64: number
  under25: number
  under15: number
  under5: number
}

export interface AgeValues {
  total: number
  under25: number
  under15: number
  under5: number
  age25_64: number
  age65plus: number
  age15_24: number
  age5_14: number
}

export interface CountryRecord {
  entity: string
  code: string
  year: number
  values: AgeValues
}

interface TopCountriesResult {
  top: CountryRecord[]
  otherValue: number
  worldTotal: number
}

export interface PopulationAgeDataResult {
  loading: boolean
  error: string | null
  years: number[]
  worldByYear: Map<number, AgeValues>
  countriesByYear: Map<number, CountryRecord[]>
  worldSum2000To2023: number
  getWorld: (year: number) => AgeValues
  getWorldTotal: (year: number) => number
  getCountry: (year: number, countryCodeOrName: string) => CountryRecord | null
  getCountriesForYear: (year: number) => CountryRecord[]
  getTopCountriesForYear: (year: number, limit?: number) => TopCountriesResult
}

const EMPTY_AGE_VALUES: AgeValues = {
  total: 0,
  under25: 0,
  under15: 0,
  under5: 0,
  age25_64: 0,
  age65plus: 0,
  age15_24: 0,
  age5_14: 0
}

const parseNumber = (value: string | undefined): number => {
  if (!value) return 0
  const parsed = Number(value.trim())
  return Number.isFinite(parsed) ? parsed : 0
}

const clampNonNegative = (value: number): number => (value > 0 ? value : 0)

const toAgeValues = (row: ParsedRow): AgeValues => {
  const under25 = clampNonNegative(row.under25)
  const under15 = clampNonNegative(row.under15)
  const under5 = clampNonNegative(row.under5)

  return {
    total: clampNonNegative(row.total),
    under25,
    under15,
    under5,
    age25_64: clampNonNegative(row.age25_64),
    age65plus: clampNonNegative(row.age65plus),
    age15_24: clampNonNegative(under25 - under15),
    age5_14: clampNonNegative(under15 - under5)
  }
}

const emptyResult = (): PopulationAgeDataResult => ({
  loading: true,
  error: null,
  years: [],
  worldByYear: new Map<number, AgeValues>(),
  countriesByYear: new Map<number, CountryRecord[]>(),
  worldSum2000To2023: 0,
  getWorld: () => EMPTY_AGE_VALUES,
  getWorldTotal: () => 0,
  getCountry: () => null,
  getCountriesForYear: () => [],
  getTopCountriesForYear: () => ({
    top: [],
    otherValue: 0,
    worldTotal: 0
  })
})

export function usePopulationAgeData(): PopulationAgeDataResult {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<ParsedRow[]>([])

  useEffect(() => {
    let cancelled = false
    const url = `${import.meta.env.BASE_URL}population-by-age-group-with-projections.csv`

    fetch(url)
      .then(response => {
        if (!response.ok) {
          throw new Error(`Failed to load population data (${response.status})`)
        }
        return response.text()
      })
      .then(csvText => {
        if (cancelled) return

        const parsed = d3
          .csvParse(csvText, (raw: PopulationCsvRow) => {
            const year = Number(raw.Year)
            if (!Number.isFinite(year)) return null
            const intYear = Math.trunc(year)
            if (intYear < YEAR_START || intYear > YEAR_END) return null

            return {
              entity: (raw.Entity || '').trim(),
              code: (raw.Code || '').trim(),
              year: intYear,
              total: parseNumber(raw.Total),
              age65plus: parseNumber(raw['Ages 65+']),
              age25_64: parseNumber(raw['Ages 25-64']),
              under25: parseNumber(raw['Under-25s']),
              under15: parseNumber(raw['Under-15s']),
              under5: parseNumber(raw['Under-5s'])
            } satisfies ParsedRow
          })
          .filter((row): row is ParsedRow => row !== null && row.entity.length > 0)

        setRows(parsed)
        setLoading(false)
        setError(null)
      })
      .catch(fetchError => {
        if (cancelled) return
        setRows([])
        setError(fetchError instanceof Error ? fetchError.message : String(fetchError))
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const worldByYear = useMemo(() => {
    const map = new Map<number, AgeValues>()
    rows.forEach(row => {
      if (row.entity === 'World') {
        map.set(row.year, toAgeValues(row))
      }
    })
    return map
  }, [rows])

  const countriesByYear = useMemo(() => {
    const map = new Map<number, CountryRecord[]>()

    rows.forEach(row => {
      if (!row.code || row.code.startsWith('OWID')) return

      const values = toAgeValues(row)
      if (!map.has(row.year)) {
        map.set(row.year, [])
      }

      map.get(row.year)?.push({
        entity: row.entity,
        code: row.code,
        year: row.year,
        values
      })
    })

    map.forEach((records, year) => {
      const sorted = [...records].sort((a, b) => {
        if (b.values.total !== a.values.total) return b.values.total - a.values.total
        return a.entity.localeCompare(b.entity)
      })
      map.set(year, sorted)
    })

    return map
  }, [rows])

  const countryLookupByYear = useMemo(() => {
    const map = new Map<number, Map<string, CountryRecord>>()

    countriesByYear.forEach((records, year) => {
      const yearMap = new Map<string, CountryRecord>()
      records.forEach(record => {
        yearMap.set(record.code.toLowerCase(), record)
        yearMap.set(record.entity.toLowerCase(), record)
      })
      map.set(year, yearMap)
    })

    return map
  }, [countriesByYear])

  const years = useMemo(() => {
    const found = new Set<number>()
    worldByYear.forEach((_value, year) => {
      found.add(year)
    })

    const ordered = Array.from(found).sort((a, b) => a - b)
    return ordered
  }, [worldByYear])

  const worldSum2000To2023 = useMemo(
    () => years.reduce((sum, year) => sum + (worldByYear.get(year)?.total ?? 0), 0),
    [worldByYear, years]
  )

  const getWorld = useCallback(
    (year: number): AgeValues => worldByYear.get(year) ?? EMPTY_AGE_VALUES,
    [worldByYear]
  )

  const getWorldTotal = useCallback(
    (year: number): number => worldByYear.get(year)?.total ?? 0,
    [worldByYear]
  )

  const getCountry = useCallback(
    (year: number, countryCodeOrName: string): CountryRecord | null => {
      const key = countryCodeOrName.trim().toLowerCase()
      if (!key) return null
      return countryLookupByYear.get(year)?.get(key) ?? null
    },
    [countryLookupByYear]
  )

  const getCountriesForYear = useCallback(
    (year: number): CountryRecord[] => countriesByYear.get(year) ?? [],
    [countriesByYear]
  )

  const getTopCountriesForYear = useCallback(
    (year: number, limit = 20): TopCountriesResult => {
      const countries = countriesByYear.get(year) ?? []
      const safeLimit = Math.max(1, Math.floor(limit))
      const top = countries.slice(0, safeLimit)

      const topSum = d3.sum(top, country => country.values.total)
      const worldTotal = getWorldTotal(year)
      const fallbackTotal = d3.sum(countries, country => country.values.total)
      const resolvedWorldTotal = worldTotal > 0 ? worldTotal : fallbackTotal
      const otherValue = clampNonNegative(resolvedWorldTotal - topSum)

      return {
        top,
        otherValue,
        worldTotal: resolvedWorldTotal
      }
    },
    [countriesByYear, getWorldTotal]
  )

  if (loading && rows.length === 0) {
    const base = emptyResult()
    base.loading = true
    base.error = error
    return base
  }

  return {
    loading,
    error,
    years,
    worldByYear,
    countriesByYear,
    worldSum2000To2023,
    getWorld,
    getWorldTotal,
    getCountry,
    getCountriesForYear,
    getTopCountriesForYear
  }
}

