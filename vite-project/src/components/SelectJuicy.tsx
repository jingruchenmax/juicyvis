import { useState, useEffect, useRef } from 'react'
import * as d3 from 'd3'
import { playHoverSound, playClickSound } from '../utils/soundUtils'
import './Select.css'

interface DataRow {
  Entity: string
  Day: string
  'Training computation (petaFLOP)': number | null
  'Number of parameters': number | null
  'Researcher affiliation': string
}

interface SelectProps {
  data: DataRow[]
}

interface TooltipData {
  x: number
  y: number
  data: DataRow
}

const DEFAULT_SVG_WIDTH = 1200
const MIN_SVG_WIDTH = 900
const SVG_HEIGHT = 800
const MARGIN = { top: 100, right: 40, bottom: 80, left: 80 }

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
  'Academia': '#00B7EB', // 鲜艳青蓝色
  'Industry': '#E53935', // 更鲜明的红色
  'Academia and industry collaboration': '#70AD47',
  'Government': '#D62728',
  'Other': '#7030A0',
  'Not specified': '#FFC000',
}

const GREY = '#CCCCCC'

// Blend each category color 70% original + 30% grey for unselected dots
function blendWithGrey(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const grey = 180
  return `rgb(${Math.round(r * 0.7 + grey * 0.3)}, ${Math.round(g * 0.7 + grey * 0.3)}, ${Math.round(b * 0.7 + grey * 0.3)})`
}

function blendWithWhite(hex: string, amount = 0.2): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const white = 255
  return `rgb(${Math.round(r * amount + white * (1 - amount))}, ${Math.round(g * amount + white * (1 - amount))}, ${Math.round(b * amount + white * (1 - amount))})`
}

const MUTED_COLORS: Record<string, string> = Object.fromEntries(
  Object.entries(COLORS).map(([k, v]) => [k, blendWithGrey(v)])
)

interface ScatterDot extends DataRow {
  id?: string
}

function SelectJuicy({ data }: SelectProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const mainRef = useRef<HTMLDivElement>(null)
  const [svgWidth, setSvgWidth] = useState(DEFAULT_SVG_WIDTH)
  const [selectedDots, setSelectedDots] = useState<Set<string>>(new Set())
  const [tooltip, setTooltip] = useState<TooltipData | null>(null)
  const [selectedTooltips, setSelectedTooltips] = useState<Record<string, TooltipData>>({})

  useEffect(() => {
    const host = mainRef.current
    if (!host || typeof ResizeObserver === 'undefined') return

    const updateWidth = () => {
      const hostWidth = host.clientWidth
      if (!hostWidth) return
      const nextWidth = Math.max(MIN_SVG_WIDTH, Math.round(hostWidth))
      setSvgWidth(prev => (prev === nextWidth ? prev : nextWidth))
    }

    updateWidth()
    const observer = new ResizeObserver(updateWidth)
    observer.observe(host)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!data || data.length === 0) return

    const width = svgWidth - MARGIN.left - MARGIN.right
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
      .attr('width', svgWidth)
      .attr('height', SVG_HEIGHT)

    // Add title
    svg.append('text')
      .attr('x', svgWidth / 2)
      .attr('y', 25)
      .style('font-size', '16px')
      .style('font-weight', 'bold')
      .style('text-anchor', 'middle')
      .text('Training computation vs. parameters in notable AI systems, by researcher affiliation')

    // Add subtitle lines
    svg.append('text')
      .attr('x', svgWidth / 2)
      .attr('y', 45)
      .style('font-size', '12px')
      .style('text-anchor', 'middle')
      .style('fill', '#666')
      .text('Parameters are variables adjusted during training to transform input data into desired output.')

    svg.append('text')
      .attr('x', svgWidth / 2)
      .attr('y', 62)
      .style('font-size', '12px')
      .style('text-anchor', 'middle')
      .style('fill', '#666')
      .text('')

    const instructionBoxW = 520
    const instructionBoxH = 22
    const instructionBoxY = 74
    const instructionBoxX = svgWidth / 2 - instructionBoxW / 2

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
      .attr('x', svgWidth / 2)
      .attr('y', instructionBoxY + 15)
      .style('font-size', '16px')
      .style('font-weight', '600')
      .style('text-anchor', 'middle')
      .style('fill', '#244a7a')
      .text('Click a point to view details and pin-highlight it.')

    // Clip path so dots don't overflow chart bounds during zoom
    svg.append('defs').append('clipPath')
      .attr('id', 'scatter-juicy-clip')
      .append('rect')
      .attr('width', width)
      .attr('height', height)

    const g = svg
      .append('g')
      .attr('transform', `translate(${MARGIN.left},${MARGIN.top})`)

    const chartBg = g.append('rect')
      .attr('class', 'chart-bg')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', width)
      .attr('height', height)
      .attr('fill', '#fff')
      .attr('fill-opacity', 1)

    // Add grid lines
    const gridX = g.append('g').attr('class', 'grid-x')
    gridX.call(d3.axisBottom(xScale).tickSize(height).tickFormat(() => ''))
      .selectAll('line').attr('stroke', '#e0e0e0').attr('stroke-dasharray', '4')

    const gridY = g.append('g').attr('class', 'grid-y')
    gridY.call(d3.axisLeft(yScale).tickSize(-width).tickFormat(() => ''))
      .selectAll('line').attr('stroke', '#e0e0e0').attr('stroke-dasharray', '4')

    // Add crosshair lines
    const crosshairGroup = g.append('g')
      .attr('class', 'crosshair')
      .attr('pointer-events', 'none')

    crosshairGroup.append('line')
      .attr('class', 'crosshair-vertical')
      .attr('x1', 0)
      .attr('x2', 0)
      .attr('y1', 0)
      .attr('y2', height)
      .attr('stroke', '#000')
      .attr('stroke-width', 1)
      .attr('opacity', 0)
      .attr('stroke-dasharray', '3,3')

    crosshairGroup.append('line')
      .attr('class', 'crosshair-horizontal')
      .attr('x1', 0)
      .attr('x2', width)
      .attr('y1', 0)
      .attr('y2', 0)
      .attr('stroke', '#000')
      .attr('stroke-width', 1)
      .attr('opacity', 0)
      .attr('stroke-dasharray', '3,3')

    // Add mousemove listener for crosshair
    svg.on('mousemove', function (event) {
      const [mouseX, mouseY] = d3.pointer(event)
      const chartX = mouseX - MARGIN.left
      const chartY = mouseY - MARGIN.top

      // Only show crosshair if within chart bounds
      if (chartX >= 0 && chartX <= width && chartY >= 0 && chartY <= height) {
        crosshairGroup.select('.crosshair-vertical')
          .attr('x1', chartX)
          .attr('x2', chartX)
          .transition()
          .duration(0)
          .attr('opacity', 0.6)

        crosshairGroup.select('.crosshair-horizontal')
          .attr('y1', chartY)
          .attr('y2', chartY)
          .transition()
          .duration(0)
          .attr('opacity', 0.6)
      } else {
        crosshairGroup.selectAll('line')
          .transition()
          .duration(0)
          .attr('opacity', 0)
      }
    })

    // Hide crosshair on mouseout
    svg.on('mouseout', () => {
      crosshairGroup.selectAll('line')
        .transition()
        .duration(200)
        .attr('opacity', 0)
    })

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

    // Clipped group for dots and highlights
    const dotsGroup = g.append('g').attr('clip-path', 'url(#scatter-juicy-clip)')
    const effectsGroup = g.append('g').attr('clip-path', 'url(#scatter-juicy-clip)')

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

    const getBaseOpacity = (dot: ScatterDot) => {
      const dotId = dot.id || ''
      if (selectedDots.size > 0 && !selectedDots.has(dotId)) {
        return 0.55
      }
      return 0.8
    }

    const triggerShake = () => {
      g.transition().duration(60)
        .attr('transform', `translate(${MARGIN.left + 1},${MARGIN.top - 0.5})`)
        .transition().duration(60)
        .attr('transform', `translate(${MARGIN.left - 1},${MARGIN.top + 0.5})`)
        .transition().duration(60)
        .attr('transform', `translate(${MARGIN.left},${MARGIN.top})`)
    }

    const spawnParticles = (x: number, y: number, color: string) => {
      const particleCount = 16
      const particleRadius = 2.5
      const particles = d3.range(particleCount).map(() => {
        const angle = Math.random() * Math.PI * 2
        const distance = 20 + Math.random() * 14
        return { angle, distance }
      })

      const burst = effectsGroup.append('g')
        .attr('class', 'particle-burst')
        .attr('transform', `translate(${x},${y})`)

      burst.selectAll('circle')
        .data(particles)
        .enter()
        .append('circle')
        .attr('r', particleRadius)
        .attr('cx', 0)
        .attr('cy', 0)
        .attr('fill', color)
        .attr('opacity', 0.9)
        .transition()
        .duration(500)
        .ease(d3.easeCubicOut)
        .attr('cx', d => Math.cos(d.angle) * d.distance)
        .attr('cy', d => Math.sin(d.angle) * d.distance)
        .attr('opacity', 0)
        .remove()

      burst.transition()
        .duration(650)
        .remove()
    }

    // Add dots inside clipped group
    dotsGroup.selectAll('.dot')
      .data(sortedData, (d: any) => d.id)
      .join('circle')
      .attr('class', 'dot')
      .attr('cx', d => xScale(d['Training computation (petaFLOP)'] || 1))
      .attr('cy', d => yScale(d['Number of parameters'] || 1))
      .attr('r', 4)
      .attr('fill', d => selectedDots.has(d.id || '') ? COLORS[d['Researcher affiliation']] || COLORS['Other'] : MUTED_COLORS[d['Researcher affiliation']] || MUTED_COLORS['Other'])
      .attr('fill-opacity', d => getBaseOpacity(d as ScatterDot))
      .attr('stroke', 'none')
      .style('cursor', 'pointer')
      .on('mouseover', (event, d: ScatterDot) => {
        playHoverSound()
        const dotColor = COLORS[d['Researcher affiliation']] || COLORS['Other']
        chartBg.transition('bg-tint').duration(150)
          .attr('fill', blendWithWhite(dotColor, 0.2))
          .attr('fill-opacity', 0.25)
        crosshairGroup.selectAll('line')
          .transition('crosshair-tint').duration(150)
          .attr('stroke', dotColor)
          .attr('stroke-width', 2)
        dotsGroup.selectAll<SVGCircleElement, ScatterDot>('.dot')
          .transition('hover-dim').duration(150)
          .attr('fill-opacity', dot => (dot.id === d.id ? 1 : getBaseOpacity(dot) * 0.35))
        d3.select(event.target)
          .transition('hover-pop').duration(200)
          .attr('r', 9)
          .attr('fill', COLORS[d['Researcher affiliation']] || COLORS['Other'])
        setTooltip({
          x: xScale(d['Training computation (petaFLOP)'] || 1) + MARGIN.left,
          y: yScale(d['Number of parameters'] || 1) + MARGIN.top,
          data: d
        })
      })
      .on('mouseout', (event, d: ScatterDot) => {
        d3.select(event.target as SVGCircleElement)
          .transition('hover-reset').duration(200)
          .attr('r', 4)
          .attr('fill', selectedDots.has(d.id || '') ? COLORS[d['Researcher affiliation']] || COLORS['Other'] : MUTED_COLORS[d['Researcher affiliation']] || MUTED_COLORS['Other'])
        chartBg.transition('bg-reset').duration(200)
          .attr('fill', '#fff')
          .attr('fill-opacity', 1)
        crosshairGroup.selectAll('line')
          .transition('crosshair-reset').duration(200)
          .attr('stroke', '#000')
          .attr('stroke-width', 1)
        dotsGroup.selectAll<SVGCircleElement, ScatterDot>('.dot')
          .transition('hover-undim').duration(150)
          .attr('fill-opacity', dot => getBaseOpacity(dot))
        setTooltip(null)
      })
      .on('click', (event, d: ScatterDot) => {
        event.stopPropagation()
        playClickSound()
        const dotId = d.id || ''
        const cxVal = xScale(d['Training computation (petaFLOP)'] || 1)
        const cyVal = yScale(d['Number of parameters'] || 1)
        const dotColor = COLORS[d['Researcher affiliation']] || COLORS['Other']
        triggerShake()
        spawnParticles(cxVal, cyVal, dotColor)
        d3.select(event.target)
          .transition('shrink').duration(100).attr('r', 1.5).ease(d3.easeCubicIn)
          .on('end', () => {
            d3.select(event.target)
              .transition('expand').duration(100).attr('r', 12).ease(d3.easeBounceOut)
          })
        setTimeout(() => {
          setSelectedDots(prev => {
            const newSet = new Set(prev)
            if (newSet.has(dotId)) {
              newSet.delete(dotId)
              setSelectedTooltips(prevTips => {
                const next = { ...prevTips }
                delete next[dotId]
                return next
              })
            } else {
              newSet.add(dotId)
              setSelectedTooltips(prevTips => ({
                ...prevTips,
                [dotId]: { x: cxVal + MARGIN.left, y: cyVal + MARGIN.top, data: d }
              }))
            }
            return newSet
          })
        }, 200)
      })

    // Add circle highlights for selected dots inside clipped group
    const outlineCircles = dotsGroup.selectAll('.highlight-outline')
      .data(Array.from(selectedDots), (d: any) => d)
      .join(enter => {
        return enter.append('circle')
          .attr('class', 'highlight-outline')
          .attr('r', 8).attr('fill', 'none')
          .attr('stroke', '#000')
          .attr('stroke-width', 4.5)
          .attr('opacity', 0.9)
      })
      .attr('cx', (dotId: string) => {
        const dotIndex = parseInt(dotId.split('-')[1])
        return xScale(data[dotIndex]['Training computation (petaFLOP)'] || 1)
      })
      .attr('cy', (dotId: string) => {
        const dotIndex = parseInt(dotId.split('-')[1])
        return yScale(data[dotIndex]['Number of parameters'] || 1)
      })
    outlineCircles.exit().remove()

    const highlightCircles = dotsGroup.selectAll('.highlight-circle')
      .data(Array.from(selectedDots), (d: any) => d)
      .join(enter => {
        return enter.append('circle')
            .attr('class', 'highlight-circle')
            .attr('r', 6).attr('fill', 'none')
          .attr('stroke-width', 2.5).attr('opacity', 0.8)
      })
      .attr('cx', (dotId: string) => {
        const dotIndex = parseInt(dotId.split('-')[1])
        return xScale(data[dotIndex]['Training computation (petaFLOP)'] || 1)
      })
      .attr('cy', (dotId: string) => {
        const dotIndex = parseInt(dotId.split('-')[1])
        return yScale(data[dotIndex]['Number of parameters'] || 1)
      })
      .attr('stroke', (dotId: string) => {
        const dotIndex = parseInt(dotId.split('-')[1])
        return COLORS[data[dotIndex]['Researcher affiliation']] || COLORS['Other']
      })
    highlightCircles.exit().remove()

  }, [data, selectedDots, svgWidth])

  // Legend entries shown in the side panel.
  const legendDataArray = [
    { name: 'Academia', color: COLORS['Academia'] },
    { name: 'Academia and industry collaboration', color: COLORS['Academia and industry collaboration'] },
    { name: 'Industry', color: COLORS['Industry'] },
    { name: 'Not specified', color: COLORS['Not specified'] },
    { name: 'Other', color: COLORS['Other'] },
  ]

  const selectedList = Array.from(selectedDots).map(dotId => {
    const dotIndex = parseInt(dotId.split('-')[1])
    return data[dotIndex]
  })

  const handleClearSelection = () => {
    setSelectedDots(new Set())
    setSelectedTooltips({})
  }

  return (
    <div className="scatter-plot-container">
      <div className="select-layout">
        <div className="select-main" ref={mainRef}>
          <div className="select-chart-wrapper" style={{ width: svgWidth }}>
            <svg ref={svgRef} className="scatter-svg"></svg>
            {Object.entries(selectedTooltips).map(([dotId, selectedTip]) => (
              <div
                key={`selected-tooltip-${dotId}`}
                className="tooltip"
                style={{
                  position: 'absolute',
                  left: `${selectedTip.x + 10}px`,
                  top: `${selectedTip.y + 10}px`,
                  backgroundColor: 'white',
                  border: '1px solid #333',
                  borderRadius: '4px',
                  padding: '8px 12px',
                  fontSize: '12px',
                  fontFamily: 'sans-serif',
                  zIndex: 950,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                  pointerEvents: 'none',
                  maxWidth: '280px'
                }}
              >
                <div style={{ fontWeight: 'bold', marginBottom: '4px', fontSize: '13px' }}>
                  {selectedTip.data.Entity}
                </div>
                <div style={{ fontSize: '11px', color: '#555', marginBottom: '2px' }}>
                  <div>Computation: <strong>{formatNumber(selectedTip.data['Training computation (petaFLOP)'])} petaFLOP</strong></div>
                  <div>Parameters: <strong>{formatNumber(selectedTip.data['Number of parameters'])}</strong></div>
                  <div>Affiliation: <strong>{selectedTip.data['Researcher affiliation']}</strong></div>
                </div>
              </div>
            ))}
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
        <div className="select-side-panel" style={{ minHeight: SVG_HEIGHT - 100 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {legendDataArray.map(item => (
              <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', background: item.color, border: '1.5px solid #999' }}></span>
                <span style={{ fontSize: 13, color: '#333', fontWeight: 400 }}>{item.name}</span>
              </div>
            ))}
          </div>
          <button 
            onClick={handleClearSelection}
            disabled={selectedDots.size === 0}
            className="clear-btn"
            style={{ width: '100%', marginBottom: 16 }}
          >
            Clear Selection ({selectedDots.size})
          </button>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Selected Items</div>
          <div style={{ maxHeight: 320, overflowY: 'auto', background: '#fff', border: '1px solid #eee', borderRadius: 6, padding: 8 }}>
            {selectedList.length === 0 ? (
              <div style={{ color: '#aaa', fontSize: 13 }}>No items selected</div>
            ) : (
              selectedList.map((item, idx) => (
                <div key={item.Entity + idx} style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: '50%', background: COLORS[item['Researcher affiliation']] || GREY, marginRight: 8, border: '1.5px solid #bbb' }}></span>
                  <span style={{ fontSize: 13, color: '#333', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 150 }}>{item.Entity}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default SelectJuicy
