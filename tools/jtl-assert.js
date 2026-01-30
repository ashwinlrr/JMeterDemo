#!/usr/bin/env node
const fs = require('fs');
const readline = require('readline');

const args = process.argv.slice(2);
const getArg = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i+1] : def; };

const jtlPath = getArg('--jtl');
const p95Lt = parseFloat(getArg('--p95-lt', '300'));
const p99Lt = parseFloat(getArg('--p99-lt', '500'));
const errLt = parseFloat(getArg('--error-rate-lt', '1.0')); // percent

if (!jtlPath || !fs.existsSync(jtlPath)) { console.error(`JTL not found: ${jtlPath}`); process.exit(2); }

(async () => {
  const rl = readline.createInterface({ input: fs.createReadStream(jtlPath), crlfDelay: Infinity });
  const durations = [];
  let total = 0, failures = 0, headerParsed = false, idxElapsed=-1, idxSuccess=-1;

  for await (const line of rl) {
    if (!line.trim()) continue;
    const cols = line.split(',');
    if (!headerParsed) { idxElapsed = cols.indexOf('elapsed'); idxSuccess = cols.indexOf('success'); headerParsed = true;
      if (idxElapsed === -1 || idxSuccess === -1) { idxElapsed = 1; idxSuccess = 7; }
      continue;
    }
    const elapsed = Number(cols[idxElapsed]);
    const success = String(cols[idxSuccess]).toLowerCase() === 'true';
    if (!Number.isNaN(elapsed)) durations.push(elapsed);
    total += 1; if (!success) failures += 1;
  }

  const percentile = (arr, p) => {
    if (!arr.length) return 0; const s = arr.slice().sort((a,b)=>a-b);
    const pos = (p/100)*(s.length-1), base = Math.floor(pos), rest = pos-base;
    return s[base+1] !== undefined ? Math.round(s[base] + rest*(s[base+1]-s[base])) : s[base];
  };

  const p95 = percentile(durations, 95), p99 = percentile(durations, 99);
  const errorRate = total ? (failures/total)*100 : 0;

  console.log(`Samples: ${total}, Failures: ${failures}, Error%: ${errorRate.toFixed(2)}`);
  console.log(`p95: ${p95} ms (limit ${p95Lt} ms), p99: ${p99} ms (limit ${p99Lt} ms)`);

  let failed = false;
  if (p95 > p95Lt) { console.error(`FAIL: p95=${p95} > ${p95Lt}`); failed = true; }
  if (p99 > p99Lt) { console.error(`FAIL: p99=${p99} > ${p99Lt}`); failed = true; }
  if (errorRate > errLt) { console.error(`FAIL: errorRate=${errorRate.toFixed(2)}% > ${errLt}%`); failed = true; }

  process.exit(failed ? 1 : 0);
})();
