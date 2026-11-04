// Summarize self and inclusive CPU time, grouping identical Rust symbols by family.
import fs from "node:fs";

const file = process.argv[2];
if (!file) {
  throw new Error("usage: node aola_analyze_cpu_profile.mjs <profile.cpuprofile>");
}
const profile = JSON.parse(fs.readFileSync(file, "utf8"));
const nodes = new Map((profile.nodes ?? []).map((node) => [node.id, node]));
const parent = new Map();
for (const node of profile.nodes ?? []) {
  for (const child of node.children ?? []) parent.set(child, node.id);
}

function family(frame = {}) {
  const name = frame.functionName || "(anonymous)";
  if (name === "(idle)") return "idle";
  if (name.includes("MovieClip") && name.includes("construct_frame")) return "MovieClip::construct_frame";
  if (name.includes("MovieClip") && name.includes("enter_frame")) return "MovieClip::enter_frame";
  if (name.includes("run_local_frame_scripts")) return "MovieClip::run_local_frame_scripts";
  if (name.includes("run_frame_scripts")) return "DisplayObject::run_frame_scripts";
  if (name.includes("Graphic") && name.includes("construct_frame")) return "Graphic::construct_frame";
  if (name.includes("wgpu_core") && name.includes("UsageScope")) return "wgpu::UsageScope::drop";
  if (name.includes("CommandEncoder") && name.includes("finish")) return "wgpu::CommandEncoder::finish";
  if (name.includes("avm2")) return "AVM2";
  if (name.includes("render")) return "render";
  if (name.includes("gc") || name.includes("Gc")) return "GC";
  return name
    .replace(/<[^>]+>/g, (value) => value.replace(/\[[0-9a-f]+\]/g, ""))
    .slice(0, 180);
}

const selfUs = new Map();
const inclusiveUs = new Map();
let sampleCount = 0;
let totalUs = 0;
for (let index = 0; index < (profile.samples ?? []).length; index += 1) {
  const id = profile.samples[index];
  const delta = profile.timeDeltas?.[index] ?? 0;
  sampleCount += 1;
  totalUs += delta;
  const leaf = nodes.get(id);
  if (!leaf) continue;
  const selfKey = family(leaf.callFrame);
  selfUs.set(selfKey, (selfUs.get(selfKey) ?? 0) + delta);

  const seen = new Set();
  let currentId = id;
  while (currentId !== undefined) {
    const current = nodes.get(currentId);
    if (!current) break;
    const key = family(current.callFrame);
    if (!seen.has(key)) {
      inclusiveUs.set(key, (inclusiveUs.get(key) ?? 0) + delta);
      seen.add(key);
    }
    currentId = parent.get(currentId);
  }
}

const format = (map, limit) =>
  [...map.entries()]
    .map(([name, microseconds]) => ({
      name,
      ms: +(microseconds / 1000).toFixed(1),
      percent: +((microseconds / totalUs) * 100).toFixed(1),
    }))
    .sort((a, b) => b.ms - a.ms)
    .slice(0, limit);

console.log(JSON.stringify({
  file,
  sampleCount,
  totalMs: +(totalUs / 1000).toFixed(1),
  self: format(selfUs, 40),
  inclusive: format(inclusiveUs, 40),
}, null, 2));
