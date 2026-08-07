/* ============================================================
   Beauty & Color Tattoo — app: scroll, reveals, gallery, UI
   ============================================================ */
(function(){
  "use strict";
  const $  = (s,c=document)=>c.querySelector(s);
  const $$ = (s,c=document)=>[...c.querySelectorAll(s)];
  const reduce = matchMedia("(prefers-reduced-motion:reduce)").matches;
  const hasGSAP = window.gsap;
  if (hasGSAP && window.ScrollTrigger) gsap.registerPlugin(ScrollTrigger);

  document.body.classList.remove("preload");
  document.body.classList.add("body-ready");
  const yr = $("#yr"); if (yr) yr.textContent = new Date().getFullYear();

  /* ---------- Lenis smooth scroll ---------- */
  let lenis = null;
  if (window.Lenis && !reduce){
    lenis = new Lenis({ duration:1.15, easing:t=>Math.min(1,1.001-Math.pow(2,-10*t)), smoothWheel:true });
    function raf(t){ lenis.raf(t); requestAnimationFrame(raf); }
    requestAnimationFrame(raf);
    if (window.ScrollTrigger){ lenis.on("scroll", ScrollTrigger.update); }
  }
  // anchor links
  $$('a[href^="#"]').forEach(a=>{
    a.addEventListener("click", e=>{
      const id = a.getAttribute("href");
      if (id.length<2) return;
      const t = $(id); if(!t) return;
      e.preventDefault(); closeMenu();
      if (lenis) lenis.scrollTo(t, { offset:-10, duration:1.2 });
      else t.scrollIntoView({ behavior: reduce?"auto":"smooth" });
    });
  });

  /* ---------- Nav state + mobile menu ---------- */
  const nav = $("#nav"), burger = $("#burger"), menu = $("#menu");
  const onScroll = ()=> nav.classList.toggle("solid", window.scrollY > 40);
  onScroll(); window.addEventListener("scroll", onScroll, { passive:true });
  function openMenu(){ menu.classList.add("open"); document.body.classList.add("nav-open"); burger.setAttribute("aria-expanded","true"); menu.setAttribute("aria-hidden","false"); }
  function closeMenu(){ menu.classList.remove("open"); document.body.classList.remove("nav-open"); burger?.setAttribute("aria-expanded","false"); menu?.setAttribute("aria-hidden","true"); }
  burger?.addEventListener("click", ()=> menu.classList.contains("open") ? closeMenu() : openMenu());

  /* ---------- Hero text reveal (on ink bloom) — CSS class based ---------- */
  const hero = $("#hero");
  const heroBits = $$("[data-h]");
  heroBits.forEach((el,i)=> el.style.transitionDelay = (i*0.11)+"s");
  let heroShown = false;
  function revealHero(){ if(heroShown) return; heroShown = true; hero.classList.add("text-in"); }
  window.addEventListener("herobloom:reveal", revealHero, { once:true });
  // fail-safe if hero module never dispatches
  setTimeout(revealHero, 4200);

  /* ---------- Scroll reveals ---------- */
  const reveals = $$(".reveal");
  if (hasGSAP && window.ScrollTrigger && !reduce){
    reveals.forEach(el=>{
      gsap.to(el, { scrollTrigger:{ trigger:el, start:"top 86%" }, opacity:1, y:0, duration:.9, ease:"power3.out" });
    });
  } else {
    const io = new IntersectionObserver((es)=>es.forEach(e=>{ if(e.isIntersecting){ e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold:.12 });
    reveals.forEach(el=>io.observe(el));
  }

  /* ---------- Count-up stats ---------- */
  $$("[data-count]").forEach(el=>{
    const end = +el.dataset.count, suf = el.dataset.suffix||"";
    const run = ()=>{
      const dur=1400, t0=performance.now();
      (function tick(now){
        const p=Math.min((now-t0)/dur,1), e=1-Math.pow(1-p,3);
        el.textContent = Math.round(end*e)+ (p===1?suf:"");
        if(p<1) requestAnimationFrame(tick);
      })(t0);
    };
    if (window.ScrollTrigger && !reduce){
      ScrollTrigger.create({ trigger:el, start:"top 90%", once:true, onEnter:run });
    } else { run(); }
  });

  /* ============================================================
     GALLERY  (build + filter + reveal)
     ============================================================ */
  const data = window.BCT || { filters:[], gallery:[] };
  const galEl = $("#gallery"), filtEl = $("#filters");
  const catLabel = Object.fromEntries(data.filters.map(f=>[f.key,f.label]));
  const items = [];

  data.gallery.forEach((g,i)=>{
    const card = document.createElement("div");
    card.className = "card";
    card.dataset.cat = g.cat.join(" ");
    card.dataset.idx = i;
    card.style.aspectRatio = g.w + "/" + g.h;
    card.setAttribute("role","button");
    card.setAttribute("tabindex","0");
    card.setAttribute("aria-label", g.t);
    card.innerHTML =
      `<img src="assets/web/tattoo/${g.src}.jpg" alt="${g.t} — ${g.d}" width="${g.w}" height="${g.h}" loading="lazy" decoding="async">
       <span class="card__cat">${catLabel[g.cat[0]]||g.cat[0]}</span>
       <span class="card__meta"><b>${g.t}</b><span>${g.d}</span></span>`;
    card.addEventListener("click", ()=>openLB(i));
    card.addEventListener("keydown", e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); openLB(i);} });
    galEl.appendChild(card);
    items.push(card);
  });

  // reveal cards on scroll (stagger by column position handled by delay)
  if (hasGSAP && window.ScrollTrigger && !reduce){
    items.forEach((c,i)=>{
      gsap.from(c, { scrollTrigger:{ trigger:c, start:"top 94%" }, opacity:0, y:40, duration:.8, ease:"power3.out", delay:(i%3)*.06 });
    });
  }

  // filters
  data.filters.forEach((f,i)=>{
    const b=document.createElement("button");
    b.textContent=f.label; b.dataset.key=f.key; if(i===0) b.classList.add("on");
    b.addEventListener("click", ()=>{
      $$(".filters button").forEach(x=>x.classList.remove("on")); b.classList.add("on");
      items.forEach(c=>{
        const show = f.key==="all" || c.dataset.cat.includes(f.key);
        c.classList.toggle("hide", !show);
      });
      if (window.ScrollTrigger) ScrollTrigger.refresh();
    });
    filtEl.appendChild(b);
  });

  /* ---------- Lightbox ---------- */
  const lb=$("#lightbox"), lbImg=$("#lbImg"), lbCap=$("#lbCap");
  let cur=0, visible=[];
  function currentList(){ return items.filter(c=>!c.classList.contains("hide")); }
  function openLB(idx){
    visible = currentList();
    const card = items[idx];
    cur = visible.indexOf(card); if(cur<0) cur=0;
    render(); lb.classList.add("open"); lb.setAttribute("aria-hidden","false"); document.body.classList.add("nav-open");
    lenis && lenis.stop();
  }
  function render(){
    const card = visible[cur]; if(!card) return;
    const g = data.gallery[+card.dataset.idx];
    lbImg.src = `assets/web/tattoo/${g.src}.jpg`; lbImg.alt=g.t;
    lbCap.textContent = `${g.t} · ${g.d}`;
  }
  function closeLB(){ lb.classList.remove("open"); lb.setAttribute("aria-hidden","true"); document.body.classList.remove("nav-open"); lenis && lenis.start(); }
  function step(d){ cur=(cur+d+visible.length)%visible.length; render(); }
  $("#lbClose").addEventListener("click", closeLB);
  $("#lbNext").addEventListener("click", ()=>step(1));
  $("#lbPrev").addEventListener("click", ()=>step(-1));
  lb.addEventListener("click", e=>{ if(e.target===lb) closeLB(); });
  document.addEventListener("keydown", e=>{
    if(!lb.classList.contains("open")) return;
    if(e.key==="Escape") closeLB(); if(e.key==="ArrowRight") step(1); if(e.key==="ArrowLeft") step(-1);
  });
  // swipe
  let sx=0;
  lb.addEventListener("touchstart", e=> sx=e.touches[0].clientX, {passive:true});
  lb.addEventListener("touchend", e=>{ const dx=e.changedTouches[0].clientX-sx; if(Math.abs(dx)>50) step(dx<0?1:-1); }, {passive:true});

  /* ============================================================
     BEFORE / AFTER  (sketch → reality)
     ============================================================ */
  const ba=$("#ba");
  if (ba){
    const before=$("#baBefore"), div=$("#baDiv");
    let drag=false;
    const set=(x)=>{
      const r=ba.getBoundingClientRect();
      let pct=((x-r.left)/r.width)*100; pct=Math.max(4,Math.min(96,pct));
      before.style.width=pct+"%"; div.style.left=pct+"%";
    };
    const from=e=>{ drag=true; move(e); };
    const move=e=>{ if(!drag)return; set((e.touches?e.touches[0].clientX:e.clientX)); if(e.cancelable)e.preventDefault(); };
    const end=()=> drag=false;
    ba.addEventListener("mousedown",from); window.addEventListener("mousemove",move); window.addEventListener("mouseup",end);
    ba.addEventListener("touchstart",from,{passive:true}); window.addEventListener("touchmove",move,{passive:false}); window.addEventListener("touchend",end);
    // subtle auto-hint when scrolled into view
    if (window.ScrollTrigger && !reduce){
      ScrollTrigger.create({ trigger:ba, start:"top 75%", once:true, onEnter:()=>{
        gsap.fromTo([before,div],{},{ duration:1.1, ease:"power2.inOut",
          onUpdate(){ const p=this.progress(); const pct=50+Math.sin(p*Math.PI)*22; before.style.width=pct+"%"; div.style.left=pct+"%"; } });
      }});
    }
  }

  /* ---------- Hero photo parallax on scroll ---------- */
  if (hasGSAP && window.ScrollTrigger && !reduce){
    gsap.to("#heroPhoto img", { yPercent:14, ease:"none",
      scrollTrigger:{ trigger:"#hero", start:"top top", end:"bottom top", scrub:true } });
  }

  /* ---------- Booking calendar (collapsible + lazy consent-embed) ---------- */
  (function booking(){
    const toggle = $("#bookingToggle"), body = $("#bookingBody"), label = $("#bookingLabel");
    if (!toggle || !body) return;
    const src = body.getAttribute("data-src");
    let loaded = false, open = false;
    toggle.addEventListener("click", ()=>{
      open = !open;
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      if (open){
        if (!loaded){
          const iframe = document.createElement("iframe");
          iframe.src = src;
          iframe.title = "Online-Terminbuchung — Beauty & Color Tattoo";
          iframe.loading = "lazy";
          iframe.setAttribute("allow", "clipboard-write");
          iframe.className = "booking__iframe";
          body.appendChild(iframe);
          loaded = true;
        }
        body.classList.add("open");
        if (label) label.textContent = "Kalender schließen";
        if (window.ScrollTrigger) setTimeout(()=>ScrollTrigger.refresh(), 700);
      } else {
        body.classList.remove("open");
        if (label) label.textContent = "Online-Terminkalender öffnen";
      }
    });
  })();

  /* ---------- Gold dust atmosphere ---------- */
  (function dust(){
    const c = $("#dust");
    if (!c || reduce) return;
    const ctx = c.getContext("2d");
    let w, h, dpr, parts = [], raf, last = 0, running = true;
    function size(){
      dpr = Math.min(window.devicePixelRatio||1, 2);
      w = c.width = innerWidth*dpr; h = c.height = innerHeight*dpr;
      c.style.width = innerWidth+"px"; c.style.height = innerHeight+"px";
    }
    function mk(init){
      return { x:Math.random()*w, y:init?Math.random()*h:h+12,
        r:(Math.random()*1.6+0.4)*dpr, vy:-(Math.random()*0.11+0.03)*dpr,
        vx:(Math.random()-0.5)*0.06*dpr, a:Math.random()*0.5+0.12,
        tw:Math.random()*6.28, ts:Math.random()*0.03+0.008 };
    }
    size();
    const N = Math.round(Math.min(64, innerWidth/18));
    for (let i=0;i<N;i++) parts.push(mk(true));
    window.addEventListener("resize", size, { passive:true });
    function frame(t){
      if (!running) return;
      raf = requestAnimationFrame(frame);
      if (t-last < 33) return; last = t;
      ctx.clearRect(0,0,w,h);
      ctx.shadowColor = "rgba(201,159,86,.7)"; ctx.shadowBlur = 6*dpr;
      for (const p of parts){
        p.y += p.vy; p.x += p.vx; p.tw += p.ts;
        if (p.y < -12) Object.assign(p, mk(false));
        const a = p.a*(0.5+0.5*Math.sin(p.tw));
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,6.283);
        ctx.fillStyle = "rgba(231,200,128,"+a.toFixed(3)+")"; ctx.fill();
      }
    }
    raf = requestAnimationFrame(frame);
    document.addEventListener("visibilitychange", ()=>{
      running = !document.hidden;
      if (running){ last = 0; raf = requestAnimationFrame(frame); }
    });
  })();
})();
