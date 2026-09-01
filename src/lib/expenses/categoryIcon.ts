import {
  Bus,
  Car,
  Coffee,
  Dumbbell,
  Gift,
  Heart,
  Home,
  PartyPopper,
  PawPrint,
  Receipt,
  ShoppingCart,
  Sparkles,
  Tag,
  Wallet,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// Known household category names (Spanish, lowercased) mapped to a
// representative icon -- covers the seeded defaults (seed.ts) plus the
// categories this household actually uses day to day. Categories are
// freeform (findOrCreateCategory lets anyone type a new name), so this list
// is best-effort, not exhaustive -- anything unmapped falls back to a
// deterministically hashed generic icon, the same technique
// colorForCategoryName uses for color.
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  comida: ShoppingCart,
  supermercado: ShoppingCart,
  transporte: Bus,
  auto: Car,
  servicios: Receipt,
  entretenimiento: PartyPopper,
  ocio: Coffee,
  salidas: Coffee,
  salud: Heart,
  'obra social': Heart,
  gimnasio: Dumbbell,
  casa: Home,
  vivienda: Home,
  mascotas: PawPrint,
  regalos: Gift,
  otros: Tag,
}

const FALLBACK_ICONS: readonly LucideIcon[] = [Wallet, Sparkles, Tag]

function hashCategoryName(name: string): number {
  const normalized = name.trim().toLowerCase()
  let hash = 0
  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash * 31 + normalized.charCodeAt(i)) % 2147483647
  }
  return hash
}

export function iconForCategoryName(name: string): LucideIcon {
  const normalized = name.trim().toLowerCase()
  const known = CATEGORY_ICONS[normalized]
  if (known !== undefined) {
    return known
  }
  return FALLBACK_ICONS[hashCategoryName(normalized) % FALLBACK_ICONS.length]
}
