const { chromium } = await import(process.env.MULA_PLAYWRIGHT_MODULE || "playwright");
const baseURL = process.env.MULA_TEST_URL || "http://127.0.0.1:3001";
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,executablePath:process.env.MULA_BROWSER_PATH});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  window.__engines=[];window.__questions=[];window.__speechRequests=0;window.__audioPeak=0;window.__chatClosed=false;
  class Recognition {
   start(){window.__engines.push(this);this.onstart?.();}
   stop(){this.onend?.();}
   abort(){this.aborted=true;this.onend?.();}
  }
  Object.defineProperty(window,'SpeechRecognition',{configurable:true,value:Recognition});
  window.__say=text=>window.__engines.at(-1).onresult?.({results:[Object.assign([{transcript:text}],{isFinal:true})]});
  const fetchOriginal=window.fetch.bind(window);
  window.fetch=async (url,options)=>{
   if(url==='/api/speech')window.__speechRequests+=1;
   if(url!=='/api/chat')return fetchOriginal(url,options);
   window.__questions.push(JSON.parse(options.body));
   const encoder=new TextEncoder();let closed=false;
   const stream=new ReadableStream({start(controller){
     const event=value=>controller.enqueue(encoder.encode(JSON.stringify(value)+'\n'));
     event({type:'token',content:'Here is a plan. '});
     window.__chatClosed=false;
     window.__finishAnswer=()=>{if(closed)return;event({type:'token',content:'Start with one product.'});event({type:'done'});closed=true;window.__chatClosed=true;controller.close();};
     options.signal.addEventListener('abort',()=>{if(!closed){closed=true;controller.error(new DOMException('Aborted','AbortError'));}});
   },cancel(){closed=true;}});
   return new Response(stream,{headers:{'Content-Type':'application/x-ndjson'}});
  };
  const originalAnalyser=AudioContext.prototype.createAnalyser;
  AudioContext.prototype.createAnalyser=function(){
   const analyser=originalAnalyser.call(this);const read=analyser.getByteTimeDomainData.bind(analyser);
   analyser.getByteTimeDomainData=buffer=>{read(buffer);for(const sample of buffer)window.__audioPeak=Math.max(window.__audioPeak,Math.abs(sample-128));};return analyser;
  };
 });
 await page.goto(baseURL + "/workspace");
 await page.getByRole('button',{name:'Create an account',exact:true}).click();
 await page.getByLabel('Username',{exact:true}).fill('live_check_'+Date.now());
 await page.getByLabel('Password',{exact:true}).fill('live-check-password-12345');
 await page.getByRole('button',{name:'Create account',exact:true}).click();
 await page.getByRole('button',{name:'Start live conversation',exact:true}).click();
 await page.getByRole('button',{name:'Finish spoken turn',exact:true}).waitFor();
 await page.evaluate(()=>window.__say('Help me plan my cafe.'));
 await page.waitForFunction(()=>window.__questions.length===1,{timeout:10000});
 await page.getByText('Speaking…',{exact:true}).waitFor({timeout:45000});
 assert.equal(await page.evaluate(()=>window.__chatClosed),false,'speech must start while model text stream remains open');
 assert.equal(await page.evaluate(()=>window.__engines.length),1,'microphone must remain paused during audio');
 await page.waitForFunction(()=>window.__audioPeak>0);
 await page.screenshot({path:'/tmp/mula-live-desktop.png',fullPage:true});
 await page.evaluate(()=>window.__finishAnswer());
 await page.waitForFunction(()=>window.__engines.length===2,null,{timeout:45000});
 await page.getByRole('button',{name:'Finish spoken turn',exact:true}).waitFor();
 assert.equal(await page.getByLabel('Message Operator',{exact:true}).inputValue(),'');
 await page.evaluate(()=>window.__say('Can we change that?'));
 await page.getByText('Speaking…',{exact:true}).waitFor({timeout:45000});
 const oldFinish=await page.evaluateHandle(()=>window.__finishAnswer);
 await page.getByRole('button',{name:'Interrupt and speak',exact:true}).click();
 await page.waitForFunction(()=>window.__engines.length===3);
 await page.evaluate(finish=>finish(),oldFinish);
 assert.equal(await page.getByRole('button',{name:'End live conversation',exact:true}).isVisible(),true);
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:'/tmp/mula-live-mobile.png',fullPage:true});
 await page.getByRole('button',{name:'End live conversation',exact:true}).click();
 await page.getByRole('button',{name:'Start live conversation',exact:true}).waitFor();
 const count=await page.evaluate(()=>window.__questions.length);
 await page.waitForTimeout(1600);assert.equal(await page.evaluate(()=>window.__questions.length),count);
 // Start and then hide: no background listening or automatic restart.
 await page.getByRole('button',{name:'Start live conversation',exact:true}).click();
 await page.getByRole('button',{name:'Finish spoken turn',exact:true}).waitFor();
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
 await page.getByRole('button',{name:'Start live conversation',exact:true}).waitFor();
 assert.deepEqual(errors,[]);
 console.log('PASS: automatic spoken turns, real TTS audio before model stream completion, microphone paused during playback, automatic next turn, interruption, ending, tab-hide cancellation, mobile layout. Speech input/model stream were simulated; TTS and Web Audio were real.');
} finally {await browser.close();}
