import { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import { playHoverSound, playClickSound, playGrabSound, playReleaseSound, playZoomSound, playDragStartSound } from '../utils/soundUtils'
import './Explore.css'

interface ExploreProps {
  width?: number
  height?: number
}

interface MortalityData {
  [countryCode: string]: number
}

interface LabelDatum {
  id: number
  name: string
  centroid: [number, number]
  fontSize: number
}

// Mapping of country codes to Natural Earth numeric IDs
const CODE_TO_ID: { [code: string]: number } = {
  'AFG': 4, 'ALB': 8, 'DZA': 12, 'AND': 20, 'AGO': 24, 'AIA': 660, 'ATG': 28, 'ARG': 32, 'ARM': 51, 'ABW': 533, 'AUS': 36, 'AUT': 40, 'AZE': 31, 'BHS': 44, 'BHR': 48, 'BGD': 50, 'BRB': 52, 'BLR': 112, 'BEL': 56, 'BLZ': 84, 'BEN': 204, 'BMU': 60, 'BTN': 64, 'BOL': 68, 'BIH': 70, 'BWA': 72, 'BRA': 76, 'BRN': 96, 'BGR': 100, 'BFA': 854, 'BDI': 108, 'KHM': 116, 'CMR': 120, 'CAN': 124, 'CPV': 132, 'CYM': 136, 'CAF': 140, 'TCD': 148, 'CHL': 152, 'CHN': 156, 'CXR': 162, 'CCK': 166, 'COL': 170, 'COM': 174, 'COG': 178, 'COR': 184, 'CIV': 384, 'HRV': 191, 'CUB': 192, 'CYP': 196, 'CZE': 203, 'DNK': 208, 'DJI': 262, 'DMA': 212, 'DOM': 214, 'ECU': 218, 'EGY': 818, 'SLV': 222, 'GNQ': 226, 'ERI': 232, 'EST': 233, 'SWZ': 748, 'ETH': 231, 'FLK': 238, 'FRO': 234, 'FJI': 242, 'FIN': 246, 'FRA': 250, 'PYF': 258, 'GAB': 266, 'GMB': 270, 'GEO': 268, 'DEU': 276, 'GHA': 288, 'GIB': 292, 'GRC': 300, 'GRL': 304, 'GRD': 308, 'GUM': 316, 'GTM': 320, 'GGY': 831, 'GIN': 324, 'GNB': 624, 'GUY': 328, 'HTI': 332, 'HND': 340, 'HKG': 344, 'HUN': 348, 'ISL': 352, 'IND': 356, 'IDN': 360, 'IRN': 364, 'IRQ': 368, 'IRL': 372, 'IMN': 833, 'ISR': 376, 'ITA': 380, 'JAM': 388, 'JPN': 392, 'JEY': 832, 'JOR': 400, 'KAZ': 398, 'KEN': 404, 'KIR': 296, 'KWT': 414, 'KGZ': 417, 'LAO': 418, 'LVA': 428, 'LBN': 422, 'LSO': 426, 'LBR': 430, 'LBY': 434, 'LIE': 438, 'LTU': 440, 'LUX': 442, 'MAC': 446, 'MKD': 807, 'MDG': 450, 'MWI': 454, 'MYS': 458, 'MDV': 462, 'MLI': 466, 'MLT': 470, 'MHL': 584, 'MTQ': 474, 'MRT': 478, 'MUS': 480, 'MYT': 175, 'MEX': 484, 'FSM': 583, 'MDA': 498, 'MCO': 492, 'MNG': 496, 'MNE': 499, 'MAR': 504, 'MOZ': 508, 'MMR': 104, 'NAM': 516, 'NRU': 520, 'NPL': 524, 'NLD': 528, 'NCL': 540, 'NZL': 554, 'NIC': 558, 'NER': 562, 'NGA': 566, 'PRK': 408, 'NMK': 570, 'MNP': 580, 'NOR': 578, 'OMN': 512, 'PAK': 586, 'PLW': 585, 'PSE': 275, 'PAN': 591, 'PNG': 598, 'PRY': 600, 'PER': 604, 'PHL': 608, 'PCN': 612, 'POL': 616, 'PRT': 620, 'PRI': 630, 'QAT': 634, 'ROU': 642, 'RUS': 643, 'RWA': 646, 'SHN': 654, 'KNA': 659, 'LCA': 662, 'MAF': 663, 'SPM': 666, 'VCT': 670, 'WSM': 882, 'SMR': 674, 'STP': 678, 'SAU': 682, 'SEN': 686, 'SRB': 688, 'SYC': 690, 'SLE': 694, 'SGP': 702, 'SVK': 703, 'SVN': 705, 'SLB': 90, 'SOM': 706, 'ZAF': 710, 'KOR': 410, 'SSD': 728, 'ESP': 724, 'LKA': 144, 'SDN': 729, 'SUR': 740, 'SWE': 752, 'CHE': 756, 'SYR': 760, 'TWN': 158, 'TJK': 762, 'TZA': 834, 'THA': 764, 'TLS': 626, 'TGO': 768, 'TON': 776, 'TTO': 780, 'TUN': 788, 'TUR': 792, 'TKM': 795, 'TUV': 798, 'UGA': 800, 'UKR': 804, 'ARE': 784, 'GBR': 826, 'USA': 840, 'URY': 858, 'UZB': 860, 'VUT': 548, 'VEN': 862, 'VNM': 704, 'VGB': 92, 'VIR': 850, 'WLF': 876, 'ESH': 732, 'YEM': 887, 'ZMB': 894, 'ZWE': 716
}


const loadTopojson = () => {
  return new Promise<any>((resolve, reject) => {
    if ((window as any).topojson) {
      resolve((window as any).topojson)
      return
    }

    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/topojson-client@3'
    script.async = true
    script.onload = () => resolve((window as any).topojson)
    script.onerror = reject
    document.head.appendChild(script)
  })
}

function ExploreJuicy({ width = 975, height = 610 }: ExploreProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const pathRef = useRef<d3.GeoPath<any, d3.GeoPermissibleObjects> | null>(null)
  const selectedRef = useRef<Set<number>>(new Set())
  const dragStartRef = useRef<{ x: number; y: number; k: number } | null>(null)
  const dragDistanceRef = useRef(0)
  const lastDragPosRef = useRef<{ x: number; y: number } | null>(null)
  const hadDragRef = useRef(false)
  const shouldDrawCircleRef = useRef(true) // Track if we should draw drag circle

  const [worldData, setWorldData] = useState<any>(null)
  const [countries, setCountries] = useState<any[]>([])
  const [labels, setLabels] = useState<LabelDatum[]>([])
  const [mortalityData, setMortalityData] = useState<MortalityData>({})
  const [loading, setLoading] = useState(true)
  const [hoveredCountry, setHoveredCountry] = useState<{ id: number; name: string; mortality: number } | null>(null)
  const [currentZoom, setCurrentZoom] = useState(1)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [viewTransform, setViewTransform] = useState<{ x: number; y: number; k: number }>({ x: 0, y: 0, k: 1 })

  const idToCode = useMemo(() => {
    const map: { [id: number]: string } = {}
    Object.entries(CODE_TO_ID).forEach(([code, id]) => {
      map[id] = code
    })
    return map
  }, [])

  const labelLookup = useMemo(() => {
    const map = new Map<number, LabelDatum>()
    labels.forEach(l => map.set(l.id, l))
    return map
  }, [labels])

  // Load world TopoJSON data and child mortality data
  useEffect(() => {
    Promise.all([
      fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json').then(res => res.json()),
      fetch(`${import.meta.env.BASE_URL}child-mortality.csv`).then(res => res.text())
    ])
      .then(([worldData, csvText]) => {
        setWorldData(worldData)
        
        // Parse CSV with proper header parsing
        const lines = csvText.trim().split('\n')
        const header = lines[0].split(',')
        
        // Find column indices
        let entityIdx = -1, codeIdx = -1, yearIdx = -1, mortalityIdx = -1
        header.forEach((col, idx) => {
          const trimmed = col.trim()
          if (trimmed === 'Entity') entityIdx = idx
          if (trimmed === 'Code') codeIdx = idx
          if (trimmed === 'Year') yearIdx = idx
          if (trimmed.includes('Under-five mortality')) mortalityIdx = idx
        })

        console.log('CSV header indices:', { entityIdx, codeIdx, yearIdx, mortalityIdx })

        // Parse data rows
        const dataByCode: { [code: string]: { year: number; value: number; entity: string } } = {}
        
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim()
          if (!line) continue
          
          const parts = line.split(',')
          if (parts.length > Math.max(entityIdx, codeIdx, yearIdx, mortalityIdx)) {
            const entity = parts[entityIdx]?.trim() || ''
            const code = parts[codeIdx]?.trim() || ''
            const yearStr = parts[yearIdx]?.trim() || ''
            const mortalityStr = parts[mortalityIdx]?.trim() || ''
            
            const year = parseInt(yearStr)
            const mortality = parseFloat(mortalityStr)
            
            // Skip region aggregates and invalid data
            if (code && !isNaN(mortality) && !isNaN(year) && code.length === 3) {
              // Keep the latest year for each country
              const existing = dataByCode[code]
              if (!existing || existing.year < year) {
                dataByCode[code] = { year, value: mortality, entity }
              }
            }
          }
        }
        
        console.log('Parsed mortality data for countries:', Object.keys(dataByCode).length)
        console.log('Sample data:', Object.entries(dataByCode).slice(0, 5))

        // Create mortality object using code as key
        const mortality: MortalityData = {}
        Object.entries(dataByCode).forEach(([code, data]) => {
          mortality[code] = data.value
        })
        
        setMortalityData(mortality)
        setLoading(false)
      })
      .catch(err => {
        console.error('Failed to load data:', err)
        setLoading(false)
      })
  }, [])

  // Build country features and labels
  useEffect(() => {
    if (!worldData || !svgRef.current) return

    loadTopojson()
      .then((topojson: any) => {
        if (!topojson || !worldData.objects?.countries) return
        const projection = d3.geoMercator().fitSize([width, height], { type: 'Sphere' } as any)
        const path = d3.geoPath(projection)
        pathRef.current = path

        const features = topojson.feature(worldData, worldData.objects.countries).features
        setCountries(features)

        const areas = features.map((f: any) => d3.geoArea(f))
        const extent = d3.extent(areas) as [number | undefined, number | undefined]
        const minArea = extent[0] ?? 0
        const maxArea = extent[1] ?? 1
        const sizeScale = d3.scaleSqrt().domain([minArea, maxArea]).range([6, 18])

        // Helper function to get the largest polygon for label placement
        const getLargestPolygonFeature = (feature: any) => {
          if (feature.geometry.type === 'Polygon') {
            return feature
          } else if (feature.geometry.type === 'MultiPolygon') {
            const polygons = feature.geometry.coordinates.map((coords: any) => ({
              type: 'Feature',
              geometry: { type: 'Polygon', coordinates: coords },
              properties: feature.properties
            }))
            
            let maxArea = 0
            let largestPolygon = polygons[0]
            
            polygons.forEach((poly: any) => {
              const area = d3.geoArea(poly)
              if (area > maxArea) {
                maxArea = area
                largestPolygon = poly
              }
            })
            
            return largestPolygon
          }
          return feature
        }

        const labelData: LabelDatum[] = features.map((f: any, idx: number) => {
          const name = f.properties.name || `${f.id}`
          const largestPoly = getLargestPolygonFeature(f)
          const centroid = path.centroid(largestPoly) as [number, number]
          const bounds = path.bounds(largestPoly)
          const bw = bounds[1][0] - bounds[0][0]
          const bh = bounds[1][1] - bounds[0][1]
          const base = sizeScale(areas[idx]) || 8
          const widthLimited = (bw / Math.max(4, name.length)) * 1.4
          const heightLimited = bh * 0.6
          const fontSize = Math.max(2, Math.min(18, Math.min(base, widthLimited, heightLimited)))
          return {
            id: f.id,
            name,
            centroid,
            fontSize
          }
        })
        setLabels(labelData)
      })
      .catch(err => console.error('Failed to load topojson:', err))
  }, [worldData, width, height])

  useEffect(() => {
    if (!svgRef.current || !worldData || loading || !countries.length || !pathRef.current) return

    // Circle parameters for drag feedback
    const DRAG_CIRCLE_RADIUS = 12.5
    const circleCircumference = 2 * Math.PI * DRAG_CIRCLE_RADIUS
    console.log('Circle circumference:', circleCircumference)

    // Create SVG
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    // Create defs for filters
    const defs = svg.append('defs')
    
    // Radial gradient for vignette shadow
    const vignetteGradient = defs.append('radialGradient')
      .attr('id', 'vignetteGradient')
      .attr('cx', '50%')
      .attr('cy', '50%')
      .attr('r', '60%')
    
    vignetteGradient.append('stop')
      .attr('offset', '0%')
      .attr('stop-color', '#000')
      .attr('stop-opacity', '0')
      .attr('id', 'vignetteInner')
    
    vignetteGradient.append('stop')
      .attr('offset', '100%')
      .attr('stop-color', '#000')
      .attr('stop-opacity', '0.4')
      .attr('id', 'vignetteOuter')

    const pad = 120
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 16])
      .translateExtent([[-pad, -pad], [width + pad, height + pad]])
      .on('start', event => {
        dragStartRef.current = { x: event.transform.x, y: event.transform.y, k: event.transform.k }
        dragDistanceRef.current = 0
        lastDragPosRef.current = { x: event.transform.x, y: event.transform.y }
        hadDragRef.current = false
        
        // Only draw drag circle and play sound for mouse drag, not for wheel zoom
        const isWheel = event.sourceEvent?.type === 'wheel'
        
        // Check if click target is a country path (SVG path element)
        const target = event.sourceEvent?.target as HTMLElement
        const isCountryClick = target && target.tagName === 'path'
        shouldDrawCircleRef.current = !isCountryClick
        
        if (!isWheel && !isCountryClick) {
          // Play drag start sound
          playDragStartSound()
          
          // Get mouse position relative to SVG
          const svgNode = svg.node() as SVGSVGElement
          const mousePos = d3.pointer(event.sourceEvent, svgNode)
          
          // Debug logs
          console.log('Mouse pos from d3.pointer:', mousePos)
          console.log('SVG node:', svgNode)
          console.log('SVG viewBox:', svgNode.getAttribute('viewBox'))
          console.log('Event sourceEvent:', event.sourceEvent?.type)
          
          d3.select('#dragCircle')
            .attr('cx', mousePos[0])
            .attr('cy', mousePos[1])
            .attr('opacity', 1)
            .attr('stroke-dashoffset', circleCircumference)
            .attr('r', DRAG_CIRCLE_RADIUS) // Ensure radius is set
            .interrupt('draw') // Cancel any previous draw transition
            .transition('draw') // Named transition for draw animation
            .duration(250)
            .attr('stroke-dashoffset', 0)
            .on('end', () => {
              console.log('Circle draw animation completed')
            })
            // Keep circle visible after drawing completes, don't fade out automatically
        }
        
        svg.style('cursor', 'grabbing')
        g.attr('opacity', 0.95)
        d3.select('#vignetteOverlay').transition().duration(100).attr('opacity', '0.5')
        d3.select('#dragBorder').transition().duration(100).attr('opacity', '1')
        d3.select('#crosshair').transition().duration(100).attr('opacity', '0.8')
        // Show all four arrows at half opacity
        d3.select('#arrowUp').transition().duration(100).attr('opacity', '0.3')
        d3.select('#arrowDown').transition().duration(100).attr('opacity', '0.3')
        d3.select('#arrowLeft').transition().duration(100).attr('opacity', '0.3')
        d3.select('#arrowRight').transition().duration(100).attr('opacity', '0.3')
      })
      .on('zoom', zoomed)
      .on('end', () => {
        if (hadDragRef.current) {
          playReleaseSound()
        }
        svg.style('cursor', 'grab')
        g.attr('opacity', 1)
        d3.select('#vignetteOverlay').transition().duration(300).attr('opacity', '0')
        d3.select('#dragBorder').transition().duration(300).attr('opacity', '0')
        d3.select('#crosshair').transition().duration(200).attr('opacity', '0')
        
        // Only animate drag circle if it was drawn (not a country click)
        if (shouldDrawCircleRef.current) {
          // Scale up and fade out drag circle when mouse is released
          const dragCircle = d3.select('#dragCircle')
          console.log('End event - current circle opacity:', dragCircle.attr('opacity'))
          dragCircle
            .interrupt('draw') // Interrupt only the draw transition
            .interrupt('fadeout') // Cancel any previous fadeout
            .transition('fadeout') // Named transition for fadeout
            .duration(500)
            .attr('opacity', 0)
            .attr('r', DRAG_CIRCLE_RADIUS * 1.5) // Scale up by 1.5x
            .on('end', () => {
              console.log('Circle fadeout animation completed')
              d3.select('#dragCircle')
                .attr('r', DRAG_CIRCLE_RADIUS) // Reset radius for next time
                .attr('opacity', 0) // Ensure opacity is 0
            })
        } else {
          // If country was clicked, just make sure circle is hidden
          d3.select('#dragCircle').attr('opacity', 0)
        }
        // Hide all four arrows
        d3.select('#arrowUp').transition().duration(200).attr('opacity', '0')
        d3.select('#arrowDown').transition().duration(200).attr('opacity', '0')
        d3.select('#arrowLeft').transition().duration(200).attr('opacity', '0')
        d3.select('#arrowRight').transition().duration(200).attr('opacity', '0')
        dragStartRef.current = null
        lastDragPosRef.current = null
        dragDistanceRef.current = 0
        hadDragRef.current = false
      })
    
    svg
      .attr('viewBox', [0, 0, width, height])
      .attr('width', width)
      .attr('height', height)
      .attr('style', 'max-width: 100%; height: auto; border: 1px solid #ddd; border-radius: 4px; cursor: grab;')
      .on('click', reset)
      .on('mouseenter', () => {
        svg.style('cursor', 'grab')
      })
      .on('mouseleave', () => {
        svg.style('cursor', 'default')
      })

    const path = pathRef.current
    const g = svg.append('g')

    // Title
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 25)
      .attr('text-anchor', 'middle')
      .style('font-size', '18px')
      .style('font-weight', 'bold')
      .style('fill', '#333')
      .style('pointer-events', 'none')
      .text('Child Mortality Rate by Country (Latest Data) - Juicy Edition')

    const countriesGroup = g.append('g')
      .attr('cursor', 'pointer')
    const labelsGroup = g.append('g')

    g.insert('circle', ':first-child')
      .attr('cx', width / 2)
      .attr('cy', height / 2)
      .attr('r', Math.max(width, height))
      .attr('fill', '#c8e6f5')

    // Color scale - calculate after data loads
    const mortalityValuesForScale = Object.values(mortalityData).filter(v => v > 0)
    // Quantile bins produce clearer separation across countries (equal-count buckets)
    const quantileDomain = mortalityValuesForScale.length > 0 ? mortalityValuesForScale : [0, 1]
    const colorScale = d3.scaleQuantile<string>()
      .domain(quantileDomain)
      .range(['#2ecc71', '#1abc9c', '#3498db', '#8e44ad', '#e84393', '#e74c3c'])

    svg.call(zoom)

    const renderCountries = () => {
      const paths = countriesGroup.selectAll('path')
        .data(countries)
        .join('path')
        .attr('d', path as any)
        .attr('fill', (d: any) => {
          const countryCode = idToCode[d.id]
          const mortality = countryCode ? mortalityData[countryCode] : undefined
          return mortality !== undefined ? colorScale(mortality) : '#bdc3c7'
        })
        .attr('stroke', (d: any) => selectedRef.current.has(d.id) ? '#fff' : '#545454')
        .attr('stroke-width', (d: any) => selectedRef.current.has(d.id) ? 1 : 0.4)
        .attr('opacity', (d: any) => selectedRef.current.has(d.id) ? 1 : 0.85)
        .attr('filter', (d: any) => selectedRef.current.has(d.id) ? 'drop-shadow(0 0 8px rgba(180,180,180,0.5))' : 'none')
        .on('click', clicked)
        .on('mouseover', function (_event: any, d: any) {
          const countryCode = idToCode[d.id]
          const mortality = countryCode ? mortalityData[countryCode] : undefined
          if (mortality !== undefined) {
            playHoverSound()
            setHoveredCountry({ id: d.id, name: d.properties.name || `${d.id}`, mortality })
            d3.select(this)
              .transition()
              .duration(200)
              .ease(d3.easeCubicOut)
              .attr('opacity', 1)
              .attr('filter', 'drop-shadow(0 0 12px rgba(180,180,180,0.6))')
          }
        })
        .on('mouseout', function (_event: any, d: any) {
          const isSelected = selectedRef.current.has(d.id)
          setHoveredCountry(null)
          d3.select(this)
            .transition()
            .duration(200)
            .ease(d3.easeCubicOut)
            .attr('opacity', isSelected ? 1 : 0.85)
            .attr('filter', isSelected ? 'drop-shadow(0 0 8px rgba(180,180,180,0.5))' : 'none')
        })

      paths.select('title').remove()
      paths.append('title')
        .text((d: any) => {
          const countryCode = idToCode[d.id]
          const mortality = countryCode ? mortalityData[countryCode] : undefined
          return mortality !== undefined 
            ? `${d.properties.name || d.id}: ${mortality.toFixed(2)} deaths per 100 live births`
            : `${d.properties.name || d.id}: No data`
        })
    }

    renderCountries()

    labelsGroup.selectAll('text')
      .data(labels)
      .join('text')
      .attr('class', 'country-label')
      .attr('x', d => d.centroid[0])
      .attr('y', d => d.centroid[1])
      .attr('text-anchor', 'middle')
      .style('font-size', d => `${d.fontSize}px`)
      .text(d => d.name)

    svg.append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', width)
      .attr('height', height)
      .attr('fill', 'url(#vignetteGradient)')
      .attr('pointer-events', 'none')
      .attr('id', 'vignetteOverlay')
      .attr('opacity', 0)

    // Orange-red inner border for drag feedback
    svg.append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', width)
      .attr('height', height)
      .attr('fill', 'none')
      .attr('stroke', '#ff6347')
      .attr('stroke-width', 8)
      .style('stroke-linecap', 'round')
      .style('stroke-linejoin', 'round')
      .attr('pointer-events', 'none')
      .attr('id', 'dragBorder')
      .attr('opacity', 0)

    // Crosshair in center for motion reference
    const crosshair = svg.append('g')
      .attr('id', 'crosshair')
      .attr('pointer-events', 'none')
      .attr('opacity', 0)
    
    const crosshairSize = 20
    const crosshairGap = 4
    
    // Left line with black outline
    crosshair.append('line')
      .attr('x1', width / 2 - crosshairSize)
      .attr('y1', height / 2)
      .attr('x2', width / 2 - crosshairGap)
      .attr('y2', height / 2)
      .attr('stroke', '#000')
      .attr('stroke-width', 3)
    crosshair.append('line')
      .attr('x1', width / 2 - crosshairSize)
      .attr('y1', height / 2)
      .attr('x2', width / 2 - crosshairGap)
      .attr('y2', height / 2)
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.5)
    
    // Right line with black outline
    crosshair.append('line')
      .attr('x1', width / 2 + crosshairGap)
      .attr('y1', height / 2)
      .attr('x2', width / 2 + crosshairSize)
      .attr('y2', height / 2)
      .attr('stroke', '#000')
      .attr('stroke-width', 3)
    crosshair.append('line')
      .attr('x1', width / 2 + crosshairGap)
      .attr('y1', height / 2)
      .attr('x2', width / 2 + crosshairSize)
      .attr('y2', height / 2)
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.5)
    
    // Top line with black outline
    crosshair.append('line')
      .attr('x1', width / 2)
      .attr('y1', height / 2 - crosshairSize)
      .attr('x2', width / 2)
      .attr('y2', height / 2 - crosshairGap)
      .attr('stroke', '#000')
      .attr('stroke-width', 3)
    crosshair.append('line')
      .attr('x1', width / 2)
      .attr('y1', height / 2 - crosshairSize)
      .attr('x2', width / 2)
      .attr('y2', height / 2 - crosshairGap)
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.5)
    
    // Bottom line with black outline
    crosshair.append('line')
      .attr('x1', width / 2)
      .attr('y1', height / 2 + crosshairGap)
      .attr('x2', width / 2)
      .attr('y2', height / 2 + crosshairSize)
      .attr('stroke', '#000')
      .attr('stroke-width', 3)
    crosshair.append('line')
      .attr('x1', width / 2)
      .attr('y1', height / 2 + crosshairGap)
      .attr('x2', width / 2)
      .attr('y2', height / 2 + crosshairSize)
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.5)
    
    // Center dot with black outline
    crosshair.append('circle')
      .attr('cx', width / 2)
      .attr('cy', height / 2)
      .attr('r', 2.5)
      .attr('fill', '#000')
    crosshair.append('circle')
      .attr('cx', width / 2)
      .attr('cy', height / 2)
      .attr('r', 1.5)
      .attr('fill', '#fff')

    // Drag start circle element (appears when dragging starts)
    svg.append('circle')
      .attr('id', 'dragCircle')
      .attr('r', DRAG_CIRCLE_RADIUS)
      .attr('fill', 'none')
      .attr('stroke', '#fff')
      .attr('stroke-width', 4)
      .attr('opacity', 0)
      .attr('pointer-events', 'none')
      .attr('stroke-dasharray', circleCircumference) // Use precise circumference
      .attr('stroke-dashoffset', circleCircumference) // Start with full offset
      .attr('stroke-linecap', 'round')

    // Four directional arrows at viewport edges
    const arrowMargin = 40
    
    // Top arrow (pointing up)
    const arrowUp = svg.append('g')
      .attr('id', 'arrowUp')
      .attr('transform', `translate(${width / 2}, ${arrowMargin}) rotate(0)`)
      .attr('pointer-events', 'none')
      .attr('opacity', 0)
    arrowUp.append('polygon')
      .attr('points', '0,-15 10,10 0,5 -10,10')
      .attr('fill', '#fff')
      .attr('stroke', '#000')
      .attr('stroke-width', 2)
    
    // Bottom arrow (pointing down)
    const arrowDown = svg.append('g')
      .attr('id', 'arrowDown')
      .attr('transform', `translate(${width / 2}, ${height - arrowMargin}) rotate(180)`)
      .attr('pointer-events', 'none')
      .attr('opacity', 0)
    arrowDown.append('polygon')
      .attr('points', '0,-15 10,10 0,5 -10,10')
      .attr('fill', '#fff')
      .attr('stroke', '#000')
      .attr('stroke-width', 2)
    
    // Left arrow (pointing left)
    const arrowLeft = svg.append('g')
      .attr('id', 'arrowLeft')
      .attr('transform', `translate(${arrowMargin}, ${height / 2}) rotate(-90)`)
      .attr('pointer-events', 'none')
      .attr('opacity', 0)
    arrowLeft.append('polygon')
      .attr('points', '0,-15 10,10 0,5 -10,10')
      .attr('fill', '#fff')
      .attr('stroke', '#000')
      .attr('stroke-width', 2)
    
    // Right arrow (pointing right)
    const arrowRight = svg.append('g')
      .attr('id', 'arrowRight')
      .attr('transform', `translate(${width - arrowMargin}, ${height / 2}) rotate(90)`)
      .attr('pointer-events', 'none')
      .attr('opacity', 0)
    arrowRight.append('polygon')
      .attr('points', '0,-15 10,10 0,5 -10,10')
      .attr('fill', '#fff')
      .attr('stroke', '#000')
      .attr('stroke-width', 2)

    // Four corner zoom arrows (different style - double arrow)
    // Removed: corner zoom arrows
    // The corner arrows have been disabled in favor of drag-start circle effect

    function reset() {
      playReleaseSound()
      setCurrentZoom(1)
      
      countriesGroup.selectAll('path')
        .transition()
        .duration(300)
        .attr('opacity', (d: any) => selectedRef.current.has(d.id) ? 1 : 0.85)
        .attr('filter', (d: any) => selectedRef.current.has(d.id) ? 'drop-shadow(0 0 8px rgba(180,180,180,0.5))' : 'none')
      
      svg
        .transition()
        .duration(800)
        .ease(d3.easeCubicInOut)
        .call(
          zoom.transform,
          d3.zoomIdentity,
          d3.zoomTransform(svg.node() as SVGSVGElement).invert([width / 2, height / 2])
        )
    }

    function clicked(event: MouseEvent, d: any) {
      event.stopPropagation()
      playClickSound()

      // Check if this country is already selected (before the toggle)
      const isCurrentlySelected = selectedRef.current.has(d.id)

      setSelectedIds(prev => {
        const next = new Set(prev)
        if (next.has(d.id)) {
          next.delete(d.id)
        } else {
          next.add(d.id)
        }
        selectedRef.current = next
        renderCountries()
        return Array.from(next)
      })

      const bounds = path.bounds(d)
      const x0 = bounds[0][0]
      const y0 = bounds[0][1]
      const x1 = bounds[1][0]
      const y1 = bounds[1][1]
      countriesGroup.selectAll('path')
        .transition()
        .attr('opacity', (d: any) => selectedRef.current.has(d.id) ? 1 : 0.85)
        .attr('filter', (d: any) => selectedRef.current.has(d.id) ? 'drop-shadow(0 0 8px rgba(180,180,180,0.5))' : 'none')
      
      const countryCode = idToCode[d.id]
      const mortality = countryCode ? mortalityData[countryCode] : undefined
      if (mortality !== undefined) {
        setHoveredCountry({ id: d.id, name: d.properties.name || d.id, mortality })
      }
      
      d3.select(event.target as SVGPathElement)
        .transition()
        .duration(200)
        .attr('opacity', 1)

      // Only focus on newly selected countries, not on deselected ones
      if (!isCurrentlySelected) {
        const scale = Math.min(8, 0.9 / Math.max((x1 - x0) / width, (y1 - y0) / height))
        const newTransform = d3.zoomIdentity
          .translate(width / 2, height / 2)
          .scale(scale)
          .translate(-(x0 + x1) / 2, -(y0 + y1) / 2)

        // Apply the transformation to g element directly for smooth focus
        g.transition()
          .duration(600)
          .ease(d3.easeCubicInOut)
          .attr('transform', newTransform.toString())
      }
    }

    function zoomed(event: any) {
      const { transform } = event
      const newZoomLevel = transform.k
      const isWheel = event.sourceEvent?.type === 'wheel'

      if (!isWheel && dragStartRef.current) {
        // Update drag circle position to follow mouse cursor only if it should be drawn
        if (shouldDrawCircleRef.current) {
          const mousePos = d3.pointer(event.sourceEvent, svg.node() as SVGSVGElement)
          console.log('Zoomed - Mouse pos:', mousePos)
          d3.select('#dragCircle')
            .attr('cx', mousePos[0])
            .attr('cy', mousePos[1])
        }
        
        const last = lastDragPosRef.current || { x: transform.x, y: transform.y }
        const dx = transform.x - last.x
        const dy = transform.y - last.y
        const delta = Math.hypot(dx, dy)
        
        dragDistanceRef.current += delta
        lastDragPosRef.current = { x: transform.x, y: transform.y }
        
        const step = 30 // pixel-ish threshold for a "small move" cue
        while (dragDistanceRef.current >= step) {
          playGrabSound()
          dragDistanceRef.current -= step
          hadDragRef.current = true
          
          // Flash arrows in sync with sound effect
          const absDx = Math.abs(dx)
          const absDy = Math.abs(dy)
          
          // Reset all arrows to dim white
          d3.select('#arrowUp').attr('opacity', '0.3')
          d3.select('#arrowUp polygon').attr('fill', '#fff')
          d3.select('#arrowDown').attr('opacity', '0.3')
          d3.select('#arrowDown polygon').attr('fill', '#fff')
          d3.select('#arrowLeft').attr('opacity', '0.3')
          d3.select('#arrowLeft polygon').attr('fill', '#fff')
          d3.select('#arrowRight').attr('opacity', '0.3')
          d3.select('#arrowRight polygon').attr('fill', '#fff')
          
          // Flash arrows based on drag direction (reversed to match visual direction)
          if (absDy > absDx * 0.3) {
            // Vertical movement is significant
            if (dy > 0) {
              // Transform moved down, map moved up - show up arrow
              d3.select('#arrowUp').transition().duration(150).attr('opacity', '1')
                .transition().duration(150).attr('opacity', '0.3')
              d3.select('#arrowUp polygon').transition().duration(150).attr('fill', '#ffdd00')
                .transition().duration(150).attr('fill', '#fff')
            } else {
              // Transform moved up, map moved down - show down arrow
              d3.select('#arrowDown').transition().duration(150).attr('opacity', '1')
                .transition().duration(150).attr('opacity', '0.3')
              d3.select('#arrowDown polygon').transition().duration(150).attr('fill', '#ffdd00')
                .transition().duration(150).attr('fill', '#fff')
            }
          }
          
          if (absDx > absDy * 0.3) {
            // Horizontal movement is significant
            if (dx > 0) {
              // Transform moved right, map moved left - show left arrow
              d3.select('#arrowLeft').transition().duration(150).attr('opacity', '1')
                .transition().duration(150).attr('opacity', '0.3')
              d3.select('#arrowLeft polygon').transition().duration(150).attr('fill', '#ffdd00')
                .transition().duration(150).attr('fill', '#fff')
            } else {
              // Transform moved left, map moved right - show right arrow
              d3.select('#arrowRight').transition().duration(150).attr('opacity', '1')
                .transition().duration(150).attr('opacity', '0.3')
              d3.select('#arrowRight polygon').transition().duration(150).attr('fill', '#ffdd00')
                .transition().duration(150).attr('fill', '#fff')
            }
          }
        }
      }

      if (isWheel && Math.abs(newZoomLevel - currentZoom) > 0.02) {
        playZoomSound()
      }

      setCurrentZoom(newZoomLevel)
      setViewTransform({ x: transform.x, y: transform.y, k: transform.k })
      
      g.attr('transform', transform)
      g.attr('stroke-width', 0.5 / transform.k)
      
      // Add subtle visual feedback during zoom
      g.attr('opacity', 0.98)
    }

  }, [worldData, width, height, loading, mortalityData, countries, labels, idToCode])

  const clearSelection = () => {
    selectedRef.current = new Set()
    setSelectedIds([])
    if (svgRef.current) {
      d3.select(svgRef.current).selectAll('path')
        .transition()
        .attr('opacity', 0.85)
        .attr('filter', 'none')
        .attr('stroke', '#545454')
        .attr('stroke-width', 0.4)
    }
  }

  if (loading) {
    return (
      <div ref={containerRef} className="globe-container">
        <div style={{ padding: '20px', textAlign: 'center' }}>Loading world map and child mortality data...</div>
      </div>
    )
  }

  const selectedList = selectedIds
    .map(id => ({ id, code: idToCode[id], label: labelLookup.get(id) }))
    .filter(item => item.code && item.label)

  const projectPoint = (point: [number, number]) => {
    const { x, y, k } = viewTransform
    return [point[0] * k + x, point[1] * k + y]
  }

  return (
    <div ref={containerRef} className="globe-container">
      <div className="globe-canvas-wrapper">
        <svg ref={svgRef} className="globe-svg"></svg>
        <div className="globe-overlay">
          {selectedList.map(({ id, label, code }) => {
            const mortality = code ? mortalityData[code] : undefined
            if (!label || mortality === undefined) return null
            const [px, py] = projectPoint(label.centroid)
            return (
              <div className="globe-popup" key={`popup-${id}`} style={{ left: px, top: py - 8 }}>
                <div className="title">{label.name}</div>
                <div className="metric">{mortality.toFixed(2)} deaths per 100 live births</div>
              </div>
            )
          })}
        </div>
      </div>
      <div className="globe-info">
        <div style={{ marginBottom: '10px' }}>
          {hoveredCountry ? (
            <div>
              <strong>{hoveredCountry.name}</strong>: {hoveredCountry.mortality.toFixed(2)} deaths per 100 live births
              {selectedRef.current.has(hoveredCountry.id) && <span style={{ marginLeft: '10px', color: '#00a0ff' }}>★ Selected</span>}
            </div>
          ) : (
            <p>🖱️ Drag to pan • Scroll to zoom • Click anywhere to reset</p>
          )}
        </div>
        <div style={{ fontSize: '12px', color: '#666' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '20px', height: '20px', backgroundColor: '#2ecc71' }}></div>
            <span>Low mortality</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '5px 0' }}>
            <div style={{ width: '20px', height: '20px', backgroundColor: '#1abc9c' }}></div>
            <span>Low-medium mortality</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '5px 0' }}>
            <div style={{ width: '20px', height: '20px', backgroundColor: '#3498db' }}></div>
            <span>Medium mortality</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '5px 0' }}>
            <div style={{ width: '20px', height: '20px', backgroundColor: '#8e44ad' }}></div>
            <span>Medium-high mortality</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '5px 0' }}>
            <div style={{ width: '20px', height: '20px', backgroundColor: '#e84393' }}></div>
            <span>High mortality</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '5px 0' }}>
            <div style={{ width: '20px', height: '20px', backgroundColor: '#e74c3c' }}></div>
            <span>Extreme high mortality</span>
          </div>
          
          <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px solid #ddd' }}>
            <div style={{ marginBottom: '10px', fontWeight: 'bold', color: '#333' }}>
              Zoom: {currentZoom.toFixed(1)}x
              <div style={{
                width: '100%',
                height: '4px',
                backgroundColor: '#e0e0e0',
                borderRadius: '2px',
                marginTop: '5px',
                overflow: 'hidden'
              }}>
                <div style={{
                  height: '100%',
                  backgroundColor: '#00a0ff',
                  width: `${((currentZoom - 1) / 15) * 100}%`,
                  transition: 'width 0.3s ease'
                }}></div>
              </div>
            </div>
          </div>
          
          <div className="selected-list">
            <h4>Selected Countries ({selectedList.length})</h4>
            {selectedList.length === 0 && <div style={{ color: '#888' }}>No countries selected.</div>}
            {selectedList.map(({ id, label, code }) => {
              const mortality = code ? mortalityData[code] : undefined
              return (
                <div className="selected-item" key={`sel-${id}`}>
                  <span>{label?.name}</span>
                  {mortality !== undefined && <span>{mortality.toFixed(2)}</span>}
                </div>
              )
            })}
            {selectedList.length > 0 && (
              <button 
                onClick={clearSelection}
                style={{
                  padding: '5px 10px',
                  backgroundColor: '#00a0ff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  marginTop: '8px'
                }}
              >
                Clear Selection ({selectedList.length})
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ExploreJuicy
