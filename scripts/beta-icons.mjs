// Renders the beta's icon, public/beta-icon.svg, to the PNG sizes the
// phones and the browsers ask for.
//
// Checked in so the icon is one file and not seven: change the SVG, run
// this, commit what comes out. Playwright is already a dependency (the e2e
// suite), which is why it does the rasterising -- no new tool, and the same
// renderer the icon will actually be seen in.
//
//   node scripts/beta-icons.mjs

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const source = join(root, 'public', 'beta-icon.svg')

// 16/32/48: the browser tab. 180: what iOS uses for the home screen.
// 192/512: what Android and the manifest ask for.
const SIZES = [16, 32, 48, 180, 192, 512]

const svg = await readFile(source, 'utf8')
const browser = await chromium.launch()

try {
  for (const size of SIZES) {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    })
    await page.setContent(
      `<!doctype html><style>
         html,body{margin:0;padding:0;background:transparent}
         svg{display:block;width:${size}px;height:${size}px}
       </style>${svg}`,
      { waitUntil: 'load' },
    )
    const shot = await page.screenshot({ omitBackground: true })
    const out = join(root, 'public', `beta-icon-${size}.png`)
    await mkdir(dirname(out), { recursive: true })
    await writeFile(out, shot)
    await page.close()
    console.log(`beta-icon-${size}.png`)
  }
} finally {
  await browser.close()
}
