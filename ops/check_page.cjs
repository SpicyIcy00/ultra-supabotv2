// Runs a page under jsdom and reports script errors, the scene buttons, and what a click shows.
// Usage (from frontend/): NODE_PATH=node_modules node ../ops/check_page.cjs ../ops/ideal/george-ahead-of-me.html
// Added 2026-09-16 after it found a parse error and a duplicate id that no test and no person had seen.
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const vc = new VirtualConsole(); const errs = [];
vc.on('jsdomError', (e) => { const m = String(e.message || e); if (!/Not implemented/.test(m)) errs.push(m.split('\n')[0]); });
const dom = new JSDOM('<!doctype html><html><head></head><body>' + html + '</body></html>', { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.test/', virtualConsole: vc });
const w = dom.window, d = w.document;
w.addEventListener('error', (e) => errs.push('window.error: ' + (e.message || e.error)));
setTimeout(() => {
  const list = [...d.querySelectorAll('[data-scene]')].map(b => b.tagName + '.' + b.className.split(' ')[0] + '→' + b.dataset.scene);
  console.log('data-scene elements (' + list.length + '):', list.join(' | '));
  console.log('shown before:', [...d.querySelectorAll('.scene.show')].map(s => s.id));
  const chip = d.querySelector('.strip button[data-scene="doing"]');
  console.log('chip found:', !!chip);
  try { chip.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); } catch (e) { errs.push('click threw: ' + e.message); }
  console.log('shown after:', [...d.querySelectorAll('.scene.show')].map(s => s.id));
  console.log('scenes total:', d.querySelectorAll('.scene').length, '| ids:', [...d.querySelectorAll('.scene')].map(s => s.id).join(','));
  console.log('errors:', errs.length ? errs : 'none');
  process.exit(0);
}, 800);
