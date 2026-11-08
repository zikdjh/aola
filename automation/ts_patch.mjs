// ts_patch.mjs — 预载进 serve.mjs 进程: 给 console.log 加 HH:mm:ss 前缀
// 用法: node --import D:/temp/ZCode/scratch/ts_patch.mjs client/tools/serve.mjs 8700
const orig = console.log.bind(console);
const p = (n, l = 2) => String(n).padStart(l, "0");
console.log = (...args) => {
  const d = new Date();
  orig(`${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`, ...args);
};
const origErr = console.error.bind(console);
console.error = (...args) => {
  const d = new Date();
  origErr(`${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`, ...args);
};
