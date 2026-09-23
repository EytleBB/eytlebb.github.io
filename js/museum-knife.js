// Adapted from the supplied classic-knife-v6-right-hand.html demo.
// The model and pose rendering stay in a transparent canvas over the museum.
/* V6 — classic knife + right white fabric glove only. No environment or UI dependencies. */
const VERT=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPosition;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec2 aUV;
layout(location=3) in vec3 aColor;
uniform mat4 uMVP;uniform mat4 uModel;
out vec3 vWorld;out vec3 vNormal;out vec2 vUV;out vec3 vLocal;out vec3 vColor;
void main(){vec4 p=uModel*vec4(aPosition,1.0);vWorld=p.xyz;vNormal=transpose(inverse(mat3(uModel)))*aNormal;
vUV=aUV;vLocal=aPosition;vColor=aColor;gl_Position=uMVP*vec4(aPosition,1.0);}`;
const FRAG=`#version 300 es
precision highp float;
in vec3 vWorld;in vec3 vNormal;in vec2 vUV;in vec3 vLocal;in vec3 vColor;out vec4 fragColor;
uniform vec4 uBase;uniform float uMetal;uniform float uRough;uniform float uNormalScale;
uniform sampler2D uBaseMap;uniform sampler2D uMRMap;uniform sampler2D uNormalMap;
uniform bool uHasBase;uniform bool uHasMR;uniform bool uHasNormal;uniform int uSurface;
const float PI=3.14159265359;
vec3 fresnel(float x,vec3 f0){return f0+(1.0-f0)*pow(clamp(1.0-x,0.0,1.0),5.0);}
vec3 light(vec3 N,vec3 V,vec3 L,vec3 radiance,vec3 base,float metal,float rough){
 vec3 H=normalize(V+L);float nv=max(dot(N,V),0.001),nl=max(dot(N,L),0.0),nh=max(dot(N,H),0.0),hv=max(dot(H,V),0.0);
 float a=rough*rough,a2=a*a,d=(nh*nh*(a2-1.0)+1.0);float D=a2/(PI*d*d+0.00001);
 float k=(rough+1.0);k=k*k/8.0;float G=(nv/(nv*(1.0-k)+k))*(nl/(nl*(1.0-k)+k));
 vec3 F=fresnel(hv,mix(vec3(0.04),base,metal));vec3 spec=D*G*F/(4.0*nv*max(nl,.001)+.00001);
 return ((1.0-F)*(1.0-metal)*base/PI+spec)*radiance*nl;
}
vec3 studio(vec3 R,float rough){
 float sky=smoothstep(-.4,.8,R.y);vec3 c=mix(vec3(.12,.13,.145),vec3(.39,.42,.46),sky);
 float power=mix(38.0,3.0,rough);
 c+=vec3(2.65,2.53,2.35)*pow(max(dot(R,normalize(vec3(-.42,.64,.78))),0.0),power*.38);
 c+=vec3(1.5,1.63,1.87)*pow(max(dot(R,normalize(vec3(.6,-.24,.8))),0.0),power*.55);
 c+=vec3(1.6)*pow(max(dot(R,normalize(vec3(-.92,.10,-.25))),0.0),power);return c;
}
vec3 mappedNormal(vec3 N){
 vec3 q1=dFdx(vWorld),q2=dFdy(vWorld);vec2 st1=dFdx(vUV),st2=dFdy(vUV);
 vec3 T=q1*st2.y-q2*st1.y;vec3 B=-q1*st2.x+q2*st1.x;float k=max(dot(T,T),dot(B,B));if(k<1e-12)return N;
 T*=inversesqrt(k);B*=inversesqrt(k);vec3 nn=texture(uNormalMap,vUV).rgb*2.0-1.0;nn.xy*=uNormalScale;return normalize(mat3(T,B,N)*nn);
}
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.0,1.0);}
void main(){
 vec3 N=normalize(vNormal);if(!gl_FrontFacing)N=-N;
 if(uHasNormal)N=mappedNormal(N);
 vec3 V=normalize(-vWorld),base=uBase.rgb;
 if(uHasBase)base*=pow(texture(uBaseMap,vUV).rgb,vec3(2.2));
 float metal=uMetal,rough=uRough;
 if(uHasMR){vec4 mr=texture(uMRMap,vUV);metal*=mr.b;rough*=mr.g;}
 rough=clamp(rough,.10,.98);
 if(uSurface==7){
   // Subtle woven cotton. Derivative attenuation suppresses distant moire.
   vec2 uv=vUV*vec2(660.,340.);vec2 a=1.-smoothstep(vec2(.45),vec2(1.5),fwidth(uv));
   float weave=sin(uv.x*6.283185)*sin(uv.y*6.283185)*a.x*a.y;
   base*=.975+.025*weave;
   // Fine back-of-glove sewing lines and a ribbed cuff, no combat armour pads.
   float across=vLocal.x;
   float along=vLocal.y;
   float sd=min(min(abs(across+.36),abs(across+.055)),abs(across-.25));
   float aa=max(fwidth(across)*.8,.0018);
   float stitch=1.-smoothstep(.002,.005+aa,sd);
   float lengthMask=smoothstep(-.23,-.17,along)*(1.-smoothstep(.16,.23,along));
   float backMask=smoothstep(.38,.45,vLocal.z);
   base*=1.-.26*stitch*lengthMask*backMask;
   float cuffMask=smoothstep(-1.28,-1.23,vLocal.x)*(1.-smoothstep(-1.015,-.95,vLocal.x));
   float theta=atan(vLocal.z-.265,vLocal.y+.02);
   float rib=sin(theta*44.)*.5+.5;
   base*=1.-.045*rib*cuffMask;
   float hem=(1.-smoothstep(.003,.008+fwidth(vLocal.x),abs(vLocal.x+1.09)))*.13;
   base*=1.-hem;
 }
 vec3 color=light(N,V,normalize(vec3(-.4,.8,1.0)),vec3(2.15,2.05,1.9),base,metal,rough);
 color+=light(N,V,normalize(vec3(.8,.24,-1.0)),vec3(2.0,2.1,2.3),base,metal,rough);
 color+=light(N,V,normalize(vec3(-1.0,-.3,.6)),vec3(.6,.65,.72),base,metal,rough);
 vec3 f0=mix(vec3(.04),base,metal);float nv=max(dot(N,V),0.0);vec3 F=fresnel(nv,f0),R=reflect(-V,N);
 color+=studio(R,rough)*(F*(.82-.26*rough));
 color+=base*(1.0-metal)*(.28+.16*max(N.y,0.0));
 // Cloth cavity shading is baked from the hand surface, not painted hard armour.
 color*=vColor;
 fragColor=vec4(pow(aces(color*1.04),vec3(1.0/2.2)),1.0);
}`;
function identity(){return new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);}
function mul(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++){let v=0;for(let k=0;k<4;k++)v+=a[k*4+r]*b[c*4+k];o[c*4+r]=v;}return o;}
function translate(x,y,z){let m=identity();m[12]=x;m[13]=y;m[14]=z;return m;}
function rotX(a){const c=Math.cos(a),s=Math.sin(a);return new Float32Array([1,0,0,0,0,c,s,0,0,-s,c,0,0,0,0,1]);}
function rotY(a){const c=Math.cos(a),s=Math.sin(a);return new Float32Array([c,0,-s,0,0,1,0,0,s,0,c,0,0,0,0,1]);}
function rotZ(a){const c=Math.cos(a),s=Math.sin(a);return new Float32Array([c,s,0,0,-s,c,0,0,0,0,1,0,0,0,0,1]);}
function perspective(fov,aspect,near,far){const f=1/Math.tan(fov/2),nf=1/(near-far);return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)*nf,-1,0,0,2*far*near*nf,0]);}
function parseGLB(buffer){
 const d=new DataView(buffer);if(d.getUint32(0,true)!==0x46546c67||d.getUint32(4,true)!==2)throw Error('不是有效的 GLB 2.0 文件');
 let offset=12,doc=null,bin=null;
 while(offset<buffer.byteLength){const n=d.getUint32(offset,true),type=d.getUint32(offset+4,true);offset+=8;if(type===0x4e4f534a)doc=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,offset,n)));if(type===0x004e4942)bin=buffer.slice(offset,offset+n);offset+=n;}
 if(!doc||!bin)throw Error('GLB 缺少模型数据');return {doc,bin};
}
const PI=Math.PI, DEG=PI/180;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
function scaling(x,y=x,z=x){const m=identity();m[0]=x;m[5]=y;m[10]=z;return m;}
function rotation(r){return mul(rotZ(r[2]*DEG),mul(rotY(r[1]*DEG),rotX(r[0]*DEG)));}

class KnifeDemo {
 constructor(canvas,buffer,animation){
  this.canvas=canvas;this.clip=animation;this.resources=[];
  this.gl=canvas.getContext('webgl2',{antialias:true,alpha:true,premultipliedAlpha:false,powerPreference:'high-performance'});
  if(!this.gl)throw new Error('浏览器未启用 WebGL 2，无法显示 3D 刀与手套。');
  Object.assign(this,parseGLB(buffer));this.textures=[];this.draws=[];this.handR=[];
  this.state='hidden';this.time=0;this.speed=1;this.paused=false;this.count=0;this.scale=1;this.idleTime=0;
  this.reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
  this.pendingDraw=false;
  this.program=this.programFrom(VERT,FRAG);this.loc={};
  for(const n of ['uMVP','uModel','uBase','uMetal','uRough','uNormalScale','uBaseMap','uMRMap','uNormalMap','uHasBase','uHasMR','uHasNormal','uSurface'])this.loc[n]=this.gl.getUniformLocation(this.program,n);
  const gl=this.gl;gl.useProgram(this.program);gl.uniform1i(this.loc.uBaseMap,0);gl.uniform1i(this.loc.uMRMap,1);gl.uniform1i(this.loc.uNormalMap,2);gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);
  this.uploadModel();this.resizeObserver=new ResizeObserver(()=>{this.resize();if(this.loaded)this.render();});this.resizeObserver.observe(canvas);this.resize();
  this.ready=this.loadTextures().then(()=>{this.loaded=true;this.render();return this;});
 }
 programFrom(v,f){const gl=this.gl,p=gl.createProgram();for(const [type,code] of [[gl.VERTEX_SHADER,v],[gl.FRAGMENT_SHADER,f]]){const s=gl.createShader(type);gl.shaderSource(s,code);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));gl.attachShader(p,s);gl.deleteShader(s);}gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));return p;}
 upload(g,mat){
  const gl=this.gl,vao=gl.createVertexArray();gl.bindVertexArray(vao);const buffs=[];
  for(const [loc,data,size]of [[0,g.p,3],[1,g.n,3],[2,g.uv,2],[3,g.color,3]]){
   if(!data){gl.disableVertexAttribArray(loc);if(loc===3)gl.vertexAttrib3f(3,1,1,1);continue;}
   const b=gl.createBuffer();buffs.push(b);gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,0,0);
  }
  const ib=gl.createBuffer();buffs.push(ib);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);const indices=new Uint32Array(g.i);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,indices,gl.STATIC_DRAW);gl.bindVertexArray(null);
  const o={vao,buffs,count:indices.length,mat};this.resources.push(o);return o;
 }
 uploadModel(){
  const read=idx=>{const a=this.doc.accessors[idx],v=this.doc.bufferViews[a.bufferView],C={5126:Float32Array,5123:Uint16Array,5125:Uint32Array}[a.componentType];if(!C)throw Error('不支持的模型通道');return new C(this.bin,(v.byteOffset||0)+(a.byteOffset||0),a.count*{SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type]);};
  this.doc.meshes.forEach((m,mi)=>m.primitives.forEach(p=>{
   const a=p.attributes,o=this.upload({p:read(a.POSITION),n:read(a.NORMAL),uv:read(a.TEXCOORD_0),i:read(p.indices),color:a.COLOR_0!==undefined?read(a.COLOR_0):null},this.doc.materials[p.material]);o.meshIndex=mi;o.hand=m.extras?.hand;
   (m.extras?.hand==='right'?this.handR:this.draws).push(o);
  }));
 }
 async loadTextures(){this.textures=await Promise.all(this.doc.images.map(async img=>{
  const v=this.doc.bufferViews[img.bufferView],blob=new Blob([new Uint8Array(this.bin,v.byteOffset||0,v.byteLength)],{type:img.mimeType}),url=URL.createObjectURL(blob),im=new Image();
  try{await new Promise((res,rej)=>{im.onload=res;im.onerror=()=>rej(Error('内置贴图未能解码'));im.src=url;});return this.texture(im);}finally{URL.revokeObjectURL(url);}
 }));}
 texture(image){const gl=this.gl,t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);const e=gl.getExtension('EXT_texture_filter_anisotropic');if(e)gl.texParameterf(gl.TEXTURE_2D,e.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(4,gl.getParameter(e.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));return t;}
 setMaterial(m){const gl=this.gl,l=this.loc,p=m.pbrMetallicRoughness||{};gl.uniform4fv(l.uBase,p.baseColorFactor||[1,1,1,1]);gl.uniform1f(l.uMetal,p.metallicFactor??1);gl.uniform1f(l.uRough,p.roughnessFactor??1);gl.uniform1f(l.uNormalScale,m.normalTexture?.scale??1);gl.uniform1i(l.uSurface,m.extras?.surface||0);
  [[p.baseColorTexture,0,'uHasBase'],[p.metallicRoughnessTexture,1,'uHasMR'],[m.normalTexture,2,'uHasNormal']].forEach(([map,u,k])=>{const t=map?this.textures[this.doc.textures[map.index].source]:null;gl.uniform1i(l[k],!!t);gl.activeTexture(gl.TEXTURE0+u);gl.bindTexture(gl.TEXTURE_2D,t);});
 }
 drawMesh(d,matrix,vp){const gl=this.gl;this.setMaterial(d.mat);gl.uniformMatrix4fv(this.loc.uModel,false,matrix);gl.uniformMatrix4fv(this.loc.uMVP,false,mul(vp,matrix));gl.bindVertexArray(d.vao);gl.drawElements(gl.TRIANGLES,d.count,gl.UNSIGNED_INT,0);}
 resize(){const r=this.canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,1.75),cap=Math.sqrt(2500000/Math.max(1,r.width*r.height));this.canvas.width=Math.max(1,Math.round(r.width*Math.min(dpr,cap)));this.canvas.height=Math.max(1,Math.round(r.height*Math.min(dpr,cap)));}
 sample(t){const k=this.clip.keys;t=clamp(t,0,this.clip.duration);let i=0;while(i<k.length-2&&t>k[i+1].t)i++;const a=k[i],b=k[i+1],u=(t-a.t)/(b.t-a.t),u2=u*u,u3=u2*u;
  const interpolate=prop=>a[prop].map((v,j)=>{const prev=k[Math.max(0,i-1)],next=k[Math.min(k.length-1,i+2)];const s0=i===0?0:(b[prop][j]-prev[prop][j])/(b.t-prev.t),s1=i+1===k.length-1?0:(next[prop][j]-a[prop][j])/(next.t-a.t),dt=b.t-a.t;return (2*u3-3*u2+1)*v+(u3-2*u2+u)*dt*s0+(-2*u3+3*u2)*b[prop][j]+(u3-u2)*dt*s1;});
  return {p:interpolate('p'),r:interpolate('r'),grip:lerp(a.grip,b.grip,smooth(u))};
 }
 pose(){let pose;if(this.state==='drawing')pose=this.sample(this.time);else if(this.state==='holstering'){const t=smooth(this.time/.18),s=this.lowerFrom||this.sample(this.clip.duration);pose={p:s.p.map((v,i)=>lerp(v,[.54,-.90,-.42][i],t)),r:s.r.map((v,i)=>v+[-18,-16,28][i]*t),grip:1};}else pose=this.sample(this.clip.duration);
  if(this.state==='idle'&&!this.paused&&!this.reduceMotion){pose.p[1]+=Math.sin(this.idleTime*1.7)*.0016;pose.p[0]+=Math.sin(this.idleTime*.8)*.0008;}
  return pose;
 }

 render(){if(!this.loaded)return;const gl=this.gl,c=this.canvas,aspect=c.width/c.height;
  gl.viewport(0,0,c.width,c.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(this.program);
  if(this.state!=='hidden'){
   // V4: keep the reference orientation while anchoring the grip in screen space.
   // A fixed horizontal FOV made the same knife tiny in portrait and clipped in
   // ultrawide layouts. Camera FOV and the right grip anchor share one layout.
   const portrait=smooth((1.15-aspect)/.55),vfov=lerp(52,58,portrait)*DEG;
   const vmp=perspective(vfov,aspect,.025,6),tanHalf=Math.tan(vfov/2);
   const screenPoint=(x,y,z)=>[(x*2-1)*(-z)*tanHalf*aspect,(1-y*2)*(-z)*tanHalf,z];
   const fit=lerp(1,.85,portrait),rest=this.clip.keys.at(-1);
   const anchor=screenPoint(lerp(.76,.72,portrait),lerp(.78,.645,portrait),rest.p[2]);
   const p=this.pose();
   // Match the photographed screen-space lean, not just a world Euler angle.
   // Perspective otherwise leans a right-anchored knife further to the left
   // on widescreen. Solve the projected handle axis for 12 degrees from upright.
   const lean=(this.clip.view?.restScreenLeanDegrees??12)*DEG;
   const k=Math.tan(rest.r[1]*DEG)*(anchor[0]*Math.cos(lean)+anchor[1]*Math.sin(lean))/(-anchor[2]);
   const restRoll=(Math.acos(clamp(k,-.99,.99))+lean)/DEG-360;
   p.r[2]+=restRoll-rest.r[2];
   for(let i=0;i<3;i++)p.p[i]=anchor[i]+(p.p[i]-rest.p[i])*fit;
   const root=mul(translate(...p.p),mul(rotation(p.r),scaling(.065*this.scale*fit)));
   this.currentProjection=vmp;
   this.currentRoot=root;
   // Preserve the V4 grip socket: the knife edge faces left in the upright rest pose.
   const blade=mul(root,mul(rotX(PI),translate(2,0,0)));

   for(const d of this.draws)this.drawMesh(d,blade,vmp);
   for(const d of this.handR)this.drawMesh(d,root,vmp);

  }
  gl.bindVertexArray(null);
 }
 setState(s){this.state=s;this.time=0;}
 beginDraw(){this.pendingDraw=false;this.count++;this.setState('drawing');this.idleTime=0;}
 triggerDraw(){if(!this.loaded)return;this.paused=false;if(this.state==='hidden'){this.beginDraw();return;}if(this.state==='holstering'){this.pendingDraw=true;return;}this.lowerFrom=this.pose();this.pendingDraw=true;this.setState('holstering');}
 holster(){if(!this.loaded||this.state==='hidden')return;this.paused=false;this.pendingDraw=false;this.lowerFrom=this.pose();this.setState('holstering');}
 setSpeed(v){this.speed=clamp(Number(v)||1,.1,2);}
 setPaused(v){this.paused=!!v;}
 scrub(t){this.paused=true;this.state='drawing';this.time=clamp(Number(t)||0,0,this.clip.duration);this.render();}
 show(){this.paused=false;this.pendingDraw=false;this.setState('idle');this.idleTime=0;this.render();}
 update(dt){if(this.paused)return;this.time+=dt*this.speed;this.idleTime+=dt;
  if(this.state==='drawing'&&this.time>=this.clip.duration){this.setState('idle');this.idleTime=0;}
  else if(this.state==='holstering'&&this.time>=.18){if(this.pendingDraw)this.beginDraw();else this.setState('hidden');}
 }
 destroy(){this.resizeObserver.disconnect();for(const d of this.resources){this.gl.deleteVertexArray(d.vao);for(const b of d.buffs)this.gl.deleteBuffer(b);}for(const t of this.textures)this.gl.deleteTexture(t);this.gl.deleteProgram(this.program);this.loaded=false;}
}

const DRAW_ANIMATION = {
  "duration": 0.6,
  "keys": [
    {
      "t": 0.0,
      "p": [
        0.54,
        -0.9,
        -0.42
      ],
      "r": [
        -44,
        -72,
        18
      ],
      "grip": 0.62
    },
    {
      "t": 0.06,
      "p": [
        0.46,
        -0.7,
        -0.44
      ],
      "r": [
        -36,
        -78,
        -10
      ],
      "grip": 0.6
    },
    {
      "t": 0.12,
      "p": [
        0.39,
        -0.48,
        -0.48
      ],
      "r": [
        -25,
        -66,
        -58
      ],
      "grip": 0.56
    },
    {
      "t": 0.18,
      "p": [
        0.31,
        -0.24,
        -0.56
      ],
      "r": [
        -6,
        -40,
        -132
      ],
      "grip": 0.62
    },
    {
      "t": 0.24,
      "p": [
        0.24,
        -0.11,
        -0.65
      ],
      "r": [
        12,
        -6,
        -207
      ],
      "grip": 0.82
    },
    {
      "t": 0.31,
      "p": [
        0.23,
        -0.12,
        -0.665
      ],
      "r": [
        23,
        19,
        -270
      ],
      "grip": 1
    },
    {
      "t": 0.4,
      "p": [
        0.267,
        -0.18,
        -0.64
      ],
      "r": [
        20,
        18,
        -265
      ],
      "grip": 1
    },
    {
      "t": 0.5,
      "p": [
        0.283,
        -0.203,
        -0.631
      ],
      "r": [
        18.3,
        14.4,
        -258.6
      ],
      "grip": 1
    },
    {
      "t": 0.6,
      "p": [
        0.285,
        -0.205,
        -0.63
      ],
      "r": [
        18,
        14,
        -258
      ],
      "grip": 1
    }
  ],
  "view": {
    "restScreenLeanDegrees": 12
  }
};

const KNIFE_MODEL_URL = new URL('../models/classic-knife-v6-right-hand.glb', import.meta.url);

export function createMuseumKnifeController(canvas) {
  let demo = null;
  let loading = null;
  let equipped = false;

  function draw() {
    if (!demo) return;
    if (demo.reduceMotion) demo.show();
    else demo.triggerDraw();
  }

  function load() {
    if (loading || demo) return;
    loading = fetch(KNIFE_MODEL_URL)
      .then(response => {
        if (!response.ok) throw new Error(`Knife model: ${response.status}`);
        return response.arrayBuffer();
      })
      .then(buffer => new KnifeDemo(canvas, buffer, DRAW_ANIMATION).ready)
      .then(loaded => {
        demo = loaded;
        if (equipped) draw();
      })
      .catch(error => { console.warn('Museum knife unavailable', error); })
      .finally(() => { loading = null; });
  }

  function equip() {
    if (equipped && (demo || loading)) return;
    const changed = !equipped;
    equipped = true;
    if (demo) {
      if (changed) draw();
    } else load();
  }

  function stow() {
    if (!equipped) return;
    equipped = false;
    if (!demo) return;
    if (demo.reduceMotion) {
      demo.setState('hidden');
      demo.render();
    } else demo.holster();
  }

  return {
    get equipped() { return equipped; },
    equip,
    stow,
    toggle() { if (equipped) stow(); else equip(); },
    update(dt, visible) {
      if (!visible || !demo || demo.state === 'hidden') return;
      demo.update(dt);
      demo.render();
    },
    destroy() { demo?.destroy(); },
  };
}
