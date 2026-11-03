# find_swf_string.py — 在 cache 的全部 SWF（FWS/CWS/ZWS）里搜索一个 UTF-8 字符串
# ZWS 是 raw LZMA1（props 在 5 字节头里），Python 的 raw 过滤器可直接解压
# 用法: uv run --python 3.12 --no-project -- python find_swf_string.py <needle>
import lzma, os, struct, sys, zlib

ROOT = r"D:/temp/ZCode/aola/client/cache"
needle = sys.argv[1].encode("utf-8")

def body_of(p):
    b = open(p, "rb").read()
    sig = b[:3]
    if sig == b"FWS":
        return b[8:]
    if sig == b"CWS":
        return zlib.decompress(b[8:])
    if sig == b"ZWS":
        clen = struct.unpack("<I", b[8:12])[0]
        return lzma.LZMADecompressor(
            format=lzma.FORMAT_RAW,
            filters=[{"id": lzma.FILTER_LZMA1, "dict_size": 0x01000000, "lc": 3, "lp": 0, "pb": 2}],
        ).decompress(b[17 : 17 + clen])
    return None

hits = []
for dirpath, _, names in os.walk(ROOT):
    for n in names:
        if not n.endswith(".swf"):
            continue
        p = os.path.join(dirpath, n)
        try:
            body = body_of(p)
            if body and needle in body:
                hits.append(p.replace(ROOT, "") + f" ({len(body)})")
        except Exception:
            pass

print("\n".join(hits) if hits else "not found")
