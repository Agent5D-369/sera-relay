'use strict';
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('../receiver/node_modules/puppeteer');
const { installReviewUI } = require('../receiver/review-ui.cjs');
const { installPageInline } = require('../receiver/inline.cjs');
const out = path.resolve(__dirname, 'screenshots');
const draft = {
  title: 'Monday check-in proposal | Alex Example | 2026-10-04',
  transcript: 'Could we start Monday with a short team check-in, then let each working group continue separately? Please ask Sam and Alex to prepare a proposed agenda for next week.',
  summary: 'Alex proposes a short Monday check-in followed by smaller working groups. This is a proposal, not an approved decision. A shared agenda task is suggested for review.',
  claims: [{kind:'Speaker claim',text:'A short Monday team check-in is proposed.',evidence:'Could we start Monday with a short team check-in'}, {kind:'Sera inference',text:'A brief shared opening may preserve connection while reducing unnecessary meeting time.',evidence:'Interpretation, not a confirmed outcome'}],
  actions:[{title:'Prepare a proposed Monday agenda',evidence:'Please ask Sam and Alex to prepare a proposed agenda'}],
  owners:[{id:'alex',name:'Alex Example'},{id:'sam',name:'Sam Example'}], related:[],selected_related:[],tasks:[],verified:false
};
(async()=>{
  fs.mkdirSync(out,{recursive:true});
  const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try {
    const page=await browser.newPage();await page.setViewport({width:1280,height:980,deviceScaleFactor:1});
    await page.setContent('<html lang="en"><meta charset="utf-8"><style>body{margin:0;background:#111b21;color:#e9edef;font:16px system-ui}aside{padding:14px 20px}main{max-width:800px;margin:60px auto;padding:24px;background:#202c33;border-radius:12px}h1{font-size:22px}</style><aside>Synthetic example data | Actual transcription component | No live chat</aside><main><h1>Alex Example | Demo team</h1><div data-id="demo"><p>Received voice note | 0:12</p></div></main></html>');
    await page.exposeFunction('onVoiceLookup',async()=>{});await page.exposeFunction('onVoiceTranscribe',async()=>{});
    await page.evaluate(()=>{const msg={type:'ptt',id:{fromMe:false,id:'demo'}};window.require=()=>({Msg:{get:()=>msg,getModelsArray:()=>[msg]}});window.WWebJS={getMessageModel:()=>({id:{_serialized:'demo'}})};});
    await page.evaluate(installReviewUI);await page.evaluate(installPageInline);
    await page.waitForSelector('.voice-transcriber');
    await page.evaluate(text=>window.VoiceTranscriber.update([{id:'demo',status:'done',transcript:text,memory:{status:'disconnected'}}]),draft.transcript);
    await page.screenshot({path:path.join(out,'local-transcript.png')});
    await page.evaluate(()=>window.VoiceTranscriber.dispose());
    await page.setContent('<html lang="en"><meta charset="utf-8"><style>body{margin:0;background:#111b21;color:#e9edef;font:14px system-ui}aside{padding:10px 20px}</style><aside>Sera Relay product preview | Synthetic example data | Not a live customer record</aside></html>');
    await page.exposeFunction('onSeraAction',async()=>{});await page.evaluate(installReviewUI);
    const capture=async name=>{await page.screenshot({path:path.join(out,name+'.png')});};
    await page.evaluate(d=>window.VoiceReview.open('demo',{status:'done',memory:{draft:d}}),draft);
    await capture('review');await page.keyboard.press('Escape');
    const saved={...draft,verified:true,url:'https://www.notion.so/'+'a'.repeat(32)};
    await page.evaluate(d=>window.VoiceReview.open('demo',{status:'done',memory:{draft:d}}),saved);
    await page.click('[data-task]');await page.click('[data-owner=alex]');await page.click('[data-owner=sam]');
    await page.$eval('[type=date]',e=>{e.value='2026-10-12';e.dispatchEvent(new Event('input'))});
    await page.$eval('.vr-scroll',e=>{e.scrollTop=e.scrollHeight});await capture('shared-task');
    const finished={...saved,tasks:[{title:'Prepare a proposed Monday agenda',url:'https://www.notion.so/'+'b'.repeat(32)}]};
    await page.evaluate(d=>window.VoiceReview.update([{id:'demo',busy:false,memory:{draft:d}}]),finished);
    await page.$eval('.vr-scroll',e=>{e.scrollTop=0});await capture('saved');await page.keyboard.press('Escape');
    await page.evaluate(d=>window.VoiceReview.open('thinking',{busy:true,transcript:d.transcript}),draft);await capture('thinking');
    const files=['local-transcript','review','shared-task','saved','thinking'].map(name=>({file:'screenshots/'+name+'.png',kind:'actual component with synthetic fixtures',source:name==='local-transcript'?'receiver/inline.cjs':'receiver/review-ui.cjs',publicUse:'pending final branding/rights review'}));
    fs.writeFileSync(path.join(out,'capture-manifest.json'),JSON.stringify({captured:'2026-10-04',productionData:false,liveNetworkCalls:false,files},null,2));
    console.log('Captured five product screenshots using synthetic fixtures. No live workspace writes.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1});
