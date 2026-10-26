/* Wheel Picker — the winner is chosen with crypto.getRandomValues (rejection sampling) BEFORE the animation;
   the spin is then aimed at that slice, so the animation can never bias the result. */
(function () {
  "use strict";
  var $ = S3.$, $$ = S3.$$;
  var TAU = Math.PI * 2, MAX = 500;
  var COLORS = ["#3dd6d0", "#f5b971", "#ff7b9c", "#8ea2ff", "#6ee7a8", "#f59e6b", "#c084fc", "#facc15", "#38bdf8", "#fb7185", "#a3e635", "#f0abfc"];
  var canvas = $("#wheel"), ctx = canvas.getContext("2d");
  var names = [], rot = 0, spinning = false, audio, lastTick = 0;
  var history = S3.store("wheel.history") || [];
  var lists = S3.store("wheel.lists") || {};

  // ---------- fair random ----------
  function uniformFrom(n, next) { // next() returns a uint32; reject the top slice so every value is equally likely
    var lim = Math.floor(0x100000000 / n) * n, x;
    do x = next(); while (x >= lim);
    return x % n;
  }
  function cryptoU32() { var b = new Uint32Array(1); crypto.getRandomValues(b); return b[0]; }
  function randInt(n) { return uniformFrom(n, cryptoU32); }

  // ---------- wheel geometry ----------
  // Slice i covers wheel angles [i*seg, (i+1)*seg) clockwise; the pointer sits at the top.
  function mod(a, m) { return ((a % m) + m) % m; }
  function indexAt(r, n) { return Math.floor(mod(-r, TAU) / (TAU / n)) % n; }
  function targetRot(r0, w, frac, n, turns) { var a = (w + frac) * TAU / n; return r0 + turns * TAU + mod(-a - r0, TAU); }

  function parseNames(text) { return text.split(/\r?\n/).map(function (s) { return s.trim().slice(0, 100); }).filter(Boolean).slice(0, MAX); }

  // ---------- drawing ----------
  function size() {
    var r = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2), px = Math.max(200, Math.round(r.width * dpr));
    if (canvas.width !== px) { canvas.width = canvas.height = px; }
    draw();
  }
  function colorFor(i, n) { var c = COLORS[i % COLORS.length]; if (n > 1 && i === n - 1 && n % COLORS.length === 1) c = COLORS[5]; return c; }
  function draw() {
    var W = canvas.width, R = W / 2 - 4, cx = W / 2, cy = W / 2, n = names.length;
    ctx.clearRect(0, 0, W, W);
    if (!n) {
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--surface-3").trim(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--text-3").trim(); ctx.font = "600 " + W / 26 + "px Inter, system-ui, sans-serif";
      ctx.textAlign = "center"; ctx.fillText("Add some entries →", cx, cy - W / 7);
      return;
    }
    var seg = TAU / n, fs = Math.max(10, Math.min(W / 18, (R * seg) * 0.55, W / 9 / Math.sqrt(Math.max(1, n / 6))));
    for (var i = 0; i < n; i++) {
      var a0 = rot + i * seg - Math.PI / 2, a1 = a0 + seg;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, a0, a1); ctx.closePath();
      ctx.fillStyle = colorFor(i, n); ctx.fill();
      if (n > 1) { ctx.strokeStyle = "rgba(0,0,0,.18)"; ctx.lineWidth = Math.max(1, W / 400); ctx.stroke(); }
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(a0 + seg / 2);
      ctx.fillStyle = "#14171b"; ctx.font = "700 " + fs + "px Inter, system-ui, 'Noto Sans Arabic', Tahoma, sans-serif"; ctx.textAlign = "right"; ctx.textBaseline = "middle";
      var maxW = R * 0.72, label = names[i];
      if (ctx.measureText(label).width > maxW) { while (label.length > 1 && ctx.measureText(label + "…").width > maxW) label = label.slice(0, -1); label += "…"; }
      ctx.fillText(label, R - W / 28, 0);
      ctx.restore();
    }
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.lineWidth = W / 90; ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.stroke();
  }

  // ---------- sound ----------
  function tick() {
    if (!$("#sound").checked) return;
    var t = performance.now(); if (t - lastTick < 35) return; lastTick = t;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      var o = audio.createOscillator(), g = audio.createGain(), at = audio.currentTime;
      o.type = "triangle"; o.frequency.value = 1500; g.gain.setValueAtTime(0.08, at); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.04);
      o.connect(g).connect(audio.destination); o.start(at); o.stop(at + 0.05);
    } catch (e) { /* no audio */ }
  }

  // ---------- spin ----------
  function spin() {
    if (spinning) return;
    if (names.length < 2) { S3.toast(names.length ? "Add at least two entries" : "Add some entries first", "error"); $("#names").focus(); return; }
    try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === "suspended") audio.resume(); } catch (e) { /* no audio */ }
    var n = names.length, w = randInt(n), frac = 0.12 + 0.76 * randInt(1000) / 1000;
    var start = rot, end = targetRot(rot, w, frac, n, 5 + randInt(3)), dur = 5200 + randInt(1600), t0 = performance.now(), last = indexAt(rot, n);
    spinning = true; $("#spin").disabled = true; $("#spin2").disabled = true; $("#result").textContent = "Spinning…";
    (function frame(now) {
      var p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 4);
      rot = start + (end - start) * e; draw();
      var idx = indexAt(rot, n); if (idx !== last) { last = idx; tick(); }
      if (p < 1) requestAnimationFrame(frame); else done(w);
    })(t0);
  }
  function done(w) {
    rot = mod(rot, TAU); spinning = false; $("#spin").disabled = false; $("#spin2").disabled = false;
    var who = names[w];
    $("#result").textContent = "🎉 " + who;
    history.unshift({ n: who, t: Date.now() }); history = history.slice(0, 50); S3.store("wheel.history", history); renderHist();
    confetti();
    if ($("#removeWinner").checked) removeAt(w); else winnerModal(who, w);
    S3.done();
  }
  function removeAt(w) {
    names.splice(w, 1); $("#names").value = names.join("\n"); saveNames(); draw();
  }
  function winnerModal(who, w) {
    var host = document.fullscreenElement || document.body;
    var m = S3.h("div", { "class": "s3-modal", role: "dialog", "aria-modal": "true", "aria-label": "Winner" });
    var close = S3.h("button", { "class": "btn primary", text: "Close" }), rm = S3.h("button", { "class": "btn", text: "Remove from wheel" });
    var sheet = S3.h("div", { "class": "s3-sheet winner" }, [S3.h("p", { "class": "muted", text: "The wheel picked" }), S3.h("div", { "class": "who", dir: "auto", text: who }), S3.h("div", { "class": "row center-row" }, [rm, close])]);
    m.appendChild(sheet);
    function off() { m.remove(); document.removeEventListener("keydown", key); canvas.focus(); }
    function key(e) { if (e.key === "Escape" || e.key === "Enter") { e.preventDefault(); off(); } }
    close.addEventListener("click", off);
    rm.addEventListener("click", function () { if (names[w] === who) removeAt(w); off(); });
    m.addEventListener("click", function (e) { if (e.target === m) off(); });
    document.addEventListener("keydown", key);
    host.appendChild(m); close.focus();
  }

  // ---------- confetti ----------
  function confetti() {
    var cv = $("#confetti"), host = document.fullscreenElement || document.body;
    if (cv.parentNode !== host) host.appendChild(cv);
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var c = cv.getContext("2d"), W = cv.width = innerWidth, H = cv.height = innerHeight, parts = [], t0 = performance.now();
    for (var i = 0; i < 160; i++) parts.push({ x: W / 2 + (Math.random() - 0.5) * W * 0.3, y: H * 0.35, vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 14 - 4, s: 5 + Math.random() * 6, r: Math.random() * TAU, vr: (Math.random() - 0.5) * 0.3, c: COLORS[i % COLORS.length] });
    (function f(now) {
      var el = now - t0; c.clearRect(0, 0, W, H);
      parts.forEach(function (p) { p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr; c.save(); c.translate(p.x, p.y); c.rotate(p.r); c.fillStyle = p.c; c.globalAlpha = Math.max(0, 1 - el / 3200); c.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); c.restore(); });
      if (el < 3200) requestAnimationFrame(f); else c.clearRect(0, 0, W, H);
    })(t0);
  }

  // ---------- entries, lists, history ----------
  function saveNames() { S3.store("wheel.names", $("#names").value); $("#count").textContent = names.length + (names.length === MAX ? " (max)" : "") + " entries"; }
  function syncNames() { if (spinning) return; names = parseNames($("#names").value); saveNames(); draw(); }
  function renderHist() {
    var ol = $("#hist"); ol.innerHTML = "";
    history.slice(0, 20).forEach(function (h) { ol.appendChild(S3.h("li", { dir: "auto" }, [h.n, S3.h("span", { text: new Date(h.t).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) })])); });
    $("#noHist").hidden = history.length > 0;
  }
  function renderLists() {
    var box = $("#lists"); box.innerHTML = "";
    var keys = Object.keys(lists);
    if (!keys.length) box.appendChild(S3.h("span", { "class": "faint", text: "No saved lists yet." }));
    keys.forEach(function (k) {
      var load = S3.h("button", { text: k + " (" + lists[k].length + ")", title: "Load this list", dir: "auto" }), x = S3.h("button", { "class": "x", "aria-label": "Delete list " + k, text: "×" });
      load.addEventListener("click", function () { $("#names").value = lists[k].join("\n"); syncNames(); S3.toast("Loaded " + k); });
      x.addEventListener("click", function () { delete lists[k]; S3.store("wheel.lists", lists); renderLists(); });
      box.appendChild(S3.h("span", { "class": "list-chip" }, [load, x]));
    });
  }
  function shuffleArr(a) { for (var i = a.length - 1; i > 0; i--) { var j = randInt(i + 1), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  $("#names").addEventListener("input", S3.debounce(syncNames, 200));
  $("#shuffle").addEventListener("click", function () { $("#names").value = shuffleArr(parseNames($("#names").value)).join("\n"); syncNames(); });
  $("#sort").addEventListener("click", function () { $("#names").value = parseNames($("#names").value).sort(function (a, b) { return a.localeCompare(b); }).join("\n"); syncNames(); });
  $("#clear").addEventListener("click", function () { $("#names").value = ""; syncNames(); $("#names").focus(); });
  $("#saveForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var k = $("#listName").value.trim().slice(0, 60);
    if (!k) { $("#listName").focus(); return; }
    if (!names.length) { S3.toast("The wheel is empty", "error"); return; }
    if (!lists[k] && Object.keys(lists).length >= 50) { S3.toast("You can keep up to 50 lists", "error"); return; }
    lists[k] = names.slice(); S3.store("wheel.lists", lists); $("#listName").value = ""; renderLists(); S3.toast("Saved " + k);
  });
  $("#clearHist").addEventListener("click", function () { history = []; S3.store("wheel.history", history); renderHist(); });
  $("#spin").addEventListener("click", spin);
  $("#spin2").addEventListener("click", spin);
  canvas.addEventListener("click", spin);
  canvas.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); spin(); } });
  $("#fs").addEventListener("click", function () {
    if (document.fullscreenElement) document.exitFullscreen();
    else if ($("#wheelCard").requestFullscreen) $("#wheelCard").requestFullscreen().catch(function () { S3.toast("Fullscreen isn't available here", "error"); });
  });
  document.addEventListener("fullscreenchange", function () { if (!document.fullscreenElement) document.body.appendChild($("#confetti")); setTimeout(size, 60); });
  ["removeWinner", "sound"].forEach(function (id) {
    var v = S3.store("wheel." + id); if (v !== undefined) $("#" + id).checked = v;
    $("#" + id).addEventListener("change", function () { S3.store("wheel." + id, $("#" + id).checked); });
  });
  window.addEventListener("resize", S3.debounce(size, 100));
  new MutationObserver(draw).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  var saved = S3.store("wheel.names");
  $("#names").value = typeof saved === "string" ? saved : "Ali\nSara\nOmar\nLina\nYousef\nNoor";
  syncNames(); renderHist(); renderLists(); size();

  window.S3_DEMO = function () {
    $("#names").value = ["Ali", "Sara", "Omar", "Lina", "Yousef", "Noor", "Kareem", "Huda", "Zaid", "Maya"].join("\n");
    syncNames(); rot = 0.4; draw();
    var who = names[indexAt(rot, names.length)];
    $("#result").textContent = "🎉 " + who;
    history = [{ n: who, t: Date.now() }, { n: "Omar", t: Date.now() - 60000 }, { n: "Huda", t: Date.now() - 120000 }]; renderHist();
    lists = { "Class 7B": names.slice(0, 8), "Lunch spots": ["Falafel", "Shawarma", "Mansaf"] }; renderLists();
  };

  window.S3_SELFTEST = function () {
    var seq = [0xFFFFFFFF, 5], calls = 0;
    var a = uniformFrom(3, function () { calls++; return seq.shift(); }) === 2 && calls === 2;
    var b = uniformFrom(1, function () { return 123456; }) === 0 && uniformFrom(4, function () { return 0xFFFFFFFF; }) === 3; // 2^32 divisible by 4: nothing rejected
    var c = true;
    for (var n = 1; n <= 24; n++) for (var w = 0; w < n; w++) [0.12, 0.5, 0.88].forEach(function (f) {
      var r = targetRot(1.234 * n, w, f, n, 6);
      if (indexAt(r, n) !== w || r < 1.234 * n + 6 * TAU) c = false;
    });
    var counts = [0, 0, 0, 0, 0], d = true;
    for (var i = 0; i < 5000; i++) counts[randInt(5)]++;
    counts.forEach(function (k) { if (k < 880 || k > 1120) d = false; });
    var e = parseNames(" Ali \n\nسارة\n  ").join("|") === "Ali|سارة";
    var s = shuffleArr([1, 2, 3, 4, 5, 6]).sort().join() === "1,2,3,4,5,6";
    return a && b && c && d && e && s;
  };
})();
