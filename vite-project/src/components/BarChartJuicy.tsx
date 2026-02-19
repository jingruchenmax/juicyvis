import { useState, useEffect, useRef } from 'react'
import * as d3 from 'd3'
import './BarChartJuicy.css'
import { playMinimalistSound, playClickSound } from '../utils/soundUtils'

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
  const sliderContainerRef = useRef<HTMLDivElement>(null)
  const soundPlaybackRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const dimResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [sortConfig, setSortConfig] = useState<SortConfig>({ type: 'total', direction: 'desc' })
  const [tooltip, setTooltip] = useState<TooltipData | null>(null)
  const [hoveredBar, setHoveredBar] = useState<string | null>(null)
  const [sliderHovered, setSliderHovered] = useState(false)
  const [isWaveAnimating, setIsWaveAnimating] = useState(false)
  const [animatedData, setAnimatedData] = useState<EnergyData[] | null>(null)
  const [sliderProgress, setSliderProgress] = useState(sortConfig.direction === 'desc' ? 0 : 100)
  const [showParticles, setShowParticles] = useState(false)
  const [particlePos, setParticlePos] = useState({ x: 0, y: 0 })
  const [flickerOpacity, setFlickerOpacity] = useState(1)
  const [highlightedSource, setHighlightedSource] = useState<SortConfig['type']>('total')
  const [sliderPosition, setSliderPosition] = useState<'left' | 'middle' | 'right'>('middle') // Track slider state
  const [dimLevel, setDimLevel] = useState(1) // 1 = normal, 0.8 = dimmed, 0.4 = very dimmed
  const [isSvgShaking, setIsSvgShaking] = useState(false)
  const [previewData, setPreviewData] = useState<EnergyData[] | null>(null)
  const animationFrameRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const waveFramesRef = useRef<EnergyData[][]>([])
  const flickerRef = useRef<number | null>(null)
  const shakeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
  
  // Use animated data if available (during wave animation), otherwise use sorted data
  const displayData = animatedData || sortedData


  useEffect(() => {
    if (!displayData || displayData.length === 0) return
    
    // Ensure sliderProgress is updated with slider state
    if (sliderPosition === 'middle') {
      setSliderProgress(50)
    }

    const width = SVG_WIDTH - MARGIN.left - MARGIN.right
    const height = SVG_HEIGHT - MARGIN.top - MARGIN.bottom

    // Calculate max stacked value
    const maxValue = Math.max(...displayData.map(d => 
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
      .domain(displayData.map(d => d.Entity))
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

    // Create stacked data with highlighted source at the bottom - ONLY if slider has been dragged
    const orderedKeys = (highlightedSource !== 'total' && sliderPosition !== 'middle')
      ? /**Highlighted source moves to bottom ONLY after dragging slider */ [highlightedSource as EnergySource, ...ENERGY_SOURCES.filter(s => s !== highlightedSource)]
      : ENERGY_SOURCES /**Keep original order until slider is dragged */
    
    const stackedData = d3.stack<EnergyData, EnergySource>()
      .keys(orderedKeys as any)
      (displayData as any)

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
          .attr('stroke', d => (d.sourceKey === highlightedSource) ? '#000' : 'none')
          .attr('stroke-width', d => (d.sourceKey === highlightedSource) ? 2 : 0)
          .attr('fill-opacity', d => {
            if (d.sourceKey === highlightedSource) return 1
            return dimLevel
          }),
        (update) => update
          .transition()
          .duration(600)
          .ease(d3.easeCubicInOut)
          .attr('x', d => xScale((d.interval as any).data.Entity) || 0)
          .attr('y', d => yScale((d.interval as any)[1]))
          .attr('height', d => yScale((d.interval as any)[0]) - yScale((d.interval as any)[1]))
          .attr('width', xScale.bandwidth())
          .attr('fill-opacity', d => {
            if (d.sourceKey === highlightedSource) return 1
            return dimLevel
          })
          .transition()
          .duration(200)
          .attr('stroke', d => (d.sourceKey === highlightedSource) ? '#000' : 'none')
          .attr('stroke-width', d => (d.sourceKey === highlightedSource) ? 2 : 0)
      )
      .attr('data-entity', d => (d.interval as any).data.Entity)
      .attr('data-source', d => d.sourceKey)
      .on('mouseover', function(_event, d) {
        const entity = (d.interval as any).data.Entity
        const barKey = `${entity}-${d.sourceKey}`
        setHoveredBar(barKey)
        
        const value = (d.interval as any)[1] - (d.interval as any)[0]
        
        const rect = d3.select(this as SVGRectElement)
        const targetOpacity = d.sourceKey === highlightedSource ? 1 : dimLevel
        rect
          .transition()
          .duration(150)
          .attr('fill-opacity', targetOpacity)
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
      .on('mouseout', function(_event, d) {
        setHoveredBar(null)
        
        d3.select(this as SVGRectElement)
          .transition()
          .duration(150)
          .attr('fill-opacity', d.sourceKey === highlightedSource ? 1 : dimLevel)
          .attr('stroke', (d.sourceKey === highlightedSource) ? '#000' : 'none')
          .attr('stroke-width', (d.sourceKey === highlightedSource) ? 2 : 0)
        
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

    // Add legend with highlighted source at top
    let orderedSources = [...ENERGY_SOURCES]
    if (highlightedSource !== 'total') {
      orderedSources = [highlightedSource as EnergySource, ...ENERGY_SOURCES.filter(s => s !== highlightedSource)]
    }
    
    const legendData = orderedSources.map(source => ({
      name: source,
      color: COLORS[source]
    }))

    const legend = g.append('g')
      .attr('class', 'legend-juicy')
      .attr('transform', `translate(${width + 20}, 0)`)

    legendData.forEach((item, i) => {
      const row = i
      const col = 0
      
      const legendItem = legend.append('g')
        .attr('class', 'legend-item-juicy')
        .attr('transform', `translate(${col * 90}, ${row * 24})`)

      // Add background box for selected source
      if (item.name === highlightedSource) {
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
        .attr('class', 'legend-rect-juicy')

      legendItem.append('text')
        .attr('x', 18)
        .attr('y', 10)
        .style('font-size', '11px')
        .style('font-family', 'sans-serif')
        .style('fill', '#333')
        .text(item.name)
    })

    // Render preview layer if previewData exists and highlightedSource is set
    // Always remove old preview layer first
    g.selectAll('g.preview-layer').remove()
    
    if (previewData && highlightedSource !== 'total') {
      // Create preview layer stacked data - put highlighted source at bottom
      const previewOrderedKeys = [highlightedSource as EnergySource, ...ENERGY_SOURCES.filter(s => s !== highlightedSource)]
      
      const previewStackedData = d3.stack<EnergyData, EnergySource>()
        .keys(previewOrderedKeys as any)
        (previewData as any)
      
      // Create preview x scale
      const previewXScale = d3.scaleBand()
        .domain(previewData.map(d => d.Entity))
        .range([0, width])
        .padding(0.3)
      
      // Render only the highlighted source bars as preview
      const previewLayer = previewStackedData.find(layer => layer.key === highlightedSource)
      
      if (previewLayer) {
        const previewGroup = g.append('g')
          .attr('class', 'preview-layer')
        
        previewGroup
          .selectAll('rect.preview-bar')
          .data(previewLayer.map((interval) => ({ interval, sourceKey: previewLayer.key as EnergySource })))
          .join('rect')
          .attr('class', 'preview-bar')
          .attr('x', d => previewXScale((d.interval as any).data.Entity) || 0)
          .attr('y', d => yScale((d.interval as any)[1]))
          .attr('height', d => yScale((d.interval as any)[0]) - yScale((d.interval as any)[1]))
          .attr('width', previewXScale.bandwidth())
          .attr('fill', COLORS[highlightedSource as EnergySource])
          .attr('stroke', '#FFD700')
          .attr('stroke-width', 3)
          .style('pointer-events', 'none')
      }
    }

  }, [displayData, hoveredBar, highlightedSource, dimLevel, sliderHovered, previewData, sliderProgress, sliderPosition])

  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        clearInterval(animationFrameRef.current)
      }
      if (soundPlaybackRef.current) {
        clearInterval(soundPlaybackRef.current)
      }
      if (flickerRef.current) {
        cancelAnimationFrame(flickerRef.current)
      }
      if (dimResetTimeoutRef.current) {
        clearTimeout(dimResetTimeoutRef.current)
      }
      if (shakeTimeoutRef.current) {
        clearTimeout(shakeTimeoutRef.current)
      }
    }
  }, [])

  // Handle preview animation when hovering over slider
  useEffect(() => {
    // Show preview if: hovering, not animating, and highlightedSource is not 'total'
    if (sliderHovered && !isWaveAnimating && highlightedSource !== 'total') {
      // Determine which direction to show preview for
      let previewDirection: 'asc' | 'desc'
      
      if (sliderPosition === 'middle') {
        // When slider is at middle, show desc (High to Low) preview by default
        previewDirection = 'desc'
      } else {
        // When slider has been dragged, show the opposite direction
        previewDirection = sortConfig.direction === 'desc' ? 'asc' : 'desc'
      }
      
      // Get the preview data sorted in the preview direction
      const previewSorted = [...sortedData].sort((a, b) => {
        const getSortValue = (item: EnergyData): number => {
          // Use highlightedSource for sorting when slider is at middle, otherwise use sortConfig.type
          const sourceToSort = sliderPosition === 'middle' ? highlightedSource : sortConfig.type
          
          if (sourceToSort === 'total') {
            return ENERGY_SOURCES.reduce((sum, source) => sum + (item[source] || 0), 0)
          }
          return item[sourceToSort as EnergySource] || 0
        }
        const valA = getSortValue(a)
        const valB = getSortValue(b)
        return previewDirection === 'asc' ? valA - valB : valB - valA
      })
      
      // Set preview data once - CSS animation will handle the flashing effect
      setPreviewData(previewSorted)
    } else {
      // Stop preview when not hovering or when animating
      setPreviewData(null)
    }
  }, [sliderHovered, isWaveAnimating, sortConfig, sortedData, highlightedSource, sliderPosition])

  // Handle flickering effect during animation
  useEffect(() => {
    if (!isWaveAnimating) {
      setFlickerOpacity(1)
      if (flickerRef.current) {
        cancelAnimationFrame(flickerRef.current)
      }
      return
    }

    const startTime = Date.now()
    const animate = () => {
      const elapsed = Date.now() - startTime
      const phase = (elapsed % 100) / 100 * Math.PI * 2
      setFlickerOpacity(0.6 + Math.sin(phase) * 0.3)
      flickerRef.current = requestAnimationFrame(animate)
    }
    
    flickerRef.current = requestAnimationFrame(animate)
    
    return () => {
      if (flickerRef.current) {
        cancelAnimationFrame(flickerRef.current)
      }
    }
  }, [isWaveAnimating])

  // Update slider position based on sort direction when not animating
  useEffect(() => {
    if (!isWaveAnimating) {
      setSliderProgress(sortConfig.direction === 'desc' ? 0 : 100)
    }
  }, [sortConfig.direction, isWaveAnimating])



  // Generate wave animation frames based on odd-even merge sort pattern
  const generateWaveFrames = (
    dataToAnimate: EnergyData[],
    type: SortConfig['type'],
    toDirection: 'asc' | 'desc'
  ) => {
    const getSortValue = (item: EnergyData): number => {
      if (type === 'total') {
        return ENERGY_SOURCES.reduce((sum, source) => sum + (item[source] || 0), 0)
      }
      return item[type as EnergySource] || 0
    }

    const n = dataToAnimate.length
    const frames: EnergyData[][] = []

    // Create ranking of items based on their values
    // "valueRank" where highest value = n, lowest value = 1 (matches user's sequence notation)
    const ranked = [...dataToAnimate]
      .map((item) => ({ item, value: getSortValue(item) }))
      .sort((a, b) => b.value - a.value) // Sort descending by value

    // Create mapping from item to value rank (highest=n, lowest=1)
    const itemToValueRank = new Map<EnergyData, number>()
    ranked.forEach((r, idx) => {
      itemToValueRank.set(r.item, n - idx) // idx=0 (highest) → n, idx=1 → n-1, ..., idx=n-1 (lowest) → 1
    })

    // Create reverse mapping from value rank to item
    const valueRankToItem = new Map<number, EnergyData>()
    itemToValueRank.forEach((valueRank, item) => {
      valueRankToItem.set(valueRank, item)
    })

    // For n=20, use the exact sequence provided
    if (n === 20 && toDirection === 'asc') {
      const rankSequences = [
        [20,19,18,17,16,15,14,13,12,11,10,9,8,7,6,5,4,3,2,1],
        [19,20,18,17,16,15,14,13,12,11,10,9,8,7,6,5,4,3,2,1],
        [17,19,20,18,16,15,14,13,12,11,10,9,8,7,6,5,4,3,2,1],
        [15,17,19,20,18,16,14,13,12,11,10,9,8,7,6,5,4,3,2,1],
        [13,15,17,19,20,18,16,14,12,11,10,9,8,7,6,5,4,3,2,1],
        [11,13,15,17,19,20,18,16,14,12,10,9,8,7,6,5,4,3,2,1],
        [9,11,13,15,17,19,20,18,16,14,12,10,8,7,6,5,4,3,2,1],
        [7,9,11,13,15,17,19,20,18,16,14,12,10,8,6,5,4,3,2,1],
        [5,7,9,11,13,15,17,19,20,18,16,14,12,10,8,6,4,3,2,1],
        [3,5,7,9,11,13,15,17,19,20,18,16,14,12,10,8,6,4,2,1],
        [1,3,5,7,9,11,13,15,17,19,20,18,16,14,12,10,8,6,4,2],
        [1,2,3,5,7,9,11,13,15,17,19,20,18,16,14,12,10,8,6,4],
        [1,2,3,4,5,7,9,11,13,15,17,19,20,18,16,14,12,10,8,6],
        [1,2,3,4,5,6,7,9,11,13,15,17,19,20,18,16,14,12,10,8],
        [1,2,3,4,5,6,7,8,9,11,13,15,17,19,20,18,16,14,12,10],
        [1,2,3,4,5,6,7,8,9,10,11,13,15,17,19,20,18,16,14,12],
        [1,2,3,4,5,6,7,8,9,10,11,12,13,15,17,19,20,18,16,14],
        [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,17,19,20,18,16],
        [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,19,20,18],
        [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20],
      ]

      // Convert value rank sequences to actual data items
      rankSequences.forEach(valueRankSeq => {
        const frameData = valueRankSeq
          .map(valueRank => valueRankToItem.get(valueRank))
          .filter((item): item is EnergyData => item !== undefined)
        if (frameData.length === n) {
          frames.push(frameData)
        }
      })
    } else if (n === 20 && toDirection === 'desc') {
      // Reverse sequence: from asc to desc
      const rankSequences = [
        [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20],
        [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,19,20,18],
        [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,17,19,20,18,16],
        [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,17,19,20,18,16],
        [1,2,3,4,5,6,7,8,9,10,11,12,13,15,17,19,20,18,16,14],
        [1,2,3,4,5,6,7,8,9,10,11,13,15,17,19,20,18,16,14,12],
        [1,2,3,4,5,6,7,8,9,11,13,15,17,19,20,18,16,14,12,10],
        [1,2,3,4,5,6,7,9,11,13,15,17,19,20,18,16,14,12,10,8],
        [1,2,3,4,5,6,7,9,11,13,15,17,19,20,18,16,14,12,10,8],
        [1,2,3,5,7,9,11,13,15,17,19,20,18,16,14,12,10,8,6,4],
        [1,3,5,7,9,11,13,15,17,19,20,18,16,14,12,10,8,6,4,2],
        [3,5,7,9,11,13,15,17,19,20,18,16,14,12,10,8,6,4,2,1],
        [5,7,9,11,13,15,17,19,20,18,16,14,12,10,8,6,4,3,2,1],
        [7,9,11,13,15,17,19,20,18,16,14,12,10,8,6,5,4,3,2,1],
        [9,11,13,15,17,19,20,18,16,14,12,10,8,7,6,5,4,3,2,1],
        [11,13,15,17,19,20,18,16,14,12,10,9,8,7,6,5,4,3,2,1],
        [13,15,17,19,20,18,16,14,12,11,10,9,8,7,6,5,4,3,2,1],
        [15,17,19,20,18,16,14,13,12,11,10,9,8,7,6,5,4,3,2,1],
        [17,19,20,18,16,15,14,13,12,11,10,9,8,7,6,5,4,3,2,1],
        [19,20,18,17,16,15,14,13,12,11,10,9,8,7,6,5,4,3,2,1],
        [20,19,18,17,16,15,14,13,12,11,10,9,8,7,6,5,4,3,2,1],
      ]

      // Convert value rank sequences to actual data items
      rankSequences.forEach(valueRankSeq => {
        const frameData = valueRankSeq
          .map(valueRank => valueRankToItem.get(valueRank))
          .filter((item): item is EnergyData => item !== undefined)
        if (frameData.length === n) {
          frames.push(frameData)
        }
      })
    } else if (toDirection === 'asc') {
      // For other sizes, generate a similar pattern algorithmically
      // Using odd-even merge sort visualization pattern
      for (let step = 0; step < n; step++) {
        const intermediate = [...dataToAnimate]
        
        // Create a progressive sort using bubble sort with wave pattern
        intermediate.sort((a, b) => {
          const aIdx = dataToAnimate.indexOf(a)
          const bIdx = dataToAnimate.indexOf(b)
          
          // Progress-based mixing toward sorted order
          const progress = step / Math.max(n - 1, 1)
          const aTarget = ranked.findIndex(r => r.item === a)
          const bTarget = ranked.findIndex(r => r.item === b)
          
          // Blend current position with target position
          const aWeight = aIdx * (1 - progress) + aTarget * progress
          const bWeight = bIdx * (1 - progress) + bTarget * progress
          
          return bWeight - aWeight // Reverse for ascending
        })
        
        frames.push([...intermediate])
      }
    } else {
      // For descending (desc to desc), just return the data once
      frames.push([...dataToAnimate])
    }

    return frames
  }

  const animateWaveSort = (
    type: SortConfig['type'],
    toDir: 'asc' | 'desc'
  ) => {
    if (isWaveAnimating) return
    
    setIsWaveAnimating(true)
    setDimLevel(0.4) // Further dim other categories during animation
    
    // Start SVG shake animation
    setIsSvgShaking(true)
    if (shakeTimeoutRef.current) {
      clearTimeout(shakeTimeoutRef.current)
    }
    // Shake for 0.4s (duration of CSS animation)
    shakeTimeoutRef.current = setTimeout(() => {
      setIsSvgShaking(false)
    }, 400)
    
    const frames = generateWaveFrames(latestData, type, toDir)
    waveFramesRef.current = frames
    let frameIndex = 0
    
    const FRAME_INTERVAL = 20 // ms per frame (very fast - original was 77ms)
    const totalFrames = frames.length
    const totalDuration = totalFrames * FRAME_INTERVAL // total animation duration in ms
    const soundInterval = totalDuration / totalFrames // interval between sound plays
    
    // Start playing sound effect immediately (triggered by user interaction)
    let soundPlayCount = 0
    if (soundPlaybackRef.current) {
      clearInterval(soundPlaybackRef.current)
    }
    
    soundPlaybackRef.current = setInterval(() => {
      if (soundPlayCount < totalFrames) {
        playMinimalistSound()
        soundPlayCount++
      } else {
        if (soundPlaybackRef.current) {
          clearInterval(soundPlaybackRef.current)
          soundPlaybackRef.current = null
        }
      }
    }, soundInterval)
    
    if (animationFrameRef.current) {
      clearInterval(animationFrameRef.current)
    }
    
    animationFrameRef.current = setInterval(() => {
      if (frameIndex < frames.length) {
        setAnimatedData([...frames[frameIndex]])
        
        // Trigger pop-up animation on highlighted bars
        if (svgRef.current && highlightedSource !== 'total') {
          const allBars = d3.select(svgRef.current)
            .selectAll('rect.bar-rect')
            .filter((d: any) => d && d.sourceKey === highlightedSource)
          
          // Add pop class
          allBars.classed('bar-pop-animate', true)
          
          // Remove pop class after animation
          setTimeout(() => {
            allBars.classed('bar-pop-animate', false)
          }, 120) // Match CSS animation duration
        }
        
        // Update slider progress based on animation direction
        const progress = (frameIndex / frames.length) * 100
        if (toDir === 'asc') {
          setSliderProgress(progress)
        } else {
          setSliderProgress(100 - progress)
        }
        
        frameIndex++
      } else {
        // Animation complete
        clearInterval(animationFrameRef.current!)
        setAnimatedData(null)
        setIsWaveAnimating(false)
        setSortConfig({ type, direction: toDir })
        
        // Stop sound playback if still running
        if (soundPlaybackRef.current) {
          clearInterval(soundPlaybackRef.current)
          soundPlaybackRef.current = null
        }
        
        // Trigger particle effect at handle position
        if (sliderContainerRef.current) {
          const rect = sliderContainerRef.current.getBoundingClientRect()
          const handleX = rect.left + (toDir === 'asc' ? rect.width - 12 : 12)
          const handleY = rect.top + rect.height / 2
          setParticlePos({ x: handleX, y: handleY })
          setShowParticles(true)
          
          // Hide particles after lingering - independent of other animations
          setTimeout(() => setShowParticles(false), 1200)
          
          // Restore dim level to 0.8 after 1 second
          if (dimResetTimeoutRef.current) {
            clearTimeout(dimResetTimeoutRef.current)
          }
          dimResetTimeoutRef.current = setTimeout(() => {
            setDimLevel(0.6)
          }, 1000)
        }
      }
    }, FRAME_INTERVAL) // Animation frame interval
  }

  const handleSortChange = (type: SortConfig['type']) => {
    // Play click sound
    playClickSound()
    
    // Update highlighted source for visual feedback (highlight bars, show color on slider)
    setHighlightedSource(type)
    setDimLevel(0.7) // Dim level for non-selected categories when selected
    
    // Reset slider to middle position when selecting a new type
    setSliderPosition('middle')
    setSliderProgress(50) // Position handle at middle
    
    // Do NOT update sortConfig - data order stays the same until slider is dragged
    // Only apply visual changes: highlight bars, show black borders, change slider color
    // User must drag slider to trigger actual sorting and animation
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
        <svg ref={svgRef} className={`bar-svg-juicy ${isSvgShaking ? 'bar-svg-juicy-shaking' : ''}`}></svg>
        
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
                style={sortConfig.type === option.type ? {
                  borderColor: option.color,
                  boxShadow: `0 0 0 2px ${option.color}33, 0 2px 8px rgba(0, 0, 0, 0.08)`
                } : undefined}
              >
                <span className="color-swatch-juicy" style={{ backgroundColor: option.color }} />
                <span className="sort-label-juicy">{option.label}</span>
              </button>
            ))}
          </div>
        </div>
        
        <div className="control-group-juicy">
          <span style={{ marginRight: '10px', fontSize: '14px', fontWeight: '500' }}>High to Low</span>
          <div className="slider-container-juicy" ref={sliderContainerRef}>
            {(() => {
              // Color slider based on highlighted source, not sortConfig
              const sliderColor = highlightedSource === 'total' ? '#666666' : COLORS[highlightedSource as EnergySource]
              
              return (
                <div 
                  className="slider-track-juicy"
                  style={{
                    background: `linear-gradient(90deg, ${sliderColor} 0%, ${sliderColor}dd 100%)`,
                    opacity: flickerOpacity,
                    boxShadow: sliderHovered 
                      ? `0 6px 16px ${sliderColor}4d`
                      : `0 4px 12px ${sliderColor}33`
                  }}
                  onMouseEnter={() => setSliderHovered(true)}
                  onMouseLeave={() => setSliderHovered(false)}
                >
                  <div 
                    className="slider-handle-juicy"
                    style={{ 
                      left: (() => {
                        // Position handle based on slider state
                        if (sliderPosition === 'middle') return '50%'
                        if (sliderPosition === 'left') return '5%'
                        return '95%' // right
                      })(),
                      borderColor: sliderColor,
                      opacity: flickerOpacity,
                      boxShadow: sliderHovered
                        ? `0 6px 16px ${sliderColor}4d`
                        : `0 4px 12px ${sliderColor}33`
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      const startX = e.clientX
                      
                      const handleMouseMove = (moveEvent: MouseEvent) => {
                        const delta = moveEvent.clientX - startX
                        if (Math.abs(delta) < 20) return // Need at least 20px movement
                        
                        // Determine direction based on delta
                        const newPos = delta > 0 ? 'right' : 'left'
                        
                        // Trigger animation based on direction change
                        if (newPos !== sliderPosition) {
                          // First sort from middle or switch sides
                          setSliderPosition(newPos)
                          const direction = newPos === 'left' ? 'desc' : 'asc'
                          animateWaveSort(highlightedSource, direction)
                        }
                        
                        document.removeEventListener('mousemove', handleMouseMove)
                        document.removeEventListener('mouseup', handleMouseUp)
                      }
                      
                      const handleMouseUp = () => {
                        document.removeEventListener('mousemove', handleMouseMove)
                        document.removeEventListener('mouseup', handleMouseUp)
                      }
                      
                      document.addEventListener('mousemove', handleMouseMove)
                      document.addEventListener('mouseup', handleMouseUp)
                    }}
                  />
                  
                  {/* Floating arrows when hovering */}
                  {sliderHovered && !isWaveAnimating && (
                    <>
                      {sliderPosition === 'middle' ? (
                        // Show two arrows when slider is at middle
                        <>
                          <div 
                            className="slider-arrow slider-arrow-left"
                            style={{ color: sliderColor, left: '25%' }}
                          >
                            ←
                          </div>
                          <div 
                            className="slider-arrow slider-arrow-right"
                            style={{ color: sliderColor, left: '75%' }}
                          >
                            →
                          </div>
                        </>
                      ) : (
                        // Show single arrow based on current position
                        <div 
                          className={`slider-arrow ${sliderPosition === 'left' ? 'slider-arrow-left' : 'slider-arrow-right'}`}
                          style={{ color: sliderColor }}
                        >
                          {sliderPosition === 'left' ? '←' : '→'}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })()}
          </div>
          <span style={{ marginLeft: '10px', fontSize: '14px', fontWeight: '500' }}>Low to High</span>
        </div>
      </div>
      
      {/* Particle Effect */}
      {showParticles && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1000 }}>
          {Array.from({ length: 40 }).map((_, i) => {
            const angle = (i / 40) * Math.PI * 2
            const distance = 10 + Math.random() * 60
            const endX = Math.cos(angle) * distance
            const endY = Math.sin(angle) * distance
            const color = sortConfig.type === 'total' ? '#666666' : COLORS[sortConfig.type as EnergySource]
            const delay = i * 10 // Stagger particles
            
            return (
              <div
                key={i}
                style={{
                  position: 'fixed',
                  left: `${particlePos.x}px`,
                  top: `${particlePos.y}px`,
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: color,
                  pointerEvents: 'none',
                  animation: `particle-burst 0.8s ease-out ${delay}ms forwards`,
                  transformOrigin: `0 0`,
                  '--tx': `${endX}px`,
                  '--ty': `${endY}px`
                } as React.CSSProperties & { '--tx': string; '--ty': string }}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

export default BarChartJuicy

// Add keyframe animation to stylesheet
if (typeof document !== 'undefined') {
  const styleId = 'particle-animation-style'
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style')
    style.id = styleId
    style.textContent = `
      @keyframes particle-burst {
        0% {
          transform: translate(0, 0);
          opacity: 1;
        }
        70% {
          transform: translate(var(--tx, 0), var(--ty, 0));
          opacity: 1;
        }
        100% {
          transform: translate(var(--tx, 0), var(--ty, 0));
          opacity: 0;
        }
      }
    `
    document.head.appendChild(style)
  }
}
