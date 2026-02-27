export type IntensityPreset = {
  animMul: number
  vfxMul: number
  timeMul: number
  audioMul: number
  glowA: number
  flashA: number
  outlineA: number
  overshoot: number
  blinkMin: number
  blinkMax: number
  previewA: number
  reconfigFrameA: number
  reconfigBounce: number
  filterHiOp: number
  filterDimOp: number
  selectHiOp: number
  selectBaseOp: number
  bridgeA: number
  bridgeFlow: number
  crosshairA: number
  scanA: number
  scanW: number
  sliderHandleA: number
  sliderHandleW: number
}

export const INTENSITY_PRESETS: Record<number, IntensityPreset> = {
  0: {
    animMul: 0.0,
    vfxMul: 0.0,
    timeMul: 0.0,
    audioMul: 0.0,
    glowA: 0.0,
    flashA: 0.0,
    outlineA: 0.0,
    overshoot: 0.0,
    blinkMin: 0.0,
    blinkMax: 0.0,
    previewA: 0.0,
    reconfigFrameA: 0.0,
    reconfigBounce: 0.0,
    filterHiOp: 0.0,
    filterDimOp: 0.0,
    selectHiOp: 0.0,
    selectBaseOp: 0.0,
    bridgeA: 0.0,
    bridgeFlow: 0.0,
    crosshairA: 0.0,
    scanA: 0.0,
    scanW: 0.0,
    sliderHandleA: 0.0,
    sliderHandleW: 0.0
  },
  1: {
    animMul: 0.25,
    vfxMul: 0.18,
    timeMul: 0.45,
    audioMul: 0.35,
    glowA: 0.18,
    flashA: 0.16,
    outlineA: 0.55,
    overshoot: 0.14,
    blinkMin: 0.3,
    blinkMax: 0.62,
    previewA: 0.55,
    reconfigFrameA: 0.14,
    reconfigBounce: 0.12,
    filterHiOp: 0.62,
    filterDimOp: 0.48,
    selectHiOp: 0.68,
    selectBaseOp: 0.6,
    bridgeA: 0.16,
    bridgeFlow: 3.0,
    crosshairA: 0.22,
    scanA: 0.08,
    scanW: 0.55,
    sliderHandleA: 0.22,
    sliderHandleW: 0.7
  },
  2: {
    animMul: 1.0,
    vfxMul: 1.0,
    timeMul: 1.0,
    audioMul: 1.0,
    glowA: 1.0,
    flashA: 0.85,
    outlineA: 1.0,
    overshoot: 1.0,
    blinkMin: 0.35,
    blinkMax: 1.0,
    previewA: 1.0,
    reconfigFrameA: 0.85,
    reconfigBounce: 0.95,
    filterHiOp: 0.95,
    filterDimOp: 0.25,
    selectHiOp: 0.84,
    selectBaseOp: 0.46,
    bridgeA: 0.65,
    bridgeFlow: 1.0,
    crosshairA: 0.7,
    scanA: 0.8,
    scanW: 1.0,
    sliderHandleA: 0.55,
    sliderHandleW: 1.0
  },
  3: {
    animMul: 1.9,
    vfxMul: 2.6,
    timeMul: 1.55,
    audioMul: 1.35,
    glowA: 2.0,
    flashA: 1.85,
    outlineA: 2.0,
    overshoot: 2.2,
    blinkMin: 0.05,
    blinkMax: 1.0,
    previewA: 1.55,
    reconfigFrameA: 1.15,
    reconfigBounce: 2.2,
    filterHiOp: 1.0,
    filterDimOp: 0.12,
    selectHiOp: 0.95,
    selectBaseOp: 0.3,
    bridgeA: 0.95,
    bridgeFlow: 0.55,
    crosshairA: 1.0,
    scanA: 1.15,
    scanW: 1.35,
    sliderHandleA: 0.92,
    sliderHandleW: 1.6
  }
}

export function getPreset(level: number): IntensityPreset {
  return INTENSITY_PRESETS[level] ?? INTENSITY_PRESETS[2]
}
