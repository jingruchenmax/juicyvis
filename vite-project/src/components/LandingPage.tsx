import './LandingPage.css'

interface ChartInfo {
  id: number
  title: string
  interaction: string
  description: string
}

const CHARTS: ChartInfo[] = [
  {
    id: 1,
    title: 'AI Training Computation vs Parameters',
    interaction: 'Select / Highlight',
    description: 'Scatter plot of AI models by researcher affiliation'
  },
  {
    id: 2,
    title: '3D Interactive World Map',
    interaction: 'Explore',
    description: 'Drag to rotate and explore countries on a globe'
  },
  {
    id: 3,
    title: 'Per Capita Energy Consumption',
    interaction: 'Reconfigure',
    description: 'Stacked bar chart by energy source'
  },
  {
    id: 4,
    title: 'Per Capita Meat Consumption',
    interaction: 'Encode',
    description: 'Breakdown by meat type over time'
  },
  {
    id: 5,
    title: 'Population by Age Group',
    interaction: 'Abstract / Elaborate',
    description: 'Historical and projected population data'
  },
  {
    id: 6,
    title: 'Income Inequality: Gini Coefficient',
    interaction: 'Filter',
    description: 'Filter countries by Gini index over time'
  },
  {
    id: 7,
    title: 'Global Development Indicators',
    interaction: 'Connect',
    description: 'Connect related indicators across countries'
  }
]

function navigate(chart: number, juicy: boolean) {
  const nextUrl = new URL(window.location.href)
  nextUrl.searchParams.set('chart', String(chart))
  nextUrl.searchParams.set('juicy', juicy ? '1' : '0')
  window.location.href = nextUrl.toString()
}

function LandingPage() {
  return (
    <div className="landing">
      <div className="landing-header">
        <h1>JuicyVis</h1>
        <p>Choose a chart and a mode to explore</p>
      </div>

      <div className="landing-grid">
        {CHARTS.map(chart => (
          <div className="chart-group" key={chart.id}>
            {/* Normal version */}
            <button
              className="chart-card"
              onClick={() => navigate(chart.id, false)}
              title={`Chart ${chart.id} — ${chart.interaction} (Normal)`}
            >
              <span className="card-number">Chart {chart.id}</span>
              <span className="card-title">{chart.title}</span>
              <span className="card-subtitle">{chart.description}</span>
              <span className="card-badge normal">
                <span className="card-badge-dot" />
                {chart.interaction}
              </span>
            </button>

            {/* Juicy version */}
            <button
              className="chart-card"
              onClick={() => navigate(chart.id, true)}
              title={`Chart ${chart.id} — ${chart.interaction} (Juicy)`}
            >
              <span className="card-number">Chart {chart.id} · Juicy</span>
              <span className="card-title">{chart.title}</span>
              <span className="card-subtitle">{chart.description}</span>
              <span className="card-badge juicy">
                <span className="card-badge-dot" />
                {chart.interaction} ✦ Juicy
              </span>
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export default LandingPage
