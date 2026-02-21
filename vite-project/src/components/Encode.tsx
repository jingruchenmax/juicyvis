import EncodeBase from './encode/EncodeBase'
import './Encode.css'

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

export default function Encode({ data }: { data: MeatData[] }) {
  return <EncodeBase juicy={false} data={data} />
}
