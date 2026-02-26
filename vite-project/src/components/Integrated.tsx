import IntegratedBase from './integrated/IntegratedBase'
import './Integrated.css'
import './IntegratedJuicy.css'

interface IntegratedProps {
  juicyLevel: number
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

export default function Integrated({ juicyLevel }: IntegratedProps) {
  const { preOn, inOn, postOn } = getJuicyCaps(juicyLevel)

  return (
    <div
      className={`integrated-shell juicy-${juicyLevel} ${preOn ? 'pre-on' : ''} ${inOn ? 'in-on' : ''} ${postOn ? 'post-on' : ''}`.trim()}
    >
      <IntegratedBase juicyLevel={juicyLevel} />
    </div>
  )
}
