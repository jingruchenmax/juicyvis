
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent
} from 'react'
import * as d3 from 'd3'
import {
  playDingdong1Sound,
  playGrabSound,
  playHoverSound,
  playPop1Sound,
  playReleaseSound,
  playWhooshSound
} from '../../utils/soundUtils'
import { useInternetData, type InternetCountrySeries, type InternetPoint } from './useInternetData'

interface ConnectBaseProps {
  juicy: boolean
}

interface TooltipState {
  key: string
  x: number
  y: number
}

interface FocusYearEntry {
  key: string
  country: InternetCountrySeries
  value: number
}

interface BeeswarmNode extends d3.SimulationNodeDatum {
  key: string
  entity: string
  code: string
  value: number
  x: number
  y: number
}

interface RelatedItem {
  key: string
  country: InternetCountrySeries
  value: number
  diff: number
}

interface MarkerItem {
  key: string
  kind: 'selected' | 'hovered'
  y: number
}

const CHART_HEIGHT = 780
const DEFAULT_CHART_WIDTH = 980
const MIN_CHART_WIDTH = 620
const VIEW_GAP = 110
const DOT_RADIUS = 5.2
const BEESWARM_TICKS = 140
const HOVER_SOUND_THROTTLE_MS = 90
const SLIDER_TICK_THROTTLE_MS = 70

const CHART_MARGIN = {
  top: 110,
  right: 32,
  bottom: 72,
  left: 72
}

const RELATED_PALETTE = ['#2f6fed', '#1b9ad1', '#2ca58d', '#8a68df', '#d6812d', '#d45d8f', '#3f84d1', '#5ea54a']
const SELECTED_COLOR = '#f08a2c'
const HOVER_COLOR = '#2066d1'

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value))
}

const formatPercent = d3.format('.2f')

const getCountryKey = (country: InternetCountrySeries): string => {
  return `${country.code}::${country.entity}`
}

export default function ConnectBase({ juicy }: ConnectBaseProps) {
  const { loading, error, countries, years, valueDomain } = useInternetData()

  const [chartWidth, setChartWidth] = useState(DEFAULT_CHART_WIDTH)
  const [focusYear, setFocusYear] = useState(2015)
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [relatedCount, setRelatedCount] = useState(6)
  const [showContext, setShowContext] = useState(true)
  const [searchText, setSearchText] = useState('')
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [isScrubbing, setIsScrubbing] = useState(false)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)
  const [impactNonce, setImpactNonce] = useState(0)
  const [bridgeNonce, setBridgeNonce] = useState(0)
  const [ringNonce, setRingNonce] = useState(0)
  const [shakeNonce, setShakeNonce] = useState(0)
  const [relatedListNonce, setRelatedListNonce] = useState(0)

  const initializedRef = useRef(false)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const hoverKeyRef = useRef<string | null>(null)
  const hoverSoundTimestampRef = useRef(0)
  const sliderTickSoundTimestampRef = useRef(0)
  const revealRef = useRef<{ selected: string | null; hadRelated: boolean }>({
    selected: null,
    hadRelated: false
  })

  const juicyActive = juicy && !prefersReducedMotion

  const defaultFocusYear = useMemo(() => {
    if (years.length === 0) return 2015
    if (years.includes(2015)) return 2015
    return years[Math.floor(years.length / 2)] ?? 2015
  }, [years])

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setPrefersReducedMotion(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage || typeof ResizeObserver === 'undefined') return

    const updateWidth = () => {
      const nextWidth = Math.max(MIN_CHART_WIDTH, Math.round(stage.clientWidth))
      setChartWidth(previous => (previous === nextWidth ? previous : nextWidth))
    }

    updateWidth()
    const observer = new ResizeObserver(updateWidth)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (loading || error || years.length === 0) return
    if (initializedRef.current) return
    setFocusYear(defaultFocusYear)
    initializedRef.current = true
  }, [defaultFocusYear, error, loading, years.length])

  useEffect(() => {
    if (years.length === 0) return
    if (years.includes(focusYear)) return
    setFocusYear(defaultFocusYear)
  }, [defaultFocusYear, focusYear, years])

  useEffect(() => {
    if (!juicyActive || shakeNonce === 0) return
    const stage = stageRef.current
    if (!stage || typeof stage.animate !== 'function') return

    stage.animate(
      [
        { transform: 'translate3d(0, 0, 0)' },
        { transform: 'translate3d(-2px, 1px, 0)' },
        { transform: 'translate3d(2px, -1px, 0)' },
        { transform: 'translate3d(-1.5px, -1px, 0)' },
        { transform: 'translate3d(1.5px, 1px, 0)' },
        { transform: 'translate3d(0, 0, 0)' }
      ],
      {
        duration: 185,
        easing: 'linear'
      }
    )
  }, [juicyActive, shakeNonce])

  const countryByKey = useMemo(() => {
    const map = new Map<string, InternetCountrySeries>()
    countries.forEach(country => {
      map.set(getCountryKey(country), country)
    })
    return map
  }, [countries])

  useEffect(() => {
    if (!selectedKey) return
    if (countryByKey.has(selectedKey)) return
    setSelectedKey(null)
  }, [countryByKey, selectedKey])

  useEffect(() => {
    if (!hoveredKey) return
    if (countryByKey.has(hoveredKey)) return
    setHoveredKey(null)
    setTooltip(previous => (previous?.key === hoveredKey ? null : previous))
    if (hoverKeyRef.current === hoveredKey) {
      hoverKeyRef.current = null
    }
  }, [countryByKey, hoveredKey])

  const focusYearCountries = useMemo<FocusYearEntry[]>(() => {
    return countries
      .map(country => {
        const value = country.valueByYear.get(focusYear)
        if (value === undefined) return null
        return {
          key: getCountryKey(country),
          country,
          value
        }
      })
      .filter((entry): entry is FocusYearEntry => entry !== null)
  }, [countries, focusYear])

  const selectedCountry = useMemo(() => {
    if (!selectedKey) return null
    return countryByKey.get(selectedKey) ?? null
  }, [countryByKey, selectedKey])

  const selectedValueAtFocusYear = selectedCountry?.valueByYear.get(focusYear)

  const relatedItems = useMemo<RelatedItem[]>(() => {
    if (!selectedKey || selectedValueAtFocusYear === undefined) return []

    return focusYearCountries
      .filter(entry => entry.key !== selectedKey)
      .map(entry => ({
        key: entry.key,
        country: entry.country,
        value: entry.value,
        diff: Math.abs(entry.value - selectedValueAtFocusYear)
      }))
      .sort((a, b) => a.diff - b.diff || a.country.entity.localeCompare(b.country.entity))
      .slice(0, relatedCount)
  }, [focusYearCountries, relatedCount, selectedKey, selectedValueAtFocusYear])

  const relatedKeys = useMemo(() => relatedItems.map(item => item.key), [relatedItems])
  const relatedKeySet = useMemo(() => new Set(relatedKeys), [relatedKeys])
  const relatedSignature = useMemo(() => relatedKeys.join('|'), [relatedKeys])

  const emphasisKeySet = useMemo(() => {
    const set = new Set<string>()
    if (selectedKey) set.add(selectedKey)
    relatedKeys.forEach(key => set.add(key))
    return set
  }, [relatedKeys, selectedKey])

  const relatedColorMap = useMemo(() => {
    const map = new Map<string, string>()
    relatedKeys.forEach((key, index) => {
      map.set(key, RELATED_PALETTE[index % RELATED_PALETTE.length])
    })
    return map
  }, [relatedKeys])

  const getAccentColor = useCallback(
    (key: string): string => {
      if (key === selectedKey) return SELECTED_COLOR
      return relatedColorMap.get(key) ?? HOVER_COLOR
    },
    [relatedColorMap, selectedKey]
  )

  useEffect(() => {
    const previous = revealRef.current
    if (juicyActive && selectedKey) {
      const selectedChanged = previous.selected !== selectedKey
      const becameRelated = !previous.hadRelated && relatedKeys.length > 0
      if (selectedChanged || becameRelated) {
        playWhooshSound()
      }
    }
    revealRef.current = {
      selected: selectedKey,
      hadRelated: relatedKeys.length > 0
    }
  }, [juicyActive, relatedKeys.length, selectedKey])

  useEffect(() => {
    if (!juicyActive || !selectedKey) return
    setRelatedListNonce(previous => previous + 1)
  }, [juicyActive, relatedSignature, selectedKey])

  const normalizedSearch = searchText.trim().toLowerCase()

  const searchMatches = useMemo(() => {
    if (!normalizedSearch) return []
    return countries
      .filter(country => country.entity.toLowerCase().startsWith(normalizedSearch))
      .slice(0, 8)
      .map(country => {
        return {
          key: getCountryKey(country),
          entity: country.entity,
          value: country.valueByYear.get(focusYear)
        }
      })
  }, [countries, focusYear, normalizedSearch])

  const yearDomain = useMemo<[number, number]>(() => {
    if (years.length === 0) return [1990, 2024]
    if (years.length === 1) return [years[0] - 1, years[0] + 1]
    return [years[0], years[years.length - 1]]
  }, [years])

  const plotWidth = Math.max(240, chartWidth - CHART_MARGIN.left - CHART_MARGIN.right)
  const plotHeight = CHART_HEIGHT - CHART_MARGIN.top - CHART_MARGIN.bottom
  const plotBottom = CHART_MARGIN.top + plotHeight

  const viewATop = CHART_MARGIN.top
  const viewAHeight = Math.round(plotHeight * 0.33)
  const viewABottom = viewATop + viewAHeight
  const dividerY = viewABottom + VIEW_GAP / 2
  const viewBTop = viewABottom + VIEW_GAP
  const viewBHeight = Math.max(220, plotBottom - viewBTop)
  const viewBBottom = viewBTop + viewBHeight
  const viewACenterY = viewATop + viewAHeight / 2
  const viewAXAxisY = viewABottom - 18

  const xScaleValue = useMemo(() => {
    return d3
      .scaleLinear()
      .domain(valueDomain)
      .range([CHART_MARGIN.left, CHART_MARGIN.left + plotWidth])
  }, [plotWidth, valueDomain])

  const xScaleYear = useMemo(() => {
    return d3
      .scaleLinear()
      .domain(yearDomain)
      .range([CHART_MARGIN.left, CHART_MARGIN.left + plotWidth])
  }, [plotWidth, yearDomain])

  const yScaleLine = useMemo(() => {
    return d3
      .scaleLinear()
      .domain(valueDomain)
      .range([viewBBottom, viewBTop])
  }, [valueDomain, viewBBottom, viewBTop])

  const valueTicks = useMemo(() => d3.ticks(valueDomain[0], valueDomain[1], 5), [valueDomain])

  const yearTicks = useMemo(() => {
    const [minYear, maxYear] = yearDomain
    if (maxYear <= minYear) return [Math.round(minYear)]
    const span = maxYear - minYear
    const step = span > 45 ? 10 : 5
    const from = Math.ceil(minYear / step) * step
    const generated = d3.range(from, maxYear + 0.00001, step).map(value => Math.round(value))
    if (!generated.includes(minYear)) generated.unshift(minYear)
    if (!generated.includes(maxYear)) generated.push(maxYear)
    return Array.from(new Set(generated)).sort((a, b) => a - b)
  }, [yearDomain])

  const yTicks = useMemo(() => d3.ticks(valueDomain[0], valueDomain[1], 5), [valueDomain])

  const lineGenerator = useMemo(() => {
    return d3
      .line<InternetPoint>()
      .defined(point => Number.isFinite(point.value))
      .x(point => xScaleYear(point.year))
      .y(point => yScaleLine(point.value))
  }, [xScaleYear, yScaleLine])

  const linePathByKey = useMemo(() => {
    const map = new Map<string, string>()
    countries.forEach(country => {
      const path = lineGenerator(country.points)
      if (path) {
        map.set(getCountryKey(country), path)
      }
    })
    return map
  }, [countries, lineGenerator])

  const beeswarmNodes = useMemo<BeeswarmNode[]>(() => {
    if (focusYearCountries.length === 0) return []

    const leftBound = CHART_MARGIN.left + DOT_RADIUS + 1
    const rightBound = CHART_MARGIN.left + plotWidth - DOT_RADIUS - 1
    const upperBound = viewATop + DOT_RADIUS + 24
    const lowerBound = viewABottom - DOT_RADIUS - 12

    const nodes: BeeswarmNode[] = focusYearCountries.map(entry => ({
      key: entry.key,
      entity: entry.country.entity,
      code: entry.country.code,
      value: entry.value,
      x: xScaleValue(entry.value),
      y: viewACenterY
    }))

    const simulation = d3
      .forceSimulation(nodes)
      .force('x', d3.forceX<BeeswarmNode>(node => xScaleValue(node.value)).strength(0.85))
      .force('y', d3.forceY<BeeswarmNode>(viewACenterY).strength(0.12))
      .force('collide', d3.forceCollide<BeeswarmNode>(DOT_RADIUS + 1.2).iterations(2))
      .stop()

    for (let tick = 0; tick < BEESWARM_TICKS; tick += 1) {
      simulation.tick()
    }
    simulation.stop()

    return nodes.map(node => ({
      ...node,
      x: clamp(node.x ?? xScaleValue(node.value), leftBound, rightBound),
      y: clamp(node.y ?? viewACenterY, upperBound, lowerBound)
    }))
  }, [focusYearCountries, plotWidth, viewABottom, viewACenterY, viewATop, xScaleValue])

  const beeswarmNodeByKey = useMemo(() => {
    return new Map(beeswarmNodes.map(node => [node.key, node] as const))
  }, [beeswarmNodes])

  const selectedNode = useMemo(() => {
    if (!selectedKey) return null
    return beeswarmNodeByKey.get(selectedKey) ?? null
  }, [beeswarmNodeByKey, selectedKey])

  const relatedArcs = useMemo(() => {
    if (!selectedNode || relatedItems.length === 0) return []

    return relatedItems
      .map((item, index) => {
        const targetNode = beeswarmNodeByKey.get(item.key)
        if (!targetNode) return null

        const controlX = (selectedNode.x + targetNode.x) / 2
        const controlY = Math.min(selectedNode.y, targetNode.y) - Math.max(18, Math.abs(targetNode.x - selectedNode.x) * 0.1)
        const d = `M ${selectedNode.x} ${selectedNode.y} Q ${controlX} ${controlY} ${targetNode.x} ${targetNode.y}`

        return {
          key: item.key,
          d,
          color: relatedColorMap.get(item.key) ?? RELATED_PALETTE[index % RELATED_PALETTE.length],
          delay: index * 28
        }
      })
      .filter(
        (
          arc
        ): arc is {
          key: string
          d: string
          color: string
          delay: number
        } => arc !== null
      )
  }, [beeswarmNodeByKey, relatedColorMap, relatedItems, selectedNode])

  const bridgePath = useMemo(() => {
    if (!hoveredKey) return null
    const source = beeswarmNodeByKey.get(hoveredKey)
    const country = countryByKey.get(hoveredKey)
    const value = country?.valueByYear.get(focusYear)
    if (!source || value === undefined) return null

    const targetX = xScaleYear(focusYear)
    const targetY = yScaleLine(value)
    const control1X = source.x + (targetX - source.x) * 0.3
    const control2X = source.x + (targetX - source.x) * 0.68
    const middleY = (source.y + targetY) / 2
    const d = `M ${source.x} ${source.y} C ${control1X} ${middleY - 24}, ${control2X} ${middleY + 26}, ${targetX} ${targetY}`

    return {
      d,
      x: targetX,
      y: targetY
    }
  }, [beeswarmNodeByKey, countryByKey, focusYear, hoveredKey, xScaleYear, yScaleLine])

  const focusMarkers = useMemo<MarkerItem[]>(() => {
    const markers: MarkerItem[] = []

    if (selectedKey) {
      const selectedCountryEntry = countryByKey.get(selectedKey)
      const value = selectedCountryEntry?.valueByYear.get(focusYear)
      if (value !== undefined) {
        markers.push({
          key: selectedKey,
          kind: 'selected',
          y: yScaleLine(value)
        })
      }
    }

    if (hoveredKey && hoveredKey !== selectedKey) {
      const hoveredCountryEntry = countryByKey.get(hoveredKey)
      const value = hoveredCountryEntry?.valueByYear.get(focusYear)
      if (value !== undefined) {
        markers.push({
          key: hoveredKey,
          kind: 'hovered',
          y: yScaleLine(value)
        })
      }
    }

    return markers
  }, [countryByKey, focusYear, hoveredKey, selectedKey, yScaleLine])

  const lineCountries = useMemo(() => {
    if (showContext) return countries
    return countries.filter(country => {
      const key = getCountryKey(country)
      return emphasisKeySet.has(key) || hoveredKey === key
    })
  }, [countries, emphasisKeySet, hoveredKey, showContext])

  const instructionWidth = Math.min(640, Math.max(280, chartWidth - 140))
  const instructionX = chartWidth / 2 - instructionWidth / 2
  const focusLineX = xScaleYear(focusYear)

  const tooltipCountry = useMemo(() => {
    if (!tooltip) return null
    return countryByKey.get(tooltip.key) ?? null
  }, [countryByKey, tooltip])
  const tooltipValue = tooltipCountry?.valueByYear.get(focusYear)

  const engageHover = useCallback(
    (key: string) => {
      setHoveredKey(previous => (previous === key ? previous : key))

      if (hoverKeyRef.current !== key) {
        hoverKeyRef.current = key

        if (juicyActive) {
          const now = performance.now()
          if (now - hoverSoundTimestampRef.current >= HOVER_SOUND_THROTTLE_MS) {
            hoverSoundTimestampRef.current = now
            playHoverSound()
          }
          setBridgeNonce(previous => previous + 1)
        }
      }
    },
    [juicyActive]
  )

  const positionTooltip = useCallback((event: ReactMouseEvent<SVGElement, MouseEvent>, key: string) => {
    const stage = stageRef.current
    if (!stage) return
    const rect = stage.getBoundingClientRect()
    const localX = event.clientX - rect.left + 12
    const localY = event.clientY - rect.top - 18

    setTooltip({
      key,
      x: clamp(localX, 8, rect.width - 212),
      y: clamp(localY, 8, rect.height - 94)
    })
  }, [])

  const handleHoverMove = (event: ReactMouseEvent<SVGElement, MouseEvent>, key: string) => {
    engageHover(key)
    positionTooltip(event, key)
  }

  const handleHoverLeave = (key: string) => {
    setHoveredKey(previous => (previous === key ? null : previous))
    setTooltip(previous => (previous?.key === key ? null : previous))
    if (hoverKeyRef.current === key) {
      hoverKeyRef.current = null
    }
  }

  const handleSelectCountry = useCallback(
    (key: string) => {
      setSelectedKey(key)

      if (!juicyActive) return
      playDingdong1Sound()
      setImpactNonce(previous => previous + 1)
      setRingNonce(previous => previous + 1)
      setShakeNonce(previous => previous + 1)
    },
    [juicyActive]
  )

  const handleSearchSelect = (key: string, entity: string) => {
    setSearchText(entity)
    handleSelectCountry(key)
  }

  const handleFocusYearChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value)
    if (!Number.isFinite(value)) return
    setFocusYear(Math.trunc(value))

    if (!juicyActive) return
    const now = performance.now()
    if (now - sliderTickSoundTimestampRef.current < SLIDER_TICK_THROTTLE_MS) return
    sliderTickSoundTimestampRef.current = now
    playPop1Sound()
  }

  const handleFocusPointerDown = () => {
    setIsScrubbing(true)
    if (juicyActive) {
      playGrabSound()
    }
  }

  const handleFocusPointerUp = () => {
    setIsScrubbing(false)
    if (juicyActive) {
      playReleaseSound()
    }
  }

  const handleRelatedCountChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value)
    if (!Number.isFinite(value)) return
    setRelatedCount(clamp(Math.trunc(value), 3, 10))
  }

  const handleContextToggle = (event: ChangeEvent<HTMLInputElement>) => {
    setShowContext(event.target.checked)
  }

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchText(event.target.value)
  }

  const handleClearSelection = () => {
    setSelectedKey(null)
    setHoveredKey(null)
    setTooltip(null)
    hoverKeyRef.current = null
  }

  return (
    <div
      className={`connect-shell ${juicy ? 'connect-shell-juicy' : 'connect-shell-basic'} ${
        juicyActive && isScrubbing ? 'is-scrubbing' : ''
      }`}
    >
      <div className="connect-layout">
        <div className="connect-main">
          <div className={`connect-stage ${juicyActive && isScrubbing ? 'is-scrubbing' : ''}`} ref={stageRef}>
            {juicyActive && impactNonce > 0 && <div key={`impact-${impactNonce}`} className="connect-impact-flash" />}

            {loading && <div className="connect-stage-status">Loading internet-use dataset...</div>}
            {error && !loading && <div className="connect-stage-status is-error">Error loading data: {error}</div>}
            {!loading && !error && countries.length === 0 && (
              <div className="connect-stage-status is-error">No usable rows found in internet-use dataset.</div>
            )}

            {!loading && !error && countries.length > 0 && (
              <>
                <svg
                  className="connect-svg"
                  width={chartWidth}
                  height={CHART_HEIGHT}
                  viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`}
                  role="img"
                  aria-label="Internet use connect chart with beeswarm and time-series views"
                >
                  <text x={chartWidth / 2} y={24} className="connect-title" textAnchor="middle">
                    Internet use
                  </text>
                  <text x={chartWidth / 2} y={45} className="connect-subtitle" textAnchor="middle">
                    Connect
                  </text>

                  <rect
                    className="connect-instruction-box"
                    x={instructionX}
                    y={54}
                    width={instructionWidth}
                    height={24}
                    rx={9}
                    ry={9}
                  />
                  <text x={chartWidth / 2} y={70} className="connect-instruction" textAnchor="middle">
                    Hover to link across views. Click a country to reveal related countries.
                  </text>

                  <rect
                    className="connect-view-box"
                    x={CHART_MARGIN.left}
                    y={viewATop}
                    width={plotWidth}
                    height={viewAHeight}
                    rx={7}
                    ry={7}
                  />
                  <rect
                    className="connect-view-box"
                    x={CHART_MARGIN.left}
                    y={viewBTop}
                    width={plotWidth}
                    height={viewBHeight}
                    rx={7}
                    ry={7}
                  />

                  <text className="connect-view-title" x={CHART_MARGIN.left + 8} y={viewATop + 16}>
                    Focus year distribution
                  </text>
                  <text className="connect-view-title" x={CHART_MARGIN.left + 8} y={viewBTop + 16}>
                    Trends over time
                  </text>

                  {valueTicks.map(tick => (
                    <line
                      key={`value-grid-${tick}`}
                      className="connect-grid-line is-view-a"
                      x1={xScaleValue(tick)}
                      x2={xScaleValue(tick)}
                      y1={viewATop + 24}
                      y2={viewAXAxisY}
                    />
                  ))}

                  {yTicks.map(tick => (
                    <line
                      key={`line-grid-${tick}`}
                      className="connect-grid-line is-view-b"
                      x1={CHART_MARGIN.left}
                      x2={CHART_MARGIN.left + plotWidth}
                      y1={yScaleLine(tick)}
                      y2={yScaleLine(tick)}
                    />
                  ))}

                  <line
                    className="connect-axis-line"
                    x1={CHART_MARGIN.left}
                    x2={CHART_MARGIN.left + plotWidth}
                    y1={viewAXAxisY}
                    y2={viewAXAxisY}
                  />

                  {valueTicks.map(tick => (
                    <g key={`value-tick-${tick}`}>
                      <line
                        className="connect-axis-tick-line"
                        x1={xScaleValue(tick)}
                        x2={xScaleValue(tick)}
                        y1={viewAXAxisY}
                        y2={viewAXAxisY + 5}
                      />
                      <text className="connect-axis-tick" x={xScaleValue(tick)} y={viewAXAxisY + 18} textAnchor="middle">
                        {Math.round(tick)}
                      </text>
                    </g>
                  ))}

                  <text className="connect-axis-label" x={CHART_MARGIN.left + plotWidth / 2} y={viewAXAxisY + 26} textAnchor="middle">
                    Internet users (% of population)
                  </text>
                  <line
                    className="connect-view-divider"
                    x1={CHART_MARGIN.left}
                    x2={CHART_MARGIN.left + plotWidth}
                    y1={dividerY}
                    y2={dividerY}
                  />

                  <line
                    className="connect-focus-line"
                    x1={focusLineX}
                    x2={focusLineX}
                    y1={viewBTop}
                    y2={viewBBottom}
                  />

                  <line
                    className="connect-axis-line"
                    x1={CHART_MARGIN.left}
                    x2={CHART_MARGIN.left + plotWidth}
                    y1={viewBBottom}
                    y2={viewBBottom}
                  />
                  <line
                    className="connect-axis-line"
                    x1={CHART_MARGIN.left}
                    x2={CHART_MARGIN.left}
                    y1={viewBTop}
                    y2={viewBBottom}
                  />

                  {yearTicks.map(tick => (
                    <g key={`year-tick-${tick}`}>
                      <line
                        className="connect-axis-tick-line"
                        x1={xScaleYear(tick)}
                        x2={xScaleYear(tick)}
                        y1={viewBBottom}
                        y2={viewBBottom + 5}
                      />
                      <text className="connect-axis-tick" x={xScaleYear(tick)} y={viewBBottom + 20} textAnchor="middle">
                        {tick}
                      </text>
                    </g>
                  ))}

                  {yTicks.map(tick => (
                    <g key={`share-tick-${tick}`}>
                      <line
                        className="connect-axis-tick-line"
                        x1={CHART_MARGIN.left - 5}
                        x2={CHART_MARGIN.left}
                        y1={yScaleLine(tick)}
                        y2={yScaleLine(tick)}
                      />
                      <text
                        className="connect-axis-tick"
                        x={CHART_MARGIN.left - 10}
                        y={yScaleLine(tick) + 4}
                        textAnchor="end"
                      >
                        {Math.round(tick)}
                      </text>
                    </g>
                  ))}

                  <text className="connect-axis-label" x={CHART_MARGIN.left + plotWidth / 2} y={viewBBottom + 48} textAnchor="middle">
                    Year
                  </text>
                  <text
                    className="connect-axis-label"
                    transform={`translate(${24}, ${(viewBTop + viewBBottom) / 2}) rotate(-90)`}
                    textAnchor="middle"
                  >
                    Internet use (%)
                  </text>

                  <g className="connect-lines-layer">
                    {lineCountries.map(country => {
                      const key = getCountryKey(country)
                      const path = linePathByKey.get(key)
                      if (!path) return null

                      const isSelected = key === selectedKey
                      const isRelated = relatedKeySet.has(key)
                      const isHovered = key === hoveredKey
                      const isContext = !isSelected && !isRelated && !isHovered

                      const className = ['connect-line', isContext ? 'is-context' : '', isSelected ? 'is-selected' : '', isRelated ? 'is-related' : '', isHovered ? 'is-hovered' : '']
                        .filter(Boolean)
                        .join(' ')

                      const lineStyle =
                        isSelected || isRelated
                          ? ({
                              '--connect-emphasis-color': getAccentColor(key)
                            } as CSSProperties)
                          : undefined

                      return (
                        <g key={`line-${key}`}>
                          <path d={path} className={className} style={lineStyle} />
                          <path
                            d={path}
                            className="connect-line-hit"
                            onMouseMove={event => handleHoverMove(event, key)}
                            onMouseLeave={() => handleHoverLeave(key)}
                            onClick={() => handleSelectCountry(key)}
                          />
                        </g>
                      )
                    })}
                  </g>

                  <g className="connect-marker-layer">
                    {focusMarkers.map(marker => (
                      <circle
                        key={`marker-${marker.kind}-${marker.key}`}
                        className={`connect-focus-marker ${marker.kind === 'selected' ? 'is-selected' : 'is-hovered'}`}
                        style={{ '--connect-emphasis-color': getAccentColor(marker.key) } as CSSProperties}
                        cx={focusLineX}
                        cy={marker.y}
                        r={marker.kind === 'selected' ? 6.6 : 5.7}
                      />
                    ))}
                  </g>

                  <g className="connect-arc-layer">
                    {relatedArcs.map(arc => (
                      <path
                        key={`${juicyActive ? `arc-${relatedListNonce}-` : 'arc-'}${arc.key}`}
                        d={arc.d}
                        className={`connect-related-arc ${juicyActive ? 'is-draw' : ''}`}
                        style={
                          {
                            '--connect-emphasis-color': arc.color,
                            '--arc-delay': `${arc.delay}ms`
                          } as CSSProperties
                        }
                      />
                    ))}
                  </g>

                  {juicyActive && bridgePath && (
                    <path key={`bridge-${bridgeNonce}`} className="connect-energy-bridge" d={bridgePath.d} />
                  )}

                  <g className="connect-dots-layer">
                    {beeswarmNodes.map(node => {
                      const isSelected = node.key === selectedKey
                      const isRelated = relatedKeySet.has(node.key)
                      const isHovered = node.key === hoveredKey
                      const isContext = !isSelected && !isRelated && !isHovered

                      const dotClass = ['connect-dot', isContext ? 'is-context' : '', isSelected ? 'is-selected' : '', isRelated ? 'is-related' : '', isHovered ? 'is-hovered' : '']
                        .filter(Boolean)
                        .join(' ')

                      const dotStyle =
                        isSelected || isRelated
                          ? ({
                              '--connect-emphasis-color': getAccentColor(node.key)
                            } as CSSProperties)
                          : undefined

                      return (
                        <g key={`dot-${node.key}`}>
                          {isHovered && <circle className="connect-dot-halo" cx={node.x} cy={node.y} r={DOT_RADIUS + 3.4} />}
                          <circle
                            className={dotClass}
                            style={dotStyle}
                            cx={node.x}
                            cy={node.y}
                            r={DOT_RADIUS}
                            onMouseMove={event => handleHoverMove(event, node.key)}
                            onMouseLeave={() => handleHoverLeave(node.key)}
                            onClick={() => handleSelectCountry(node.key)}
                          />
                        </g>
                      )
                    })}

                    {juicyActive && selectedNode && (
                      <circle
                        key={`selected-ring-${ringNonce}-${selectedNode.key}`}
                        className="connect-selected-ring"
                        cx={selectedNode.x}
                        cy={selectedNode.y}
                        r={DOT_RADIUS + 1.2}
                      />
                    )}
                  </g>
                </svg>

                {tooltip && tooltipCountry && (
                  <div
                    className={`connect-tooltip ${juicyActive ? 'is-juicy' : ''}`}
                    style={{
                      left: tooltip.x,
                      top: tooltip.y
                    }}
                  >
                    <div className="connect-tooltip-country">{tooltipCountry.entity}</div>
                    <div className="connect-tooltip-code">{tooltipCountry.code}</div>
                    <div className="connect-tooltip-value">
                      {focusYear}: {tooltipValue !== undefined ? `${formatPercent(tooltipValue)}%` : 'No data'}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <aside className="connect-panel">
          <section className="connect-panel-section">
            <div className="connect-control-label">Status</div>
            <div className="connect-status-line">
              Selected:
              <span className="connect-status-value">
                {selectedCountry ? selectedCountry.entity : 'Click a country to reveal related countries.'}
              </span>
            </div>
            <div className="connect-status-line">
              Focus year:
              <span className="connect-status-value">{focusYear}</span>
            </div>
            {selectedCountry && selectedValueAtFocusYear === undefined && (
              <div className="connect-empty-note">No data for selected year.</div>
            )}
          </section>

          <section className="connect-panel-section">
            <label className="connect-control-label" htmlFor="connect-focus-year">
              Focus Year: <strong>{focusYear}</strong>
            </label>
            <input
              id="connect-focus-year"
              className="connect-range"
              type="range"
              min={years[0] ?? 1990}
              max={years[years.length - 1] ?? 2024}
              step={1}
              value={focusYear}
              onChange={handleFocusYearChange}
              onPointerDown={handleFocusPointerDown}
              onPointerUp={handleFocusPointerUp}
              onPointerCancel={handleFocusPointerUp}
              onBlur={handleFocusPointerUp}
              disabled={loading || Boolean(error) || years.length === 0}
            />
          </section>

          <section className="connect-panel-section">
            <label className="connect-control-label" htmlFor="connect-related-count">
              Related count: <strong>{relatedCount}</strong>
            </label>
            <input
              id="connect-related-count"
              className="connect-range"
              type="range"
              min={3}
              max={10}
              step={1}
              value={relatedCount}
              onChange={handleRelatedCountChange}
              disabled={loading || Boolean(error) || countries.length === 0}
            />
          </section>

          <section className="connect-panel-section">
            <label className="connect-context-row">
              <input
                type="checkbox"
                checked={showContext}
                onChange={handleContextToggle}
                disabled={loading || Boolean(error)}
              />
              <span>Show context (faint all-country lines)</span>
            </label>
          </section>

          <section className="connect-panel-section">
            <label className="connect-control-label" htmlFor="connect-search">
              Search country
            </label>
            <input
              id="connect-search"
              className="connect-text-input"
              type="text"
              value={searchText}
              onChange={handleSearchChange}
              placeholder='e.g. "Uni"'
              disabled={loading || Boolean(error)}
            />

            {normalizedSearch.length > 0 && searchMatches.length === 0 && (
              <div className="connect-search-empty">No matching countries.</div>
            )}

            {searchMatches.length > 0 && (
              <div className="connect-search-list">
                {searchMatches.map(match => (
                  <button
                    type="button"
                    key={`search-${match.key}`}
                    className={`connect-search-item ${selectedKey === match.key ? 'is-selected' : ''}`}
                    onClick={() => handleSearchSelect(match.key, match.entity)}
                  >
                    <span>{match.entity}</span>
                    <span>{match.value !== undefined ? `${formatPercent(match.value)}%` : 'N/A'}</span>
                  </button>
                ))}
              </div>
            )}
          </section>

          {selectedKey && (
            <section className="connect-panel-section">
              <div className="connect-control-label">Related countries</div>
              {selectedValueAtFocusYear === undefined ? (
                <div className="connect-empty-note">No data for selected year.</div>
              ) : relatedItems.length === 0 ? (
                <div className="connect-empty-note">No related countries available.</div>
              ) : (
                <ol className="connect-related-list">
                  {relatedItems.map((item, index) => (
                    <li
                      key={juicyActive ? `related-${relatedListNonce}-${item.key}` : `related-${item.key}`}
                      className={`connect-related-item ${juicyActive ? 'is-reveal' : ''}`}
                      style={{ '--related-delay': `${index * 34}ms` } as CSSProperties}
                    >
                      <div className="connect-related-name">{item.country.entity}</div>
                      <div className="connect-related-value">{formatPercent(item.value)}%</div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )}

          <section className="connect-panel-section">
            <button
              type="button"
              className="connect-clear-btn"
              onClick={handleClearSelection}
              disabled={loading || Boolean(error) || countries.length === 0}
            >
              Clear selection
            </button>
          </section>
        </aside>
      </div>
    </div>
  )
}
