// The beta's icon: the tab favicon, and what the app looks like once
// somebody saves it to their home screen.
//
// It is not a drawing. It is the logo -- the three rising e's of
// "remeeeesa", cut out of src/assets/logo.png and set in white on the
// grape. Flor chose it over a house and a banknote for the reason that
// matters: a house is the icon of every budgeting app ever made, and this
// is the only mark that could not belong to another one.
//
// No dinosaur: that was the v1's, and the v1 keeps it. These files are the
// beta's own (beta-icon-*.png), so nobody's home screen changes under them
// before the beta replaces the v1 for real.
//
// Checked in rather than built, because it changes once a year and a build
// step nobody runs is a build step that rots:
//
//   node scripts/beta-icons.mjs

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

// The grape the whole beta is built on (--grape in src/beta/theme.css).
const GRAPE = '#4d1f8d'

// src/assets/logo.png is 1753x304. This is the box the three e's sit in,
// in its own pixels, measured off the image's ink rather than by eye -- the
// run of dark columns from the first e to the last. Re-measure if the logo
// is ever redrawn.
const LOGO = { width: 1753, height: 304 }
const EEE = { x: 716, y: 15, width: 638, height: 285 }

// How much of the square the mark fills. Phones round the corners
// themselves and crop a little more off a maskable icon, so it stays well
// inside.
const FILL = 0.66

// 16/32/48 for the browser tab, 180 for the iOS home screen, 192/512 for
// Android and the manifest.
const SIZES = [16, 32, 48, 180, 192, 512]

const logo = await readFile(join(root, 'src', 'assets', 'logo.png'))
const source = `data:image/png;base64,${logo.toString('base64')}`

// A stage exactly the size of the mark, centred, with the wordmark laid
// inside it and clipped to it. Percentages inside the stage resolve against
// the stage, which is what keeps the neighbouring letters out.
const markup = `<!doctype html><style>
  html,body{margin:0;padding:0}
  .icon{position:relative;overflow:hidden;width:100vw;height:100vw;background:${GRAPE}}
  .stage{position:absolute;overflow:hidden;
         width:${FILL * 100}%;
         height:${((EEE.height / EEE.width) * FILL) * 100}%;
         left:${(1 - FILL) * 50}%;
         top:${(1 - (EEE.height / EEE.width) * FILL) * 50}%}
  .stage img{position:absolute;display:block;max-width:none;
             width:${(LOGO.width / EEE.width) * 100}%;
             height:${(LOGO.height / EEE.height) * 100}%;
             left:${(-EEE.x / EEE.width) * 100}%;
             top:${(-EEE.y / EEE.height) * 100}%;
             /* The logo is black on transparent; the icon is white on grape. */
             filter:invert(1)}
</style><div class="icon"><div class="stage"><img src="${source}"></div></div>`

const browser = await chromium.launch()

try {
  for (const size of SIZES) {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    })
    await page.setContent(markup, { waitUntil: 'load' })
    const shot = await page.screenshot()
    await writeFile(join(root, 'public', `beta-icon-${size}.png`), shot)
    await page.close()
    console.log(`beta-icon-${size}.png`)
  }
} finally {
  await browser.close()
}
