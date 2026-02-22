import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent
} from 'react'
import * as d3 from 'd3'
import {
  playClick5TickSound,
  playPop4Sound,
  playPopHoverRandomSound
} from '../../utils/soundUtils'
import {
  useGiniData,
  type GiniCountrySeries,
  type GiniPoint
} from './useGiniData'

interface FilterBaseProps {
  juicy: boolean
}

interface TooltipState {
  key: string
  x: number
  y: number
}

type SliderAttention = 'focus' | 'min' | 'max'

const CHART_HEIGHT = 780
const DEFAULT_CHART_WIDTH = 980
const MIN_CHART_WIDTH = 620
const PREVIEW_THROTTLE_MS = 80
const HOVER_SOUND_THROTTLE_MS = 100
const CONTROL_FLASH_MS = 200
const SETTLE_DEBOUNCE_MS = 220
const SETTLE_MIN_INTERVAL_MS = 600
const ENTER_ANIM_MS = 420
const PULSE_ANIM_MS = 420
const EXIT_ANIM_MS = 420

const CHART_MARGIN = {
  top: 126,
  right: 32,
  bottom: 72,
  left: 72
}

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value))
}

const formatGini = d3.format('.2f')

const getCountryKey = (country: GiniCountrySeries): string => {
  return `${country.code}::${country.entity}`
}

const clearTimeoutRef = (ref: React.MutableRefObject<number | null>) => {
  if (ref.current !== null) {
    window.clearTimeout(ref.current)
    ref.current = null
  }
}

export default function FilterBase({ juicy }: FilterBaseProps) {
  const { loading, error, countries, years, regions, giniDomain } = useGiniData()

  const [chartWidth, setChartWidth] = useState(DEFAULT_CHART_WIDTH)
  const [focusYear, setFocusYear] = useState(2015)
  const [giniMin, setGiniMin] = useState(giniDomain[0])
  const [giniMax, setGiniMax] = useState(giniDomain[1])
  const [selectedRegions, setSelectedRegions] = useState<Set<string>>(new Set())
  const [prefix, setPrefix] = useState('')
  const [showContext, setShowContext] = useState(true)
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [isFocusDragging, setIsFocusDragging] = useState(false)
  const [isScrubbing, setIsScrubbing] = useState(false)
  const [hoveredSlider, setHoveredSlider] = useState<SliderAttention | null>(null)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)
  const [impactNonce, setImpactNonce] = useState(0)
  const [scrubBumpNonce, setScrubBumpNonce] = useState(0)
  const [shakeNonce, setShakeNonce] = useState(0)
  const [flashControlId, setFlashControlId] = useState<string | null>(null)
  const [countPopNonce, setCountPopNonce] = useState(0)
  const [enteringKeys, setEnteringKeys] = useState<string[]>([])
  const [pulseKeys, setPulseKeys] = useState<string[]>([])
  const [exitingCountries, setExitingCountries] = useState<GiniCountrySeries[]>([])

  const initializedRef = useRef(false)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const hoverKeyRef = useRef<string | null>(null)
  const previewSoundTimestampRef = useRef(0)
  const hoverSoundTimestampRef = useRef(0)
  const settleSoundTimestampRef = useRef(0)
  const settleTimeoutRef = useRef<number | null>(null)
  const controlFlashTimeoutRef = useRef<number | null>(null)
  const enterTimeoutRef = useRef<number | null>(null)
  const pulseTimeoutRef = useRef<number | null>(null)
  const exitTimeoutRef = useRef<number | null>(null)
  const previousMatchedKeysRef = useRef<Set<string>>(new Set())

  const juicyActive = juicy && !prefersReducedMotion
  const sliderEngaged = juicyActive && (hoveredSlider !== null || isScrubbing)
  const totalCountries = countries.length

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
    if (loading || error || countries.length === 0 || years.length === 0 || regions.length === 0) return
    if (initializedRef.current) return

    setFocusYear(defaultFocusYear)
    setGiniMin(giniDomain[0])
    setGiniMax(giniDomain[1])
    setSelectedRegions(new Set(regions))
    setPrefix('')
    setShowContext(true)
    initializedRef.current = true
  }, [countries.length, defaultFocusYear, error, giniDomain, loading, regions, years.length])

  useEffect(() => {
    if (years.length === 0) return
    if (years.includes(focusYear)) return
    setFocusYear(defaultFocusYear)
  }, [defaultFocusYear, focusYear, years])

  useEffect(() => {
    if (giniMin < giniDomain[0] || giniMin > giniDomain[1]) {
      setGiniMin(giniDomain[0])
    }
    if (giniMax > giniDomain[1] || giniMax < giniDomain[0]) {
      setGiniMax(giniDomain[1])
    }
  }, [giniDomain, giniMax, giniMin])

  const countryByKey = useMemo(() => {
    const map = new Map<string, GiniCountrySeries>()
    countries.forEach(country => {
      map.set(getCountryKey(country), country)
    })
    return map
  }, [countries])

  const normalizedPrefix = prefix.trim().toLowerCase()

  const matchedCountries = useMemo(() => {
    return countries.filter(country => {
      if (!selectedRegions.has(country.region)) return false
      if (normalizedPrefix && !country.entity.toLowerCase().startsWith(normalizedPrefix)) return false
      const focusValue = country.valueByYear.get(focusYear)
      if (focusValue === undefined) return false
      if (focusValue < giniMin || focusValue > giniMax) return false
      return true
    })
  }, [countries, focusYear, giniMax, giniMin, normalizedPrefix, selectedRegions])

  const matchedKeys = useMemo(() => matchedCountries.map(country => getCountryKey(country)), [matchedCountries])
  const matchedKeySet = useMemo(() => new Set(matchedKeys), [matchedKeys])
  const visibleCountries = useMemo(() => (showContext ? countries : matchedCountries), [countries, matchedCountries, showContext])
  const matchedCount = matchedCountries.length

  useEffect(() => {
    setCountPopNonce(previous => previous + 1)
  }, [matchedCount])

  useEffect(() => {
    if (!tooltip) return
    if (!matchedKeySet.has(tooltip.key)) {
      setTooltip(null)
      setHoveredKey(previous => (previous === tooltip.key ? null : previous))
      if (hoverKeyRef.current === tooltip.key) {
        hoverKeyRef.current = null
      }
    }
  }, [matchedKeySet, tooltip])

  useEffect(() => {
    const nextMatchedSet = new Set<string>(matchedKeys)
    const previousMatchedSet = previousMatchedKeysRef.current
    const entering = matchedKeys.filter(key => !previousMatchedSet.has(key))
    const exiting = Array.from(previousMatchedSet).filter(key => !nextMatchedSet.has(key))

    if (!juicyActive) {
      setEnteringKeys([])
      setPulseKeys([])
      setExitingCountries([])
      setIsScrubbing(false)
      setFlashControlId(null)
      previousMatchedKeysRef.current = nextMatchedSet
      return
    }

    if (entering.length > 0) {
      setEnteringKeys(entering)
      clearTimeoutRef(enterTimeoutRef)
      enterTimeoutRef.current = window.setTimeout(() => {
        setEnteringKeys([])
        enterTimeoutRef.current = null
      }, ENTER_ANIM_MS)
    } else {
      setEnteringKeys([])
    }

    if (entering.length > 0 || exiting.length > 0) {
      const pulseTarget = matchedKeys.length <= 28 ? matchedKeys : entering
      setPulseKeys(pulseTarget)
      clearTimeoutRef(pulseTimeoutRef)
      pulseTimeoutRef.current = window.setTimeout(() => {
        setPulseKeys([])
        pulseTimeoutRef.current = null
      }, PULSE_ANIM_MS)
    }

    if (exiting.length > 0 && !showContext) {
      const lines = exiting
        .map(key => countryByKey.get(key))
        .filter((country): country is GiniCountrySeries => country !== undefined)
      setExitingCountries(lines)
      clearTimeoutRef(exitTimeoutRef)
      exitTimeoutRef.current = window.setTimeout(() => {
        setExitingCountries([])
        exitTimeoutRef.current = null
      }, EXIT_ANIM_MS)
    } else {
      setExitingCountries([])
    }

    if (previousMatchedSet.size > 0 && (entering.length > 0 || exiting.length > 0)) {
      setImpactNonce(previous => previous + 1)
    }

    previousMatchedKeysRef.current = nextMatchedSet
  }, [countryByKey, juicyActive, matchedKeys, showContext])

  const playPreviewCueThrottled = useCallback(() => {
    if (!juicyActive) return

    const now = performance.now()
    if (now - previewSoundTimestampRef.current < PREVIEW_THROTTLE_MS) return
    previewSoundTimestampRef.current = now
    playClick5TickSound()
  }, [juicyActive])

  const scheduleSettleCue = useCallback(() => {
    if (!juicyActive) return
    clearTimeoutRef(settleTimeoutRef)

    settleTimeoutRef.current = window.setTimeout(() => {
      const now = performance.now()
      if (now - settleSoundTimestampRef.current < SETTLE_MIN_INTERVAL_MS) return
      settleSoundTimestampRef.current = now
      playPop4Sound()
    }, SETTLE_DEBOUNCE_MS)
  }, [juicyActive])

  const playClickCue = useCallback(() => {
    if (!juicyActive) return
    playPop4Sound()
  }, [juicyActive])

  const triggerImpact = useCallback(() => {
    if (!juicyActive) return
    setImpactNonce(previous => previous + 1)
  }, [juicyActive])

  const triggerScrubBump = useCallback(() => {
    if (!juicyActive) return
    setScrubBumpNonce(previous => previous + 1)
  }, [juicyActive])

  const triggerControlFlash = useCallback(
    (controlId: string) => {
      if (!juicyActive) return
      clearTimeoutRef(controlFlashTimeoutRef)
      setFlashControlId(controlId)
      controlFlashTimeoutRef.current = window.setTimeout(() => {
        setFlashControlId(previous => (previous === controlId ? null : previous))
        controlFlashTimeoutRef.current = null
      }, CONTROL_FLASH_MS)
    },
    [juicyActive]
  )

  const triggerStageShake = useCallback(() => {
    if (!juicyActive) return
    setShakeNonce(previous => previous + 1)
  }, [juicyActive])

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
        duration: 190,
        easing: 'linear'
      }
    )
  }, [juicyActive, shakeNonce])

  useEffect(() => {
    return () => {
      clearTimeoutRef(settleTimeoutRef)
      clearTimeoutRef(controlFlashTimeoutRef)
      clearTimeoutRef(enterTimeoutRef)
      clearTimeoutRef(pulseTimeoutRef)
      clearTimeoutRef(exitTimeoutRef)
    }
  }, [])

  const yearDomain = useMemo<[number, number]>(() => {
    if (years.length === 0) return [1963, 2024]
    if (years.length === 1) return [years[0] - 1, years[0] + 1]
    return [years[0], years[years.length - 1]]
  }, [years])

  const safeGiniDomain = useMemo<[number, number]>(() => {
    if (giniDomain[1] <= giniDomain[0]) return [giniDomain[0], giniDomain[0] + 0.01]
    return giniDomain
  }, [giniDomain])

  const plotWidth = Math.max(240, chartWidth - CHART_MARGIN.left - CHART_MARGIN.right)
  const plotHeight = CHART_HEIGHT - CHART_MARGIN.top - CHART_MARGIN.bottom

  const xScale = useMemo(() => {
    return d3
      .scaleLinear()
      .domain(yearDomain)
      .range([CHART_MARGIN.left, CHART_MARGIN.left + plotWidth])
  }, [plotWidth, yearDomain])

  const yScale = useMemo(() => {
    return d3
      .scaleLinear()
      .domain(safeGiniDomain)
      .range([CHART_MARGIN.top + plotHeight, CHART_MARGIN.top])
  }, [plotHeight, safeGiniDomain])

  const xTicks = useMemo(() => {
    const [minYear, maxYear] = yearDomain
    if (maxYear <= minYear) return [Math.round(minYear)]

    const step = maxYear - minYear > 45 ? 10 : 5
    const from = Math.ceil(minYear / step) * step
    const generated = d3.range(from, maxYear + 0.00001, step).map(value => Math.round(value))
    if (!generated.includes(minYear)) generated.unshift(minYear)
    if (!generated.includes(maxYear)) generated.push(maxYear)
    return Array.from(new Set(generated)).sort((a, b) => a - b)
  }, [yearDomain])

  const yTicks = useMemo(() => d3.ticks(safeGiniDomain[0], safeGiniDomain[1], 6), [safeGiniDomain])

  const lineGenerator = useMemo(() => {
    return d3
      .line<GiniPoint>()
      .defined(point => Number.isFinite(point.value))
      .x(point => xScale(point.year))
      .y(point => yScale(point.value))
  }, [xScale, yScale])

  const focusX = xScale(focusYear)
  const instructionWidth = Math.min(640, Math.max(260, chartWidth - 140))
  const instructionX = chartWidth / 2 - instructionWidth / 2

  const enteringKeySet = useMemo(() => new Set(enteringKeys), [enteringKeys])
  const pulseKeySet = useMemo(() => new Set(pulseKeys), [pulseKeys])

  const getPath = useCallback(
    (country: GiniCountrySeries) => {
      return lineGenerator(country.points) ?? ''
    },
    [lineGenerator]
  )

  const matchedFocusDots = useMemo(() => {
    return matchedCountries
      .map(country => {
        const value = country.valueByYear.get(focusYear)
        if (value === undefined) return null
        return {
          key: getCountryKey(country),
          y: yScale(value)
        }
      })
      .filter((dot): dot is { key: string; y: number } => dot !== null)
  }, [focusYear, matchedCountries, yScale])

  const tooltipCountry = useMemo(() => {
    if (!tooltip) return null
    return countryByKey.get(tooltip.key) ?? null
  }, [countryByKey, tooltip])

  const tooltipFocusValue = tooltipCountry?.valueByYear.get(focusYear)

  const handleFocusYearChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value)
    if (!Number.isFinite(value)) return

    setFocusYear(value)
    playPreviewCueThrottled()
    triggerScrubBump()
  }

  const handleGiniMinChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value)
    if (!Number.isFinite(value)) return

    setGiniMin(() => {
      const nextMin = clamp(value, safeGiniDomain[0], safeGiniDomain[1])
      if (nextMin > giniMax) {
        setGiniMax(nextMin)
      }
      return nextMin
    })

    playPreviewCueThrottled()
    triggerScrubBump()
  }

  const handleGiniMaxChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value)
    if (!Number.isFinite(value)) return

    setGiniMax(() => {
      const nextMax = clamp(value, safeGiniDomain[0], safeGiniDomain[1])
      if (nextMax < giniMin) {
        setGiniMin(nextMax)
      }
      return nextMax
    })

    playPreviewCueThrottled()
    triggerScrubBump()
  }

  const handlePrefixChange = (event: ChangeEvent<HTMLInputElement>) => {
    setPrefix(event.target.value)
    playPreviewCueThrottled()
    scheduleSettleCue()
  }

  const handleRegionToggle = (region: string) => {
    setSelectedRegions(previous => {
      const next = new Set(previous)
      if (next.has(region)) {
        next.delete(region)
      } else {
        next.add(region)
      }
      return next
    })

    playClickCue()
    triggerStageShake()
    triggerControlFlash(`region:${region}`)
  }

  const handleContextToggle = (event: ChangeEvent<HTMLInputElement>) => {
    setShowContext(event.target.checked)
    playClickCue()
    triggerStageShake()
    triggerControlFlash('context-toggle')
  }

  const handleClearFilters = () => {
    setFocusYear(defaultFocusYear)
    setGiniMin(safeGiniDomain[0])
    setGiniMax(safeGiniDomain[1])
    setSelectedRegions(new Set(regions))
    setPrefix('')
    setShowContext(true)
    setTooltip(null)
    setHoveredKey(null)
    hoverKeyRef.current = null

    playClickCue()
    triggerStageShake()
    triggerControlFlash('clear-filters')
  }

  const handleSliderPointerEnter = (slider: SliderAttention) => {
    setHoveredSlider(slider)
  }

  const handleSliderPointerLeave = (slider: SliderAttention) => {
    setHoveredSlider(previous => (previous === slider ? null : previous))
  }

  const handleSliderPointerDown = (slider: SliderAttention) => {
    setHoveredSlider(slider)
    setIsScrubbing(true)
    if (slider === 'focus') {
      setIsFocusDragging(true)
    } else {
      setIsFocusDragging(false)
    }
  }

  const handleSliderPointerUp = () => {
    setIsScrubbing(false)
    setIsFocusDragging(false)
    scheduleSettleCue()
    triggerImpact()
  }

  const handleMatchedPathMove = (
    event: React.MouseEvent<SVGPathElement, MouseEvent>,
    key: string
  ) => {
    const stage = stageRef.current
    if (!stage) return

    const rect = stage.getBoundingClientRect()
    const localX = event.clientX - rect.left + 12
    const localY = event.clientY - rect.top - 16

    if (juicyActive && hoverKeyRef.current !== key) {
      hoverKeyRef.current = key
      const now = performance.now()
      if (now - hoverSoundTimestampRef.current >= HOVER_SOUND_THROTTLE_MS) {
        hoverSoundTimestampRef.current = now
        playPopHoverRandomSound()
      }
    }

    if (hoveredSlider !== null) {
      setHoveredSlider(null)
    }

    setHoveredKey(key)
    setTooltip({
      key,
      x: clamp(localX, 8, rect.width - 184),
      y: clamp(localY, 8, rect.height - 88)
    })
  }

  const handleMatchedPathLeave = (key: string) => {
    if (hoverKeyRef.current === key) {
      hoverKeyRef.current = null
    }
    setHoveredKey(previous => (previous === key ? null : previous))
    setTooltip(previous => (previous?.key === key ? null : previous))
  }

  return (
    <div
      className={`filter-shell ${juicy ? 'filter-shell-juicy' : 'filter-shell-basic'} ${
        juicyActive && isScrubbing ? 'is-scrubbing' : ''
      } ${juicyActive && hoveredKey !== null ? 'is-line-hovering' : ''}`}
    >
      <div className="filter-layout">
        <div className="filter-main">
          <div className={`filter-stage ${juicyActive && isScrubbing ? 'is-scrubbing' : ''}`} ref={stageRef}>
            {juicyActive && (
              <>
                {sliderEngaged && <div className={`filter-vignette ${isScrubbing ? 'is-scrub' : ''}`} />}
                {impactNonce > 0 && <div key={`impact-${impactNonce}`} className="filter-impact-flash" />}
                {scrubBumpNonce > 0 && <div key={`scrub-bump-${scrubBumpNonce}`} className="filter-scrub-bump" />}
              </>
            )}
            {loading && <div className="filter-stage-status">Loading Gini dataset...</div>}
            {error && !loading && <div className="filter-stage-status is-error">Error loading data: {error}</div>}
            {!loading && !error && countries.length === 0 && (
              <div className="filter-stage-status is-error">No usable rows found in Gini dataset.</div>
            )}
            {!loading && !error && countries.length > 0 && (
              <>
                <svg
                  className="filter-svg"
                  width={chartWidth}
                  height={CHART_HEIGHT}
                  viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`}
                  role="img"
                  aria-label="Income inequality gini coefficient line chart with filter controls"
                >
                  <text x={chartWidth / 2} y={28} className="filter-title" textAnchor="middle">
                    Income inequality: Gini coefficient
                  </text>
                  <text x={chartWidth / 2} y={49} className="filter-subtitle" textAnchor="middle">
                    Filter
                  </text>

                  <rect
                    className="filter-instruction-box"
                    x={instructionX}
                    y={58}
                    width={instructionWidth}
                    height={24}
                    rx={9}
                    ry={9}
                  />
                  <text x={chartWidth / 2} y={74} className="filter-instruction" textAnchor="middle">
                    Adjust filters to show countries conditionally (range, region, prefix).
                  </text>

                  {yTicks.map(tick => (
                    <line
                      key={`grid-${tick}`}
                      className="filter-grid-line"
                      x1={CHART_MARGIN.left}
                      x2={CHART_MARGIN.left + plotWidth}
                      y1={yScale(tick)}
                      y2={yScale(tick)}
                    />
                  ))}

                  <line
                    className={`filter-threshold-line filter-threshold-max ${
                      hoveredSlider === 'max' ? 'is-attention' : ''
                    }`}
                    x1={CHART_MARGIN.left}
                    x2={CHART_MARGIN.left + plotWidth}
                    y1={yScale(giniMax)}
                    y2={yScale(giniMax)}
                  />
                  <line
                    className={`filter-threshold-line filter-threshold-min ${
                      hoveredSlider === 'min' ? 'is-attention' : ''
                    }`}
                    x1={CHART_MARGIN.left}
                    x2={CHART_MARGIN.left + plotWidth}
                    y1={yScale(giniMin)}
                    y2={yScale(giniMin)}
                  />

                  <line
                    className={`filter-focus-line ${
                      hoveredSlider === 'focus' ? 'is-attention' : ''
                    } ${
                      juicyActive && isFocusDragging ? 'is-dragging' : ''
                    }`}
                    x1={focusX}
                    x2={focusX}
                    y1={CHART_MARGIN.top}
                    y2={CHART_MARGIN.top + plotHeight}
                  />

                  <line
                    className="filter-axis-line"
                    x1={CHART_MARGIN.left}
                    x2={CHART_MARGIN.left + plotWidth}
                    y1={CHART_MARGIN.top + plotHeight}
                    y2={CHART_MARGIN.top + plotHeight}
                  />
                  <line
                    className="filter-axis-line"
                    x1={CHART_MARGIN.left}
                    x2={CHART_MARGIN.left}
                    y1={CHART_MARGIN.top}
                    y2={CHART_MARGIN.top + plotHeight}
                  />

                  {xTicks.map(tick => (
                    <g key={`x-${tick}`}>
                      <line
                        className="filter-axis-tick-line"
                        x1={xScale(tick)}
                        x2={xScale(tick)}
                        y1={CHART_MARGIN.top + plotHeight}
                        y2={CHART_MARGIN.top + plotHeight + 5}
                      />
                      <text
                        className="filter-axis-tick"
                        x={xScale(tick)}
                        y={CHART_MARGIN.top + plotHeight + 20}
                        textAnchor="middle"
                      >
                        {tick}
                      </text>
                    </g>
                  ))}

                  {yTicks.map(tick => (
                    <g key={`y-${tick}`}>
                      <line
                        className="filter-axis-tick-line"
                        x1={CHART_MARGIN.left - 5}
                        x2={CHART_MARGIN.left}
                        y1={yScale(tick)}
                        y2={yScale(tick)}
                      />
                      <text
                        className="filter-axis-tick"
                        x={CHART_MARGIN.left - 10}
                        y={yScale(tick) + 4}
                        textAnchor="end"
                      >
                        {formatGini(tick)}
                      </text>
                    </g>
                  ))}

                  <text
                    className="filter-axis-label"
                    x={CHART_MARGIN.left + plotWidth / 2}
                    y={CHART_MARGIN.top + plotHeight + 48}
                    textAnchor="middle"
                  >
                    Year
                  </text>
                  <text
                    className="filter-axis-label"
                    transform={`translate(${24}, ${CHART_MARGIN.top + plotHeight / 2}) rotate(-90)`}
                    textAnchor="middle"
                  >
                    Gini coefficient
                  </text>

                  <text
                    className={`filter-threshold-label filter-threshold-min-label ${
                      hoveredSlider === 'min' ? 'is-attention' : ''
                    }`}
                    x={CHART_MARGIN.left + plotWidth - 8}
                    y={yScale(giniMin) + 14}
                    textAnchor="end"
                  >
                    Gini min
                  </text>
                  <text
                    className={`filter-threshold-label filter-threshold-max-label ${
                      hoveredSlider === 'max' ? 'is-attention' : ''
                    }`}
                    x={CHART_MARGIN.left + plotWidth - 8}
                    y={yScale(giniMax) - 8}
                    textAnchor="end"
                  >
                    Gini max
                  </text>

                  <rect
                    className={`filter-plot-outline ${
                      juicyActive && hoveredSlider !== null ? 'is-attention' : ''
                    } ${juicyActive && isScrubbing ? 'is-scrubbing' : ''}`}
                    x={CHART_MARGIN.left}
                    y={CHART_MARGIN.top}
                    width={plotWidth}
                    height={plotHeight}
                    rx={4}
                    ry={4}
                  />

                  <g className="filter-lines-layer">
                    {visibleCountries.map(country => {
                      const key = getCountryKey(country)
                      const path = getPath(country)
                      if (!path) return null

                      const isMatched = matchedKeySet.has(key)
                      const isEntering = juicyActive && enteringKeySet.has(key)
                      const isPulse = juicyActive && pulseKeySet.has(key)
                      const isHovered = hoveredKey === key

                      const className = [
                        'filter-line',
                        isMatched ? 'is-matched' : 'is-context',
                        isHovered ? 'is-hovered' : '',
                        isEntering ? 'is-enter' : '',
                        isPulse ? 'is-pulse' : ''
                      ]
                        .filter(Boolean)
                        .join(' ')

                      return (
                        <g key={`country-${key}`}>
                          <path d={path} className={className} />
                          {isMatched && (
                            <path
                              d={path}
                              className="filter-line-hit"
                              onMouseMove={event => handleMatchedPathMove(event, key)}
                              onMouseLeave={() => handleMatchedPathLeave(key)}
                            />
                          )}
                        </g>
                      )
                    })}
                  </g>

                  {juicyActive && !showContext && exitingCountries.length > 0 && (
                    <g className="filter-exit-layer">
                      {exitingCountries.map(country => {
                        const key = getCountryKey(country)
                        const path = getPath(country)
                        if (!path) return null
                        return <path key={`exit-${key}`} d={path} className="filter-line filter-line-exit" />
                      })}
                    </g>
                  )}

                  <g className="filter-focus-points">
                    {matchedFocusDots.map(dot => (
                      <circle key={`focus-dot-${dot.key}`} className="filter-focus-dot" cx={focusX} cy={dot.y} r={5.2} />
                    ))}
                  </g>

                  {matchedCount === 0 && (
                    <text
                      className="filter-empty-label"
                      x={CHART_MARGIN.left + plotWidth / 2}
                      y={CHART_MARGIN.top + plotHeight / 2}
                      textAnchor="middle"
                    >
                      No countries match current filters
                    </text>
                  )}
                </svg>

                {tooltip && tooltipCountry && (
                  <div
                    className={`filter-tooltip ${juicyActive ? 'is-juicy' : ''}`}
                    style={{ left: tooltip.x, top: tooltip.y }}
                  >
                    <div className="filter-tooltip-country">{tooltipCountry.entity}</div>
                    <div className="filter-tooltip-region">Region: {tooltipCountry.region}</div>
                    <div className="filter-tooltip-value">
                      {focusYear}: {tooltipFocusValue !== undefined ? formatGini(tooltipFocusValue) : 'N/A'}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <aside className="filter-panel">
          <section className="filter-panel-section">
            <div className="filter-count-label">Matched countries</div>
            <div
              key={`matched-count-${countPopNonce}-${matchedCount}`}
              className={`filter-count-badge ${juicyActive ? 'is-pop' : ''}`}
            >
              <span className="filter-count-current">{matchedCount}</span>
              <span className="filter-count-divider">/</span>
              <span className="filter-count-total">{totalCountries}</span>
            </div>
          </section>

          <section className="filter-panel-section">
            <label className="filter-control-label" htmlFor="filter-focus-year">
              Focus Year: <strong>{focusYear}</strong>
            </label>
            <input
              id="filter-focus-year"
              className="filter-range"
              type="range"
              min={years[0] ?? 1963}
              max={years[years.length - 1] ?? 2024}
              step={1}
              value={focusYear}
              onChange={handleFocusYearChange}
              onPointerEnter={() => handleSliderPointerEnter('focus')}
              onPointerLeave={() => handleSliderPointerLeave('focus')}
              onPointerDown={() => handleSliderPointerDown('focus')}
              onPointerUp={handleSliderPointerUp}
              onPointerCancel={handleSliderPointerUp}
              onBlur={handleSliderPointerUp}
              disabled={loading || Boolean(error) || years.length === 0}
            />
          </section>

          <section className="filter-panel-section">
            <label className="filter-control-label" htmlFor="filter-gini-min">
              Gini min: <strong>{formatGini(giniMin)}</strong>
            </label>
            <input
              id="filter-gini-min"
              className="filter-range"
              type="range"
              min={safeGiniDomain[0]}
              max={safeGiniDomain[1]}
              step={0.01}
              value={giniMin}
              onChange={handleGiniMinChange}
              onPointerEnter={() => handleSliderPointerEnter('min')}
              onPointerLeave={() => handleSliderPointerLeave('min')}
              onPointerDown={() => handleSliderPointerDown('min')}
              onPointerUp={handleSliderPointerUp}
              onPointerCancel={handleSliderPointerUp}
              onBlur={handleSliderPointerUp}
              disabled={loading || Boolean(error) || countries.length === 0}
            />

            <label className="filter-control-label" htmlFor="filter-gini-max">
              Gini max: <strong>{formatGini(giniMax)}</strong>
            </label>
            <input
              id="filter-gini-max"
              className="filter-range"
              type="range"
              min={safeGiniDomain[0]}
              max={safeGiniDomain[1]}
              step={0.01}
              value={giniMax}
              onChange={handleGiniMaxChange}
              onPointerEnter={() => handleSliderPointerEnter('max')}
              onPointerLeave={() => handleSliderPointerLeave('max')}
              onPointerDown={() => handleSliderPointerDown('max')}
              onPointerUp={handleSliderPointerUp}
              onPointerCancel={handleSliderPointerUp}
              onBlur={handleSliderPointerUp}
              disabled={loading || Boolean(error) || countries.length === 0}
            />
          </section>

          <section className="filter-panel-section">
            <div className="filter-control-label">Regions</div>
            <div className="filter-region-list">
              {regions.map(region => {
                const regionControlId = `region:${region}`
                return (
                  <label
                    className={`filter-region-row ${
                      juicyActive && flashControlId === regionControlId ? 'is-flash' : ''
                    }`}
                    key={`region-${region}`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedRegions.has(region)}
                      onChange={() => handleRegionToggle(region)}
                      disabled={loading || Boolean(error)}
                    />
                    <span>{region}</span>
                  </label>
                )
              })}
            </div>
          </section>

          <section className="filter-panel-section">
            <label className="filter-control-label" htmlFor="filter-prefix">
              Country prefix
            </label>
            <input
              id="filter-prefix"
              className="filter-text-input"
              type="text"
              value={prefix}
              onChange={handlePrefixChange}
              placeholder='e.g. "Uni"'
              disabled={loading || Boolean(error)}
            />
          </section>

          <section className="filter-panel-section">
            <label
              className={`filter-context-row ${
                juicyActive && flashControlId === 'context-toggle' ? 'is-flash' : ''
              }`}
            >
              <input
                type="checkbox"
                checked={showContext}
                onChange={handleContextToggle}
                disabled={loading || Boolean(error)}
              />
              <span>Show context (fade non-matching)</span>
            </label>
          </section>

          <section className="filter-panel-section">
            <button
              type="button"
              className={`filter-clear-btn ${juicyActive && flashControlId === 'clear-filters' ? 'is-flash' : ''}`}
              onClick={handleClearFilters}
              disabled={loading || Boolean(error) || countries.length === 0}
            >
              Clear filters
            </button>
          </section>
        </aside>
      </div>
    </div>
  )
}
