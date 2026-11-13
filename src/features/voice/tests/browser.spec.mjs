const { chromium } = await import(process.env.MULA_PLAYWRIGHT_MODULE || "playwright");
const baseURL = process.env.MULA_TEST_URL || "http://127.0.0.1:3001";
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,executablePath:process.env.MULA_BROWSER_PATH});
try {
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 let requests=[];
 await context.route('**/api/**',async route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/api/auth/me')return route.fulfill({json:{username:'Rafa'}});
  if(url.pathname==='/api/conversation')return route.fulfill({json:{session_id:'12345678-1234-1234-1234-123456789012',messages:[]}});
  if(url.pathname==='/api/chat') {requests.push(route.request().postDataJSON());return route.fulfill({contentType:'application/x-ndjson',body:JSON.stringify({type:'token',content:'Let’s plan your cafe.'})+'\n'+JSON.stringify({type:'done'})+'\n'});}
  return route.fulfill({status:404,json:{detail:'Unmocked test route'}});
 });
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  localStorage.setItem('mula.voice-muted','true');
  window.__recognitions=[];
  class Recognition {
   start(){window.__recognitions.push(this);this.onstart?.();}
   stop(){this.stopped=true;this.onend?.();}
   abort(){this.aborted=true;this.onend?.();}
  }
  Object.defineProperty(window,'SpeechRecognition',{value:Recognition,configurable:true});
  Object.defineProperty(window,'webkitSpeechRecognition',{value:undefined,configurable:true});
  window.__emit=rows=>window.__recognitions.at(-1).onresult?.({results:rows.map(([text,final])=>Object.assign([{transcript:text}],{isFinal:final}))});
 });
 await page.goto(baseURL);
 const input=page.getByLabel('Message Mula',{exact:true});await input.waitFor();
 await input.fill('My cafe:');
 await page.getByLabel('Speech language',{exact:true}).selectOption('id-ID');
 await page.getByRole('button',{name:'Start dictation',exact:true}).click();
 await page.getByRole('button',{name:'Stop dictation',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>window.__recognitions.at(-1).lang),'id-ID');
 assert.equal(await page.getByRole('button',{name:'Send message',exact:true}).isDisabled(),true);
 await page.evaluate(()=>window.__emit([['Kopi',false]]));
 await page.locator('.interim-transcript').getByText('Kopi',{exact:true}).waitFor();
 assert.equal(await input.inputValue(),'My cafe:');
 await page.evaluate(()=>window.__emit([['kopi susu',true]]));
 await page.waitForFunction(()=>document.querySelector('#message').value==='My cafe: kopi susu');
 await input.fill('My edited plan:');
 await page.evaluate(()=>window.__emit([['kopi susu',true],['open tomorrow',true]]));
 await page.waitForFunction(()=>document.querySelector('#message').value==='My edited plan: open tomorrow');
 assert.equal(requests.length,0,'dictation does not auto-send');
 await page.getByRole('button',{name:'Stop dictation',exact:true}).click();
 await page.getByRole('button',{name:'Start dictation',exact:true}).waitFor();
 await page.screenshot({path:'/tmp/mula-dictation-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'Send message',exact:true}).click();
 await page.getByText('Let’s plan your cafe.',{exact:true}).waitFor();
 assert.equal(requests[0].message,'My edited plan: open tomorrow');
 await input.fill('Keep this draft');
 await page.getByRole('button',{name:'Start dictation',exact:true}).click();
 await page.evaluate(()=>window.__recognitions.at(-1).onerror({error:'not-allowed'}));
 await page.getByRole('alert').filter({hasText:'Microphone permission was denied'}).waitFor();
 assert.equal(await input.inputValue(),'Keep this draft');
 await page.getByRole('button',{name:'Dismiss',exact:true}).click();
 await page.getByRole('button',{name:'Start dictation',exact:true}).click();
 await page.evaluate(()=>{
  const last=window.__recognitions.at(-1);window.__late=last.onresult;
  Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));
  window.__late({results:[Object.assign([{transcript:'Do not append'}],{isFinal:true})]});
  Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});
 });
 assert.equal(await input.inputValue(),'Keep this draft');
 await page.getByRole('button',{name:'Start dictation',exact:true}).waitFor();
 await page.reload();await input.waitFor();
 assert.equal(await page.getByLabel('Speech language',{exact:true}).inputValue(),'id-ID');
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:'Start dictation',exact:true}).click();
 await page.evaluate(()=>window.__emit([['Buka kedai kopi',false]]));
 await page.locator('.interim-transcript').waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:'/tmp/mula-dictation-mobile.png',fullPage:true});
 await page.getByRole('button',{name:'Stop dictation',exact:true}).click();
 await input.fill('a'.repeat(7998));
 await page.getByRole('button',{name:'Start dictation',exact:true}).click();
 await page.evaluate(()=>window.__emit([['😀 more',true]]));
 await page.getByText('The message reached 8,000 characters. Dictation stopped; review the captured text.',{exact:true}).waitFor();
 assert.equal((await input.inputValue()).isWellFormed(),true);
 const unsupported=await context.newPage();
 await unsupported.addInitScript(()=>{
  Object.defineProperty(window,'SpeechRecognition',{value:undefined,configurable:true});
  Object.defineProperty(window,'webkitSpeechRecognition',{value:undefined,configurable:true});
 });
 await unsupported.goto(baseURL);
 await unsupported.getByRole('button',{name:'Speech input unavailable in this browser',exact:true}).waitFor();
 assert.equal(await unsupported.getByRole('button',{name:'Speech input unavailable in this browser',exact:true}).isDisabled(),true);
 await unsupported.getByLabel('Message Mula',{exact:true}).fill('Typing still works');
 assert.equal(await unsupported.getByRole('button',{name:'Send message',exact:true}).isEnabled(),true);
 assert.deepEqual(errors,[]);
 console.log('PASS: scripted speech engine UI, interim vs final text, no duplicates, edits preserved, stop/review/send, permission failure, hide cancellation, language persistence, length bound, mobile layout, unsupported-browser typing. No real microphone or recognition accuracy was tested.');
} finally {await browser.close();}
