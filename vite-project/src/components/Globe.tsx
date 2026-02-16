import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import './Globe.css'

interface GlobeProps {
  width?: number
  height?: number
}

interface MortalityData {
  [countryCode: string]: number
}

// Mapping of country codes to Natural Earth numeric IDs
const CODE_TO_ID: { [code: string]: number } = {
  'AFG': 4, 'ALB': 8, 'DZA': 12, 'AND': 20, 'AGO': 24, 'AIA': 660, 'ATG': 28, 'ARG': 32, 'ARM': 51, 'ABW': 533, 'AUS': 36, 'AUT': 40, 'AZE': 31, 'BHS': 44, 'BHR': 48, 'BGD': 50, 'BRB': 52, 'BLR': 112, 'BEL': 56, 'BLZ': 84, 'BEN': 204, 'BMU': 60, 'BTN': 64, 'BOL': 68, 'BIH': 70, 'BWA': 72, 'BRA': 76, 'BRN': 96, 'BGR': 100, 'BFA': 854, 'BDI': 108, 'KHM': 116, 'CMR': 120, 'CAN': 124, 'CPV': 132, 'CYM': 136, 'CAF': 140, 'TCD': 148, 'CHL': 152, 'CHN': 156, 'CXR': 162, 'CCK': 166, 'COL': 170, 'COM': 174, 'COG': 178, 'COR': 184, 'CIV': 384, 'HRV': 191, 'CUB': 192, 'CYP': 196, 'CZE': 203, 'DNK': 208, 'DJI': 262, 'DMA': 212, 'DOM': 214, 'ECU': 218, 'EGY': 818, 'SLV': 222, 'GNQ': 226, 'ERI': 232, 'EST': 233, 'SWZ': 748, 'ETH': 231, 'FLK': 238, 'FRO': 234, 'FJI': 242, 'FIN': 246, 'FRA': 250, 'PYF': 258, 'GAB': 266, 'GMB': 270, 'GEO': 268, 'DEU': 276, 'GHA': 288, 'GIB': 292, 'GRC': 300, 'GRL': 304, 'GRD': 308, 'GUM': 316, 'GTM': 320, 'GGY': 831, 'GIN': 324, 'GNB': 624, 'GUY': 328, 'HTI': 332, 'HND': 340, 'HKG': 344, 'HUN': 348, 'ISL': 352, 'IND': 356, 'IDN': 360, 'IRN': 364, 'IRQ': 368, 'IRL': 372, 'IMN': 833, 'ISR': 376, 'ITA': 380, 'JAM': 388, 'JPN': 392, 'JEY': 832, 'JOR': 400, 'KAZ': 398, 'KEN': 404, 'KIR': 296, 'KWT': 414, 'KGZ': 417, 'LAO': 418, 'LVA': 428, 'LBN': 422, 'LSO': 426, 'LBR': 430, 'LBY': 434, 'LIE': 438, 'LTU': 440, 'LUX': 442, 'MAC': 446, 'MKD': 807, 'MDG': 450, 'MWI': 454, 'MYS': 458, 'MDV': 462, 'MLI': 466, 'MLT': 470, 'MHL': 584, 'MTQ': 474, 'MRT': 478, 'MUS': 480, 'MYT': 175, 'MEX': 484, 'FSM': 583, 'MDA': 498, 'MCO': 492, 'MNG': 496, 'MNE': 499, 'MAR': 504, 'MOZ': 508, 'MMR': 104, 'NAM': 516, 'NRU': 520, 'NPL': 524, 'NLD': 528, 'NCL': 540, 'NZL': 554, 'NIC': 558, 'NER': 562, 'NGA': 566, 'PRK': 408, 'NMK': 570, 'MNP': 580, 'NOR': 578, 'OMN': 512, 'PAK': 586, 'PLW': 585, 'PSE': 275, 'PAN': 591, 'PNG': 598, 'PRY': 600, 'PER': 604, 'PHL': 608, 'PCN': 612, 'POL': 616, 'PRT': 620, 'PRI': 630, 'QAT': 634, 'ROU': 642, 'RUS': 643, 'RWA': 646, 'SHN': 654, 'KNA': 659, 'LCA': 662, 'MAF': 663, 'SPM': 666, 'VCT': 670, 'WSM': 882, 'SMR': 674, 'STP': 678, 'SAU': 682, 'SEN': 686, 'SRB': 688, 'SYC': 690, 'SLE': 694, 'SGP': 702, 'SVK': 703, 'SVN': 705, 'SLB': 90, 'SOM': 706, 'ZAF': 710, 'KOR': 410, 'SSD': 728, 'ESP': 724, 'LKA': 144, 'SDN': 729, 'SUR': 740, 'SWE': 752, 'CHE': 756, 'SYR': 760, 'TWN': 158, 'TJK': 762, 'TZA': 834, 'THA': 764, 'TLS': 626, 'TGO': 768, 'TON': 776, 'TTO': 780, 'TUN': 788, 'TUR': 792, 'TKM': 795, 'TUV': 798, 'UGA': 800, 'UKR': 804, 'ARE': 784, 'GBR': 826, 'USA': 840, 'URY': 858, 'UZB': 860, 'VUT': 548, 'VEN': 862, 'VNM': 704, 'VGB': 92, 'VIR': 850, 'WLF': 876, 'ESH': 732, 'YEM': 887, 'ZMB': 894, 'ZWE': 716
}


function Globe({ width = 975, height = 610 }: GlobeProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [worldData, setWorldData] = useState<any>(null)
  const [mortalityData, setMortalityData] = useState<MortalityData>({})
  const [loading, setLoading] = useState(true)
  const [hoveredCountry, setHoveredCountry] = useState<{ name: string; mortality: number } | null>(null)

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

  useEffect(() => {
    if (!svgRef.current || !worldData || loading) return

    // Create SVG
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 8])
      .on('zoom', zoomed)

    svg
      .attr('viewBox', [0, 0, width, height])
      .attr('width', width)
      .attr('height', height)
      .attr('style', 'max-width: 100%; height: auto; border: 1px solid #ddd; border-radius: 4px;')
      .on('click', reset)

    const projection = d3.geoMercator()
      .fitSize([width, height], { type: 'Sphere' } as any)

    const path = d3.geoPath(projection)
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
      .text('Child Mortality Rate by Country (Latest Data)')

    const countriesGroup = g.append('g')
      .attr('cursor', 'pointer')

    // Create reverse map: ID -> Country Code
    const idToCode: { [id: number]: string } = {}
    Object.entries(CODE_TO_ID).forEach(([code, id]) => {
      idToCode[id] = code
    })

    // Color scale - calculate after data loads
    const mortalityValuesForScale = Object.values(mortalityData).filter(v => v > 0)
    const mortalityExtentForScale = d3.extent(mortalityValuesForScale) as [number, number]
    const colorScale = d3.scaleLinear<string>()
      .domain([mortalityExtentForScale[0] || 0, mortalityExtentForScale[1] || 100])
      .range(['#2ecc71', '#c0392b'])

    // Extract countries from TopoJSON
    let countries: any[] = []
    if (worldData.objects && worldData.objects.countries) {
      // Load topojson-client library
      const script = document.createElement('script')
      script.src = 'https://cdn.jsdelivr.net/npm/topojson-client@3'
      script.async = true
      script.onload = () => {
        const topojson = (window as any).topojson
        if (topojson) {
          countries = topojson.feature(worldData, worldData.objects.countries).features
          renderCountries()
        }
      }
      document.head.appendChild(script)
    }

    function renderCountries() {
      countriesGroup.selectAll('path')
        .data(countries)
        .join('path')
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
            .attr('opacity', 0.85)
        })
        .attr('d', path as any)
        .attr('fill', (d: any) => {
          const countryCode = idToCode[d.id]
          const mortality = countryCode ? mortalityData[countryCode] : undefined
          return mortality !== undefined ? colorScale(mortality) : '#bdc3c7'
        })
        .attr('stroke', '#545454')
        .attr('stroke-width', 0.2)
        .attr('opacity', 0.85)
        .append('title')
        .text((d: any) => {
          const countryCode = idToCode[d.id]
          const mortality = countryCode ? mortalityData[countryCode] : undefined
          return mortality !== undefined 
            ? `${d.properties.name || d.id}: ${mortality.toFixed(2)} deaths per 100 live births`
            : `${d.properties.name || d.id}: No data`
        })

      // Water background
      g.insert('circle', ':first-child')
        .attr('cx', width / 2)
        .attr('cy', height / 2)
        .attr('r', Math.max(width, height))
        .attr('fill', '#c8e6f5')

      svg.call(zoom)
    }

    // If topojson is already loaded
    if ((window as any).topojson) {
      const topojson = (window as any).topojson
      countries = topojson.feature(worldData, worldData.objects.countries).features
      renderCountries()
    }

    function reset() {
      countriesGroup.selectAll('path')
        .transition()
        .attr('opacity', 0.85)
      svg
        .transition()
        .duration(750)
        .call(
          zoom.transform,
          d3.zoomIdentity,
          d3.zoomTransform(svg.node() as SVGSVGElement).invert([width / 2, height / 2])
        )
    }

    function clicked(event: MouseEvent, d: any) {
      const bounds = path.bounds(d)
      const x0 = bounds[0][0]
      const y0 = bounds[0][1]
      const x1 = bounds[1][0]
      const y1 = bounds[1][1]

      event.stopPropagation()
      countriesGroup.selectAll('path')
        .transition()
        .attr('opacity', 0.85)
      
      const countryCode = idToCode[d.id]
      const mortality = countryCode ? mortalityData[countryCode] : undefined
      if (mortality !== undefined) {
        setHoveredCountry({ name: d.properties.name || d.id, mortality })
      }
      
      d3.select(event.target as SVGPathElement)
        .transition()
        .duration(200)
        .attr('opacity', 1)
        .attr('opacity', 1)

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
      g.attr('transform', transform)
      g.attr('stroke-width', 0.5 / transform.k)
    }

  }, [worldData, width, height, loading, mortalityData])

  if (loading) {
    return (
      <div ref={containerRef} className="globe-container">
        <div style={{ padding: '20px', textAlign: 'center' }}>Loading world map and child mortality data...</div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="globe-container">
      <svg ref={svgRef}></svg>
      <div className="globe-info">
        <div style={{ marginBottom: '10px' }}>
          {hoveredCountry ? (
            <div>
              <strong>{hoveredCountry.name}</strong>: {hoveredCountry.mortality.toFixed(2)} deaths per 100 live births
            </div>
          ) : (
            <p>Click on countries to zoom in • Scroll to zoom • Drag to pan • Click anywhere to reset</p>
          )}
        </div>
        <div style={{ fontSize: '12px', color: '#666' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '20px', height: '20px', backgroundColor: '#2ecc71' }}></div>
            <span>Low mortality</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '5px 0' }}>
            <div style={{ width: '20px', height: '20px', backgroundColor: '#c0392b' }}></div>
            <span>High mortality</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Globe


