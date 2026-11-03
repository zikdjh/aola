const ACC = "26394032";
const PWD = "19811103";
const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");

// Step 1: click START GAME in the Flash canvas
console.log("[1] clicking START GAME...");
// The 960x560 stage is centered; START GAME button is bottom-right
// From screenshot: stage left edge ~x=750, button at stage-local ~(780, 450)
await page.mouse.click(1530, 530, { label: "START GAME" });
await page.waitForTimeout(6000);

// Step 2: check if loginFrame appeared
const probe = await page.evaluate(() => {
  const f = document.getElementById("loginFrame");
  if (!f) return { err: "no loginFrame", title: document.title, logs: (window.__LOG_LINES || []).slice(-10) };
  let d;
  try { d = f.contentDocument; } catch (e) { return { err: "cross-origin: " + e.message, src: f.src.slice(0, 120) }; }
  if (!d) return { err: "null doc", src: f.src.slice(0, 120) };
  const inputs = [...d.querySelectorAll("input")].map((i, k) => ({
    k, type: i.type, name: i.name || "", id: i.id || "", vis: !!(i.offsetWidth || i.offsetHeight),
  }));
  const btns = [...d.querySelectorAll("button, input[type=submit], a")]
    .filter(el => (el.offsetWidth || el.offsetHeight))
    .map((el, k) => ({ k, tag: el.tagName, type: el.type || "", cls: String(el.className).slice(0, 30), txt: String(el.textContent || el.value || "").trim().slice(0, 15) }));
  return { src: f.src.slice(0, 120), inputs, btns: btns.slice(0, 8) };
});
console.log("[2] PROBE:", JSON.stringify(probe, null, 1));

if (probe.err) { console.log("ABORT: no iframe"); process.exit(1); }

// Step 3: fill and submit
console.log("[3] filling form...");
const fillResult = await page.evaluate(({ ACC, PWD }) => {
  const d = document.getElementById("loginFrame").contentDocument;
  const vis = [...d.querySelectorAll("input")].filter(i => (i.offsetWidth || i.offsetHeight));
  const acct = vis.find(i => i.type === "text" || i.type === "tel");
  const pwd = vis.find(i => i.type === "password");
  if (!acct || !pwd) return { err: "missing inputs", vis: vis.map(i => i.type) };
  function setVal(input, v) {
    input.focus();
    input.value = v;
    for (const ev of ["input", "change", "keyup", "blur"]) {
      input.dispatchEvent(new Event(ev, { bubbles: true }));
    }
  }
  setVal(acct, ACC);
  setVal(pwd, PWD);
  return { acct: acct.value === ACC, pwdLen: pwd.value.length };
}, { ACC, PWD });
console.log("[3] FILL:", JSON.stringify(fillResult));
if (fillResult.err) { console.log("ABORT: fill failed"); process.exit(1); }

// Step 4: click login button
console.log("[4] clicking login...");
const clickResult = await page.evaluate(() => {
  const d = document.getElementById("loginFrame").contentDocument;
  const btn = d.querySelector("input.loginBtn") || d.querySelector("input[type=submit]") ||
    [...d.querySelectorAll("a, button, div")].find(el => /登\s*录/.test(el.textContent || "") && (el.offsetWidth || el.offsetHeight));
  if (!btn) return { err: "no btn" };
  btn.click();
  return { clicked: btn.tagName + "." + String(btn.className).slice(0, 30) };
});
console.log("[4] CLICK:", JSON.stringify(clickResult));

// Step 5: wait for result
console.log("[5] waiting for login result...");
await page.waitForTimeout(15000);
const after = await page.evaluate(() => ({
  title: document.title,
  cookie: document.cookie.slice(0, 200),
  frameExists: !!document.getElementById("loginFrame"),
  frameUrl: (document.getElementById("loginFrame") || {}).src?.slice(0, 100) || "(gone)",
  logs: (window.__LOG_LINES || []).slice(-15),
  ei: (window.__EI_LOG || []).slice(-10),
}));
console.log("[5] AFTER:", JSON.stringify(after, null, 1));
