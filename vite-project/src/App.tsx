import { useEffect, useState } from 'react'
import type { DSVRowString } from 'd3'
import Select from './components/Select'
import SelectJuicy from './components/SelectJuicy'
import Explore from './components/Explore'
import ExploreJuicy from './components/ExploreJuicy'
import Reconfigure from './components/Reconfigure'
import ReconfigureJuicy from './components/ReconfigureJuicy'
import Encode from './components/Encode'
import EncodeJuicy from './components/EncodeJuicy'
import Abstract from './components/Abstract'
import AbstractJuicy from './components/AbstractJuicy'
import Filter from './components/Filter'
import FilterJuicy from './components/FilterJuicy'
import Connect from './components/Connect'
import ConnectJuicy from './components/ConnectJuicy'
import Integrated from './components/Integrated'
import IntegratedIntensity from './components/IntegratedIntensity'
import { parseCsv, toNumber } from './utils/csv'
import './App.css'

interface DataRow {
  Entity: string
  Day: string
  'Training computation (petaFLOP)': number | null
  'Number of parameters': number | null
  'Researcher affiliation': string
}

interface EnergyData {
  Entity: string
  Code: string
  Year: number
  Coal: number
  Oil: number
  Gas: number
  Nuclear: number
  Hydropower: number
  Wind: number
  Solar: number
  'Other renewables': number
}

interface MeatData {
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

type CsvRow = DSVRowString<string>

const CHARTS_REQUIRING_APP_DATA = new Set(['1', '2', '3', '4'])

const ENERGY_VALUE_COLUMNS = [
  'Coal',
  'Oil',
  'Gas',
  'Nuclear',
  'Hydropower',
  'Wind',
  'Solar',
  'Other renewables'
] as const

const MEAT_VALUE_COLUMNS = [
  'Poultry',
  'Beef and buffalo',
  'Sheep and goat',
  'Pork',
  'Other meats',
  'Fish and seafood'
] as const

const readCell = (row: CsvRow, column: string): string => (row[column] ?? '').trim()

const parseAiData = (csvText: string): DataRow[] => {
  const parsed = parseCsv(csvText).map((row): DataRow => ({
    Entity: readCell(row, 'Entity'),
    Day: readCell(row, 'Day'),
    'Training computation (petaFLOP)': toNumber(readCell(row, 'Training computation (petaFLOP)')),
    'Number of parameters': toNumber(readCell(row, 'Number of parameters')),
    'Researcher affiliation': readCell(row, 'Researcher affiliation')
  }))

  return parsed.filter(
    d =>
      d['Training computation (petaFLOP)'] !== null &&
      d['Number of parameters'] !== null &&
      d['Training computation (petaFLOP)'] > 0 &&
      d['Number of parameters'] > 0
  )
}

const parseEnergyData = (csvText: string): EnergyData[] => {
  return parseCsv(csvText).map((row): EnergyData => {
    const parsedRow: EnergyData = {
      Entity: readCell(row, 'Entity'),
      Code: readCell(row, 'Code'),
      Year: Number.parseInt(readCell(row, 'Year'), 10),
      Coal: 0,
      Oil: 0,
      Gas: 0,
      Nuclear: 0,
      Hydropower: 0,
      Wind: 0,
      Solar: 0,
      'Other renewables': 0
    }

    ENERGY_VALUE_COLUMNS.forEach(column => {
      parsedRow[column] = toNumber(readCell(row, column)) ?? 0
    })

    return parsedRow
  })
}

const parseMeatData = (csvText: string): MeatData[] => {
  return parseCsv(csvText).map((row): MeatData => {
    const parsedRow: MeatData = {
      Entity: readCell(row, 'Entity'),
      Code: readCell(row, 'Code'),
      Year: Number.parseInt(readCell(row, 'Year'), 10),
      Poultry: 0,
      'Beef and buffalo': 0,
      'Sheep and goat': 0,
      Pork: 0,
      'Other meats': 0,
      'Fish and seafood': 0
    }

    MEAT_VALUE_COLUMNS.forEach(column => {
      parsedRow[column] = toNumber(readCell(row, column)) ?? 0
    })

    return parsedRow
  })
}

const clampInt = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, Math.trunc(value)))
}

function App() {
  const [data, setData] = useState<DataRow[]>([])
  const [energyData, setEnergyData] = useState<EnergyData[]>([])
  const [meatData, setMeatData] = useState<MeatData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const params = new URLSearchParams(window.location.search)
  const juicyRaw = params.get('juicy') ?? '0'
  const chart = params.get('chart') || '1'

  if (chart === '8') {
    const juicyLevel = clampInt(Number.parseInt(juicyRaw, 10), 0, 7)
    return (
      <div className="app">
        <Integrated juicyLevel={juicyLevel} />
      </div>
    )
  }

  if (chart === '9') {
    const intensityLevel = clampInt(Number.parseInt(juicyRaw, 10), 0, 3)
    return (
      <div className="app">
        <IntegratedIntensity intensityLevel={intensityLevel} />
      </div>
    )
  }

  const juicy = juicyRaw === '1'

  useEffect(() => {
    let cancelled = false

    if (!CHARTS_REQUIRING_APP_DATA.has(chart)) {
      setLoading(false)
      setError(null)
      return () => {
        cancelled = true
      }
    }

    const loadCsv = async (fileName: string): Promise<string> => {
      const response = await fetch(`${import.meta.env.BASE_URL}${fileName}`)
      if (!response.ok) {
        throw new Error(`Failed to load ${fileName} (${response.status})`)
      }
      return response.text()
    }

    setLoading(true)
    setError(null)

    Promise.all([
      loadCsv('ai-training-computation-vs-parameters-by-researcher-affiliation.csv').then(parseAiData),
      loadCsv('per-capita-energy-stacked.csv').then(parseEnergyData),
      loadCsv('per-capita-meat-type.csv').then(parseMeatData)
    ])
      .then(([scatterRows, energyRows, meatRows]) => {
        if (cancelled) return
        setData(scatterRows)
        setEnergyData(energyRows)
        setMeatData(meatRows)
        setLoading(false)
      })
      .catch(loadError => {
        if (cancelled) return
        setError(loadError instanceof Error ? loadError.message : String(loadError))
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [chart])

  if (chart === '6') {
    return (
      <div className="app">
        <h1>Income inequality: Gini coefficient</h1>
        <p className="subtitle">Filter</p>
        {juicy ? <FilterJuicy /> : <Filter />}
      </div>
    )
  }

  if (chart === '7') {
    return <div className="app">{juicy ? <ConnectJuicy /> : <Connect />}</div>
  }

  if (chart === '5') {
    return (
      <div className="app">
        <h1>Population</h1>
        <p className="subtitle">Abstract/Elaborate</p>
        {juicy ? <AbstractJuicy /> : <Abstract />}
      </div>
    )
  }

  if (loading) return <div className="loading">Loading data...</div>
  if (error) return <div className="error">Error: {error}</div>

  // Chart 4: Meat Consumption
  if (chart === '4') {
    return (
      <div className="app">
        <h1>Per Capita Meat Consumption</h1>
        <p className="subtitle">By Meat Type</p>
        {meatData.length > 0 ? (juicy ? <EncodeJuicy data={meatData} /> : <Encode data={meatData} />) : <div className="loading">Loading meat data...</div>}
      </div>
    )
  }

  // Chart 3: Energy Stacked Bar Chart
  if (chart === '3') {
    return (
      <div className="app">
        <h1>Per Capita Energy Consumption</h1>
        <p className="subtitle">Stacked by Energy Source {juicy && '(Juicy Mode)'}</p>
        {energyData.length > 0 ? (juicy ? <ReconfigureJuicy data={energyData} /> : <Reconfigure data={energyData} />) : <div className="loading">Loading energy data...</div>}
      </div>
    )
  }

  // Chart 2: 3D World Map
  if (chart === '2') {
    return (
      <div className="app">
        <h1>3D Interactive World Map</h1>
        <p className="subtitle">Explore countries by dragging to rotate {juicy && '(Juicy Mode)'}</p>
        {juicy ? <ExploreJuicy /> : <Explore />}
      </div>
    )
  }

  // Chart 1: AI Training Computation vs Parameters (default)
  return (
    <div className="app">
      <h1>AI Training Computation vs Parameters</h1>
      <p className="subtitle">by Researcher Affiliation {juicy && '(Juicy Mode)'}</p>
      {juicy ? <SelectJuicy data={data} /> : <Select data={data} />}
    </div>
  )
}

export default App
