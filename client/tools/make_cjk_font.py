# make_cjk_font.py — 复制一份 CJK 字体，把 family/subfamily 改成指定名称
# 用于让 Ruffle 的「设备字体」按家族名匹配（SWF 里写的是中文设备字体名）
# 用法: python make_cjk_font.py <src.ttf|src.ttc> <out.ttf> <family> <subfamily> <psname> [faceIndex]
import sys
from fontTools.ttLib import TTFont

src, out, family, subfamily, psname = sys.argv[1:6]
face = int(sys.argv[6]) if len(sys.argv) > 6 else 0
f = TTFont(src, fontNumber=face) if src.lower().endswith(".ttc") else TTFont(src)
name = f["name"]

targets = {
    1: family,                                    # Family
    16: family,                                   # Typographic family
    2: subfamily,                                 # Subfamily
    17: subfamily if subfamily != "Regular" else None,
    4: family if subfamily in ("", "Regular") else f"{family} {subfamily}",  # Full name
    3: f"{family};{psname};1.0",                  # Unique ID
    6: psname,                                    # PostScript name (ASCII)
}

for pid, enc in ((3, 1), (0, 3)):
    for nid, value in targets.items():
        if value is None:
            continue
        try:
            name.setName(value, nid, pid, enc, 0x409)
        except Exception as e:
            print(f"skip nameID {nid}: {e}", file=sys.stderr)

if subfamily == "Bold":
    f["OS/2"].usWeightClass = 700
    f["OS/2"].fsSelection = (f["OS/2"].fsSelection & ~0x40) | 0x20   # BOLD 位，清 REGULAR
    f["head"].macStyle |= 0x01                                      # macStyle bold

f.save(out)
print(f"wrote {out}: family={family!r} subfamily={subfamily!r}")
