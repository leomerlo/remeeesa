import {
  Bike,
  Droplet,
  Flame,
  Landmark,
  ShieldCheck,
  Bus,
  Car,
  Coffee,
  CreditCard,
  Dumbbell,
  Gift,
  GlassWater,
  Heart,
  Home,
  Package,
  PartyPopper,
  PawPrint,
  Pill,
  Plane,
  Receipt,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Tag,
  Utensils,
  Wallet,
  Wifi,
  Wrench,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// Category names (lowercased) mapped to a representative icon. Categories
// are freeform -- findOrCreateCategory lets anyone type a new name -- so
// this can never be exhaustive; it covers the seeded defaults plus the
// names this household actually types day to day, which is what makes the
// icons carry meaning instead of decorating.
//
// Accents are stripped before lookup (see normalize), so "café" and "cafe"
// both resolve without needing duplicate entries.
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  // Food and eating out
  comida: ShoppingCart,
  supermercado: ShoppingCart,
  super: ShoppingCart,
  delivery: Package,
  pedidosya: Package,
  rappi: Package,
  cafe: Coffee,
  bar: GlassWater,
  restaurante: Utensils,
  restoran: Utensils,
  salidas: Utensils,
  ocio: PartyPopper,
  entretenimiento: PartyPopper,

  // Getting around
  transporte: Bus,
  auto: Car,
  nafta: Car,
  combustible: Car,
  taxi: Car,
  uber: Car,
  bici: Bike,
  bicicleta: Bike,
  viajes: Plane,
  vacaciones: Plane,

  // Home and bills
  casa: Home,
  hogar: Home,
  vivienda: Home,
  alquiler: Home,
  expensas: Home,
  servicios: Receipt,
  luz: Zap,
  gas: Zap,
  agua: GlassWater,
  internet: Wifi,
  telefono: Smartphone,
  celular: Smartphone,
  mantenimiento: Wrench,
  arreglos: Wrench,

  // Health and self
  salud: Heart,
  'obra social': Heart,
  prepaga: Heart,
  farmacia: Pill,
  medicamentos: Pill,
  gimnasio: Dumbbell,
  gym: Dumbbell,

  // Everything else people actually buy
  ropa: Shirt,
  indumentaria: Shirt,
  compras: ShoppingBag,
  mascotas: PawPrint,
  regalos: Gift,
  suscripciones: CreditCard,
  tarjeta: CreditCard,
  otros: Tag,

  // The names this household's own spreadsheet actually uses -- both its
  // category column and the individual line items, since a bill named
  // "EDENOR" is what shows up on a Cuenta row, not the word "luz".
  'gastos personales': Wallet,
  'tarjetas de credito': CreditCard,
  visa: CreditCard,
  amex: CreditCard,
  santander: CreditCard,
  // Utilities and taxes, by provider name
  naturgy: Flame,
  edenor: Zap,
  aysa: Droplet,
  claro: Wifi,
  personal: Smartphone,
  prosegur: ShieldCheck,
  arba: Landmark,
  afip: Landmark,
  patente: Landmark,
  impuesto: Landmark,
  municipal: Landmark,
  // Car and health
  seguro: ShieldCheck,
  'seguro auto': ShieldCheck,
  aca: Car,
  osde: Heart,
  entrenamiento: Dumbbell,
}

// Unmapped names hash across several visually distinct icons rather than
// all collapsing to one generic glyph -- with freeform categories the
// fallback is common, and two different unmapped categories showing the
// same icon reads as a bug even though the colors differ.
const FALLBACK_ICONS: readonly LucideIcon[] = [
  Wallet,
  Tag,
  Sparkles,
  Package,
  ShoppingBag,
  Receipt,
]

// Lowercases, trims, and strips accents so "Café"/"cafe"/"CAFÉ" all hit the
// same entry. NFD splits an accented character into base letter + combining
// mark, and the range below removes those marks.
function normalize(name: string): string {
  return name.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function hashCategoryName(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) % 2147483647
  }
  return hash
}

export function iconForCategoryName(name: string): LucideIcon {
  const normalized = normalize(name)
  const known = CATEGORY_ICONS[normalized]
  if (known !== undefined) {
    return known
  }
  return FALLBACK_ICONS[hashCategoryName(normalized) % FALLBACK_ICONS.length]
}
