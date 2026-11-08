# make_cjk_font.py — 复制一份 CJK 字体，改写 name 表，供 Ruffle 的「设备字体」按名字匹配
#
# 关键（Ruffle 源码 core/../web/src/builder.rs::register_ttf_face_by_name）：
#   Ruffle 用字体文件的 **FULL_NAME（nameID 4）** 作为设备字体注册名，
#   并把 face.is_bold()（OS/2 weight / fsSelection BOLD 位 / macStyle）作为 bold 标志。
#   而 SWF 请求的是「族名 + bold」。因此：
#     常规字面：FULL_NAME 必须 == 请求的族名
#     粗体字面：FULL_NAME 也必须 == 请求的族名，同时置粗体标志
#   （若 FULL_NAME 写成「宋体 Bold」，则请求「宋体」+bold 时键不匹配 →
#     Ruffle 回退到内置 Noto Sans（无 CJK）→ 中文整段消失、只剩数字）
#
# 用法: python make_cjk_font.py <src.ttf|src.ttc> <out.ttf> <family> <subfamily> <psname>
#                             [faceIndex] [fullName] [bold:0|1]
#   fullName 省略时按 subfamily 推导（Regular → family，否则 "family subfamily"）
#   bold 省略时 = (subfamily == "Bold")
import sys

from fontTools.ttLib import TTFont

src, out, family, subfamily, psname = sys.argv[1:6]
face = int(sys.argv[6]) if len(sys.argv) > 6 else 0
full_name = sys.argv[7] if len(sys.argv) > 7 and sys.argv[7] else (
    family if subfamily in ("", "Regular") else f"{family} {subfamily}"
)
bold = (sys.argv[8] == "1") if len(sys.argv) > 8 else (subfamily == "Bold")

f = TTFont(src, fontNumber=face) if src.lower().endswith(".ttc") else TTFont(src)
name = f["name"]

targets = {
    1: family,                                   # Family
    16: family,                                  # Typographic family
    2: subfamily,                                # Subfamily
    17: subfamily if subfamily != "Regular" else None,
    4: full_name,                                # Full name ← Ruffle 用它做注册名
    3: f"{family};{psname};1.0",                 # Unique ID
    6: psname,                                   # PostScript name (ASCII)
}

for pid, enc in ((3, 1), (0, 3)):
    for nid, value in targets.items():
        if value is None:
            continue
        try:
            name.setName(value, nid, pid, enc, 0x409)
        except Exception as e:
            print(f"skip nameID {nid}: {e}", file=sys.stderr)

if bold:
    f["OS/2"].usWeightClass = 700
    f["OS/2"].fsSelection = (f["OS/2"].fsSelection & ~0x40) | 0x20   # BOLD 位，清 REGULAR
    f["head"].macStyle |= 0x01                                       # macStyle bold

f.save(out)
print(f"wrote {out}: family={family!r} subfamily={subfamily!r} fullName={full_name!r} bold={bold}")
