import { useState, useEffect, useRef } from 'react'
import * as d3 from 'd3'
import './Reconfigure.css'

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

const ENERGY_SOURCES = ['Coal', 'Oil', 'Gas', 'Nuclear', 'Hydropower', 'Wind', 'Solar', 'Other renewables'] as const
type EnergySource = typeof ENERGY_SOURCES[number]

const COLORS: Record<EnergySource, string> = {
  'Coal': '#404040',
  'Oil': '#8B7355',
  'Gas': '#FFB366',
  'Nuclear': '#FFD700',
  'Hydropower': '#4169E1',
  'Wind': '#87CEEB',
  'Solar': '#FF8C00',
  'Other renewables': '#90EE90',
}

const SVG_WIDTH = 1400
const SVG_HEIGHT = 600
const MARGIN = { top: 80, right: 200, bottom: 80, left: 60 }

interface ReconfigureProps {
  data: EnergyData[]
}

interface SortConfig {
  type: 'total' | EnergySource
  direction: 'asc' | 'desc'
}

interface TooltipData {
  x: number
  y: number
  entity: string
  source: EnergySource
  value: number
}

function Reconfigure({ data }: ReconfigureProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [sortConfig, setSortConfig] = useState<SortConfig>({ type: 'total', direction: 'desc' })
  const [tooltip, setTooltip] = useState<TooltipData | null>(null)
  const [highlightedSource, setHighlightedSource] = useState<SortConfig['type']>('total')
  const [sliderPosition, setSliderPosition] = useState<'left' | 'middle' | 'right'>('middle')

  // Get latest year data for the top countries
  const getLatestYearData = () => {
    const latestYear = Math.max(...data.map(d => d.Year))
    const latestData = data.filter(d => d.Year === latestYear)
    
    // Filter to main countries (exclude regions without proper data)
    const mainCountries = ['United States', 'United Kingdom', 'World', 'China', 'India', 'France', 
                          'Germany', 'Sweden', 'South Africa', 'Japan', 'Brazil', 'Canada', 'Australia',
                          'Mexico', 'Russia', 'South Korea', 'Italy', 'Spain', 'Netherlands', 'Norway']
    
    return latestData.filter(d => mainCountries.includes(d.Entity))
  }

  const sortData = (dataToSort: EnergyData[]) => {
    const sorted = [...dataToSort]
    
    if (sortConfig.type === 'total') {
      sorted.sort((a, b) => {
        const totalA = ENERGY_SOURCES.reduce((sum, source) => sum + (a[source] || 0), 0)
        const totalB = ENERGY_SOURCES.reduce((sum, source) => sum + (b[source] || 0), 0)
        return sortConfig.direction === 'asc' ? totalA - totalB : totalB - totalA
      })
    } else {
      const sourceKey = sortConfig.type as EnergySource
      sorted.sort((a, b) => {
        const valA = a[sourceKey] || 0
        const valB = b[sourceKey] || 0
        return sortConfig.direction === 'asc' ? valA - valB : valB - valA
      })
    }
    
    return sorted
  }

  const latestData = getLatestYearData()
  const sortedData = sortData(latestData)

  useEffect(() => {
    if (!sortedData || sortedData.length === 0) return

    const width = SVG_WIDTH - MARGIN.left - MARGIN.right
    const height = SVG_HEIGHT - MARGIN.top - MARGIN.bottom

    // Calculate max stacked value
    const maxValue = Math.max(...sortedData.map(d => 
      ENERGY_SOURCES.reduce((sum, source) => sum + (d[source] || 0), 0)
    ))

    // Get or create SVG
    let svg = d3.select(svgRef.current)
    
    // Clear previous content
    svg.selectAll("*").remove()

    // Set SVG dimensions
    svg
      .attr('width', SVG_WIDTH)
      .attr('height', SVG_HEIGHT)

    // Add title
    svg.append('text')
      .attr('x', SVG_WIDTH / 2)
      .attr('y', 25)
      .style('font-size', '16px')
      .style('font-weight', 'bold')
      .style('text-anchor', 'middle')
      .text('Per Capita Energy Consumption by Source (Latest Year)')

    const instructionBoxW = 560
    const instructionBoxH = 22
    const instructionBoxY = 44
    const instructionBoxX = SVG_WIDTH / 2 - instructionBoxW / 2

    svg.append('rect')
      .attr('x', instructionBoxX)
      .attr('y', instructionBoxY)
      .attr('width', instructionBoxW)
      .attr('height', instructionBoxH)
      .attr('rx', 8)
      .attr('ry', 8)
      .attr('stroke', '#8fb3e8')
      .attr('stroke-width', 1.5)
      .attr('fill', '#ffffff')

    svg.append('text')
      .attr('x', SVG_WIDTH / 2)
      .attr('y', instructionBoxY + 15)
      .style('font-size', '12px')
      .style('font-weight', '600')
      .style('text-anchor', 'middle')
      .style('fill', '#244a7a')
      .text('Select an energy source below, then drag the slider to reorder the countries.')

    const g = svg
      .append('g')
      .attr('transform', `translate(${MARGIN.left},${MARGIN.top})`)

    // Create scales
    const xScale = d3.scaleBand()
      .domain(sortedData.map(d => d.Entity))
      .range([0, width])
      .padding(0.3)

    const yScale = d3.scaleLinear()
      .domain([0, maxValue * 1.1])
      .range([height, 0])

    // Add Y axis
    const yAxisGroup = g.append('g')
      .call(d3.axisLeft(yScale))

    yAxisGroup.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -height / 2)
      .attr('y', -45)
      .attr('fill', 'black')
      .style('font-size', '12px')
      .style('text-anchor', 'middle')
      .text('kWh per capita')

    // Add grid lines
    g.append('g')
      .attr('class', 'grid')
      .call(
        d3.axisLeft(yScale)
          .tickSize(-width)
          .tickFormat(() => '')
      )
      .selectAll('line')
      .attr('stroke', '#e0e0e0')
      .attr('stroke-dasharray', '4')

    // Create stacked data with highlighted source at the bottom
    const orderedKeys = sortConfig.type === 'total' 
      ? ENERGY_SOURCES 
      : [sortConfig.type as EnergySource, ...ENERGY_SOURCES.filter(s => s !== sortConfig.type)]
    
    const stackedData = d3.stack<EnergyData, EnergySource>()
      .keys(orderedKeys as any)
      (sortedData as any)

    // Add stacked bars
    g.selectAll('g.layer')
      .data(stackedData)
      .join('g')
      .attr('class', 'layer')
      .attr('fill', d => COLORS[d.key])
      .selectAll('rect')
      .data((d) => d.map((interval) => ({ interval, sourceKey: d.key as EnergySource })))
      .join('rect')
      .attr('x', d => xScale((d.interval as any).data.Entity) || 0)
      .attr('y', d => yScale((d.interval as any)[1]))
      .attr('height', d => yScale((d.interval as any)[0]) - yScale((d.interval as any)[1]))
      .attr('width', xScale.bandwidth())
      .attr('stroke', 'none')
      .attr('stroke-width', 1)
      .attr('fill-opacity', d => {
        // When a source is highlighted, show it at full opacity, dim others
        if (highlightedSource !== 'total' && d.sourceKey !== highlightedSource) {
          return 0.7
        }
        return 0.85
      })
      .on('mouseover', function(_event, d) {
        const value = (d.interval as any)[1] - (d.interval as any)[0]
        
        const rect = d3.select(this as SVGRectElement)
        rect.attr('fill-opacity', 1).attr('stroke', '#000')
        
        const xPos = rect.attr('x')
        const yPos = rect.attr('y')
        const bw = xScale.bandwidth() || 0
        
        setTooltip({
          x: parseFloat(xPos) + bw / 2,
          y: parseFloat(yPos),
          entity: (d.interval as any).data.Entity,
          source: d.sourceKey,
          value: value
        })
      })
      .on('mouseout', function() {
        const rect = d3.select(this as SVGRectElement)
        rect.attr('fill-opacity', 0.85).attr('stroke', 'none')
        setTooltip(null)
      })
      .style('cursor', 'pointer')

    // Add X axis
    const xAxisGroup = g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(xScale))

    xAxisGroup.selectAll('text')
      .style('text-anchor', 'start')
      .attr('transform', 'rotate(45)')
      .attr('dx', '8px')
      .attr('dy', '8px')

    // Add legend with highlighted source at top
    let orderedSources = [...ENERGY_SOURCES]
    if (sortConfig.type !== 'total') {
      orderedSources = [sortConfig.type as EnergySource, ...ENERGY_SOURCES.filter(s => s !== sortConfig.type)]
    }
    
    const legendData = orderedSources.map(source => ({
      name: source,
      color: COLORS[source]
    }))

    const legend = g.append('g')
      .attr('class', 'legend')
      .attr('transform', `translate(${width + 20}, 0)`)

    legendData.forEach((item, i) => {
      const row = i
      const col = 0
      
      const legendItem = legend.append('g')
        .attr('transform', `translate(${col * 90}, ${row * 24})`)

      // Add background box for selected source
      if (item.name === sortConfig.type) {
        legendItem.append('rect')
          .attr('class', 'legend-highlight-box')
          .attr('x', -8)
          .attr('y', -4)
          .attr('width', 120)
          .attr('height', 18)
          .attr('rx', 6)
          .attr('ry', 6)
          .attr('fill', '#333333')
          .attr('fill-opacity', 0.15)
          .attr('stroke', '#555555')
          .attr('stroke-width', 1)
      }

      legendItem.append('rect')
        .attr('width', 12)
        .attr('height', 12)
        .attr('fill', item.color)
        .attr('fill-opacity', 0.85)

      legendItem.append('text')
        .attr('x', 18)
        .attr('y', 10)
        .style('font-size', '11px')
        .style('font-family', 'sans-serif')
        .style('fill', '#333')
        .text(item.name)
    })

  }, [sortedData, sortConfig.type, highlightedSource])

  const handleSortChange = (type: SortConfig['type']) => {
    // Only update selection, do NOT sort yet
    setHighlightedSource(type)
    setSliderPosition('middle')
  }

  const handleSort = (type: SortConfig['type'], direction: 'asc' | 'desc') => {
    // Execute the actual sort when slider is dragged
    setSortConfig({
      type,
      direction
    })
    setSliderPosition(direction === 'desc' ? 'left' : 'right')
  }

  const sortOptions: Array<{ type: SortConfig['type']; label: string; color: string }> = [
    { type: 'total', label: 'Total Energy', color: '#666666' },
    ...ENERGY_SOURCES.map(source => ({
      type: source,
      label: source,
      color: COLORS[source]
    }))
  ]

  return (
    <div className="bar-chart-container">
      <div
        className="chart-wrapper"
        style={{ position: 'relative' }}
        onMouseMove={(event) => {
          const target = event.target as Element
          if (!target.closest('rect')) {
            setTooltip(null)
          }
        }}
        onMouseLeave={() => setTooltip(null)}
      >
        <svg ref={svgRef} className="bar-svg"></svg>
        
        {tooltip && (
          <div 
            className="tooltip" 
            style={{
              position: 'absolute',
              left: `${tooltip.x + 10}px`,
              top: `${tooltip.y - 30}px`,
              backgroundColor: 'white',
              border: '1px solid #333',
              borderRadius: '4px',
              padding: '8px 12px',
              fontSize: '12px',
              fontFamily: 'sans-serif',
              zIndex: 1000,
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              pointerEvents: 'none',
              whiteSpace: 'nowrap'
            }}
          >
            <div style={{ fontWeight: 'bold', marginBottom: '2px', fontSize: '13px' }}>
              {tooltip.entity}
            </div>
            <div style={{ fontSize: '11px', color: '#555' }}>
              <span style={{ color: COLORS[tooltip.source], fontWeight: 'bold' }}>
                {tooltip.source}:
              </span>
              {' '}
              <strong>{tooltip.value.toFixed(1)} kWh</strong>
            </div>
          </div>
        )}
      </div>

      <div className="controls">
        <div className="control-group">
          <label>Sort by:</label>
          <div className="sort-buttons" role="group" aria-label="Sort by energy source">
            {sortOptions.map(option => (
              <button
                key={option.type}
                type="button"
                className={`sort-btn ${highlightedSource === option.type ? 'active' : ''}`}
                onClick={() => handleSortChange(option.type)}
                aria-pressed={highlightedSource === option.type}
              >
                <span className="color-swatch" style={{ backgroundColor: option.color }} />
                <span className="sort-label">{option.label}</span>
              </button>
            ))}
          </div>
        </div>
        
        <div className="control-group">
          <span style={{ marginRight: '10px' }}>High to Low</span>
          <div className="slider-container">
            <div 
              className="slider-track"
            >
              <div 
                className="slider-handle"
                style={{ 
                  left: sliderPosition === 'middle' ? '50%' : (sliderPosition === 'left' ? '5%' : '95%')
                }}
                onMouseDown={(e) => {
                  e.preventDefault()
                  const startX = e.clientX
                  
                  const handleMouseMove = (moveEvent: MouseEvent) => {
                    const delta = moveEvent.clientX - startX
                    if (Math.abs(delta) > 20) {
                      const newPos = delta > 0 ? 'right' : 'left'
                      handleSort(highlightedSource, newPos === 'left' ? 'desc' : 'asc')
                      document.removeEventListener('mousemove', handleMouseMove)
                      document.removeEventListener('mouseup', handleMouseUp)
                    }
                  }
                  
                  const handleMouseUp = () => {
                    document.removeEventListener('mousemove', handleMouseMove)
                    document.removeEventListener('mouseup', handleMouseUp)
                  }
                  
                  document.addEventListener('mousemove', handleMouseMove)
                  document.addEventListener('mouseup', handleMouseUp)
                }}
              />
            </div>
          </div>
          <span style={{ marginLeft: '10px' }}>Low to High</span>
        </div>
      </div>
    </div>
  )
}

export default Reconfigure
