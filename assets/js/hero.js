/* ============================================================
   INK BLOOM — GPU ink-in-water hero (single fullscreen shader)
   Black ink blooms → forms flowing lines → dissolves → photo.
   One draw call. Mobile-first. Graceful CSS fallback.
   ============================================================ */
import * as THREE from "../vendor/three.module.min.js";

const heroEl   = document.getElementById("hero");
const canvas   = document.getElementById("ink");
const loaderEl = document.getElementById("heroLoader");
const INTRO    = 2.7;                       // seconds of intro
let   revealed = false;

function fireReveal(){
  if (revealed) return;
  revealed = true;
  heroEl.classList.add("revealed");
  window.dispatchEvent(new CustomEvent("herobloom:reveal"));
  if (loaderEl){ loaderEl.querySelector("span").style.width = "100%"; setTimeout(()=>loaderEl.remove(), 400); }
}

/* ---------- fallback (no WebGL / errors) ---------- */
function fallback(){
  heroEl.classList.add("no-webgl");
  canvas.style.display = "none";
  // gentle timed reveal preserving the "bloom → photo" feeling
  setTimeout(fireReveal, 1400);
}

let gl;
try { gl = canvas.getContext("webgl2") || canvas.getContext("webgl"); } catch(e){}
if (!gl){ fallback(); }
else { start(); }

function start(){
  let renderer;
  try{
    renderer = new THREE.WebGLRenderer({ canvas, context:gl, antialias:false, alpha:false, powerPreference:"low-power" });
  }catch(e){ fallback(); return; }

  const isMobile = matchMedia("(max-width:820px)").matches;
  const DPR = Math.min(window.devicePixelRatio||1, isMobile ? 1.5 : 2);
  renderer.setPixelRatio(DPR);

  const scene = new THREE.Scene();
  const cam   = new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  const geo   = new THREE.PlaneGeometry(2,2);

  const uniforms = {
    uTime:     { value: 0 },
    uProgress: { value: 0 },      // 0..1 bloom+form
    uReveal:   { value: 0 },      // 0..1 dissolve
    uRes:      { value: new THREE.Vector2(1,1) },
    uSeed:     { value: Math.random()*10.0 }
  };

  const frag = `
  precision highp float;
  uniform float uTime, uProgress, uReveal, uSeed;
  uniform vec2  uRes;

  // palette — dark concrete + molten gold
  const vec3 CONCRETE = vec3(0.043,0.039,0.051);
  const vec3 CONCRETE2= vec3(0.078,0.067,0.086);
  const vec3 BRONZE = vec3(0.55,0.36,0.16);
  const vec3 GOLD   = vec3(0.85,0.63,0.30);
  const vec3 GOLDLT = vec3(0.97,0.83,0.51);

  float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
  float noise(vec2 p){
    vec2 i=floor(p), f=fract(p);
    float a=hash(i), b=hash(i+vec2(1,0)), c=hash(i+vec2(0,1)), d=hash(i+vec2(1,1));
    vec2 u=f*f*(3.0-2.0*f);
    return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);
  }
  float fbm(vec2 p){
    float v=0.0, a=0.5;
    for(int i=0;i<5;i++){ v+=a*noise(p); p=p*2.02+7.1; a*=0.5; }
    return v;
  }
  // domain-warped ink concentration field
  float inkField(vec2 p, float t){
    vec2 q = vec2( fbm(p + vec2(0.0,0.0) + t*0.06),
                   fbm(p + vec2(5.2,1.3) - t*0.05) );
    vec2 r = vec2( fbm(p + 3.4*q + vec2(1.7,9.2) + t*0.03),
                   fbm(p + 3.4*q + vec2(8.3,2.8) - t*0.04) );
    return fbm(p + 3.2*r);
  }

  void main(){
    vec2 uv = gl_FragCoord.xy / uRes.xy;
    vec2 p  = uv;
    p.x *= uRes.x / uRes.y;                 // aspect correct
    vec2 c  = vec2(0.5 * uRes.x/uRes.y, 0.52);

    float prog = uProgress;
    float t    = uTime + uSeed;

    // --- ink concentration ---
    float f = inkField(p*2.6, t);

    // blooming mask: ink grows outward from a few drops as prog rises
    float dist = length(p - c);
    float grow = smoothstep(0.0, 1.15, prog*1.45 - dist*0.85);
    // secondary drops
    grow += 0.6*smoothstep(0.0,1.0, prog*1.5 - length(p-c-vec2(0.22,0.10))*1.4);
    grow += 0.5*smoothstep(0.0,1.0, prog*1.55 - length(p-c-vec2(-0.26,-0.06))*1.5);
    grow = clamp(grow,0.0,1.0);

    // ink body: threshold the field, softened, gated by growth
    float edge = 0.53 - prog*0.06;
    float body = smoothstep(edge+0.09, edge-0.06, f) * grow;

    // delicate filament lines that emerge in the forming phase
    float linePhase = smoothstep(0.45,0.9,prog);
    float iso = abs(fract(f*7.0 + 0.5) - 0.5);
    float lines = smoothstep(0.055,0.0, iso) * grow * linePhase * 0.8;

    float ink = clamp(max(body, lines*0.9), 0.0, 1.0);

    // --- dissolve / reveal: ink recedes, breaks apart, fades up ---
    float dis = uReveal;
    float breakup = smoothstep(0.35,0.65, f + (uv.y*0.5) ); // upper/lighter areas leave first
    float fade = 1.0 - smoothstep(0.0,1.0, dis*1.6 - breakup*0.6);
    ink *= fade; body *= fade; lines *= fade;

    // --- compose colour: molten gold ink in dark water ---
    float grain = (hash(gl_FragCoord.xy)*0.5 - 0.25)*0.02;
    // dark concrete base, warm light from top, cinematic vignette
    vec3 col = mix(CONCRETE, CONCRETE2, smoothstep(0.95,0.0,dist));
    col += vec3(0.055,0.038,0.017) * smoothstep(0.9,0.0,length(p-vec2(c.x,0.12)));
    col *= 1.0 - smoothstep(0.5,1.2,dist)*0.55;
    col += grain;

    // molten gold glow (additive): bronze cores, bright gold filaments
    vec3 glowCol = mix(BRONZE, GOLD, smoothstep(0.15,0.75,ink));
    glowCol = mix(glowCol, GOLDLT, clamp(lines*0.9,0.0,1.0));
    col += glowCol * (body*0.85 + lines*1.15);

    // deep pooling: darken dense cores for wet depth
    col = mix(col, col*0.45, smoothstep(0.62,1.0,f) * body * 0.5);

    gl_FragColor = vec4(col, 1.0);
  }`;

  const vert = `void main(){ gl_Position = vec4(position,1.0); }`;

  let mat;
  try{
    mat = new THREE.ShaderMaterial({ uniforms, vertexShader:vert, fragmentShader:frag });
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);
    // force a compile to catch shader errors early
    renderer.compile(scene, cam);
  }catch(e){ console.warn("Ink shader failed", e); renderer.dispose(); fallback(); return; }

  function resize(){
    const w = heroEl.clientWidth, h = heroEl.clientHeight;
    renderer.setSize(w, h, false);
    uniforms.uRes.value.set(w*DPR, h*DPR);
  }
  resize();
  window.addEventListener("resize", resize, { passive:true });

  /* ---------- timeline ---------- */
  let startT = null, raf = 0, running = true, fpsSamples = [], degraded = false;

  function stop(){ running=false; cancelAnimationFrame(raf); }
  function go(){ if(!running){ running=true; startT=null; raf=requestAnimationFrame(frame);} }

  function frame(now){
    if(!running) return;
    if(startT===null) startT = now;
    const el = (now - startT)/1000;
    uniforms.uTime.value = el;

    // intro progress 0..1
    const p = Math.min(el / INTRO, 1);
    // ease
    const ep = p<0.5 ? 4*p*p*p : 1-Math.pow(-2*p+2,3)/2;
    uniforms.uProgress.value = ep;

    if (loaderEl) loaderEl.querySelector("span").style.width = (p*100).toFixed(0)+"%";

    // begin reveal near the end
    if (p >= 0.66){
      const rp = Math.min((el - INTRO*0.66)/(INTRO*0.5), 1);
      uniforms.uReveal.value = rp<0.5 ? 2*rp*rp : 1-Math.pow(-2*rp+2,2)/2;
      if (rp > 0.35) fireReveal();
      if (rp >= 1){                       // idle: keep a whisper of drift, low cost
        uniforms.uProgress.value = 1; uniforms.uReveal.value = 1;
      }
    }

    // perf guard on first ~30 frames
    if (!degraded && el < 1.2){
      fpsSamples.push(now);
      if (fpsSamples.length > 20){
        const dt = (fpsSamples[fpsSamples.length-1]-fpsSamples[0]) / (fpsSamples.length-1);
        if (dt > 34){ degraded=true; renderer.setPixelRatio(Math.max(1, DPR*0.66)); resize(); }
      }
    }

    renderer.render(scene, cam);

    // once fully revealed, stop rendering to save battery (photo is static)
    if (uniforms.uReveal.value >= 1 && el > INTRO*1.25){ stop(); return; }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  // pause when hero scrolled away
  const io = new IntersectionObserver((es)=>{
    es.forEach(e=>{ if(e.isIntersecting && uniforms.uReveal.value<1) go(); else if(!e.isIntersecting) stop(); });
  }, { threshold:0.02 });
  io.observe(heroEl);

  // skip: scroll or click fast-forwards
  function skip(){
    if (revealed) return;
    // jump timeline forward
    startT = performance.now() - INTRO*1.2*1000;
  }
  document.getElementById("skipHero")?.addEventListener("click", ()=>{
    skip(); document.getElementById("ethos")?.scrollIntoView({behavior:"smooth"});
  });
  window.addEventListener("wheel", skip, { passive:true, once:true });
  window.addEventListener("touchmove", skip, { passive:true, once:true });

  // safety: never leave the intro stuck
  setTimeout(fireReveal, (INTRO+1.2)*1000);
}
