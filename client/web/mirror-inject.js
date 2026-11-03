// mirror-inject.js - 注入到镜像官方 HTML 页面的同源重写补丁。
// 让登录页等官方页面在 facade 源（127.0.0.1）下运行时，其运行时发出的
// 官方域名请求被改写到 /mirror/<host>/ 同源路径，规避 CORS。
(function () {
  "use strict";
  var RX = /^(https?:)?\/\/([a-z0-9.-]+)(:\d+)?(\/.*)$/i;
  function isMirrorHost(h) {
    return /(^|\.)100bt\.com$/.test(h) || /(^|\.)a0bi\.com$/.test(h) || h === "183.61.254.215";
  }
  function rewrite(u) {
    try {
      if (typeof u !== "string") { return u; }
      var m = u.match(RX);
      if (m && isMirrorHost(m[2].toLowerCase())) {
        return location.origin + "/mirror/" + m[2].toLowerCase() + m[4];
      }
      return u;
    } catch (e) { return u; }
  }
  var origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function (input, init) {
      try {
        if (typeof input === "string") {
          var r = rewrite(input);
          if (r !== input) { return origFetch.call(window, r, init); }
        } else if (input && input.url) {
          var r2 = rewrite(input.url);
          if (r2 !== input.url) {
            var i = init ? Object.assign({}, init) : {};
            if (!i.method) i.method = input.method;
            if (!i.headers && input.headers) i.headers = input.headers;
            if (i.body === undefined && input.body) i.body = input.body;
            if (!i.credentials && input.credentials) i.credentials = input.credentials;
            return origFetch.call(window, r2, i);
          }
        }
      } catch (e) {}
      return origFetch.call(window, input, init);
    };
  }
  var oo = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    try { arguments[1] = rewrite(url); } catch (e) {}
    return oo.apply(this, arguments);
  };
  // console 桥：捕获 Ruffle Rust panic / AVM2 错误详情
  (function () {
    var orig = {};
    ["warn", "error"].forEach(function (lv) {
      orig[lv] = console[lv].bind(console);
      console[lv] = function () {
        var parts = Array.prototype.slice.call(arguments).map(function (x) {
          try { return typeof x === "string" ? x : JSON.stringify(x); } catch (e) { return String(x); }
        });
        var line = parts.join(" ");
        if (/ruffle|panicked|wasm|AVM|Error/i.test(line) && line.length < 2000) {
          try {
            navigator.sendBeacon("/report", JSON.stringify({
              kind: "console" + lv, page: location.pathname, msg: line.slice(0, 1500)
            }));
          } catch (e) {}
        }
        orig[lv].apply(console, arguments);
      };
    });
  })();

  // 页面错误上报（白屏排查）
  window.addEventListener("error", function (e) {
    try {
      navigator.sendBeacon("/report", JSON.stringify({
        kind: "pageError", page: location.pathname,
        msg: String(e.message).slice(0, 300),
        src: String(e.filename || "").slice(0, 120), line: e.lineno, col: e.colno,
        stack: String(e.error && e.error.stack || "").slice(0, 1200)
      }));
    } catch (_) {}
  }, true);
  window.addEventListener("unhandledrejection", function (e) {
    try {
      navigator.sendBeacon("/report", JSON.stringify({
        kind: "pageRejection", page: location.pathname,
        msg: String(e.reason && e.reason.message || e.reason).slice(0, 300)
      }));
    } catch (_) {}
  });

  // 隐藏装饰性 Flash 元素（背景 SWF 等）：无插件环境会显示"插件不受支持"占位并干扰视觉。
  // 注意：登录表单控件（#myFlash）不能隐藏 —— 它由下方 Ruffle polyfill 接管。
  function hideFlashDecor() {
    try {
      var n = 0;
      document.querySelectorAll('object, embed').forEach(function (el) {
        var src = (el.getAttribute && (el.getAttribute("data") || el.getAttribute("src"))) || "";
        if (el.id === "myFlash" || /myflash/i.test(el.name || "")) { return; }  // 登录控件交给 Ruffle
        if (/\.swf(\?|$)/i.test(src) || (el.innerHTML || "").indexOf("shockwave") !== -1) {
          el.style.display = "none";
          n++;
        }
      });
      if (n > 0) { console.log("[mirror-inject] hidden " + n + " flash element(s)"); }
    } catch (e) {}
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", hideFlashDecor);
  } else {
    hideFlashDecor();
  }
  // 装饰 SWF 可能由页面 JS 延迟插入（btWebLogin.init）：短时轮询兜底
  (function poll() {
    var tries = 0;
    var iv = setInterval(function () {
      hideFlashDecor();
      if (++tries >= 20) { clearInterval(iv); }
    }, 800);
  })();

  // ============ 登录表单是 Flash（#myFlash）：加载 Ruffle 接管 ============
  // 官方 2017 网页登录控件 20171026_1.swf 经 Ruffle 运行，登录完成后它会把
  // 带票据的 redirect 地址导航出去（顶层或自身），game.html 两侧均有接应。
  (function bootRuffle() {
    // EI 调用信标（排查登录 SWF 状态机卡点）
    function eiLog(name, args, ret) {
      try {
        navigator.sendBeacon("/report", JSON.stringify({
          kind: "loginEI", name: name,
          args: Array.prototype.slice.call(args).map(String).join(",").slice(0, 200),
          ret: String(ret).slice(0, 60)
        }));
      } catch (e) {}
    }
    // 登录 SWF 需要的 EI 宿主函数（对应 aola.js 契约）
    if (!window.getQS) {
      window.getQS = function (key) {
        var kv, i, items = window.location.search.substring(1).split("&");
        for (i = 0; i < items.length; i++) {
          kv = items[i].split("=");
          if (decodeURIComponent(kv[0]) === String(key)) {
            var v = kv.length > 1 ? decodeURIComponent(kv[1]) : "";
            eiLog("getQS", arguments, v);
            return v;
          }
        }
        eiLog("getQS", arguments, "null");
        return null;
      };
    }
    if (!window.getCookie) {
      window.getCookie = function (name) {
        var m = document.cookie.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]*)"));
        var v = m ? m[1] : null;
        eiLog("getCookie", arguments, v ? String(v).slice(0, 30) : "null");
        return v;
      };
    }
    if (!window.addCookieFromAs) {
      window.addCookieFromAs = function (a, b, c) {
        eiLog("addCookieFromAs", arguments, "");
        try { document.cookie = a + "=" + b + "; path=/"; } catch (e) {}
      };
    }
    if (!window.delCookie) {
      window.delCookie = function (name) {
        eiLog("delCookie", arguments, "");
        try { document.cookie = name + "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/"; } catch (e) {}
      };
    }
    if (!window.getUserAgent) { window.getUserAgent = function () { return "Chrome"; }; }
    if (!window.getHref) { window.getHref = function () { return window.location.href; }; }
    if (!window.getWindowLocationHref) { window.getWindowLocationHref = function () { return window.location.href; }; }
    ["closeSocket", "openVoice", "showWebLogin", "showPayDialog"].forEach(function (fn) {
      if (!window[fn]) { window[fn] = function () { eiLog(fn, arguments, ""); return ""; }; }
    });
    // 未知 EI 调用兜底：Proxy 捕获 SWF 调用的任何其他函数名
    window.addEventListener("error", function (e) {
      try {
        navigator.sendBeacon("/report", JSON.stringify({
          kind: "pageError", page: location.pathname,
          msg: String(e.message).slice(0, 300),
          src: String(e.filename || "").slice(0, 120), line: e.lineno, col: e.colno
        }));
      } catch (_) {}
    }, true);

    window.RufflePlayer = window.RufflePlayer || {};
    window.RufflePlayer.config = {
      autoplay: "on",
      unmuteOverlay: "hidden",
      letterbox: "off",
      logLevel: "warn",
      allowScriptAccess: true,          // 必须布尔：字符串经 wasm ToInt32 变 false
      polyfills: true
    };
    var s = document.createElement("script");
    // 登录 SWF 在 0.8.0-nightly 上有 wasm unreachable trap，登录页改用 0.7.1 稳定版
    s.src = location.origin + "/ruffle-stable/ruffle.js";
    s.onload = function () {
      // 轮询触发 polyfill（覆盖 btWebLogin 延迟插入 #myFlash 的时序）
      var tries = 0;
      var iv = setInterval(function () {
        try {
          var hasNative = document.querySelector('object[id="myFlash"], embed[id="myFlash"]');
          var hasRuffle = document.querySelector("ruffle-player");
          if (hasNative && !hasRuffle && window.RufflePlayer && window.RufflePlayer.newest) {
            window.RufflePlayer.newest().polyfill();
            console.log("[mirror-inject] ruffle polyfill triggered for #myFlash");
          }
          if (hasRuffle || tries > 30) { clearInterval(iv); }
        } catch (e) { console.log("[mirror-inject] polyfill err " + e); }
        tries++;
      }, 500);
    };
    s.onerror = function () { console.log("[mirror-inject] ruffle.js load FAILED"); };
    (document.head || document.documentElement).appendChild(s);
  })();
  // 渲染探针：上报登录表单是否真的渲染出来
  setTimeout(function () {
    try {
      navigator.sendBeacon("/report", JSON.stringify({
        kind: "pageProbe", page: location.pathname,
        btWebLogin: typeof window.btWebLogin,
        jQuery: typeof window.jQuery,
        pageRootChildren: (document.getElementById("pageRoot") || { childNodes: [] }).childNodes.length,
        bodyLen: document.body ? document.body.innerHTML.length : -1,
        cookieStr: (document.cookie || "").slice(0, 120)
      }));
    } catch (_) {}
  }, 6000);
  // 登录成功后官方页面可能把 整个顶层窗口 导向带票据的回跳地址——放行即可；
  // 若只导航自身 iframe，则由 game.html 的 iframe 模式处理。
})();
