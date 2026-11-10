import budgetPiggy from '@/assets/illustrations/budget-piggy.webp'
import categoriesCalc from '@/assets/illustrations/categories-calc.webp'
import emptyNotes from '@/assets/illustrations/empty-notes.webp'
import welcome from '@/assets/illustrations/welcome.webp'
import cashShades from '@/assets/illustrations/dino-cash-shades.webp'
import coinThrone from '@/assets/illustrations/dino-coin-throne.webp'
import cheering from '@/assets/illustrations/dino-cheering.webp'
import cashFanShy from '@/assets/illustrations/dino-cash-fan-shy.webp'
import crownCoin from '@/assets/illustrations/dino-crown-coin.webp'
import moneyPileCalm from '@/assets/illustrations/dino-money-pile-calm.webp'
import cashFanLaughing from '@/assets/illustrations/dino-cash-fan-laughing.webp'
import coinStack from '@/assets/illustrations/dino-coin-stack.webp'
import savingsShield from '@/assets/illustrations/dino-savings-shield.webp'
import coinJar from '@/assets/illustrations/dino-coin-jar.webp'
import calculator from '@/assets/illustrations/dino-calculator.webp'
import notepad from '@/assets/illustrations/dino-notepad.webp'
import piggyBank from '@/assets/illustrations/dino-piggy-bank.webp'
import crownSerious from '@/assets/illustrations/dino-crown-serious.webp'
import moneyMountain from '@/assets/illustrations/dino-money-mountain.webp'

// The mascot drawings, named by what the dino is *doing* rather than by the
// screen that happened to use one first -- so a screen picks the one that
// fits its moment instead of every empty state reaching for the same
// notepad. Four of these are the originals; the rest came from the same
// set and are what makes the app feel like it has a cast rather than one
// sticker reused everywhere.
export const ILLUSTRATIONS = {
  // Writing in a notepad: nothing logged yet, about to be.
  writing: notepad,
  // Dropping a coin into a piggy bank: money set aside, bills that come back.
  saving: piggyBank,
  // With a calculator on a pile of bills: counting, breaking down, checking.
  counting: calculator,
  // Arms up, money in the air: a clean slate, or a month that went well.
  celebrating: cheering,
  // Sitting on a throne of coins: plenty left.
  flush: coinThrone,
  // Sunglasses, a bag of cash and a fan of notes: comfortably ahead.
  loaded: cashShades,
  // Holding a jar with a few coins in the bottom: not much left.
  nearlyEmpty: coinJar,
  // Crown, arms crossed, unimpressed: the month is already over budget.
  unimpressed: crownSerious,
  // Coins behind a shield: something protected, set aside on purpose.
  protected: savingsShield,
  // Sitting among scattered notes and coins, at ease.
  atEase: moneyPileCalm,
  // A small stack of coins, counted and tidy.
  tidy: coinStack,
  // Laughing behind a fan of notes.
  pleased: cashFanLaughing,
  // Peeking over a fan of notes.
  shy: cashFanShy,
  // Crown and a single big coin: proud of one thing.
  proud: crownCoin,
  // On a mountain of money.
  rich: moneyMountain,
  // --- the originals, still used where they already were ---
  writingOriginal: emptyNotes,
  savingOriginal: budgetPiggy,
  countingOriginal: categoriesCalc,
  celebratingOriginal: welcome,
} as const
