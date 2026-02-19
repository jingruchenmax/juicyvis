import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import './EncodeJuicy.css'

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
  { name: 'Poultry', label: 'Poultry', color: '#b13043' },
  { name: 'Beef and buffalo', label: 'Beef & Buffalo', color: '#b87410' },
  { name: 'Sheep and goat', label: 'Sheep & Goat', color: '#4f960d' },
  { name: 'Pork', label: 'Pork', color: '#0c90a7' },
  { name: 'Other meats', label: 'Other Meats', color: '#0c45c2' },
  { name: 'Fish and seafood', label: 'Fish & Seafood', color: '#531897' }
]

const targetCountries = [
  'Spain', 'United States', 'Australia', 'Argentina', 'France',
  'China', 'Canada', 'Brazil', 'Japan', 'Russia',
  'Italy', 'Poland', 'Vietnam', 'Mexico', 'Germany',
  'Netherlands', 'Indonesia', 'Thailand', 'India'
]

const targetYear = 2022

export default function EncodeJuicy({ data }: { data: MeatData[] }) {
  const chartRef = useRef<SVGSVGElement | null>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: string } | null>(null)

  // Filter to 2022 data for target countries
  const chartData = data
    .filter(d => d.Year === targetYear && targetCountries.includes(d.Entity))
    .sort((a, b) => {
      const totalA = meatTypes.reduce((sum, type) => sum + (a[type.name] || 0), 0)
      const totalB = meatTypes.reduce((sum, type) => sum + (b[type.name] || 0), 0)
      return totalB - totalA
    })

  useEffect(() => {
    if (!chartRef.current || chartData.length === 0) return

    const margin = { top: 100, right: 200, bottom: 60, left: 120 }
    const width = 1200 - margin.left - margin.right
    const height = Math.max(500, chartData.length * 36) - margin.top - margin.bottom
    const svgWidth = 1200
    const svgHeight = height + margin.top + margin.bottom

    // Clear previous content
    const svg = d3.select(chartRef.current)
    svg.selectAll('*').remove()
    
    svg.attr('width', svgWidth)
      .attr('height', svgHeight)
      .on('mouseleave', () => setTooltip(null))
      .on('mousemove', (event: MouseEvent) => {
        const target = event.target as Element
        if (!target || target.tagName.toLowerCase() !== 'rect') {
          setTooltip(null)
        }
      })

    // Add title
    svg.append('text')
      .attr('x', svgWidth / 2)
      .attr('y', 35)
      .attr('text-anchor', 'middle')
      .attr('font-size', '28px')
      .attr('font-weight', 'bold')
      .attr('fill', '#333')
      .text('Per capita meat and fish consumption (2022)')

    // Add subtitle
    svg.append('text')
      .attr('x', svgWidth / 2)
      .attr('y', 58)
      .attr('text-anchor', 'middle')
      .attr('font-size', '14px')
      .attr('fill', '#666')
      .text('Measured in kilograms per person per year.')

    // Create main group
    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    // Create scales
    const maxTotal = d3.max(chartData, d => 
      meatTypes.reduce((sum, type) => sum + (d[type.name] || 0), 0)
    ) || 0
    
    const xScale = d3.scaleLinear()
      .domain([0, maxTotal * 1.15])
      .range([0, width])

    const yScale = d3.scaleBand()
      .domain(chartData.map(d => d.Entity))
      .range([0, height])
      .padding(0.04)

    const barHeight = yScale.bandwidth() * 0.75
    const barOffset = (yScale.bandwidth() - barHeight) / 2

    const colorScale = d3.scaleOrdinal<string>()
      .domain(meatTypes.map(t => t.name))
      .range(meatTypes.map(t => t.color))

    const xGrid = d3.axisBottom(xScale)
      .ticks(8)
      .tickSize(-height)
      .tickFormat(() => '')

    g.append('g')
      .attr('class', 'x-grid')
      .attr('transform', `translate(0,${height})`)
      .call(xGrid)
      .selectAll('line')
      .attr('stroke-dasharray', '4 4')

    // Stack data
    const stackData = d3.stack<any>()
      .keys(meatTypes.map(t => t.name))
      .value((d, key) => d[key] || 0)(chartData)

    // Draw bars
    const groups = g.selectAll('.meat-group')
      .data(stackData, (d: any) => d.key)
      .join('g')
      .attr('class', 'meat-group')
      .attr('fill', (d: any) => colorScale(d.key))

    groups.each(function(d: any) {
      const meatType = d.key
      const meatTypeLabel = meatTypes.find(m => m.name === meatType)?.label || ''
      
      d3.select(this).selectAll('rect')
        .data(d as any, (_d: any, i: number) => i)
        .join('rect')
        .attr('x', (d: any) => xScale(d[0]))
        .attr('y', (_d: any, i: number) => (yScale(chartData[i].Entity) || 0) + barOffset)
        .attr('width', (d: any) => xScale(d[1]) - xScale(d[0]))
        .attr('height', barHeight)
        .attr('class', 'meat-bar')
        .style('stroke', '#fff')
        .style('stroke-width', 1)
        .on('mousedown', (event: MouseEvent) => event.preventDefault())
        .on('mouseover', function(event: any, valueData: any) {
          const index = (Array.from((this as any).parentNode.children) as any[]).indexOf(this)
          const country = chartData[index]?.Entity || ''
          const value = Math.round((valueData[1] - valueData[0]) * 10) / 10
          
          setTooltip({
            x: event.pageX,
            y: event.pageY,
            content: `${country}: ${meatTypeLabel} - ${value} kg`
          })
        })
        .on('mousemove', function(event: any, valueData: any) {
          const index = (Array.from((this as any).parentNode.children) as any[]).indexOf(this)
          const country = chartData[index]?.Entity || ''
          const value = Math.round((valueData[1] - valueData[0]) * 10) / 10

          setTooltip({
            x: event.pageX,
            y: event.pageY,
            content: `${country}: ${meatTypeLabel} - ${value} kg`
          })
        })
        .on('mouseleave', () => setTooltip(null))
        .on('blur', () => setTooltip(null))

      // Add text labels inside bars
      d3.select(this).selectAll('text')
        .data(d as any, (_d: any, i: number) => i)
        .join('text')
        .attr('x', (d: any) => xScale(d[0]) + (xScale(d[1]) - xScale(d[0])) / 2)
        .attr('y', (_d: any, i: number) => (yScale(chartData[i].Entity) || 0) + barOffset + barHeight / 2)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('font-size', '11px')
        .attr('fill', '#fff')
        .attr('font-weight', 'bold')
        .style('pointer-events', 'none')
        .text((d: any) => {
          const value = Math.round((d[1] - d[0]) * 10) / 10
          const width = xScale(d[1]) - xScale(d[0])
          // Only show label if width is large enough (> 40px)
          return width > 40 ? `${value} kg` : ''
        })
    })

    // Add total labels at the end of each bar
    g.selectAll('.total-label')
      .data(chartData)
      .join('text')
      .attr('class', 'total-label')
      .attr('x', (d) => xScale(meatTypes.reduce((sum, type) => sum + (d[type.name] || 0), 0)) + 8)
      .attr('y', (d) => (yScale(d.Entity) || 0) + barOffset + barHeight / 2)
      .attr('text-anchor', 'start')
      .attr('dominant-baseline', 'middle')
      .attr('font-size', '12px')
      .attr('fill', '#333')
      .attr('font-weight', '500')
      .text((d) => {
        const total = Math.round(meatTypes.reduce((sum, type) => sum + (d[type.name] || 0), 0) * 10) / 10
        return `${total} kg`
      })

    // Add axes
    const xAxis = d3.axisBottom(xScale).ticks(8)
    const yAxis = d3.axisLeft(yScale)

    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(xAxis)

    g.append('g')
      .call(yAxis)
      .selectAll('text')
      .style('font-weight', 'bold')

    // Add x-axis label
    g.append('text')
      .attr('x', width / 2)
      .attr('y', height + 50)
      .attr('text-anchor', 'middle')
      .attr('fill', '#333')
      .style('font-size', '14px')
      .text('kg per capita per year')

    // Add legend
    const legend = svg.append('g')
      .attr('class', 'legend')
      .attr('transform', `translate(${margin.left + width + 20}, ${margin.top})`)

    legend.selectAll('.legend-item')
      .data(meatTypes)
      .join('g')
      .attr('class', 'legend-item')
      .attr('transform', (_d, i) => `translate(0, ${i * 25})`)
      .each(function(d) {
        d3.select(this).append('rect')
          .attr('width', 15)
          .attr('height', 15)
          .attr('fill', colorScale(d.name))
        
        d3.select(this).append('text')
          .attr('x', 22)
          .attr('y', 12)
          .attr('font-size', '13px')
          .text(d.label)
      })
  }, [chartData])

  return (
    <div className="meat-chart-container">
      <svg ref={chartRef} className="meat-svg"></svg>
      {tooltip && (
        <div
          style={{
            position: 'fixed',
            left: `${tooltip.x + 10}px`,
            top: `${tooltip.y + 10}px`,
            backgroundColor: '#333',
            color: '#fff',
            padding: '8px 12px',
            borderRadius: '4px',
            fontSize: '13px',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            zIndex: 1000
          }}
        >
          {tooltip.content}
        </div>
      )}
    </div>
  )
}
