/* Lightweight script for legal / 404 pages: nav, menu, year, gold dust */
(function(){
  "use strict";
  const $ = (s)=>document.querySelector(s);
  const reduce = matchMedia("(prefers-reduced-motion:reduce)").matches;
  document.body.classList.remove("preload");
  const yr = $("#yr"); if (yr) yr.textContent = new Date().getFullYear();

  const nav = $("#nav");
  if (nav){
    const onScroll = ()=> nav.classList.toggle("solid", window.scrollY > 40);
    onScroll(); window.addEventListener("scroll", onScroll, { passive:true });
  }
  const burger = $("#burger"), menu = $("#menu");
  if (burger && menu){
    const open = ()=>{ menu.classList.add("open"); document.body.classList.add("nav-open"); burger.setAttribute("aria-expanded","true"); menu.setAttribute("aria-hidden","false"); };
    const close = ()=>{ menu.classList.remove("open"); document.body.classList.remove("nav-open"); burger.setAttribute("aria-expanded","false"); menu.setAttribute("aria-hidden","true"); };
    burger.addEventListener("click", ()=> menu.classList.contains("open") ? close() : open());
    menu.querySelectorAll("a").forEach(a=> a.addEventListener("click", close));
  }

  /* gold dust */
  (function dust(){
    const c = $("#dust"); if (!c || reduce) return;
    const ctx = c.getContext("2d"); let w,h,dpr,parts=[],raf,last=0,running=true;
    function size(){ dpr=Math.min(window.devicePixelRatio||1,2); w=c.width=innerWidth*dpr; h=c.height=innerHeight*dpr; c.style.width=innerWidth+"px"; c.style.height=innerHeight+"px"; }
    function mk(init){ return { x:Math.random()*w, y:init?Math.random()*h:h+12, r:(Math.random()*1.6+0.4)*dpr, vy:-(Math.random()*0.11+0.03)*dpr, vx:(Math.random()-0.5)*0.06*dpr, a:Math.random()*0.5+0.12, tw:Math.random()*6.28, ts:Math.random()*0.03+0.008 }; }
    size(); const N=Math.round(Math.min(64,innerWidth/18)); for(let i=0;i<N;i++)parts.push(mk(true));
    window.addEventListener("resize", size, { passive:true });
    function frame(t){ if(!running)return; raf=requestAnimationFrame(frame); if(t-last<33)return; last=t;
      ctx.clearRect(0,0,w,h); ctx.shadowColor="rgba(201,159,86,.7)"; ctx.shadowBlur=6*dpr;
      for(const p of parts){ p.y+=p.vy;p.x+=p.vx;p.tw+=p.ts; if(p.y<-12)Object.assign(p,mk(false));
        const a=p.a*(0.5+0.5*Math.sin(p.tw)); ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,6.283); ctx.fillStyle="rgba(231,200,128,"+a.toFixed(3)+")"; ctx.fill(); } }
    raf=requestAnimationFrame(frame);
    document.addEventListener("visibilitychange", ()=>{ running=!document.hidden; if(running){last=0;raf=requestAnimationFrame(frame);} });
  })();
})();
