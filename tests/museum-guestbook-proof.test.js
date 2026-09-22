const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { performance } = require('node:perf_hooks');

const source = fs.readFileSync(path.join(__dirname,'../js/museum-guestbook-proof.js'),'utf8');
function environment(postMessage=()=>{},overrides={}) {
  const context = vm.createContext({Uint8Array,Uint32Array,TextEncoder,Date,Math,Number,String,Error,setTimeout,clearTimeout,performance,self:{postMessage},...overrides});
  vm.runInContext(source,context);
  return context;
}

test('local proof SHA-256 agrees with Node crypto across padding and Unicode boundaries',() => {
  const context = environment();
  const messages = ['', 'abc', 'museum-visitor:0', '画廊观众：世界🌿99'];
  for (const length of [54,55,56,57,63,64,65,119,120,127,128,191,512,1024]) {
    messages.push('a'.repeat(length));
    messages.push('馆'.repeat(length)+'999999');
  }
  for (const message of messages) {
    const encoded = new TextEncoder().encode(message);
    context.testBytes = new Uint8Array(Math.ceil((encoded.length+9)/64)*64);
    context.testBytes.set(encoded);
    context.testLength = encoded.length;
    const actual = vm.runInContext('digestFirstWord(testBytes,testLength)',context);
    const expected = crypto.createHash('sha256').update(message).digest().readUInt32BE(0);
    assert.equal(actual,expected,`SHA-256 mismatch at ${encoded.length} bytes`);
  }
});

test('worker returns valid decimal nonces for single-block and multi-block prefix challenges',async () => {
  for (const prefix of ['museum-proof:','x'.repeat(70)+':','展览会'.repeat(28)+':']) {
    const bits = 10;
    const result = await new Promise((resolve,reject) => {
      const timeout = setTimeout(() => reject(new Error('Proof worker timed out')),10000);
      const context = environment(message => { clearTimeout(timeout); resolve(message); });
      context.self.onmessage({data:{prefix,bits,expiresAt:Date.now()+5000}});
    });
    assert.equal(result.error,undefined);
    assert.match(result.nonce,/^(0|[1-9][0-9]*)$/);
    const hash = crypto.createHash('sha256').update(prefix+result.nonce).digest();
    assert.equal(hash.readUInt32BE(0) >>> (32-bits),0);
  }
});

test('worker rejects excessive work and expires without returning an invalid proof',() => {
  for (const bits of [0,-1,25,31,1.5]) {
    let message;
    const context = environment(result => { message=result; });
    context.self.onmessage({data:{prefix:'museum:',bits,expiresAt:Date.now()+60000}});
    assert.equal(message.error,'invalid_challenge');
    assert.equal(message.nonce,undefined);
  }
  let message;
  const context = environment(result => { message=result; });
  context.self.onmessage({data:{prefix:'museum:',bits:18,budgetMs:0}});
  assert.equal(message.error,'expired');
  assert.equal(message.nonce,undefined);
});


test('a skewed visitor wall clock does not invalidate a server challenge',async () => {
  const prefix = 'server-clock-is-authoritative:';
  const bits = 10;
  class SkewedDate extends Date { static now() { return Date.now()+20*365*24*60*60*1000; } }
  const result = await new Promise((resolve,reject) => {
    const timeout = setTimeout(() => reject(new Error('Proof worker timed out')),10000);
    const context = environment(message => { clearTimeout(timeout); resolve(message); },{Date:SkewedDate});
    context.self.onmessage({data:{prefix,bits,expiresAt:Date.now()+5000,budgetMs:5000}});
  });
  assert.equal(result.error,undefined);
  assert.match(result.nonce,/^(0|[1-9][0-9]*)$/);
  assert.equal(crypto.createHash('sha256').update(prefix+result.nonce).digest().readUInt32BE(0) >>> (32-bits),0);
});

test('an exhausted monotonic work budget expires independently of wall time',() => {
  let time = 0;
  let message;
  const context = environment(result => { message=result; },{performance:{now:() => time++}});
  context.self.onmessage({data:{prefix:'museum:',bits:18,budgetMs:1,expiresAt:Date.now()+60000}});
  assert.equal(message.error,'expired');
  assert.equal(message.nonce,undefined);
});
