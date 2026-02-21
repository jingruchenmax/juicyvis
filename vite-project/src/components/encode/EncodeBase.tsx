import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent
} from 'react'
import * as d3 from 'd3'
import {
  playAfricanSound,
  playClickSound,
  playColorConfirmSound,
  playDingdong4Sound,
  playHoverSound,
  playPreviewCueSound,
  playWhooshSound
} from '../../utils/soundUtils'
import {
  MEAT_CATEGORIES,
  type MeatCategoryDef,
  type MeatCategoryKey,
  type MeatCountryDatum,
  type MeatCountryTimeSeries,
  type MeatCsvRow,
  useMeatTypeData
} from './useMeatTypeData'

type Representation = 'timeline-total' | 'stacked-bar' | 'stacked-100' | 'donut' | 'heatmap'
type Measure = 'kg' | 'percent'
type FocusCategory = 'All' | MeatCategoryKey
type TransitionDirection = 'next' | 'prev'
type SwitchOrigin = 'wheel' | 'slider' | 'tick'

interface EncodeBaseProps {
  juicy: boolean
  data?: MeatCsvRow[]
}

interface HoverDatum {
  country: string
  category: MeatCategoryKey
  clientX: number
  clientY: number
}

interface TooltipDatum extends HoverDatum {
  kg: number
  percent: number
  encoded: number
}

interface TooltipDisplay {
  kg: number
  percent: number
  encoded: number
}

interface TimelineTooltipDatum {
  country: string
  year: number
  totalKg: number
  clientX: number
  clientY: number
}

interface ParticleState {
  id: number
  x: number
  y: number
  size: number
  dx: number
  dy: number
  color: string
  variant: 'burst' | 'spark' | 'color' | 'trail'
}

interface RippleState {
  id: number
  x: number
  y: number
  color: string
}

interface CursorPoint {
  x: number
  y: number
}

interface ChartSnapshot {
  representation: Representation
  measure: Measure
  focusCategory: FocusCategory
  colors: Record<MeatCategoryKey, string>
}

interface TimelineLayout {
  years: number[]
  plotX: number
  plotY: number
  plotWidth: number
  plotHeight: number
  bandWidth: number
  xScale: d3.ScaleLinear<number, number>
  yScale: d3.ScaleLinear<number, number>
}

interface EncodeCarryOverlay {
  key: number
  fromLeft: number
  fromWidth: number
  plotLeft: number
  plotTop: number
  plotWidth: number
  plotHeight: number
  centerLeft: number
  year: number
}

const REPRESENTATION_OPTIONS: Array<{ value: Representation; label: string }> = [
  { value: 'timeline-total', label: 'Total over time (kg)' },
  { value: 'stacked-bar', label: 'Stacked Bar (kg)' },
  { value: 'stacked-100', label: '100% Stacked (percent)' },
  { value: 'donut', label: 'Donut (percent)' },
  { value: 'heatmap', label: 'Heatmap (kg/percent)' }
]

const REPRESENTATION_ORDER: Representation[] = REPRESENTATION_OPTIONS.map(option => option.value)

const SVG_WIDTH = 1180
const SVG_HEIGHT = 760
const WHEEL_SWITCH_THRESHOLD = 80
const WHEEL_SWITCH_COOLDOWN_MS = 480
const TRANSITION_DURATION_JUICY_MS = 430
const TRANSITION_DURATION_BASIC_MS = 190
const WHEEL_PREVIEW_EXPIRY_MS = 1200
const RING_FADE_OUT_MS = 140
const SLIDER_VISUAL_DURATION_MS = 220
const PROJECTOR_FLASH_MS = 60
const PREVIEW_SCALE = 0.48
const REP_THUMB_SIZE_PX = 18
const TRANSITION_PARTICLE_CAP = 24
const PARTICLE_LIFETIME_MS = 700
const PARTICLE_MAX_COUNT = 180
const YEAR_CARRY_OVERLAY_MS = 360

const TIMELINE_MARGIN = {
  top: 176,
  right: 72,
  bottom: 118,
  left: 86
}

const INITIAL_CATEGORY_COLORS: Record<MeatCategoryKey, string> = MEAT_CATEGORIES.reduce(
  (acc, category) => {
    acc[category.key] = category.color
    return acc
  },
  {} as Record<MeatCategoryKey, string>
)

const EMPTY_CURSOR_POINT: CursorPoint = { x: 0, y: 0 }

const formatKg = (value: number): string => {
  if (value >= 100) return d3.format('.0f')(value)
  return d3.format('.1f')(value)
}

const formatPercent = (value: number): string => `${d3.format('.1f')(value)}%`

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value))

const makeArcPathD = (radius: number, startAngle: number, endAngle: number): string => {
  const path = d3.path()
  // Build a single open arc curve so textPath never traverses a reversed inner segment.
  path.arc(0, 0, radius, startAngle, endAngle, false)
  return path.toString()
}

const representationToIndex = (representation: Representation): number =>
  Math.max(0, REPRESENTATION_ORDER.indexOf(representation))

const indexToRepresentation = (index: number): Representation => {
  const clamped = Math.max(0, Math.min(REPRESENTATION_ORDER.length - 1, Math.round(index)))
  return REPRESENTATION_ORDER[clamped]
}

const directionBetweenIndexes = (
  currentIndex: number,
  nextIndex: number
): TransitionDirection => {
  const length = REPRESENTATION_ORDER.length
  const forward = (nextIndex - currentIndex + length) % length
  const backward = (currentIndex - nextIndex + length) % length
  return forward <= backward ? 'next' : 'prev'
}

const encodedLabelByRepresentation = (representation: Representation): string => {
  if (representation === 'heatmap') return 'Color intensity'
  if (representation === 'timeline-total') return 'Relative trend level'
  if (representation === 'stacked-bar') return 'Relative bar length'
  return 'Angular share'
}

const measureForRepresentation = (representation: Representation, currentMeasure: Measure): Measure => {
  if (representation === 'timeline-total' || representation === 'stacked-bar') return 'kg'
  if (representation === 'stacked-100' || representation === 'donut') return 'percent'
  return currentMeasure
}

const labelForRepresentation = (representation: Representation): string =>
  REPRESENTATION_OPTIONS.find(option => option.value === representation)?.label ?? representation

const isWheelExcludedElement = (element: Element | null): boolean => {
  if (!element) return false
  return Boolean(element.closest('input[type="color"], select, textarea, [contenteditable="true"]'))
}

export default function EncodeBase({ juicy, data }: EncodeBaseProps) {
  const { dataset, years, datasetsByYear, timeSeries, latestYear, loading, error } = useMeatTypeData(data)

  const [representation, setRepresentation] = useState<Representation>('timeline-total')
  const [measure, setMeasure] = useState<Measure>('kg')
  const [focusCategory, setFocusCategory] = useState<FocusCategory>('All')
  const [selectedYear, setSelectedYear] = useState<number>(2022)
  const [displayYear, setDisplayYear] = useState<number>(selectedYear)
  const [yearAnimNonce, setYearAnimNonce] = useState<number>(0)
  const [categoryColors, setCategoryColors] = useState<Record<MeatCategoryKey, string>>(() => ({
    ...INITIAL_CATEGORY_COLORS
  }))

  const [legendHoverCategory, setLegendHoverCategory] = useState<MeatCategoryKey | null>(null)
  const [markHoverCategory, setMarkHoverCategory] = useState<MeatCategoryKey | null>(null)
  const [hoveredDatum, setHoveredDatum] = useState<HoverDatum | null>(null)
  const [hoveredTimelineCountry, setHoveredTimelineCountry] = useState<string | null>(null)
  const [hoveredTimelineBandYear, setHoveredTimelineBandYear] = useState<number | null>(null)
  const [timelineTooltip, setTimelineTooltip] = useState<TimelineTooltipDatum | null>(null)
  const [timelineBandPulseYear, setTimelineBandPulseYear] = useState<number | null>(null)
  const [tooltipDisplay, setTooltipDisplay] = useState<TooltipDisplay>({
    kg: 0,
    percent: 0,
    encoded: 0
  })

  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [transitionKey, setTransitionKey] = useState(0)
  const [transitionDirection, setTransitionDirection] = useState<TransitionDirection>('next')
  const [ghostSnapshot, setGhostSnapshot] = useState<ChartSnapshot | null>(null)
  const [particles, setParticles] = useState<ParticleState[]>([])
  const [ripple, setRipple] = useState<RippleState | null>(null)
  const [focusPulseCategory, setFocusPulseCategory] = useState<MeatCategoryKey | null>(null)
  const [chartShakeActive, setChartShakeActive] = useState(false)
  const [chartFlashPulseId, setChartFlashPulseId] = useState(0)
  const [previewRepresentation, setPreviewRepresentation] = useState<Representation | null>(null)
  const [previewMode, setPreviewMode] = useState<'hover' | 'wheel' | null>(null)
  const [wheelPendingTarget, setWheelPendingTarget] = useState<{
    representation: Representation
    direction: TransitionDirection
  } | null>(null)
  const [cursorPosition, setCursorPosition] = useState<CursorPoint>(EMPTY_CURSOR_POINT)
  const [isCursorInsideStage, setIsCursorInsideStage] = useState(false)
  const [transitionRingVisible, setTransitionRingVisible] = useState(false)
  const [sliderDirection, setSliderDirection] = useState<TransitionDirection | null>(null)
  const [sliderVisualPercent, setSliderVisualPercent] = useState(0)
  const [projectorFlashActive, setProjectorFlashActive] = useState(false)
  const [colorPulseCategory, setColorPulseCategory] = useState<MeatCategoryKey | null>(null)
  const [colorPulseId, setColorPulseId] = useState(0)
  const [globalParticles, setGlobalParticles] = useState<ParticleState[]>([])
  const [encodeCarryOverlay, setEncodeCarryOverlay] = useState<EncodeCarryOverlay | null>(null)

  const chartSurfaceRef = useRef<HTMLDivElement | null>(null)
  const chartStageRef = useRef<HTMLDivElement | null>(null)
  const repSliderWrapRef = useRef<HTMLDivElement | null>(null)
  const globalFxRef = useRef<HTMLDivElement | null>(null)
  const colorInputRefs = useRef<Partial<Record<MeatCategoryKey, HTMLInputElement | null>>>({})

  const tooltipDisplayRef = useRef<TooltipDisplay>(tooltipDisplay)
  const selectedYearInitializedRef = useRef(false)
  const displayYearRef = useRef<number>(selectedYear)
  const sliderVisualPercentRef = useRef(0)
  const wheelAccumulatorRef = useRef(0)
  const wheelSwitchTimestampRef = useRef(0)
  const hoverSoundTimestampRef = useRef(0)
  const previewSoundTimestampRef = useRef(0)
  const representationSoundTimestampRef = useRef(0)
  const windingSoundTimestampRef = useRef(0)
  const colorSoundTimestampRef = useRef(0)
  const sparkleTimestampRef = useRef(0)
  const sliderVisualRafRef = useRef<number | null>(null)
  const lastPointerClientRef = useRef<CursorPoint>({ ...EMPTY_CURSOR_POINT })
  const colorChangeAnchorRectRef = useRef<DOMRect | null>(null)

  const transitionTimeoutRef = useRef<number | null>(null)
  const yearAnimIntervalRef = useRef<number | null>(null)
  const encodeCarryOverlayTimeoutRef = useRef<number | null>(null)
  const wheelPreviewExpiryTimeoutRef = useRef<number | null>(null)
  const transitionRingFadeTimeoutRef = useRef<number | null>(null)
  const focusPulseTimeoutRef = useRef<number | null>(null)
  const timelineBandPulseTimeoutRef = useRef<number | null>(null)
  const colorPulseTimeoutRef = useRef<number | null>(null)
  const projectorFlashTimeoutRef = useRef<number | null>(null)
  const chartShakeTimeoutRef = useRef<number | null>(null)
  const rippleTimeoutRef = useRef<number | null>(null)
  const particleTimeoutsRef = useRef<number[]>([])
  const globalParticleTimeoutsRef = useRef<number[]>([])
  const windingClickTimeoutsRef = useRef<number[]>([])
  const previousCategoryColorsRef = useRef<Record<MeatCategoryKey, string>>({
    ...INITIAL_CATEGORY_COLORS
  })

  const categoryByKey = useMemo(() => {
    const map = new Map<MeatCategoryKey, MeatCategoryDef>()
    MEAT_CATEGORIES.forEach(category => map.set(category.key, category))
    return map
  }, [])

  const yearDataset = useMemo(
    () => datasetsByYear.get(selectedYear) ?? dataset,
    [datasetsByYear, selectedYear, dataset]
  )

  const countryByName = useMemo(() => {
    const map = new Map<string, MeatCountryDatum>()
    yearDataset?.countries.forEach(country => map.set(country.country, country))
    return map
  }, [yearDataset])

  const timelineValueLookup = useMemo(() => {
    const map = new Map<string, Map<number, number>>()
    timeSeries.forEach(series => {
      const values = new Map<number, number>()
      series.values.forEach(value => {
        values.set(value.year, value.totalKg)
      })
      map.set(series.country, values)
    })
    return map
  }, [timeSeries])

  const timelineLayout = useMemo<TimelineLayout | null>(() => {
    if (years.length === 0 || timeSeries.length === 0) return null

    const plotX = TIMELINE_MARGIN.left
    const plotY = TIMELINE_MARGIN.top
    const plotWidth = SVG_WIDTH - TIMELINE_MARGIN.left - TIMELINE_MARGIN.right
    const plotHeight = SVG_HEIGHT - TIMELINE_MARGIN.top - TIMELINE_MARGIN.bottom
    const minYear = years[0]
    const maxYear = years[years.length - 1]
    const safeMaxYear = maxYear > minYear ? maxYear : minYear + 1
    const xScale = d3
      .scaleLinear()
      .domain([minYear, safeMaxYear])
      .range([plotX, plotX + plotWidth])
    const maxTotalKg =
      d3.max(timeSeries, series => d3.max(series.values, value => value.totalKg) ?? 0) ?? 0
    const safeMaxTotalKg = maxTotalKg > 0 ? maxTotalKg : 1
    const yScale = d3
      .scaleLinear()
      .domain([0, safeMaxTotalKg])
      .nice()
      .range([plotY + plotHeight, plotY])
    const bandWidth =
      years.length > 1 ? Math.abs(xScale(years[1]) - xScale(years[0])) : Math.max(24, plotWidth)

    return {
      years,
      plotX,
      plotY,
      plotWidth,
      plotHeight,
      bandWidth,
      xScale,
      yScale
    }
  }, [timeSeries, years])

  const measureLocked = representation !== 'heatmap'
  const activeMeasure: Measure = measureForRepresentation(representation, measure)
  const juicyActive = juicy && !prefersReducedMotion
  const motionSafe = !prefersReducedMotion
  const isYearPicker = representation === 'timeline-total'
  const representationIndex = representationToIndex(representation)
  const sliderFillPercent = (representationIndex / (REPRESENTATION_ORDER.length - 1)) * 100
  const sliderDisplayPercent = juicyActive && motionSafe ? sliderVisualPercent : sliderFillPercent
  const activeHoverCategory = legendHoverCategory ?? markHoverCategory
  const ringRadius = 20
  const ringCircumference = Math.PI * 2 * ringRadius

  const chartSubtitle =
    activeMeasure === 'kg'
      ? 'Kilograms per person per year'
      : "Share of each country's total (%)"

  const currentSnapshot = useMemo<ChartSnapshot>(
    () => ({
      representation,
      measure: activeMeasure,
      focusCategory,
      colors: { ...categoryColors }
    }),
    [representation, activeMeasure, focusCategory, categoryColors]
  )

  const previewSnapshot = useMemo<ChartSnapshot | null>(() => {
    if (!previewRepresentation) return null
    if (previewRepresentation === representation) return null
    return {
      representation: previewRepresentation,
      measure: measureForRepresentation(previewRepresentation, activeMeasure),
      focusCategory,
      colors: { ...categoryColors }
    }
  }, [activeMeasure, categoryColors, focusCategory, previewRepresentation, representation])

  const previewActive = Boolean(
    juicyActive &&
      !isTransitioning &&
      previewMode &&
      previewRepresentation &&
      previewRepresentation !== representation &&
      previewSnapshot
  )

  const getCategoryColor = (category: MeatCategoryKey, snapshot?: ChartSnapshot): string => {
    if (snapshot) return snapshot.colors[category] ?? categoryColors[category]
    return categoryColors[category]
  }

  const getReadableTextColor = (background: string): '#ffffff' | '#0b1220' => {
    const parsed = d3.color(background)
    if (!parsed) return '#0b1220'
    const rgb = parsed.rgb()
    const [r, g, b] = [rgb.r, rgb.g, rgb.b].map(value => {
      const normalized = value / 255
      return normalized <= 0.03928
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4
    })
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
    return luminance < 0.45 ? '#ffffff' : '#0b1220'
  }

  const tooltipTarget = useMemo<TooltipDatum | null>(() => {
    if (!yearDataset || !hoveredDatum || representation === 'timeline-total') return null
    const country = countryByName.get(hoveredDatum.country)
    if (!country) return null

    const kg = country.kg[hoveredDatum.category]
    const percent = country.percent[hoveredDatum.category]
    let encoded = percent

    if (representation === 'stacked-bar') {
      encoded = yearDataset.maxTotalKg > 0 ? (kg / yearDataset.maxTotalKg) * 100 : 0
    } else if (representation === 'heatmap') {
      const intensity =
        activeMeasure === 'kg'
          ? yearDataset.maxCategoryKg > 0
            ? kg / yearDataset.maxCategoryKg
            : 0
          : percent / 100
      encoded = intensity * 100
    }

    return {
      ...hoveredDatum,
      kg,
      percent,
      encoded: clamp01(encoded / 100) * 100
    }
  }, [activeMeasure, countryByName, hoveredDatum, representation, yearDataset])

  const tooltipSignature = tooltipTarget
    ? `${tooltipTarget.country}|${tooltipTarget.category}|${tooltipTarget.kg.toFixed(4)}|${tooltipTarget.percent.toFixed(4)}|${tooltipTarget.encoded.toFixed(4)}`
    : 'none'

  const categoryOpacity = (
    category: MeatCategoryKey,
    snapshotFocus: FocusCategory,
    ghost: boolean
  ): number => {
    const focusOpacity =
      snapshotFocus !== 'All'
        ? snapshotFocus === category
          ? 1
          : 0.3
        : activeHoverCategory && activeHoverCategory !== category
          ? 0.45
          : 1
    return ghost ? focusOpacity * 0.56 : focusOpacity
  }

  const markClassName = (
    category: MeatCategoryKey,
    isHovered: boolean,
    ghost: boolean,
    markType: 'bar' | 'heatmap' | 'donut'
  ): string => {
    const classes = ['encode-mark', `encode-mark-${markType}`]
    if (ghost) classes.push('is-ghost-mark')
    if (isHovered) classes.push(juicyActive ? 'is-hovered-juicy' : 'is-hovered-basic')
    if (!ghost && juicyActive && focusPulseCategory === category) classes.push('is-focus-pulse')
    if (!ghost && juicyActive && motionSafe && isTransitioning) classes.push('is-enter-mark')
    if (!ghost && juicyActive && colorPulseCategory === category) {
      classes.push('is-color-pulse', `is-color-pulse-${colorPulseId % 2}`)
    }
    return classes.join(' ')
  }

  const markStyle = (markIndex: number, ghost: boolean): CSSProperties | undefined => {
    if (ghost) return undefined
    if (!(juicyActive && motionSafe && isTransitioning)) return undefined
    return {
      animationDelay: `${Math.min(240, markIndex * 11)}ms`
    }
  }

  const clearTimeoutRef = (ref: React.MutableRefObject<number | null>) => {
    if (ref.current !== null) {
      window.clearTimeout(ref.current)
      ref.current = null
    }
  }

  const clearTimeoutList = (timeouts: number[]) => {
    timeouts.forEach(timeout => window.clearTimeout(timeout))
    timeouts.length = 0
  }

  const animateSliderVisualTo = useCallback((nextPercent: number, durationMs: number) => {
    if (sliderVisualRafRef.current !== null) {
      window.cancelAnimationFrame(sliderVisualRafRef.current)
      sliderVisualRafRef.current = null
    }
    const startPercent = sliderVisualPercentRef.current
    const startTime = performance.now()
    const step = (timestamp: number) => {
      const progress = clamp01((timestamp - startTime) / durationMs)
      const eased = d3.easeCubicOut(progress)
      const value = startPercent + (nextPercent - startPercent) * eased
      sliderVisualPercentRef.current = value
      setSliderVisualPercent(value)
      if (progress < 1) {
        sliderVisualRafRef.current = window.requestAnimationFrame(step)
      } else {
        sliderVisualRafRef.current = null
      }
    }
    sliderVisualRafRef.current = window.requestAnimationFrame(step)
  }, [])

  const emitGlobalParticles = useCallback(
    (
      clientX: number,
      clientY: number,
      count: number,
      variant: ParticleState['variant'],
      color?: string,
      sizeMultiplier = 1
    ) => {
      if (!(juicyActive && motionSafe)) return
      const particleLimit = isTransitioning ? TRANSITION_PARTICLE_CAP : PARTICLE_MAX_COUNT
      const clampedCount = Math.max(1, Math.min(isTransitioning ? 24 : 36, count))
      const now = performance.now()
      const palette = color
        ? [color, '#ffffff', '#ffd166']
        : ['#2f63d1', '#4ecdc4', '#ffd166', '#ff8fab', '#ffffff']
      const created = Array.from({ length: clampedCount }, (_, index) => {
        const angle = (Math.PI * 2 * index) / clampedCount + Math.random() * 0.8
        const distance =
          variant === 'burst'
            ? 24 + Math.random() * 38
            : variant === 'trail'
              ? 8 + Math.random() * 14
              : 14 + Math.random() * 24
        return {
          id: now + index + Math.random(),
          x: clientX,
          y: clientY,
          size:
            variant === 'trail'
              ? 1.8 + Math.random() * 1.8
              : variant === 'spark'
                ? 2.2 + Math.random() * 2.2
                : (2.8 + Math.random() * 3.2) * Math.max(0.8, sizeMultiplier),
          dx: Math.cos(angle) * distance,
          dy: Math.sin(angle) * distance - (variant === 'trail' ? 1 : 4),
          color: palette[Math.floor(Math.random() * palette.length)],
          variant
        } as ParticleState
      })

      setGlobalParticles(previous => [...previous, ...created].slice(-particleLimit))

      const ids = new Set(created.map(particle => particle.id))
      const timeout = window.setTimeout(() => {
        setGlobalParticles(previous => previous.filter(particle => !ids.has(particle.id)))
        globalParticleTimeoutsRef.current = globalParticleTimeoutsRef.current.filter(
          item => item !== timeout
        )
      }, PARTICLE_LIFETIME_MS)
      globalParticleTimeoutsRef.current.push(timeout)
    },
    [isTransitioning, juicyActive, motionSafe]
  )

  const scheduleWindingClicks = useCallback(() => {
    if (!(juicyActive && motionSafe)) return
    const now = performance.now()
    if (now - windingSoundTimestampRef.current < 360) return
    windingSoundTimestampRef.current = now
    clearTimeoutList(windingClickTimeoutsRef.current)

    const pulseCount = 4
    for (let index = 0; index < pulseCount; index += 1) {
      const timeout = window.setTimeout(() => {
        playClickSound()
      }, index * 68)
      windingClickTimeoutsRef.current.push(timeout)
    }
  }, [juicyActive, motionSafe])

  const emitParticles = useCallback(
    (
      x: number,
      y: number,
      count: number,
      variant: ParticleState['variant'],
      color?: string,
      force = false
    ) => {
      // All juicy particle bursts/trails are centralized here so timing and caps stay consistent.
      if (!force && !(juicyActive && motionSafe)) return
      const particleLimit = isTransitioning ? TRANSITION_PARTICLE_CAP : PARTICLE_MAX_COUNT
      const clampedCount = Math.max(1, Math.min(isTransitioning ? 24 : 36, count))
      const now = performance.now()
      const palette = color
        ? [color, '#ffffff', '#ffd166']
        : ['#2f63d1', '#4ecdc4', '#ffd166', '#ff8fab', '#ffffff']
      const created = Array.from({ length: clampedCount }, (_, index) => {
        const angle = (Math.PI * 2 * index) / clampedCount + Math.random() * 0.8
        const distance =
          variant === 'burst'
            ? 20 + Math.random() * 34
            : variant === 'trail'
              ? 8 + Math.random() * 14
              : 14 + Math.random() * 24
        return {
          id: now + index + Math.random(),
          x,
          y,
          size:
            variant === 'trail'
              ? 1.8 + Math.random() * 1.8
              : variant === 'spark'
                ? 2.2 + Math.random() * 2.2
                : 2.8 + Math.random() * 3.2,
          dx: Math.cos(angle) * distance,
          dy: Math.sin(angle) * distance - (variant === 'trail' ? 1 : 4),
          color: palette[Math.floor(Math.random() * palette.length)],
          variant
        } as ParticleState
      })

      setParticles(previous => [...previous, ...created].slice(-particleLimit))

      const ids = new Set(created.map(particle => particle.id))
      const timeout = window.setTimeout(() => {
        setParticles(previous => previous.filter(particle => !ids.has(particle.id)))
        particleTimeoutsRef.current = particleTimeoutsRef.current.filter(item => item !== timeout)
      }, PARTICLE_LIFETIME_MS)
      particleTimeoutsRef.current.push(timeout)
    },
    [isTransitioning, juicyActive, motionSafe]
  )

  const emitParticlesFromClient = useCallback(
    (
      clientX: number,
      clientY: number,
      count: number,
      variant: ParticleState['variant'],
      color?: string
    ) => {
      const shell = chartSurfaceRef.current
      if (!shell) return
      const bounds = shell.getBoundingClientRect()
      emitParticles(clientX - bounds.left, clientY - bounds.top, count, variant, color)
    },
    [emitParticles]
  )

  const runRepresentationFeedback = useCallback(
    () => {
      if (!(juicyActive && motionSafe)) return

      setChartShakeActive(true)
      clearTimeoutRef(chartShakeTimeoutRef)
      chartShakeTimeoutRef.current = window.setTimeout(() => {
        setChartShakeActive(false)
      }, 210)

      setChartFlashPulseId(value => value + 1)

      const shell = chartSurfaceRef.current
      if (shell) {
        const bounds = shell.getBoundingClientRect()
        emitParticles(bounds.width * 0.52, Math.min(110, bounds.height * 0.2), 14, 'burst')
        emitParticles(bounds.width * 0.5, bounds.height * 0.55, 9, 'spark')
      }

      const now = performance.now()
      if (now - representationSoundTimestampRef.current > 180) {
        representationSoundTimestampRef.current = now
        playWhooshSound()
      }
    },
    [emitParticles, juicyActive, motionSafe]
  )

  const runFocusFeedback = useCallback(
    (category: FocusCategory, sourceElement?: HTMLElement | null) => {
      if (category === 'All') return
      if (!(juicyActive && motionSafe)) return
      const categoryKey = category as MeatCategoryKey

      setFocusPulseCategory(categoryKey)
      clearTimeoutRef(focusPulseTimeoutRef)
      focusPulseTimeoutRef.current = window.setTimeout(() => {
        setFocusPulseCategory(null)
      }, 460)

      if (sourceElement && chartSurfaceRef.current) {
        const shellBounds = chartSurfaceRef.current.getBoundingClientRect()
        const sourceBounds = sourceElement.getBoundingClientRect()
        const x = sourceBounds.left + sourceBounds.width / 2 - shellBounds.left
        const y = sourceBounds.top + sourceBounds.height / 2 - shellBounds.top
        const color = categoryByKey.get(categoryKey)?.color ?? '#2f63d1'
        setRipple({ id: Date.now(), x, y, color })
        clearTimeoutRef(rippleTimeoutRef)
        rippleTimeoutRef.current = window.setTimeout(() => {
          setRipple(null)
        }, 360)
      }
    },
    [categoryByKey, juicyActive, motionSafe]
  )

  const getSliderHandleClientPoint = useCallback((percent: number): CursorPoint | null => {
    const sliderWrap = repSliderWrapRef.current
    if (!sliderWrap) return null
    const bounds = sliderWrap.getBoundingClientRect()
    return {
      x: bounds.left + REP_THUMB_SIZE_PX / 2 + (percent / 100) * (bounds.width - REP_THUMB_SIZE_PX),
      y: bounds.top + bounds.height * 0.5
    }
  }, [])

  const clearWheelPreviewStage = useCallback(() => {
    clearTimeoutRef(wheelPreviewExpiryTimeoutRef)
    setWheelPendingTarget(null)
    setPreviewRepresentation(null)
    setPreviewMode(currentMode => (currentMode === 'wheel' ? null : currentMode))
  }, [])

  const restartWheelPreviewExpiry = useCallback(() => {
    clearTimeoutRef(wheelPreviewExpiryTimeoutRef)
    wheelPreviewExpiryTimeoutRef.current = window.setTimeout(() => {
      clearWheelPreviewStage()
    }, WHEEL_PREVIEW_EXPIRY_MS)
  }, [clearWheelPreviewStage])

  const switchRepresentation = useCallback(
    (
      nextRepresentation: Representation,
      direction: TransitionDirection,
      origin: SwitchOrigin = 'slider'
    ) => {
      if (nextRepresentation === representation) return
      if (isTransitioning) return

      // Transition controller for cinematic switch: old snapshot exits, new representation enters.
      const nextIndex = representationToIndex(nextRepresentation)
      const nextPercent = (nextIndex / (REPRESENTATION_ORDER.length - 1)) * 100
      clearWheelPreviewStage()
      setPreviewMode(null)
      clearTimeoutRef(projectorFlashTimeoutRef)
      setProjectorFlashActive(false)
      clearTimeoutRef(transitionRingFadeTimeoutRef)
      setTransitionDirection(direction)
      setSliderDirection(direction)
      setTransitionKey(key => key + 1)
      setIsTransitioning(true)
      setTransitionRingVisible(juicyActive && motionSafe)
      setHoveredDatum(null)
      setMarkHoverCategory(null)
      setHoveredTimelineCountry(null)
      setHoveredTimelineBandYear(null)
      setTimelineTooltip(null)
      clearTimeoutRef(encodeCarryOverlayTimeoutRef)
      const stageElement = chartStageRef.current
      if (
        juicyActive &&
        motionSafe &&
        representation === 'timeline-total' &&
        nextRepresentation !== 'timeline-total' &&
        timelineLayout &&
        stageElement
      ) {
        const stage = stageElement.getBoundingClientRect()
        const selectedX = timelineLayout.xScale(selectedYear)
        const bandWidthSvg = Math.max(12, timelineLayout.bandWidth)
        const fromWidth = Math.max(6, (bandWidthSvg / SVG_WIDTH) * stage.width)
        const fromLeftRaw = ((selectedX - bandWidthSvg * 0.5) / SVG_WIDTH) * stage.width
        const fromLeft = Math.max(0, Math.min(stage.width - fromWidth, fromLeftRaw))
        const plotLeft = (timelineLayout.plotX / SVG_WIDTH) * stage.width
        const plotTop = (timelineLayout.plotY / SVG_HEIGHT) * stage.height
        const plotWidth = (timelineLayout.plotWidth / SVG_WIDTH) * stage.width
        const plotHeight = (timelineLayout.plotHeight / SVG_HEIGHT) * stage.height
        const centerLeft = plotLeft + plotWidth * 0.5 - 40
        setEncodeCarryOverlay({
          key: Date.now(),
          fromLeft,
          fromWidth,
          plotLeft,
          plotTop,
          plotWidth,
          plotHeight,
          centerLeft,
          year: selectedYear
        })
        encodeCarryOverlayTimeoutRef.current = window.setTimeout(() => {
          setEncodeCarryOverlay(null)
        }, YEAR_CARRY_OVERLAY_MS + 80)
      } else {
        setEncodeCarryOverlay(null)
      }

      if (juicyActive && motionSafe) {
        setGhostSnapshot(currentSnapshot)
        runRepresentationFeedback()
        if (origin === 'wheel' || origin === 'slider' || origin === 'tick') {
          scheduleWindingClicks()
        }
      } else {
        setGhostSnapshot(null)
      }

      setRepresentation(nextRepresentation)
      setMeasure(previousMeasure => measureForRepresentation(nextRepresentation, previousMeasure))
      if (juicyActive && motionSafe) {
        animateSliderVisualTo(nextPercent, SLIDER_VISUAL_DURATION_MS)
      } else {
        sliderVisualPercentRef.current = nextPercent
        setSliderVisualPercent(nextPercent)
      }

      clearTimeoutRef(transitionTimeoutRef)

      const duration =
        juicyActive && motionSafe ? TRANSITION_DURATION_JUICY_MS : TRANSITION_DURATION_BASIC_MS
      if (origin === 'wheel') {
        wheelSwitchTimestampRef.current = performance.now()
      }

      transitionTimeoutRef.current = window.setTimeout(() => {
        setIsTransitioning(false)
        setSliderDirection(null)
        setGhostSnapshot(null)
        setPreviewRepresentation(null)
        setPreviewMode(null)
        setWheelPendingTarget(null)
        if (juicyActive && motionSafe) {
          const targetPoint = getSliderHandleClientPoint(nextPercent)
          if (targetPoint) {
            emitGlobalParticles(targetPoint.x, targetPoint.y, 22, 'burst', '#ffffff', 5)
          }
          playAfricanSound()
          transitionRingFadeTimeoutRef.current = window.setTimeout(() => {
            setTransitionRingVisible(false)
          }, RING_FADE_OUT_MS)
        } else {
          setTransitionRingVisible(false)
        }
      }, duration)
    },
    [
      animateSliderVisualTo,
      clearWheelPreviewStage,
      currentSnapshot,
      emitGlobalParticles,
      getSliderHandleClientPoint,
      isTransitioning,
      juicyActive,
      motionSafe,
      representation,
      selectedYear,
      timelineLayout,
      runRepresentationFeedback,
      scheduleWindingClicks
    ]
  )

  const switchRepresentationByOffset = useCallback(
    (offset: number, origin: SwitchOrigin = 'wheel') => {
      const baseRepresentation = representation
      const currentIndex = representationToIndex(baseRepresentation)
      const nextIndex =
        (currentIndex + offset + REPRESENTATION_ORDER.length) % REPRESENTATION_ORDER.length
      const nextRepresentation = REPRESENTATION_ORDER[nextIndex]
      const direction: TransitionDirection = offset > 0 ? 'next' : 'prev'
      if (
        origin === 'wheel' &&
        juicyActive &&
        motionSafe &&
        !isTransitioning
      ) {
        if (previewMode !== 'wheel' || !wheelPendingTarget) {
          setWheelPendingTarget({ representation: nextRepresentation, direction })
          setPreviewRepresentation(nextRepresentation)
          setPreviewMode('wheel')
          restartWheelPreviewExpiry()
          const now = performance.now()
          if (now - previewSoundTimestampRef.current > 220) {
            previewSoundTimestampRef.current = now
            playPreviewCueSound()
          }
          return
        }

        if (wheelPendingTarget.direction !== direction) {
          setWheelPendingTarget({ representation: nextRepresentation, direction })
          setPreviewRepresentation(nextRepresentation)
          restartWheelPreviewExpiry()
          return
        }

        const pending = wheelPendingTarget
        clearWheelPreviewStage()
        playClickSound()
        clearTimeoutRef(projectorFlashTimeoutRef)
        setProjectorFlashActive(true)
        projectorFlashTimeoutRef.current = window.setTimeout(() => {
          setProjectorFlashActive(false)
          switchRepresentation(pending.representation, pending.direction, 'wheel')
        }, PROJECTOR_FLASH_MS)
        return
      }
      switchRepresentation(nextRepresentation, direction, origin)
    },
    [
      clearWheelPreviewStage,
      isTransitioning,
      juicyActive,
      motionSafe,
      previewMode,
      representation,
      restartWheelPreviewExpiry,
      switchRepresentation,
      wheelPendingTarget
    ]
  )

  const handleRepresentationSlider = (index: number) => {
    if (previewMode === 'wheel') return
    const nextRepresentation = indexToRepresentation(index)
    const nextIndex = representationToIndex(nextRepresentation)
    const direction = directionBetweenIndexes(representationIndex, nextIndex)
    switchRepresentation(nextRepresentation, direction, 'slider')
  }

  const handleRepresentationTickEnter = (nextRepresentation: Representation) => {
    if (!(juicyActive && motionSafe)) return
    if (isTransitioning) return
    if (nextRepresentation === representation) return
    if (previewMode === 'wheel') return
    setPreviewRepresentation(nextRepresentation)
    setPreviewMode('hover')
    const now = performance.now()
    if (now - previewSoundTimestampRef.current > 180) {
      previewSoundTimestampRef.current = now
      playHoverSound()
    }
  }

  const handleRepresentationTickLeave = () => {
    if (previewMode !== 'hover') return
    setPreviewRepresentation(null)
    setPreviewMode(null)
  }

  const handleRepresentationClick = (index: number) => {
    const targetRepresentation = indexToRepresentation(index)
    if (targetRepresentation === representation) return
    if (isTransitioning) return

    const targetIndex = representationToIndex(targetRepresentation)
    const direction = directionBetweenIndexes(representationIndex, targetIndex)

    if (!(juicyActive && motionSafe)) {
      switchRepresentation(targetRepresentation, direction, 'tick')
      return
    }

    if (previewMode === 'wheel') {
      clearWheelPreviewStage()
      switchRepresentation(targetRepresentation, direction, 'tick')
      return
    }

    if (previewMode === 'hover') {
      setPreviewRepresentation(null)
      setPreviewMode(null)
    }

    switchRepresentation(targetRepresentation, direction, 'tick')
  }

  const handleRepresentationTickKeyDown = (
    event: KeyboardEvent<HTMLSpanElement>,
    index: number
  ) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    handleRepresentationClick(index)
  }

  const handleFocusCategoryChange = (
    nextCategory: FocusCategory,
    sourceElement?: HTMLElement | null
  ) => {
    if (nextCategory === focusCategory) return
    setFocusCategory(nextCategory)
    runFocusFeedback(nextCategory, sourceElement)
    if (juicyActive && motionSafe && nextCategory !== 'All') {
      const now = performance.now()
      if (now - representationSoundTimestampRef.current > 130) {
        representationSoundTimestampRef.current = now
        playClickSound()
      }
    }
  }

  const handleMeasureChange = (nextMeasure: Measure) => {
    if (measureLocked) return
    if (nextMeasure === measure) return
    setMeasure(nextMeasure)
    setTransitionKey(key => key + 1)
  }

  const findNearestTimelineYear = useCallback(
    (svgX: number): number => {
      if (!timelineLayout || timelineLayout.years.length === 0) return selectedYear
      const approxYear = timelineLayout.xScale.invert(svgX)
      let nearestYear = timelineLayout.years[0]
      let nearestDistance = Math.abs(nearestYear - approxYear)
      timelineLayout.years.forEach(year => {
        const distance = Math.abs(year - approxYear)
        if (distance < nearestDistance) {
          nearestYear = year
          nearestDistance = distance
        }
      })
      return nearestYear
    },
    [selectedYear, timelineLayout]
  )

  const getSvgPointFromEvent = (event: MouseEvent<SVGElement>): { x: number; y: number } | null => {
    const svg = event.currentTarget.ownerSVGElement
    if (!svg) return null
    const ctm = svg.getScreenCTM()
    if (!ctm) return null
    const point = svg.createSVGPoint()
    point.x = event.clientX
    point.y = event.clientY
    const converted = point.matrixTransform(ctm.inverse())
    return { x: converted.x, y: converted.y }
  }

  const handleTimelineLineEnter = (country: string, event: MouseEvent<SVGElement>) => {
    setHoveredTimelineCountry(country)
    const point = getSvgPointFromEvent(event)
    if (!point) return
    const nearestYear = findNearestTimelineYear(point.x)
    const totalKg = timelineValueLookup.get(country)?.get(nearestYear) ?? 0
    setTimelineTooltip({
      country,
      year: nearestYear,
      totalKg,
      clientX: event.clientX,
      clientY: event.clientY
    })
  }

  const handleTimelineLineMove = (country: string, event: MouseEvent<SVGElement>) => {
    const point = getSvgPointFromEvent(event)
    if (!point) return
    const nearestYear = findNearestTimelineYear(point.x)
    const totalKg = timelineValueLookup.get(country)?.get(nearestYear) ?? 0
    setTimelineTooltip({
      country,
      year: nearestYear,
      totalKg,
      clientX: event.clientX,
      clientY: event.clientY
    })
  }

  const handleTimelineLineLeave = () => {
    setHoveredTimelineCountry(null)
    setTimelineTooltip(null)
  }

  const handleTimelineBandEnter = (year: number) => {
    setHoveredTimelineBandYear(year)
    if (!(juicyActive && motionSafe)) return
    const now = performance.now()
    if (now - hoverSoundTimestampRef.current > 120) {
      hoverSoundTimestampRef.current = now
      playHoverSound()
    }
  }

  const handleTimelineBandClick = (year: number, event: MouseEvent<SVGElement>) => {
    setSelectedYear(year)
    if (!(juicyActive && motionSafe)) return
    playClickSound()
    playDingdong4Sound()
    emitParticlesFromClient(event.clientX, event.clientY, 10, 'burst', '#4f7dd1')
    setTimelineBandPulseYear(year)
    clearTimeoutRef(timelineBandPulseTimeoutRef)
    timelineBandPulseTimeoutRef.current = window.setTimeout(() => {
      setTimelineBandPulseYear(null)
    }, 420)
  }

  const handleMarkEnter = (
    event: MouseEvent<SVGElement>,
    country: string,
    category: MeatCategoryKey
  ) => {
    setMarkHoverCategory(category)
    setHoveredDatum({
      country,
      category,
      clientX: event.clientX,
      clientY: event.clientY
    })

    if (!(juicyActive && motionSafe)) return

    const now = performance.now()
    if (now - hoverSoundTimestampRef.current > 130) {
      hoverSoundTimestampRef.current = now
      playHoverSound()
    }
    if (isTransitioning) return
    if (now - sparkleTimestampRef.current > 90) {
      sparkleTimestampRef.current = now
      const color = categoryByKey.get(category)?.color
      emitParticlesFromClient(event.clientX, event.clientY, 8, 'spark', color)
    }
  }

  const handleMarkMove = (event: MouseEvent<SVGElement>) => {
    setHoveredDatum(previous =>
      previous
        ? {
            ...previous,
            clientX: event.clientX,
            clientY: event.clientY
          }
        : previous
    )
  }

  const handleMarkLeave = () => {
    setMarkHoverCategory(null)
    setHoveredDatum(null)
  }

  const handleStageMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    if (hoveredDatum) {
      setHoveredDatum(previous =>
        previous
          ? {
              ...previous,
              clientX: event.clientX,
              clientY: event.clientY
            }
          : previous
      )
    }

    const stage = chartStageRef.current
    if (!stage) return
    const bounds = stage.getBoundingClientRect()
    const x = event.clientX - bounds.left
    const y = event.clientY - bounds.top

    setCursorPosition({ x, y })
    setIsCursorInsideStage(true)
  }

  const handleChartMouseLeave = () => {
    setMarkHoverCategory(null)
    setHoveredDatum(null)
    setHoveredTimelineCountry(null)
    setHoveredTimelineBandYear(null)
    setTimelineTooltip(null)
    setIsCursorInsideStage(false)
    if (previewMode === 'hover') {
      setPreviewRepresentation(null)
      setPreviewMode(null)
    }
    wheelAccumulatorRef.current = 0
  }

  const handleCategoryColorChange = (
    category: MeatCategoryKey,
    color: string,
    sourceElement?: HTMLElement | null
  ) => {
    if (isYearPicker) return
    if (sourceElement instanceof HTMLInputElement) {
      colorChangeAnchorRectRef.current = sourceElement.getBoundingClientRect()
    }
    setCategoryColors(previous => ({ ...previous, [category]: color }))
  }

  const openColorPickerFromLabel = (category: MeatCategoryKey) => {
    const inputElement = colorInputRefs.current[category]
    if (!inputElement) return
    colorChangeAnchorRectRef.current = inputElement.getBoundingClientRect()

    const anyInput = inputElement as HTMLInputElement & { showPicker?: () => void }
    try {
      if (typeof anyInput.showPicker === 'function') {
        anyInput.showPicker()
      } else {
        inputElement.click()
      }
    } catch {
      inputElement.click()
    }
    inputElement.focus({ preventScroll: true })
  }

  const handleColorNameClick = (
    event: MouseEvent<HTMLSpanElement>,
    category: MeatCategoryKey
  ) => {
    event.preventDefault()
    event.stopPropagation()
    if (isYearPicker) return
    openColorPickerFromLabel(category)
  }

  const handleColorInputFocus = (
    event: FocusEvent<HTMLInputElement>,
    _category: MeatCategoryKey
  ) => {
    colorChangeAnchorRectRef.current = event.currentTarget.getBoundingClientRect()
  }

  useEffect(() => {
    if (selectedYearInitializedRef.current) return
    if (!latestYear) return
    setSelectedYear(latestYear)
    selectedYearInitializedRef.current = true
  }, [latestYear])

  useEffect(() => {
    if (yearAnimIntervalRef.current !== null) {
      window.clearInterval(yearAnimIntervalRef.current)
      yearAnimIntervalRef.current = null
    }

    if (!juicyActive || !isYearPicker) {
      displayYearRef.current = selectedYear
      setDisplayYear(selectedYear)
      return
    }

    const targetYear = selectedYear
    let currentYear = displayYearRef.current

    if (currentYear === targetYear) {
      setDisplayYear(targetYear)
      return
    }

    const stepCount = Math.abs(targetYear - currentYear)
    const intervalMs = Math.max(18, Math.min(60, Math.floor(360 / Math.max(stepCount, 1))))
    const direction = targetYear > currentYear ? 1 : -1

    yearAnimIntervalRef.current = window.setInterval(() => {
      currentYear += direction
      displayYearRef.current = currentYear
      setDisplayYear(currentYear)
      setYearAnimNonce(value => value + 1)

      if (currentYear === targetYear && yearAnimIntervalRef.current !== null) {
        window.clearInterval(yearAnimIntervalRef.current)
        yearAnimIntervalRef.current = null
      }
    }, intervalMs)

    return () => {
      if (yearAnimIntervalRef.current !== null) {
        window.clearInterval(yearAnimIntervalRef.current)
        yearAnimIntervalRef.current = null
      }
    }
  }, [isYearPicker, juicyActive, selectedYear])

  useEffect(() => {
    if (isYearPicker) {
      setLegendHoverCategory(null)
      setMarkHoverCategory(null)
      setHoveredDatum(null)
      return
    }
    setHoveredTimelineCountry(null)
    setHoveredTimelineBandYear(null)
    setTimelineTooltip(null)
  }, [isYearPicker])

  useEffect(() => {
    tooltipDisplayRef.current = tooltipDisplay
  }, [tooltipDisplay])

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => {
      setPrefersReducedMotion(media.matches)
    }

    update()
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', update)
      return () => media.removeEventListener('change', update)
    }
    media.addListener(update)
    return () => media.removeListener(update)
  }, [])

  useEffect(() => {
    if (juicyActive) return
    setFocusPulseCategory(null)
    setColorPulseCategory(null)
    setRipple(null)
    setParticles([])
    setGlobalParticles([])
    setChartShakeActive(false)
    setIsCursorInsideStage(false)
    setPreviewRepresentation(null)
    setPreviewMode(null)
    setWheelPendingTarget(null)
    setProjectorFlashActive(false)
    setTransitionRingVisible(false)
    setTimelineBandPulseYear(null)
    setEncodeCarryOverlay(null)
    colorChangeAnchorRectRef.current = null
  }, [juicyActive])

  useEffect(() => {
    sliderVisualPercentRef.current = sliderVisualPercent
  }, [sliderVisualPercent])

  useEffect(() => {
    if (!(juicyActive && motionSafe)) {
      sliderVisualPercentRef.current = sliderFillPercent
      setSliderVisualPercent(sliderFillPercent)
      return
    }
    animateSliderVisualTo(sliderFillPercent, SLIDER_VISUAL_DURATION_MS)
  }, [animateSliderVisualTo, juicyActive, motionSafe, sliderFillPercent])

  useEffect(() => {
    if (!(juicyActive && motionSafe)) return
    const handlePointerMove = (event: PointerEvent) => {
      lastPointerClientRef.current = { x: event.clientX, y: event.clientY }
    }
    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
    }
  }, [juicyActive, motionSafe])

  useEffect(() => {
    if (!tooltipTarget) return
    if (!(juicyActive && motionSafe)) {
      setTooltipDisplay({
        kg: tooltipTarget.kg,
        percent: tooltipTarget.percent,
        encoded: tooltipTarget.encoded
      })
      return
    }

    const start = tooltipDisplayRef.current
    const target = {
      kg: tooltipTarget.kg,
      percent: tooltipTarget.percent,
      encoded: tooltipTarget.encoded
    }

    const duration = 190
    const ease = d3.easeCubicOut
    let animationFrame = 0
    let startTimestamp: number | null = null

    const step = (timestamp: number) => {
      if (startTimestamp === null) startTimestamp = timestamp
      const t = Math.min(1, (timestamp - startTimestamp) / duration)
      const p = ease(t)
      setTooltipDisplay({
        kg: start.kg + (target.kg - start.kg) * p,
        percent: start.percent + (target.percent - start.percent) * p,
        encoded: start.encoded + (target.encoded - start.encoded) * p
      })
      if (t < 1) {
        animationFrame = window.requestAnimationFrame(step)
      }
    }

    animationFrame = window.requestAnimationFrame(step)
    return () => window.cancelAnimationFrame(animationFrame)
  }, [juicyActive, motionSafe, tooltipSignature, tooltipTarget])

  useEffect(() => {
    const previous = previousCategoryColorsRef.current
    const changed = MEAT_CATEGORIES.filter(
      category => previous[category.key] !== categoryColors[category.key]
    )
    if (!changed.length) return
    previousCategoryColorsRef.current = { ...categoryColors }

    const changedCategory = changed[changed.length - 1]
    setColorPulseId(value => value + 1)
    setColorPulseCategory(changedCategory.key)
    clearTimeoutRef(colorPulseTimeoutRef)
    colorPulseTimeoutRef.current = window.setTimeout(() => {
      setColorPulseCategory(null)
    }, 420)

    if (!(juicyActive && motionSafe)) return

    const now = performance.now()
    if (now - colorSoundTimestampRef.current > 160) {
      colorSoundTimestampRef.current = now
      playColorConfirmSound()
    }

    const anchorRect = colorChangeAnchorRectRef.current
    if (anchorRect) {
      emitGlobalParticles(
        anchorRect.left + anchorRect.width * 0.5,
        anchorRect.top + anchorRect.height * 0.5,
        18,
        'color',
        categoryColors[changedCategory.key]
      )
    }
    const pointer = lastPointerClientRef.current
    if (pointer.x > 0 && pointer.y > 0) {
      emitGlobalParticles(pointer.x, pointer.y, 12, 'spark', categoryColors[changedCategory.key])
    }
  }, [
    categoryColors,
    emitGlobalParticles,
    juicyActive,
    motionSafe
  ])

  useEffect(() => {
    // Global wheel switching intentionally supports representation changes from anywhere on the page.
    const handleWheel = (event: WheelEvent) => {
      if (isTransitioning) return
      const target = event.target as Element | null
      if (isWheelExcludedElement(target)) return
      const activeElement = document.activeElement as Element | null
      if (isWheelExcludedElement(activeElement)) return

      wheelAccumulatorRef.current += event.deltaY
      if (Math.abs(wheelAccumulatorRef.current) < WHEEL_SWITCH_THRESHOLD) {
        return
      }

      const now = performance.now()
      if (previewMode !== 'wheel' && now - wheelSwitchTimestampRef.current < WHEEL_SWITCH_COOLDOWN_MS) {
        wheelAccumulatorRef.current = 0
        return
      }

      const offset = wheelAccumulatorRef.current > 0 ? 1 : -1
      wheelAccumulatorRef.current = 0
      if (previewMode !== 'wheel') {
        wheelSwitchTimestampRef.current = now
      }
      event.preventDefault()
      switchRepresentationByOffset(offset, 'wheel')
    }

    window.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      window.removeEventListener('wheel', handleWheel)
    }
  }, [isTransitioning, previewMode, switchRepresentationByOffset])

  useEffect(() => {
    return () => {
      clearTimeoutRef(transitionTimeoutRef)
      if (yearAnimIntervalRef.current !== null) {
        window.clearInterval(yearAnimIntervalRef.current)
        yearAnimIntervalRef.current = null
      }
      clearTimeoutRef(encodeCarryOverlayTimeoutRef)
      clearTimeoutRef(wheelPreviewExpiryTimeoutRef)
      clearTimeoutRef(transitionRingFadeTimeoutRef)
      clearTimeoutRef(focusPulseTimeoutRef)
      clearTimeoutRef(timelineBandPulseTimeoutRef)
      clearTimeoutRef(colorPulseTimeoutRef)
      clearTimeoutRef(projectorFlashTimeoutRef)
      clearTimeoutRef(chartShakeTimeoutRef)
      clearTimeoutRef(rippleTimeoutRef)
      if (sliderVisualRafRef.current !== null) {
        window.cancelAnimationFrame(sliderVisualRafRef.current)
      }
      clearTimeoutList(windingClickTimeoutsRef.current)
      particleTimeoutsRef.current.forEach(timeout => window.clearTimeout(timeout))
      particleTimeoutsRef.current = []
      globalParticleTimeoutsRef.current.forEach(timeout => window.clearTimeout(timeout))
      globalParticleTimeoutsRef.current = []
    }
  }, [])

  const renderStackedBars = (
    snapshot: ChartSnapshot,
    ghost: boolean,
    mode: 'kg' | 'percent'
  ) => {
    if (!yearDataset) return null
    const countries = yearDataset.countries

    const margin = { top: 108, right: 104, bottom: 130, left: 292 }
    const plotWidth = SVG_WIDTH - margin.left - margin.right
    const rowHeight = Math.max(34, Math.min(52, 480 / countries.length))
    const chartHeight = rowHeight * countries.length
    const plotTop = margin.top
    const plotBottom = plotTop + chartHeight

    const xMax = mode === 'kg' ? yearDataset.maxTotalKg : 100
    const xScale = d3.scaleLinear().domain([0, xMax]).range([margin.left, margin.left + plotWidth])
    if (mode === 'kg') xScale.nice()
    const yScale = d3
      .scaleBand<string>()
      .domain(countries.map(country => country.country))
      .range([plotTop, plotBottom])
      .padding(0.16)

    const ticks = mode === 'kg' ? xScale.ticks(6) : d3.range(0, 101, 20)
    const markElements: JSX.Element[] = []
    const valueLabels: JSX.Element[] = []
    const totalLabels: JSX.Element[] = []

    countries.forEach((country, countryIndex) => {
      const y = yScale(country.country)
      if (y === undefined) return
      const bandHeight = yScale.bandwidth()
      let cumulative = 0

      MEAT_CATEGORIES.forEach((category, categoryIndex) => {
        const rawValue =
          mode === 'kg' ? country.kg[category.key] : country.percent[category.key]
        const start = cumulative
        const end = cumulative + rawValue
        cumulative = end

        const x = xScale(start)
        const width = Math.max(0, xScale(end) - x)
        const isHovered =
          !ghost &&
          hoveredDatum?.country === country.country &&
          hoveredDatum.category === category.key
        const isColorPulse = !ghost && juicyActive && colorPulseCategory === category.key
        const segmentColor = getCategoryColor(category.key, snapshot)
        const markIndex = countryIndex * MEAT_CATEGORIES.length + categoryIndex

        markElements.push(
          <rect
            key={`segment-${mode}-${country.country}-${category.key}`}
            data-encode-color={category.key}
            className={markClassName(category.key, isHovered, ghost, 'bar')}
            style={markStyle(markIndex, ghost)}
            x={x}
            y={y}
            width={width}
            height={bandHeight}
            fill={segmentColor}
            opacity={categoryOpacity(category.key, snapshot.focusCategory, ghost)}
            stroke={isHovered ? '#0f172a' : isColorPulse ? 'rgba(0, 0, 0, 0.75)' : 'rgba(0, 0, 0, 0)'}
            strokeWidth={isHovered ? 2 : isColorPulse ? 1.8 : 1}
            filter={juicyActive && isHovered && !ghost ? 'url(#encode-hover-glow-filter)' : undefined}
            onMouseEnter={ghost ? undefined : event => handleMarkEnter(event, country.country, category.key)}
            onMouseMove={ghost ? undefined : handleMarkMove}
            onMouseLeave={ghost ? undefined : handleMarkLeave}
          />
        )

        if (!ghost && width > 78) {
          valueLabels.push(
            <text
              key={`segment-label-${mode}-${country.country}-${category.key}`}
              className="encode-segment-label"
              x={x + width / 2}
              y={y + bandHeight / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={getReadableTextColor(segmentColor)}
            >
              {mode === 'kg'
                ? `${formatKg(country.kg[category.key])} kg`
                : formatPercent(country.percent[category.key])}
            </text>
          )
        }
      })

      if (mode === 'kg' && !ghost) {
        totalLabels.push(
          <text
            key={`total-${country.country}`}
            className="encode-total-label"
            x={xScale(country.totalKg) + 8}
            y={y + yScale.bandwidth() / 2}
            textAnchor="start"
            dominantBaseline="middle"
          >
            {formatKg(country.totalKg)} kg
          </text>
        )
      }
    })

    return (
      <g className={ghost ? 'encode-chart-layer is-ghost' : 'encode-chart-layer'}>
        {ticks.map(tick => (
          <line
            key={`grid-${mode}-${tick}`}
            className="encode-grid-line"
            x1={xScale(tick)}
            y1={plotTop}
            x2={xScale(tick)}
            y2={plotBottom}
          />
        ))}
        {ticks.map(tick => (
          <text
            key={`tick-${mode}-${tick}`}
            className="encode-axis-tick"
            x={xScale(tick)}
            y={plotBottom + 36}
            textAnchor="middle"
          >
            {mode === 'kg' ? formatKg(tick) : `${tick}%`}
          </text>
        ))}
        <line
          className="encode-axis-line"
          x1={margin.left}
          y1={plotBottom}
          x2={margin.left + plotWidth}
          y2={plotBottom}
        />
        {yearDataset.countries.map(country => {
          const y = yScale(country.country)
          if (y === undefined) return null
          return (
            <text
              key={`country-label-${mode}-${country.country}`}
              className="encode-country-label"
              x={margin.left - 18}
              y={y + yScale.bandwidth() / 2}
              textAnchor="end"
              dominantBaseline="middle"
            >
              {country.country}
            </text>
          )
        })}
        {markElements}
        {valueLabels}
        {totalLabels}
        <text
          className="encode-axis-label"
          x={margin.left + plotWidth / 2}
          y={plotBottom + 96}
          textAnchor="middle"
        >
          {mode === 'kg' ? 'Kilograms per person per year' : "Percent share of each country's total"}
        </text>
      </g>
    )
  }

  const renderHeatmap = (snapshot: ChartSnapshot, ghost: boolean) => {
    if (!yearDataset) return null
    const countries = yearDataset.countries
    const categories = MEAT_CATEGORIES

    const cellWidth = 126
    const cellHeight = 42
    const startX = 292
    const startY = 170
    const totalWidth = categories.length * cellWidth
    const totalHeight = countries.length * cellHeight

    const cells: JSX.Element[] = []
    const values: JSX.Element[] = []
    let markIndex = 0

    countries.forEach((country, rowIndex) => {
      categories.forEach((category, colIndex) => {
        const kg = country.kg[category.key]
        const percent = country.percent[category.key]
        const intensity =
          snapshot.measure === 'kg'
            ? yearDataset.maxCategoryKg > 0
              ? kg / yearDataset.maxCategoryKg
              : 0
            : percent / 100
        const normalized = clamp01(intensity)
        const fill = d3.interpolateLab('#f6f8fc', getCategoryColor(category.key, snapshot))(normalized)
        const x = startX + colIndex * cellWidth
        const y = startY + rowIndex * cellHeight
        const isHovered =
          !ghost &&
          hoveredDatum?.country === country.country &&
          hoveredDatum.category === category.key
        const isColorPulse = !ghost && juicyActive && colorPulseCategory === category.key

        cells.push(
          <rect
            key={`cell-${country.country}-${category.key}`}
            data-encode-color={category.key}
            className={markClassName(category.key, isHovered, ghost, 'heatmap')}
            style={markStyle(markIndex, ghost)}
            x={x}
            y={y}
            width={cellWidth}
            height={cellHeight}
            fill={fill}
            opacity={categoryOpacity(category.key, snapshot.focusCategory, ghost)}
            stroke={isHovered ? '#0f172a' : isColorPulse ? 'rgba(0, 0, 0, 0.75)' : 'rgba(0, 0, 0, 0)'}
            strokeWidth={isHovered ? 2 : isColorPulse ? 1.8 : 1}
            filter={juicyActive && isHovered && !ghost ? 'url(#encode-hover-glow-filter)' : undefined}
            onMouseEnter={ghost ? undefined : event => handleMarkEnter(event, country.country, category.key)}
            onMouseMove={ghost ? undefined : handleMarkMove}
            onMouseLeave={ghost ? undefined : handleMarkLeave}
          />
        )

        if (!ghost) {
          values.push(
            <text
              key={`cell-label-${country.country}-${category.key}`}
              className="encode-heatmap-value"
              x={x + cellWidth / 2}
              y={y + cellHeight / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={getReadableTextColor(fill)}
            >
              {snapshot.measure === 'kg' ? formatKg(kg) : formatPercent(percent)}
            </text>
          )
        }
        markIndex += 1
      })
    })

    return (
      <g className={ghost ? 'encode-chart-layer is-ghost' : 'encode-chart-layer'}>
        {categories.map((category, index) => (
          <text
            key={`heatmap-col-${category.key}`}
            className="encode-heatmap-col-label"
            x={startX + index * cellWidth + cellWidth / 2}
            y={startY - 24}
            textAnchor="middle"
          >
            {category.label}
          </text>
        ))}
        {countries.map((country, index) => (
          <text
            key={`heatmap-row-${country.country}`}
            className="encode-country-label"
            x={startX - 20}
            y={startY + index * cellHeight + cellHeight / 2}
            textAnchor="end"
            dominantBaseline="middle"
          >
            {country.country}
          </text>
        ))}
        <rect
          className="encode-heatmap-frame"
          x={startX}
          y={startY}
          width={totalWidth}
          height={totalHeight}
        />
        {cells}
        {values}
      </g>
    )
  }

  const renderMultiRingDonut = (snapshot: ChartSnapshot, ghost: boolean) => {
    if (!yearDataset) return null
    const countries = yearDataset.countries
    const countryCount = countries.length

    const donutCenterX = SVG_WIDTH * 0.5
    const donutCenterY = SVG_HEIGHT * 0.52
    const outerRadius = 296
    const ringGap = 3.4
    const desiredThickness = 24
    const minInnerRadius = 54
    const requiredInner =
      outerRadius - desiredThickness * countryCount - ringGap * (countryCount - 1)
    const innerRadius = requiredInner >= minInnerRadius ? requiredInner : minInnerRadius
    const ringThickness =
      requiredInner >= minInnerRadius
        ? desiredThickness
        : Math.max(
            16,
            Math.min(
              24,
              (outerRadius - innerRadius - ringGap * (countryCount - 1)) / Math.max(1, countryCount)
            )
          )
    const labelStartAngle = -Math.PI * 0.92
    const labelEndAngle = -Math.PI * 0.08

    const pie = d3
      .pie<{ category: MeatCategoryDef; value: number }>()
      .sort(null)
      .value(item => item.value)
      .padAngle(0.013)

    const arcMarks: JSX.Element[] = []
    const countryLabelDefs: JSX.Element[] = []
    const countryRingLabels: JSX.Element[] = []

    countries.forEach((country, countryIndex) => {
      const ringOuter = outerRadius - countryIndex * (ringThickness + ringGap)
      const ringInner = ringOuter - ringThickness
      const arcGenerator = d3
        .arc<d3.PieArcDatum<{ category: MeatCategoryDef; value: number }>>()
        .innerRadius(ringInner)
        .outerRadius(ringOuter)
        .cornerRadius(2)

      const series = pie(
        MEAT_CATEGORIES.map(category => ({
          category,
          value: country.percent[category.key]
        }))
      )

      series.forEach((slice, categoryIndex) => {
        const category = slice.data.category
        const isHovered =
          !ghost &&
          hoveredDatum?.country === country.country &&
          hoveredDatum.category === category.key
        const isColorPulse = !ghost && juicyActive && colorPulseCategory === category.key
        const markIndex = countryIndex * MEAT_CATEGORIES.length + categoryIndex
        arcMarks.push(
          <path
            key={`donut-slice-${country.country}-${category.key}`}
            data-encode-color={category.key}
            className={markClassName(category.key, isHovered, ghost, 'donut')}
            style={markStyle(markIndex, ghost)}
            d={arcGenerator(slice) ?? ''}
            fill={getCategoryColor(category.key, snapshot)}
            opacity={categoryOpacity(category.key, snapshot.focusCategory, ghost)}
            stroke={isHovered ? '#0f172a' : isColorPulse ? 'rgba(0, 0, 0, 0.75)' : 'rgba(0, 0, 0, 0)'}
            strokeWidth={isHovered ? 2.2 : isColorPulse ? 1.9 : 1}
            filter={juicyActive && isHovered && !ghost ? 'url(#encode-hover-glow-filter)' : undefined}
            onMouseEnter={ghost ? undefined : event => handleMarkEnter(event, country.country, category.key)}
            onMouseMove={ghost ? undefined : handleMarkMove}
            onMouseLeave={ghost ? undefined : handleMarkLeave}
          />
        )
      })

      const preferredLabelRadius = ringInner + ringThickness * 0.42
      const minInsideRadius = ringInner + 1
      const maxInsideRadius = ringInner + Math.max(1, ringThickness - 2)
      const labelRadius = Math.max(minInsideRadius, Math.min(maxInsideRadius, preferredLabelRadius))
      const labelPathId = `encode-donut-label-${ghost ? 'ghost' : 'live'}-${countryIndex}`
      const countryLabel = country.country
      const countryIndexRatio = countryCount > 1 ? countryIndex / (countryCount - 1) : 0
      const fontSize = 14 - countryIndexRatio * 4
      const labelPath = makeArcPathD(labelRadius, labelStartAngle, labelEndAngle)
      countryLabelDefs.push(
        <path key={labelPathId} id={labelPathId} d={labelPath} fill="none" stroke="none" />
      )
      if (!ghost) {
        countryRingLabels.push(
          <text
            key={`donut-country-label-${country.country}`}
            className="encode-donut-ring-label"
            style={{ fontSize: `${fontSize}px` }}
            dy="0.1em"
            dominantBaseline="middle"
          >
            <textPath
              href={`#${labelPathId}`}
              xlinkHref={`#${labelPathId}`}
              startOffset="50%"
              textAnchor="middle"
            >
              {countryLabel}
            </textPath>
          </text>
        )
      }
    })

    return (
      <g className={ghost ? 'encode-chart-layer is-ghost' : 'encode-chart-layer'}>
        <g className="encode-donut-root" transform={`translate(${donutCenterX}, ${donutCenterY})`}>
          <defs>{countryLabelDefs}</defs>
          {arcMarks}
          {countryRingLabels}
          <circle className="encode-donut-hole" cx={0} cy={0} r={innerRadius - 8} />
          <text className="encode-donut-center-title" x={0} y={-8} textAnchor="middle">
            Multi-Ring
          </text>
          <text className="encode-donut-center-subtitle" x={0} y={12} textAnchor="middle">
            Country shares
          </text>
        </g>
      </g>
    )
  }

  const renderTimelineTotal = (_snapshot: ChartSnapshot, ghost: boolean) => {
    if (!timelineLayout || timeSeries.length === 0) {
      return (
        <g className={ghost ? 'encode-chart-layer is-ghost' : 'encode-chart-layer'}>
          <text
            className="encode-timeline-empty-label"
            x={SVG_WIDTH * 0.5}
            y={SVG_HEIGHT * 0.5}
            textAnchor="middle"
          >
            Timeline data unavailable.
          </text>
        </g>
      )
    }

    const { years: timelineYears, plotX, plotY, plotWidth, plotHeight, xScale, yScale } = timelineLayout
    const plotBottom = plotY + plotHeight
    const plotRight = plotX + plotWidth
    const yTicks = yScale.ticks(6)
    const xTicks = timelineYears
    const lineGenerator = d3
      .line<MeatCountryTimeSeries['values'][number]>()
      .x(value => xScale(value.year))
      .y(value => yScale(value.totalKg))
      .curve(d3.curveMonotoneX)
    const colorScale = d3
      .scaleLinear<string>()
      .domain([0, Math.max(1, timeSeries.length - 1)])
      .range(['#111827', '#d1d5db'])
      .interpolate(d3.interpolateRgb)

    const yearBands = timelineYears.map((year, index) => {
      if (timelineYears.length === 1) {
        return { year, x: plotX, width: plotWidth }
      }
      const currentX = xScale(year)
      const previousX = index > 0 ? xScale(timelineYears[index - 1]) : null
      const nextX = index < timelineYears.length - 1 ? xScale(timelineYears[index + 1]) : null
      const left = previousX === null ? plotX : (previousX + currentX) * 0.5
      const right = nextX === null ? plotRight : (currentX + nextX) * 0.5
      return {
        year,
        x: left,
        width: Math.max(2, right - left)
      }
    })

    return (
      <g className={ghost ? 'encode-chart-layer is-ghost' : 'encode-chart-layer'}>
        <rect className="encode-timeline-plot-bg" x={plotX} y={plotY} width={plotWidth} height={plotHeight} />

        {yearBands.map(band => {
          const isSelected = selectedYear === band.year
          const isHovered = hoveredTimelineBandYear === band.year
          const bandClasses = [
            'encode-year-band',
            isSelected ? 'is-selected' : '',
            isHovered ? 'is-hovered' : '',
            juicyActive && timelineBandPulseYear === band.year ? 'is-pulse' : ''
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <rect
              key={`timeline-band-${band.year}`}
              className={bandClasses}
              x={band.x}
              y={plotY}
              width={band.width}
              height={plotHeight}
              onMouseEnter={ghost ? undefined : () => handleTimelineBandEnter(band.year)}
              onMouseLeave={ghost ? undefined : () => setHoveredTimelineBandYear(null)}
              onClick={ghost ? undefined : event => handleTimelineBandClick(band.year, event)}
            />
          )
        })}

        {yTicks.map(tick => (
          <line
            key={`timeline-grid-y-${tick}`}
            className="encode-timeline-grid-line"
            x1={plotX}
            y1={yScale(tick)}
            x2={plotRight}
            y2={yScale(tick)}
          />
        ))}

        {yTicks.map(tick => (
          <text
            key={`timeline-axis-y-${tick}`}
            className="encode-timeline-axis-tick"
            x={plotX - 12}
            y={yScale(tick)}
            textAnchor="end"
            dominantBaseline="middle"
          >
            {formatKg(tick)}
          </text>
        ))}

        {xTicks.map(year => (
          (() => {
            const isHoveredTick = juicyActive && hoveredTimelineBandYear === year
            const isSelectedTick = juicyActive && selectedYear === year
            const xTickClassName = [
              'encode-timeline-axis-tick',
              'encode-timeline-axis-year',
              isHoveredTick ? 'is-hovered' : '',
              isSelectedTick ? 'is-selected' : ''
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <text
                key={`timeline-axis-x-${year}`}
                className={xTickClassName}
                x={xScale(year)}
                y={plotBottom + 28}
                textAnchor="middle"
              >
                {year}
              </text>
            )
          })()
        ))}

        <line className="encode-timeline-axis-line" x1={plotX} y1={plotBottom} x2={plotRight} y2={plotBottom} />
        <line className="encode-timeline-axis-line" x1={plotX} y1={plotY} x2={plotX} y2={plotBottom} />

        {timeSeries.map((series, index) => {
          const path = lineGenerator(series.values) ?? ''
          const color = colorScale(index)
          const hasHoveredCountry = hoveredTimelineCountry !== null
          const isHovered = hoveredTimelineCountry === series.country
          const opacity = hasHoveredCountry ? (isHovered ? 1 : 0.12) : 0.88
          const effectiveOpacity = ghost ? opacity * 0.5 : opacity
          const strokeWidth = isHovered ? 3.4 : 2.2
          const lastValue = series.values[series.values.length - 1] ?? {
            year: timelineYears[timelineYears.length - 1],
            totalKg: 0
          }
          const labelOffset = ((index % 4) - 1.5) * 8
          const labelY = yScale(lastValue.totalKg) + labelOffset
          return (
            <g key={`timeline-series-${series.country}`}>
              <path
                className="encode-timeline-line"
                d={path}
                fill="none"
                stroke={color}
                strokeWidth={strokeWidth}
                opacity={effectiveOpacity}
              />
              {!ghost && (
                <path
                  className="encode-timeline-hit-path"
                  d={path}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={14}
                  onMouseEnter={event => handleTimelineLineEnter(series.country, event)}
                  onMouseMove={event => handleTimelineLineMove(series.country, event)}
                  onMouseLeave={handleTimelineLineLeave}
                />
              )}
              <text
                className="encode-timeline-line-label"
                x={xScale(lastValue.year) + 9}
                y={Math.max(plotY + 10, Math.min(plotBottom - 4, labelY))}
                textAnchor="start"
                dominantBaseline="middle"
                fill={color}
                opacity={effectiveOpacity}
              >
                {series.country}
              </text>
            </g>
          )
        })}

        <text className="encode-timeline-axis-label" x={plotX + plotWidth * 0.5} y={plotBottom + 76} textAnchor="middle">
          Year
        </text>
        <text
          className="encode-timeline-axis-label"
          transform={`translate(${plotX - 78}, ${plotY + plotHeight * 0.5}) rotate(-90)`}
          textAnchor="middle"
        >
          kg per person per year
        </text>
      </g>
    )
  }

  const renderSnapshot = (snapshot: ChartSnapshot, ghost: boolean) => {
    if (snapshot.representation === 'timeline-total') {
      return renderTimelineTotal(snapshot, ghost)
    }
    if (snapshot.representation === 'stacked-100') {
      return renderStackedBars(snapshot, ghost, 'percent')
    }
    if (snapshot.representation === 'donut') {
      return renderMultiRingDonut(snapshot, ghost)
    }
    if (snapshot.representation === 'heatmap') {
      return renderHeatmap(snapshot, ghost)
    }
    return renderStackedBars(snapshot, ghost, 'kg')
  }

  const ghostSnapshotSignature = ghostSnapshot
    ? `${ghostSnapshot.representation}|${ghostSnapshot.measure}|${ghostSnapshot.focusCategory}|${MEAT_CATEGORIES.map(category => `${category.key}:${ghostSnapshot.colors[category.key]}`).join('|')}`
    : 'none'

  const ghostSnapshotLayer = useMemo(() => {
    if (!ghostSnapshot || !juicyActive) return null
    return renderSnapshot(ghostSnapshot, true)
  }, [ghostSnapshot, ghostSnapshotSignature, juicyActive])

  if (loading) {
    return <div className="encode-loading">Loading Encode data...</div>
  }

  if (error || !dataset || !yearDataset) {
    return <div className="encode-error">Encode data error: {error ?? 'Unknown data error.'}</div>
  }

  const tooltipLeft = (tooltipTarget?.clientX ?? 0) + 14
  const tooltipTop = (tooltipTarget?.clientY ?? 0) - 20
  const timelineTooltipLeft = (timelineTooltip?.clientX ?? 0) + 14
  const timelineTooltipTop = (timelineTooltip?.clientY ?? 0) - 20
  const previewHalfWidth = SVG_WIDTH * 0.5
  const previewScaledWidth = SVG_WIDTH * PREVIEW_SCALE
  const previewLeftX = (previewHalfWidth - previewScaledWidth) * 0.5
  const previewRightX = previewHalfWidth + previewLeftX
  const wheelPreviewActive = previewActive && previewMode === 'wheel'
  const sliderAlignedLeft = `${sliderDisplayPercent}%`
  const timelineHeaderYear = juicyActive && isYearPicker ? displayYear : selectedYear
  const currentLayerClass = juicyActive
    ? `encode-current-layer ${
        isTransitioning ? `is-juicy-enter is-juicy-enter-${transitionDirection}` : ''
      }`
    : `encode-current-layer is-basic-fade`

  return (
    <div className={`encode-shell ${juicy ? 'encode-shell-juicy' : 'encode-shell-basic'}`}>
      <div
        className={`encode-chart-shell ${chartShakeActive ? 'is-shaking' : ''} ${
          juicyActive && isTransitioning ? 'is-transition-frame' : ''
        }`}
        ref={chartSurfaceRef}
        onMouseLeave={handleChartMouseLeave}
      >
        <div className="encode-chart-head">
          <h2 className="encode-chart-head-title">
            Per capita meat and fish consumption ({yearDataset.year})
          </h2>
          <p className="encode-chart-head-subtitle">{chartSubtitle}</p>
          <div
            className={`encode-inline-legend ${isYearPicker ? 'is-disabled' : ''}`}
            role="group"
            aria-label="Category legend"
          >
            {MEAT_CATEGORIES.map(category => {
              const isFocused = focusCategory === category.key
              const isActive = activeHoverCategory === category.key || isFocused
              const displayColor = getCategoryColor(category.key)
              return (
                <button
                  key={category.key}
                  type="button"
                  className={`encode-legend-item ${isFocused ? 'is-focused' : ''} ${
                    isActive ? 'is-active' : ''
                  }`}
                  disabled={isYearPicker}
                  onMouseEnter={() => {
                    if (isYearPicker) return
                    setLegendHoverCategory(category.key)
                  }}
                  onMouseLeave={() => {
                    if (isYearPicker) return
                    setLegendHoverCategory(null)
                  }}
                  onClick={event => {
                    if (isYearPicker) return
                    handleFocusCategoryChange(
                      focusCategory === category.key ? 'All' : category.key,
                      event.currentTarget
                    )
                  }}
                >
                  <span className="encode-legend-swatch" style={{ backgroundColor: displayColor }} />
                  <span>{category.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div
          className={`encode-chart-stage ${juicyActive && isTransitioning ? 'transitioning' : ''} ${
            wheelPreviewActive ? 'is-wheel-previewing' : ''
          }`}
          ref={chartStageRef}
          onMouseMove={handleStageMouseMove}
          onMouseEnter={event => {
            const stage = event.currentTarget.getBoundingClientRect()
            const x = event.clientX - stage.left
            const y = event.clientY - stage.top
            setCursorPosition({ x, y })
            setIsCursorInsideStage(true)
          }}
          onMouseLeave={() => {
            setIsCursorInsideStage(false)
            setTimelineTooltip(null)
            setHoveredTimelineCountry(null)
            setHoveredTimelineBandYear(null)
            if (previewMode === 'hover') {
              setPreviewRepresentation(null)
              setPreviewMode(null)
            }
          }}
        >
          <svg
            className={`encode-svg ${juicyActive ? 'is-juicy' : 'is-basic'}`}
            viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
            role="img"
            aria-label="Per-capita meat and fish consumption by country and category"
          >
            <defs>
              <filter id="encode-hover-glow-filter" x="-40%" y="-40%" width="180%" height="180%">
                <feDropShadow dx="0" dy="0" stdDeviation="2.2" floodColor="#ffffff" floodOpacity="0.9" />
                <feDropShadow dx="0" dy="0" stdDeviation="1.6" floodColor="#1f6feb" floodOpacity="0.65" />
              </filter>
            </defs>

            {ghostSnapshotLayer && (
              <g
                className={`encode-ghost-layer ${isTransitioning ? `is-exit is-exit-${transitionDirection}` : ''}`}
              >
                {ghostSnapshotLayer}
              </g>
            )}

            {!previewActive && (
              <g key={`encode-layer-${transitionKey}`} className={currentLayerClass}>
                {renderSnapshot(currentSnapshot, false)}
              </g>
            )}

            {previewActive && previewSnapshot && (
              <g className="encode-preview-split">
                <g className="encode-preview-left-layer" transform={`translate(${previewLeftX}, 0)`} opacity={0.72}>
                  <g transform={`scale(${PREVIEW_SCALE})`}>{renderSnapshot(currentSnapshot, false)}</g>
                </g>
                <g className="encode-preview-layer" transform={`translate(${previewRightX}, 0)`} opacity={0.52}>
                  <g transform={`scale(${PREVIEW_SCALE})`}>{renderSnapshot(previewSnapshot, true)}</g>
                </g>
              </g>
            )}
          </svg>

          {isYearPicker && (
            <div className="encode-timeline-selection-head" aria-live="polite">
              <div className="encode-timeline-selection-title">
                Select a year in the chart to begin exploring the data (Currently Selected:{' '}
                <span
                  key={`year-${timelineHeaderYear}-${yearAnimNonce}`}
                  className="encode-timeline-year-number"
                >
                  {timelineHeaderYear}
                </span>
                )
              </div>
              <div className="encode-timeline-selection-subtitle">
                Select a year and then use the <strong>[slider]</strong> below or{' '}
                <strong>[mouse wheel]</strong> to view details for the selected year.
              </div>
            </div>
          )}

          {juicyActive && encodeCarryOverlay && (
            <div className="encode-year-carry-layer" aria-hidden="true">
              <div
                key={`carry-overlay-${encodeCarryOverlay.key}`}
                className="encode-year-carry-overlay"
                style={
                  {
                    top: `${encodeCarryOverlay.plotTop}px`,
                    height: `${encodeCarryOverlay.plotHeight}px`,
                    '--encode-year-from-left': `${encodeCarryOverlay.fromLeft}px`,
                    '--encode-year-from-width': `${encodeCarryOverlay.fromWidth}px`,
                    '--encode-year-center-left': `${encodeCarryOverlay.centerLeft}px`,
                    '--encode-year-plot-left': `${encodeCarryOverlay.plotLeft}px`,
                    '--encode-year-plot-width': `${encodeCarryOverlay.plotWidth}px`
                  } as CSSProperties
                }
              />
              <div
                key={`carry-label-${encodeCarryOverlay.key}`}
                className="encode-year-carry-label"
                style={{
                  left: `${encodeCarryOverlay.fromLeft + encodeCarryOverlay.fromWidth * 0.5}px`,
                  top: `${Math.max(8, encodeCarryOverlay.plotTop - 28)}px`
                }}
              >
                {encodeCarryOverlay.year}
              </div>
            </div>
          )}

          {previewActive && previewRepresentation && (
            <div className="encode-preview-arrow" aria-hidden="true">
              {labelForRepresentation(representation)} -&gt; {labelForRepresentation(previewRepresentation)}
            </div>
          )}

          {juicyActive && transitionRingVisible && isCursorInsideStage && (
            <div className="encode-cursor-layer" aria-hidden="true">
              <svg
                className={`encode-transition-ring ${isTransitioning ? 'is-running' : ''} ${
                  isTransitioning ? '' : 'is-fading'
                }`}
                viewBox="0 0 52 52"
                style={
                  {
                    left: `${cursorPosition.x}px`,
                    top: `${cursorPosition.y}px`,
                    '--encode-ring-c': ringCircumference,
                    '--encode-ring-duration': `${TRANSITION_DURATION_JUICY_MS}ms`
                  } as CSSProperties
                }
              >
                <circle className="encode-transition-ring-fill" cx="26" cy="26" r="11" />
                <circle className="encode-transition-ring-track" cx="26" cy="26" r={ringRadius} />
                <circle
                  className="encode-transition-ring-progress"
                  cx="26"
                  cy="26"
                  r={ringRadius}
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={ringCircumference}
                  transform="rotate(-90 26 26)"
                />
              </svg>
            </div>
          )}
        </div>

        <div
          className={`encode-rep-axis ${juicyActive ? 'is-juicy' : ''}`}
          style={{ '--encode-slider-fill': `${sliderDisplayPercent}%` } as CSSProperties}
        >
          <div className="encode-rep-axis-inner">
            <div className="encode-rep-ticks">
              <div className="encode-rep-ticks-track">
                {REPRESENTATION_OPTIONS.map((option, index) => {
                  const leftPercent =
                    REPRESENTATION_OPTIONS.length > 1
                      ? (index / (REPRESENTATION_OPTIONS.length - 1)) * 100
                      : 0
                  const tickLeft = `${leftPercent}%`
                  const isActive = representation === option.value
                  const isPreviewTarget = previewActive && previewRepresentation === option.value
                  return (
                    <span
                      key={`tick-${option.value}`}
                      className={`encode-rep-tick ${isActive ? 'is-active' : ''} ${
                        isPreviewTarget ? 'is-preview-target' : ''
                      }`}
                      style={{ left: tickLeft }}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleRepresentationClick(index)}
                      onKeyDown={event => handleRepresentationTickKeyDown(event, index)}
                      onMouseEnter={() => handleRepresentationTickEnter(option.value)}
                      onMouseLeave={handleRepresentationTickLeave}
                    >
                      {option.label}
                    </span>
                  )
                })}
              </div>
            </div>
            <div className="encode-rep-slider-wrap" ref={repSliderWrapRef}>
              <input
                id="encode-representation-axis"
                className="encode-rep-slider"
                type="range"
                min={0}
                max={REPRESENTATION_ORDER.length - 1}
                step={1}
                value={representationIndex}
                onChange={event => handleRepresentationSlider(Number(event.target.value))}
                aria-label="Representation axis slider"
              />
              {juicyActive && (
                <span
                  className="encode-rep-handle-visual"
                  style={{ left: sliderAlignedLeft }}
                  aria-hidden="true"
                />
              )}
              {juicyActive && isTransitioning && sliderDirection && (
                <span
                  className={`encode-rep-direction is-${sliderDirection}`}
                  style={{ left: sliderAlignedLeft }}
                  aria-hidden="true"
                >
                  <svg viewBox="0 0 40 24" className="encode-rep-direction-svg">
                    <path d="M4 12h23l-5.2-5.2 2.9-2.8L36 12l-11.3 8-2.9-2.8L27 12H4z" />
                  </svg>
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="encode-fx-layer" aria-hidden="true">
          {juicyActive && chartFlashPulseId > 0 && (
            <span className="encode-chart-flash" key={`flash-${chartFlashPulseId}`} />
          )}
          {juicyActive && ripple && (
            <span
              className="encode-ripple"
              style={
                {
                  left: `${ripple.x}px`,
                  top: `${ripple.y}px`,
                  borderColor: ripple.color
                } as CSSProperties
              }
            />
          )}
          {particles.map(particle => (
            <span
              key={particle.id}
              className={`encode-particle is-${particle.variant}`}
              style={
                {
                  left: `${particle.x}px`,
                  top: `${particle.y}px`,
                  width: `${particle.size}px`,
                  height: `${particle.size}px`,
                  background: particle.color,
                  '--encode-dx': `${particle.dx}px`,
                  '--encode-dy': `${particle.dy}px`
                } as CSSProperties
              }
            />
          ))}
        </div>

        {juicyActive && (
          <>
            <div className={`encode-wheel-preview-vignette ${wheelPreviewActive ? 'on' : ''}`} />
            <div className={`encode-wheel-preview-dust ${wheelPreviewActive ? 'on' : ''}`} />
            <div className={`encode-projector-flash ${projectorFlashActive ? 'on' : ''}`} />
            <div className={`transition-vignette ${isTransitioning ? 'on' : ''}`} />
            <div className={`transition-swipe ${isTransitioning ? 'on' : ''}`} />
          </>
        )}
      </div>

      <aside className="encode-panel">
        <div className="encode-control-group">
          <label className="encode-control-label" htmlFor="encode-measure">
            Measure
          </label>
          <select
            id="encode-measure"
            className="encode-select"
            value={activeMeasure}
            disabled={measureLocked}
            onChange={event => handleMeasureChange(event.target.value as Measure)}
          >
            <option value="kg">kg</option>
            <option value="percent">percent</option>
          </select>
        </div>

        <div className="encode-control-group">
          <label className="encode-control-label" htmlFor="encode-focus">
            Focus Category
          </label>
          <select
            id="encode-focus"
            className="encode-select"
            value={focusCategory}
            onChange={event =>
              handleFocusCategoryChange(event.target.value as FocusCategory, event.currentTarget)
            }
          >
            <option value="All">All</option>
            {MEAT_CATEGORIES.map(category => (
              <option key={category.key} value={category.key}>
                {category.label}
              </option>
            ))}
          </select>
        </div>

        <div className={`encode-color-editor ${isYearPicker ? 'is-disabled' : ''}`}>
          <div className="encode-control-label">Color Encoding</div>
          <div className="encode-color-hint">Click swatches to edit colors</div>
          <div className="encode-color-list">
            {MEAT_CATEGORIES.map(category => (
              <div key={`color-${category.key}`} className="encode-color-row">
                <input
                  ref={element => {
                    colorInputRefs.current[category.key] = element
                  }}
                  className="encode-color-input encode-color-swatch"
                  type="color"
                  value={categoryColors[category.key]}
                  disabled={isYearPicker}
                  onFocus={event => handleColorInputFocus(event, category.key)}
                  onChange={event =>
                    handleCategoryColorChange(category.key, event.target.value, event.currentTarget)
                  }
                  aria-label={`Edit ${category.label} color`}
                />
                <span className="encode-color-name" onClick={event => handleColorNameClick(event, category.key)}>
                  {category.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {juicyActive && (
        <div className="encode-global-fx-layer" ref={globalFxRef} aria-hidden="true">
          {globalParticles.map(particle => (
            <span
              key={`global-particle-${particle.id}`}
              className={`encode-particle encode-global-particle is-${particle.variant}`}
              style={
                {
                  left: `${particle.x}px`,
                  top: `${particle.y}px`,
                  width: `${particle.size}px`,
                  height: `${particle.size}px`,
                  background: particle.color,
                  '--encode-dx': `${particle.dx}px`,
                  '--encode-dy': `${particle.dy}px`
                } as CSSProperties
              }
            />
          ))}
        </div>
      )}

      {isYearPicker && timelineTooltip && (
        <div
          className={`encode-tooltip encode-tooltip-timeline ${juicyActive ? 'is-juicy' : ''}`}
          style={{ left: `${timelineTooltipLeft}px`, top: `${timelineTooltipTop}px` }}
        >
          <div className="encode-tooltip-country">{timelineTooltip.country}</div>
          <div className="encode-tooltip-category">Year: {timelineTooltip.year}</div>
          <div className="encode-tooltip-metric">total kg: {formatKg(timelineTooltip.totalKg)}</div>
        </div>
      )}

      {!isYearPicker && tooltipTarget && (
        <div
          className={`encode-tooltip ${juicyActive ? 'is-juicy' : ''}`}
          style={{ left: `${tooltipLeft}px`, top: `${tooltipTop}px` }}
        >
          <div className="encode-tooltip-country">{tooltipTarget.country}</div>
          <div className="encode-tooltip-category">
            {categoryByKey.get(tooltipTarget.category)?.label ?? tooltipTarget.category}
          </div>
          <div className="encode-tooltip-metric">kg: {formatKg(tooltipDisplay.kg)}</div>
          <div className="encode-tooltip-metric">percent: {formatPercent(tooltipDisplay.percent)}</div>
          <div className="encode-tooltip-metric">
            {encodedLabelByRepresentation(representation)}: {formatPercent(tooltipDisplay.encoded)}
          </div>
        </div>
      )}
    </div>
  )
}
