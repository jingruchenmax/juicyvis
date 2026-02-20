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
  const tooltipRef = useRef<HTMLDivElement | null>(null)
  const [viewMode, setViewMode] = useState<'bar' | 'donut'>('bar')
  const previousModeRef = useRef<'bar' | 'donut'>('bar')

  // Direct DOM tooltip for D3 event handlers (bypasses React state batching)
  const showTooltip = (x: number, y: number, content: string) => {
    const el = tooltipRef.current
    if (!el) return
    el.style.display = 'block'
    el.style.left = `${x + 6}px`
    el.style.top = `${y + 6}px`
    el.textContent = content
  }
  const hideTooltip = () => {
    const el = tooltipRef.current
    if (el) el.style.display = 'none'
  }

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

    // Donut geometry constants (shared between draw & transition functions)
    const donutMinInnerR = 50
    const donutRingThickness = 16
    const donutRingGap = 2
    const donutOuterRadius = donutMinInnerR
      + (chartData.length - 1) * (donutRingThickness + donutRingGap)
      + donutRingThickness

    const svg = d3.select(chartRef.current)
    svg.attr('width', svgWidth).attr('height', svgHeight)
      .on('mouseleave', () => hideTooltip())
      .on('mousemove', (event: MouseEvent) => {
        const target = event.target as Element
        if (!target || (target.tagName.toLowerCase() !== 'rect' && target.tagName.toLowerCase() !== 'path')) {
          hideTooltip()
        }
      })

    const colorScale = d3.scaleOrdinal<string>()
      .domain(meatTypes.map(t => t.name))
      .range(meatTypes.map(t => t.color))

    const addLegend = () => {
      const legend = svg.append('g')
        .attr('class', 'legend')
        .attr('transform', `translate(${margin.left + width + 20}, ${margin.top})`)
      legend.selectAll('.legend-item')
        .data(meatTypes)
        .join('g')
        .attr('class', 'legend-item')
        .attr('transform', (_d, i) => `translate(0, ${i * 25})`)
        .each(function(d) {
          d3.select(this).append('rect').attr('width', 15).attr('height', 15).attr('fill', colorScale(d.name))
          d3.select(this).append('text').attr('x', 22).attr('y', 12).attr('font-size', '13px').text(d.label)
        })

      // Toggle button below legend items
      const btnY = meatTypes.length * 25 + 20
      const fo = legend.append('foreignObject')
        .attr('x', 0)
        .attr('y', btnY)
        .attr('width', 140)
        .attr('height', 38)
      fo.append('xhtml:button' as any)
        .attr('class', 'donut-toggle')
        .text(viewMode === 'bar' ? 'View Donut ●' : 'View Bars ■')
        .on('click', () => setViewMode((prev: 'bar' | 'donut') => (prev === 'bar' ? 'donut' : 'bar')))
    }

    const addTitles = () => {
      svg.append('text')
        .attr('class', 'chart-title')
        .attr('x', svgWidth / 2)
        .attr('y', 35)
        .attr('text-anchor', 'middle')
        .attr('font-size', '28px')
        .attr('font-weight', 'bold')
        .attr('fill', '#333')
        .text('Per capita meat and fish consumption (2022)')
      svg.append('text')
        .attr('class', 'chart-subtitle')
        .attr('x', svgWidth / 2)
        .attr('y', 58)
        .attr('text-anchor', 'middle')
        .attr('font-size', '14px')
        .attr('fill', '#666')
        .text('Measured in kilograms per person per year.')
    }

    const drawBarChart = () => {
      svg.selectAll('*').remove()
      svg.attr('height', svgHeight)
      addTitles()

      // Create main group
      const g = svg
        .append('g')
        .attr('class', 'chart-area')
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
            
            showTooltip(event.pageX, event.pageY, `${country}: ${meatTypeLabel} - ${value} kg`)
          })
          .on('mousemove', function(event: any, valueData: any) {
            const index = (Array.from((this as any).parentNode.children) as any[]).indexOf(this)
            const country = chartData[index]?.Entity || ''
            const value = Math.round((valueData[1] - valueData[0]) * 10) / 10
            showTooltip(event.pageX, event.pageY, `${country}: ${meatTypeLabel} - ${value} kg`)
          })
          .on('mouseleave', () => hideTooltip())
          .on('blur', () => hideTooltip())

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
        .attr('class', 'x-axis')
        .attr('transform', `translate(0,${height})`)
        .call(xAxis)

      g.append('g')
        .attr('class', 'y-axis')
        .call(yAxis)
        .selectAll('text')
        .style('font-weight', 'bold')

      // Add x-axis label
      g.append('text')
        .attr('class', 'x-axis-label')
        .attr('x', width / 2)
        .attr('y', height + 50)
        .attr('text-anchor', 'middle')
        .attr('fill', '#333')
        .style('font-size', '14px')
        .text('kg per capita per year')

      addLegend()
    }

    // ── Donut chart ───────────────────────────────────────────────────────────

    // Helper: build an SVG arc path string at radius r between two D3 pie angles.
    // D3 pie angles: 0 = 12 o'clock, increasing clockwise.
    // D3 arc internally converts angle a → (a − π/2) before cos/sin, giving:
    //   x = r·sin(a),  y = −r·cos(a)
    const svgArcPath = (cx: number, cy: number, r: number, startAngle: number, endAngle: number): string => {
      const x1 = cx + r * Math.sin(startAngle)
      const y1 = cy - r * Math.cos(startAngle)
      const x2 = cx + r * Math.sin(endAngle)
      const y2 = cy - r * Math.cos(endAngle)
      const sweep = endAngle - startAngle
      const largeArc = Math.abs(sweep) > Math.PI ? 1 : 0
      const sweepFlag = sweep > 0 ? 1 : 0
      return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} ${sweepFlag} ${x2} ${y2}`
    }

    const drawDonutChart = (animated: boolean) => {
      svg.selectAll('*').remove()

      // Adjust SVG height for larger donut
      const donutSvgH = margin.top + donutOuterRadius * 2 + margin.bottom + 20
      svg.attr('height', Math.max(svgHeight, donutSvgH))

      addTitles()

      const centerX = svgWidth / 2
      const centerY = margin.top + donutOuterRadius + 10

      // <defs> for textPath guide arcs — inside defs = no rendering, no events
      const defs = svg.append('defs')

      const donutGroup = svg.append('g')
        .attr('class', 'donut-group')
        .attr('transform', `translate(${centerX},${centerY})`)

      // pie from 12 o'clock, full clockwise circle
      const pie = d3.pie<{ type: MeatType; value: number }>()
        .sort(null)
        .startAngle(-Math.PI / 2)
        .endAngle(3 * Math.PI / 2)
        .value(d => d.value)

      // Reorder for donut: short-name countries inner → long-name countries outer
      // (outer rings have larger circumference = more space for long labels)
      const donutOrder = [
        ...chartData.filter(d => d.Entity.length <= 10),
        ...chartData.filter(d => d.Entity.length > 10)
      ]

      donutOrder.forEach((country, index) => {
        const total = meatTypes.reduce((sum, type) => sum + (country[type.name] || 0), 0)
        const dataForPie = meatTypes.map(type => ({
          type,
          value: total > 0 ? (country[type.name] || 0) / total : 0
        }))
        const pieData = pie(dataForPie)

        const innerRadius = donutMinInnerR + index * (donutRingThickness + donutRingGap)
        const outerRadius = innerRadius + donutRingThickness
        const midRadius = (innerRadius + outerRadius) / 2

        const arc = d3.arc<d3.PieArcDatum<{ type: MeatType; value: number }>>()
          .innerRadius(innerRadius)
          .outerRadius(outerRadius)

        const ringGroup = donutGroup.append('g').attr('class', 'donut-ring')

        // ── Colored arc segments ──
        const paths = ringGroup.selectAll('path')
          .data(pieData)
          .join('path')
          .attr('fill', d => colorScale(d.data.type.name))
          .attr('stroke', '#fff')
          .attr('stroke-width', 0.5)
          .style('cursor', 'pointer')
          .on('mousedown', (event: MouseEvent) => event.preventDefault())
          .on('mouseover', function(event: any, d) {
            const pct = Math.round(d.data.value * 1000) / 10
            const val = Math.round((country[d.data.type.name] || 0) * 10) / 10
            showTooltip(event.pageX, event.pageY,
              `${country.Entity}: ${d.data.type.label} — ${pct}% (${val} kg)`)
          })
          .on('mousemove', function(event: any, d) {
            const pct = Math.round(d.data.value * 1000) / 10
            const val = Math.round((country[d.data.type.name] || 0) * 10) / 10
            showTooltip(event.pageX, event.pageY,
              `${country.Entity}: ${d.data.type.label} — ${pct}% (${val} kg)`)
          })
          .on('mouseleave', () => hideTooltip())

        if (animated) {
          paths
            .style('pointer-events', 'none')
            .attr('d', d => arc({ ...d, endAngle: d.startAngle }) as string)
            .transition()
            .duration(1200)
            .ease(d3.easeCircleOut)
            .delay(index * 40)
            .attrTween('d', function(d) {
              const iEnd = d3.interpolate(d.startAngle, d.endAngle)
              return (t: number) => arc({ ...d, endAngle: iEnd(t) }) as string
            })
            .on('end', function() { d3.select(this).style('pointer-events', 'all') })
        } else {
          paths.attr('d', d => arc(d) as string)
        }

        // ── Percentage labels (textPath along each arc's midRadius) ──
        // Labels that overlap with country name text are suppressed
        const skipPctLabels = new Set([
          'United States:Fish and seafood',
          'Mexico:Fish and seafood',
          'Poland:Fish and seafood',
          'Canada:Fish and seafood',
          'Argentina:Fish and seafood',
          'Argentina:Pork',
          'Australia:Fish and seafood',
          'Spain:Fish and seafood',
        ])

        pieData.forEach((d, sliceIdx) => {
          const arcLen = (d.endAngle - d.startAngle) * midRadius
          const pct = Math.round(d.data.value * 1000) / 10
          if (arcLen < 28 || pct === 0) return
          if (skipPctLabels.has(`${country.Entity}:${d.data.type.name}`)) return

          const pctId = `pct-${index}-${sliceIdx}`
          const midAngle = (d.startAngle + d.endAngle) / 2
          // Bottom half of circle (6→9→12 o'clock): reverse arc so text reads L→R
          if (midAngle > Math.PI / 2 && midAngle < 3 * Math.PI / 2) {
            defs.append('path').attr('id', pctId)
              .attr('d', svgArcPath(0, 0, midRadius, d.endAngle, d.startAngle))
          } else {
            defs.append('path').attr('id', pctId)
              .attr('d', svgArcPath(0, 0, midRadius, d.startAngle, d.endAngle))
          }

          const pctText = ringGroup.append('text')
            .attr('class', 'pct-label')
            .attr('font-size', `${Math.min(9, donutRingThickness - 5)}px`)
            .attr('fill', '#fff')
            .attr('font-weight', 'bold')
            .attr('dominant-baseline', 'central')
            .style('pointer-events', 'none')

          pctText.append('textPath')
            .attr('href', `#${pctId}`)
            .attr('startOffset', '50%')
            .attr('text-anchor', 'middle')
            .text(`${pct}%`)

          if (animated) {
            pctText.style('opacity', 0)
              .transition().delay(1200 + index * 40).duration(400).style('opacity', 1)
          }
        })

        // ── Country name (textPath at ~8 o'clock inside ring) ──
        const nameId = `name-${index}`
        // Bottom-left arc (~9 o'clock → ~7 o'clock), reversed for LTR reading
        defs.append('path').attr('id', nameId)
          .attr('d', svgArcPath(0, 0, midRadius, 3 * Math.PI / 2, 7 * Math.PI / 6))

        const nameText = ringGroup.append('text')
          .attr('class', 'ring-label')
          .attr('font-size', `${Math.min(9, donutRingThickness - 5)}px`)
          .attr('fill', '#fff')
          .attr('font-weight', 'bold')
          .attr('dominant-baseline', 'central')
          .style('pointer-events', 'none')

        nameText.append('textPath')
          .attr('href', `#${nameId}`)
          .attr('startOffset', '50%')
          .attr('text-anchor', 'middle')
          .text(country.Entity)

        if (animated) {
          nameText.style('opacity', 0)
            .transition().delay(800 + index * 40).duration(400).style('opacity', 1)
        }
      })

      addLegend()
    }

    // ── Transition bar → donut ────────────────────────────────────────────────

    const transitionToDonut = async () => {
      hideTooltip()

      // Phase 1 (800ms): bars squeeze right-to-left, axes/labels fade
      const phase1 = d3.transition().duration(800).ease(d3.easeCubicInOut)

      svg.selectAll('.meat-group rect')
        .transition(phase1)
        .attr('width', 0)
        .style('opacity', 0)

      svg.selectAll('.meat-group text')
        .transition(phase1)
        .style('opacity', 0)

      svg.selectAll('.x-axis, .x-axis-label, .x-grid, .total-label')
        .transition(phase1)
        .style('opacity', 0)

      await phase1.end().catch(() => undefined)

      // Phase 2 (400ms): y-axis slides to horizontal center and fades
      const phase2 = d3.transition().duration(400).ease(d3.easeCubicInOut)
      const shiftX = svgWidth / 2 - margin.left

      svg.selectAll('.y-axis')
        .transition(phase2)
        .attr('transform', `translate(${shiftX},0)`)
        .style('opacity', 0)

      svg.selectAll('.chart-title, .chart-subtitle, .legend')
        .transition(phase2)
        .style('opacity', 0)

      await phase2.end().catch(() => undefined)

      // Phase 3: draw donut with arc animation
      drawDonutChart(true)
    }

    // ── Transition donut → bar (reverse animation) ────────────────────────────

    const transitionToBar = async () => {
      hideTooltip()

      const ringCount = chartData.length

      // Phase 1 (1200ms): collapse arcs back to startAngle per ring
      const phase1 = d3.transition().duration(1200).ease(d3.easeCubicInOut)

      svg.selectAll('.donut-ring').each(function(_, ringIndex) {
        const innerR = donutMinInnerR + ringIndex * (donutRingThickness + donutRingGap)
        const outerR = innerR + donutRingThickness
        const arcGen = d3.arc<any>().innerRadius(innerR).outerRadius(outerR)

        d3.select(this).selectAll('path')
          .transition(phase1)
          .delay((ringCount - 1 - ringIndex) * 40)
          .attrTween('d', function(d: any) {
            const iEnd = d3.interpolate(d.endAngle, d.startAngle)
            return (t: number) => arcGen({ ...d, endAngle: iEnd(t) }) as string
          })
      })

      // Ring labels + percentage labels fade out
      svg.selectAll('.ring-label, .pct-label')
        .transition(phase1)
        .style('opacity', 0)

      await phase1.end().catch(() => undefined)

      // Phase 2 (400ms): titles/legend fade out
      const phase2 = d3.transition().duration(400).ease(d3.easeCubicInOut)

      svg.selectAll('.chart-title, .chart-subtitle, .legend')
        .transition(phase2)
        .style('opacity', 0)

      await phase2.end().catch(() => undefined)

      // Phase 3 (800ms): draw bar chart then animate bars expanding left-to-right
      drawBarChart()

      const phase3 = d3.transition().duration(800).ease(d3.easeBackOut.overshoot(1.1))

      svg.selectAll('.meat-group').each(function() {
        d3.select(this).selectAll('rect').each(function() {
          const rect = d3.select(this)
          const finalX = parseFloat(rect.attr('x'))
          const finalW = parseFloat(rect.attr('width'))
          rect
            .attr('x', finalX + finalW)  // Start from right edge
            .attr('width', 0)
            .style('opacity', 0)
            .transition(phase3)
            .attr('x', finalX)
            .attr('width', finalW)
            .style('opacity', 1)
        })
        d3.select(this).selectAll('text')
          .style('opacity', 0)
          .transition(phase3)
          .style('opacity', 1)
      })

      svg.selectAll('.x-axis, .x-axis-label, .x-grid, .total-label')
        .style('opacity', 0)
        .transition(phase3)
        .style('opacity', 1)
    }

    if (viewMode === 'bar') {
      if (previousModeRef.current === 'donut') {
        transitionToBar()
      } else {
        drawBarChart()
      }
    } else if (previousModeRef.current === 'bar') {
      transitionToDonut()
    } else {
      drawDonutChart(false)
    }

    previousModeRef.current = viewMode
    hideTooltip()
  }, [chartData, viewMode])

  return (
    <div className="meat-chart-container">
      <svg ref={chartRef} className="meat-svg"></svg>
      <div
        ref={tooltipRef}
        style={{
          display: 'none',
          position: 'fixed',
          backgroundColor: '#333',
          color: '#fff',
          padding: '8px 12px',
          borderRadius: '4px',
          fontSize: '13px',
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
          zIndex: 1000
        }}
      />
    </div>
  )
}
