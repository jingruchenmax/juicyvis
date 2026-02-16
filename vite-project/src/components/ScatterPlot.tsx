import { useState, useEffect, useRef } from 'react'
import * as d3 from 'd3'
import './ScatterPlot.css'

interface DataRow {
  Entity: string
  Day: string
  'Training computation (petaFLOP)': number | null
  'Number of parameters': number | null
  'Researcher affiliation': string
}

interface ScatterPlotProps {
  data: DataRow[]
}

interface TooltipData {
  x: number
  y: number
  data: DataRow
}

const SVG_WIDTH = 1200
const SVG_HEIGHT = 800
const MARGIN = { top: 100, right: 220, bottom: 80, left: 80 }

// Function to format large numbers as readable text
const formatNumber = (num: number | null): string => {
  if (num === null || num === undefined) return 'N/A'
  
  if (num >= 1e9) {
    const billions = num / 1e9
    return billions.toFixed(2).replace(/\.?0+$/, '') + ' billion'
  } else if (num >= 1e6) {
    const millions = num / 1e6
    return millions.toFixed(2).replace(/\.?0+$/, '') + ' million'
  } else if (num >= 1e3) {
    const thousands = num / 1e3
    return thousands.toFixed(2).replace(/\.?0+$/, '') + ' thousand'
  } else {
    return num.toFixed(2).replace(/\.?0+$/, '')
  }
}

const COLORS: Record<string, string> = {
  'Academia': '#4472C4',
  'Industry': '#ED7D31',
  'Academia and industry collaboration': '#70AD47',
  'Government': '#D62728',
  'Other': '#7030A0',
  'Not specified': '#FFC000',
}

const GREY = '#CCCCCC'

interface ScatterDot extends DataRow {
  id?: string
}

function ScatterPlot({ data }: ScatterPlotProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [selectedDots, setSelectedDots] = useState<Set<string>>(new Set())
  const [tooltip, setTooltip] = useState<TooltipData | null>(null)

  useEffect(() => {
    if (!data || data.length === 0) return

    const width = SVG_WIDTH - MARGIN.left - MARGIN.right
    const height = SVG_HEIGHT - MARGIN.top - MARGIN.bottom

    // Create scales
    const xScale = d3.scaleLog()
      .domain(d3.extent(data, d => d['Training computation (petaFLOP)'] || 1) as [number, number])
      .range([0, width])
      .nice()

    const yScale = d3.scaleLog()
      .domain(d3.extent(data, d => d['Number of parameters'] || 1) as [number, number])
      .range([height, 0])
      .nice()

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
      .text('Training computation vs. parameters in notable AI systems, by researcher affiliation')

    // Add subtitle lines
    svg.append('text')
      .attr('x', SVG_WIDTH / 2)
      .attr('y', 45)
      .style('font-size', '12px')
      .style('text-anchor', 'middle')
      .style('fill', '#666')
      .text('Computation is measured in total petaFLOP (10¹⁵ floating-point operations), estimated from AI literature with some uncertainty.')

    svg.append('text')
      .attr('x', SVG_WIDTH / 2)
      .attr('y', 62)
      .style('font-size', '12px')
      .style('text-anchor', 'middle')
      .style('fill', '#666')
      .text('Parameters are variables adjusted during training to transform input data into desired output.')

    const g = svg
      .append('g')
      .attr('transform', `translate(${MARGIN.left},${MARGIN.top})`)

    // Add grid lines
    g.append('g')
      .attr('class', 'grid-x')
      .call(
        d3.axisBottom(xScale)
          .tickSize(height)
          .tickFormat(() => '')
      )
      .selectAll('line')
      .attr('stroke', '#e0e0e0')
      .attr('stroke-dasharray', '4')

    g.append('g')
      .attr('class', 'grid-y')
      .call(
        d3.axisLeft(yScale)
          .tickSize(-width)
          .tickFormat(() => '')
      )
      .selectAll('line')
      .attr('stroke', '#e0e0e0')
      .attr('stroke-dasharray', '4')

    // Add X axis
    const xAxisGroup = g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(xScale))

    xAxisGroup.append('text')
      .attr('x', width / 2)
      .attr('y', 50)
      .attr('fill', 'black')
      .style('font-size', '13px')
      .style('text-anchor', 'middle')
      .text('Number of parameters (plotted on a logarithmic axis)')

    // Add Y axis
    const yAxisGroup = g.append('g')
      .call(d3.axisLeft(yScale))

    yAxisGroup.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -height / 2)
      .attr('y', -60)
      .attr('fill', 'black')
      .style('font-size', '13px')
      .style('text-anchor', 'middle')
      .text('Training computation (petaFLOP) (plotted on a logarithmic axis)')

    // Prepare data with IDs - separate unselected and selected
    const allDataWithIds = data.map((d, i) => ({
      ...d,
      id: `dot-${i}`
    }))
    
    // Sort so unselected dots come first, then selected ones (so selected appear on top)
    const sortedData = [
      ...allDataWithIds.filter(d => !selectedDots.has(d.id || '')),
      ...allDataWithIds.filter(d => selectedDots.has(d.id || ''))
    ]

    // Add dots
    g.selectAll('.dot')
      .data(sortedData, (d: any) => d.id)
      .join('circle')
      .attr('class', 'dot')
      .attr('cx', d => xScale(d['Training computation (petaFLOP)'] || 1))
      .attr('cy', d => yScale(d['Number of parameters'] || 1))
      .attr('r', 5)
      .attr('fill', d => selectedDots.size === 0 ? GREY : (selectedDots.has(d.id || '') ? COLORS[d['Researcher affiliation']] || COLORS['Other'] : GREY))
      .attr('fill-opacity', 0.8)
      .attr('stroke', 'none')
      .style('cursor', 'pointer')
      .on('mouseover', (_event, d: ScatterDot) => {
        const cxVal = xScale(d['Training computation (petaFLOP)'] || 1)
        const cyVal = yScale(d['Number of parameters'] || 1)
        setTooltip({
          x: cxVal + MARGIN.left,
          y: cyVal + MARGIN.top,
          data: d
        })
      })
      .on('mouseout', () => {
        setTooltip(null)
      })
      .on('click', (event, d: ScatterDot) => {
        event.stopPropagation()
        const dotId = d.id || ''
        setSelectedDots(prev => {
          const newSet = new Set(prev)
          if (newSet.has(dotId)) {
            newSet.delete(dotId)
          } else {
            newSet.add(dotId)
          }
          return newSet
        })
      })

    // Add legend
    const legendData = [
      { name: 'Academia', color: COLORS['Academia'] },
      { name: 'Academia and industry collaboration', color: COLORS['Academia and industry collaboration'] },
      { name: 'Industry', color: COLORS['Industry'] },
      { name: 'Not specified', color: COLORS['Not specified'] },
      { name: 'Other', color: COLORS['Other'] },
    ]

    const legend = g.append('g')
      .attr('class', 'legend')
      .attr('transform', `translate(${width + 10}, 0)`)

    legendData.forEach((item, i) => {
      const legendRow = legend.append('g')
        .attr('transform', `translate(0, ${i * 20})`)

      legendRow.append('circle')
        .attr('r', 5)
        .attr('fill', item.color)
        .attr('fill-opacity', 0.8)

      legendRow.append('text')
        .attr('x', 12)
        .attr('y', 5)
        .style('font-size', '12px')
        .style('font-family', 'sans-serif')
        .style('fill', '#333')
        .text(item.name)
    })

  }, [data, selectedDots])

  const handleClearSelection = () => {
    setSelectedDots(new Set())
  }

  return (
    <div className="scatter-plot-container">
      <div className="controls">
        <button 
          onClick={handleClearSelection}
          disabled={selectedDots.size === 0}
          className="clear-btn"
        >
          Clear Selection ({selectedDots.size})
        </button>
      </div>
      
      <div className="chart-wrapper" style={{ position: 'relative' }}>
        <svg ref={svgRef} className="scatter-svg"></svg>
        
        {tooltip && (
          <div 
            className="tooltip" 
            style={{
              position: 'absolute',
              left: `${tooltip.x + 10}px`,
              top: `${tooltip.y + 10}px`,
              backgroundColor: 'white',
              border: '1px solid #333',
              borderRadius: '4px',
              padding: '8px 12px',
              fontSize: '12px',
              fontFamily: 'sans-serif',
              zIndex: 1000,
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              pointerEvents: 'none',
              maxWidth: '280px'
            }}
          >
            <div style={{ fontWeight: 'bold', marginBottom: '4px', fontSize: '13px' }}>
              {tooltip.data.Entity}
            </div>
            <div style={{ fontSize: '11px', color: '#555', marginBottom: '2px' }}>
              <div>Computation: <strong>{formatNumber(tooltip.data['Training computation (petaFLOP)'])} petaFLOP</strong></div>
              <div>Parameters: <strong>{formatNumber(tooltip.data['Number of parameters'])}</strong></div>
              <div>Affiliation: <strong>{tooltip.data['Researcher affiliation']}</strong></div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ScatterPlot
