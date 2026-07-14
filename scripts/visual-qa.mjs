import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

const root=path.resolve(new URL('..',import.meta.url).pathname);
const out=path.join(root,'previews');await fs.mkdir(out,{recursive:true});
const css=await fs.readFile(path.join(root,'public','styles.css'),'utf8');
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
for(const [name,width,height] of [['storefront-desktop',1440,1100],['storefront-mobile',390,844],['admin-desktop',1440,1100]]){
  const file=name.startsWith('admin')?'admin.html':'index.html';
  let html=await fs.readFile(path.join(root,'public',file),'utf8');
  html=html.replace(/<link rel="stylesheet" href="\/styles\.css">/,`<style>${css}</style>`).replace(/<script[\s\S]*?<\/script>/g,'');
  const page=await browser.newPage({viewport:{width,height}});await page.setContent(html,{waitUntil:'domcontentloaded'});await page.screenshot({path:path.join(out,`${name}.png`),fullPage:true,animations:'disabled'});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2);if(overflow)throw new Error(`${name} has horizontal overflow`);await page.close();
}
await browser.close();console.log(`Visual QA written to ${out}`);
