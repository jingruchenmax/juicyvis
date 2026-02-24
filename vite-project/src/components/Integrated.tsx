import IntegratedBase from './integrated/IntegratedBase'
import './Integrated.css'
import './IntegratedJuicy.css'

interface IntegratedProps {
  juicyLevel: number
}

const isIn = (value: number, list: number[]): boolean => {
  return list.includes(value)
}

export default function Integrated({ juicyLevel }: IntegratedProps) {
  const preOn = isIn(juicyLevel, [1, 4, 5, 7])
  const inOn = isIn(juicyLevel, [2, 4, 6, 7])
  const postOn = isIn(juicyLevel, [3, 5, 6, 7])

  return (
    <div
      className={`integrated-shell juicy-${juicyLevel} ${preOn ? 'pre-on' : ''} ${inOn ? 'in-on' : ''} ${postOn ? 'post-on' : ''}`.trim()}
    >
      <IntegratedBase juicyLevel={juicyLevel} />
    </div>
  )
}
