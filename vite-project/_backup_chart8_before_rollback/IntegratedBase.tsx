import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent
} from 'react'
import * as d3 from 'd3'
import {
  playClick5TickSound,
  playDingdong1Sound,
  playPop1Sound,
  playPop4Sound,
  playPopHoverRandomSound,
  playWhooshSound
} from '../../utils/soundUtils'
import { useInternetData, type InternetCountrySeries, type InternetPoint } from './useInternetData'

interface IntegratedBaseProps {
  juicyLevel: number
}

type Representation = 'beeswarm' | 'histogram'
type SortMode = 'value' | 'growth' | 'volatility'
type DetailLevel = 0 | 1 | 2
type PreHintRegion = 'none' | 'explore' | 'filter' | 'viewA' | 'viewB' | 'viewC'
type ScrubKind = 'none' | 'selection' | 'explore' | 'filter'
type HotControl = 'relatedCount' | 'focusYear' | 'windowStart' | 'windowEnd' | 'valueMin' | 'valueMax'
type RegionName = 'Africa' | 'Asia' | 'Europe' | 'North America' | 'Oceania' | 'South America' | 'Unknown'

interface FocusEntry {
  key: string
  country: InternetCountrySeries
  value: number
}

interface RowMetric {
  key: string
  country: InternetCountrySeries
  focusValue: number | null
  growth: number
  volatility: number
  metricValue: number
}

interface BeeswarmNode extends d3.SimulationNodeDatum {
  key: string
  entity: string
  value: number
  x: number
  y: number
}

interface HistogramBar {
  index: number
  x0: number
  x1: number
  y: number
  h: number
  total: number
  active: number
  keys: string[]
}

interface LineDescriptor {
  key: string
  country: InternetCountrySeries
  path: string
  points: InternetPoint[]
}

interface TooltipState {
  key: string
  x: number
  y: number
}

interface HistTooltip {
  index: number
  x: number
  y: number
}

interface PendingTooltip {
  key: string
  x: number
  y: number
}

interface RegionCsvRow {
  Entity?: string
  Code?: string
  'World region according to OWID'?: string
}

const CHART_HEIGHT = 860
const DEFAULT_WIDTH = 1080
const MIN_WIDTH = 760
const TOP_ROWS = 24
const DOT_R = 4.2
const BEESWARM_TICKS = 140
const HIST_BINS = 12
const HOVER_THROTTLE = 90
const DRAG_THROTTLE = 70
const POST_TOAST_THROTTLE = 350
const FILTER_POST_THROTTLE = 140
const TOOLTIP_MOVE_EPS = 5
const IN_EVENT_KINDS = new Set(['select_commit', 'explore_scrub', 'reconfig_reorder', 'encode_switch', 'filter_apply', 'abstract_adjust'])

const MARGIN = { top: 118, right: 28, bottom: 66, left: 72 }
const RELATED_PALETTE = ['#4f46e5', '#7c3aed', '#22c3ee', '#3f7de4', '#7480ff', '#6f44f0', '#2f89d8']
const LEGEND_REGIONS: RegionName[] = ['Africa', 'Asia', 'Europe', 'North America', 'Oceania', 'South America']
const fmt = d3.format('.2f')

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value))
const safeMetric = (value: number | null): number => (value === null || !Number.isFinite(value) ? Number.NEGATIVE_INFINITY : value)
const toRangePct = (value: number, min: number, max: number): string => {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) return '0%'
  const pct = ((value - min) / (max - min)) * 100
  return `${clamp(pct, 0, 100).toFixed(2)}%`
}

const clearTimeoutRef = (ref: React.MutableRefObject<number | null>) => {
  if (ref.current !== null) {
    window.clearTimeout(ref.current)
    ref.current = null
  }
}

const normalizeEntityName = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/\s+/g, ' ')

const normalizeRegion = (value: string): RegionName => {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'africa') return 'Africa'
  if (normalized === 'asia') return 'Asia'
  if (normalized === 'europe') return 'Europe'
  if (normalized === 'north america') return 'North America'
  if (normalized === 'oceania') return 'Oceania'
  if (normalized === 'south america') return 'South America'
  return 'Unknown'
}

const nearestYear = (value: number, years: number[]): number => {
  if (years.length === 0) return Math.round(value)
  let best = years[0]
  let bestDistance = Math.abs(value - best)
  for (let index = 1; index < years.length; index += 1) {
    const year = years[index]
    const distance = Math.abs(value - year)
    if (distance < bestDistance) {
      best = year
      bestDistance = distance
    }
  }
  return best
}

const stddev = (values: number[]): number => {
  if (values.length <= 1) return 0
  const mean = d3.mean(values)
  if (mean === undefined) return 0
  const variance = d3.mean(values.map(value => (value - mean) ** 2))
  return variance === undefined ? 0 : Math.sqrt(variance)
}

export default function IntegratedBase({ juicyLevel }: IntegratedBaseProps) {
  const { loading, error, countries, years, valueDomain, metadata } = useInternetData()

  const isPlainMode = juicyLevel === 0
  const isJuicyOne = juicyLevel === 1
  const useReadableViewALabel = isPlainMode || isJuicyOne
  const preOn = juicyLevel === 1 || juicyLevel === 4 || juicyLevel === 5 || juicyLevel === 7
  const inOn = juicyLevel === 2 || juicyLevel === 4 || juicyLevel === 6 || juicyLevel === 7
  const postOn = juicyLevel === 3 || juicyLevel === 5 || juicyLevel === 6 || juicyLevel === 7

  const [chartWidth, setChartWidth] = useState(DEFAULT_WIDTH)
  const [focusYear, setFocusYear] = useState(2015)
  const [startYear, setStartYear] = useState(1995)
  const [endYear, setEndYear] = useState(2020)
  const [representation, setRepresentation] = useState<Representation>('beeswarm')
  const [sortMode, setSortMode] = useState<SortMode>('value')
  const [detailLevel, setDetailLevel] = useState<DetailLevel>(1)
  const [valueMin, setValueMin] = useState(0)
  const [valueMax, setValueMax] = useState(100)
  const [countryPrefix, setCountryPrefix] = useState('')
  const [showContext, setShowContext] = useState(true)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)
  const [hoveredGroupKeys, setHoveredGroupKeys] = useState<string[]>([])
  const [hoveredBinIndex, setHoveredBinIndex] = useState<number | null>(null)
  const [relatedCount, setRelatedCount] = useState(6)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [histTooltip, setHistTooltip] = useState<HistTooltip | null>(null)
  const [isScrubbing, setIsScrubbing] = useState(false)
  const [activeScrubKind, setActiveScrubKind] = useState<ScrubKind>('none')
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null)
  const [previewSortMode, setPreviewSortMode] = useState<SortMode | null>(null)
  const [previewDetailLevel, setPreviewDetailLevel] = useState<DetailLevel | null>(null)
  const [hotControl, setHotControl] = useState<HotControl | null>(null)
  const [enabledRegions, setEnabledRegions] = useState<Record<RegionName, boolean>>({
    Africa: true,
    Asia: true,
    Europe: true,
    'North America': true,
    Oceania: true,
    'South America': true,
    Unknown: true
  })
  const [hoverRegion, setHoverRegion] = useState<RegionName | null>(null)
  const [regionMapLoading, setRegionMapLoading] = useState(true)
  const [regionMapError, setRegionMapError] = useState<string | null>(null)
  const [regionByCode, setRegionByCode] = useState<Map<string, RegionName>>(new Map())
  const [regionByEntity, setRegionByEntity] = useState<Map<string, RegionName>>(new Map())
  const [preHintRegion, setPreHintRegion] = useState<PreHintRegion>('none')
  const [showFilterGuides, setShowFilterGuides] = useState(false)
  const [selectCommitNonce, setSelectCommitNonce] = useState(0)
  const [selectCommitPoint, setSelectCommitPoint] = useState<{ x: number; y: number } | null>(null)

  const [impactNonce, setImpactNonce] = useState(0)
  const [settleNonce, setSettleNonce] = useState(0)
  const [rippleNonce, setRippleNonce] = useState(0)
  const [ripplePoint, setRipplePoint] = useState<{ x: number; y: number } | null>(null)
  const [encodeSwitching, setEncodeSwitching] = useState(false)
  const [titlePulseNonce, setTitlePulseNonce] = useState(0)
  const [relatedPulseNonce, setRelatedPulseNonce] = useState(0)
  const [countPulseNonce, setCountPulseNonce] = useState(0)
  const [previewRepresentation, setPreviewRepresentation] = useState<Representation | null>(null)
  const [focusPulseNonce, setFocusPulseNonce] = useState(0)
  const [windowPulseNonce, setWindowPulseNonce] = useState(0)
  const [attentionTarget, setAttentionTarget] = useState<'focus' | 'window' | null>(null)
  const [reorderNonce, setReorderNonce] = useState(0)
  const [postEncodeNonce, setPostEncodeNonce] = useState(0)
  const [postReconfigNonce, setPostReconfigNonce] = useState(0)
  const [postExploreNonce, setPostExploreNonce] = useState(0)
  const [postFilterNonce, setPostFilterNonce] = useState(0)
  const [postSelectNonce, setPostSelectNonce] = useState(0)
  const [postAbstractNonce, setPostAbstractNonce] = useState(0)
  const [postConnectNonce, setPostConnectNonce] = useState(0)

  const stageRef = useRef<HTMLDivElement | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const brushLayerRef = useRef<SVGGElement | null>(null)
  const brushBehaviorRef = useRef<d3.BrushBehavior<unknown> | null>(null)
  const brushConfigRef = useRef<{ xScaleYear: d3.ScaleLinear<number, number>; years: number[]; clampWindow: (nextStart: number, nextEnd: number) => { start: number; end: number }; emitIn: (kind: string) => void; finalizeExplorePost: (range?: { start: number; end: number }) => void } | null>(null)
  const suppressBrushRef = useRef(false)
  const initializedRef = useRef(false)
  const hoverKeyRef = useRef<string | null>(null)
  const hoveredKeyRef = useRef<string | null>(null)
  const pendingHoverKeyRef = useRef<string | null>(null)
  const hoverRafRef = useRef<number | null>(null)
  const tooltipRafRef = useRef<number | null>(null)
  const pendingTooltipRef = useRef<PendingTooltip | null>(null)
  const lastTooltipRef = useRef<PendingTooltip | null>(null)
  const preGuideRafRef = useRef<number | null>(null)
  const preGuideVARef = useRef<SVGLineElement | null>(null)
  const preGuideHARef = useRef<SVGLineElement | null>(null)
  const preGuideHBRef = useRef<SVGLineElement | null>(null)
  const pendingStagePointerRef = useRef<{ x: number; y: number } | null>(null)
  const lastSelectPressPointRef = useRef<{ x: number; y: number } | null>(null)
  const hoveredControlRef = useRef<HotControl | null>(null)
  const pendingHoverRegionRef = useRef<RegionName | null>(null)
  const regionHoverRafRef = useRef<number | null>(null)
  const brushRafRef = useRef<number | null>(null)
  const lastBrushTsRef = useRef(0)
  const pendingBrushSelectionRef = useRef<[number, number] | null>(null)

  const hoverTsRef = useRef(0)
  const dragTsRef = useRef(0)
  const toastTsRef = useRef(0)
  const lastFilterPostTsRef = useRef(0)
  const toastTimeoutRef = useRef<number | null>(null)
  const filterTimeoutRef = useRef<number | null>(null)
  const encodeTimeoutRef = useRef<number | null>(null)
  const selectTimeoutRef = useRef<number | null>(null)
  const connectTimeoutRef = useRef<number | null>(null)
  const reconfigTimeoutRef = useRef<number | null>(null)
  const abstractTimeoutRef = useRef<number | null>(null)

  const motionAllowed = !prefersReducedMotion

  const defaultFocusYear = useMemo(() => {
    if (years.length === 0) return 2015
    if (years.includes(2015)) return 2015
    return years[Math.floor(years.length / 2)] ?? 2015
  }, [years])

  const defaultWindow = useMemo(() => {
    if (years.length === 0) return { start: 1995, end: 2020 }
    const minYear = years[0]
    const maxYear = years[years.length - 1]
    const start = nearestYear(clamp(Math.max(1995, minYear), minYear, maxYear), years)
    const end = nearestYear(clamp(Math.min(2020, maxYear), minYear, maxYear), years)
    return start <= end ? { start, end } : { start: end, end }
  }, [years])

  const minYear = years[0] ?? 1990
  const maxYear = years[years.length - 1] ?? 2024

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setPrefersReducedMotion(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    let cancelled = false

    const loadRegionMap = async () => {
      try {
        setRegionMapLoading(true)
        const response = await fetch(`${import.meta.env.BASE_URL}economic-inequality-gini-index.csv`)
        if (!response.ok) {
          throw new Error(`Failed to load region mapping (${response.status})`)
        }
        const csvText = await response.text()
        if (cancelled) return

        const codeMap = new Map<string, RegionName>()
        const entityMap = new Map<string, RegionName>()

        d3.csvParse(csvText, row => row as unknown as RegionCsvRow).forEach(row => {
          const entity = (row.Entity ?? '').trim()
          const code = (row.Code ?? '').trim().toUpperCase()
          const region = normalizeRegion(row['World region according to OWID'] ?? '')
          if (!entity && !code) return
          if (entity) {
            const normalizedEntity = normalizeEntityName(entity)
            if (normalizedEntity && !entityMap.has(normalizedEntity)) {
              entityMap.set(normalizedEntity, region)
            }
          }
          if (code && !code.startsWith('OWID') && !codeMap.has(code)) {
            codeMap.set(code, region)
          }
        })

        setRegionByCode(codeMap)
        setRegionByEntity(entityMap)
        setRegionMapError(null)
      } catch (regionLoadError) {
        if (cancelled) return
        setRegionByCode(new Map())
        setRegionByEntity(new Map())
        setRegionMapError(regionLoadError instanceof Error ? regionLoadError.message : String(regionLoadError))
      } finally {
        if (!cancelled) setRegionMapLoading(false)
      }
    }

    void loadRegionMap()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (preOn) return
    pendingHoverRegionRef.current = null
    if (regionHoverRafRef.current !== null) {
      window.cancelAnimationFrame(regionHoverRafRef.current)
      regionHoverRafRef.current = null
    }
    setHoverRegion(null)
  }, [preOn])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage || typeof ResizeObserver === 'undefined') return
    const update = () => setChartWidth(previous => {
      const next = Math.max(MIN_WIDTH, Math.round(stage.clientWidth))
      return Math.abs(previous - next) < 2 ? previous : next
    })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (loading || error || years.length === 0) return
    if (initializedRef.current) return
    setFocusYear(defaultFocusYear)
    setStartYear(defaultWindow.start)
    setEndYear(defaultWindow.end)
    initializedRef.current = true
  }, [defaultFocusYear, defaultWindow.end, defaultWindow.start, error, loading, years.length])

  useEffect(() => {
    if (years.length === 0) return
    if (!years.includes(focusYear)) {
      setFocusYear(defaultFocusYear)
      return
    }
    if (focusYear < startYear) setFocusYear(startYear)
    if (focusYear > endYear) setFocusYear(endYear)
  }, [defaultFocusYear, endYear, focusYear, startYear, years])

  useEffect(() => {
    if (years.length === 0) return
    if (!years.includes(startYear)) setStartYear(nearestYear(startYear, years))
    if (!years.includes(endYear)) setEndYear(nearestYear(endYear, years))
    if (startYear > endYear) setStartYear(endYear)
  }, [endYear, startYear, years])

  const pushToast = useCallback((text: string) => {
    const now = performance.now()
    if (now - toastTsRef.current < POST_TOAST_THROTTLE) return
    toastTsRef.current = now
    clearTimeoutRef(toastTimeoutRef)
    const id = Math.round(now)
    setToast({ id, text })
    toastTimeoutRef.current = window.setTimeout(() => {
      setToast(previous => (previous?.id === id ? null : previous))
      toastTimeoutRef.current = null
    }, 1200)
  }, [])

  const scheduleHoveredKey = useCallback((nextKey: string | null) => {
    pendingHoverKeyRef.current = nextKey
    if (hoverRafRef.current !== null) return
    hoverRafRef.current = window.requestAnimationFrame(() => {
      hoverRafRef.current = null
      const next = pendingHoverKeyRef.current
      if (hoveredKeyRef.current === next) return
      hoveredKeyRef.current = next
      setHoveredKey(next)
    })
  }, [])

  const scheduleTooltip = useCallback((next: PendingTooltip | null) => {
    pendingTooltipRef.current = next
    if (tooltipRafRef.current !== null) return
    tooltipRafRef.current = window.requestAnimationFrame(() => {
      tooltipRafRef.current = null
      const pending = pendingTooltipRef.current
      if (!pending) {
        if (lastTooltipRef.current !== null) {
          lastTooltipRef.current = null
          setTooltip(null)
        }
        return
      }
      const previous = lastTooltipRef.current
      if (
        previous &&
        previous.key === pending.key &&
        Math.abs(previous.x - pending.x) < TOOLTIP_MOVE_EPS &&
        Math.abs(previous.y - pending.y) < TOOLTIP_MOVE_EPS
      ) return
      lastTooltipRef.current = pending
      setTooltip({ key: pending.key, x: pending.x, y: pending.y })
    })
  }, [])

  const emitPre = useCallback((kind: string, payload?: { x?: number; y?: number }) => {
    if (!preOn) return
    if (kind === 'connect_ready' || kind === 'reconfig_hover' || kind === 'encode_preview' || kind === 'abstract_hint' || kind === 'filter_focus' || kind === 'explore_grab') {
      const now = performance.now()
      if (now - hoverTsRef.current < HOVER_THROTTLE) return
      hoverTsRef.current = now
    }

    if (kind === 'select_press') playPop1Sound()
    else playPopHoverRandomSound()

    if (!motionAllowed) return
    if (kind === 'select_press' && payload?.x !== undefined && payload?.y !== undefined) {
      setRipplePoint({ x: payload.x, y: payload.y })
      setRippleNonce(previous => previous + 1)
    }
  }, [motionAllowed, preOn])

  const emitIn = useCallback((kind: string) => {
    if (!inOn) return
    if (!IN_EVENT_KINDS.has(kind)) return
    if (kind === 'explore_scrub') {
      const now = performance.now()
      if (now - dragTsRef.current < DRAG_THROTTLE) return
      dragTsRef.current = now
      playClick5TickSound()
    } else {
      playPop4Sound()
    }

    if (!motionAllowed) return
    if (kind === 'select_commit' || kind === 'explore_scrub' || kind === 'reconfig_reorder' || kind === 'encode_switch' || kind === 'filter_apply') {
      setImpactNonce(previous => previous + 1)
    }
    if (kind === 'explore_scrub') {
      setFocusPulseNonce(previous => previous + 1)
      setWindowPulseNonce(previous => previous + 1)
    }
  }, [inOn, motionAllowed])

  const emitPost = useCallback((kind: string, payload?: { start?: number; end?: number; count?: number; label?: string }) => {
    if (!postOn) return
    if (kind === 'connect_reveal') playWhooshSound()
    else playDingdong1Sound()

    if (kind === 'filter_done') pushToast(`Filter applied: ${payload?.count ?? 0} countries`)
    else if (kind === 'explore_set') pushToast(`Window set: ${payload?.start ?? startYear}–${payload?.end ?? endYear}`)
    else if (kind === 'reconfig_done') pushToast(`Sorted by: ${payload?.label ?? sortMode}`)
    else if (kind === 'encode_done') pushToast(`Encoding switched: ${representation}`)
    else if (kind === 'abstract_set') pushToast(`Detail level: ${detailLevel}`)
    else if (kind === 'select_settle') pushToast('Selection updated')
    else if (kind === 'connect_reveal') pushToast('Related countries revealed')

    if (!motionAllowed) return
    setSettleNonce(previous => previous + 1)
  }, [detailLevel, endYear, motionAllowed, postOn, pushToast, representation, sortMode, startYear])

  useEffect(() => {
    hoveredKeyRef.current = hoveredKey
  }, [hoveredKey])

  useEffect(() => {
    return () => {
      clearTimeoutRef(toastTimeoutRef)
      clearTimeoutRef(filterTimeoutRef)
      clearTimeoutRef(encodeTimeoutRef)
      clearTimeoutRef(selectTimeoutRef)
      clearTimeoutRef(connectTimeoutRef)
      clearTimeoutRef(reconfigTimeoutRef)
      clearTimeoutRef(abstractTimeoutRef)
      if (hoverRafRef.current !== null) window.cancelAnimationFrame(hoverRafRef.current)
      if (tooltipRafRef.current !== null) window.cancelAnimationFrame(tooltipRafRef.current)
      if (preGuideRafRef.current !== null) window.cancelAnimationFrame(preGuideRafRef.current)
      if (regionHoverRafRef.current !== null) window.cancelAnimationFrame(regionHoverRafRef.current)
      if (brushRafRef.current !== null) window.cancelAnimationFrame(brushRafRef.current)
    }
  }, [])

  const countryByKey = useMemo(() => {
    const map = new Map<string, InternetCountrySeries>()
    countries.forEach(country => map.set(country.key, country))
    return map
  }, [countries])

  const normalizedPrefix = countryPrefix.trim().toLowerCase()

  const focusEntries = useMemo<FocusEntry[]>(() => {
    return countries
      .map(country => {
        const value = country.valueByYear.get(focusYear)
        if (value === undefined) return null
        return { key: country.key, country, value }
      })
      .filter((entry): entry is FocusEntry => entry !== null)
  }, [countries, focusYear])

  const regionByCountryKey = useMemo(() => {
    const map = new Map<string, RegionName>()
    countries.forEach(country => {
      const normalizedEntity = normalizeEntityName(country.entity)
      const normalizedCode = country.code.trim().toUpperCase()
      const region = regionByCode.get(normalizedCode) ?? regionByEntity.get(normalizedEntity) ?? 'Unknown'
      map.set(country.key, region)
    })
    return map
  }, [countries, regionByCode, regionByEntity])

  const activeKeySet = useMemo(() => {
    const set = new Set<string>()
    focusEntries.forEach(entry => {
      if (normalizedPrefix && !entry.country.entity.toLowerCase().startsWith(normalizedPrefix)) return
      if (entry.value < valueMin || entry.value > valueMax) return
      const region = regionByCountryKey.get(entry.key) ?? 'Unknown'
      if (!enabledRegions[region]) return
      set.add(entry.key)
    })
    return set
  }, [enabledRegions, focusEntries, normalizedPrefix, regionByCountryKey, valueMax, valueMin])

  const activeEntries = useMemo(() => focusEntries.filter(entry => activeKeySet.has(entry.key)), [activeKeySet, focusEntries])

  const relatedItems = useMemo(() => {
    const selectedCountry = selectedKey ? countryByKey.get(selectedKey) ?? null : null
    const selectedValue = selectedCountry?.valueByYear.get(focusYear)
    if (!selectedKey || selectedValue === undefined) return []
    return activeEntries
      .filter(entry => entry.key !== selectedKey)
      .map(entry => ({ key: entry.key, country: entry.country, value: entry.value, diff: Math.abs(entry.value - selectedValue) }))
      .sort((a, b) => a.diff - b.diff || a.country.entity.localeCompare(b.country.entity))
      .slice(0, relatedCount)
  }, [activeEntries, countryByKey, focusYear, relatedCount, selectedKey])

  const relatedKeys = useMemo(() => relatedItems.map(item => item.key), [relatedItems])
  const relatedKeySet = useMemo(() => new Set(relatedKeys), [relatedKeys])
  const hoveredGroupSet = useMemo(() => new Set(hoveredGroupKeys), [hoveredGroupKeys])

  const emphasisKeySet = useMemo(() => {
    const set = new Set<string>()
    if (selectedKey) set.add(selectedKey)
    relatedKeys.forEach(key => set.add(key))
    return set
  }, [relatedKeys, selectedKey])

  const focusVisibleSet = useMemo(() => {
    const set = new Set<string>(activeKeySet)
    emphasisKeySet.forEach(key => {
      const region = regionByCountryKey.get(key) ?? 'Unknown'
      if (enabledRegions[region]) set.add(key)
    })
    return set
  }, [activeKeySet, emphasisKeySet, enabledRegions, regionByCountryKey])

  const visibleKeySet = useMemo(() => (showContext ? null : focusVisibleSet), [focusVisibleSet, showContext])
  const regionHoverKeySet = useMemo(() => {
    if (!preOn || !hoverRegion) return null
    const set = new Set<string>()
    regionByCountryKey.forEach((region, key) => {
      if (region === hoverRegion) set.add(key)
    })
    return set
  }, [hoverRegion, preOn, regionByCountryKey])

  const colorByRelated = useMemo(() => {
    const map = new Map<string, string>()
    relatedKeys.forEach((key, index) => map.set(key, RELATED_PALETTE[index % RELATED_PALETTE.length]))
    return map
  }, [relatedKeys])

  const accentFor = useCallback((key: string) => {
    if (key === selectedKey) return '#4f46e5'
    return colorByRelated.get(key) ?? '#7c3aed'
  }, [colorByRelated, selectedKey])

  const totalCount = focusEntries.length
  const activeCount = activeEntries.length

  const plotWidth = Math.max(260, chartWidth - MARGIN.left - MARGIN.right)
  const plotHeight = CHART_HEIGHT - MARGIN.top - MARGIN.bottom
  const COL_GAP = 18
  const LEFT_FRAC = 0.66
  const leftW = Math.round(plotWidth * LEFT_FRAC)
  const rightW = plotWidth - leftW - COL_GAP
  const leftX0 = MARGIN.left
  const rightX0 = MARGIN.left + leftW + COL_GAP
  const columnDividerX = leftX0 + leftW + COL_GAP / 2

  const viewAHeight = Math.round(plotHeight * 0.30)
  const viewGap = 72
  const viewBHeight = plotHeight - viewAHeight - viewGap

  const viewATop = MARGIN.top
  const viewABottom = viewATop + viewAHeight
  const dividerY = viewABottom + viewGap / 2
  const viewBTop = viewABottom + viewGap
  const viewBBottom = viewBTop + viewBHeight
  const viewCTop = MARGIN.top
  const viewCHeight = plotHeight
  const VIEW_C_HEADER_H = 22

  useEffect(() => {
    pendingStagePointerRef.current = null
    if (preGuideVARef.current) preGuideVARef.current.style.opacity = '0'
    if (preGuideHARef.current) preGuideHARef.current.style.opacity = '0'
    if (preGuideHBRef.current) preGuideHBRef.current.style.opacity = '0'
    setPreHintRegion(previous => (previous === 'viewA' || previous === 'viewB' ? 'none' : previous))
  }, [chartWidth, leftW, viewATop, viewABottom, viewBTop, viewBBottom])

  const xScaleValue = useMemo(() => d3.scaleLinear().domain([0, 100]).range([leftX0, leftX0 + leftW]), [leftW, leftX0])

  const showKey = useCallback((key: string) => visibleKeySet === null || visibleKeySet.has(key), [visibleKeySet])

  const entriesA = useMemo(() => focusEntries.filter(entry => showKey(entry.key)), [focusEntries, showKey])

  /*
   * Profiling checklist:
   * 1) Chrome Performance: inspect mousemove/hover for long tasks and layout thrash.
   * 2) React Profiler: verify hover only updates style state, not full geometry memos.
   * 3) Wrap expensive blocks (beeswarm, line paths, ranking sort) with performance.mark/measure when tuning.
   */
  const beeswarmNodes = useMemo<BeeswarmNode[]>(() => {
    const needsBeeswarmNodes = representation === 'beeswarm' || (preOn && previewRepresentation === 'beeswarm')
    if (!needsBeeswarmNodes) return []
    if (entriesA.length === 0) return []
    const yCenter = viewATop + viewAHeight * 0.52
    const nodes: BeeswarmNode[] = entriesA.map(entry => ({ key: entry.key, entity: entry.country.entity, value: entry.value, x: xScaleValue(entry.value), y: yCenter }))
    const simulation = d3.forceSimulation(nodes)
      .force('x', d3.forceX<BeeswarmNode>(node => xScaleValue(node.value)).strength(0.9))
      .force('y', d3.forceY<BeeswarmNode>(yCenter).strength(0.12))
      .force('collide', d3.forceCollide<BeeswarmNode>(5).iterations(2))
      .stop()
    for (let tick = 0; tick < BEESWARM_TICKS; tick += 1) simulation.tick()
    simulation.stop()
    const left = leftX0 + DOT_R + 1
    const right = leftX0 + leftW - DOT_R - 1
    const top = viewATop + 22
    const bottom = viewABottom - 18
    return nodes.map(node => ({ ...node, x: clamp(node.x ?? xScaleValue(node.value), left, right), y: clamp(node.y ?? yCenter, top, bottom) }))
  }, [entriesA, leftW, leftX0, preOn, previewRepresentation, representation, viewABottom, viewAHeight, viewATop, xScaleValue])

  const beeswarmByKey = useMemo(() => new Map(beeswarmNodes.map(node => [node.key, node] as const)), [beeswarmNodes])

  const histBars = useMemo<HistogramBar[]>(() => {
    if (entriesA.length === 0) return []
    const binner = d3.bin<FocusEntry, number>().domain([0, 100]).thresholds(HIST_BINS).value(entry => entry.value)
    const bins = binner(entriesA)
    const maxCount = d3.max(bins, bin => bin.length) ?? 1
    const yScale = d3.scaleLinear().domain([0, Math.max(1, maxCount)]).range([viewABottom - 22, viewATop + 30])
    return bins.map((bin, index) => ({
      index,
      x0: xScaleValue(bin.x0 ?? 0),
      x1: xScaleValue(bin.x1 ?? 100),
      y: yScale(bin.length),
      h: Math.max(0, viewABottom - 22 - yScale(bin.length)),
      total: bin.length,
      active: bin.filter(entry => activeKeySet.has(entry.key)).length,
      keys: bin.map(entry => entry.key)
    }))
  }, [activeKeySet, entriesA, viewABottom, viewATop, xScaleValue])

  const histAnchorByKey = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>()
    histBars.forEach(bar => {
      const centerX = (bar.x0 + bar.x1) / 2
      const anchorY = bar.y + 2
      bar.keys.forEach(key => map.set(key, { x: centerX, y: anchorY }))
    })
    return map
  }, [histBars])

  const anchorFor = useCallback((key: string): { x: number; y: number } | null => {
    if (representation === 'beeswarm') {
      const node = beeswarmByKey.get(key)
      if (!node) return null
      return { x: node.x, y: node.y }
    }
    return histAnchorByKey.get(key) ?? null
  }, [beeswarmByKey, histAnchorByKey, representation])

  const safeEnd = endYear > startYear ? endYear : startYear + 1
  const xScaleYear = useMemo(() => d3.scaleLinear().domain([startYear, safeEnd]).range([leftX0, leftX0 + leftW]), [leftW, leftX0, safeEnd, startYear])
  const yScale = useMemo(() => d3.scaleLinear().domain(valueDomain).range([viewBBottom, viewBTop]), [valueDomain, viewBBottom, viewBTop])
  const lineGen = useMemo(() => d3.line<InternetPoint>().defined(point => Number.isFinite(point.value)).x(point => xScaleYear(point.year)).y(point => yScale(point.value)).curve(d3.curveMonotoneX), [xScaleYear, yScale])

  const lines = useMemo<LineDescriptor[]>(() => {
    return countries
      .map(country => {
        const points = country.points.filter(point => point.year >= startYear && point.year <= endYear)
        const path = lineGen(points)
        if (!path) return null
        if (!showKey(country.key)) return null
        return { key: country.key, country, path, points }
      })
      .filter((entry): entry is LineDescriptor => entry !== null)
  }, [countries, endYear, lineGen, showKey, startYear])

  const metrics = useMemo<RowMetric[]>(() => {
    return countries.map(country => {
      const points = country.points.filter(point => point.year >= startYear && point.year <= endYear)
      const focusValue = country.valueByYear.get(focusYear) ?? null
      const growth = points.length >= 2 ? points[points.length - 1].value - points[0].value : 0
      const volatility = stddev(points.map(point => point.value))
      const metricValue = sortMode === 'value' ? (focusValue ?? Number.NEGATIVE_INFINITY) : sortMode === 'growth' ? growth : volatility
      return { key: country.key, country, focusValue, growth, volatility, metricValue }
    })
  }, [countries, endYear, focusYear, sortMode, startYear])

  const topRows = useMemo(() => {
    return metrics
      .filter(row => row.focusValue !== null && showKey(row.key))
      .sort((a, b) => safeMetric(b.metricValue) - safeMetric(a.metricValue) || a.country.entity.localeCompare(b.country.entity))
      .slice(0, TOP_ROWS)
  }, [metrics, showKey])

  const previewRows = useMemo<RowMetric[]>(() => {
    if (!previewSortMode) return []
    return countries
      .map(country => {
        const points = country.points.filter(point => point.year >= startYear && point.year <= endYear)
        const focusValue = country.valueByYear.get(focusYear) ?? null
        const growth = points.length >= 2 ? points[points.length - 1].value - points[0].value : 0
        const volatility = stddev(points.map(point => point.value))
        const metricValue = previewSortMode === 'value' ? (focusValue ?? Number.NEGATIVE_INFINITY) : previewSortMode === 'growth' ? growth : volatility
        return { key: country.key, country, focusValue, growth, volatility, metricValue }
      })
      .filter(row => row.focusValue !== null && showKey(row.key))
      .sort((a, b) => safeMetric(b.metricValue) - safeMetric(a.metricValue) || a.country.entity.localeCompare(b.country.entity))
      .slice(0, TOP_ROWS)
  }, [countries, endYear, focusYear, previewSortMode, showKey, startYear])

  const metricValues = useMemo(() => topRows.map(row => row.metricValue).filter(value => Number.isFinite(value)), [topRows])
  const rankLabelBand = Math.max(52, Math.min(150, rightW * 0.46))
  const rankRightEdge = Math.max(rankLabelBand + 18, rightW - 12)
  const rankScale = useMemo(() => {
    if (metricValues.length === 0) return d3.scaleLinear().domain([0, 1]).range([rankLabelBand, rankRightEdge])
    const min = d3.min(metricValues) ?? 0
    const max = d3.max(metricValues) ?? 1
    if (sortMode === 'value' || sortMode === 'volatility') {
      const end = max <= 0 ? 1 : max
      return d3.scaleLinear().domain([0, end]).range([rankLabelBand, rankRightEdge])
    }
    const abs = Math.max(Math.abs(min), Math.abs(max), 1)
    return d3.scaleLinear().domain([-abs, abs]).range([rankLabelBand, rankRightEdge])
  }, [metricValues, rankLabelBand, rankRightEdge, sortMode])

  const previewMetricValues = useMemo(() => previewRows.map(row => row.metricValue).filter(value => Number.isFinite(value)), [previewRows])
  const previewRankScale = useMemo(() => {
    if (previewMetricValues.length === 0) return d3.scaleLinear().domain([0, 1]).range([rankLabelBand, rankRightEdge])
    const mode = previewSortMode ?? sortMode
    const min = d3.min(previewMetricValues) ?? 0
    const max = d3.max(previewMetricValues) ?? 1
    if (mode === 'value' || mode === 'volatility') {
      const end = max <= 0 ? 1 : max
      return d3.scaleLinear().domain([0, end]).range([rankLabelBand, rankRightEdge])
    }
    const abs = Math.max(Math.abs(min), Math.abs(max), 1)
    return d3.scaleLinear().domain([-abs, abs]).range([rankLabelBand, rankRightEdge])
  }, [previewMetricValues, previewSortMode, rankLabelBand, rankRightEdge, sortMode])

  const rowTop = VIEW_C_HEADER_H + 8
  const rowBottom = viewCHeight - 6
  const rowH = topRows.length > 0 ? Math.max(1.2, (rowBottom - rowTop) / topRows.length) : 0

  const focusX = xScaleYear(focusYear)

  const yearTicks = useMemo(() => {
    const span = Math.max(1, endYear - startYear)
    const count = detailLevel === 2 ? 8 : 5
    const ticks = d3.ticks(startYear, endYear, Math.min(span, count)).map(value => Math.round(value))
    if (!ticks.includes(startYear)) ticks.unshift(startYear)
    if (!ticks.includes(endYear)) ticks.push(endYear)
    return Array.from(new Set(ticks)).sort((a, b) => a - b)
  }, [detailLevel, endYear, startYear])

  const yTicks = useMemo(() => d3.ticks(0, 100, detailLevel === 2 ? 7 : 5), [detailLevel])

  const markers = useMemo(() => {
    const list: Array<{ key: string; kind: 'selected' | 'hovered' | 'related'; y: number }> = []
    if (selectedKey) {
      const value = countryByKey.get(selectedKey)?.valueByYear.get(focusYear)
      if (value !== undefined) list.push({ key: selectedKey, kind: 'selected', y: yScale(value) })
    }
    relatedKeys.forEach(key => {
      const value = countryByKey.get(key)?.valueByYear.get(focusYear)
      if (value !== undefined) list.push({ key, kind: 'related', y: yScale(value) })
    })
    if ((detailLevel >= 1 || isPlainMode) && hoveredKey && hoveredKey !== selectedKey) {
      const value = countryByKey.get(hoveredKey)?.valueByYear.get(focusYear)
      if (value !== undefined) list.push({ key: hoveredKey, kind: 'hovered', y: yScale(value) })
    }
    return list
  }, [countryByKey, detailLevel, focusYear, hoveredKey, isPlainMode, relatedKeys, selectedKey, yScale])

  const selectedMarkerY = useMemo(() => {
    if (!selectedKey) return null
    const value = countryByKey.get(selectedKey)?.valueByYear.get(focusYear)
    if (value === undefined) return null
    return yScale(value)
  }, [countryByKey, focusYear, selectedKey, yScale])

  const selectedDots = useMemo(() => {
    if (detailLevel !== 2 || !selectedKey) return []
    const country = countryByKey.get(selectedKey)
    if (!country) return []
    return country.points
      .filter(point => point.year >= startYear && point.year <= endYear)
      .map(point => ({ x: xScaleYear(point.year), y: yScale(point.value) }))
  }, [countryByKey, detailLevel, endYear, selectedKey, startYear, xScaleYear, yScale])

  const bridge = useMemo(() => {
    if (!hoveredKey) return null
    const source = anchorFor(hoveredKey)
    const value = countryByKey.get(hoveredKey)?.valueByYear.get(focusYear)
    if (!source || value === undefined) return null
    const targetX = xScaleYear(focusYear)
    const targetY = yScale(value)
    const c1x = source.x + (targetX - source.x) * 0.34
    const c2x = source.x + (targetX - source.x) * 0.7
    const middleY = (source.y + targetY) / 2
    return `M ${source.x} ${source.y} C ${c1x} ${middleY - 20}, ${c2x} ${middleY + 22}, ${targetX} ${targetY}`
  }, [anchorFor, countryByKey, focusYear, hoveredKey, xScaleYear, yScale])

  const arcs = useMemo(() => {
    if (!selectedKey) return []
    const source = anchorFor(selectedKey)
    if (!source) return []
    return relatedItems
      .map((item, index) => {
        const target = anchorFor(item.key)
        if (!target) return null
        const cx = (source.x + target.x) / 2
        const cy = Math.min(source.y, target.y) - Math.max(18, Math.abs(target.x - source.x) * 0.12)
        return { key: item.key, d: `M ${source.x} ${source.y} Q ${cx} ${cy} ${target.x} ${target.y}`, delay: index * 30, color: colorByRelated.get(item.key) ?? RELATED_PALETTE[index % RELATED_PALETTE.length] }
      })
      .filter((entry): entry is { key: string; d: string; delay: number; color: string } => entry !== null)
  }, [anchorFor, colorByRelated, relatedItems, selectedKey])

  const tooltipCountry = tooltip ? countryByKey.get(tooltip.key) ?? null : null
  const tooltipMetric = tooltipCountry ? metrics.find(row => row.key === tooltipCountry.key) ?? null : null

  const hoveredBin = histTooltip ? histBars.find(bar => bar.index === histTooltip.index) ?? null : null
  const hoveredBinCountries = useMemo(() => {
    if (!hoveredBin) return []
    return hoveredBin.keys
      .map(key => {
        const country = countryByKey.get(key)
        const value = country?.valueByYear.get(focusYear)
        if (!country || value === undefined) return null
        return { key, entity: country.entity, value, active: activeKeySet.has(key) }
      })
      .filter((entry): entry is { key: string; entity: string; value: number; active: boolean } => entry !== null)
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)
  }, [activeKeySet, countryByKey, focusYear, hoveredBin])

  const clampWindow = useCallback((nextStart: number, nextEnd: number) => {
    const s = nearestYear(clamp(nextStart, minYear, maxYear), years)
    const e = nearestYear(clamp(nextEnd, minYear, maxYear), years)
    if (s <= e) {
      setStartYear(s)
      setEndYear(e)
      setFocusYear(previous => clamp(previous, s, e))
      return { start: s, end: e }
    }
    setStartYear(e)
    setEndYear(e)
    setFocusYear(e)
    return { start: e, end: e }
  }, [maxYear, minYear, years])

  const finalizeExplorePost = useCallback((range?: { start: number; end: number }) => {
    const payload = range ?? { start: startYear, end: endYear }
    emitPost('explore_set', payload)
    if (postOn) setPostExploreNonce(previous => previous + 1)
  }, [emitPost, endYear, postOn, startYear])

  const finalizeFilterPost = useCallback((count = activeCount) => {
    clearTimeoutRef(filterTimeoutRef)
    const now = performance.now()
    if (now - lastFilterPostTsRef.current < FILTER_POST_THROTTLE) return
    lastFilterPostTsRef.current = now
    emitPost('filter_done', { count })
    if (postOn) {
      setPostFilterNonce(previous => previous + 1)
      setCountPulseNonce(previous => previous + 1)
    }
  }, [activeCount, emitPost, postOn])

  const triggerFilterDone = useCallback(() => {
    emitIn('filter_apply')
    clearTimeoutRef(filterTimeoutRef)
    filterTimeoutRef.current = window.setTimeout(() => {
      finalizeFilterPost()
      filterTimeoutRef.current = null
    }, 350)
  }, [emitIn, finalizeFilterPost])

  const toggleRegion = useCallback((region: RegionName) => {
    if (region === 'Unknown') return
    setEnabledRegions(previous => ({ ...previous, [region]: !previous[region] }))
    triggerFilterDone()
  }, [triggerFilterDone])

  const scheduleRegionHover = useCallback((nextRegion: RegionName | null) => {
    pendingHoverRegionRef.current = nextRegion
    if (regionHoverRafRef.current !== null) return
    regionHoverRafRef.current = window.requestAnimationFrame(() => {
      regionHoverRafRef.current = null
      const next = pendingHoverRegionRef.current
      setHoverRegion(previous => (previous === next ? previous : next))
    })
  }, [])

  const handleRegionLegendEnter = useCallback((region: RegionName) => {
    if (!preOn) return
    scheduleRegionHover(region)
  }, [preOn, scheduleRegionHover])

  const handleRegionLegendLeave = useCallback(() => {
    if (!preOn) return
    scheduleRegionHover(null)
  }, [preOn, scheduleRegionHover])

  const setPreRegion = useCallback((next: PreHintRegion) => {
    setPreHintRegion(previous => (previous === next ? previous : next))
  }, [])

  const activateHotControl = useCallback((controlId: HotControl) => {
    hoveredControlRef.current = controlId
    if (!preOn) return
    setHotControl(previous => (previous === controlId ? previous : controlId))
  }, [preOn])

  const deactivateHotControl = useCallback((controlId: HotControl, options?: { force?: boolean }) => {
    if (hoveredControlRef.current === controlId) hoveredControlRef.current = null
    if (!preOn) return
    setHotControl(previous => {
      if (previous !== controlId) return previous
      if (options?.force) return null
      if (isScrubbing) return previous
      return null
    })
  }, [isScrubbing, preOn])

  const finalizeHotControlOnPointerEnd = useCallback((controlId: HotControl, keepHot: boolean) => {
    hoveredControlRef.current = keepHot ? controlId : null
    if (!preOn) return
    setHotControl(previous => {
      if (previous !== controlId) return previous
      return keepHot ? controlId : null
    })
  }, [preOn])

  const beginRangeScrub = (event: ReactPointerEvent<HTMLInputElement>, kind: ScrubKind, controlId?: HotControl) => {
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Ignore capture failures in browsers that disallow capture on range controls.
    }
    if (controlId) activateHotControl(controlId)
    setIsScrubbing(true)
    setActiveScrubKind(kind)
  }

  const endRangeScrub = () => {
    setIsScrubbing(false)
    setActiveScrubKind('none')
  }

  const handleFilterGuideEnter = (controlId: 'valueMin' | 'valueMax') => {
    activateHotControl(controlId)
    setShowFilterGuides(true)
    if (preOn) {
      setPreRegion('filter')
      emitPre('filter_focus')
    }
  }

  const handleFilterGuideLeave = (controlId: 'valueMin' | 'valueMax') => {
    deactivateHotControl(controlId)
    const hovered = hoveredControlRef.current
    if (!isScrubbing && hovered !== 'valueMin' && hovered !== 'valueMax') setShowFilterGuides(false)
    if (hovered !== 'valueMin' && hovered !== 'valueMax') setPreRegion('none')
  }

  const handleExploreGuideEnter = (controlId: 'focusYear' | 'windowStart' | 'windowEnd') => {
    activateHotControl(controlId)
    if (preOn) {
      setPreRegion('explore')
      emitPre('explore_grab')
    }
  }

  const handleExploreGuideLeave = (controlId: 'focusYear' | 'windowStart' | 'windowEnd') => {
    deactivateHotControl(controlId)
    const hovered = hoveredControlRef.current
    if (hovered !== 'focusYear' && hovered !== 'windowStart' && hovered !== 'windowEnd') setPreRegion('none')
  }

  const commitHoveredKey = useCallback((key: string | null) => {
    if (key && hoverKeyRef.current !== key) {
      emitPre('connect_ready')
      hoverKeyRef.current = key
    }
    if (!key) hoverKeyRef.current = null
    scheduleHoveredKey(key)
  }, [emitPre, scheduleHoveredKey])

  useEffect(() => {
    commitHoveredKey(null)
    scheduleTooltip(null)
    setHoveredBinIndex(null)
    setHistTooltip(null)
  }, [chartWidth, commitHoveredKey, scheduleTooltip])

  const handleCountryHover = (event: ReactMouseEvent<SVGElement, MouseEvent>, key: string, withTooltip = true) => {
    commitHoveredKey(key)
    if (!withTooltip || detailLevel === 0) {
      scheduleTooltip(null)
      return
    }
    const stage = stageRef.current
    if (!stage) return
    const rect = stage.getBoundingClientRect()
    scheduleTooltip({ key, x: clamp(event.clientX - rect.left + 12, 8, rect.width - 220), y: clamp(event.clientY - rect.top - 18, 8, rect.height - 120) })
  }

  const handleCountryLeave = (key: string) => {
    if (hoveredKeyRef.current === key) commitHoveredKey(null)
    if (lastTooltipRef.current?.key === key) scheduleTooltip(null)
  }

  const handleStagePress = (event: ReactPointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current
    if (!stage) return
    const rect = stage.getBoundingClientRect()
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top }
    lastSelectPressPointRef.current = point
    emitPre('select_press', point)
  }

  const handleSelectPress = (event: ReactPointerEvent<SVGElement>) => {
    event.stopPropagation()
    const stage = stageRef.current
    if (!stage) return
    const rect = stage.getBoundingClientRect()
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top }
    lastSelectPressPointRef.current = point
    emitPre('select_press', point)
  }

  const selectCountry = useCallback((key: string) => {
    setSelectedKey(previous => (previous === key ? null : key))
    const pressPoint = lastSelectPressPointRef.current
    lastSelectPressPointRef.current = null
    if (inOn) {
      setSelectCommitPoint(pressPoint ?? null)
      setSelectCommitNonce(previous => previous + 1)
    }
    emitIn('select_commit')
    clearTimeoutRef(selectTimeoutRef)
    selectTimeoutRef.current = window.setTimeout(() => {
      emitPost('select_settle')
      if (postOn) setPostSelectNonce(previous => previous + 1)
      selectTimeoutRef.current = null
    }, 120)
    clearTimeoutRef(connectTimeoutRef)
    connectTimeoutRef.current = window.setTimeout(() => {
      emitPost('connect_reveal')
      if (postOn) {
        setPostConnectNonce(previous => previous + 1)
        setRelatedPulseNonce(previous => previous + 1)
      }
      connectTimeoutRef.current = null
    }, 180)
  }, [emitIn, emitPost, inOn, postOn])

  const handleBinMove = (event: ReactMouseEvent<SVGRectElement, MouseEvent>, bar: HistogramBar) => {
    setHoveredBinIndex(previous => (previous === bar.index ? previous : bar.index))
    setHoveredGroupKeys(previous => {
      if (previous.length === bar.keys.length && previous.every((key, index) => key === bar.keys[index])) return previous
      return bar.keys
    })
    const stage = stageRef.current
    if (!stage) return
    const rect = stage.getBoundingClientRect()
    if (detailLevel >= 1) {
      const next = { index: bar.index, x: clamp(event.clientX - rect.left + 14, 8, rect.width - 260), y: clamp(event.clientY - rect.top + 8, 8, rect.height - 180) }
      setHistTooltip(previous => {
        if (!previous) return next
        if (previous.index === next.index && Math.abs(previous.x - next.x) < 2 && Math.abs(previous.y - next.y) < 2) return previous
        return next
      })
    }
  }

  const handleBinLeave = (index: number) => {
    setHoveredBinIndex(previous => (previous === index ? null : previous))
    setHoveredGroupKeys([])
    setHistTooltip(previous => (previous?.index === index ? null : previous))
  }

  const commitSortMode = (nextMode: SortMode) => {
    if (sortMode === nextMode) return
    setPreviewSortMode(null)
    setSortMode(nextMode)
    setReorderNonce(previous => previous + 1)
    emitIn('reconfig_reorder')
    clearTimeoutRef(reconfigTimeoutRef)
    reconfigTimeoutRef.current = window.setTimeout(() => {
      emitPost('reconfig_done', { label: nextMode })
      if (postOn) setPostReconfigNonce(previous => previous + 1)
      reconfigTimeoutRef.current = null
    }, 260)
  }

  const commitRepresentation = (next: Representation) => {
    if (representation === next) return
    setRepresentation(next)
    setPreviewRepresentation(null)
    setEncodeSwitching(true)
    emitIn('encode_switch')
    clearTimeoutRef(encodeTimeoutRef)
    encodeTimeoutRef.current = window.setTimeout(() => {
      setEncodeSwitching(false)
      emitPost('encode_done')
      if (postOn) {
        setPostEncodeNonce(previous => previous + 1)
        setTitlePulseNonce(previous => previous + 1)
      }
      encodeTimeoutRef.current = null
    }, 260)
  }

  const commitDetailLevel = (next: DetailLevel) => {
    if (detailLevel === next) return
    setPreviewDetailLevel(null)
    setDetailLevel(next)
    emitIn('abstract_adjust')
    clearTimeoutRef(abstractTimeoutRef)
    abstractTimeoutRef.current = window.setTimeout(() => {
      emitPost('abstract_set')
      if (postOn) {
        setPostAbstractNonce(previous => previous + 1)
        setTitlePulseNonce(previous => previous + 1)
      }
      abstractTimeoutRef.current = null
    }, 180)
  }

  useEffect(() => {
    brushConfigRef.current = { xScaleYear, years, clampWindow, emitIn, finalizeExplorePost }
  }, [clampWindow, emitIn, finalizeExplorePost, xScaleYear, years])

  useEffect(() => {
    if (!brushLayerRef.current || years.length === 0) return
    const y0 = viewBBottom - 36
    const y1 = viewBBottom - 6

    const applySelection = (selection: [number, number]) => {
      const cfg = brushConfigRef.current
      if (!cfg) return
      const nextStart = nearestYear(cfg.xScaleYear.invert(selection[0]), cfg.years)
      const nextEnd = nearestYear(cfg.xScaleYear.invert(selection[1]), cfg.years)
      cfg.clampWindow(nextStart, nextEnd)
      cfg.emitIn('explore_scrub')
      if (inOn) setWindowPulseNonce(previous => previous + 1)
    }

    const scheduleBrushUpdate = (selection: [number, number]) => {
      const now = performance.now()
      if (now - lastBrushTsRef.current >= 33) {
        lastBrushTsRef.current = now
        applySelection(selection)
        return
      }
      pendingBrushSelectionRef.current = selection
      if (brushRafRef.current !== null) return
      brushRafRef.current = window.requestAnimationFrame(() => {
        brushRafRef.current = null
        const pending = pendingBrushSelectionRef.current
        if (!pending) return
        pendingBrushSelectionRef.current = null
        lastBrushTsRef.current = performance.now()
        applySelection(pending)
      })
    }

    const brush = d3.brushX()
      .extent([[leftX0, y0], [leftX0 + leftW, y1]])
      .on('start', event => {
        setIsScrubbing(true)
        setActiveScrubKind('explore')
        if (!event.sourceEvent) return
        if ((event as { mode?: string }).mode === 'handle') emitPre('explore_grab')
      })
      .on('brush', event => {
        if (!event.sourceEvent || suppressBrushRef.current) return
        const selection = event.selection as [number, number] | null
        if (!selection) return
        scheduleBrushUpdate(selection)
      })
      .on('end', event => {
        setIsScrubbing(false)
        setActiveScrubKind('none')
        if (!event.sourceEvent) return
        const selection = event.selection as [number, number] | null
        if (!selection) return
        const cfg = brushConfigRef.current
        if (!cfg) return
        const nextStart = nearestYear(cfg.xScaleYear.invert(selection[0]), cfg.years)
        const nextEnd = nearestYear(cfg.xScaleYear.invert(selection[1]), cfg.years)
        const range = cfg.clampWindow(nextStart, nextEnd)
        cfg.finalizeExplorePost(range)
      })

    brushBehaviorRef.current = brush
    const layer = d3.select(brushLayerRef.current)
    layer.call(brush)
    layer.selectAll<SVGRectElement, unknown>('.handle').on('pointerdown.pre', () => emitPre('explore_grab'))
    layer.selectAll<SVGRectElement, unknown>('.overlay')
      .on('pointerenter.prehint', () => {
        if (!preOn) return
        setPreRegion('explore')
        emitPre('explore_grab')
      })
      .on('pointerleave.prehint', () => setPreRegion('none'))
  }, [emitPre, inOn, leftW, leftX0, preOn, setPreRegion, viewBBottom, years.length])

  useEffect(() => {
    if (!brushLayerRef.current || !brushBehaviorRef.current) return
    suppressBrushRef.current = true
    d3.select(brushLayerRef.current).call(brushBehaviorRef.current.move, [xScaleYear(startYear), xScaleYear(endYear)])
    suppressBrushRef.current = false
  }, [endYear, startYear, xScaleYear])

  const resetAll = () => {
    setFocusYear(defaultFocusYear)
    setStartYear(defaultWindow.start)
    setEndYear(defaultWindow.end)
    setRepresentation('beeswarm')
    setSortMode('value')
    setDetailLevel(1)
    setValueMin(0)
    setValueMax(100)
    setCountryPrefix('')
    setShowContext(true)
    setSelectedKey(null)
    setHoveredKey(null)
    setHoveredGroupKeys([])
    setHoveredBinIndex(null)
    setRelatedCount(6)
    setTooltip(null)
    setHistTooltip(null)
    setPreviewRepresentation(null)
    setPreviewSortMode(null)
    setPreviewDetailLevel(null)
    setHotControl(null)
    setEnabledRegions({
      Africa: true,
      Asia: true,
      Europe: true,
      'North America': true,
      Oceania: true,
      'South America': true,
      Unknown: true
    })
    setHoverRegion(null)
    setPreHintRegion('none')
    setShowFilterGuides(false)
    hoveredControlRef.current = null
    setIsScrubbing(false)
    setActiveScrubKind('none')
    setSelectCommitPoint(null)
    finalizeFilterPost(activeCount)
  }

  const vignetteOn = inOn && isScrubbing
  const scrubbingClass = inOn && isScrubbing ? 'is-scrubbing' : ''
  const encodePostOn = postOn && postEncodeNonce > 0
  const reconfigPostOn = postOn && postReconfigNonce > 0
  const explorePostOn = postOn && postExploreNonce > 0
  const filterPostOn = postOn && postFilterNonce > 0
  const selectPostOn = postOn && postSelectNonce > 0
  const abstractPostOn = postOn && postAbstractNonce > 0
  const connectPostOn = postOn && postConnectNonce > 0

  const instructionWidth = Math.min(760, Math.max(360, chartWidth - 140))
  const instructionX = chartWidth / 2 - instructionWidth / 2
  const viewCClipId = `integrated-view-c-clip-${Math.max(0, Math.round(chartWidth))}`
  const showSelectCommitRing = inOn && selectCommitNonce > 0 && selectCommitPoint !== null
  const showEncodePreview = preOn && previewRepresentation !== null && previewRepresentation !== representation
  const showBridge = !isPlainMode && Boolean(bridge)
  const hasRegionHover = Boolean(regionHoverKeySet && regionHoverKeySet.size > 0)
  const isRelatedCountHot = preOn && hotControl === 'relatedCount'
  const isFocusHot = preOn && hotControl === 'focusYear'
  const isWindowStartHot = preOn && hotControl === 'windowStart'
  const isWindowEndHot = preOn && hotControl === 'windowEnd'
  const isWindowHot = isWindowStartHot || isWindowEndHot
  const isExploreHot = isFocusHot || isWindowHot
  const isFilterHot = preOn && (hotControl === 'valueMin' || hotControl === 'valueMax')
  const isPreStageHotOutline = preOn && (isExploreHot || isFilterHot)
  const isFilterInScrub = inOn && isScrubbing && activeScrubKind === 'filter'
  const showFilterGuideLines = isFilterInScrub || isFilterHot || (preOn && showFilterGuides)
  const showExplorePreHint = preOn && (preHintRegion === 'explore' || isExploreHot) && !isScrubbing
  const brushHintStartX = xScaleYear(startYear)
  const brushHintEndX = xScaleYear(endYear)
  const arrowY = (viewBTop + viewBBottom) / 2
  const abstractPreviewZoneH = previewDetailLevel === 2 ? 68 : previewDetailLevel === 1 ? 52 : 36

  // Moving lines between back/front groups with different keys caused mass unmount/remount on legend hover.
  // Render base lines once with stable keys and draw hovered-region lines in a non-interactive overlay.
  const regionHoverLines = useMemo(() => (
    isJuicyOne && regionHoverKeySet?.size
      ? lines.filter(line => regionHoverKeySet.has(line.key))
      : []
  ), [isJuicyOne, lines, regionHoverKeySet])
  const showRegionLineOverlay = isJuicyOne && regionHoverLines.length > 0

  const getViewALabelGeometry = useCallback((node: BeeswarmNode) => {
    const labelW = clamp(node.entity.length * 7.4 + 14, 52, 196)
    const labelH = 23
    const rectX = clamp(node.x + 10, leftX0 + 4, leftX0 + leftW - labelW - 4)
    const rectY = clamp(node.y - 34, viewATop + 24, viewABottom - 18 - labelH)
    return {
      labelW,
      labelH,
      rectX,
      rectY,
      textX: rectX + 10,
      textY: rectY + 15
    }
  }, [leftW, leftX0, viewABottom, viewATop])

  const setGuideLine = (line: SVGLineElement | null, attrs: { x1: number; x2: number; y1: number; y2: number } | null) => {
    if (!line) return
    if (!attrs || !preOn) {
      line.style.opacity = '0'
      return
    }
    line.setAttribute('x1', `${attrs.x1}`)
    line.setAttribute('x2', `${attrs.x2}`)
    line.setAttribute('y1', `${attrs.y1}`)
    line.setAttribute('y2', `${attrs.y2}`)
    line.style.opacity = '0.78'
  }

  const toSvgPoint = useCallback((clientX: number, clientY: number): { x: number; y: number } | null => {
    const svg = svgRef.current
    if (!svg) return null
    try {
      const ctm = svg.getScreenCTM()
      if (ctm) {
        const point = svg.createSVGPoint()
        point.x = clientX
        point.y = clientY
        const transformed = point.matrixTransform(ctm.inverse())
        if (Number.isFinite(transformed.x) && Number.isFinite(transformed.y)) {
          return { x: transformed.x, y: transformed.y }
        }
      }
    } catch {
      // Fallback to ratio-based conversion when CTM is unavailable.
    }
    const rect = svg.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return null
    return {
      x: ((clientX - rect.left) / rect.width) * chartWidth,
      y: ((clientY - rect.top) / rect.height) * CHART_HEIGHT
    }
  }, [chartWidth])

  const handleStagePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!preOn) return
    const pointer = toSvgPoint(event.clientX, event.clientY)
    if (!pointer) return
    pendingStagePointerRef.current = pointer
    if (preGuideRafRef.current !== null) return
    preGuideRafRef.current = window.requestAnimationFrame(() => {
      preGuideRafRef.current = null
      const pointer = pendingStagePointerRef.current
      if (!pointer) return
      const x = clamp(pointer.x, leftX0, leftX0 + leftW)
      const y = clamp(pointer.y, viewATop, viewBBottom)
      const inViewA = x >= leftX0 && x <= leftX0 + leftW && y >= viewATop && y <= viewABottom
      const inViewB = x >= leftX0 && x <= leftX0 + leftW && y >= viewBTop && y <= viewBBottom
      if (inViewA) {
        setPreRegion('viewA')
        setGuideLine(preGuideVARef.current, { x1: x, x2: x, y1: viewATop + 24, y2: viewABottom - 18 })
        setGuideLine(preGuideHARef.current, { x1: leftX0, x2: leftX0 + leftW, y1: y, y2: y })
        setGuideLine(preGuideHBRef.current, null)
      } else if (inViewB) {
        setPreRegion('viewB')
        setGuideLine(preGuideVARef.current, null)
        setGuideLine(preGuideHARef.current, null)
        setGuideLine(preGuideHBRef.current, { x1: leftX0, x2: leftX0 + leftW, y1: y, y2: y })
      } else {
        setGuideLine(preGuideVARef.current, null)
        setGuideLine(preGuideHARef.current, null)
        setGuideLine(preGuideHBRef.current, null)
      }
    })
  }

  const handleStagePointerLeave = () => {
    setGuideLine(preGuideVARef.current, null)
    setGuideLine(preGuideHARef.current, null)
    setGuideLine(preGuideHBRef.current, null)
    if (preHintRegion === 'viewA' || preHintRegion === 'viewB') setPreRegion('none')
  }

  const handleRankingPointerMove = (event: ReactPointerEvent<SVGGElement>) => {
    const stage = stageRef.current
    if (!stage || topRows.length === 0 || rowH <= 0) return
    // Ranking layout is in SVG units (viewCTop/rowTop/rowH), while client coordinates are screen pixels.
    // Mixing these spaces causes row-hit drift after resize / DPI changes, so pointer is converted to SVG space.
    const pointer = toSvgPoint(event.clientX, event.clientY)
    if (!pointer) return
    const rect = stage.getBoundingClientRect()
    const localX = pointer.x - rightX0
    if (localX < 2 || localX > rightW - 2) {
      commitHoveredKey(null)
      if (detailLevel >= 1) scheduleTooltip(null)
      return
    }
    const localY = pointer.y - viewCTop
    const index = Math.floor((localY - rowTop) / rowH)
    if (index < 0 || index >= topRows.length) {
      commitHoveredKey(null)
      if (detailLevel >= 1) scheduleTooltip(null)
      return
    }
    const row = topRows[index]
    if (!row) return
    if (preOn) setPreRegion('viewC')
    commitHoveredKey(row.key)
    if (detailLevel >= 1) {
      scheduleTooltip({
        key: row.key,
        x: clamp(event.clientX - rect.left + 12, 8, rect.width - 220),
        y: clamp(event.clientY - rect.top - 18, 8, rect.height - 120)
      })
    }
  }

  const handleRankingPointerLeave = () => {
    commitHoveredKey(null)
    scheduleTooltip(null)
    if (preHintRegion === 'viewC') setPreRegion('none')
  }

  return (
    <div className={`integrated-layout ${scrubbingClass}`}>
      <div className="integrated-stage-wrap">
        <div
          className={`integrated-stage ${scrubbingClass} ${showExplorePreHint ? 'is-pre-explore' : ''} ${isPreStageHotOutline ? 'is-pre-hot-outline' : ''}`}
          ref={stageRef}
          onPointerDown={handleStagePress}
          onPointerMove={handleStagePointerMove}
          onPointerLeave={handleStagePointerLeave}
        >
          {vignetteOn && <div className="ig-vignette" />}
          {inOn && impactNonce > 0 && <div key={`impact-${impactNonce}`} className="ig-impact-flash" />}
          {postOn && settleNonce > 0 && <div key={`settle-${settleNonce}`} className="ig-settle-glow" />}
          {preOn && ripplePoint && rippleNonce > 0 && (
            <div key={`ripple-${rippleNonce}`} className="ig-pointer-ripple" style={{ '--ripple-x': `${ripplePoint.x}px`, '--ripple-y': `${ripplePoint.y}px` } as CSSProperties} />
          )}
          {showSelectCommitRing && selectCommitPoint && (
            <div
              key={`select-commit-${selectCommitNonce}`}
              className="ig-select-commit-ring"
              style={{ '--ring-x': `${selectCommitPoint.x}px`, '--ring-y': `${selectCommitPoint.y}px` } as CSSProperties}
            />
          )}
          {!loading && !error && countries.length > 0 && (
            <div
              className={`integrated-region-legend ${regionMapLoading ? 'is-loading' : ''}`}
              onPointerDown={event => event.stopPropagation()}
              onPointerEnter={event => event.stopPropagation()}
              onPointerMove={event => event.stopPropagation()}
              onMouseMove={event => event.stopPropagation()}
            >
              {LEGEND_REGIONS.map(region => {
                const checked = enabledRegions[region]
                const isHovered = preOn && hoverRegion === region
                return (
                  <label
                    key={`region-${region}`}
                    className={`integrated-region-chip ${checked ? 'is-enabled' : 'is-disabled'} ${isHovered ? 'is-hovered' : ''}`}
                    onMouseEnter={() => handleRegionLegendEnter(region)}
                    onMouseLeave={handleRegionLegendLeave}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleRegion(region)}
                      aria-label={`Toggle ${region}`}
                    />
                    <span>{region}</span>
                  </label>
                )
              })}
              {regionMapError && <span className="integrated-region-error">Region map unavailable</span>}
            </div>
          )}

          {loading && <div className="integrated-stage-status">Loading internet-use dataset...</div>}
          {error && !loading && <div className="integrated-stage-status is-error">Error loading data: {error}</div>}
          {!loading && !error && countries.length === 0 && <div className="integrated-stage-status is-error">No usable rows found in internet-use dataset.</div>}

          {!loading && !error && countries.length > 0 && (
            <>
              <svg ref={svgRef} className={`integrated-svg ${encodeSwitching ? 'is-encode-switching' : ''} ${abstractPostOn ? 'is-post-abstract' : ''}`} width={chartWidth} height={CHART_HEIGHT} viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`} role="img" aria-label="Chart 8 integrated interactions">
                <defs>
                  <clipPath id={viewCClipId} clipPathUnits="userSpaceOnUse">
                    <rect x={2} y={rowTop - 1} width={Math.max(1, rightW - 4)} height={Math.max(1, viewCHeight - rowTop - 5)} />
                  </clipPath>
                </defs>
                <text x={chartWidth / 2} y={26} className="integrated-title" textAnchor="middle">Internet use</text>
                <rect x={instructionX} y={45} width={instructionWidth} height={26} rx={9} ry={9} className="integrated-instruction-box" />
                <text x={chartWidth / 2} y={62} className="integrated-instruction" textAnchor="middle">
                  Hover links views. Click selects. Drag/brush explores. Toggle representation encodes. Controls filter/reconfigure/abstract/connect.
                </text>

                <rect x={leftX0} y={viewATop} width={leftW} height={viewAHeight} className="integrated-view-box" rx={7} ry={7} />
                <rect x={leftX0} y={viewBTop} width={leftW} height={viewBHeight} className="integrated-view-box" rx={7} ry={7} />
                <rect x={rightX0} y={viewCTop} width={rightW} height={viewCHeight} className="integrated-view-box" rx={7} ry={7} />
                {showEncodePreview && <rect x={leftX0 + 2} y={viewATop + 2} width={Math.max(1, leftW - 4)} height={Math.max(1, viewAHeight - 4)} className="integrated-view-a-preview-frame" rx={6} ry={6} />}
                <rect x={rightX0 + 1} y={viewCTop + 1} width={Math.max(1, rightW - 2)} height={VIEW_C_HEADER_H + 6} className="integrated-view-c-header" rx={6} ry={6} />
                <line x1={rightX0 + 2} x2={rightX0 + rightW - 2} y1={viewCTop + VIEW_C_HEADER_H + 6} y2={viewCTop + VIEW_C_HEADER_H + 6} className="integrated-view-c-header-line" />

                <rect className="integrated-divider-band" x={leftX0} y={dividerY - 9} width={leftW} height={18} rx={6} ry={6} />
                <line className="integrated-divider-line" x1={leftX0} x2={leftX0 + leftW} y1={dividerY} y2={dividerY} />
                <rect className="integrated-col-divider-band" x={columnDividerX - 8} y={MARGIN.top} width={16} height={plotHeight} rx={6} ry={6} />
                <line className="integrated-col-divider-line" x1={columnDividerX} x2={columnDividerX} y1={MARGIN.top} y2={MARGIN.top + plotHeight} />

                <text key={`title-a-${titlePulseNonce}-${postAbstractNonce}`} className={`integrated-view-title ${postOn && titlePulseNonce > 0 ? 'is-pulse' : ''} ${abstractPostOn ? 'is-post-abstract' : ''}`} x={leftX0 + 10} y={viewATop + 18}>View A: {representation === 'beeswarm' ? 'Beeswarm' : 'Histogram'}</text>
                <text key={`title-b-${postAbstractNonce}`} className={`integrated-view-title ${abstractPostOn ? 'is-post-abstract' : ''}`} x={leftX0 + 10} y={viewBTop + 18}>View B: Time series</text>
                <text key={`title-c-${postAbstractNonce}`} className={`integrated-view-title ${abstractPostOn ? 'is-post-abstract' : ''}`} x={rightX0 + 10} y={viewCTop + 18}>View C: Ranking strip ({sortMode})</text>
                {preOn && previewDetailLevel !== null && (
                  <g className="integrated-abstract-preview-anchor">
                    <circle cx={leftX0 + leftW - 30} cy={viewBTop + 34} r={8.2} className="integrated-abstract-anchor-ring" />
                    <circle cx={leftX0 + leftW - 30} cy={viewBTop + 34} r={2.7} className="integrated-abstract-anchor-dot" />
                    <rect x={leftX0 + leftW - 226} y={viewBTop + 40} width={194} height={abstractPreviewZoneH} rx={8} ry={8} className={`integrated-abstract-tooltip-zone is-level-${previewDetailLevel}`} />
                  </g>
                )}

                {d3.ticks(0, 100, 5).map(tick => <line key={`grid-a-${tick}`} className="integrated-grid-line" x1={xScaleValue(tick)} x2={xScaleValue(tick)} y1={viewATop + 24} y2={viewABottom - 18} />)}
                {yTicks.map(tick => <line key={`grid-b-${tick}`} className="integrated-grid-line" x1={leftX0} x2={leftX0 + leftW} y1={yScale(tick)} y2={yScale(tick)} />)}

                <line className="integrated-axis-line" x1={leftX0} x2={leftX0 + leftW} y1={viewABottom - 18} y2={viewABottom - 18} />
                {d3.ticks(0, 100, 5).map(tick => (
                  <g key={`value-tick-${tick}`}>
                    <line className="integrated-axis-tick-line" x1={xScaleValue(tick)} x2={xScaleValue(tick)} y1={viewABottom - 18} y2={viewABottom - 13} />
                    <text className="integrated-axis-tick" x={xScaleValue(tick)} y={viewABottom - 2} textAnchor="middle">{Math.round(tick)}</text>
                  </g>
                ))}

                <text className="integrated-axis-label" x={leftX0 + leftW / 2} y={viewABottom + 14} textAnchor="middle">Internet users (% of population)</text>

                <line className="integrated-axis-line" x1={leftX0} x2={leftX0 + leftW} y1={viewBBottom} y2={viewBBottom} />
                <line className="integrated-axis-line" x1={leftX0} x2={leftX0} y1={viewBTop} y2={viewBBottom} />
                {yearTicks.map(tick => (
                  <g key={`year-tick-${tick}`}>
                    <line className="integrated-axis-tick-line" x1={xScaleYear(tick)} x2={xScaleYear(tick)} y1={viewBBottom} y2={viewBBottom + 5} />
                    <text className="integrated-axis-tick" x={xScaleYear(tick)} y={viewBBottom + 20} textAnchor="middle">{tick}</text>
                  </g>
                ))}

                {yTicks.map(tick => (
                  <g key={`y-tick-${tick}`}>
                    <line className="integrated-axis-tick-line" x1={leftX0 - 5} x2={leftX0} y1={yScale(tick)} y2={yScale(tick)} />
                    <text className="integrated-axis-tick" x={leftX0 - 10} y={yScale(tick) + 4} textAnchor="end">{Math.round(tick)}</text>
                  </g>
                ))}

                <text className={`integrated-axis-label ${abstractPostOn ? 'is-post-abstract' : ''}`} key={`axis-x-${postAbstractNonce}`} x={leftX0 + leftW / 2} y={viewBBottom + 46} textAnchor="middle">Year window</text>
                <text className={`integrated-axis-label ${abstractPostOn ? 'is-post-abstract' : ''}`} key={`axis-y-${postAbstractNonce}`} transform={`translate(${leftX0 - 50}, ${(viewBTop + viewBBottom) / 2}) rotate(-90)`} textAnchor="middle">Internet use (%)</text>

                <line className={`integrated-focus-line ${inOn && focusPulseNonce > 0 ? 'is-pulse' : ''} ${attentionTarget === 'focus' ? 'is-attention' : ''} ${isFocusHot ? 'is-pre-hot' : ''}`} x1={focusX} x2={focusX} y1={viewBTop} y2={viewBBottom} />
                <line className={`integrated-window-line ${inOn && windowPulseNonce > 0 ? 'is-pulse' : ''} ${attentionTarget === 'window' ? 'is-attention' : ''} ${isWindowStartHot ? 'is-pre-hot' : ''}`} x1={xScaleYear(startYear)} x2={xScaleYear(startYear)} y1={viewBTop} y2={viewBBottom} />
                <line className={`integrated-window-line ${inOn && windowPulseNonce > 0 ? 'is-pulse' : ''} ${attentionTarget === 'window' ? 'is-attention' : ''} ${isWindowEndHot ? 'is-pre-hot' : ''}`} x1={xScaleYear(endYear)} x2={xScaleYear(endYear)} y1={viewBTop} y2={viewBBottom} />
                {isJuicyOne && preOn && (
                  <g className="integrated-pre-arrows" pointerEvents="none">
                    {isFocusHot && (
                      <>
                        <polygon className="integrated-pre-arrow" points={`${focusX - 20},${arrowY} ${focusX - 8},${arrowY - 7} ${focusX - 8},${arrowY + 7}`} />
                        <polygon className="integrated-pre-arrow" points={`${focusX + 20},${arrowY} ${focusX + 8},${arrowY - 7} ${focusX + 8},${arrowY + 7}`} />
                      </>
                    )}
                    {isWindowStartHot && (
                      <polygon className="integrated-pre-arrow" points={`${xScaleYear(startYear) - 20},${arrowY} ${xScaleYear(startYear) - 8},${arrowY - 7} ${xScaleYear(startYear) - 8},${arrowY + 7}`} />
                    )}
                    {isWindowEndHot && (
                      <polygon className="integrated-pre-arrow" points={`${xScaleYear(endYear) + 20},${arrowY} ${xScaleYear(endYear) + 8},${arrowY - 7} ${xScaleYear(endYear) + 8},${arrowY + 7}`} />
                    )}
                  </g>
                )}
                {showFilterGuideLines && (
                  <g className={`integrated-filter-guides ${isFilterInScrub ? 'is-in-scrub' : 'is-pre-hover'}`}>
                    <line className="integrated-filter-guide-line is-view-a" x1={xScaleValue(valueMin)} x2={xScaleValue(valueMin)} y1={viewATop + 24} y2={viewABottom - 18} />
                    <line className="integrated-filter-guide-line is-view-a" x1={xScaleValue(valueMax)} x2={xScaleValue(valueMax)} y1={viewATop + 24} y2={viewABottom - 18} />
                    <line className="integrated-filter-guide-line is-view-b" x1={leftX0} x2={leftX0 + leftW} y1={yScale(valueMin)} y2={yScale(valueMin)} />
                    <line className="integrated-filter-guide-line is-view-b" x1={leftX0} x2={leftX0 + leftW} y1={yScale(valueMax)} y2={yScale(valueMax)} />
                  </g>
                )}
                {preOn && (
                  <g className="integrated-pre-guides" pointerEvents="none">
                    <line ref={preGuideVARef} className="integrated-pre-guide-line is-view-a-v" x1={leftX0} x2={leftX0} y1={viewATop} y2={viewABottom} />
                    <line ref={preGuideHARef} className="integrated-pre-guide-line is-view-a-h" x1={leftX0} x2={leftX0 + leftW} y1={viewATop} y2={viewATop} />
                    <line ref={preGuideHBRef} className="integrated-pre-guide-line is-view-b-h" x1={leftX0} x2={leftX0 + leftW} y1={viewBTop} y2={viewBTop} />
                  </g>
                )}
                {inOn && (
                  <g className="integrated-explore-band">
                    <rect x={leftX0 + 2} y={viewBBottom - 30} width={Math.max(1, leftW - 4)} height={20} rx={5} ry={5} className="integrated-explore-band-box" />
                    <text x={leftX0 + leftW / 2} y={viewBBottom - 16} textAnchor="middle" className="integrated-explore-band-label">Drag to set year window</text>
                  </g>
                )}
                {showExplorePreHint && (
                  <g key={`explore-pre-${startYear}-${endYear}`} className="integrated-explore-prehint">
                    <path className="integrated-explore-hint-bracket" d={`M ${brushHintStartX} ${viewBBottom - 26} v 12 h 8`} />
                    <path className="integrated-explore-hint-bracket" d={`M ${brushHintEndX} ${viewBBottom - 26} v 12 h -8`} />
                  </g>
                )}
                {explorePostOn && (
                  <g key={`post-explore-${postExploreNonce}`} className="integrated-post-explore">
                    <path className="integrated-post-bracket" d={`M ${xScaleYear(startYear)} ${viewBBottom - 18} V ${viewBBottom - 4} h 9`} />
                    <path className="integrated-post-bracket" d={`M ${xScaleYear(endYear)} ${viewBBottom - 18} V ${viewBBottom - 4} h -9`} />
                  </g>
                )}

                {representation === 'beeswarm' && (
                  <g className={`integrated-view-a-layer is-visible ${showEncodePreview ? 'is-preview-dim' : ''}`}>
                    {beeswarmNodes.map((node, index) => {
                      const isActive = activeKeySet.has(node.key)
                      const isSelected = selectedKey === node.key
                      const isRelated = relatedKeySet.has(node.key)
                      const isHovered = hoveredKey === node.key || hoveredGroupSet.has(node.key)
                      const isPlainConnectHover = isPlainMode && isHovered
                      const isRegionHovered = Boolean(regionHoverKeySet?.has(node.key))
                      const isRegionDim = hasRegionHover && !isRegionHovered
                      const dotRadius = isPlainConnectHover ? 7.9 : isSelected || isHovered ? 6 : isRelated ? 5.2 : DOT_R
                      const cls = ['ig-dot', isActive ? 'ig-dot--active' : 'is-inactive', isSelected ? 'is-selected' : '', isRelated ? 'is-related' : '', isHovered ? 'is-hovered' : '', isPlainConnectHover ? 'is-plain-connect-hover' : '', isRegionHovered ? 'is-region-hovered' : '', isRegionDim ? 'is-region-dim' : '', encodePostOn ? 'is-post-encode-dot' : ''].filter(Boolean).join(' ')
                      const showNodeLabel = (detailLevel >= 1 && (isSelected || isHovered)) || (detailLevel === 0 && isSelected)
                      const labelGeometry = showNodeLabel && useReadableViewALabel ? getViewALabelGeometry(node) : null
                      return (
                        <g key={`dot-${postEncodeNonce}-${node.key}`}>
                          <circle className={cls} cx={node.x} cy={node.y} r={dotRadius} style={{ '--ig-accent': accentFor(node.key), '--enter-delay': `${index * 14}ms` } as CSSProperties} onPointerDown={handleSelectPress} onMouseMove={event => handleCountryHover(event, node.key)} onMouseLeave={() => handleCountryLeave(node.key)} onClick={() => selectCountry(node.key)} />
                          {showNodeLabel && labelGeometry && (
                            <g key={`pl-box-${postAbstractNonce}-${node.key}`} className="integrated-point-label-callout">
                              <rect className="integrated-point-label-bg" x={labelGeometry.rectX} y={labelGeometry.rectY} width={labelGeometry.labelW} height={labelGeometry.labelH} rx={8} ry={8} />
                              <text className={`integrated-point-label-text ${abstractPostOn ? 'is-post-abstract' : ''}`} x={labelGeometry.textX} y={labelGeometry.textY}>{node.entity}</text>
                            </g>
                          )}
                          {showNodeLabel && !labelGeometry && <text key={`pl-${postAbstractNonce}-${node.key}`} className={`integrated-point-label ${abstractPostOn ? 'is-post-abstract' : ''}`} x={node.x + 6} y={node.y - 8}>{node.entity}</text>}
                        </g>
                      )
                    })}
                  </g>
                )}

                {representation === 'histogram' && (
                  <g className={`integrated-view-a-layer is-visible ${showEncodePreview ? 'is-preview-dim' : ''}`}>
                    {histBars.map(bar => {
                      const hasRegionInBin = Boolean(regionHoverKeySet && bar.keys.some(key => regionHoverKeySet.has(key)))
                      const isRegionDim = hasRegionHover && !hasRegionInBin
                      const cls = ['ig-bin', bar.active > 0 ? 'ig-bin--active' : 'is-inactive', hoveredBinIndex === bar.index ? 'is-hovered' : '', hasRegionInBin ? 'is-region-hovered' : '', isRegionDim ? 'is-region-dim' : '', encodePostOn ? 'is-post-encode-bar' : ''].filter(Boolean).join(' ')
                      return <rect key={`bin-${postEncodeNonce}-${bar.index}`} className={cls} x={bar.x0 + 1} y={bar.y} width={Math.max(1, bar.x1 - bar.x0 - 2)} height={Math.max(0, bar.h)} style={{ '--enter-delay': `${bar.index * 18}ms` } as CSSProperties} onPointerDown={handleSelectPress} onMouseMove={event => handleBinMove(event, bar)} onMouseLeave={() => handleBinLeave(bar.index)} />
                    })}
                  </g>
                )}

                {preOn && previewRepresentation === 'histogram' && representation === 'beeswarm' && (
                  <g className="integrated-preview-encode-layer is-preview-histogram" pointerEvents="none">
                    {histBars.map(bar => (
                      <rect key={`preview-bin-${bar.index}`} x={bar.x0 + 1} y={bar.y} width={Math.max(1, bar.x1 - bar.x0 - 2)} height={Math.max(0, bar.h)} className="integrated-preview-bin" />
                    ))}
                  </g>
                )}
                {preOn && previewRepresentation === 'beeswarm' && representation === 'histogram' && (
                  <g className="integrated-preview-encode-layer is-preview-beeswarm" pointerEvents="none">
                    {beeswarmNodes.map(node => <circle key={`preview-dot-${node.key}`} cx={node.x} cy={node.y} r={DOT_R - 0.6} className="integrated-preview-dot" />)}
                  </g>
                )}

                <g
                  className="integrated-lines-layer integrated-lines-layer-base"
                  style={showRegionLineOverlay ? { opacity: 0.22 } : undefined}
                >
                  {lines.map(line => {
                    const isActive = activeKeySet.has(line.key)
                    const isSelected = selectedKey === line.key
                    const isRelated = relatedKeySet.has(line.key)
                    const isHovered = hoveredKey === line.key
                    const isGroupHovered = hoveredGroupSet.has(line.key)
                    const cls = ['integrated-line', isActive ? 'is-active' : 'is-inactive', isSelected ? 'is-selected' : '', isRelated ? 'is-related' : '', isHovered ? 'is-hovered' : '', isGroupHovered ? 'is-group-hovered' : ''].filter(Boolean).join(' ')
                    return (
                      <g key={`line-${line.key}`}>
                        <path d={line.path} className={cls} style={{ '--ig-accent': accentFor(line.key) } as CSSProperties} />
                        <path d={line.path} className="integrated-line-hit" onPointerDown={handleSelectPress} onMouseMove={event => handleCountryHover(event, line.key, detailLevel >= 1)} onMouseLeave={() => handleCountryLeave(line.key)} onClick={() => selectCountry(line.key)} />
                      </g>
                    )
                  })}
                </g>
                {showRegionLineOverlay && (
                  <g className="integrated-lines-layer integrated-lines-layer-region-overlay" pointerEvents="none">
                    {regionHoverLines.map(line => (
                      <path
                        key={`line-overlay-${line.key}`}
                        d={line.path}
                        className="integrated-line-region-overlay"
                      />
                    ))}
                  </g>
                )}

                {selectedDots.length > 0 && <g className="integrated-selected-dots">{selectedDots.map((dot, index) => <circle key={`sd-${index}`} cx={dot.x} cy={dot.y} r={2.3} className="integrated-selected-year-dot" />)}</g>}

                <g className="integrated-markers-layer">
                  {markers.map(marker => {
                    const isPlainConnectHover = isPlainMode && marker.kind === 'hovered'
                    const radius = marker.kind === 'selected' ? 6.4 : marker.kind === 'related' ? 5.1 : isPlainConnectHover ? 9 : 5.6
                    return (
                      <circle
                        key={`mk-${marker.kind}-${marker.key}`}
                        cx={focusX}
                        cy={marker.y}
                        r={radius}
                        className={`integrated-focus-marker is-${marker.kind} ${isPlainConnectHover ? 'is-plain-connect-hover' : ''}`}
                        style={{ '--ig-accent': accentFor(marker.key) } as CSSProperties}
                      />
                    )
                  })}
                  {selectPostOn && selectedMarkerY !== null && selectedKey && (
                    <circle key={`halo-${postSelectNonce}-${selectedKey}`} cx={focusX} cy={selectedMarkerY} r={7.2} className="integrated-post-select-halo" style={{ '--ig-accent': accentFor(selectedKey) } as CSSProperties} />
                  )}
                </g>

                <g className="integrated-arc-layer">{arcs.map(arc => <path key={`${postConnectNonce}-${relatedPulseNonce}-${arc.key}`} d={arc.d} className={`integrated-related-arc ${inOn ? 'is-draw' : ''} ${connectPostOn ? 'is-post-connect' : ''}`} style={{ '--ig-accent': arc.color, '--arc-delay': `${arc.delay}ms` } as CSSProperties} />)}</g>
                {showBridge && bridge && <path key={`bridge-${hoveredKey ?? 'none'}`} className={`integrated-bridge ${inOn ? 'is-drift' : ''} ${preOn ? 'is-pre-link' : ''}`} d={bridge} />}
                <g ref={brushLayerRef} className={`integrated-brush-layer ${showExplorePreHint ? 'is-pre-hint' : ''} ${inOn ? 'is-in-on' : ''}`} />

                <g className="integrated-ranking-layer" transform={`translate(${rightX0}, ${viewCTop})`} onPointerMove={handleRankingPointerMove} onPointerLeave={handleRankingPointerLeave}>
                  <rect
                    x={2}
                    y={rowTop - 1}
                    width={Math.max(1, rightW - 4)}
                    height={Math.max(1, viewCHeight - rowTop - 5)}
                    fill="transparent"
                    pointerEvents="all"
                    onPointerMove={handleRankingPointerMove}
                  />
                  {preOn && previewSortMode && <rect x={2} y={rowTop - 3} width={Math.max(1, rightW - 4)} height={Math.max(1, viewCHeight - rowTop - 5)} className="integrated-rank-preview-frame" />}
                  <g className={`integrated-ranking-content ${preOn && previewSortMode ? 'is-previewing' : ''}`} clipPath={`url(#${viewCClipId})`}>
                    {topRows.map((row, index) => {
                      const y = rowTop + index * rowH
                      const base = sortMode === 'growth' ? rankScale(0) : rankScale.range()[0]
                      const x = rankScale(safeMetric(row.metricValue))
                      const barX = Math.min(base, x)
                      const barW = Math.max(1, Math.abs(x - base))
                      const isSelected = selectedKey === row.key
                      const isRelated = relatedKeySet.has(row.key)
                      const isHovered = hoveredKey === row.key
                      const isActive = activeKeySet.has(row.key)
                      const isRegionHovered = Boolean(regionHoverKeySet?.has(row.key))
                      const isRegionDim = hasRegionHover && !isRegionHovered
                      return (
                        <g key={`${postReconfigNonce}-${row.key}`} transform={`translate(0 ${y})`}>
                          <g className={`integrated-rank-row ${inOn && reorderNonce > 0 ? 'is-reorder' : ''} ${reconfigPostOn ? 'is-post-settle' : ''} ${isRegionHovered ? 'is-region-hovered' : ''} ${isRegionDim ? 'is-region-dim' : ''}`} style={{ '--row-delay': `${index * 14}ms` } as CSSProperties}>
                            <rect
                              x={2}
                              y={0}
                              width={Math.max(1, rightW - 4)}
                              height={Math.max(1, rowH - 0.8)}
                              className={`integrated-rank-hit ${isActive ? '' : 'is-inactive'} ${isSelected ? 'is-selected' : ''} ${isRelated ? 'is-related' : ''} ${isHovered ? 'is-hovered' : ''} ${isRegionHovered ? 'is-region-hovered' : ''} ${isRegionDim ? 'is-region-dim' : ''}`}
                              onPointerDown={handleSelectPress}
                              onMouseMove={event => handleCountryHover(event, row.key, detailLevel >= 1)}
                              onMouseLeave={() => handleCountryLeave(row.key)}
                              onClick={() => selectCountry(row.key)}
                            />
                            <text key={`rn-${postAbstractNonce}-${row.key}`} x={8} y={Math.max(8, rowH - 2)} className={`integrated-rank-name ${abstractPostOn ? 'is-post-abstract' : ''} ${isRegionHovered ? 'is-region-hovered' : ''} ${isRegionDim ? 'is-region-dim' : ''}`}>{row.country.entity}</text>
                            <rect
                              x={barX}
                              y={Math.max(0.8, rowH * 0.22)}
                              width={barW}
                              height={Math.max(0.8, rowH * 0.56)}
                              className={`integrated-rank-bar ${isSelected ? 'is-selected' : isRelated ? 'is-related' : ''} ${isHovered && !isSelected ? 'is-hovered' : ''} ${isRegionHovered ? 'is-region-hovered' : ''} ${isRegionDim ? 'is-region-dim' : ''}`}
                              style={{ '--ig-accent': accentFor(row.key) } as CSSProperties}
                              onMouseMove={event => handleCountryHover(event, row.key, detailLevel >= 1)}
                              onMouseLeave={() => handleCountryLeave(row.key)}
                            />
                            {detailLevel === 2 && <text key={`rm-${postAbstractNonce}-${row.key}`} x={rightW - 8} y={Math.max(8, rowH - 2)} className={`integrated-rank-metric ${abstractPostOn ? 'is-post-abstract' : ''}`} textAnchor="end">v:{fmt(row.focusValue ?? 0)} g:{fmt(row.growth)} s:{fmt(row.volatility)}</text>}
                          </g>
                        </g>
                      )
                    })}
                  </g>
                  {preOn && previewSortMode && (
                    <g className="integrated-rank-preview-layer" clipPath={`url(#${viewCClipId})`}>
                      {previewRows.map((row, index) => {
                        const y = rowTop + index * rowH
                        const base = previewSortMode === 'growth' ? previewRankScale(0) : previewRankScale.range()[0]
                        const x = previewRankScale(safeMetric(row.metricValue))
                        const barX = Math.min(base, x)
                        const barW = Math.max(1, Math.abs(x - base))
                        return (
                          <g key={`preview-row-${row.key}`} transform={`translate(0 ${y})`}>
                            <g className="integrated-rank-preview-row">
                              <rect x={barX} y={Math.max(0.8, rowH * 0.22)} width={barW} height={Math.max(0.8, rowH * 0.56)} className="integrated-rank-preview-bar" />
                              <text x={8} y={Math.max(8, rowH - 2)} className="integrated-rank-preview-name">{row.country.entity}</text>
                            </g>
                          </g>
                        )
                      })}
                    </g>
                  )}
                </g>
              </svg>

              {preOn && previewDetailLevel !== null && (
                <div className={`integrated-abstract-preview-card is-level-${previewDetailLevel}`}>
                  <div className="integrated-abstract-preview-title">Detail {previewDetailLevel} preview</div>
                  <div className="integrated-abstract-preview-mock">
                    <div className="integrated-abstract-preview-chip">Country</div>
                    {previewDetailLevel >= 1 && <div className="integrated-abstract-preview-chip is-secondary">ISO code</div>}
                    {previewDetailLevel === 2 && <><div className="integrated-abstract-preview-chip">growth</div><div className="integrated-abstract-preview-chip">volatility</div></>}
                  </div>
                  {previewDetailLevel === 0 && <div className="integrated-abstract-preview-row">Minimal: no hover tooltip, only selected labels stay.</div>}
                  {previewDetailLevel === 1 && <div className="integrated-abstract-preview-row">Default: show tooltip title and current value.</div>}
                  {previewDetailLevel === 2 && <div className="integrated-abstract-preview-row">Detailed: include richer metrics and denser annotation.</div>}
                </div>
              )}

              {detailLevel >= 1 && tooltip && tooltipCountry && (
                <div className={`integrated-tooltip ${detailLevel === 0 ? 'is-compact' : ''}`} style={{ left: tooltip.x, top: tooltip.y }}>
                  <div className="integrated-tooltip-title">{tooltipCountry.entity}</div>
                  {detailLevel >= 1 && <div className="integrated-tooltip-subtitle">{tooltipCountry.code}</div>}
                  <div className="integrated-tooltip-row">{focusYear}: {fmt(tooltipCountry.valueByYear.get(focusYear) ?? 0)}%</div>
                  {detailLevel === 2 && tooltipMetric && <><div className="integrated-tooltip-row">growth: {fmt(tooltipMetric.growth)}</div><div className="integrated-tooltip-row">volatility: {fmt(tooltipMetric.volatility)}</div></>}
                </div>
              )}

              {representation === 'histogram' && histTooltip && hoveredBin && (
                <div className="integrated-tooltip integrated-tooltip-bin" style={{ left: histTooltip.x, top: histTooltip.y }}>
                  <div className="integrated-tooltip-title">Histogram bin</div>
                  <div className="integrated-tooltip-row">countries: {hoveredBin.total}</div>
                  <div className="integrated-tooltip-row">active: {hoveredBin.active}</div>
                  <div className="integrated-tooltip-list">
                    {hoveredBinCountries.map(entry => (
                      <button key={`bin-country-${entry.key}`} type="button" className={`integrated-tooltip-country-btn ${entry.active ? '' : 'is-inactive'} ${selectedKey === entry.key ? 'is-selected' : ''}`} onMouseEnter={() => commitHoveredKey(entry.key)} onMouseLeave={() => handleCountryLeave(entry.key)} onClick={() => selectCountry(entry.key)}>
                        <span>{entry.entity}</span><span>{fmt(entry.value)}%</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <aside className="integrated-panel">
        <div className="integrated-toast-anchor">
          {toast && <div key={`toast-${toast.id}`} className={`integrated-toast-chip ${postOn ? 'is-show' : ''}`}>{toast.text}</div>}
        </div>

        <section className="integrated-panel-section">
          <div className="integrated-section-title">Selection</div>
          <div className="integrated-status-line">Selected: <strong>{selectedKey ? countryByKey.get(selectedKey)?.entity ?? 'None' : 'None'}</strong></div>
          <label className="integrated-control-label" htmlFor="integrated-related-count">Related count: <strong>{relatedCount}</strong></label>
          <input
            id="integrated-related-count"
            className={`integrated-range ${isRelatedCountHot ? 'is-hot' : ''}`}
            type="range"
            min={3}
            max={10}
            step={1}
            value={relatedCount}
            style={{ '--ig-pct': toRangePct(relatedCount, 3, 10) } as CSSProperties}
            onChange={event => setRelatedCount(Number(event.target.value))}
            onMouseEnter={() => emitPre('connect_ready')}
            onPointerEnter={() => activateHotControl('relatedCount')}
            onPointerLeave={() => deactivateHotControl('relatedCount')}
            onPointerDown={event => beginRangeScrub(event, 'selection', 'relatedCount')}
            onPointerUp={event => { endRangeScrub(); finalizeHotControlOnPointerEnd('relatedCount', event.currentTarget.matches(':hover')) }}
            onPointerCancel={event => { endRangeScrub(); finalizeHotControlOnPointerEnd('relatedCount', event.currentTarget.matches(':hover')) }}
            disabled={loading || Boolean(error) || countries.length === 0}
          />
          <button type="button" className="integrated-button" onClick={() => { setSelectedKey(null); commitHoveredKey(null); scheduleTooltip(null); setHoveredGroupKeys([]); setHoveredBinIndex(null) }} disabled={loading || Boolean(error)}>Clear selection</button>
        </section>

        <section className="integrated-panel-section">
          <div className="integrated-section-title">Explore</div>
          <label className="integrated-control-label" htmlFor="integrated-focus-year">Focus year: <strong>{focusYear}</strong></label>
          <input
            id="integrated-focus-year"
            className={`integrated-range ${isFocusHot ? 'is-hot' : ''}`}
            type="range"
            min={startYear}
            max={endYear}
            step={1}
            value={focusYear}
            style={{ '--ig-pct': toRangePct(focusYear, startYear, endYear) } as CSSProperties}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              const next = Number(event.target.value)
              if (!Number.isFinite(next)) return
              setFocusYear(nearestYear(clamp(next, startYear, endYear), years))
              emitIn('explore_scrub')
            }}
            onPointerEnter={() => { handleExploreGuideEnter('focusYear'); setAttentionTarget('focus') }}
            onPointerLeave={() => { handleExploreGuideLeave('focusYear'); setAttentionTarget(previous => (previous === 'focus' ? null : previous)) }}
            onPointerDown={event => beginRangeScrub(event, 'explore', 'focusYear')}
            onPointerUp={event => { endRangeScrub(); finalizeHotControlOnPointerEnd('focusYear', event.currentTarget.matches(':hover')); finalizeExplorePost() }}
            onPointerCancel={event => { endRangeScrub(); finalizeHotControlOnPointerEnd('focusYear', event.currentTarget.matches(':hover')); finalizeExplorePost() }}
            disabled={loading || Boolean(error) || years.length === 0}
          />
          <label className="integrated-control-label" htmlFor="integrated-start-year">Window start: <strong>{startYear}</strong></label>
          <input
            id="integrated-start-year"
            className={`integrated-range ${preOn && hotControl === 'windowStart' ? 'is-hot' : ''}`}
            type="range"
            min={minYear}
            max={maxYear}
            step={1}
            value={startYear}
            style={{ '--ig-pct': toRangePct(startYear, minYear, maxYear) } as CSSProperties}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              const next = Number(event.target.value)
              if (!Number.isFinite(next)) return
              clampWindow(next, endYear)
              emitIn('explore_scrub')
            }}
            onPointerEnter={() => { handleExploreGuideEnter('windowStart'); setAttentionTarget('window') }}
            onPointerLeave={() => { handleExploreGuideLeave('windowStart'); setAttentionTarget(previous => (previous === 'window' ? null : previous)) }}
            onPointerDown={event => beginRangeScrub(event, 'explore', 'windowStart')}
            onPointerUp={event => { endRangeScrub(); finalizeHotControlOnPointerEnd('windowStart', event.currentTarget.matches(':hover')); finalizeExplorePost() }}
            onPointerCancel={event => { endRangeScrub(); finalizeHotControlOnPointerEnd('windowStart', event.currentTarget.matches(':hover')); finalizeExplorePost() }}
            disabled={loading || Boolean(error) || years.length === 0}
          />
          <label className="integrated-control-label" htmlFor="integrated-end-year">Window end: <strong>{endYear}</strong></label>
          <input
            id="integrated-end-year"
            className={`integrated-range ${preOn && hotControl === 'windowEnd' ? 'is-hot' : ''}`}
            type="range"
            min={minYear}
            max={maxYear}
            step={1}
            value={endYear}
            style={{ '--ig-pct': toRangePct(endYear, minYear, maxYear) } as CSSProperties}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              const next = Number(event.target.value)
              if (!Number.isFinite(next)) return
              clampWindow(startYear, next)
              emitIn('explore_scrub')
            }}
            onPointerEnter={() => { handleExploreGuideEnter('windowEnd'); setAttentionTarget('window') }}
            onPointerLeave={() => { handleExploreGuideLeave('windowEnd'); setAttentionTarget(previous => (previous === 'window' ? null : previous)) }}
            onPointerDown={event => beginRangeScrub(event, 'explore', 'windowEnd')}
            onPointerUp={event => { endRangeScrub(); finalizeHotControlOnPointerEnd('windowEnd', event.currentTarget.matches(':hover')); finalizeExplorePost() }}
            onPointerCancel={event => { endRangeScrub(); finalizeHotControlOnPointerEnd('windowEnd', event.currentTarget.matches(':hover')); finalizeExplorePost() }}
            disabled={loading || Boolean(error) || years.length === 0}
          />
        </section>

        <section className="integrated-panel-section">
          <div className="integrated-section-title">Filter</div>
          <div key={`count-${postFilterNonce}-${countPulseNonce}-${activeCount}`} className={`integrated-count-chip ${filterPostOn ? 'is-pulse is-post-stamp' : ''}`}>
            Showing <strong>{activeCount}</strong> / {totalCount}
            <span className="integrated-count-check" aria-hidden="true">✓</span>
          </div>
          <label className="integrated-control-label" htmlFor="integrated-value-min">Value min: <strong>{fmt(valueMin)}%</strong></label>
          <input
            id="integrated-value-min"
            className={`integrated-range ${preOn && hotControl === 'valueMin' ? 'is-hot' : ''}`}
            type="range"
            min={0}
            max={100}
            step={1}
            value={valueMin}
            style={{ '--ig-pct': toRangePct(valueMin, 0, 100) } as CSSProperties}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              const next = Number(event.target.value)
              if (!Number.isFinite(next)) return
              setValueMin(() => {
                const clamped = clamp(next, 0, 100)
                if (clamped > valueMax) setValueMax(clamped)
                return clamped
              })
              triggerFilterDone()
            }}
            onMouseEnter={() => handleFilterGuideEnter('valueMin')}
            onPointerEnter={() => handleFilterGuideEnter('valueMin')}
            onPointerLeave={() => handleFilterGuideLeave('valueMin')}
            onPointerDown={event => beginRangeScrub(event, 'filter', 'valueMin')}
            onPointerUp={event => {
              endRangeScrub()
              const keepHot = event.currentTarget.matches(':hover')
              finalizeHotControlOnPointerEnd('valueMin', keepHot)
              if (!keepHot) setShowFilterGuides(false)
              finalizeFilterPost()
            }}
            onPointerCancel={event => {
              endRangeScrub()
              const keepHot = event.currentTarget.matches(':hover')
              finalizeHotControlOnPointerEnd('valueMin', keepHot)
              if (!keepHot) setShowFilterGuides(false)
              finalizeFilterPost()
            }}
            disabled={loading || Boolean(error) || countries.length === 0}
          />
          <label className="integrated-control-label" htmlFor="integrated-value-max">Value max: <strong>{fmt(valueMax)}%</strong></label>
          <input
            id="integrated-value-max"
            className={`integrated-range ${preOn && hotControl === 'valueMax' ? 'is-hot' : ''}`}
            type="range"
            min={0}
            max={100}
            step={1}
            value={valueMax}
            style={{ '--ig-pct': toRangePct(valueMax, 0, 100) } as CSSProperties}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              const next = Number(event.target.value)
              if (!Number.isFinite(next)) return
              setValueMax(() => {
                const clamped = clamp(next, 0, 100)
                if (clamped < valueMin) setValueMin(clamped)
                return clamped
              })
              triggerFilterDone()
            }}
            onMouseEnter={() => handleFilterGuideEnter('valueMax')}
            onPointerEnter={() => handleFilterGuideEnter('valueMax')}
            onPointerLeave={() => handleFilterGuideLeave('valueMax')}
            onPointerDown={event => beginRangeScrub(event, 'filter', 'valueMax')}
            onPointerUp={event => {
              endRangeScrub()
              const keepHot = event.currentTarget.matches(':hover')
              finalizeHotControlOnPointerEnd('valueMax', keepHot)
              if (!keepHot) setShowFilterGuides(false)
              finalizeFilterPost()
            }}
            onPointerCancel={event => {
              endRangeScrub()
              const keepHot = event.currentTarget.matches(':hover')
              finalizeHotControlOnPointerEnd('valueMax', keepHot)
              if (!keepHot) setShowFilterGuides(false)
              finalizeFilterPost()
            }}
            disabled={loading || Boolean(error) || countries.length === 0}
          />
          <label className="integrated-control-label" htmlFor="integrated-prefix">Country prefix</label>
          <input
            id="integrated-prefix"
            className="integrated-text"
            type="text"
            value={countryPrefix}
            placeholder='e.g. "Uni"'
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              setCountryPrefix(event.target.value)
              triggerFilterDone()
            }}
            onMouseEnter={() => emitPre('filter_focus')}
            disabled={loading || Boolean(error)}
          />
          <label className="integrated-check-row">
            <input
              type="checkbox"
              checked={showContext}
              onMouseEnter={() => emitPre('filter_focus')}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                setShowContext(event.target.checked)
                emitIn('filter_apply')
                finalizeFilterPost(activeCount)
              }}
            />
            <span>Show context</span>
          </label>
        </section>

        <section className="integrated-panel-section">
          <div className="integrated-section-title">Reconfigure</div>
          <div className="integrated-button-row">
            <button type="button" className={`integrated-button subtle ${sortMode === 'value' ? 'is-active' : ''}`} onMouseEnter={() => { emitPre('reconfig_hover'); if (preOn) setPreviewSortMode('value') }} onMouseLeave={() => setPreviewSortMode(previous => (previous === 'value' ? null : previous))} onClick={() => commitSortMode('value')}>Value</button>
            <button type="button" className={`integrated-button subtle ${sortMode === 'growth' ? 'is-active' : ''}`} onMouseEnter={() => { emitPre('reconfig_hover'); if (preOn) setPreviewSortMode('growth') }} onMouseLeave={() => setPreviewSortMode(previous => (previous === 'growth' ? null : previous))} onClick={() => commitSortMode('growth')}>Growth</button>
            <button type="button" className={`integrated-button subtle ${sortMode === 'volatility' ? 'is-active' : ''}`} onMouseEnter={() => { emitPre('reconfig_hover'); if (preOn) setPreviewSortMode('volatility') }} onMouseLeave={() => setPreviewSortMode(previous => (previous === 'volatility' ? null : previous))} onClick={() => commitSortMode('volatility')}>Volatility</button>
          </div>
        </section>

        <section className="integrated-panel-section">
          <div className="integrated-section-title">Encode</div>
          <div className="integrated-button-row">
            <button type="button" className={`integrated-button subtle ${representation === 'beeswarm' ? 'is-active' : ''}`} onMouseEnter={() => { emitPre('encode_preview'); if (preOn) setPreviewRepresentation('beeswarm') }} onMouseLeave={() => setPreviewRepresentation(previous => (previous === 'beeswarm' ? null : previous))} onClick={() => commitRepresentation('beeswarm')}>Beeswarm</button>
            <button type="button" className={`integrated-button subtle ${representation === 'histogram' ? 'is-active' : ''}`} onMouseEnter={() => { emitPre('encode_preview'); if (preOn) setPreviewRepresentation('histogram') }} onMouseLeave={() => setPreviewRepresentation(previous => (previous === 'histogram' ? null : previous))} onClick={() => commitRepresentation('histogram')}>Histogram</button>
          </div>
          <div className={`integrated-preview-glyph ${previewRepresentation ? 'is-visible' : ''}`}>{previewRepresentation === 'beeswarm' ? '•• • • ••' : '▁▃▆▅▂'}</div>
          {representation === 'histogram' && <div className="integrated-hint-text">Histogram bins (hover to inspect countries)</div>}
        </section>

        <section className="integrated-panel-section">
          <div className="integrated-section-title">Abstract</div>
          <div className="integrated-button-row">
            {([0, 1, 2] as DetailLevel[]).map(level => <button key={`detail-${level}`} type="button" className={`integrated-button subtle ${detailLevel === level ? 'is-active' : ''}`} onMouseEnter={() => { emitPre('abstract_hint'); if (preOn) setPreviewDetailLevel(level) }} onMouseLeave={() => setPreviewDetailLevel(previous => (previous === level ? null : previous))} onClick={() => commitDetailLevel(level)}>Detail {level}</button>)}
          </div>
        </section>

        <section className="integrated-panel-section">
          <div className="integrated-section-title">Connect</div>
          {!selectedKey && <div className="integrated-empty-note">Select a country to reveal related countries.</div>}
          {selectedKey && relatedItems.length === 0 && <div className="integrated-empty-note">No related countries in current active set.</div>}
          {selectedKey && relatedItems.length > 0 && (
            <ol key={`related-${postConnectNonce}-${relatedPulseNonce}`} className={`integrated-related-list ${connectPostOn ? 'is-post-connect' : ''}`}>
              {relatedItems.map(item => (
                <li key={`related-item-${item.key}`} className="integrated-related-item">
                  <button type="button" className={`integrated-related-btn ${hoveredKey === item.key ? 'is-hovered' : ''}`} onMouseEnter={() => commitHoveredKey(item.key)} onMouseLeave={() => handleCountryLeave(item.key)} onClick={() => selectCountry(item.key)}><span>{item.country.entity}</span><span>{fmt(item.value)}%</span></button>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="integrated-panel-section">
          <div className="integrated-section-title">Reset</div>
          <button type="button" className="integrated-button" onClick={resetAll} disabled={loading || Boolean(error)}>Reset all controls</button>
          {metadata && <div className="integrated-metadata"><div>{metadata.title}</div><div>Timespan: {metadata.timespan}</div><div>Updated: {metadata.lastUpdated}</div></div>}
        </section>
      </aside>
    </div>
  )
}
