import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import './Encode.css'

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

interface MeatType {
  name: keyof Omit<MeatData, 'Entity' | 'Code' | 'Year'>
  label: string
  color: string
}

const meatTypes: MeatType[] = [
  { name: 'Poultry', label: 'Poultry', color: '#FFB6C1' },
  { name: 'Beef and buffalo', label: 'Beef & Buffalo', color: '#8B4513' },
  { name: 'Sheep and goat', label: 'Sheep & Goat', color: '#D3A574' },
  { name: 'Pork', label: 'Pork', color: '#FF69B4' },
  { name: 'Other meats', label: 'Other Meats', color: '#DEB887' },
  { name: 'Fish and seafood', label: 'Fish & Seafood', color: '#4682B4' }
]

interface Tooltip {
  x: number
  y: number
  content: string
}

interface SortConfig {
  type: 'total' | MeatType['name']
  direction: 'asc' | 'desc'
}

export default function Encode({ data }: { data: MeatData[] }) {
  const chartRef = useRef<SVGSVGElement | null>(null)
  const [sortConfig, setSortConfig] = useState<SortConfig>({ type: 'total', direction: 'desc' })
  const [tooltip, setTooltip] = useState<Tooltip | null>(null)

  // Filter to latest year with data and major countries
  const latestYear = Math.max(...data.map(d => d.Year))
  const filteredData = data.filter(d => d.Year === latestYear)
  
  const majorCountries = [
    'China', 'United States', 'Brazil', 'European Union', 'India', 'Argentina',
    'Australia', 'Japan', 'France', 'Germany', 'Italy', 'Spain', 'Mexico',
    'Indonesia', 'Russia', 'Thailand', 'Poland', 'Canada', 'Netherlands', 'Vietnam'
  ]
  
  const chartData = filteredData
    .filter(d => majorCountries.includes(d.Entity))
    .map(d => ({
      ...d,
      total: meatTypes.reduce((sum, type) => sum + (d[type.name] || 0), 0)
    }))

  const sortData = (dataToSort: typeof chartData) => {
    const sorted = [...dataToSort]
    
    if (sortConfig.type === 'total') {
      sorted.sort((a, b) => a.total - b.total)
    } else {
      sorted.sort((a, b) => (a[sortConfig.type] || 0) - (b[sortConfig.type] || 0))
    }
    
    if (sortConfig.direction === 'desc') {
      sorted.reverse()
    }
    
    return sorted
  }

  const handleSortChange = (type: SortConfig['type'], direction?: 'asc' | 'desc') => {
    setSortConfig(prev => ({
      type,
      direction: direction || (prev.type === type && prev.direction === 'desc' ? 'asc' : 'desc')
    }))
  }

  useEffect(() => {
    if (!chartRef.current || chartData.length === 0) return

    const margin = { top: 20, right: 20, bottom: 20, left: 180 }
    const width = 1000 - margin.left - margin.right
    const height = Math.max(400, chartData.length * 35) - margin.top - margin.bottom
    const svgWidth = 1000
    const svgHeight = height + margin.top + margin.bottom

    // Clear previous content
    const svg = d3.select(chartRef.current)
    svg.selectAll('*').remove()

    // Create main group
    const g = svg
      .attr('width', svgWidth)
      .attr('height', svgHeight)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    // Sort data based on current config
    const sortedData = sortData(chartData)

    // Create scales
    const xScale = d3.scaleLinear()
      .domain([0, d3.max(sortedData, d => d.total) || 0])
      .range([0, width])

    const yScale = d3.scaleBand()
      .domain(sortedData.map(d => d.Entity))
      .range([0, height])
      .padding(0.2)

    const colorScale = d3.scaleOrdinal<string>()
      .domain(meatTypes.map(t => t.name))
      .range(meatTypes.map(t => t.color))

    // Stack data
    const stackData = d3.stack<any>()
      .keys(meatTypes.map(t => t.name))
      .value((d, key) => d[key] || 0)(sortedData)

    // Draw bars
    const groups = g.selectAll('.meat-group')
      .data(stackData, (d: any) => d.key)
      .join('g')
      .attr('class', 'meat-group')
      .attr('fill', (d: any) => colorScale(d.key))

    groups.selectAll('rect')
      .data((d: any) => d, (_d: any, i: number) => i)
      .join('rect')
      .attr('x', (d: any) => xScale(d[0]))
      .attr('y', (_d: any, i: number) => yScale(sortedData[i].Entity) || 0)
      .attr('width', (d: any) => xScale(d[1]) - xScale(d[0]))
      .attr('height', yScale.bandwidth())
      .attr('class', 'meat-bar')
      .on('mouseover', (event: MouseEvent, _d: any) => {
        setTooltip({
          x: (event as any).pageX,
          y: (event as any).pageY,
          content: `Meat Consumption`
        })
      })
      .on('mouseout', () => setTooltip(null))

    // Add country labels
    g.selectAll('.country-label')
      .data(sortedData)
      .join('text')
      .attr('class', 'country-label')
      .attr('x', -10)
      .attr('y', d => (yScale(d.Entity) || 0) + yScale.bandwidth() / 2)
      .attr('text-anchor', 'end')
      .attr('dominant-baseline', 'middle')
      .text(d => d.Entity)

    // Add axes
    const xAxis = d3.axisBottom(xScale).ticks(6)
    const yAxis = d3.axisLeft(yScale)

    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(xAxis)
      .append('text')
      .attr('x', width / 2)
      .attr('y', 40)
      .attr('text-anchor', 'middle')
      .attr('fill', '#333')
      .text('kg per capita per year')

    g.append('g')
      .call(yAxis)

    // Add legend
    const legend = svg.append('g')
      .attr('class', 'legend')
      .attr('transform', `translate(${margin.left + width + 20}, ${margin.top})`)

    legend.selectAll('.legend-item')
      .data(meatTypes)
      .join('g')
      .attr('class', 'legend-item')
      .attr('transform', (_d, i) => `translate(0, ${i * 20})`)
      .each(function(d) {
        d3.select(this).append('rect')
          .attr('width', 12)
          .attr('height', 12)
          .attr('fill', colorScale(d.name))
        
        d3.select(this).append('text')
          .attr('x', 18)
          .attr('y', 10)
          .attr('font-size', '12px')
          .text(d.label)
      })
  }, [sortConfig, chartData])

  return (
    <div className="meat-chart-container">
      <div className="meat-controls">
        <div className="sort-controls">
          <div className="sort-button-group">
            <button
              className={`sort-btn ${sortConfig.type === 'total' ? 'active' : ''}`}
              onClick={() => handleSortChange('total')}
            >
              Total Meat
            </button>
            {meatTypes.map(type => (
              <button
                key={type.name}
                className={`sort-btn ${sortConfig.type === type.name ? 'active' : ''}`}
                onClick={() => handleSortChange(type.name)}
              >
                {type.label}
              </button>
            ))}
          </div>
          
          <div className="direction-controls">
            <label>
              <input
                type="radio"
                name="direction"
                value="asc"
                checked={sortConfig.direction === 'asc'}
                onChange={() => handleSortChange(sortConfig.type, 'asc')}
              />
              Ascending
            </label>
            <label>
              <input
                type="radio"
                name="direction"
                value="desc"
                checked={sortConfig.direction === 'desc'}
                onChange={() => handleSortChange(sortConfig.type, 'desc')}
              />
              Descending
            </label>
          </div>
        </div>
      </div>

      <svg ref={chartRef} className="meat-svg"></svg>

      {tooltip && (
        <div
          className="meat-tooltip"
          style={{
            position: 'absolute',
            left: `${tooltip.x + 10}px`,
            top: `${tooltip.y + 10}px`,
            backgroundColor: '#333',
            color: '#fff',
            padding: '8px 12px',
            borderRadius: '4px',
            fontSize: '12px',
            pointerEvents: 'none',
            whiteSpace: 'nowrap'
          }}
        >
          {tooltip.content}
        </div>
      )}
    </div>
  )
}
