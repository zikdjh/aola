const task = await taskSpace("aola-ruffle-battle");
const page = task.page("p1");
const cookie = await page.evaluate(() => document.cookie);
const token = (cookie.match(/token=([A-Za-z0-9]+)/) || [])[1];
console.log({ token: token ? token.slice(0, 16) + "..." : null });
if (!token) throw new Error("no token");
const body = "isnickname=sso&content=src%3D%26from%3D&test=&token=" + token +
  "&charId=0&wyToken=-1&account=26394032";
const res = await page.fetch("http://127.0.0.1:8700/mirror/service-aola.100bt.com/newLogin.jsp", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body,
});
const text = String(res.body || "");
console.log({ status: res.status, length: text.length, head: text.slice(0, 500) });
const pick = {};
for (const key of ["c", "state", "sid", "d", "u", "loginkey", "svr", "zn"]) {
  const m = text.match(new RegExp("<" + key + ">([\\s\\S]*?)</" + key + ">"));
  pick[key] = m ? (m[1].length > 180 ? m[1].slice(0, 180) + "..." : m[1]) : null;
}
console.log(JSON.stringify(pick, null, 2));
