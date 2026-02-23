import { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import { parseCsv, toNumber } from '../utils/csv'
import './Explore.css'

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

const BASE_MAP_WIDTH = 975
const BASE_MAP_HEIGHT = 610
const MAP_ASPECT_RATIO = BASE_MAP_HEIGHT / BASE_MAP_WIDTH
const MIN_MAP_WIDTH = 320
const MAX_MAP_WIDTH = 1700
const HEIGHT_SCALE = 0.7
const MIN_MAP_HEIGHT = 260
const MIN_MAX_HEIGHT = 420
const MAX_HEIGHT_RATIO = 0.78

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

function Explore() {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasHostRef = useRef<HTMLDivElement>(null)
  const projectionRef = useRef<d3.GeoProjection | null>(null)
  const pathRef = useRef<d3.GeoPath<any, d3.GeoPermissibleObjects> | null>(null)
  const selectedRef = useRef<Set<number>>(new Set())
  const [worldData, setWorldData] = useState<any>(null)
  const [countries, setCountries] = useState<any[]>([])
  const [labels, setLabels] = useState<LabelDatum[]>([])
  const [mortalityData, setMortalityData] = useState<MortalityData>({})
  const [loading, setLoading] = useState(true)
  const [hoveredCountry, setHoveredCountry] = useState<{ name: string; mortality: number } | null>(null)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [viewTransform, setViewTransform] = useState<{ x: number; y: number; k: number }>({ x: 0, y: 0, k: 1 })
  const [mapSize, setMapSize] = useState({ width: BASE_MAP_WIDTH, height: BASE_MAP_HEIGHT })
  const { width, height } = mapSize

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

  useEffect(() => {
    const host = canvasHostRef.current
    if (!host || typeof ResizeObserver === 'undefined') return

    const updateSize = () => {
      const hostWidth = host.clientWidth
      if (!hostWidth) return

      const nextWidth = Math.max(MIN_MAP_WIDTH, Math.min(MAX_MAP_WIDTH, Math.round(hostWidth)))
      const baseMapHeight = Math.round(nextWidth * MAP_ASPECT_RATIO)
      const scaledHeight = Math.round(baseMapHeight * HEIGHT_SCALE)
      const containerHeightSource =
        containerRef.current?.parentElement?.clientHeight ||
        containerRef.current?.clientHeight ||
        window.innerHeight
      const maxH = Math.max(MIN_MAX_HEIGHT, Math.floor(containerHeightSource * MAX_HEIGHT_RATIO))
      const nextHeight = Math.max(MIN_MAP_HEIGHT, Math.min(scaledHeight, maxH))
      setMapSize(prev =>
        prev.width === nextWidth && prev.height === nextHeight
          ? prev
          : { width: nextWidth, height: nextHeight }
      )
    }

    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(host)
    if (containerRef.current) {
      observer.observe(containerRef.current)
    }
    if (containerRef.current?.parentElement) {
      observer.observe(containerRef.current.parentElement)
    }
    return () => observer.disconnect()
  }, [loading])

  useEffect(() => {
    setViewTransform({ x: 0, y: 0, k: 1 })
  }, [width, height])

  // Load world TopoJSON data and child mortality data
  useEffect(() => {
    Promise.all([
      fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json').then(res => res.json()),
      fetch(`${import.meta.env.BASE_URL}child-mortality.csv`).then(res => res.text())
    ])
      .then(([world, csvText]) => {
        setWorldData(world)

        const rows = parseCsv(csvText)
        const mortalityColumn = rows.columns.find(column => column.trim().includes('Under-five mortality')) ?? ''

        const dataByCode: { [code: string]: { year: number; value: number; entity: string } } = {}
        rows.forEach(row => {
          const code = (row.Code ?? '').trim()
          const year = Number.parseInt((row.Year ?? '').trim(), 10)
          const mortality = mortalityColumn ? toNumber((row[mortalityColumn] ?? '').trim()) : null
          const entity = (row.Entity ?? '').trim()
          if (code && mortality !== null && !Number.isNaN(year) && code.length === 3) {
            const existing = dataByCode[code]
            if (!existing || existing.year < year) {
              dataByCode[code] = { year, value: mortality, entity }
            }
          }
        })

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

  // Build country features and labels once topojson + projection are ready
  useEffect(() => {
    if (!worldData || !svgRef.current) return

    loadTopojson()
      .then((topojson: any) => {
        if (!topojson || !worldData.objects?.countries) return
        const projection = d3.geoMercator().fitSize([width, height], { type: 'Sphere' } as any)
        projectionRef.current = projection
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
    if (!svgRef.current || !worldData || loading || !projectionRef.current || !pathRef.current || !countries.length) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const g = svg.append('g')
    const countriesGroup = g.append('g').attr('cursor', 'pointer')
    const labelsGroup = g.append('g')

    const pad = 120
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 16])
      .translateExtent([[-pad, -pad], [width + pad, height + pad]])
      .on('zoom', zoomed)

    svg
      .attr('viewBox', [0, 0, width, height])
      .attr('width', width)
      .attr('height', height)
      .on('click', reset)
      .call(zoom)

    // Title
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 25)
      .attr('text-anchor', 'middle')
      .style('font-size', '18px')
      .style('font-weight', 'bold')
      .style('fill', '#333')
      .style('pointer-events', 'none')
      .text('Child Mortality Rate by Country (Latest Data)')

    // Water background
    g.insert('circle', ':first-child')
      .attr('cx', width / 2)
      .attr('cy', height / 2)
      .attr('r', Math.max(width, height))
      .attr('fill', '#c8e6f5')

    const mortalityValuesForScale = Object.values(mortalityData).filter(v => v > 0)
    // Quantile bins produce clearer separation across countries (equal-count buckets)
    const quantileDomain = mortalityValuesForScale.length > 0 ? mortalityValuesForScale : [0, 1]
    const colorScale = d3.scaleQuantile<string>()
      .domain(quantileDomain)
      .range(['#2ecc71', '#1abc9c', '#3498db', '#8e44ad', '#e84393', '#e74c3c'])

    const path = pathRef.current

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
        .on('click', clicked)
        .on('mouseover', function (_event: any, d: any) {
          const countryCode = idToCode[d.id]
          const mortality = countryCode ? mortalityData[countryCode] : undefined
          if (mortality !== undefined) {
            setHoveredCountry({ name: d.properties.name || `${d.id}`, mortality })
            d3.select(this)
              .transition()
              .duration(100)
              .attr('opacity', 1)
          }
        })
        .on('mouseout', function () {
          setHoveredCountry(null)
          d3.select(this)
            .transition()
            .duration(100)
            .attr('opacity', (d: any) => selectedRef.current.has(d.id) ? 1 : 0.85)
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

    function reset() {
      svg.transition()
        .duration(750)
        .call(
          zoom.transform,
          d3.zoomIdentity,
          d3.zoomTransform(svg.node() as SVGSVGElement).invert([width / 2, height / 2])
        )
    }

    function clicked(event: MouseEvent, d: any) {
      event.stopPropagation()
      const bounds = path.bounds(d)
      const x0 = bounds[0][0]
      const y0 = bounds[0][1]
      const x1 = bounds[1][0]
      const y1 = bounds[1][1]

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

      const countryCode = idToCode[d.id]
      const mortality = countryCode ? mortalityData[countryCode] : undefined
      if (mortality !== undefined) {
        setHoveredCountry({ name: d.properties.name || d.id, mortality })
      }

      const scale = Math.min(8, 0.9 / Math.max((x1 - x0) / width, (y1 - y0) / height))
      svg
        .transition()
        .duration(750)
        .call(
          zoom.transform,
          d3.zoomIdentity
            .translate(width / 2, height / 2)
            .scale(scale)
            .translate(-(x0 + x1) / 2, -(y0 + y1) / 2),
          d3.pointer(event, svg.node() as SVGSVGElement)
        )
    }

    function zoomed(event: any) {
      const { transform } = event
      setViewTransform({ x: transform.x, y: transform.y, k: transform.k })
      g.attr('transform', transform)
      countriesGroup.selectAll('path')
        .attr('stroke-width', (d: any) => (selectedRef.current.has(d.id) ? 1.2 : 0.5) / transform.k)
    }

  }, [worldData, width, height, loading, mortalityData, countries, labels, idToCode])

  const clearSelection = () => {
    selectedRef.current = new Set()
    setSelectedIds([])
    if (svgRef.current) {
      d3.select(svgRef.current).selectAll('path')
        .attr('opacity', 0.85)
        .attr('stroke', '#545454')
        .attr('stroke-width', 0.4)
    }
  }

  const selectedList = selectedIds
    .map(id => ({ id, code: idToCode[id], label: labelLookup.get(id) }))
    .filter(item => item.code && item.label)

  const projectPoint = (point: [number, number]) => {
    const { x, y, k } = viewTransform
    return [point[0] * k + x, point[1] * k + y]
  }

  if (loading) {
    return (
      <div ref={containerRef} className="globe-container">
        <div style={{ padding: '20px', textAlign: 'center' }}>Loading world map and child mortality data...</div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="globe-container">
      <div className="globe-instruction-bar">
        <div className="globe-instruction-pill">
          Click to select countries | Drag to pan | Scroll to zoom | Click background to reset view
        </div>
      </div>
      <div className="globe-layout">
        <div ref={canvasHostRef} className="globe-canvas-host">
          <div className="globe-canvas-wrapper" style={{ width, height }}>
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
        </div>
        <div className="globe-info" style={{ height }}>
        <div className="globe-hover-status">
          {hoveredCountry ? (
            <div>
              <strong>{hoveredCountry.name}</strong>: {hoveredCountry.mortality.toFixed(2)} deaths per 100 live births
            </div>
          ) : (
            <div className="globe-hover-placeholder">Hover over a country to see details.</div>
          )}
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
            <button onClick={clearSelection} style={{ marginTop: '8px', padding: '6px 10px', cursor: 'pointer' }}>
              Clear selection
            </button>
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
        </div>
      </div>
      </div>
    </div>
  )
}

export default Explore
