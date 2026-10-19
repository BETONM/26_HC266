// 디자인 리뷰용 스크린샷. dev 서버(또는 preview)가 떠 있어야 한다.
//
//   node scripts/screenshot.mjs --out .review/stage-2/round-1 [--url http://localhost:5173] [--path /?x=1 --name landing ...]
//
// 라이트/다크 × 390px/1440px 네 장을 화면마다 찍는다. 필요한 화면은 --path와 --name을 짝지어 여러 번 준다.
// CHROMIUM_PATH가 있으면 그 브라우저를 쓴다(Playwright 버전과 캐시된 브라우저가 다를 때).
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const all = (name) => args.flatMap((arg, i) => (arg === `--${name}` ? [args[i + 1]] : []));

const baseUrl = option('url', 'http://localhost:5173');
const out = option('out', '.review/latest');
const paths = all('path');
const names = all('name');
const pages = paths.length > 0 ? paths.map((path, i) => ({path, name: names[i] ?? `page-${i + 1}`})) : [{path: '/', name: 'home'}];
const widths = [390, 1440];
const schemes = ['light', 'dark'];

await mkdir(out, {recursive: true});
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH} : {});
try {
  for (const {path, name} of pages) {
    for (const width of widths) {
      for (const colorScheme of schemes) {
        const context = await browser.newContext({viewport: {width, height: width < 768 ? 844 : 900}, colorScheme, deviceScaleFactor: 1});
        const page = await context.newPage();
        await page.goto(new URL(path, baseUrl).href, {waitUntil: 'networkidle'});
        const file = join(out, `${name}-${width}-${colorScheme}.png`);
        await page.screenshot({path: file, fullPage: true});
        console.log(file);
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
}
