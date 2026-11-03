// round15_login.mjs — 自动登录：探测 loginFrame iframe 表单，填入账号密码并提交
const ACCT = "26394032";
const PWD = "19811103";

const task = await taskSpace("aola-ruffle-login");
const page = await task.page("p1");
try { await page.cdp("Page.bringToFront", {}); } catch (e) { console.log("bringToFront:", e.message); }
await new Promise(r => setTimeout(r, 1000));

// 1) 探测 iframe 内表单
const probe = await page.evaluate(() => {
  const f = document.getElementById("loginFrame");
  if (!f) return { err: "no loginFrame" };
  let d;
  try { d = f.contentDocument; } catch (e) { return { err: "cross-origin: " + e.message }; }
  if (!d) return { err: "null contentDocument" };
  const ins = [...d.querySelectorAll("input")].map((i, k) => ({
    k, type: i.type, name: i.name || "", id: i.id || "",
    cls: String(i.className || "").slice(0, 40),
    vis: !!(i.offsetWidth || i.offsetHeight), val: String(i.value || "").slice(0, 8),
  }));
  const btns = [...d.querySelectorAll("button, a, input[type=submit], div, span")]
    .filter(el => /^(登\s*录|登录|进\s*入)$/.test(String(el.textContent || "").trim()) && (el.offsetWidth || el.offsetHeight))
    .map((el, k) => ({ k, tag: el.tagName, cls: String(el.className || "").slice(0, 50), txt: String(el.textContent).trim().slice(0, 12) }));
  return { url: f.src.slice(0, 90), inputs: ins, btns: btns.slice(0, 6) };
});
console.log("PROBE:", JSON.stringify(probe, null, 1));
if (probe.err) { console.log("ABORT"); process.exit(0); }

// 2) 填账号（第一个可见 text/telecom 输入框）与密码
const fill = await page.evaluate(({ ACCT, PWD }) => {
  const d = document.getElementById("loginFrame").contentDocument;
  const vis = [...d.querySelectorAll("input")].filter(i => (i.offsetWidth || i.offsetHeight));
  const acct = vis.find(i => i.type === "text" || i.type === "tel") || vis[0];
  const pwd = vis.find(i => i.type === "password");
  if (!acct || !pwd) return { err: "inputs not found", vis: vis.map(i => i.type) };
  function setVal(input, v) {
    input.focus();
    input.value = v;
    for (const ev of ["input", "change", "keyup", "blur"]) {
      input.dispatchEvent(new Event(ev, { bubbles: true }));
    }
  }
  setVal(acct, ACCT);
  setVal(pwd, PWD);
  return { acct: acct.value === ACCT, pwdLen: pwd.value.length };
}, { ACCT, PWD });
console.log("FILL:", JSON.stringify(fill));
if (fill.err) { console.log("ABORT"); process.exit(0); }

// 3) 点登录按钮
const click = await page.evaluate(() => {
  const d = document.getElementById("loginFrame").contentDocument;
  const cands = [...d.querySelectorAll("button, a, input[type=submit], div, span")]
    .filter(el => /^(登\s*录|登录)$/.test(String(el.textContent || "").trim()) && (el.offsetWidth || el.offsetHeight));
  if (!cands.length) return { err: "no button" };
  cands[0].click();
  return { clicked: cands[0].tagName + "." + String(cands[0].className).slice(0, 30) };
});
console.log("CLICK:", JSON.stringify(click));

// 4) 等待登录结果
await new Promise(r => setTimeout(r, 12000));
const after = await page.evaluate(() => ({
  title: document.title,
  cookie: document.cookie.slice(0, 120),
  logs: (window.__LOG_LINES || []).slice(-8).join("\n"),
}));
console.log("AFTER:", JSON.stringify(after, null, 1));
await page.screenshot({ path: "D:/temp/ZCode/aola/client/docs/spike/round15_after_login.png" });
console.log("screenshot saved");
