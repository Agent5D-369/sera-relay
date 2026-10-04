'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer');
const { installReviewUI } = require('./review-ui.cjs');
const draft = {
  title: 'Weekly rhythm proposal | Test speaker | 2026-10-03', transcript: 'We should meet Monday. '.repeat(30),
  summary: 'Keep a short weekly check-in, then let smaller groups work on their priorities.',
  claims: [{kind:'Speaker claim',text:'A short weekly check-in was proposed.',evidence:'We should meet Monday.'},{kind:'Sera inference',text:'Separate connection time from working sessions.',evidence:'AI interpretation, not a confirmed fact'}],
  actions:[{title:'Prepare the weekly check-in',evidence:'Proposed follow-up'}],
  owners:[{id:'alex',name:'Alex Example'},{id:'sam',name:'Sam Example'},...Array.from({length:500},(_,i)=>({id:'person-'+i,name:'Sample person '+i}))],
  related:[],selected_related:[],tasks:[],verified:false
};
(async()=>{
  const b=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try {
    const page=await b.newPage(); const calls=[]; let fail=false;
    await page.exposeFunction('onSeraAction',(id,action,values)=>{if(fail) throw Error('Synthetic unavailable connection');calls.push({id,action,values});});
    await page.setContent('<style>body{margin:0;background:#111b21}</style>');
    await page.evaluate(installReviewUI);
    await page.evaluate(() => {
      window.VoiceReview.open('failed', {status:'done',transcript:'Synthetic speech',memory:{status:'ready'}});
      window.VoiceReview.update([{id:'failed',busy:true,memory:{status:'ready'}}]);
      window.VoiceReview.update([{id:'failed',memory:{status:'ready',error:'Sera returned an unexpected response'}}]);
      window.VoiceReview.update([{id:'failed',busy:false,memory:{status:'ready'}}]);
    });
    assert.match(await page.$eval('[role=status]',e=>e.textContent),/unexpected response/);
    assert.equal(await page.$$eval('button',bs=>bs.find(b=>b.textContent==='Refresh preview').disabled),false);
    await page.keyboard.press('Escape');calls.length=0;
    await page.evaluate(() => window.VoiceReview.open('thinking',{busy:true,transcript:'Synthetic speech'}));
    assert.match(await page.$eval('.vr-status-title',e=>e.textContent),/Sera is thinking/);
    assert.equal(await page.$eval('.vr-status img',e=>e.complete && e.naturalWidth>0),true);
    assert.equal(await page.$eval('.vr-status',e=>e.nextElementSibling.classList.contains('vr-scroll')),true);
    await page.$eval('.vr-scroll',e=>{e.scrollTop=e.scrollHeight});
    assert.equal(await page.$eval('.vr-status',e=>e.getBoundingClientRect().bottom<innerHeight),true);
    await page.keyboard.press('Escape');

    for(const width of [320,375,414,768,1280]) {
      await page.setViewport({width,height:800});
      await page.evaluate(d=>window.VoiceReview.open('test',{status:'done',transcript:d.transcript,memory:{draft:d}}),draft);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      assert.equal(await page.$eval('dialog',d=>{const r=d.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight}),true);
      await page.$eval('.vr-scroll',d=>{d.scrollTop=d.scrollHeight});
      for(const selector of ['header button','footer'])assert.equal(await page.$eval('dialog '+selector,d=>{const r=d.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight}),true);
      await page.screenshot({path:path.join(__dirname,'../build/ux-review-'+width+'.png')});
      await page.click('[aria-label="Close review"]');
    }
    await page.evaluate(d=>window.VoiceReview.open('planning',{status:'done',memory:{draft:d}}),draft);
    assert.equal(await page.$eval('[data-task]',e=>e.disabled),false);
    assert.equal(await page.$eval('h3',e=>e.textContent),"Sera's summary".replace("'",'\u2019'));
    await page.click('[data-task]');
    await page.click('[data-owner=alex]');
    await page.$eval('[type=date]',e=>{e.value='2026-10-10';e.dispatchEvent(new Event('input'))});
    assert.equal(await page.$$eval('button',bs=>bs.find(b=>b.textContent==='Create shared tasks').disabled),true);
    await page.evaluate(d=>window.VoiceReview.update([{id:'planning',busy:false,memory:{draft:{...d,verified:true}}}]),draft);
    assert.equal(await page.$eval('[data-task]',e=>e.checked),true);
    assert.equal(await page.$eval('[data-owner=alex]',e=>e.checked),true);
    assert.equal(await page.$$eval('button',bs=>bs.find(b=>b.textContent==='Create shared tasks').disabled),false);
    await page.keyboard.press('Escape');
    await page.setViewport({width:1280,height:850});
    const saved={...draft,verified:true,url:'https://www.notion.so/'+'a'.repeat(32)};
    await page.evaluate(d=>window.VoiceReview.open('test',{status:'done',memory:{draft:d}}),saved);
    assert.equal(await page.$eval('textarea',e=>e.readOnly),true);
    await page.click('[data-task]');
    await page.type('[type=search]','not a person');
    assert.equal(await page.$$eval('.vr-person:not([hidden])',e=>e.length),0);
    await page.$eval('[type=search]',e=>{e.value='Alex';e.dispatchEvent(new Event('input'))});
    await page.click('[data-owner=alex]');
    await page.$eval('[type=search]',e=>{e.value='Sam';e.dispatchEvent(new Event('input'))});
    await page.click('[data-owner=sam]');
    await page.$eval('[type=date]',e=>{e.value='2026-10-10';e.dispatchEvent(new Event('input'))});
    await page.keyboard.press('Escape');
    await page.evaluate(d=>window.VoiceReview.open('test',{status:'done',memory:{draft:d}}),saved);
    assert.equal(await page.$$eval('[data-owner]:checked',es=>es.length),2);
    assert.equal(await page.$eval('[type=date]',e=>e.value),'2026-10-10');
    fail=true;
    await page.$$eval('button',bs=>bs.find(b=>b.textContent==='Create shared tasks').click());
    await page.waitForFunction(()=>document.querySelector('[role=status]').dataset.state==='error');
    assert.equal(await page.$$eval('[data-owner]:checked',es=>es.length),2);
    fail=false;
    await page.$$eval('button',bs=>bs.find(b=>b.textContent==='Create shared tasks').click());
    await page.waitForFunction(()=>document.querySelector('[role=status]').dataset.state==='loading');
    assert.equal(calls.length,1);assert.deepEqual(calls[0].values.selection[0].owner_ids,['alex','sam']);
    const done={...saved,tasks:[{title:saved.actions[0].title,url:'https://www.notion.so/'+'b'.repeat(32)}]};
    await page.evaluate(d=>window.VoiceReview.update([{id:'test',busy:false,memory:{draft:d}}]),done);
    assert.equal(await page.$eval('[data-task]',e=>e.disabled),true);
    assert.match(await page.$eval('[role=status]',e=>e.textContent),/1 task created/);
    assert.equal(await page.$$eval('.vr-record-links a',es=>es.length),2);
    assert.match(await page.$eval('.vr-record-links a:last-child',e=>e.textContent),/Open task: Prepare/);
    await page.screenshot({path:path.join(__dirname,'../build/ux-review-saved.png')});
    const demoDraft={...saved,owners:saved.owners.slice(0,2)};
    const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Voice note review preview</title><body><script>(${installReviewUI.toString()})();window.onSeraAction=async()=>{};window.VoiceReview.open('preview',{status:'done',memory:{draft:${JSON.stringify(demoDraft)}}});const s=document.createElement('section');s.innerHTML='<h3>Control states</h3>'+['default','hover','focus','active','disabled','loading','error','success'].map(state=>'<p>'+state+' <button class="is-'+state+'" data-state="'+state+'" '+(state==='disabled'?'disabled':'')+'>Review note</button></p>').join('');document.querySelector('.vr-scroll').append(s);</script></body></html>`;
    fs.mkdirSync(path.join(__dirname,'../docs'),{recursive:true});fs.writeFileSync(path.join(__dirname,'../docs/voice-review.preview.html'),html);
    console.log('PASS: 320/375/414/768/1280 layouts, fixed controls, searchable assignees, retained choices, error/retry, and task success. Synthetic screenshots saved.');
  } finally {await b.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
