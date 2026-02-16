import { useState, useEffect, useRef } from 'react'
import * as d3 from 'd3'
import './BarChartJuicy.css'

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

interface BarChartJuicyProps {
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

function BarChartJuicy({ data }: BarChartJuicyProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [sortConfig, setSortConfig] = useState<SortConfig>({ type: 'total', direction: 'desc' })
  const [tooltip, setTooltip] = useState<TooltipData | null>(null)
  const [hoveredBar, setHoveredBar] = useState<string | null>(null)

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
      .style('class', 'title-juicy')
      .text('Per Capita Energy Consumption by Source (Latest Year)')

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

    // Create stacked data
    const stackedData = d3.stack<EnergyData, EnergySource>()
      .keys(ENERGY_SOURCES)
      (sortedData as any)

    // Add stacked bars with juicy animation
    g.selectAll('g.layer')
      .data(stackedData)
      .join('g')
      .attr('class', 'layer')
      .attr('fill', d => COLORS[d.key])
      .selectAll('rect')
      .data((d) => d.map((interval) => ({ interval, sourceKey: d.key as EnergySource })))
      .join(
        (enter) => enter.append('rect')
          .attr('class', 'bar-rect')
          .attr('x', d => xScale((d.interval as any).data.Entity) || 0)
          .attr('y', d => yScale((d.interval as any)[1]))
          .attr('height', d => yScale((d.interval as any)[0]) - yScale((d.interval as any)[1]))
          .attr('width', xScale.bandwidth())
          .attr('stroke', 'none')
          .attr('stroke-width', 1)
          .attr('fill-opacity', 0.85),
        (update) => update
          .transition()
          .duration(600)
          .ease(d3.easeCubicInOut)
          .attr('x', d => xScale((d.interval as any).data.Entity) || 0)
          .attr('y', d => yScale((d.interval as any)[1]))
          .attr('height', d => yScale((d.interval as any)[0]) - yScale((d.interval as any)[1]))
          .attr('width', xScale.bandwidth())
      )
      .attr('data-entity', d => (d.interval as any).data.Entity)
      .attr('data-source', d => d.sourceKey)
      .on('mouseover', function(_event, d) {
        const entity = (d.interval as any).data.Entity
        const barKey = `${entity}-${d.sourceKey}`
        setHoveredBar(barKey)
        
        const value = (d.interval as any)[1] - (d.interval as any)[0]
        
        const rect = d3.select(this as SVGRectElement)
        rect
          .transition()
          .duration(150)
          .attr('fill-opacity', 1)
          .attr('stroke', '#FF6B6B')
          .attr('stroke-width', 2)
        
        const xPos = rect.attr('x')
        const yPos = rect.attr('y')
        const bw = xScale.bandwidth() || 0
        
        const tooltipX = parseFloat(xPos) + bw / 2
        const tooltipY = parseFloat(yPos)
        
        setTooltip({
          x: tooltipX,
          y: tooltipY,
          entity: entity,
          source: d.sourceKey,
          value: value
        })
        
      })
      .on('mouseout', function() {
        setHoveredBar(null)
        
        d3.select(this as SVGRectElement)
          .transition()
          .duration(150)
          .attr('fill-opacity', 0.85)
          .attr('stroke', 'none')
          .attr('stroke-width', 1)
        
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
      .attr('class', 'axis-label-juicy')

    // Add legend
    const legendData = ENERGY_SOURCES.map(source => ({
      name: source,
      color: COLORS[source]
    }))

    const legend = g.append('g')
      .attr('class', 'legend-juicy')
      .attr('transform', `translate(${width + 20}, 0)`)

    legendData.forEach((item, i) => {
      const row = i % 4
      const col = Math.floor(i / 4)
      
      const legendItem = legend.append('g')
        .attr('class', 'legend-item-juicy')
        .attr('transform', `translate(${col * 90}, ${row * 20})`)

      legendItem.append('rect')
        .attr('width', 12)
        .attr('height', 12)
        .attr('fill', item.color)
        .attr('fill-opacity', 0.85)
        .attr('class', 'legend-rect-juicy')

      legendItem.append('text')
        .attr('x', 18)
        .attr('y', 10)
        .style('font-size', '11px')
        .style('font-family', 'sans-serif')
        .style('fill', '#333')
        .text(item.name)
    })

  }, [sortedData, hoveredBar])

  const handleSortChange = (type: SortConfig['type'], direction?: SortConfig['direction']) => {
    setSortConfig(prev => ({
      type,
      direction: direction || (prev.type === type && prev.direction === 'desc' ? 'asc' : 'desc')
    }))
  }

  const sortOptions: Array<{ type: SortConfig['type']; label: string; color: string }> = [
    { type: 'total', label: 'Total Energy', color: '#666666' },
    ...ENERGY_SOURCES.map(source => ({
      type: source,
      label: source,
      color: COLORS[source]
    }))
  ]

  const latestYear = Math.max(...data.map(d => d.Year))

  return (
    <div className="bar-chart-juicy-container">
      <div className="chart-info-juicy">
        Data from {latestYear} | Sorted by {sortConfig.type === 'total' ? 'Total Energy' : sortConfig.type}
      </div>
      
      <div
        className="chart-wrapper-juicy"
        style={{ position: 'relative' }}
        onMouseMove={(event) => {
          const target = event.target as Element
          if (!target.closest('rect')) {
            setHoveredBar(null)
            setTooltip(null)
          }
        }}
        onMouseLeave={() => {
          setHoveredBar(null)
          setTooltip(null)
        }}
      >
        <svg ref={svgRef} className="bar-svg-juicy"></svg>
        
        {tooltip && (
          <div 
            className="tooltip-juicy" 
            style={{
              position: 'absolute',
              left: `${tooltip.x + 10}px`,
              top: `${tooltip.y - 30}px`,
              backgroundColor: 'white',
              border: `2px solid ${COLORS[tooltip.source]}`,
              borderRadius: '8px',
              padding: '12px 16px',
              fontSize: '12px',
              fontFamily: 'sans-serif',
              zIndex: 1000,
              boxShadow: `0 8px 24px rgba(255, 107, 107, 0.3)`,
              pointerEvents: 'none',
            }}
          >
            <div style={{ fontWeight: 'bold', marginBottom: '4px', fontSize: '14px', color: '#333' }}>
              {tooltip.entity}
            </div>
            <div style={{ fontSize: '12px', color: '#555', marginBottom: '4px' }}>
              <span style={{ color: COLORS[tooltip.source], fontWeight: 'bold' }}>
                {tooltip.source}
              </span>
            </div>
            <div style={{ fontSize: '13px', fontWeight: '600', color: COLORS[tooltip.source] }}>
              {tooltip.value.toFixed(1)} kWh
            </div>
          </div>
        )}
      </div>

      <div className="controls-juicy">
        <div className="control-group-juicy">
          <label>Sort by:</label>
          <div className="sort-buttons-juicy" role="group" aria-label="Sort by energy source">
            {sortOptions.map(option => (
              <button
                key={option.type}
                type="button"
                className={`sort-btn-juicy ${sortConfig.type === option.type ? 'active' : ''}`}
                onClick={() => handleSortChange(option.type)}
                aria-pressed={sortConfig.type === option.type}
              >
                <span className="color-swatch-juicy" style={{ backgroundColor: option.color }} />
                <span className="sort-label-juicy">{option.label}</span>
              </button>
            ))}
          </div>
        </div>
        
        <div className="control-group-juicy">
          <label>Order:</label>
          <button 
            onClick={() => handleSortChange(sortConfig.type, sortConfig.direction === 'asc' ? 'desc' : 'asc')}
            className={`order-btn-juicy ${sortConfig.direction}`}
          >
            {sortConfig.direction === 'asc' ? '↑ Low to High' : '↓ High to Low'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default BarChartJuicy
