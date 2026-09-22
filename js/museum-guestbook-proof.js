/* Local, short-lived proof-of-work worker. No visitor text enters this worker. */
const K = new Uint32Array([
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
]);
const words = new Uint32Array(64);
const rotate = (x, n) => (x >>> n) | (x << (32 - n));

// Only the first digest word is needed for the bounded (<= 24 bit) challenge.
// The full SHA-256 compression is still calculated for every message block.
function digestFirstWord(bytes, length) {
  const padded = Math.ceil((length + 9) / 64) * 64;
  bytes.fill(0, length, padded);
  bytes[length] = 0x80;
  const bitLength = length * 8;
  bytes[padded - 4] = bitLength >>> 24;
  bytes[padded - 3] = bitLength >>> 16;
  bytes[padded - 2] = bitLength >>> 8;
  bytes[padded - 1] = bitLength;
  let h0=0x6a09e667,h1=0xbb67ae85,h2=0x3c6ef372,h3=0xa54ff53a;
  let h4=0x510e527f,h5=0x9b05688c,h6=0x1f83d9ab,h7=0x5be0cd19;
  for (let offset=0; offset<padded; offset+=64) {
    for (let i=0; i<16; i++) {
      const p=offset+i*4;
      words[i]=(bytes[p]<<24)|(bytes[p+1]<<16)|(bytes[p+2]<<8)|bytes[p+3];
    }
    for (let i=16; i<64; i++) {
      const x=words[i-15],y=words[i-2];
      const s0=rotate(x,7)^rotate(x,18)^(x>>>3);
      const s1=rotate(y,17)^rotate(y,19)^(y>>>10);
      words[i]=(words[i-16]+s0+words[i-7]+s1)>>>0;
    }
    let a=h0,b=h1,c=h2,d=h3,e=h4,f=h5,g=h6,h=h7;
    for (let i=0; i<64; i++) {
      const s1=rotate(e,6)^rotate(e,11)^rotate(e,25);
      const t1=(h+s1+((e&f)^(~e&g))+K[i]+words[i])>>>0;
      const s0=rotate(a,2)^rotate(a,13)^rotate(a,22);
      const t2=(s0+((a&b)^(a&c)^(b&c)))>>>0;
      h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;
    }
    h0=(h0+a)>>>0;h1=(h1+b)>>>0;h2=(h2+c)>>>0;h3=(h3+d)>>>0;
    h4=(h4+e)>>>0;h5=(h5+f)>>>0;h6=(h6+g)>>>0;h7=(h7+h)>>>0;
  }
  return h0;
}

self.onmessage = ({ data }) => {
  const { prefix, bits, budgetMs } = data || {};
  if (typeof prefix !== 'string' || prefix.length > 1024 || !Number.isInteger(bits) || bits < 1 || bits > 24) {
    self.postMessage({ error:'invalid_challenge' });
    return;
  }
  const check = new Uint8Array(64);
  check.set([97,98,99]);
  if (digestFirstWord(check,3) !== 0xba7816bf || digestFirstWord(check,0) !== 0xe3b0c442) {
    self.postMessage({ error:'unavailable' });
    return;
  }
  const prefixBytes = new TextEncoder().encode(prefix);
  const bytes = new Uint8Array(Math.ceil((prefixBytes.length + 32) / 64) * 64);
  bytes.set(prefixBytes);
  // The server alone judges challenge expiry. A visitor's wall clock may be wrong;
  // only monotonic elapsed time limits the amount of local work.
  const budget = Number.isFinite(budgetMs) ? Math.max(0,Math.min(58000,budgetMs)) : 58000;
  const started = performance.now();
  let nonce = 0;
  function batch() {
    if (performance.now() - started >= budget) {
      self.postMessage({ error:'expired' });
      return;
    }
    const end = nonce + 4096;
    for (; nonce < end; nonce++) {
      const decimal = String(nonce);
      for (let i=0; i<decimal.length; i++) bytes[prefixBytes.length+i]=decimal.charCodeAt(i);
      const first = digestFirstWord(bytes,prefixBytes.length+decimal.length);
      if ((first >>> (32-bits)) === 0) {
        self.postMessage({ nonce:decimal });
        return;
      }
    }
    setTimeout(batch,0);
  }
  batch();
};
