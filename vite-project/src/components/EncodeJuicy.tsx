import EncodeBase from './encode/EncodeBase'
import './Encode.css'
import './EncodeJuicy.css'

interface MeatData {
  Entity: string
  Code: string
  Year: number
  Poultry: number
  'Beef and buffalo': number
  'Sheep and goat': number
  Pork: number
  'Other meats': number
  'Fish and seafood': number
}

export default function EncodeJuicy({ data }: { data: MeatData[] }) {
  return <EncodeBase juicy={true} data={data} />
}
