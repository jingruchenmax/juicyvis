import IntegratedIntensityBase from './integratedIntensity/IntegratedIntensityBase'
import { getPreset } from './integratedIntensity/intensityPresets'
import './Integrated.css'
import './IntegratedJuicy.css'
import './IntegratedIntensityJuicy.css'

interface IntegratedIntensityProps {
  intensityLevel: number
}

export default function IntegratedIntensity({ intensityLevel }: IntegratedIntensityProps) {
  const preset = getPreset(intensityLevel)
  const className = intensityLevel === 0
    ? 'integrated-shell integrated-intensity-shell intensity-0'
    : `integrated-shell integrated-intensity-shell intensity-${intensityLevel} pre-on in-on post-on`

  return (
    <div
      className={className}
      style={{
        ['--ji-anim' as string]: preset.animMul,
        ['--ji-vfx' as string]: preset.vfxMul,
        ['--ji-time' as string]: preset.timeMul,
        ['--ji-audio' as string]: preset.audioMul,
        ['--ji-glowA' as string]: preset.glowA,
        ['--ji-flashA' as string]: preset.flashA,
        ['--ji-outlineA' as string]: preset.outlineA,
        ['--ji-overshoot' as string]: preset.overshoot,
        ['--ji-blink-min' as string]: preset.blinkMin,
        ['--ji-blink-max' as string]: preset.blinkMax,
        ['--ji-previewA' as string]: preset.previewA,
        ['--ji-reconfigFrameA' as string]: preset.reconfigFrameA,
        ['--ji-reconfigBounce' as string]: preset.reconfigBounce,
        ['--ji-filterHiOp' as string]: preset.filterHiOp,
        ['--ji-filterDimOp' as string]: preset.filterDimOp,
        ['--ji-selectHiOp' as string]: preset.selectHiOp,
        ['--ji-selectBaseOp' as string]: preset.selectBaseOp,
        ['--ji-bridgeA' as string]: preset.bridgeA,
        ['--ji-bridgeFlow' as string]: preset.bridgeFlow,
        ['--ji-crosshairA' as string]: preset.crosshairA,
        ['--ji-scanA' as string]: preset.scanA,
        ['--ji-scanW' as string]: preset.scanW,
        ['--ji-sliderHandleA' as string]: preset.sliderHandleA,
        ['--ji-sliderHandleW' as string]: preset.sliderHandleW
      }}
    >
      <IntegratedIntensityBase intensityLevel={intensityLevel} />
    </div>
  )
}
