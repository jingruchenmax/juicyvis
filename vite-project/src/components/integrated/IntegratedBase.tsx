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
type InBurstKind = 'none' | 'select' | 'explore' | 'filter' | 'reconfig' | 'encode' | 'abstract' | 'connect'
type PostKind = 'none' | 'select' | 'explore' | 'reconfigure' | 'encode' | 'abstract' | 'filter' | 'connect'
type PostView = 'A' | 'B' | 'C'
type FilterPostSource = 'slider' | 'legend' | 'prefix' | 'context'
type PostFilterSweepMask = 'none' | 'A' | 'B' | 'AB'
type HotControl = 'relatedCount' | 'focusYear' | 'windowStart' | 'windowEnd' | 'valueMin' | 'valueMax'
type RegionName = 'Africa' | 'Asia' | 'Europe' | 'North America' | 'Oceania' | 'South America' | 'Unknown'

interface PostBadge {
  view: PostView
  text: string
}

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
  v0: number
  v1: number
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
const POST_SELECT_DING_DELAY_MS = 560
const CLICK_BRIDGE_BURST_MS = 820
const POST_PERSIST_BRIDGE_DELAY_MS = 900
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

const isIn = (value: number, list: number[]): boolean => list.includes(value)

const getJuicyCaps = (juicyLevel: number): { preOn: boolean; inOn: boolean; postOn: boolean; isPurePre: boolean; isPureIn: boolean; isPurePost: boolean } => {
  const preOn = isIn(juicyLevel, [1, 4, 6, 7])
  const inOn = isIn(juicyLevel, [2, 4, 5, 7])
  const postOn = isIn(juicyLevel, [3, 5, 6, 7])
  return {
    preOn,
    inOn,
    postOn,
    isPurePre: juicyLevel === 1,
    isPureIn: juicyLevel === 2,
    isPurePost: juicyLevel === 3
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

const truncateBadgeText = (value: string, max = 32): string => {
  if (value.length <= max) return value
  return `${value.slice(0, Math.max(1, max - 1))}\u2026`
}

export default function IntegratedBase({ juicyLevel }: IntegratedBaseProps) {
  const { loading, error, countries, years, valueDomain, metadata } = useInternetData()

  const { preOn, inOn, postOn, isPurePre, isPurePost } = getJuicyCaps(juicyLevel)
  const baselineHoverLike = !preOn
  const useReadableViewALabel = baselineHoverLike || isPurePre

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
  const [tipMounted, setTipMounted] = useState(false)
  const [tipVisible, setTipVisible] = useState(false)
  const [tipRenderData, setTipRenderData] = useState<TooltipState | null>(null)
  const [histTipMounted, setHistTipMounted] = useState(false)
  const [histTipVisible, setHistTipVisible] = useState(false)
  const [histTipRenderData, setHistTipRenderData] = useState<HistTooltip | null>(null)
  const [isScrubbing, setIsScrubbing] = useState(false)
  const [activeScrubKind, setActiveScrubKind] = useState<ScrubKind>('none')
  const [activeRangeControl, setActiveRangeControl] = useState<HotControl | null>(null)
  const [inBurstKind, setInBurstKind] = useState<InBurstKind>('none')
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
  const [rippleNonce, setRippleNonce] = useState(0)
  const [ripplePoint, setRipplePoint] = useState<{ x: number; y: number } | null>(null)
  const [encodeSwitching, setEncodeSwitching] = useState(false)
  const [previewRepresentation, setPreviewRepresentation] = useState<Representation | null>(null)
  const [attentionTarget, setAttentionTarget] = useState<'focus' | 'window' | null>(null)
  const [postKind, setPostKind] = useState<PostKind>('none')
  const [postNonce, setPostNonce] = useState(0)
  const [postBadge, setPostBadge] = useState<PostBadge | null>(null)
  const [reconfigBurstTarget, setReconfigBurstTarget] = useState<SortMode | null>(null)
  const [reconfigBurstNonce, setReconfigBurstNonce] = useState(0)
  const [rankFlipDeltas, setRankFlipDeltas] = useState<Record<string, number>>({})
  const [encodeFrom, setEncodeFrom] = useState<Representation | null>(null)
  const [encodeFadeNonce, setEncodeFadeNonce] = useState(0)
  const [filterRegionFxNonce, setFilterRegionFxNonce] = useState(0)
  const [filterRegionFxActive, setFilterRegionFxActive] = useState(false)
  const [clickBridge, setClickBridge] = useState<{ ds: string[]; nonce: number } | null>(null)
  const [persistSelectKey, setPersistSelectKey] = useState<string | null>(null)
  const [postBridgeNonce, setPostBridgeNonce] = useState(0)
  const [postBridgeReady, setPostBridgeReady] = useState(false)
  const [postFilterSweepMask, setPostFilterSweepMask] = useState<PostFilterSweepMask>('A')
  const [postSelectFxActive, setPostSelectFxActive] = useState(false)
  const [postSelectFxNonce, setPostSelectFxNonce] = useState(0)
  const [postLegendFilterFxActive, setPostLegendFilterFxActive] = useState(false)
  const [postLegendFilterFxNonce, setPostLegendFilterFxNonce] = useState(0)

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
  const hideTimerRef = useRef<number | null>(null)
  const tipShowRafRef = useRef<number | null>(null)
  const histHideTimerRef = useRef<number | null>(null)
  const histTipShowRafRef = useRef<number | null>(null)
  const brushRafRef = useRef<number | null>(null)
  const lastBrushTsRef = useRef(0)
  const pendingBrushSelectionRef = useRef<[number, number] | null>(null)
  const rankPrevYRef = useRef<Map<string, number>>(new Map())
  const rankFlipRafRef = useRef<number | null>(null)
  const pendingReconfigFlipRef = useRef(false)
  const reconfigPostRafRef = useRef<number | null>(null)

  const hoverTsRef = useRef(0)
  const dragTsRef = useRef(0)
  const toastTsRef = useRef(0)
  const toastTimeoutRef = useRef<number | null>(null)
  const filterTimeoutRef = useRef<number | null>(null)
  const prefixPostTimeoutRef = useRef<number | null>(null)
  const inBurstTimeoutRef = useRef<number | null>(null)
  const encodeTimeoutRef = useRef<number | null>(null)
  const selectTimeoutRef = useRef<number | null>(null)
  const connectTimeoutRef = useRef<number | null>(null)
  const reconfigTimeoutRef = useRef<number | null>(null)
  const abstractTimeoutRef = useRef<number | null>(null)
  const postTimeoutRef = useRef<number | null>(null)
  const filterRegionFxTimeoutRef = useRef<number | null>(null)
  const clickBridgeTimeoutRef = useRef<number | null>(null)
  const postBridgeDelayTimeoutRef = useRef<number | null>(null)
  const reconfigTailSoundTimeoutRef = useRef<number | null>(null)
  const postSelectFxTimeoutRef = useRef<number | null>(null)
  const postLegendFilterFxTimeoutRef = useRef<number | null>(null)
  const postSelectDingTimeoutRef = useRef<number | null>(null)

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
    if (inOn) return
    clearTimeoutRef(filterRegionFxTimeoutRef)
    setFilterRegionFxActive(false)
  }, [inOn])

  useEffect(() => {
    if (inOn) return
    clearTimeoutRef(clickBridgeTimeoutRef)
    setClickBridge(null)
  }, [inOn])

  useEffect(() => {
    if (postOn) return
    clearTimeoutRef(postTimeoutRef)
    clearTimeoutRef(filterTimeoutRef)
    clearTimeoutRef(reconfigTailSoundTimeoutRef)
    clearTimeoutRef(postBridgeDelayTimeoutRef)
    clearTimeoutRef(postSelectFxTimeoutRef)
    clearTimeoutRef(postLegendFilterFxTimeoutRef)
    clearTimeoutRef(postSelectDingTimeoutRef)
    setPostKind('none')
    setPostBadge(null)
    setPersistSelectKey(null)
    setPostBridgeReady(false)
    setPostBridgeNonce(0)
    setPostFilterSweepMask('A')
    setPostSelectFxActive(false)
    setPostSelectFxNonce(0)
    setPostLegendFilterFxActive(false)
    setPostLegendFilterFxNonce(0)
  }, [postOn])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage || typeof ResizeObserver === 'undefined') return
    const update = () => setChartWidth(previous => {
      const next = Math.max(MIN_WIDTH, Math.round(stage.clientWidth))
      return previous === next ? previous : next
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
        Math.abs(previous.x - pending.x) < 2 &&
        Math.abs(previous.y - pending.y) < 2
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

  const triggerInBurst = useCallback((kind: InBurstKind, ms = 180) => {
    if (!inOn || kind === 'none') return
    clearTimeoutRef(inBurstTimeoutRef)
    if (!motionAllowed) {
      setInBurstKind('none')
      return
    }
    setInBurstKind(kind)
    inBurstTimeoutRef.current = window.setTimeout(() => {
      setInBurstKind('none')
      inBurstTimeoutRef.current = null
    }, Math.max(1, ms))
  }, [inOn, motionAllowed])

  const triggerPost = useCallback((kind: PostKind, options?: { duration?: number; badge?: PostBadge }) => {
    if (!postOn || kind === 'none') return
    clearTimeoutRef(postTimeoutRef)
    setPostKind(kind)
    setPostNonce(previous => previous + 1)
    setPostBadge(options?.badge ?? null)
    const duration = Math.max(1, options?.duration ?? 650)
    postTimeoutRef.current = window.setTimeout(() => {
      setPostKind('none')
      setPostBadge(null)
      postTimeoutRef.current = null
    }, duration)
  }, [postOn])

  const playLocalAudio = useCallback((file: string, volume: number) => {
    try {
      const audio = new Audio(`${import.meta.env.BASE_URL}${file}`)
      audio.volume = volume
      audio.currentTime = 0
      void audio.play().catch(() => {})
    } catch {
      // ignore audio failures
    }
  }, [])

  const playFocusYearScrubClick8 = useCallback(() => {
    playLocalAudio('click8.mp3', 0.92)
  }, [playLocalAudio])

  const playDingdong2 = useCallback(() => {
    playLocalAudio('dingdong2.mp3', 0.88)
  }, [playLocalAudio])

  const schedulePostSelectDing = useCallback(() => {
    if (!postOn) return
    clearTimeoutRef(postSelectDingTimeoutRef)
    postSelectDingTimeoutRef.current = window.setTimeout(() => {
      playDingdong2()
      postSelectDingTimeoutRef.current = null
    }, POST_SELECT_DING_DELAY_MS)
  }, [playDingdong2, postOn])

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
  }, [inOn, motionAllowed])

  const emitFocusYearScrub = useCallback(() => {
    const isInFocusYearScrub = inOn
      && isScrubbing
      && activeScrubKind === 'explore'
      && activeRangeControl === 'focusYear'
    if (!isInFocusYearScrub) {
      emitIn('explore_scrub')
      return
    }
    const now = performance.now()
    if (now - dragTsRef.current < DRAG_THROTTLE) return
    dragTsRef.current = now
    playFocusYearScrubClick8()
    if (!motionAllowed) return
    setImpactNonce(previous => previous + 1)
  }, [activeRangeControl, activeScrubKind, emitIn, inOn, isScrubbing, motionAllowed, playFocusYearScrubClick8])

  const emitPost = useCallback((kind: string, payload?: { start?: number; end?: number; count?: number; label?: string }, options?: { suppressSound?: boolean }) => {
    if (!postOn) return
    const shouldDeferPostSelectDing = postOn && kind === 'select_settle'
    if (!options?.suppressSound && !shouldDeferPostSelectDing) {
      if (kind === 'connect_reveal') playWhooshSound()
      else playDingdong2()
    }

    if (kind === 'filter_done') pushToast(`Filter applied: ${payload?.count ?? 0} countries`)
    else if (kind === 'explore_set') pushToast(`Window set: ${payload?.start ?? startYear}–${payload?.end ?? endYear}`)
    else if (kind === 'reconfig_done') pushToast(`Sorted by: ${payload?.label ?? sortMode}`)
    else if (kind === 'encode_done') pushToast(`Encoding switched: ${representation}`)
    else if (kind === 'abstract_set') pushToast(`Detail level: ${detailLevel}`)
    else if (kind === 'select_settle') pushToast('Selection updated')
    else if (kind === 'connect_reveal') pushToast('Related countries revealed')

  }, [detailLevel, endYear, playDingdong2, postOn, pushToast, representation, sortMode, startYear])

  useEffect(() => {
    hoveredKeyRef.current = hoveredKey
  }, [hoveredKey])

  useEffect(() => {
    return () => {
      clearTimeoutRef(toastTimeoutRef)
      clearTimeoutRef(filterTimeoutRef)
      clearTimeoutRef(prefixPostTimeoutRef)
      clearTimeoutRef(inBurstTimeoutRef)
      clearTimeoutRef(encodeTimeoutRef)
      clearTimeoutRef(selectTimeoutRef)
      clearTimeoutRef(connectTimeoutRef)
      clearTimeoutRef(reconfigTimeoutRef)
      clearTimeoutRef(abstractTimeoutRef)
      clearTimeoutRef(postTimeoutRef)
      clearTimeoutRef(filterRegionFxTimeoutRef)
      clearTimeoutRef(clickBridgeTimeoutRef)
      clearTimeoutRef(postBridgeDelayTimeoutRef)
      clearTimeoutRef(reconfigTailSoundTimeoutRef)
      clearTimeoutRef(postSelectFxTimeoutRef)
      clearTimeoutRef(postLegendFilterFxTimeoutRef)
      clearTimeoutRef(postSelectDingTimeoutRef)
      clearTimeoutRef(hideTimerRef)
      clearTimeoutRef(histHideTimerRef)
      if (hoverRafRef.current !== null) window.cancelAnimationFrame(hoverRafRef.current)
      if (tooltipRafRef.current !== null) window.cancelAnimationFrame(tooltipRafRef.current)
      if (preGuideRafRef.current !== null) window.cancelAnimationFrame(preGuideRafRef.current)
      if (regionHoverRafRef.current !== null) window.cancelAnimationFrame(regionHoverRafRef.current)
      if (tipShowRafRef.current !== null) window.cancelAnimationFrame(tipShowRafRef.current)
      if (histTipShowRafRef.current !== null) window.cancelAnimationFrame(histTipShowRafRef.current)
      if (brushRafRef.current !== null) window.cancelAnimationFrame(brushRafRef.current)
      if (rankFlipRafRef.current !== null) window.cancelAnimationFrame(rankFlipRafRef.current)
      if (reconfigPostRafRef.current !== null) window.cancelAnimationFrame(reconfigPostRafRef.current)
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
      v0: bin.x0 ?? 0,
      v1: bin.x1 ?? 100,
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
  const topRowIndexByKey = useMemo(() => new Map(topRows.map((row, index) => [row.key, index] as const)), [topRows])

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
  const viewCAnchorForKey = useCallback((key: string): { x: number; y: number } | null => {
    if (rowH <= 0) return null
    const index = topRowIndexByKey.get(key)
    if (index === undefined) return null
    return {
      x: rightX0 + 12,
      y: viewCTop + rowTop + index * rowH + rowH / 2
    }
  }, [rightX0, rowH, rowTop, topRowIndexByKey, viewCTop])

  const focusX = xScaleYear(focusYear)

  useEffect(() => {
    const nextYMap = new Map<string, number>()
    topRows.forEach((row, index) => {
      nextYMap.set(row.key, rowTop + index * rowH)
    })

    const previousYMap = rankPrevYRef.current
    if (pendingReconfigFlipRef.current && inOn && motionAllowed) {
      const nextDeltas: Record<string, number> = {}
      nextYMap.forEach((y, key) => {
        const previousY = previousYMap.get(key)
        if (previousY === undefined) return
        const delta = previousY - y
        if (Math.abs(delta) > 0.5) nextDeltas[key] = delta
      })
      setRankFlipDeltas(nextDeltas)
      if (rankFlipRafRef.current !== null) window.cancelAnimationFrame(rankFlipRafRef.current)
      if (Object.keys(nextDeltas).length > 0) {
        rankFlipRafRef.current = window.requestAnimationFrame(() => {
          rankFlipRafRef.current = null
          setRankFlipDeltas({})
        })
      }
      pendingReconfigFlipRef.current = false
    }

    rankPrevYRef.current = nextYMap
  }, [inOn, motionAllowed, rowH, rowTop, topRows])

  useEffect(() => {
    if (inOn && motionAllowed) return
    pendingReconfigFlipRef.current = false
    setRankFlipDeltas(previous => (Object.keys(previous).length > 0 ? {} : previous))
  }, [inOn, motionAllowed])

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
    if ((detailLevel >= 1 || baselineHoverLike) && hoveredKey && hoveredKey !== selectedKey) {
      const value = countryByKey.get(hoveredKey)?.valueByYear.get(focusYear)
      if (value !== undefined) list.push({ key: hoveredKey, kind: 'hovered', y: yScale(value) })
    }
    return list
  }, [baselineHoverLike, countryByKey, detailLevel, focusYear, hoveredKey, relatedKeys, selectedKey, yScale])

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

  const buildBridgePaths = useCallback((key: string): string[] => {
    const source = anchorFor(key)
    const value = countryByKey.get(key)?.valueByYear.get(focusYear)
    if (!source || value === undefined) return []
    const bx = xScaleYear(focusYear)
    const by = yScale(value)
    const c1x = source.x + (bx - source.x) * 0.34
    const c2x = source.x + (bx - source.x) * 0.7
    const middleYAB = (source.y + by) / 2
    const pathAB = `M ${source.x} ${source.y} C ${c1x} ${middleYAB - 20}, ${c2x} ${middleYAB + 22}, ${bx} ${by}`
    const paths = [pathAB]

    const targetC = viewCAnchorForKey(key)
    if (targetC) {
      const c3x = bx + (targetC.x - bx) * 0.35
      const c4x = bx + (targetC.x - bx) * 0.72
      const middleYBC = (by + targetC.y) / 2
      const pathBC = `M ${bx} ${by} C ${c3x} ${middleYBC - 14}, ${c4x} ${middleYBC + 16}, ${targetC.x} ${targetC.y}`
      paths.push(pathBC)
    }

    return paths
  }, [anchorFor, countryByKey, focusYear, viewCAnchorForKey, xScaleYear, yScale])

  const bridgePaths = useMemo(() => {
    if (!hoveredKey) return []
    return buildBridgePaths(hoveredKey)
  }, [buildBridgePaths, hoveredKey])

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
  const hoveredBinTitle = hoveredBin ? `${fmt(hoveredBin.v0)}% To ${fmt(hoveredBin.v1)}%` : ''
  const shouldShowMainTip = detailLevel >= 1 && Boolean(tooltip && tooltipCountry)
  const shouldShowHistTip = representation === 'histogram' && Boolean(histTooltip && hoveredBin)
  const animateTips = preOn && !prefersReducedMotion
  const renderedTooltip = animateTips ? tipRenderData : tooltip
  const renderedTooltipCountry = renderedTooltip ? countryByKey.get(renderedTooltip.key) ?? null : null
  const renderedTooltipMetric = renderedTooltipCountry ? metrics.find(row => row.key === renderedTooltipCountry.key) ?? null : null
  const renderedHistTooltip = animateTips ? histTipRenderData : histTooltip
  const renderedHoveredBin = renderedHistTooltip ? histBars.find(bar => bar.index === renderedHistTooltip.index) ?? null : null
  const renderedHoveredBinTitle = renderedHoveredBin ? `${fmt(renderedHoveredBin.v0)}% To ${fmt(renderedHoveredBin.v1)}%` : ''
  const hoveredBinCountries = useMemo(() => {
    if (!renderedHoveredBin) return []
    return renderedHoveredBin.keys
      .map(key => {
        const country = countryByKey.get(key)
        const value = country?.valueByYear.get(focusYear)
        if (!country || value === undefined) return null
        return { key, entity: country.entity, value, active: activeKeySet.has(key) }
      })
      .filter((entry): entry is { key: string; entity: string; value: number; active: boolean } => entry !== null)
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)
  }, [activeKeySet, countryByKey, focusYear, renderedHoveredBin])

  useEffect(() => {
    if (!animateTips) {
      clearTimeoutRef(hideTimerRef)
      if (tipShowRafRef.current !== null) {
        window.cancelAnimationFrame(tipShowRafRef.current)
        tipShowRafRef.current = null
      }
      setTipMounted(shouldShowMainTip)
      setTipVisible(shouldShowMainTip)
      setTipRenderData(shouldShowMainTip ? tooltip : null)
      return
    }

    if (shouldShowMainTip && tooltip) {
      clearTimeoutRef(hideTimerRef)
      if (tipShowRafRef.current !== null) {
        window.cancelAnimationFrame(tipShowRafRef.current)
        tipShowRafRef.current = null
      }
      setTipRenderData(tooltip)
      setTipMounted(true)
      tipShowRafRef.current = window.requestAnimationFrame(() => {
        tipShowRafRef.current = null
        setTipVisible(true)
      })
      return
    }

    setTipVisible(false)
    clearTimeoutRef(hideTimerRef)
    hideTimerRef.current = window.setTimeout(() => {
      setTipMounted(false)
      setTipRenderData(null)
      hideTimerRef.current = null
    }, 170)
  }, [animateTips, shouldShowMainTip, tooltip])

  useEffect(() => {
    if (!animateTips) {
      clearTimeoutRef(histHideTimerRef)
      if (histTipShowRafRef.current !== null) {
        window.cancelAnimationFrame(histTipShowRafRef.current)
        histTipShowRafRef.current = null
      }
      setHistTipMounted(shouldShowHistTip)
      setHistTipVisible(shouldShowHistTip)
      setHistTipRenderData(shouldShowHistTip ? histTooltip : null)
      return
    }

    if (shouldShowHistTip && histTooltip) {
      clearTimeoutRef(histHideTimerRef)
      if (histTipShowRafRef.current !== null) {
        window.cancelAnimationFrame(histTipShowRafRef.current)
        histTipShowRafRef.current = null
      }
      setHistTipRenderData(histTooltip)
      setHistTipMounted(true)
      histTipShowRafRef.current = window.requestAnimationFrame(() => {
        histTipShowRafRef.current = null
        setHistTipVisible(true)
      })
      return
    }

    setHistTipVisible(false)
    clearTimeoutRef(histHideTimerRef)
    histHideTimerRef.current = window.setTimeout(() => {
      setHistTipMounted(false)
      setHistTipRenderData(null)
      histHideTimerRef.current = null
    }, 170)
  }, [animateTips, histTooltip, shouldShowHistTip])

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
    triggerPost('explore', { duration: postOn ? 900 : 700, badge: { view: 'B', text: '\u2713 Updated' } })
  }, [emitPost, endYear, postOn, startYear, triggerPost])

  const finalizeFilterPost = useCallback((options?: { count?: number; source?: FilterPostSource }) => {
    const count = options?.count ?? activeCount
    const source = options?.source ?? 'slider'
    clearTimeoutRef(filterTimeoutRef)
    clearTimeoutRef(postLegendFilterFxTimeoutRef)
    setPostLegendFilterFxActive(false)
    clearTimeoutRef(prefixPostTimeoutRef)
    if (postOn) {
      if (source === 'legend') setPostFilterSweepMask('none')
      else setPostFilterSweepMask('AB')
    } else {
      setPostFilterSweepMask('A')
    }
    if (postOn && source === 'legend') {
      filterTimeoutRef.current = window.setTimeout(() => {
        emitPost('filter_done', { count })
        triggerPost('filter', { duration: 900, badge: { view: 'A', text: '\u2713 Filtered' } })
        setPostLegendFilterFxNonce(previous => previous + 1)
        setPostLegendFilterFxActive(true)
        clearTimeoutRef(postLegendFilterFxTimeoutRef)
        postLegendFilterFxTimeoutRef.current = window.setTimeout(() => {
          setPostLegendFilterFxActive(false)
          postLegendFilterFxTimeoutRef.current = null
        }, 320)
        filterTimeoutRef.current = null
      }, 800)
      return
    }
    emitPost('filter_done', { count })
    triggerPost('filter', { duration: postOn ? 900 : 700, badge: { view: 'A', text: '\u2713 Filtered' } })
  }, [activeCount, emitPost, postOn, triggerPost])

  const triggerFilterDone = useCallback((options?: { burst?: boolean }) => {
    emitIn('filter_apply')
    if (options?.burst) triggerInBurst('filter', 150)
  }, [emitIn, triggerInBurst])

  const toggleRegion = useCallback((region: RegionName) => {
    if (region === 'Unknown') return
    setEnabledRegions(previous => ({ ...previous, [region]: !previous[region] }))
    if (inOn && motionAllowed) {
      setFilterRegionFxNonce(previous => previous + 1)
      setFilterRegionFxActive(true)
      clearTimeoutRef(filterRegionFxTimeoutRef)
      filterRegionFxTimeoutRef.current = window.setTimeout(() => {
        setFilterRegionFxActive(false)
        filterRegionFxTimeoutRef.current = null
      }, 320)
    } else {
      setFilterRegionFxActive(false)
    }
    triggerFilterDone({ burst: true })
    finalizeFilterPost({ source: 'legend' })
  }, [finalizeFilterPost, inOn, motionAllowed, triggerFilterDone])

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
    setActiveRangeControl(controlId ?? null)
    if (controlId) activateHotControl(controlId)
    clearTimeoutRef(inBurstTimeoutRef)
    setInBurstKind('none')
    setIsScrubbing(true)
    setActiveScrubKind(kind)
  }

  const endRangeScrub = () => {
    setIsScrubbing(false)
    setActiveScrubKind('none')
    setActiveRangeControl(null)
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
    const nextSelectedKey = selectedKey === key ? null : key
    setSelectedKey(nextSelectedKey)
    clearTimeoutRef(postSelectDingTimeoutRef)
    if (postOn) {
      setPersistSelectKey(nextSelectedKey)
      clearTimeoutRef(postBridgeDelayTimeoutRef)
      setPostBridgeReady(false)
      clearTimeoutRef(postSelectFxTimeoutRef)
      setPostSelectFxActive(Boolean(nextSelectedKey))
      if (nextSelectedKey) {
        setPostSelectFxNonce(previous => previous + 1)
        postSelectFxTimeoutRef.current = window.setTimeout(() => {
          setPostSelectFxActive(false)
          postSelectFxTimeoutRef.current = null
        }, 3200)
        const readyPostBridge = () => {
          setPostBridgeReady(true)
          setPostBridgeNonce(previous => previous + 1)
          postBridgeDelayTimeoutRef.current = null
        }
        if (inOn) {
          postBridgeDelayTimeoutRef.current = window.setTimeout(readyPostBridge, POST_PERSIST_BRIDGE_DELAY_MS)
        } else {
          readyPostBridge()
        }
      }
    }
    if (inOn && motionAllowed) {
      const ds = buildBridgePaths(key)
      const clickBridgeBurstMs = postOn && !isPurePost ? CLICK_BRIDGE_BURST_MS : 800
      clearTimeoutRef(clickBridgeTimeoutRef)
      if (ds.length > 0) {
        setClickBridge(previous => ({ ds, nonce: (previous?.nonce ?? 0) + 1 }))
        clickBridgeTimeoutRef.current = window.setTimeout(() => {
          setClickBridge(null)
          clickBridgeTimeoutRef.current = null
        }, clickBridgeBurstMs)
      } else {
        setClickBridge(null)
      }
    }
    const pressPoint = lastSelectPressPointRef.current
    lastSelectPressPointRef.current = null
    if (inOn) {
      setSelectCommitPoint(pressPoint ?? null)
      setSelectCommitNonce(previous => previous + 1)
    }
    emitIn('select_commit')
    triggerInBurst('select', 220)
    clearTimeoutRef(selectTimeoutRef)
    selectTimeoutRef.current = window.setTimeout(() => {
      emitPost('select_settle')
      schedulePostSelectDing()
      const nextEntity = nextSelectedKey ? countryByKey.get(nextSelectedKey)?.entity : null
      const badgeText = nextEntity ? truncateBadgeText(`\u2713 Selected: ${nextEntity}`) : '\u2713 Selected'
      triggerPost('select', { duration: postOn ? 1400 : 650, badge: { view: 'A', text: badgeText } })
      selectTimeoutRef.current = null
    }, 120)
    clearTimeoutRef(connectTimeoutRef)
    if (nextSelectedKey) {
      connectTimeoutRef.current = window.setTimeout(() => {
        triggerInBurst('connect', 200)
        emitPost('connect_reveal')
        triggerPost('connect', { duration: 700, badge: { view: 'C', text: '\u2713 Linked' } })
        connectTimeoutRef.current = null
      }, postOn ? 1600 : 360)
    }
  }, [buildBridgePaths, countryByKey, emitIn, emitPost, inOn, isPurePost, motionAllowed, postOn, schedulePostSelectDing, selectedKey, triggerInBurst, triggerPost])

  const clearSelection = useCallback(() => {
    setSelectedKey(null)
    clearTimeoutRef(postSelectDingTimeoutRef)
    if (postOn) {
      setPersistSelectKey(null)
      clearTimeoutRef(postBridgeDelayTimeoutRef)
      setPostBridgeReady(false)
      clearTimeoutRef(postSelectFxTimeoutRef)
      setPostSelectFxActive(false)
    }
    commitHoveredKey(null)
    scheduleTooltip(null)
    setHoveredGroupKeys([])
    setHoveredBinIndex(null)
    clearTimeoutRef(selectTimeoutRef)
    clearTimeoutRef(connectTimeoutRef)
    emitPost('select_settle')
    schedulePostSelectDing()
    triggerPost('select', { duration: 650, badge: { view: 'A', text: '\u2713 Selected' } })
  }, [commitHoveredKey, emitPost, postOn, schedulePostSelectDing, scheduleTooltip, triggerPost])

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
    clearTimeoutRef(reconfigTailSoundTimeoutRef)
    pendingReconfigFlipRef.current = inOn && motionAllowed
    setPreviewSortMode(null)
    setReconfigBurstTarget(nextMode)
    setReconfigBurstNonce(previous => previous + 1)
    setSortMode(nextMode)
    emitIn('reconfig_reorder')
    triggerInBurst('reconfig', 260)
    clearTimeoutRef(reconfigTimeoutRef)
    if (reconfigPostRafRef.current !== null) window.cancelAnimationFrame(reconfigPostRafRef.current)
    reconfigPostRafRef.current = window.requestAnimationFrame(() => {
      reconfigPostRafRef.current = null
      reconfigTimeoutRef.current = window.setTimeout(() => {
        emitPost('reconfig_done', { label: nextMode }, { suppressSound: postOn })
        triggerPost('reconfigure', { duration: postOn ? 2200 : 900, badge: { view: 'C', text: '\u2713 Sorted' } })
        if (postOn) {
          clearTimeoutRef(reconfigTailSoundTimeoutRef)
          const tailDelay = 500 + (Math.max(1, topRows.length) - 1) * 14 + 420
          reconfigTailSoundTimeoutRef.current = window.setTimeout(() => {
            playDingdong2()
            reconfigTailSoundTimeoutRef.current = null
          }, tailDelay)
        }
        reconfigTimeoutRef.current = null
      }, 320)
    })
  }

  const commitRepresentation = (next: Representation) => {
    if (representation === next) return
    if (inOn) {
      setEncodeFrom(representation)
      setEncodeFadeNonce(previous => previous + 1)
    } else {
      setEncodeFrom(null)
    }
    setRepresentation(next)
    setPreviewRepresentation(null)
    setEncodeSwitching(true)
    emitIn('encode_switch')
    triggerInBurst('encode', 260)
    clearTimeoutRef(encodeTimeoutRef)
    encodeTimeoutRef.current = window.setTimeout(() => {
      setEncodeSwitching(false)
      setEncodeFrom(null)
      emitPost('encode_done')
      triggerPost('encode', { duration: postOn ? 3600 : 900, badge: { view: 'A', text: next === 'histogram' ? '\u2713 Histogram' : '\u2713 Beeswarm' } })
      encodeTimeoutRef.current = null
    }, 260)
  }

  const commitDetailLevel = (next: DetailLevel) => {
    if (detailLevel === next) return
    setPreviewDetailLevel(null)
    setDetailLevel(next)
    emitIn('abstract_adjust')
    triggerInBurst('abstract', inOn ? 520 : 180)
    clearTimeoutRef(abstractTimeoutRef)
    abstractTimeoutRef.current = window.setTimeout(() => {
      emitPost('abstract_set')
      triggerPost('abstract', { duration: postOn && next === 2 ? 1900 : 650, badge: { view: 'C', text: `\u2713 Detail ${next}` } })
      abstractTimeoutRef.current = null
    }, 260)
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
        clearTimeoutRef(inBurstTimeoutRef)
        setInBurstKind('none')
        setIsScrubbing(true)
        setActiveScrubKind('explore')
        setActiveRangeControl(null)
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
        setActiveRangeControl(null)
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
    clearTimeoutRef(inBurstTimeoutRef)
    setInBurstKind('none')
    setIsScrubbing(false)
    setActiveScrubKind('none')
    setActiveRangeControl(null)
    setReconfigBurstTarget(null)
    setRankFlipDeltas({})
    setEncodeFrom(null)
    setFilterRegionFxActive(false)
    setClickBridge(null)
    setPersistSelectKey(null)
    setPostBridgeNonce(0)
    setPostBridgeReady(false)
    setPostFilterSweepMask('A')
    setPostSelectFxActive(false)
    setPostSelectFxNonce(0)
    setPostLegendFilterFxActive(false)
    setPostLegendFilterFxNonce(0)
    setSelectCommitPoint(null)
    setPostKind('none')
    setPostBadge(null)
    clearTimeoutRef(filterTimeoutRef)
    clearTimeoutRef(filterRegionFxTimeoutRef)
    clearTimeoutRef(clickBridgeTimeoutRef)
    clearTimeoutRef(postBridgeDelayTimeoutRef)
    clearTimeoutRef(reconfigTailSoundTimeoutRef)
    clearTimeoutRef(postSelectFxTimeoutRef)
    clearTimeoutRef(postLegendFilterFxTimeoutRef)
    clearTimeoutRef(postSelectDingTimeoutRef)
    clearTimeoutRef(prefixPostTimeoutRef)
    clearTimeoutRef(postTimeoutRef)
  }

  const isInActive = inOn && (isScrubbing || inBurstKind !== 'none')
  const inActiveClass = isInActive ? `is-in-active ${isScrubbing ? `is-in-${activeScrubKind}` : `is-in-${inBurstKind}`}` : ''
  const postActive = postKind !== 'none'
  const postFxActive = postActive && motionAllowed
  const postActiveClass = postActive ? `post-active post-${postKind}` : ''
  const vignetteOn = inOn && isScrubbing
  const scrubbingClass = inOn && isScrubbing ? 'is-scrubbing' : ''
  const isExploreInScrub = inOn && isScrubbing && activeScrubKind === 'explore'
  const isSelectionInScrub = inOn && isScrubbing && activeScrubKind === 'selection'
  const isFilterInScrub = inOn && isScrubbing && activeScrubKind === 'filter'
  const showExploreBand = isExploreInScrub || (inOn && inBurstKind === 'explore')
  const showInBrushHandle = showExploreBand
  const shouldDrawRelatedArcs = isSelectionInScrub || (inOn && inBurstKind === 'select') || (inOn && inBurstKind === 'connect')
  const showImpactFlash = isInActive && impactNonce > 0
  const isPostSelect = postFxActive && postKind === 'select'
  const isPostExplore = postFxActive && postKind === 'explore'
  const isPostFilter = postFxActive && postKind === 'filter'
  const isPostReconfigure = postFxActive && postKind === 'reconfigure'
  const isPostEncode = postFxActive && postKind === 'encode'
  const isPostAbstract = postFxActive && postKind === 'abstract'
  const isPostConnect = postFxActive && postKind === 'connect'
  const hasPersistSelect = postOn && persistSelectKey !== null
  const showPostSelectFx = postOn && postSelectFxActive
  const showPostFilterSweepA = isPostFilter && (postFilterSweepMask === 'A' || postFilterSweepMask === 'AB')
  const showPostFilterSweepB = isPostFilter && (postFilterSweepMask === 'B' || postFilterSweepMask === 'AB')
  const showPostExploreSweep = postOn && isPostExplore
  const showPostAbstractDetail2 = postOn && isPostAbstract && detailLevel === 2

  const instructionWidth = Math.min(760, Math.max(360, chartWidth - 140))
  const instructionX = chartWidth / 2 - instructionWidth / 2
  const viewCClipId = `integrated-view-c-clip-${Math.max(0, Math.round(chartWidth))}`
  const showSelectCommitRing = inOn && inBurstKind === 'select' && selectCommitNonce > 0 && selectCommitPoint !== null
  const showEncodePreview = preOn && previewRepresentation !== null && previewRepresentation !== representation
  const showEncodeCrossfade = inOn && motionAllowed && encodeSwitching && encodeFrom !== null
  const suppressHoverBridgeForPersist = postOn && postBridgeReady && selectedKey !== null && hoveredKey === selectedKey
  const showBridge = preOn && bridgePaths.length > 0 && !suppressHoverBridgeForPersist
  const hasRegionHover = Boolean(regionHoverKeySet && regionHoverKeySet.size > 0)
  const isRelatedCountHot = preOn && hotControl === 'relatedCount'
  const isFocusHot = preOn && hotControl === 'focusYear'
  const isWindowStartHot = preOn && hotControl === 'windowStart'
  const isWindowEndHot = preOn && hotControl === 'windowEnd'
  const isWindowHot = isWindowStartHot || isWindowEndHot
  const isExploreHot = isFocusHot || isWindowHot
  const isFilterHot = preOn && (hotControl === 'valueMin' || hotControl === 'valueMax')
  const isPreStageHotOutline = preOn && (isExploreHot || isFilterHot)
  const showFilterGuideLines = isFilterInScrub || isFilterHot || (preOn && showFilterGuides)
  const showExplorePreHint = preOn && (preHintRegion === 'explore' || isExploreHot) && !isScrubbing
  const brushHintStartX = xScaleYear(startYear)
  const brushHintEndX = xScaleYear(endYear)
  const isExploreRangeScrub = activeRangeControl === 'focusYear' || activeRangeControl === 'windowStart' || activeRangeControl === 'windowEnd'
  const showViewBExploreOutline = inOn && motionAllowed && isScrubbing && activeScrubKind === 'explore' && isExploreRangeScrub
  const showAbstractReveal = inOn && motionAllowed && inBurstKind === 'abstract' && detailLevel === 2
  const arrowY = (viewBTop + viewBBottom) / 2
  const abstractPreviewZoneH = previewDetailLevel === 2 ? 68 : previewDetailLevel === 1 ? 52 : 36
  const isRangeSelectionScrub = inOn && isScrubbing && activeRangeControl === 'relatedCount'
  const isRangeFocusScrub = inOn && isScrubbing && activeRangeControl === 'focusYear'
  const isRangeWindowStartScrub = inOn && isScrubbing && activeRangeControl === 'windowStart'
  const isRangeWindowEndScrub = inOn && isScrubbing && activeRangeControl === 'windowEnd'
  const isRangeValueMinScrub = inOn && isScrubbing && activeRangeControl === 'valueMin'
  const isRangeValueMaxScrub = inOn && isScrubbing && activeRangeControl === 'valueMax'
  const selectedAnchor = useMemo(() => {
    if (!selectedKey) return null
    return anchorFor(selectedKey)
  }, [anchorFor, selectedKey])
  const selectedTopRowIndex = selectedKey ? topRowIndexByKey.get(selectedKey) : undefined
  const connectPingPoints = useMemo(() => (
    relatedItems
      .slice(0, 6)
      .map((item, index) => {
        const anchor = anchorFor(item.key)
        if (!anchor) return null
        return { key: item.key, x: anchor.x, y: anchor.y, delay: index * 90 }
      })
      .filter((entry): entry is { key: string; x: number; y: number; delay: number } => entry !== null)
  ), [anchorFor, relatedItems])
  const connectRowPingEntries = useMemo(() => (
    relatedItems
      .slice(0, 6)
      .map((item, index) => {
        const rowIndex = topRowIndexByKey.get(item.key)
        if (rowIndex === undefined) return null
        return { key: item.key, rowIndex, delay: index * 90 }
      })
      .filter((entry): entry is { key: string; rowIndex: number; delay: number } => entry !== null)
  ), [relatedItems, topRowIndexByKey])
  const postSelectFrameEntries = useMemo(() => {
    if (!showPostSelectFx || !selectedKey) return []
    const keys = [selectedKey, ...relatedKeys]
    const uniqueByRow = new Map<number, string>()
    keys.forEach(key => {
      const rowIndex = topRowIndexByKey.get(key)
      if (rowIndex === undefined || uniqueByRow.has(rowIndex)) return
      uniqueByRow.set(rowIndex, key)
    })
    return Array.from(uniqueByRow.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([rowIndex, key], index) => ({ key, rowIndex, delay: index * 80 }))
  }, [relatedKeys, selectedKey, showPostSelectFx, topRowIndexByKey])
  const postFireworkParticles = useMemo(() => {
    if (!showPostSelectFx || !selectedAnchor || !motionAllowed) return []
    const count = 32
    return Array.from({ length: count }, (_, index) => {
      const jitter = Math.sin((postSelectFxNonce + 1) * 91 + index * 13) * 0.1
      const angle = (Math.PI * 2 * index) / count + jitter
      const radius = 18 + (index % 8) * 4 + Math.sin(index * 7.3) * 3
      const dx = Math.cos(angle) * radius
      const dy = Math.sin(angle) * radius
      return {
        id: index,
        dx,
        dy,
        delay: 0,
        r: 1.7 + (index % 4) * 0.23
      }
    })
  }, [motionAllowed, postSelectFxNonce, selectedAnchor, showPostSelectFx])
  const postSelectDelayByKey = useMemo(
    () => new Map(postSelectFrameEntries.map(entry => [entry.key, entry.delay] as const)),
    [postSelectFrameEntries]
  )
  const persistentBridgePaths = useMemo(() => {
    if (!postOn || !selectedKey || !postBridgeReady) return []
    return buildBridgePaths(selectedKey)
  }, [buildBridgePaths, postBridgeReady, postOn, selectedKey])
  const postBadgePosition = useMemo(() => {
    if (!postBadge) return null
    if (postBadge.view === 'A') return { left: leftX0 + leftW - 130, top: viewATop + 4 }
    if (postBadge.view === 'B') return { left: leftX0 + leftW - 130, top: viewBTop + 4 }
    return { left: rightX0 + rightW - 130, top: viewCTop + 4 }
  }, [leftW, leftX0, postBadge, rightW, rightX0, viewATop, viewBTop, viewCTop])

  // Moving lines between back/front groups with different keys caused mass unmount/remount on legend hover.
  // Render base lines once with stable keys and draw hovered-region lines in a non-interactive overlay.
  const regionHoverLines = useMemo(() => (
    preOn && regionHoverKeySet?.size
      ? lines.filter(line => regionHoverKeySet.has(line.key))
      : []
  ), [lines, preOn, regionHoverKeySet])
  const showRegionLineOverlay = preOn && regionHoverLines.length > 0

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
    const pointer = toSvgPoint(event.clientX, event.clientY)
    if (!pointer) return

    const inViewCX = pointer.x >= rightX0 && pointer.x <= rightX0 + rightW
    if (!inViewCX) {
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

    const rect = stage.getBoundingClientRect()
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

  const renderBeeswarmLayer = (layerClassName: string, keyPrefix: string, pointerEvents: CSSProperties['pointerEvents'] = 'auto') => (
    <g className={layerClassName} pointerEvents={pointerEvents}>
      {beeswarmNodes.map((node, index) => {
        const isActive = activeKeySet.has(node.key)
        const isSelected = selectedKey === node.key
        const isRelated = relatedKeySet.has(node.key)
        const isHovered = hoveredKey === node.key || hoveredGroupSet.has(node.key)
        const isPlainConnectHover = baselineHoverLike && isHovered
        const isRegionHovered = Boolean(regionHoverKeySet?.has(node.key))
        const isRegionDim = hasRegionHover && !isRegionHovered
        const isPostEncodeSparkle = postOn && isPostEncode && representation === 'beeswarm'
        const sparkleDelay = Math.round(clamp(((node.x - leftX0) / Math.max(1, leftW)) * 420, 0, 420))
        const dotRadius = isPlainConnectHover ? 7.9 : isSelected || isHovered ? 6 : isRelated ? 5.2 : DOT_R
        const cls = ['ig-dot', isActive ? 'ig-dot--active' : 'is-inactive', isSelected ? 'is-selected' : '', isRelated ? 'is-related' : '', isHovered ? 'is-hovered' : '', isPlainConnectHover ? 'is-plain-connect-hover' : '', isRegionHovered ? 'is-region-hovered' : '', isRegionDim ? 'is-region-dim' : '', isPostEncode ? 'is-post-encode-dot' : '', isPostEncodeSparkle ? 'is-post-encode-sparkle' : ''].filter(Boolean).join(' ')
        const showNodeLabel = (detailLevel >= 1 && (isSelected || isHovered)) || (detailLevel === 0 && isSelected)
        const labelGeometry = showNodeLabel && useReadableViewALabel ? getViewALabelGeometry(node) : null
        return (
          <g key={`${keyPrefix}-dot-${encodeFadeNonce}-${node.key}`}>
            <circle className={cls} cx={node.x} cy={node.y} r={dotRadius} style={{ '--ig-accent': accentFor(node.key), '--enter-delay': `${Math.min(260, index * 4)}ms`, '--sparkle-delay': `${sparkleDelay}ms` } as CSSProperties} onPointerDown={handleSelectPress} onMouseMove={event => handleCountryHover(event, node.key)} onMouseLeave={() => handleCountryLeave(node.key)} onClick={() => selectCountry(node.key)} />
            {showNodeLabel && labelGeometry && (
              <g key={`${keyPrefix}-pl-box-${node.key}`} className="integrated-point-label-callout">
                <rect className="integrated-point-label-bg" x={labelGeometry.rectX} y={labelGeometry.rectY} width={labelGeometry.labelW} height={labelGeometry.labelH} rx={8} ry={8} />
                <text className={`integrated-point-label-text ${isPostAbstract ? 'is-post-abstract' : ''}`} x={labelGeometry.textX} y={labelGeometry.textY}>{node.entity}</text>
              </g>
            )}
            {showNodeLabel && !labelGeometry && <text key={`${keyPrefix}-pl-${node.key}`} className={`integrated-point-label ${isPostAbstract ? 'is-post-abstract' : ''}`} x={node.x + 6} y={node.y - 8}>{node.entity}</text>}
          </g>
        )
      })}
    </g>
  )

  const renderHistogramLayer = (layerClassName: string, keyPrefix: string, pointerEvents: CSSProperties['pointerEvents'] = 'auto') => (
    <g className={layerClassName} pointerEvents={pointerEvents}>
      {histBars.map(bar => {
        const hasRegionInBin = Boolean(regionHoverKeySet && bar.keys.some(key => regionHoverKeySet.has(key)))
        const isRegionDim = hasRegionHover && !hasRegionInBin
        const isPostEncodeTriplet = postOn && isPostEncode && representation === 'histogram'
        const cls = ['ig-bin', bar.active > 0 ? 'ig-bin--active' : 'is-inactive', hoveredBinIndex === bar.index ? 'is-hovered' : '', hasRegionInBin ? 'is-region-hovered' : '', isRegionDim ? 'is-region-dim' : '', isPostEncode ? 'is-post-encode-bar' : '', isPostEncodeTriplet ? 'is-post-encode-triplet' : ''].filter(Boolean).join(' ')
        return <rect key={`${keyPrefix}-bin-${encodeFadeNonce}-${bar.index}`} className={cls} x={bar.x0 + 1} y={bar.y} width={Math.max(1, bar.x1 - bar.x0 - 2)} height={Math.max(0, bar.h)} style={{ '--enter-delay': `${bar.index * 18}ms` } as CSSProperties} onPointerDown={handleSelectPress} onMouseMove={event => handleBinMove(event, bar)} onMouseLeave={() => handleBinLeave(bar.index)} />
      })}
    </g>
  )

  return (
    <div className={`integrated-layout ${postOn ? 'post-on' : ''} ${postActiveClass} ${scrubbingClass} ${inActiveClass}`.trim()}>
      <div className="integrated-stage-wrap">
        <div
          className={`integrated-stage ${scrubbingClass} ${inActiveClass} ${showExplorePreHint ? 'is-pre-explore' : ''} ${isPreStageHotOutline ? 'is-pre-hot-outline' : ''} ${hasPersistSelect ? 'is-post-persist-select' : ''}`.trim()}
          ref={stageRef}
          onPointerDown={handleStagePress}
          onPointerMove={handleStagePointerMove}
          onPointerLeave={handleStagePointerLeave}
        >
          {vignetteOn && <div className="ig-vignette" />}
          {showImpactFlash && <div key={`impact-${impactNonce}`} className="ig-impact-flash" />}
          {postFxActive && <div key={`settle-${postNonce}`} className="ig-settle-glow" />}
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
          {postActive && postBadge && postBadgePosition && (
            <div className="integrated-post-badge-layer">
              <div
                key={`post-badge-${postNonce}`}
                className={`integrated-post-badge integrated-post-badge--${postBadge.view.toLowerCase()} ${postFxActive ? 'is-animated' : 'is-static'}`}
                style={{ left: `${postBadgePosition.left}px`, top: `${postBadgePosition.top}px` }}
              >
                {postBadge.text}
              </div>
            </div>
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
              <svg ref={svgRef} className={`integrated-svg ${encodeSwitching ? 'is-encode-switching' : ''} ${isPostAbstract ? 'is-post-abstract' : ''} ${inOn && filterRegionFxActive ? 'is-filter-region-jitter' : ''}`} width={chartWidth} height={CHART_HEIGHT} viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`} role="img" aria-label="Chart 8 integrated interactions">
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
                {showViewBExploreOutline && <rect x={leftX0 + 1} y={viewBTop + 1} width={Math.max(1, leftW - 2)} height={Math.max(1, viewBHeight - 2)} className="integrated-view-b-scrub-outline" rx={6} ry={6} />}
                {showEncodePreview && <rect x={leftX0 + 2} y={viewATop + 2} width={Math.max(1, leftW - 4)} height={Math.max(1, viewAHeight - 4)} className="integrated-view-a-preview-frame" rx={6} ry={6} />}
                <rect x={rightX0 + 1} y={viewCTop + 1} width={Math.max(1, rightW - 2)} height={VIEW_C_HEADER_H + 6} className="integrated-view-c-header" rx={6} ry={6} />
                <line x1={rightX0 + 2} x2={rightX0 + rightW - 2} y1={viewCTop + VIEW_C_HEADER_H + 6} y2={viewCTop + VIEW_C_HEADER_H + 6} className="integrated-view-c-header-line" />
                {inOn && inBurstKind === 'reconfig' && reconfigBurstNonce > 0 && (
                  <line key={`reconfig-scan-${reconfigBurstNonce}`} className="integrated-view-c-header-scan" x1={rightX0 + 4} x2={rightX0 + rightW - 4} y1={viewCTop + 4} y2={viewCTop + 4} />
                )}
                {inOn && filterRegionFxActive && filterRegionFxNonce > 0 && (
                  <rect key={`filter-sweep-${filterRegionFxNonce}`} className="integrated-view-a-filter-sweep" x={leftX0 + 2} y={viewATop + 4} width={14} height={Math.max(1, viewAHeight - 8)} rx={4} ry={4} style={{ '--filter-sweep-dx': `${Math.max(0, leftW - 18)}px` } as CSSProperties} />
                )}
                {showPostFilterSweepA && <rect key={`post-filter-sweep-a-${postNonce}`} className="integrated-post-filter-sweep integrated-post-filter-sweep-a" x={leftX0 + 2} y={viewATop + 4} width={14} height={Math.max(1, viewAHeight - 8)} rx={4} ry={4} style={{ '--post-filter-sweep-dx': `${Math.max(0, leftW - 18)}px` } as CSSProperties} />}
                {showPostFilterSweepB && <rect key={`post-filter-sweep-b-${postNonce}`} className="integrated-post-filter-sweep integrated-post-filter-sweep-b" x={leftX0 + 2} y={viewBTop + 4} width={14} height={Math.max(1, viewBHeight - 8)} rx={4} ry={4} style={{ '--post-filter-sweep-dx': `${Math.max(0, leftW - 18)}px` } as CSSProperties} />}
                {postOn && postLegendFilterFxActive && (
                  <g key={`post-filter-legend-outline-${postLegendFilterFxNonce}`}>
                    <rect className="integrated-post-filter-legend-outline" x={leftX0 + 1} y={viewATop + 1} width={Math.max(1, leftW - 2)} height={Math.max(1, viewAHeight - 2)} rx={10} ry={10} pointerEvents="none" />
                    <rect className="integrated-post-filter-legend-flash" x={leftX0 + 1} y={viewATop + 1} width={Math.max(1, leftW - 2)} height={Math.max(1, viewAHeight - 2)} rx={10} ry={10} pointerEvents="none" />
                  </g>
                )}
                {isPostEncode && (
                  <rect key={`post-encode-settle-${postNonce}`} className="integrated-post-encode-settle" x={leftX0 + 3} y={viewATop + 3} width={Math.max(1, leftW - 6)} height={Math.max(1, viewAHeight - 6)} rx={6} ry={6} />
                )}
                {isPostReconfigure && (
                  <line key={`post-reconfig-scan-${postNonce}`} className="integrated-post-reconfig-scan" x1={rightX0 + 4} x2={rightX0 + rightW - 4} y1={viewCTop + 4} y2={viewCTop + 4} />
                )}
                {showPostExploreSweep && (
                  <g key={`post-explore-sweep-${postNonce}`}>
                    <rect className="integrated-post-explore-sweep" x={leftX0 + 2} y={viewBTop + 4} width={14} height={Math.max(1, viewBHeight - 8)} rx={4} ry={4} style={{ '--post-explore-sweep-dx': `${Math.max(0, leftW - 18)}px` } as CSSProperties} />
                    <rect className="integrated-post-viewb-flash" x={leftX0 + 2} y={viewBTop + 2} width={Math.max(1, leftW - 4)} height={Math.max(1, viewBHeight - 4)} rx={6} ry={6} />
                  </g>
                )}

                <rect className="integrated-divider-band" x={leftX0} y={dividerY - 9} width={leftW} height={18} rx={6} ry={6} />
                <line className="integrated-divider-line" x1={leftX0} x2={leftX0 + leftW} y1={dividerY} y2={dividerY} />
                <rect className="integrated-col-divider-band" x={columnDividerX - 8} y={MARGIN.top} width={16} height={plotHeight} rx={6} ry={6} />
                <line className="integrated-col-divider-line" x1={columnDividerX} x2={columnDividerX} y1={MARGIN.top} y2={MARGIN.top + plotHeight} />

                <text className={`integrated-view-title ${isPostFilter || isPostEncode || isPostSelect ? 'is-post-pulse' : ''} ${isPostAbstract ? 'is-post-abstract' : ''}`} x={leftX0 + 10} y={viewATop + 18}>View A: {representation === 'beeswarm' ? 'Beeswarm' : 'Histogram'}</text>
                <text className={`integrated-view-title ${isPostExplore || isPostConnect ? 'is-post-pulse' : ''} ${isPostAbstract ? 'is-post-abstract' : ''}`} x={leftX0 + 10} y={viewBTop + 18}>View B: Time series</text>
                <text className={`integrated-view-title ${isPostReconfigure || isPostAbstract || isPostConnect ? 'is-post-pulse' : ''} ${isPostAbstract ? 'is-post-abstract' : ''}`} x={rightX0 + 10} y={viewCTop + 18}>View C: Ranking strip ({sortMode})</text>
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
                {showPostAbstractDetail2 && (
                  <g className="integrated-post-year-flash-layer" pointerEvents="none">
                    {yearTicks.map((tick, index) => (
                      <text key={`post-year-flash-${postNonce}-${tick}`} className="integrated-post-year-flash" x={xScaleYear(tick)} y={viewBBottom + 20} textAnchor="middle" style={{ '--tick-delay': `${index * 40}ms` } as CSSProperties}>{tick}</text>
                    ))}
                  </g>
                )}

                {yTicks.map(tick => (
                  <g key={`y-tick-${tick}`}>
                    <line className="integrated-axis-tick-line" x1={leftX0 - 5} x2={leftX0} y1={yScale(tick)} y2={yScale(tick)} />
                    <text className="integrated-axis-tick" x={leftX0 - 10} y={yScale(tick) + 4} textAnchor="end">{Math.round(tick)}</text>
                  </g>
                ))}

                <text className={`integrated-axis-label ${isPostAbstract ? 'is-post-abstract' : ''} ${isPostExplore ? 'is-post-pulse' : ''}`} x={leftX0 + leftW / 2} y={viewBBottom + 46} textAnchor="middle">Year window</text>
                <text className={`integrated-axis-label ${isPostAbstract ? 'is-post-abstract' : ''}`} transform={`translate(${leftX0 - 50}, ${(viewBTop + viewBBottom) / 2}) rotate(-90)`} textAnchor="middle">Internet use (%)</text>

                <line className={`integrated-focus-line ${isExploreInScrub ? 'is-pulse' : ''} ${isPostExplore ? 'is-post-settle' : ''} ${attentionTarget === 'focus' ? 'is-attention' : ''} ${isFocusHot ? 'is-pre-hot' : ''}`} x1={focusX} x2={focusX} y1={viewBTop} y2={viewBBottom} />
                <line className={`integrated-window-line ${isExploreInScrub ? 'is-pulse' : ''} ${isPostExplore ? 'is-post-settle' : ''} ${attentionTarget === 'window' ? 'is-attention' : ''} ${isWindowStartHot ? 'is-pre-hot' : ''}`} x1={xScaleYear(startYear)} x2={xScaleYear(startYear)} y1={viewBTop} y2={viewBBottom} />
                <line className={`integrated-window-line ${isExploreInScrub ? 'is-pulse' : ''} ${isPostExplore ? 'is-post-settle' : ''} ${attentionTarget === 'window' ? 'is-attention' : ''} ${isWindowEndHot ? 'is-pre-hot' : ''}`} x1={xScaleYear(endYear)} x2={xScaleYear(endYear)} y1={viewBTop} y2={viewBBottom} />
                {preOn && (
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
                {showExploreBand && (
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
                {isPostExplore && (
                  <g key={`post-explore-${postNonce}`} className="integrated-post-explore">
                    <path className="integrated-post-bracket" d={`M ${xScaleYear(startYear)} ${viewBBottom - 18} V ${viewBBottom - 4} h 9`} />
                    <path className="integrated-post-bracket" d={`M ${xScaleYear(endYear)} ${viewBBottom - 18} V ${viewBBottom - 4} h -9`} />
                  </g>
                )}

                {showEncodeCrossfade && encodeFrom === 'beeswarm' && renderBeeswarmLayer(`integrated-view-a-layer is-visible is-encode-out ${showEncodePreview ? 'is-preview-dim' : ''}`.trim(), `encode-out-beeswarm-${encodeFadeNonce}`, 'none')}
                {showEncodeCrossfade && encodeFrom === 'histogram' && renderHistogramLayer(`integrated-view-a-layer is-visible is-encode-out ${showEncodePreview ? 'is-preview-dim' : ''}`.trim(), `encode-out-histogram-${encodeFadeNonce}`, 'none')}
                {representation === 'beeswarm' && renderBeeswarmLayer(`integrated-view-a-layer is-visible ${showEncodePreview ? 'is-preview-dim' : ''} ${showEncodeCrossfade ? 'is-encode-in' : ''}`.trim(), `encode-in-beeswarm-${encodeFadeNonce}`)}
                {representation === 'histogram' && renderHistogramLayer(`integrated-view-a-layer is-visible ${showEncodePreview ? 'is-preview-dim' : ''} ${showEncodeCrossfade ? 'is-encode-in' : ''}`.trim(), `encode-in-histogram-${encodeFadeNonce}`)}

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
                    const isPlainConnectHover = baselineHoverLike && marker.kind === 'hovered'
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
                  {!postOn && isPostSelect && selectedMarkerY !== null && selectedKey && (
                    <circle key={`halo-${postNonce}-${selectedKey}`} cx={focusX} cy={selectedMarkerY} r={7.2} className="integrated-post-select-halo" style={{ '--ig-accent': accentFor(selectedKey) } as CSSProperties} />
                  )}
                </g>

                <g className="integrated-arc-layer">{arcs.map(arc => <path key={`arc-${arc.key}`} d={arc.d} className={`integrated-related-arc ${shouldDrawRelatedArcs ? 'is-draw' : ''} ${isPostConnect ? 'is-post-connect' : ''}`} style={{ '--ig-accent': arc.color, '--arc-delay': `${arc.delay}ms` } as CSSProperties} />)}</g>
                {!postOn && isPostSelect && selectedAnchor && (
                  <circle key={`post-select-anchor-${postNonce}`} className="integrated-post-select-pulse" cx={selectedAnchor.x} cy={selectedAnchor.y} r={7.1} />
                )}
                {postOn && showPostSelectFx && selectedAnchor && (
                  <g key={`post-fireworks-${postSelectFxNonce}`} className="integrated-post-fireworks">
                    {postFireworkParticles.map(particle => (
                      <circle
                        key={`firework-${postSelectFxNonce}-${particle.id}`}
                        className="integrated-post-firework-particle"
                        cx={selectedAnchor.x}
                        cy={selectedAnchor.y}
                        r={particle.r}
                        style={{ '--p-dx': `${particle.dx}px`, '--p-dy': `${particle.dy}px`, '--p-delay': `${particle.delay}ms`, '--p-r': `${particle.r}` } as CSSProperties}
                      />
                    ))}
                  </g>
                )}
                {postOn && showPostSelectFx && postSelectFrameEntries.length > 0 && rowH > 0 && (
                  <g className="integrated-post-select-frames">
                    {postSelectFrameEntries.map(entry => (
                      <rect
                        key={`post-select-frame-${postSelectFxNonce}-${entry.key}`}
                        className="integrated-post-select-frame"
                        x={rightX0 + 2}
                        y={viewCTop + rowTop + entry.rowIndex * rowH}
                        width={Math.max(1, rightW - 4)}
                        height={Math.max(1, rowH - 0.8)}
                        rx={5}
                        ry={5}
                        style={{ '--post-frame-delay': `${entry.delay}ms` } as CSSProperties}
                      />
                    ))}
                  </g>
                )}
                {!postOn && isPostSelect && selectedTopRowIndex !== undefined && rowH > 0 && (
                  <rect
                    key={`post-select-row-${postNonce}`}
                    className="integrated-post-select-row-pulse"
                    x={rightX0 + 2}
                    y={viewCTop + rowTop + selectedTopRowIndex * rowH}
                    width={Math.max(1, rightW - 4)}
                    height={Math.max(1, rowH - 0.8)}
                    rx={5}
                    ry={5}
                  />
                )}
                {isPostConnect && connectPingPoints.length > 0 && (
                  <g className="integrated-post-connect-pings">
                    {connectPingPoints.map(point => (
                      <circle
                        key={`post-connect-ping-${postNonce}-${point.key}`}
                        className="integrated-post-connect-ping"
                        cx={point.x}
                        cy={point.y}
                        r={2.8}
                        style={{ '--post-ping-delay': `${point.delay}ms` } as CSSProperties}
                      />
                    ))}
                  </g>
                )}
                {isPostConnect && connectRowPingEntries.length > 0 && rowH > 0 && (
                  <g className="integrated-post-connect-row-pings">
                    {connectRowPingEntries.map(entry => (
                      <rect
                        key={`post-connect-row-${postNonce}-${entry.key}`}
                        className="integrated-post-connect-row-ping"
                        x={rightX0 + 2}
                        y={viewCTop + rowTop + entry.rowIndex * rowH}
                        width={Math.max(1, rightW - 4)}
                        height={Math.max(1, rowH - 0.8)}
                        rx={5}
                        ry={5}
                        style={{ '--post-ping-delay': `${entry.delay}ms` } as CSSProperties}
                      />
                    ))}
                  </g>
                )}
                {showBridge && bridgePaths.map((d, index) => <path key={`bridge-${hoveredKey ?? 'none'}-${index}`} className={`integrated-bridge ${preOn ? 'is-pre-link' : ''}`} d={d} />)}
                {inOn && clickBridge && clickBridge.ds.map((d, index) => <path key={`click-bridge-${clickBridge.nonce}-${index}`} className="integrated-bridge is-click-burst" d={d} pathLength={1} />)}
                {persistentBridgePaths.map((d, index) => <path key={`post-bridge-${postBridgeNonce}-${index}`} className="integrated-bridge is-post-persist" d={d} pathLength={1} />)}
                <g ref={brushLayerRef} className={`integrated-brush-layer ${showExplorePreHint ? 'is-pre-hint' : ''} ${showInBrushHandle ? 'is-in-on' : ''}`} />

                <g className="integrated-ranking-layer" transform={`translate(${rightX0}, ${viewCTop})`} onPointerMove={handleRankingPointerMove} onPointerLeave={handleRankingPointerLeave}>
                  {preOn && previewSortMode && <rect x={2} y={rowTop - 3} width={Math.max(1, rightW - 4)} height={Math.max(1, viewCHeight - rowTop - 5)} className="integrated-rank-preview-frame" />}
                  <g className={`integrated-ranking-content ${preOn && previewSortMode ? 'is-previewing' : ''} ${isPostReconfigure ? 'is-post-settle' : ''} ${isPostAbstract ? 'is-post-abstract' : ''}`} clipPath={`url(#${viewCClipId})`}>
                    {topRows.map((row, index) => {
                      const y = rowTop + index * rowH
                      const base = sortMode === 'growth' ? rankScale(0) : rankScale.range()[0]
                      const x = rankScale(safeMetric(row.metricValue))
                      const barX = Math.min(base, x)
                      const barW = Math.max(1, Math.abs(x - base))
                      const rankFlipDelta = rankFlipDeltas[row.key] ?? 0
                      const isSelected = selectedKey === row.key
                      const isRelated = relatedKeySet.has(row.key)
                      const isHovered = hoveredKey === row.key
                      const isActive = activeKeySet.has(row.key)
                      const isRegionHovered = Boolean(regionHoverKeySet?.has(row.key))
                      const isRegionDim = hasRegionHover && !isRegionHovered
                      const postSelectDelay = postSelectDelayByKey.get(row.key)
                      const isPostSelectBounce = postOn && isPostSelect && postSelectDelay !== undefined
                      return (
                        <g key={row.key} transform={`translate(0 ${y})`}>
                          <g className={`integrated-rank-row ${inOn && inBurstKind === 'reconfig' ? 'is-reorder' : ''} ${showAbstractReveal ? 'is-abstract-reveal' : ''} ${isPostReconfigure ? 'is-post-settle' : ''} ${isRegionHovered ? 'is-region-hovered' : ''} ${isRegionDim ? 'is-region-dim' : ''}`} style={{ '--row-delay': `${index * 14}ms`, transform: rankFlipDelta ? `translateY(${rankFlipDelta}px)` : undefined } as CSSProperties}>
                            <rect x={2} y={0} width={Math.max(1, rightW - 4)} height={Math.max(1, rowH - 0.8)} className={`integrated-rank-hit ${isActive ? '' : 'is-inactive'} ${isSelected ? 'is-selected' : ''} ${isRelated ? 'is-related' : ''} ${isHovered ? 'is-hovered' : ''} ${isRegionHovered ? 'is-region-hovered' : ''} ${isRegionDim ? 'is-region-dim' : ''}`} onPointerDown={handleSelectPress} onClick={() => selectCountry(row.key)} />
                            <text key={`rn-${row.key}`} x={8} y={Math.max(8, rowH - 2)} className={`integrated-rank-name ${isPostAbstract ? 'is-post-abstract' : ''} ${isRegionHovered ? 'is-region-hovered' : ''} ${isRegionDim ? 'is-region-dim' : ''}`}>{row.country.entity}</text>
                            <rect x={barX} y={Math.max(0.8, rowH * 0.22)} width={barW} height={Math.max(0.8, rowH * 0.56)} className={`integrated-rank-bar ${isSelected ? 'is-selected' : isRelated ? 'is-related' : ''} ${isHovered && !isSelected ? 'is-hovered' : ''} ${isRegionHovered ? 'is-region-hovered' : ''} ${isRegionDim ? 'is-region-dim' : ''} ${postOn && isPostReconfigure ? 'is-post-reconfig-bounce' : ''} ${isPostSelectBounce ? 'is-post-select-bounce' : ''}`} style={{ '--ig-accent': accentFor(row.key), '--post-select-delay': `${postSelectDelay ?? 0}ms` } as CSSProperties} />
                            {postOn && isPostReconfigure && <rect x={2} y={0} width={Math.max(1, rightW - 4)} height={Math.max(1, rowH - 0.8)} rx={5} ry={5} className="integrated-post-reconfig-frame" />}
                            {(inOn || detailLevel === 2) && <text key={`rm-${row.key}`} x={rightW - 8} y={Math.max(8, rowH - 2)} className={`integrated-rank-metric ${isPostAbstract ? 'is-post-abstract' : ''} ${inOn ? `ig-abstract-fade ${detailLevel === 2 ? 'is-on' : 'is-off'}` : ''} ${showPostAbstractDetail2 ? 'is-post-abstract-metric-flash' : ''}`} textAnchor="end">v:{fmt(row.focusValue ?? 0)} g:{fmt(row.growth)} s:{fmt(row.volatility)}</text>}
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

              {!animateTips && detailLevel >= 1 && tooltip && tooltipCountry && (
                <div className={`integrated-tooltip ${detailLevel === 0 ? 'is-compact' : ''}`} style={{ left: tooltip.x, top: tooltip.y }}>
                  <div className="integrated-tooltip-title">{tooltipCountry.entity}</div>
                  {(inOn || detailLevel >= 1) && <div className={`integrated-tooltip-subtitle ${inOn ? `ig-abstract-fade ig-abstract-fade-row ${detailLevel >= 1 ? 'is-on' : 'is-off'}` : ''}`}>{tooltipCountry.code}</div>}
                  <div className="integrated-tooltip-row">{focusYear}: {fmt(tooltipCountry.valueByYear.get(focusYear) ?? 0)}%</div>
                  {(inOn || (detailLevel === 2 && tooltipMetric)) && (
                    <>
                      <div className={`integrated-tooltip-row ${inOn ? `ig-abstract-fade ig-abstract-fade-row ${detailLevel === 2 ? 'is-on' : 'is-off'}` : ''}`}>growth: {fmt(tooltipMetric?.growth ?? 0)}</div>
                      <div className={`integrated-tooltip-row ${inOn ? `ig-abstract-fade ig-abstract-fade-row ${detailLevel === 2 ? 'is-on' : 'is-off'}` : ''}`}>volatility: {fmt(tooltipMetric?.volatility ?? 0)}</div>
                    </>
                  )}
                </div>
              )}
              {animateTips && tipMounted && renderedTooltip && renderedTooltipCountry && (
                <div className={`integrated-tooltip ig-tip ${tipVisible ? 'is-in' : 'is-out'} ${detailLevel === 0 ? 'is-compact' : ''}`} style={{ left: renderedTooltip.x, top: renderedTooltip.y }}>
                  <div className="integrated-tooltip-title">{renderedTooltipCountry.entity}</div>
                  {(inOn || detailLevel >= 1) && <div className={`integrated-tooltip-subtitle ${inOn ? `ig-abstract-fade ig-abstract-fade-row ${detailLevel >= 1 ? 'is-on' : 'is-off'}` : ''}`}>{renderedTooltipCountry.code}</div>}
                  <div className="integrated-tooltip-row">{focusYear}: {fmt(renderedTooltipCountry.valueByYear.get(focusYear) ?? 0)}%</div>
                  {(inOn || (detailLevel === 2 && renderedTooltipMetric)) && (
                    <>
                      <div className={`integrated-tooltip-row ${inOn ? `ig-abstract-fade ig-abstract-fade-row ${detailLevel === 2 ? 'is-on' : 'is-off'}` : ''}`}>growth: {fmt(renderedTooltipMetric?.growth ?? 0)}</div>
                      <div className={`integrated-tooltip-row ${inOn ? `ig-abstract-fade ig-abstract-fade-row ${detailLevel === 2 ? 'is-on' : 'is-off'}` : ''}`}>volatility: {fmt(renderedTooltipMetric?.volatility ?? 0)}</div>
                    </>
                  )}
                </div>
              )}

              {!animateTips && representation === 'histogram' && histTooltip && hoveredBin && (
                <div className="integrated-tooltip integrated-tooltip-bin" style={{ left: histTooltip.x, top: histTooltip.y }}>
                  <div className="integrated-tooltip-title">{hoveredBinTitle}</div>
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
              {animateTips && histTipMounted && renderedHistTooltip && renderedHoveredBin && (
                <div className={`integrated-tooltip integrated-tooltip-bin ig-tip ig-tip-interactive ${histTipVisible ? 'is-in' : 'is-out'}`} style={{ left: renderedHistTooltip.x, top: renderedHistTooltip.y }}>
                  <div className="integrated-tooltip-title">{renderedHoveredBinTitle}</div>
                  <div className="integrated-tooltip-row">countries: {renderedHoveredBin.total}</div>
                  <div className="integrated-tooltip-row">active: {renderedHoveredBin.active}</div>
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
          {toast && <div key={`toast-${toast.id}`} className={`integrated-toast-chip ${postActive ? 'is-show' : ''}`}>{toast.text}</div>}
        </div>

        <section className="integrated-panel-section">
          <div className="integrated-section-title">Selection</div>
          <div className="integrated-status-line">Selected: <strong>{selectedKey ? countryByKey.get(selectedKey)?.entity ?? 'None' : 'None'}</strong></div>
          <label className="integrated-control-label" htmlFor="integrated-related-count">Related count: <strong>{relatedCount}</strong></label>
          <input
            id="integrated-related-count"
            className={`integrated-range ${isRelatedCountHot ? 'is-hot' : ''} ${isRangeSelectionScrub ? 'is-in-scrub' : ''}`}
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
          <button type="button" className="integrated-button" onClick={clearSelection} disabled={loading || Boolean(error)}>Clear selection</button>
        </section>

        <section className="integrated-panel-section">
          <div className="integrated-section-title">Explore</div>
          <label className="integrated-control-label" htmlFor="integrated-focus-year">Focus year: <strong>{focusYear}</strong></label>
          <input
            id="integrated-focus-year"
            className={`integrated-range ${isFocusHot ? 'is-hot' : ''} ${isRangeFocusScrub ? 'is-in-scrub' : ''}`}
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
              emitFocusYearScrub()
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
            className={`integrated-range ${preOn && hotControl === 'windowStart' ? 'is-hot' : ''} ${isRangeWindowStartScrub ? 'is-in-scrub' : ''}`}
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
            className={`integrated-range ${preOn && hotControl === 'windowEnd' ? 'is-hot' : ''} ${isRangeWindowEndScrub ? 'is-in-scrub' : ''}`}
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
          <div key={`count-${activeCount}`} className={`integrated-count-chip ${isPostFilter ? 'is-pulse is-post-stamp' : ''}`}>
            Showing <strong>{activeCount}</strong> / {totalCount}
            <span className="integrated-count-check" aria-hidden="true">✓</span>
          </div>
          <label className="integrated-control-label" htmlFor="integrated-value-min">Value min: <strong>{fmt(valueMin)}%</strong></label>
          <input
            id="integrated-value-min"
            className={`integrated-range ${preOn && hotControl === 'valueMin' ? 'is-hot' : ''} ${isRangeValueMinScrub ? 'is-in-scrub' : ''}`}
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
              finalizeFilterPost({ source: 'slider' })
            }}
            onPointerCancel={event => {
              endRangeScrub()
              const keepHot = event.currentTarget.matches(':hover')
              finalizeHotControlOnPointerEnd('valueMin', keepHot)
              if (!keepHot) setShowFilterGuides(false)
              finalizeFilterPost({ source: 'slider' })
            }}
            disabled={loading || Boolean(error) || countries.length === 0}
          />
          <label className="integrated-control-label" htmlFor="integrated-value-max">Value max: <strong>{fmt(valueMax)}%</strong></label>
          <input
            id="integrated-value-max"
            className={`integrated-range ${preOn && hotControl === 'valueMax' ? 'is-hot' : ''} ${isRangeValueMaxScrub ? 'is-in-scrub' : ''}`}
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
              finalizeFilterPost({ source: 'slider' })
            }}
            onPointerCancel={event => {
              endRangeScrub()
              const keepHot = event.currentTarget.matches(':hover')
              finalizeHotControlOnPointerEnd('valueMax', keepHot)
              if (!keepHot) setShowFilterGuides(false)
              finalizeFilterPost({ source: 'slider' })
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
              triggerFilterDone({ burst: true })
              clearTimeoutRef(prefixPostTimeoutRef)
              prefixPostTimeoutRef.current = window.setTimeout(() => {
                finalizeFilterPost({ source: 'prefix' })
                prefixPostTimeoutRef.current = null
              }, 450)
            }}
            onBlur={() => finalizeFilterPost({ source: 'prefix' })}
            onKeyDown={event => {
              if (event.key === 'Enter') finalizeFilterPost({ source: 'prefix' })
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
                triggerFilterDone({ burst: true })
                finalizeFilterPost({ count: activeCount, source: 'context' })
              }}
            />
            <span>Show context</span>
          </label>
        </section>

        <section className="integrated-panel-section">
          <div className="integrated-section-title">Reconfigure</div>
          <div className="integrated-button-row">
            <button type="button" className={`integrated-button subtle ${sortMode === 'value' ? 'is-active' : ''} ${inOn && inBurstKind === 'reconfig' && reconfigBurstTarget === 'value' ? 'is-reconfig-burst' : ''}`} onMouseEnter={() => { emitPre('reconfig_hover'); if (preOn) setPreviewSortMode('value') }} onMouseLeave={() => setPreviewSortMode(previous => (previous === 'value' ? null : previous))} onClick={() => commitSortMode('value')}>Value</button>
            <button type="button" className={`integrated-button subtle ${sortMode === 'growth' ? 'is-active' : ''} ${inOn && inBurstKind === 'reconfig' && reconfigBurstTarget === 'growth' ? 'is-reconfig-burst' : ''}`} onMouseEnter={() => { emitPre('reconfig_hover'); if (preOn) setPreviewSortMode('growth') }} onMouseLeave={() => setPreviewSortMode(previous => (previous === 'growth' ? null : previous))} onClick={() => commitSortMode('growth')}>Growth</button>
            <button type="button" className={`integrated-button subtle ${sortMode === 'volatility' ? 'is-active' : ''} ${inOn && inBurstKind === 'reconfig' && reconfigBurstTarget === 'volatility' ? 'is-reconfig-burst' : ''}`} onMouseEnter={() => { emitPre('reconfig_hover'); if (preOn) setPreviewSortMode('volatility') }} onMouseLeave={() => setPreviewSortMode(previous => (previous === 'volatility' ? null : previous))} onClick={() => commitSortMode('volatility')}>Volatility</button>
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
            <ol key={`related-${selectedKey ?? 'none'}`} className={`integrated-related-list ${isPostConnect ? 'is-post-connect' : ''}`}>
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
