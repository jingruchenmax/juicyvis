import { useState, useEffect } from 'react'
import ScatterPlot from './components/ScatterPlot'
import ScatterPlotJuicy from './components/ScatterPlotJuicy'
import Globe from './components/Globe'
import GlobeJuicy from './components/GlobeJuicy'
import BarChart from './components/BarChart'
import BarChartJuicy from './components/BarChartJuicy'
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

function App() {
  const [data, setData] = useState<DataRow[]>([])
  const [energyData, setEnergyData] = useState<EnergyData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let loadedScatter = false
    let loadedEnergy = false

    // Load AI training CSV file
    fetch(`${import.meta.env.BASE_URL}ai-training-computation-vs-parameters-by-researcher-affiliation.csv`)
      .then(res => res.text())
      .then(csv => {
        const lines = csv.trim().split('\n')
        const headers = lines[0].split(',').map(h => h.trim())
        
        const parsed: DataRow[] = lines.slice(1).map(line => {
          // Proper CSV parsing - handles quoted fields with commas
          const values: string[] = []
          let current = ''
          let inQuotes = false
          
          for (let i = 0; i < line.length; i++) {
            const char = line[i]
            if (char === '"') {
              inQuotes = !inQuotes
            } else if (char === ',' && !inQuotes) {
              values.push(current)
              current = ''
            } else {
              current += char
            }
          }
          values.push(current)
          
          const row: any = {}
          headers.forEach((header, i) => {
            let value = values[i] || ''
            // Remove quotes if present
            if (value.startsWith('"') && value.endsWith('"')) {
              value = value.slice(1, -1)
            }
            value = value.trim()
            
            if (header.includes('computation') || header.includes('parameters')) {
              row[header] = value === '' ? null : parseFloat(value)
            } else {
              row[header] = value
            }
          })
          return row as DataRow
        })
        
        // Filter out rows with missing computation or parameters
        const filtered = parsed.filter(
          d => d['Training computation (petaFLOP)'] !== null && 
               d['Number of parameters'] !== null &&
               d['Training computation (petaFLOP)'] > 0 &&
               d['Number of parameters'] > 0
        )
        
        setData(filtered)
        loadedScatter = true
        if (loadedScatter && loadedEnergy) {
          setLoading(false)
        }
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })

    // Load energy CSV file
    fetch(`${import.meta.env.BASE_URL}per-capita-energy-stacked.csv`)
      .then(res => res.text())
      .then(csv => {
        const lines = csv.trim().split('\n')
        const headers = lines[0].split(',').map(h => h.trim())
        
        const parsed: EnergyData[] = lines.slice(1).map(line => {
          const values = line.split(',').map(v => v.trim())
          
          const row: any = {}
          headers.forEach((header, i) => {
            const value = values[i] || ''
            
            if (header === 'Year') {
              row[header] = parseInt(value)
            } else if (['Coal', 'Oil', 'Gas', 'Nuclear', 'Hydropower', 'Wind', 'Solar', 'Other renewables'].includes(header)) {
              row[header] = value === '' ? 0 : parseFloat(value)
            } else {
              row[header] = value
            }
          })
          return row as EnergyData
        })
        
        setEnergyData(parsed)
        loadedEnergy = true
        if (loadedScatter && loadedEnergy) {
          setLoading(false)
        }
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  if (loading) return <div className="loading">Loading data...</div>
  if (error) return <div className="error">Error: {error}</div>

  // Check URL parameters to determine which chart to show
  const params = new URLSearchParams(window.location.search)
  const chart = params.get('chart') || '1'
  const juicy = params.get('juicy') === '1'

  // Chart 3: Energy Stacked Bar Chart
  if (chart === '3') {
    return (
      <div className="app">
        <h1>Per Capita Energy Consumption</h1>
        <p className="subtitle">Stacked by Energy Source {juicy && '(Juicy Mode)'}</p>
        {energyData.length > 0 ? (juicy ? <BarChartJuicy data={energyData} /> : <BarChart data={energyData} />) : <div className="loading">Loading energy data...</div>}
      </div>
    )
  }

  // Chart 2: 3D World Map
  if (chart === '2') {
    return (
      <div className="app">
        <h1>3D Interactive World Map</h1>
        <p className="subtitle">Explore countries by dragging to rotate {juicy && '(Juicy Mode)'}</p>
        {juicy ? <GlobeJuicy /> : <Globe />}
      </div>
    )
  }

  // Chart 1: AI Training Computation vs Parameters (default)
  return (
    <div className="app">
      <h1>AI Training Computation vs Parameters</h1>
      <p className="subtitle">by Researcher Affiliation {juicy && '(Juicy Mode)'}</p>
      {juicy ? <ScatterPlotJuicy data={data} /> : <ScatterPlot data={data} />}
    </div>
  )
}

export default App
