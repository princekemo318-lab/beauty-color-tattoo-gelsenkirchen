// Gebrandete Login-Seite für /admin. Wird serverseitig ausgeliefert, solange keine
// gültige Session besteht — das eigentliche Admin-UI wird dann gar nicht erst gesendet.

export function loginPage(opts = {}) {
  const configured = opts.configured !== false;
  const hint = configured
    ? ""
    : `<p class="lg-warn">Der Login ist noch nicht scharf: In Cloudflare fehlt das Secret
         <code>ADMIN_PASSWORD</code> (Pages &rarr; Settings &rarr; Variables and Secrets).</p>`;

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#0a090c">
<meta name="robots" content="noindex,nofollow">
<title>Anmelden — Beauty &amp; Color Tattoo</title>
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="stylesheet" href="/assets/css/fonts.css">
<style>
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;
       background:radial-gradient(1200px 600px at 50% -10%,#151318 0%,#0a090c 60%,#050406 100%);
       color:#efe7db;font-family:Inter,system-ui,sans-serif}
  .lg{width:100%;max-width:400px;background:rgba(18,16,20,.86);border:1px solid rgba(201,159,86,.22);
      border-radius:16px;padding:34px 30px 30px;box-shadow:0 30px 90px rgba(0,0,0,.6)}
  .lg-mark{font-family:Fraunces,Georgia,serif;font-size:1.5rem;letter-spacing:.02em;text-align:center;
           background:linear-gradient(180deg,#e7c880,#c99f56);-webkit-background-clip:text;
           background-clip:text;color:transparent}
  .lg-mark em{font-style:italic}
  .lg-sub{margin:.35rem 0 1.9rem;text-align:center;font-size:.7rem;letter-spacing:.22em;
          text-transform:uppercase;color:#c99f56}
  label{display:block;margin-bottom:1rem}
  label span{display:block;margin-bottom:.4rem;font-size:.68rem;letter-spacing:.14em;
             text-transform:uppercase;color:#c99f56}
  input{width:100%;padding:.85em .9em;border-radius:10px;border:1px solid rgba(231,200,128,.2);
        background:#0d0b10;color:#efe7db;font:inherit}
  input:focus{outline:none;border-color:#c99f56}
  button{width:100%;margin-top:.5rem;padding:.95em 1em;border:0;border-radius:999px;cursor:pointer;
         font-weight:600;font-size:.92rem;letter-spacing:.02em;color:#17130c;
         background:linear-gradient(180deg,#e7c880,#c99f56)}
  button:disabled{opacity:.6;cursor:default}
  .lg-msg{margin:1rem 0 0;min-height:1.2em;font-size:.85rem;text-align:center;color:#e9a1a1}
  .lg-msg.ok{color:#9fd6a8}
  .lg-foot{margin:1.6rem 0 0;text-align:center;font-size:.75rem;color:#8b8189}
  .lg-foot a{color:#c99f56;text-decoration:none}
  .lg-heart{color:#c99f56}
  .lg-warn{margin:0 0 1.2rem;padding:.8rem .9rem;border:1px dashed #c99f56;border-radius:10px;
           font-size:.78rem;line-height:1.5;color:#e7c880}
  .lg-warn code{font-family:ui-monospace,Menlo,Consolas,monospace}
</style>
</head>
<body>
  <main class="lg">
    <div class="lg-mark">B<em>&amp;</em>C &nbsp;Beauty &amp; Color</div>
    <p class="lg-sub">Admin &middot; für Nicole <span class="lg-heart">&#9829;</span></p>
    ${hint}
    <form id="f" autocomplete="on">
      <label><span>Benutzername</span>
        <input id="u" name="username" type="text" autocomplete="username" required autofocus></label>
      <label><span>Passwort</span>
        <input id="p" name="password" type="password" autocomplete="current-password" required></label>
      <button id="b" type="submit">Einloggen</button>
      <p class="lg-msg" id="m" role="status"></p>
    </form>
    <p class="lg-foot"><a href="/">&larr; Zur Website</a></p>
  </main>
<script>
(function(){
  var f=document.getElementById("f"), b=document.getElementById("b"), m=document.getElementById("m");
  f.addEventListener("submit", function(e){
    e.preventDefault();
    b.disabled=true; m.className="lg-msg"; m.textContent="Anmelden …";
    fetch("/api/admin/login", {
      method:"POST", credentials:"same-origin",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({ user:document.getElementById("u").value,
                            password:document.getElementById("p").value })
    })
    .then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){
      if(!r.ok) throw new Error(j.error || ("Fehler " + r.status));
      return j; }); })
    .then(function(){ m.className="lg-msg ok"; m.textContent="Willkommen ♥";
      location.replace("/admin/"); })
    .catch(function(err){ m.textContent=err.message; b.disabled=false;
      document.getElementById("p").value=""; });
  });
})();
</script>
</body>
</html>`;
}
