import budgetPiggy from '@/assets/illustrations/budget-piggy.webp'
import categoriesCalc from '@/assets/illustrations/categories-calc.webp'
import emptyNotes from '@/assets/illustrations/empty-notes.webp'
import welcome from '@/assets/illustrations/welcome.webp'

// The four mascot drawings, named by what the dino is doing rather than by
// the screen that happened to use one first. Collected here so a screen
// picks the one that fits its moment instead of every empty state reaching
// for the same notepad drawing.
export const ILLUSTRATIONS = {
  // Writing in a notepad: nothing logged yet, about to be.
  writing: emptyNotes,
  // Holding a piggy bank: money set aside, bills that come back.
  saving: budgetPiggy,
  // Sitting with a calculator on a pile of bills: counting, breaking down.
  counting: categoriesCalc,
  // Cheering, money in the air: a clean slate, nothing spent.
  celebrating: welcome,
} as const
