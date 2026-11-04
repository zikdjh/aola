# swf_ctx.py — 在指定 SWF 中搜索字符串并打印命中点附近的可打印上下文（ABC 常量池排查用）
# 用法: uv run --python 3.12 --no-project -- python swf_ctx.py <swf路径> <needle>
import lzma, os, re, struct, sys, zlib

swf, needle = sys.argv[1], sys.argv[2].encode("utf-8")
b = open(swf, "rb").read()
sig = b[:3]
if sig == b"FWS":
    body = b[8:]
elif sig == b"CWS":
    body = zlib.decompress(b[8:])
elif sig == b"ZWS":
    clen = struct.unpack("<I", b[8:12])[0]
    body = lzma.LZMADecompressor(
        format=lzma.FORMAT_RAW,
        filters=[{"id": lzma.FILTER_LZMA1, "dict_size": 0x01000000, "lc": 3, "lp": 0, "pb": 2}],
    ).decompress(b[17 : 17 + clen])
else:
    sys.exit("unknown sig")

# 提取全部 ≥2 字符的 UTF-8 可打印串及其偏移（字节级：ASCII + 常用 CJK/全角三字节序列）
PAT = re.compile(rb"(?:[\x20-\x7e]|[\xe3-\xe9][\x80-\xbf]{2}|[\xef][\x80-\xbf]{2}){2,}")
strings = [(m.start(), m.group().decode("utf-8", "ignore")) for m in PAT.finditer(body)]
for i, (off, s) in enumerate(strings):
    if needle in s.encode("utf-8"):
        lo = max(0, i - 6)
        hi = min(len(strings), i + 7)
        print(f"--- hit @0x{off:x} ---")
        for j in range(lo, hi):
            mark = ">>" if j == i else "  "
            print(f"{mark} {strings[j][1][:120]}")
