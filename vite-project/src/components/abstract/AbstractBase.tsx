
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent
} from 'react'
import * as d3 from 'd3'
import {
  playDingdong1Sound,
  playDingdong3Sound,
  playPreviewCueSound,
  playWindupClickSound,
  playWhooshSound
} from '../../utils/soundUtils'
import {
  usePopulationAgeData,
  type AgeValues,
  type CountryRecord
} from './usePopulationAgeData'

type DetailLevel = 1 | 2 | 3 | 4 | 5

type TileKind =
  | 'world'
  | 'year'
  | 'country'
  | 'other'
  | 'under25'
  | 'age25_64'
  | 'age65plus'
  | 'under5'
  | 'age5_14'
  | 'age15_24'

interface AbstractBaseProps {
  juicy: boolean
}

interface StageSize {
  width: number
  height: number
}

interface CountrySelection {
  entity: string
  code: string
}

interface TooltipState {
  x: number
  y: number
  title: string
  lines: string[]
}

interface ParticleState {
  id: number
  x: number
  y: number
  dx: number
  dy: number
  size: number
  color: string
  lifeMs: number
}

interface TileMeta {
  id: string
  label: string
  value: number
  fill: string
  drillable: boolean
  kind: TileKind
  level: DetailLevel
  parentTotal: number
  tooltipTitle: string
  year?: number
  country?: CountryRecord
  contextYear?: number
  contextCountry?: string
}

interface PositionedTile extends TileMeta {
  x: number
  y: number
  width: number
  height: number
  index: number
}

interface StepperItem {
  level: DetailLevel
  label: string
  context: string
}

const LABEL_AREA_THRESHOLD = 7000
const PARTICLE_CAP = 160
const TRANSITION_DURATION_MS = 1200
const WINDUP_INTERVAL_MS = Math.max(45, Math.floor(200 / 2))
const WINDUP_TARGET_CLICKS = 6
const OUTGOING_DURATION_MS = 1000
const INVALID_PULSE_MS = 190
const MINIMAP_SIZE = 260
const MINI_CLICK_PULSE_MS = 320

const STAGE_DEFAULT_SIZE: StageSize = {
  width: 980,
  height: 560
}

const EMPTY_AGE_VALUES: AgeValues = {
  total: 0,
  under25: 0,
  under15: 0,
  under5: 0,
  age25_64: 0,
  age65plus: 0,
  age15_24: 0,
  age5_14: 0
}

const STEPPER_LABELS: ReadonlyArray<{ level: DetailLevel; label: string }> = [
  { level: 1, label: 'Overview (2000–2023 sum)' },
  { level: 2, label: 'Years' },
  { level: 3, label: 'Countries (Top 20)' },
  { level: 4, label: 'Age groups' },
  { level: 5, label: 'Under-25 details' }
]

const COUNTRY_COLORS = [
  '#2a5ca5',
  '#3d70b6',
  '#4f83c6',
  '#6096d5',
  '#72a8df',
  '#85b8e5',
  '#98c4e8',
  '#abcfea',
  '#bed8ea',
  '#9cb9dd',
  '#7ea0d2',
  '#638ac6',
  '#4f79bb',
  '#4169ae',
  '#325a9b',
  '#4a73a9',
  '#6289b8',
  '#7ca0c6',
  '#95b4d3',
  '#adc6de'
]

const AGE_COLORS: Record<'under25' | 'age25_64' | 'age65plus' | 'under5' | 'age5_14' | 'age15_24', string> = {
  under25: '#2464d9',
  age25_64: '#2f9a6c',
  age65plus: '#e09a2c',
  under5: '#2f63d1',
  age5_14: '#4c81df',
  age15_24: '#79a4f2'
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value))

const clampNonNegative = (value: number): number => (value > 0 ? value : 0)

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

const formatPopulation = (value: number): string => d3.format(',')(Math.round(value))

const formatPopulationShort = (value: number): string => {
  const absolute = Math.abs(value)
  if (absolute >= 1_000_000_000) return `${d3.format('.2f')(value / 1_000_000_000)}B`
  if (absolute >= 1_000_000) return `${d3.format('.1f')(value / 1_000_000)}M`
  if (absolute >= 1_000) return `${d3.format('.1f')(value / 1_000)}K`
  return d3.format(',.0f')(value)
}

const formatPercent = (value: number, parentTotal: number): string => {
  if (parentTotal <= 0) return '0%'
  return d3.format('.1%')(value / parentTotal)
}

const buildTreemapLayout = (
  nodes: TileMeta[],
  width: number,
  height: number,
  paddingInner: number,
  paddingOuter: number,
  sortByValue = true
): PositionedTile[] => {
  if (nodes.length === 0 || width <= 0 || height <= 0) return []

  const rootData: { children: TileMeta[] } = { children: nodes }
  const hierarchyRoot = d3
    .hierarchy<{ children?: TileMeta[] }>(rootData as { children?: TileMeta[] })
    .sum(node => {
      const value = (node as TileMeta).value
      return clampNonNegative(typeof value === 'number' ? value : 0)
    })

  if (sortByValue) {
    hierarchyRoot.sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
  }

  const treemapRoot = d3
    .treemap<{ children?: TileMeta[] }>()
    .size([width, height])
    .paddingInner(paddingInner)
    .paddingOuter(paddingOuter)
    .round(true)(hierarchyRoot)

  return treemapRoot.leaves().map((leaf, index) => {
    const datum = leaf.data as TileMeta
    return {
      ...datum,
      x: leaf.x0,
      y: leaf.y0,
      width: Math.max(0, leaf.x1 - leaf.x0),
      height: Math.max(0, leaf.y1 - leaf.y0),
      index
    }
  })
}

const getTileTitle = (tile: TileMeta): string => {
  if (tile.level === 1) return 'World total (2000–2023 sum)'
  if (tile.level === 2) return `Year ${tile.year ?? ''}`.trim()
  return tile.tooltipTitle
}

const getTileContextLines = (tile: TileMeta): string[] => {
  const lines = [`Population: ${formatPopulation(tile.value)}`]

  if (tile.level >= 2) {
    lines.push(`% of parent: ${formatPercent(tile.value, tile.parentTotal)}`)
  }

  if (tile.level >= 3 && tile.contextYear !== undefined) {
    lines.push(`Year: ${tile.contextYear}`)
  }

  if (tile.level >= 4) {
    lines.push(`Country: ${tile.contextCountry ?? '—'}`)
  }

  return lines
}

export default function AbstractBase({ juicy }: AbstractBaseProps) {
  const {
    loading,
    error,
    years,
    worldSum2000To2023,
    getWorldTotal,
    getCountry,
    getTopCountriesForYear
  } = usePopulationAgeData()

  const [level, setLevel] = useState<DetailLevel>(1)
  const [selectedYear, setSelectedYear] = useState(2023)
  const [selectedCountry, setSelectedCountry] = useState<CountrySelection | null>(null)
  const [hoveredTileId, setHoveredTileId] = useState<string | null>(null)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [stageSize, setStageSize] = useState<StageSize>(STAGE_DEFAULT_SIZE)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [isInvalidPulse, setIsInvalidPulse] = useState(false)
  const [transitionToken, setTransitionToken] = useState(0)
  const [stepperPulseToken, setStepperPulseToken] = useState(0)
  const [miniMapPulseToken, setMiniMapPulseToken] = useState(0)
  const [outgoingTiles, setOutgoingTiles] = useState<PositionedTile[]>([])
  const [particles, setParticles] = useState<ParticleState[]>([])
  const [hoveredMiniYear, setHoveredMiniYear] = useState<number | null>(null)
  const [miniYearTooltip, setMiniYearTooltip] = useState<{ year: number; x: number; y: number } | null>(
    null
  )
  const [miniClickPulse, setMiniClickPulse] = useState<{ year: number; token: number } | null>(null)

  const chartStageRef = useRef<HTMLDivElement | null>(null)
  const currentTilesRef = useRef<PositionedTile[]>([])
  const transitionTimeoutRef = useRef<number | null>(null)
  const outgoingTimeoutRef = useRef<number | null>(null)
  const invalidTimeoutRef = useRef<number | null>(null)
  const whooshTimestampRef = useRef(0)
  const particleTimeoutsRef = useRef<number[]>([])
  const windupIntervalRef = useRef<number | null>(null)
  const windupTimeoutRef = useRef<number | null>(null)
  const miniClickPulseTimeoutRef = useRef<number | null>(null)

  const juicyActive = juicy && !prefersReducedMotion

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setPrefersReducedMotion(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (!chartStageRef.current) return

    const stage = chartStageRef.current
    const observer = new ResizeObserver(entries => {
      const entry = entries[0]
      if (!entry) return

      const nextWidth = Math.max(280, Math.floor(entry.contentRect.width))
      const nextHeight = Math.max(240, Math.floor(entry.contentRect.height))

      setStageSize(previous => {
        if (previous.width === nextWidth && previous.height === nextHeight) return previous
        return { width: nextWidth, height: nextHeight }
      })
    })

    observer.observe(stage)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (years.length === 0) return
    if (years.includes(selectedYear)) return
    setSelectedYear(years[years.length - 1])
  }, [years, selectedYear])

  const selectedCountryRecord = useMemo(() => {
    if (!selectedCountry) return null

    return (
      getCountry(selectedYear, selectedCountry.code) ??
      getCountry(selectedYear, selectedCountry.entity)
    )
  }, [getCountry, selectedCountry, selectedYear])

  const selectedCountryName =
    selectedCountryRecord?.entity ?? selectedCountry?.entity ?? '—'

  const selectedCountryValues = selectedCountryRecord?.values ?? EMPTY_AGE_VALUES

  const yearColorScale = useMemo(() => {
    const maxIndex = Math.max(1, years.length - 1)
    return d3.scaleLinear<string>().domain([0, maxIndex]).range(['#dbe6f4', '#6b8fca'])
  }, [years.length])

  const levelTiles = useMemo<TileMeta[]>(() => {
    if (level === 1) {
      return [
        {
          id: '1:worldsum',
          label: 'World (2000–2023 sum)',
          value: worldSum2000To2023,
          fill: '#98b6e4',
          drillable: true,
          kind: 'world',
          level: 1,
          parentTotal: worldSum2000To2023,
          tooltipTitle: 'World total (2000–2023 sum)'
        }
      ]
    }

    if (level === 2) {
      const parentTotal = worldSum2000To2023
      return years.map((year, index) => ({
        id: `2:${year}`,
        label: String(year),
        value: getWorldTotal(year),
        fill: yearColorScale(index),
        drillable: true,
        kind: 'year',
        level: 2,
        parentTotal,
        tooltipTitle: String(year),
        year
      }))
    }

    if (level === 3) {
      const countryBundle = getTopCountriesForYear(selectedYear, 20)
      const parentTotal = countryBundle.worldTotal

      const countryTiles = countryBundle.top.map((country, index) => ({
        id: `3:${country.code || country.entity.toLowerCase().replace(/\s+/g, '-')}`,
        label: country.entity,
        value: country.values.total,
        fill: COUNTRY_COLORS[index % COUNTRY_COLORS.length],
        drillable: true,
        kind: 'country' as const,
        level: 3 as const,
        parentTotal,
        tooltipTitle: country.entity,
        country,
        contextYear: selectedYear
      }))

      return [
        ...countryTiles,
        {
          id: '3:other',
          label: 'Other countries',
          value: countryBundle.otherValue,
          fill: '#cfd5de',
          drillable: false,
          kind: 'other',
          level: 3,
          parentTotal,
          tooltipTitle: 'Other countries',
          contextYear: selectedYear
        }
      ]
    }

    if (level === 4) {
      const total =
        selectedCountryValues.total > 0
          ? selectedCountryValues.total
          : selectedCountryValues.under25 +
            selectedCountryValues.age25_64 +
            selectedCountryValues.age65plus

      return [
        {
          id: '4:under25',
          label: 'Under 25',
          value: selectedCountryValues.under25,
          fill: AGE_COLORS.under25,
          drillable: true,
          kind: 'under25',
          level: 4,
          parentTotal: total,
          tooltipTitle: 'Under 25',
          contextYear: selectedYear,
          contextCountry: selectedCountryName
        },
        {
          id: '4:ages25_64',
          label: 'Ages 25–64',
          value: selectedCountryValues.age25_64,
          fill: AGE_COLORS.age25_64,
          drillable: false,
          kind: 'age25_64',
          level: 4,
          parentTotal: total,
          tooltipTitle: 'Ages 25–64',
          contextYear: selectedYear,
          contextCountry: selectedCountryName
        },
        {
          id: '4:ages65plus',
          label: 'Ages 65+',
          value: selectedCountryValues.age65plus,
          fill: AGE_COLORS.age65plus,
          drillable: false,
          kind: 'age65plus',
          level: 4,
          parentTotal: total,
          tooltipTitle: 'Ages 65+',
          contextYear: selectedYear,
          contextCountry: selectedCountryName
        }
      ]
    }

    const under5 = selectedCountryValues.under5
    const age5_14 = clampNonNegative(selectedCountryValues.under15 - selectedCountryValues.under5)
    const age15_24 = clampNonNegative(selectedCountryValues.under25 - selectedCountryValues.under15)
    const parentTotal =
      selectedCountryValues.under25 > 0
        ? selectedCountryValues.under25
        : under5 + age5_14 + age15_24

    return [
      {
        id: '5:under5',
        label: 'Under 5s',
        value: under5,
        fill: AGE_COLORS.under5,
        drillable: false,
        kind: 'under5',
        level: 5,
        parentTotal,
        tooltipTitle: 'Under 5s',
        contextYear: selectedYear,
        contextCountry: selectedCountryName
      },
      {
        id: '5:age5_14',
        label: '5–14',
        value: age5_14,
        fill: AGE_COLORS.age5_14,
        drillable: false,
        kind: 'age5_14',
        level: 5,
        parentTotal,
        tooltipTitle: '5–14',
        contextYear: selectedYear,
        contextCountry: selectedCountryName
      },
      {
        id: '5:age15_24',
        label: '15–24',
        value: age15_24,
        fill: AGE_COLORS.age15_24,
        drillable: false,
        kind: 'age15_24',
        level: 5,
        parentTotal,
        tooltipTitle: '15–24',
        contextYear: selectedYear,
        contextCountry: selectedCountryName
      }
    ]
  }, [
    getTopCountriesForYear,
    getWorldTotal,
    level,
    selectedCountryName,
    selectedCountryValues.age25_64,
    selectedCountryValues.age65plus,
    selectedCountryValues.total,
    selectedCountryValues.under15,
    selectedCountryValues.under25,
    selectedCountryValues.under5,
    selectedYear,
    worldSum2000To2023,
    yearColorScale,
    years
  ])

  const mainTiles = useMemo(
    () =>
      buildTreemapLayout(
        levelTiles,
        stageSize.width,
        stageSize.height,
        level === 1 ? 0 : 2,
        level === 1 ? 0 : 2,
        level !== 2
      ),
    [level, levelTiles, stageSize.height, stageSize.width]
  )

  useEffect(() => {
    currentTilesRef.current = mainTiles
  }, [mainTiles])

  const getStagePoint = useCallback((clientX: number, clientY: number) => {
    const stage = chartStageRef.current
    if (!stage) return null

    const rect = stage.getBoundingClientRect()
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    }
  }, [])

  const emitParticles = useCallback(
    (
      clientX: number,
      clientY: number,
      count: number,
      minSize: number,
      maxSize: number,
      palette: string[]
    ) => {
      if (!juicyActive) return

      const point = getStagePoint(clientX, clientY)
      if (!point) return

      const now = performance.now()
      const safeCount = clamp(Math.round(count), 1, 24)
      const created: ParticleState[] = Array.from({ length: safeCount }, (_, index) => {
        const angle = (Math.PI * 2 * index) / safeCount + Math.random() * 0.6
        const distance = 24 + Math.random() * 42
        const lifeMs = 500 + Math.random() * 400

        return {
          id: now + index + Math.random(),
          x: point.x,
          y: point.y,
          dx: Math.cos(angle) * distance,
          dy: Math.sin(angle) * distance - 12,
          size: minSize + Math.random() * Math.max(0, maxSize - minSize),
          color: palette[Math.floor(Math.random() * palette.length)],
          lifeMs
        }
      })

      const ids = new Set(created.map(particle => particle.id))
      const maxLifeMs = Math.max(...created.map(particle => particle.lifeMs))

      setParticles(previous => [...previous, ...created].slice(-PARTICLE_CAP))

      const timeout = window.setTimeout(() => {
        setParticles(previous => previous.filter(particle => !ids.has(particle.id)))
        particleTimeoutsRef.current = particleTimeoutsRef.current.filter(item => item !== timeout)
      }, maxLifeMs + 80)

      particleTimeoutsRef.current.push(timeout)
    },
    [getStagePoint, juicyActive]
  )

  const stopWindupClicks = useCallback(() => {
    if (windupIntervalRef.current !== null) {
      window.clearInterval(windupIntervalRef.current)
      windupIntervalRef.current = null
    }
    if (windupTimeoutRef.current !== null) {
      window.clearTimeout(windupTimeoutRef.current)
      windupTimeoutRef.current = null
    }
  }, [])

  const playWindupClicks = useCallback(
    (durationMs = TRANSITION_DURATION_MS, intervalMs = WINDUP_INTERVAL_MS) => {
      if (!juicyActive) return
      stopWindupClicks()
      const stopAtMs = Math.max(0, durationMs - 50)
      let clicksPlayed = 0

      playWindupClickSound()
      clicksPlayed += 1

      if (clicksPlayed < WINDUP_TARGET_CLICKS) {
        windupIntervalRef.current = window.setInterval(() => {
          if (clicksPlayed >= WINDUP_TARGET_CLICKS) {
            if (windupIntervalRef.current !== null) {
              window.clearInterval(windupIntervalRef.current)
              windupIntervalRef.current = null
            }
            return
          }

          playWindupClickSound()
          clicksPlayed += 1

          if (clicksPlayed >= WINDUP_TARGET_CLICKS && windupIntervalRef.current !== null) {
            window.clearInterval(windupIntervalRef.current)
            windupIntervalRef.current = null
          }
        }, intervalMs)
      }

      windupTimeoutRef.current = window.setTimeout(() => {
        stopWindupClicks()
      }, stopAtMs)
    },
    [juicyActive, stopWindupClicks]
  )

  const playJuicyWhoosh = useCallback(() => {
    if (!juicyActive) return

    const now = performance.now()
    if (now - whooshTimestampRef.current < 180) return
    whooshTimestampRef.current = now

    playWhooshSound()
  }, [juicyActive])

  const triggerTransitionFx = useCallback(
    (isDrillIn: boolean, clientX: number, clientY: number) => {
      // Bug analysis: non-juicy previously toggled transition state/timers,
      // which blocked right-click via transition guards. Keep all FX fully juicy-only.
      if (!juicyActive) return

      setIsTransitioning(true)
      setTransitionToken(previous => previous + 1)
      setStepperPulseToken(previous => previous + 1)
      setMiniMapPulseToken(previous => previous + 1)

      clearTimeoutRef(transitionTimeoutRef)
      transitionTimeoutRef.current = window.setTimeout(() => {
        stopWindupClicks()
        setIsTransitioning(false)
        transitionTimeoutRef.current = null
      }, TRANSITION_DURATION_MS)

      setOutgoingTiles(currentTilesRef.current.map(tile => ({ ...tile })))
      clearTimeoutRef(outgoingTimeoutRef)
      outgoingTimeoutRef.current = window.setTimeout(() => {
        setOutgoingTiles([])
        outgoingTimeoutRef.current = null
      }, OUTGOING_DURATION_MS)

      playWindupClicks(TRANSITION_DURATION_MS, WINDUP_INTERVAL_MS)

      if (isDrillIn) {
        emitParticles(clientX, clientY, 16, 12, 16, ['#ff9f84', '#ffd8cc', '#ff7a59', '#ffffff'])
      }

      playJuicyWhoosh()
    },
    [emitParticles, juicyActive, playJuicyWhoosh, playWindupClicks, stopWindupClicks]
  )

  const triggerInvalidFeedback = useCallback(
    (clientX?: number, clientY?: number) => {
      if (juicyActive) {
        playDingdong3Sound()
      }
      setIsInvalidPulse(true)

      clearTimeoutRef(invalidTimeoutRef)
      invalidTimeoutRef.current = window.setTimeout(() => {
        setIsInvalidPulse(false)
        invalidTimeoutRef.current = null
      }, INVALID_PULSE_MS)

      if (!juicyActive) return

      if (clientX !== undefined && clientY !== undefined) {
        emitParticles(clientX, clientY, 8, 10, 12, ['#ffc5b2', '#ff9a80', '#ffd3c0'])
        return
      }

      const stage = chartStageRef.current
      if (!stage) return
      const rect = stage.getBoundingClientRect()
      emitParticles(rect.left + rect.width / 2, rect.top + rect.height / 2, 8, 10, 12, [
        '#ffc5b2',
        '#ff9a80',
        '#ffd3c0'
      ])
    },
    [emitParticles, juicyActive]
  )

  const finishStep = useCallback(
    (nextLevel: DetailLevel, isDrillIn: boolean, clientX: number, clientY: number) => {
      if (juicyActive) {
        playDingdong1Sound()
      }
      triggerTransitionFx(isDrillIn, clientX, clientY)

      setLevel(nextLevel)
      setHoveredTileId(null)
      setTooltip(null)
    },
    [juicyActive, triggerTransitionFx]
  )

  const attemptDrillIn = useCallback(
    (tile: TileMeta, clientX: number, clientY: number): boolean => {
      // Bug analysis: transition lock should apply only in juicy mode.
      if (juicyActive && isTransitioning) return false
      if (!tile.drillable) {
        triggerInvalidFeedback(clientX, clientY)
        return false
      }

      if (level === 1 && tile.kind === 'world') {
        finishStep(2, true, clientX, clientY)
        return true
      }

      if (level === 2 && tile.kind === 'year' && tile.year !== undefined) {
        setSelectedYear(tile.year)
        finishStep(3, true, clientX, clientY)
        return true
      }

      if (level === 3 && tile.kind === 'country' && tile.country) {
        setSelectedCountry({
          entity: tile.country.entity,
          code: tile.country.code
        })
        finishStep(4, true, clientX, clientY)
        return true
      }

      if (level === 4 && tile.kind === 'under25') {
        finishStep(5, true, clientX, clientY)
        return true
      }

      triggerInvalidFeedback(clientX, clientY)
      return false
    },
    [finishStep, isTransitioning, juicyActive, level, triggerInvalidFeedback]
  )

  const attemptDrillOut = useCallback(
    (clientX: number, clientY: number): boolean => {
      // Bug analysis: keep non-juicy drill-out immediate by skipping transition guard there.
      if (juicyActive && isTransitioning) return false
      if (level === 1) {
        triggerInvalidFeedback(clientX, clientY)
        return false
      }

      const nextLevel = (level - 1) as DetailLevel
      finishStep(nextLevel, false, clientX, clientY)
      return true
    },
    [finishStep, isTransitioning, juicyActive, level, triggerInvalidFeedback]
  )

  const selectedYearTotal = useMemo(() => getWorldTotal(selectedYear), [getWorldTotal, selectedYear])

  const stepperItems = useMemo<StepperItem[]>(
    () =>
      STEPPER_LABELS.map(step => {
        if (step.level === 2) {
          return {
            ...step,
            context: level >= 3 ? String(selectedYear) : ''
          }
        }

        if (step.level === 3 || step.level === 4) {
          return {
            ...step,
            context: level >= 4 ? selectedCountryName : ''
          }
        }

        if (step.level === 5) {
          return {
            ...step,
            context: level === 5 ? 'Under-25' : ''
          }
        }

        return {
          ...step,
          context: ''
        }
      }),
    [level, selectedCountryName, selectedYear]
  )

  const miniBaseTiles = useMemo(() => {
    const baseColor = d3
      .scaleLinear<string>()
      .domain([0, Math.max(1, years.length - 1)])
      .range(['#e5e7eb', '#9ca3af'])

    const nodes: TileMeta[] = years.map((year, index) => ({
      id: `mini:year:${year}`,
      label: String(year),
      value: getWorldTotal(year),
      fill: baseColor(index),
      drillable: false,
      kind: 'year',
      level: 2,
      parentTotal: worldSum2000To2023,
      tooltipTitle: String(year),
      year
    }))

    return buildTreemapLayout(nodes, MINIMAP_SIZE, MINIMAP_SIZE, 1, 1, false)
  }, [getWorldTotal, worldSum2000To2023, years])

  const selectedMiniYearTile = useMemo(
    () => miniBaseTiles.find(tile => tile.year === selectedYear) ?? null,
    [miniBaseTiles, selectedYear]
  )

  const miniNestedCountryTiles = useMemo(() => {
    if (level < 3 || !selectedMiniYearTile) return [] as PositionedTile[]

    const bundle = getTopCountriesForYear(selectedYear, 20)
    const nestedWidth = Math.max(8, selectedMiniYearTile.width - 6)
    const nestedHeight = Math.max(8, selectedMiniYearTile.height - 6)

    const nodes: TileMeta[] = [
      ...bundle.top.map(country => ({
        id: `mini:country:${country.code || country.entity.toLowerCase().replace(/\s+/g, '-')}`,
        label: country.entity,
        value: country.values.total,
        fill: '#9aa3b2',
        drillable: false,
        kind: 'country' as const,
        level: 3 as const,
        parentTotal: bundle.worldTotal,
        tooltipTitle: country.entity,
        country
      })),
      {
        id: 'mini:country:other',
        label: 'Other countries',
        value: bundle.otherValue,
        fill: '#c7ccd4',
        drillable: false,
        kind: 'other',
        level: 3,
        parentTotal: bundle.worldTotal,
        tooltipTitle: 'Other countries'
      }
    ]

    const nested = buildTreemapLayout(nodes, nestedWidth, nestedHeight, 1, 1)

    return nested.map(tile => ({
      ...tile,
      x: selectedMiniYearTile.x + 3 + tile.x,
      y: selectedMiniYearTile.y + 3 + tile.y
    }))
  }, [getTopCountriesForYear, level, selectedMiniYearTile, selectedYear])

  const selectedMiniCountryTile = useMemo(() => {
    if (level < 4 || !selectedCountry) return null

    return (
      miniNestedCountryTiles.find(
        tile => tile.kind === 'country' && tile.country?.code === selectedCountry.code
      ) ??
      miniNestedCountryTiles.find(
        tile => tile.kind === 'country' && tile.country?.entity === selectedCountry.entity
      ) ??
      null
    )
  }, [level, miniNestedCountryTiles, selectedCountry])

  const hoveredMiniYearTile = useMemo(() => {
    if (hoveredMiniYear === null) return null
    return miniBaseTiles.find(tile => tile.year === hoveredMiniYear) ?? null
  }, [hoveredMiniYear, miniBaseTiles])

  const miniClickPulseTile = useMemo(() => {
    if (!miniClickPulse) return null
    return miniBaseTiles.find(tile => tile.year === miniClickPulse.year) ?? null
  }, [miniBaseTiles, miniClickPulse])

  const clearMiniYearHover = useCallback(() => {
    setHoveredMiniYear(null)
    setMiniYearTooltip(null)
  }, [])

  const triggerMiniClickPulse = useCallback((year: number) => {
    clearTimeoutRef(miniClickPulseTimeoutRef)
    setMiniClickPulse(previous => ({
      year,
      token: (previous?.token ?? 0) + 1
    }))
    miniClickPulseTimeoutRef.current = window.setTimeout(() => {
      setMiniClickPulse(null)
      miniClickPulseTimeoutRef.current = null
    }, MINI_CLICK_PULSE_MS)
  }, [])

  const jumpToYear = useCallback(
    (year: number, clientX: number, clientY: number): boolean => {
      if (year === selectedYear) return false
      if (juicyActive && isTransitioning) return false

      setSelectedYear(year)
      setLevel(3)
      setSelectedCountry(null)
      setHoveredTileId(null)
      setTooltip(null)
      clearMiniYearHover()

      if (juicyActive) {
        playDingdong1Sound()
        triggerTransitionFx(false, clientX, clientY)
      }

      return true
    },
    [clearMiniYearHover, isTransitioning, juicyActive, selectedYear, triggerTransitionFx]
  )

  const handleMiniYearMouseEnter = useCallback(
    (tile: PositionedTile) => {
      if (tile.year === undefined || tile.year === selectedYear) return

      setHoveredMiniYear(tile.year)
      setMiniYearTooltip({
        year: tile.year,
        x: clamp(tile.x + tile.width / 2, 16, MINIMAP_SIZE - 16),
        y: Math.max(16, tile.y)
      })

      if (juicyActive) {
        playPreviewCueSound()
      }
    },
    [juicyActive, selectedYear]
  )

  const handleMiniYearMouseLeave = useCallback(
    (tile: PositionedTile) => {
      if (tile.year === undefined) return
      if (hoveredMiniYear === tile.year) {
        clearMiniYearHover()
      }
    },
    [clearMiniYearHover, hoveredMiniYear]
  )

  const handleMiniYearClick = useCallback(
    (event: ReactMouseEvent<SVGRectElement, MouseEvent>, tile: PositionedTile) => {
      event.stopPropagation()
      if (tile.year === undefined) return

      const jumped = jumpToYear(tile.year, event.clientX, event.clientY)
      if (jumped && juicyActive) {
        triggerMiniClickPulse(tile.year)
      }
    },
    [juicyActive, jumpToYear, triggerMiniClickPulse]
  )

  useEffect(() => {
    if (hoveredMiniYear === null) return
    if (hoveredMiniYear !== selectedYear) return
    clearMiniYearHover()
  }, [clearMiniYearHover, hoveredMiniYear, selectedYear])

  const buildTooltipForTile = useCallback(
    (tile: PositionedTile, clientX: number, clientY: number) => {
      const point = getStagePoint(clientX, clientY)
      if (!point) return

      setTooltip({
        x: point.x,
        y: point.y,
        title: getTileTitle(tile),
        lines: getTileContextLines(tile)
      })
    },
    [getStagePoint]
  )

  const handleTileMouseEnter = (tile: PositionedTile) => {
    setHoveredTileId(tile.id)
  }

  const handleTileMouseLeave = (tile: PositionedTile) => {
    setHoveredTileId(current => (current === tile.id ? null : current))
    setTooltip(current => (current?.title === getTileTitle(tile) ? null : current))
  }

  const handleTileClick = (
    event: ReactMouseEvent<SVGGElement | SVGRectElement, MouseEvent>,
    tile: PositionedTile
  ) => {
    event.stopPropagation()
    attemptDrillIn(tile, event.clientX, event.clientY)
  }

  const handleContextMenu = (event: ReactMouseEvent<Element>) => {
    event.preventDefault()
    attemptDrillOut(event.clientX, event.clientY)
  }

  const handleTileContextMenu = (event: ReactMouseEvent<SVGGElement, MouseEvent>) => {
    event.preventDefault()
    event.stopPropagation()
    attemptDrillOut(event.clientX, event.clientY)
  }

  const hideHoverAndTooltip = () => {
    setHoveredTileId(null)
    setTooltip(null)
  }

  const renderMainTreemap = () => (
    <svg
      className="abstract-main-svg"
      width={stageSize.width}
      height={stageSize.height}
      viewBox={`0 0 ${stageSize.width} ${stageSize.height}`}
      role="img"
      aria-label="Population treemap"
    >
      {juicyActive && outgoingTiles.length > 0 && (
        <g className="abstract-outgoing-layer" key={`outgoing-${transitionToken}`}>
          {outgoingTiles.map(tile => (
            <g key={`out-${tile.id}`} transform={`translate(${tile.x}, ${tile.y})`}>
              <g className="abstract-outgoing-tile-inner">
                <rect
                  className="abstract-outgoing-tile-rect"
                  x={0}
                  y={0}
                  width={tile.width}
                  height={tile.height}
                  fill={tile.fill}
                />
              </g>
            </g>
          ))}
        </g>
      )}

      <g className="abstract-current-layer" key={`current-${level}-${transitionToken}`}>
        {mainTiles.map(tile => {
          const isHovered = hoveredTileId === tile.id
          const showLabel = tile.width * tile.height > LABEL_AREA_THRESHOLD

          const tileClass = [
            'abstract-main-tile',
            tile.drillable ? 'is-drillable' : 'is-non-drillable',
            level === 2 && tile.kind === 'year' && tile.year === selectedYear ? 'is-selected' : '',
            isHovered ? 'is-hovered' : ''
          ]
            .filter(Boolean)
            .join(' ')

          return (
            <g key={tile.id} transform={`translate(${tile.x}, ${tile.y})`}>
              <g
                className="abstract-main-tile-wrap"
                style={{ '--tile-delay': `${Math.min(tile.index * 12, 220)}ms` } as CSSProperties}
                onMouseEnter={() => handleTileMouseEnter(tile)}
                onMouseMove={event => buildTooltipForTile(tile, event.clientX, event.clientY)}
                onMouseLeave={() => handleTileMouseLeave(tile)}
                onClick={event => handleTileClick(event, tile)}
                onContextMenu={handleTileContextMenu}
              >
                <rect
                  className={tileClass}
                  width={tile.width}
                  height={tile.height}
                  fill={tile.fill}
                />

                {showLabel && (
                  <g className="abstract-main-label">
                    <text x={10} y={20} className="abstract-main-label-title">
                      {tile.label}
                    </text>
                    <text x={10} y={38} className="abstract-main-label-value">
                      {formatPopulationShort(tile.value)}
                    </text>
                  </g>
                )}

                {level === 1 && tile.kind === 'world' && (
                  <text
                    x={tile.width / 2}
                    y={tile.height / 2}
                    textAnchor="middle"
                    className={[
                      'abstract-level1-instruction',
                      juicyActive ? 'is-juicy' : ''
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    Click me to start exploring population details
                  </text>
                )}
              </g>
            </g>
          )
        })}
      </g>
    </svg>
  )

  useEffect(() => {
    return () => {
      clearTimeoutRef(transitionTimeoutRef)
      clearTimeoutRef(outgoingTimeoutRef)
      clearTimeoutRef(invalidTimeoutRef)
      clearTimeoutRef(miniClickPulseTimeoutRef)
      clearTimeoutList(particleTimeoutsRef.current)
      stopWindupClicks()
    }
  }, [stopWindupClicks])

  return (
    <div className={`abstract-shell ${juicy ? 'abstract-shell-juicy' : 'abstract-shell-base'}`}>
      <div className="abstract-layout">
        <div className="abstract-main-column">
          <header className="abstract-main-header">
            <h2>Population Treemap Drill</h2>
            <p>Left click to drill in. Right click to drill out.</p>
            <div className="abstract-main-context">
              <span>Level {level}/5</span>
              <span>World ({selectedYear}): {formatPopulationShort(selectedYearTotal)}</span>
            </div>
          </header>

          <div
            ref={chartStageRef}
            className={[
              'abstract-chart-stage',
              juicyActive ? 'is-juicy' : '',
              isTransitioning ? 'is-transitioning' : '',
              isInvalidPulse ? 'is-invalid' : ''
            ]
              .filter(Boolean)
              .join(' ')}
            onContextMenu={handleContextMenu}
            onMouseLeave={hideHoverAndTooltip}
          >
            {loading && <div className="abstract-stage-status">Loading population data...</div>}
            {error && !loading && (
              <div className="abstract-stage-status is-error">Error loading data: {error}</div>
            )}
            {!loading && !error && renderMainTreemap()}

            {juicyActive && (
              <>
                <div className={`abstract-vignette ${isTransitioning ? 'is-on' : ''}`} />
                <div className={`abstract-stage-blur ${isTransitioning ? 'is-on' : ''}`} />
                <div className={`abstract-stage-frame ${isTransitioning ? 'is-on' : ''}`} />
              </>
            )}

            {particles.length > 0 && (
              <div className="abstract-particles-layer" aria-hidden="true">
                {particles.map(particle => (
                  <span
                    key={particle.id}
                    className="abstract-particle"
                    style={
                      {
                        left: `${particle.x}px`,
                        top: `${particle.y}px`,
                        width: `${particle.size}px`,
                        height: `${particle.size}px`,
                        '--particle-dx': `${particle.dx}px`,
                        '--particle-dy': `${particle.dy}px`,
                        '--particle-color': particle.color,
                        '--particle-life': `${particle.lifeMs}ms`
                      } as CSSProperties
                    }
                  />
                ))}
              </div>
            )}

            {tooltip && (
              <div className="abstract-tooltip" style={{ left: tooltip.x + 14, top: tooltip.y - 14 }}>
                <div className="abstract-tooltip-title">{tooltip.title}</div>
                {tooltip.lines.map(line => (
                  <div key={line} className="abstract-tooltip-line">
                    {line}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <aside className="abstract-sidebar">
          <section className="abstract-panel-section">
            <h3>Progress</h3>
            <div className="abstract-stepper" aria-hidden="true">
              {stepperItems.map(step => {
                const isActive = step.level === level
                const isCompleted = step.level < level
                const isFuture = step.level > level

                return (
                  <div
                    key={`step-${step.level}`}
                    className={[
                      'abstract-step-row',
                      isActive ? 'is-active' : '',
                      isCompleted ? 'is-completed' : '',
                      isFuture ? 'is-future' : ''
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <span
                      key={`step-node-${step.level}-${isActive ? stepperPulseToken : 0}`}
                      className={[
                        'abstract-step-node',
                        isActive ? 'is-active' : '',
                        isCompleted ? 'is-completed' : '',
                        juicyActive && isActive ? 'is-pop' : ''
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    />
                    <span className="abstract-step-label">{step.label}</span>
                    <span className="abstract-step-context">{step.context}</span>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="abstract-panel-section">
            <h3>Context</h3>
            <div className="abstract-chip-row">
              <div className="abstract-chip">Year: {level >= 3 ? selectedYear : '—'}</div>
              <div className="abstract-chip">Country: {level >= 4 ? selectedCountryName : '—'}</div>
            </div>
          </section>

          <section className="abstract-panel-section">
            <h3>Navigation</h3>
            <div className="abstract-minimap-wrap">
              <div className="abstract-minimap-frame" onMouseLeave={clearMiniYearHover}>
                <svg
                  className="abstract-minimap-svg"
                  width={MINIMAP_SIZE}
                  height={MINIMAP_SIZE}
                  viewBox={`0 0 ${MINIMAP_SIZE} ${MINIMAP_SIZE}`}
                  aria-hidden="true"
                >
                  {miniBaseTiles.map(tile => {
                    const faded = level >= 3 && tile.year !== selectedYear
                    const isCurrentYearTile = tile.year === selectedYear
                    const isClickableYearTile = tile.year !== undefined && !isCurrentYearTile
                    return (
                      <g key={tile.id}>
                        <rect
                          x={tile.x}
                          y={tile.y}
                          width={tile.width}
                          height={tile.height}
                          rx={2}
                          fill={tile.fill}
                          opacity={faded ? 0.18 : 0.84}
                        />
                        <rect
                          className={[
                            'abstract-minimap-year-hit',
                            isClickableYearTile ? 'is-clickable' : 'is-current'
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          x={tile.x}
                          y={tile.y}
                          width={tile.width}
                          height={tile.height}
                          rx={2}
                          onMouseEnter={isClickableYearTile ? () => handleMiniYearMouseEnter(tile) : undefined}
                          onMouseLeave={isClickableYearTile ? () => handleMiniYearMouseLeave(tile) : undefined}
                          onClick={isClickableYearTile ? event => handleMiniYearClick(event, tile) : undefined}
                        />
                      </g>
                    )
                  })}

                  {level === 2 && (
                    <rect
                      key={`mini-level2-outline-${miniMapPulseToken}`}
                      className={[
                        'abstract-minimap-outline',
                        juicyActive ? 'is-animated' : ''
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      x={1}
                      y={1}
                      width={MINIMAP_SIZE - 2}
                      height={MINIMAP_SIZE - 2}
                      rx={12}
                    />
                  )}

                  {level >= 3 && selectedMiniYearTile && (
                    <>
                      <rect
                        key={`mini-year-outline-${miniMapPulseToken}`}
                        className={[
                          'abstract-minimap-outline',
                          juicyActive ? 'is-animated' : ''
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        x={selectedMiniYearTile.x + 1}
                        y={selectedMiniYearTile.y + 1}
                        width={Math.max(0, selectedMiniYearTile.width - 2)}
                        height={Math.max(0, selectedMiniYearTile.height - 2)}
                        rx={4}
                      />

                      {miniNestedCountryTiles.map(tile => {
                        const dimCountry =
                          level >= 4 && selectedMiniCountryTile ? tile.id !== selectedMiniCountryTile.id : false

                        return (
                          <rect
                            key={tile.id}
                            x={tile.x}
                            y={tile.y}
                            width={tile.width}
                            height={tile.height}
                            fill="#7b8798"
                            opacity={dimCountry ? 0.18 : 0.72}
                          />
                        )
                      })}
                    </>
                  )}

                  {level >= 4 && selectedMiniCountryTile && (
                    <>
                      <rect
                        key={`mini-country-outline-${miniMapPulseToken}`}
                        className={[
                          'abstract-minimap-outline',
                          juicyActive ? 'is-animated' : ''
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        x={selectedMiniCountryTile.x + 1}
                        y={selectedMiniCountryTile.y + 1}
                        width={Math.max(0, selectedMiniCountryTile.width - 2)}
                        height={Math.max(0, selectedMiniCountryTile.height - 2)}
                        rx={3}
                      />

                      <circle
                        className="abstract-minimap-age-dot"
                        cx={selectedMiniCountryTile.x + selectedMiniCountryTile.width - 5}
                        cy={selectedMiniCountryTile.y + 5}
                        r={2.5}
                      />
                    </>
                  )}

                  {level === 5 && selectedMiniCountryTile && (
                    <g
                      className="abstract-minimap-under25-badge"
                      transform={`translate(${selectedMiniCountryTile.x + 3}, ${selectedMiniCountryTile.y + 3})`}
                    >
                      <rect width="44" height="14" rx="7" />
                      <text x="22" y="10" textAnchor="middle">
                        Under-25
                      </text>
                    </g>
                  )}

                  {hoveredMiniYearTile && (
                    <rect
                      className="abstract-minimap-year-hover-outline"
                      x={hoveredMiniYearTile.x + 1}
                      y={hoveredMiniYearTile.y + 1}
                      width={Math.max(0, hoveredMiniYearTile.width - 2)}
                      height={Math.max(0, hoveredMiniYearTile.height - 2)}
                      rx={4}
                    />
                  )}

                  {juicyActive && miniClickPulse && miniClickPulseTile && (
                    <rect
                      key={`mini-click-pulse-${miniClickPulse.token}`}
                      className="abstract-minimap-click-pulse"
                      x={miniClickPulseTile.x + 1}
                      y={miniClickPulseTile.y + 1}
                      width={Math.max(0, miniClickPulseTile.width - 2)}
                      height={Math.max(0, miniClickPulseTile.height - 2)}
                      rx={4}
                    />
                  )}
                </svg>
                {miniYearTooltip && (
                  <div className="abstract-minimap-tooltip" style={{ left: miniYearTooltip.x, top: miniYearTooltip.y }}>
                    {miniYearTooltip.year}
                  </div>
                )}
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}

