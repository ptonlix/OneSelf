// Seeded starfield: deterministic, cheap, draws once (+ optional twinkle loop).
(function () {
  function rng(seed) { return function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
  document.querySelectorAll("canvas[data-stars]").forEach(function (cv, idx) {
    var dpr = window.devicePixelRatio || 1, r = cv.getBoundingClientRect();
    cv.width = r.width * dpr; cv.height = r.height * dpr;
    var ctx = cv.getContext("2d"); ctx.scale(dpr, dpr);
    var n = +cv.dataset.stars || 260, rand = rng(1234 + idx * 77);
    for (var i = 0; i < n; i++) {
      var x = rand() * r.width, y = rand() * r.height, s = rand();
      var rad = s > .985 ? 1.6 : s > .9 ? 1.05 : .6, a = .15 + rand() * .65;
      var hue = rand(); var col = hue < .2 ? "94,234,212" : hue < .4 ? "192,132,252" : hue < .55 ? "147,168,251" : "238,240,251";
      ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fillStyle = "rgba(" + col + "," + a + ")"; ctx.fill();
      if (s > .992) { ctx.fillStyle = "rgba(" + col + ",.08)"; ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill(); }
    }
  });
})();
