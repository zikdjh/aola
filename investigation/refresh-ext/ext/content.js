// AolaSmartRefresh content script
// Primary path: poll local agent for reload command (works even when
// the PPAPI Flash object owns keyboard focus).
// Best-effort path: intercept F5 / Ctrl+R at DOM level.
(function () {
  var PORT = 64321;
  var BASE = "http://127.0.0.1:" + PORT;
  var POLL_MS = 2000;

  function doReload() {
    try { location.reload(); } catch (e) {}
  }

  window.addEventListener("keydown", function (e) {
    if (e.key === "F5" || (e.ctrlKey && (e.key === "r" || e.key === "R"))) {
      e.preventDefault();
      e.stopPropagation();
      doReload();
    }
  }, true);

  // announce installation -> agent logs EXT-ALIVE (install verification)
  try {
    fetch(BASE + "/ping?u=" + encodeURIComponent(location.href), { cache: "no-store" });
  } catch (e) {}

  setInterval(function () {
    try {
      fetch(BASE + "/cmd", { cache: "no-store" })
        .then(function (r) { return r.text(); })
        .then(function (t) { if (t.trim() === "reload") doReload(); })
        .catch(function () {});
    } catch (e) {}
  }, POLL_MS);
})();
