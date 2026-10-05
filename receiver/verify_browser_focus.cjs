const assert=require('node:assert/strict'),fs=require('fs'),puppeteer=require('../receiver/node_modules/puppeteer');
const {startExternal}=require('../receiver/external.cjs');const {showWindow}=require('../receiver/window.cjs');
(async()=>{let a,b,router;try{
 a=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:false});await (await a.pages())[0].setContent('<title>Selected browser routing regression</title>');await showWindow(a);
 b=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:false});await (await b.pages())[0].setContent('<title>Excluded companion regression</title>');await showWindow(a);
 router=startExternal(b.process().pid);await new Promise(r=>setTimeout(r,2500));await showWindow(b);await new Promise(r=>setTimeout(r,300));
 assert.equal(await router.open('https://www.notion.so/test'),true);
 let target;for(let i=0;i<40;i++){target=(await a.pages()).find(p=>p.url().includes('notion.so/test')||p.url().includes('notion.com'));if(target)break;await new Promise(r=>setTimeout(r,100));}
 assert.ok(target);assert.equal((await a.pages()).length,2);assert.equal((await b.pages()).length,1);
 fs.writeFileSync('build/browser-focus-proof.json',JSON.stringify({background_selected_window:true,companion_excluded:true,new_tab_in_selected_browser:true,synthetic:true}));console.log('PASS: background browser gets the record; excluded foreground companion gets no new tab.');
}finally{router?.close();await b?.close();await a?.close();}})().catch(e=>{console.error(e);process.exitCode=1});
