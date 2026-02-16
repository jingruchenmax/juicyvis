import { useState, useEffect } from 'react'
import ScatterPlot from './components/ScatterPlot'
import ScatterPlotJuicy from './components/ScatterPlotJuicy'
import Globe from './components/Globe'
import GlobeJuicy from './components/GlobeJuicy'
import './App.css'

interface DataRow {
  Entity: string
  Day: string
  'Training computation (petaFLOP)': number | null
  'Number of parameters': number | null
  'Researcher affiliation': string
}

function App() {
  const [data, setData] = useState<DataRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Load CSV file
    fetch('/ai-training-computation-vs-parameters-by-researcher-affiliation.csv')
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
        setLoading(false)
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
