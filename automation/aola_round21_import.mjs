const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const result = await page.evaluate(() => {
  const m = document.cookie.match(/game_auth_sid=([^;]*)/);
  return m ? m[1] : null;
});
console.log("game_auth_sid raw:", result ? result.slice(0, 120) + "..." : "null");
if (!result) { console.log("ABORT"); process.exit(1); }
// Import into facade (it will decode %3D/%2C into literal format for the SWF)
const imp = await fetch("http://127.0.0.1:8700/import-login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify([{ name: "game_auth_sid", value: result }]),
});
console.log("import:", await imp.text());
