;
(function (root, factory) {
    if (typeof define === 'function' && (define.amd || define.cmd)) {
        // AMD&CMD
        define(function () {
            return factory(root);
        });
    } else if (typeof exports === 'object') {
        // Node, CommonJS-like
        module.exports = factory(root);
    } else {
        // Browser globals (root is window)
        root.Browser = root.Browser || factory(root);
    }
}(typeof self !== 'undefined' ? self : this, function (root) {
    var _window = root || {};
    var _navigator = typeof root.navigator != 'undefined' ? root.navigator : {};
    var _mime = function (option, value) {
        var mimeTypes = _navigator.mimeTypes;
        for (var mt in mimeTypes) {
            if (mimeTypes[mt][option] == value) {
                return true;
            }
        }
        return false;
    };

    return function (userAgent) {
        var u = userAgent || _navigator.userAgent || {};
        var _this = this;

        var match = {
            //内核
            'Trident': u.indexOf('Trident') > -1 || u.indexOf('NET CLR') > -1,
            'Presto': u.indexOf('Presto') > -1,
            'WebKit': u.indexOf('AppleWebKit') > -1,
            'Gecko': u.indexOf('Gecko/') > -1,
            'KHTML': u.indexOf('KHTML/') > -1,
            //浏览器
            'Safari': u.indexOf('Safari') > -1,
            'Chrome': u.indexOf('Chrome') > -1 || u.indexOf('CriOS') > -1,
            'IE': u.indexOf('MSIE') > -1 || u.indexOf('Trident') > -1,
            'Edge': u.indexOf('Edge') > -1 || u.indexOf('Edg/') > -1,
            'Firefox': u.indexOf('Firefox') > -1 || u.indexOf('FxiOS') > -1,
            'Firefox Focus': u.indexOf('Focus') > -1,
            'Chromium': u.indexOf('Chromium') > -1,
            'Opera': u.indexOf('Opera') > -1 || u.indexOf('OPR') > -1,
            'Vivaldi': u.indexOf('Vivaldi') > -1,
            'Yandex': u.indexOf('YaBrowser') > -1,
            'Arora': u.indexOf('Arora') > -1,
            'Lunascape': u.indexOf('Lunascape') > -1,
            'QupZilla': u.indexOf('QupZilla') > -1,
            'Coc Coc': u.indexOf('coc_coc_browser') > -1,
            'Kindle': u.indexOf('Kindle') > -1 || u.indexOf('Silk/') > -1,
            'Iceweasel': u.indexOf('Iceweasel') > -1,
            'Konqueror': u.indexOf('Konqueror') > -1,
            'Iceape': u.indexOf('Iceape') > -1,
            'SeaMonkey': u.indexOf('SeaMonkey') > -1,
            'Epiphany': u.indexOf('Epiphany') > -1,
            '360': u.indexOf('QihooBrowser') > -1 || u.indexOf('QHBrowser') > -1,
            '360EE': u.indexOf('360EE') > -1,
            '360SE': u.indexOf('360SE') > -1,
            'UC': u.indexOf('UCBrowser') > -1 || u.indexOf(' UBrowser') > -1,
            'QQBrowser': u.indexOf('QQBrowser') > -1,
            'QQ': u.indexOf('QQ/') > -1,
            'Baidu': u.indexOf('Baidu') > -1 || u.indexOf('BIDUBrowser') > -1 || u.indexOf('baiduboxapp') > -1,
            'Maxthon': u.indexOf('Maxthon') > -1,
            'Sogou': u.indexOf('MetaSr') > -1 || u.indexOf('Sogou') > -1,
            'Liebao': u.indexOf('LBBROWSER') > -1 || u.indexOf('LieBaoFast') > -1,
            '2345Explorer': u.indexOf('2345Explorer') > -1 || u.indexOf('Mb2345Browser') > -1,
            '115Browser': u.indexOf('115Browser') > -1,
            'TheWorld': u.indexOf('TheWorld') > -1,
            'XiaoMi': u.indexOf('MiuiBrowser') > -1,
            'Quark': u.indexOf('Quark') > -1,
            'Qiyu': u.indexOf('Qiyu') > -1,
            'Wechat': u.indexOf('MicroMessenger') > -1,
            'WechatWork': u.indexOf('wxwork/') > -1,
            'Taobao': u.indexOf('AliApp(TB') > -1,
            'Alipay': u.indexOf('AliApp(AP') > -1,
            'Weibo': u.indexOf('Weibo') > -1,
            'Douban': u.indexOf('com.douban.frodo') > -1,
            'Suning': u.indexOf('SNEBUY-APP') > -1,
            'iQiYi': u.indexOf('IqiyiApp') > -1,
            'DingTalk': u.indexOf('DingTalk') > -1,
            'Huawei': u.indexOf('HuaweiBrowser') > -1 || u.indexOf('HUAWEI/') > -1,
            'Vivo': u.indexOf('VivoBrowser') > -1,
            //系统或平台
            'Windows': u.indexOf('Windows') > -1,
            'Linux': u.indexOf('Linux') > -1 || u.indexOf('X11') > -1,
            'Mac OS': u.indexOf('Macintosh') > -1,
            'Android': u.indexOf('Android') > -1 || u.indexOf('Adr') > -1,
            'Ubuntu': u.indexOf('Ubuntu') > -1,
            'FreeBSD': u.indexOf('FreeBSD') > -1,
            'Debian': u.indexOf('Debian') > -1,
            'Windows Phone': u.indexOf('IEMobile') > -1 || u.indexOf('Windows Phone') > -1,
            'BlackBerry': u.indexOf('BlackBerry') > -1 || u.indexOf('RIM') > -1,
            'MeeGo': u.indexOf('MeeGo') > -1,
            'Symbian': u.indexOf('Symbian') > -1,
            'iOS': u.indexOf('like Mac OS X') > -1,
            'Chrome OS': u.indexOf('CrOS') > -1,
            'WebOS': u.indexOf('hpwOS') > -1,
            //设备
            'Mobile': u.indexOf('Mobi') > -1 || u.indexOf('iPh') > -1 || u.indexOf('480') > -1,
            'Tablet': u.indexOf('Tablet') > -1 || u.indexOf('Pad') > -1 || u.indexOf('Nexus 7') > -1
        };
        var is360 = false;
        if (_window.chrome) {
            var chrome_version = u.replace(/^.*Chrome\/([\d]+).*$/, '$1');
            if (_window.chrome.adblock2345 || _window.chrome.common2345) {
                match['2345Explorer'] = true;
            } else if (_mime("type", "application/360softmgrplugin") || _mime("type", "application/mozilla-npqihooquicklogin")) {
                is360 = true;
            } else if (chrome_version > 36 && _window.showModalDialog) {
                is360 = true;
            } else if (chrome_version > 45) {
                is360 = _mime("type", "application/vnd.chromium.remoting-viewer");
                if (!is360 && chrome_version >= 69) {
                    is360 = _mime("type", "application/hwepass2001.installepass2001") || _mime("type", "application/asx");
                }
            }
        }
        //修正
        if (match['Mobile']) {
            match['Mobile'] = !(u.indexOf('iPad') > -1);
        } else if (is360) {
            if (_mime("type", "application/gameplugin")) {
                match['360SE'] = true;
            } else if (_navigator && typeof _navigator['connection'] !== 'undefined' && typeof _navigator['connection']['saveData'] == 'undefined') {
                match['360SE'] = true;
            } else {
                match['360EE'] = true;
            }
        }
        if (match['IE'] || match['Edge']) {
            var navigator_top = window.screenTop - window.screenY;
            switch (navigator_top) {
                case 71: //无收藏栏,贴边
                case 99: //有收藏栏,贴边
                case 102: //有收藏栏,非贴边
                    match['360EE'] = true;
                    break;
                case 75: //无收藏栏,贴边
                case 105: //有收藏栏,贴边
                case 104: //有收藏栏,非贴边
                    match['360SE'] = true;
                    break;
            }
        }
        if (match['Baidu'] && match['Opera']) {
            match['Baidu'] = false;
        } else if (match['iOS']) {
            match['Safari'] = true;
        }
        //基本信息
        var hash = {
            engine: ['WebKit', 'Trident', 'Gecko', 'Presto', 'KHTML'],
            browser: ['Safari', 'Chrome', 'Edge', 'IE', 'Firefox', 'Firefox Focus', 'Chromium', 'Opera', 'Vivaldi', 'Yandex', 'Arora', 'Lunascape', 'QupZilla', 'Coc Coc', 'Kindle', 'Iceweasel', 'Konqueror', 'Iceape', 'SeaMonkey', 'Epiphany', 'XiaoMi', 'Vivo', '360', '360SE', '360EE', 'UC', 'QQBrowser', 'QQ', 'Huawei', 'Baidu', 'Maxthon', 'Sogou', 'Liebao', '2345Explorer', '115Browser', 'TheWorld', 'Quark', 'Qiyu', 'Wechat', 'WechatWork', 'Taobao', 'Alipay', 'Weibo', 'Douban', 'Suning', 'iQiYi', 'DingTalk'],
            os: ['Windows', 'Linux', 'Mac OS', 'Android', 'Ubuntu', 'FreeBSD', 'Debian', 'iOS', 'Windows Phone', 'BlackBerry', 'MeeGo', 'Symbian', 'Chrome OS', 'WebOS'],
            device: ['Mobile', 'Tablet']
        };
        _this.device = 'PC';
        _this.language = (function () {
            var g = (_navigator.browserLanguage || _navigator.language);
            var arr = g.split('-');
            if (arr[1]) {
                arr[1] = arr[1].toUpperCase();
            }
            return arr.join('_');
        })();
        for (var s in hash) {
            for (var i = 0; i < hash[s].length; i++) {
                var value = hash[s][i];
                if (match[value]) {
                    _this[s] = value;
                }
            }
        }
        //系统版本信息
        var osVersion = {
            'Windows': function () {
                var v = u.replace(/^Mozilla\/\d.0 \(Windows NT ([\d.]+);.*$/, '$1');
                var hash = {
                    '10': '10',
                    '6.4': '10',
                    '6.3': '8.1',
                    '6.2': '8',
                    '6.1': '7',
                    '6.0': 'Vista',
                    '5.2': 'XP',
                    '5.1': 'XP',
                    '5.0': '2000'
                };
                return hash[v] || v;
            },
            'Android': function () {
                return u.replace(/^.*Android ([\d.]+);.*$/, '$1');
            },
            'iOS': function () {
                return u.replace(/^.*OS ([\d_]+) like.*$/, '$1').replace(/_/g, '.');
            },
            'Debian': function () {
                return u.replace(/^.*Debian\/([\d.]+).*$/, '$1');
            },
            'Windows Phone': function () {
                return u.replace(/^.*Windows Phone( OS)? ([\d.]+);.*$/, '$2');
            },
            'Mac OS': function () {
                return u.replace(/^.*Mac OS X ([\d_]+).*$/, '$1').replace(/_/g, '.');
            },
            'WebOS': function () {
                return u.replace(/^.*hpwOS\/([\d.]+);.*$/, '$1');
            }
        };
        _this.osVersion = '';
        if (osVersion[_this.os]) {
            _this.osVersion = osVersion[_this.os]();
            if (_this.osVersion == u) {
                _this.osVersion = '';
            }
        }
        //浏览器版本信息
        var version = {
            'Safari': function () {
                return u.replace(/^.*Version\/([\d.]+).*$/, '$1');
            },
            'Chrome': function () {
                return u.replace(/^.*Chrome\/([\d.]+).*$/, '$1').replace(/^.*CriOS\/([\d.]+).*$/, '$1');
            },
            'IE': function () {
                return u.replace(/^.*MSIE ([\d.]+).*$/, '$1').replace(/^.*rv:([\d.]+).*$/, '$1');
            },
            'Edge': function () {
                return u.replace(/^.*Edge\/([\d.]+).*$/, '$1').replace(/^.*Edg\/([\d.]+).*$/, '$1');
            },
            'Firefox': function () {
                return u.replace(/^.*Firefox\/([\d.]+).*$/, '$1').replace(/^.*FxiOS\/([\d.]+).*$/, '$1');
            },
            'Firefox Focus': function () {
                return u.replace(/^.*Focus\/([\d.]+).*$/, '$1');
            },
            'Chromium': function () {
                return u.replace(/^.*Chromium\/([\d.]+).*$/, '$1');
            },
            'Opera': function () {
                return u.replace(/^.*Opera\/([\d.]+).*$/, '$1').replace(/^.*OPR\/([\d.]+).*$/, '$1');
            },
            'Vivaldi': function () {
                return u.replace(/^.*Vivaldi\/([\d.]+).*$/, '$1');
            },
            'Yandex': function () {
                return u.replace(/^.*YaBrowser\/([\d.]+).*$/, '$1');
            },
            'Arora': function () {
                return u.replace(/^.*Arora\/([\d.]+).*$/, '$1');
            },
            'Lunascape': function () {
                return u.replace(/^.*Lunascape[\/\s]([\d.]+).*$/, '$1');
            },
            'QupZilla': function () {
                return u.replace(/^.*QupZilla[\/\s]([\d.]+).*$/, '$1');
            },
            'Coc Coc': function () {
                return u.replace(/^.*coc_coc_browser\/([\d.]+).*$/, '$1');
            },
            'Kindle': function () {
                return u.replace(/^.*Version\/([\d.]+).*$/, '$1');
            },
            'Iceweasel': function () {
                return u.replace(/^.*Iceweasel\/([\d.]+).*$/, '$1');
            },
            'Konqueror': function () {
                return u.replace(/^.*Konqueror\/([\d.]+).*$/, '$1');
            },
            'Iceape': function () {
                return u.replace(/^.*Iceape\/([\d.]+).*$/, '$1');
            },
            'SeaMonkey': function () {
                return u.replace(/^.*SeaMonkey\/([\d.]+).*$/, '$1');
            },
            'Epiphany': function () {
                return u.replace(/^.*Epiphany\/([\d.]+).*$/, '$1');
            },
            '360': function () {
                return u.replace(/^.*QihooBrowser\/([\d.]+).*$/, '$1');
            },
            '360SE': function () {
                var hash = {
                    '86': '13.0',
                    '78': '12.0',
                    '69': '11.0',
                    '63': '10.0',
                    '55': '9.1',
                    '45': '8.1',
                    '42': '8.0',
                    '31': '7.0',
                    '21': '6.3'
                };
                var chrome_version = u.replace(/^.*Chrome\/([\d]+).*$/, '$1');
                return hash[chrome_version] || '';
            },
            '360EE': function () {
                var hash = {
                    '86': '13.0',
                    '78': '12.0',
                    '69': '11.0',
                    '63': '9.5',
                    '55': '9.0',
                    '50': '8.7',
                    '30': '7.5'
                };
                var chrome_version = u.replace(/^.*Chrome\/([\d]+).*$/, '$1');
                return hash[chrome_version] || '';
            },
            'Maxthon': function () {
                return u.replace(/^.*Maxthon\/([\d.]+).*$/, '$1');
            },
            'QQBrowser': function () {
                return u.replace(/^.*QQBrowser\/([\d.]+).*$/, '$1');
            },
            'QQ': function () {
                return u.replace(/^.*QQ\/([\d.]+).*$/, '$1');
            },
            'Baidu': function () {
                return u.replace(/^.*BIDUBrowser[\s\/]([\d.]+).*$/, '$1').replace(/^.*baiduboxapp\/([\d.]+).*$/, '$1');
            },
            'UC': function () {
                return u.replace(/^.*UC?Browser\/([\d.]+).*$/, '$1');
            },
            'Sogou': function () {
                return u.replace(/^.*SE ([\d.X]+).*$/, '$1').replace(/^.*SogouMobileBrowser\/([\d.]+).*$/, '$1');
            },
            'Liebao': function () {
                var version = ''
                if (u.indexOf('LieBaoFast') > -1) {
                    version = u.replace(/^.*LieBaoFast\/([\d.]+).*$/, '$1');
                }
                var hash = {
                    '57': '6.5',
                    '49': '6.0',
                    '46': '5.9',
                    '42': '5.3',
                    '39': '5.2',
                    '34': '5.0',
                    '29': '4.5',
                    '21': '4.0'
                };
                var chrome_version = u.replace(/^.*Chrome\/([\d]+).*$/, '$1');
                return version || hash[chrome_version] || '';
            },
            '2345Explorer': function () {
                var hash = {
                    '69': '10.0',
                    '55': '9.9'
                };
                var chrome_version = navigator.userAgent.replace(/^.*Chrome\/([\d]+).*$/, '$1');
                return hash[chrome_version] || u.replace(/^.*2345Explorer\/([\d.]+).*$/, '$1').replace(/^.*Mb2345Browser\/([\d.]+).*$/, '$1');
            },
            '115Browser': function () {
                return u.replace(/^.*115Browser\/([\d.]+).*$/, '$1');
            },
            'TheWorld': function () {
                return u.replace(/^.*TheWorld ([\d.]+).*$/, '$1');
            },
            'XiaoMi': function () {
                return u.replace(/^.*MiuiBrowser\/([\d.]+).*$/, '$1');
            },
            'Vivo': function () {
                return u.replace(/^.*VivoBrowser\/([\d.]+).*$/, '$1');
            },
            'Quark': function () {
                return u.replace(/^.*Quark\/([\d.]+).*$/, '$1');
            },
            'Qiyu': function () {
                return u.replace(/^.*Qiyu\/([\d.]+).*$/, '$1');
            },
            'Wechat': function () {
                return u.replace(/^.*MicroMessenger\/([\d.]+).*$/, '$1');
            },
            'WechatWork': function () {
                return u.replace(/^.*wxwork\/([\d.]+).*$/, '$1');
            },
            'Taobao': function () {
                return u.replace(/^.*AliApp\(TB\/([\d.]+).*$/, '$1');
            },
            'Alipay': function () {
                return u.replace(/^.*AliApp\(AP\/([\d.]+).*$/, '$1');
            },
            'Weibo': function () {
                return u.replace(/^.*weibo__([\d.]+).*$/, '$1');
            },
            'Douban': function () {
                return u.replace(/^.*com.douban.frodo\/([\d.]+).*$/, '$1');
            },
            'Suning': function () {
                return u.replace(/^.*SNEBUY-APP([\d.]+).*$/, '$1');
            },
            'iQiYi': function () {
                return u.replace(/^.*IqiyiVersion\/([\d.]+).*$/, '$1');
            },
            'DingTalk': function () {
                return u.replace(/^.*DingTalk\/([\d.]+).*$/, '$1');
            },
            'Huawei': function () {
                return u.replace(/^.*Version\/([\d.]+).*$/, '$1').replace(/^.*HuaweiBrowser\/([\d.]+).*$/, '$1');
            }
        };
        _this.version = '';
        if (version[_this.browser]) {
            _this.version = version[_this.browser]();
            if (_this.version == u) {
                _this.version = '';
            }
        }
        //修正
        if (_this.browser == 'Chrome' && u.match(/\S+Browser/)) {
            _this.browser = u.match(/\S+Browser/)[0];
            _this.version = u.replace(/^.*Browser\/([\d.]+).*$/, '$1');
        }
        if (_this.browser == 'Edge') {
            if (_this.version > "75") {
                _this.engine = 'Blink';
            } else {
                _this.engine = 'EdgeHTML';
            }
        } else if (match['Chrome'] && _this.engine == 'WebKit' && parseInt(version['Chrome']()) > 27) {
            _this.engine = 'Blink';
        } else if (_this.browser == 'Opera' && parseInt(_this.version) > 12) {
            _this.engine = 'Blink';
        } else if (_this.browser == 'Yandex') {
            _this.engine = 'Blink';
        }
    };
}));
(function () {
    var browser_info = {};
    try {
        browser_info = new Browser();
        window.__$browserInfo = browser_info;
    } catch (error) {
        _log('get browser info failed', error);
    }
    var addEventPolyfill = function (obj, event_type, fn) {
        if (obj.addEventListener) {
            obj.addEventListener(event_type, fn, false);
            addEventPolyfill = function (obj, event_type, fn) {
                obj.addEventListener(event_type, fn, false)
            }
        } else {
            obj.attachEvent('on' + event_type, fn);
            addEventPolyfill = function (obj, event_type, fn) {
                obj.attachEvent('on' + event_type, fn);
            }
        }
    }

    function _log(info) {
        return window.console && window.console.log && window.console.log(info);
    }

    var flash_version = '';
    var polyfill = {
        init: function () {
            this.showOverlayHint().renderSpecialStyle();
        },
        showOverlayHint: function () {
            this.appendUglyHint(this.nd, this.resource, this.config)
            return this
        },
        sendBeacon: function (info) {
            try {
                if (window.bt && window.bt.track) {
                    window.bt.track("common_event", info);
                } else {
                    (function (_info) {
                        addEventPolyfill(window, 'load', function () {
                            try {
                                window.bt && window.bt.track && window.bt.track("common_event", _info);
                            } catch (e) {
                                _log(e)
                            }
                        })
                    })(info);
                }
            } catch (e) {
                _log(e)
            }
            return this;
        },
        // 多个游戏之间可能做不到样式上的完全统一，留个每个游戏自己去实现
        // 最后一定要return this喔
        renderSpecialStyle: function () {
            return this
        },
        replaceOriginalHintNode: function () {
            this.nd && document.body.appendChild(this.nd);
        },
        createHintNode: function () {
            if (this.nd) {
                return
            }
            var node = document.createElement('div');
            node.id = 'normalize-flash-launch-wrapper';
            this.nd = node;
            return node;
        },
        getFlashVersion: function () {
            var SW = "Shockwave",
                FLASH = "Flash",
                SHOCKWAVE_FLASH = SW + " " + FLASH,
                SHOCKWAVE_FLASH_AX = SW + FLASH + "." + SW + FLASH,
                FLASH_MIME_TYPE = "application/x-shockwave-flash",
                nav = navigator,
                parse = parseFloat,
                plugins = nav.plugins,
                mimes = nav.mimeTypes,
                d, a;
            if (!!plugins && typeof plugins[SHOCKWAVE_FLASH] == "object") {
                d = plugins[SHOCKWAVE_FLASH].description;
                if (!!d && !(!!mimes && !!mimes[FLASH_MIME_TYPE] && !mimes[FLASH_MIME_TYPE].enabledPlugin)) {
                    return parse(d.replace(/^.*\s+(\S+)\s+\S+$/, "$1"));
                }
            } else if (!!window.ActiveXObject) {
                try {
                    a = new ActiveXObject(SHOCKWAVE_FLASH_AX);
                    if (a) {
                        d = a.GetVariable("$version");
                        if (!!d) {
                            return parse(d.replace(/^\S+\s+(\d+),(\d+).*$/i, '$1.$2'));
                        }
                    }
                } catch (e) {}
            }
            return -1;
        },
        hiddenFlash: function () {
            this.nd_flash && (this.nd_flash.style.display = 'none');
        },
        // 点击关闭按钮之后要回显flash内容
        revealFlash: function () {
            this.nd && (this.nd.style.display = 'none');
            this.nd_flash && (this.nd_flash.style.display = 'block');
        },
        flashInspect: function (cb) {
            var that = this;
            // 未安装、未启动
            flash_version = that.getFlashVersion();
            if (!~flash_version) {
                return cb && cb(false);
            }
            // 非ie为0
            // var ieVersion = ~ ~navigator.userAgent.replace(/^.*MSIE ([\d.]+).*$/, '$1').replace(/^.*rv:([\d.]+).*$/, '$1');
            // var isIE7 = ieVersion === 7;
            // var isBTM = isIE7 && (document.referrer && !! ~document.referrer.indexOf('btmplay'));
            var inspectSwf = that.flash_inspect_url;
            if (!inspectSwf) {
                return
            }
            // 默认flash不可行
            var flash_heart_beat = false,
                retry = 0;
            window.flashHeartBeat = function () {
                flash_heart_beat = true;
            }
            var div = document.createElement("div");
            div.innerHTML = '<object classid="clsid:D27CDB6E-AE6D-11cf-96B8-444553540000" codebase="http://download.macromedia.com/pub/shockwave/cabs/flash/swflash.cab#version=10,0,45,2" width=1 height=1>' +
                '<param name=movie value="' + inspectSwf + '">' +
                '<param name="allowScriptAccess" value="always">' +
                '<embed play=false swliveconnect="true" src="' + inspectSwf + '" quality=high bgcolor=#FFFFFF width=1 height=1 type="application/x-shockwave-flash">' +
                '</embed ></object >';
            document.body.appendChild(div);
            var timer = window.setInterval(function () {
                if (flash_heart_beat) {
                    return callback(1)
                }
                if (++retry >= 3) {
                    return callback(0)
                }
            }, 1000);

            function callback(flag) {
                window.clearInterval(timer);
                document.body.removeChild(div);
                div = null;
                cb && cb(flag);
            }
        },
        // 公共提示页 v2 
        appendUglyHint: function (nd, resource, config) {
            var that = this;
            var css_str = [
                "        #normalize-flash-launch-wrapper {",
                "            position: relative;",
                "            width: " + (config.wrapper_w || '960px') + ";",
                "            height: " + (config.wrapper_h || '560px') + ";",
                "            background-image: url('" + resource.bg + "');",
                "            background-repeat: no-repeat;",
                "            background-position: 0 0;",
                "        }",
                "        #normalize-flash-launch-wrapper .content-helper{",
                "            display: inline-block;",
                "            width: 0",
                "            height: 100%;",
                "            background-color: rgba(0, 0, 0, .3);",
                "        }",
                "        #normalize-flash-launch-wrapper .content{",
                "            position: absolute;",
                "            width: 486px;",
                "            height: 349px;",
                "            top:154px;",
                "            left: 50%;",
                "            margin-left: -243px;",
                // "            background-image: url('//resource.a0bi.com/resource/image/normalize-flash-launch/bg.png');",
                "            background-repeat: no-repeat;",
                "            background-position: 0 0;",
                "        }",
                "        #normalize-flash-launch-wrapper .launch-btn{",
                "            position: absolute;",
                "            top:72px;",
                "            right: 136px;",
                "            width: 219px;",
                "           height: 47px;",
                "            background-image: url('//resource.a0bi.com/resource/image/normalize-flash-launch/launch-btn.png');",
                "            background-repeat: no-repeat;",
                "            background-position: 0 0;",
                "            cursor: pointer;",
                "        }",
                "        #normalize-flash-launch-wrapper .teach-btn{",
                "            position: absolute;",
                "            top:73px;",
                "            right: 49px;",
                "            width: 82px;",
                "            height: 44px;",
                "            background-image: url('//resource.a0bi.com/resource/image/normalize-flash-launch/teach-btn.png?v=20210111');",
                "            background-repeat: no-repeat;",
                "            background-position: 0 0;",
                "            cursor: pointer;",
                "        }",
                "        #normalize-flash-launch-wrapper .guide-detail{",
                "            position: absolute;",
                "            display: none;",
                "            top: -200px;",
                "            left: -339px;",
                "            width: 491px;",
                "            height: 518px;",
                "            background-image: url('//resource.a0bi.com/resource/image/normalize-flash-launch/guide-detail.png?v=20210108');",
                "            background-repeat: no-repeat;",
                "            background-position: 0 0;",
                "            z-index: 11;",
                "        }",
                "        #normalize-flash-launch-wrapper .teach-btn:hover .guide-detail{",
                "            display: block;",
                "        }",
                "        #normalize-flash-launch-wrapper .guide-detail:hover{",
                "            display: block;",
                "            cursor: initial;",
                "        }",
                "        #normalize-flash-launch-wrapper .browser-list{",
                "            width: 100%;",
                "            margin-top: 50px;",
                "            text-align: center;",
                "        }",
                "        #normalize-flash-launch-wrapper .browser-list .browser{",
                "            width: 74px;",
                "            height: 72px;",
                "            display: inline-block;",
                "            background-repeat: no-repeat;",
                "            background-position: 0 0;",
                (config.browser_link.length > 1 ? "margin-left:15px;" : ""),
                "        }",
                "        #normalize-flash-launch-wrapper .mvteach-btn{",
                "            position: absolute;",
                "            width: 133px;",
                "            height: 41px;",
                "            bottom: 0px;",
                "            left: 180.6px;",
                "            background-image:url('//resource.a0bi.com/resource/image/normalize-flash-launch/mvteach-btn.png');",
                "            background-repeat: no-repeat;",
                "            background-position: 0 0;",
                "        }",
            ].join('');

            // add style node
            var styleNode = document.createElement("style");
            styleNode.type = "text/css";
            if (styleNode.styleSheet) {
                // ie
                styleNode.styleSheet.cssText = css_str;
            } else {
                styleNode.innerHTML = css_str;
            }
            document.getElementsByTagName("head")[0].appendChild(styleNode);
            // 关闭按钮图标
            resource.close_btn = resource.close_btn || '//resource.a0bi.com/resource/image/normalize-flash-launch/close.png';

            // 处理浏览器列表
            var browser_list_html = ''
            for (var i = 0, len = config.browser_link.length; i < len; i++) {
                browser_list_html += '<a href="' + config.browser_link[i]['link'] + '" data-browser="' + config.browser_link[i].name + '" title="点击下载该浏览器" class="browser" style="background-image:url(' + config.browser_link[i]['logo'] + ')"></a>'
            }


            var html = [
                // 2025年3月21日16:43 隐藏关闭按钮
                "<img id='normalize-flash-launch-close-btn' title='关闭' src='" + resource.close_btn + "' style=\"",
                "    position: absolute;",
                "    z-index: 11;",
                "    right: 10px;",
                "    top: 10px;",
                "    cursor: pointer;",
                "    display: none;",
                "\"/>",
                "<div style=\"",
                "    width: 100%;",
                "    height: 100%;",
                "    background: black;",
                "    opacity: 0.7;",
                "filter:alpha(opacity=70);",
                "\"></div>",
                "  ",
                "    ",
                "    <div class=\"content\" style=\"",
                "                            \"><div style=\"",
                "    color: #fff;",
                "    font-size: 16px;",
                "text-align:center;",
                "\">当前浏览器无法运行Flash，",
                //"继续游戏，可使用以下第三方浏览器（可点击以下图标直接下载）</div>                                     <div class=\"browser-list\"><a href=\"//img2.a0bi.com/browers/360se12.2.1786.0.exe\" data-browser=\"360safe\" title=\"点击下载该浏览器\" class=\"browser\" style=\"background-image:url(//resource.a0bi.com/resource/image/normalize-flash-launch/360safe.png)\"></a><a href=\"//img2.a0bi.com/browers/360cse_12.0.1592.0.exe\" data-browser=\"360fast\" title=\"点击下载该浏览器\" class=\"browser\" style=\"background-image:url(//resource.a0bi.com/resource/image/normalize-flash-launch/360fast.png)\"></a><a href=\"//img2.a0bi.com/browers/sogou_explorer_10.0.2_1015.exe\" data-browser=\"sogou\" title=\"点击下载该浏览器\" class=\"browser\" style=\"background-image:url(//resource.a0bi.com/resource/image/normalize-flash-launch/sogou.png)\"></a>            </div>   <div style=\"",
                "继续游戏，可使用以下第三方浏览器（可点击以下图标直接下载）</div>                                     <div class=\"browser-list\">" + browser_list_html + "            </div>   <div style=\"",
                "    color: #fff;",
                "    font-size: 14px;",
                "    margin-top: 50px;",
                "text-align:center;",
                "\">如需寻求帮助，请联系客服QQ：800 821 822；</div><div style=\"",
                "    color: #fff;",
                "    font-size: 14px;",
                "    margin-top: 10px;",
                "text-align:center;",
                "\">电话联系客服请致电 020-83995251</div>",
                "</div>",
            ].join('');
            nd.innerHTML = html;
            nd.style.cssText = 'position:absolute;top:0';
            // 绑定统一的事件
            that.bindCommonEvent && that.bindCommonEvent();
        },
        bindCommonEvent: function () {
            var that = this;
            // 添加关闭按钮事件
            var nd_close_btn = document.getElementById('normalize-flash-launch-close-btn');
            nd_close_btn && addEventPolyfill(nd_close_btn, 'click', function () {
                that.revealFlash();
            });
            var timer;
            that.nd.onclick = that.debounce(function (e) {
                e = e || window.event;
                var target = e.target || e.srcElement;
                // 点击下载浏览器、或者游戏客户端，百田管家
                if (!!~target.className.indexOf('browser') || !!~target.className.indexOf('game-client')) {
                    var name = target.getAttribute('data-browser');
                    // 501085 奥奇专用
                    window.sendUserEvent && window.sendUserEvent(BEACON.USER_DOWNLOAD_BROWSER_IN_AOQI_PAGE, {
                        btnName: name
                    });
                    BEACON.USER_DOWNLOAD_BROWSER._userDownloadBrowserName = name;
                    that.sendBeacon(BEACON.USER_DOWNLOAD_BROWSER);
                }
                // 提示部分微端暂未发布
                if (!!~target.className.indexOf('unpublish-game-client')) {
                    var toast = document.getElementById('normalize-flash-launch-toast');
                    var nd_toast_content = document.getElementById('normalize-flash-launch-toast-content');
                    var verbose = target.getAttribute('data-toast');
                    nd_toast_content.innerText = verbose;
                    toast && (toast.style.display = 'inline-block');
                    if (timer) {
                        clearTimeout(timer)
                    }
                    timer = setTimeout(function () {
                        toast && (toast.style.display = 'none');
                    }, 1000 * 1.8)
                }
            }, true, 300)
        },
        debounce: function (func, immediate, wait) {
            var timer;
            wait = wait || 100;
            return function () {
                var context = this;
                var args = Array.prototype.slice.call(arguments);
                if (timer) clearTimeout(timer);
                if (immediate) {
                    var callNow = !timer;
                    timer = setTimeout(function () {
                        timer = null;
                    }, wait)
                    if (callNow) func.apply(context, args)
                } else {
                    timer = setTimeout(function () {
                        func.apply(context, args)
                    }, wait);
                }
            }
        }
    }



    function Strategy() {
        this.Factory = {}
    }
    Strategy.prototype = {
        register: function (name, constructor, ref) {
            this.mixin(constructor.prototype, ref || polyfill)
            // this.mixin(constructor.prototype, ref || Util)
            // var originalPopFunc = constructor.prototype.popPlayHTML;
            // constructor.prototype.popPlayHTML = function () {
            //     var win = originalPopFunc.call(this);
            //     // send window open success beancon
            //     win && this.sendBeacon(BEANCON.WINDOW_OPEN_SUCCESS);
            // }
            this.Factory[name] = constructor
        },
        mixin: function (target, ref) {
            for (var fn_name in ref) {
                if (!target[fn_name]) {
                    target[fn_name] = ref[fn_name]
                }
            }
        },
        getCtor: function (_path) {
            var rules = this.Factory;
            for (var attr in rules) {
                if (!!~_path.indexOf(attr)) {
                    return rules[attr]
                }
            }
        }
    }

    var BROWSER_LIST = [ // 奥比、奥雅 用
        { 
            link: '//guanjia.100bt.com/d/win',
            logo: '//resource.a0bi.com/resource/image/normalize-flash-launch/btgj.png',
            name: 'BTgj'  //  2021-6-03 新增百田管家下载按钮
        },
        // 2025年3月21日16:43 删除搜狗浏览器
        // {
        //     link: '//img2.a0bi.com/browers/sogou_explorer_10.0.2_1015.exe',
        //     logo: '//resource.a0bi.com/resource/image/normalize-flash-launch/sogou.png',
        //     name: 'Sogou'
        // },
        {
            link: '//img2.a0bi.com/browers/360cse_12.0.1592.0.exe',
            logo: '//resource.a0bi.com/resource/image/normalize-flash-launch/360fast.png',
            name: '360EE'
        }
        // {
        //     link: '//img2.a0bi.com/browers/360se12.2.1786.0.exe',
        //     logo: '//resource.a0bi.com/resource/image/normalize-flash-launch/360safe.png',
        //     name: '360SE'
        // }
    ]

    var BROWSER_LIST_NEW = [ // 奥拉、奥奇 用
        // 2025年3月21日16:43 删除搜狗浏览器
        // {
        //     link: '//img2.a0bi.com/browers/sogou_explorer_10.0.2_1015.exe',
        //     logo: '//resource.a0bi.com/resource/image/normalize-flash-launch/v3/sogou.png',
        //     name: 'Sogou'
        // },
        {
            link: '//img2.a0bi.com/browers/360cse_12.0.1592.0.exe',
            logo: '//resource.a0bi.com/resource/image/normalize-flash-launch/v3/360ee.png',
            name: '360EE'
        }
        // {
        //     link: '//img2.a0bi.com/browers/360se12.2.1786.0.exe',
        //     logo: '//resource.a0bi.com/resource/image/normalize-flash-launch/v3/360se.png',
        //     name: '360SE'
        // }
    ]

    function appendUglyHint_NEW(nd, resource, config) { // 奥拉、奥奇 用
        var that = this;
        var css_str = [
            "        #normalize-flash-launch-wrapper {",
            "            position: relative;",
            "            width: " + (config.wrapper_w || '960px') + ";",
            "            height: " + (config.wrapper_h || '560px') + ";",
            "            background-image: url('" + resource.bg + "');",
            "            background-repeat: no-repeat;",
            "            background-position: 0 0;",
            "        }",
            "       #normalize-flash-launch-wrapper .bg-mask {",
            "           position: absolute;",
            "           width: 100%;",
            "           height: 100%;",
            "           left: 0;",
            "           top: 0;",
            "           background-image: url('" + resource.mask + "');",
            "           background-repeat: no-repeat;",
            "           background-position: 0 0;",
            "        }",
            "        #normalize-flash-launch-wrapper .content-helper{",
            "            display: inline-block;",
            "            height: 100%;",
            "            vertical-align: middle;",
            "        }",
            "        #normalize-flash-launch-wrapper .h5-game-link{",
            "            position: absolute;",
            "            top: 189px;",
            "            left:0;",
            "            width: 100%;",
            "            color:#fff;",
            "            text-align: center;",
            "        }",
            "        #normalize-flash-launch-wrapper .btgm{",
            "            position: absolute;",
            "            top: 313px;",
            "            left: 248px;",
            "        }",
            "        #normalize-flash-launch-wrapper .browser-list{",
            "            position: absolute;",
            "            top: 307px;",
            "            right: 114px;",
            "            width: 326px;",
            "            height: 111px;",
            "            text-align: center;",
            "        }",
            "        #normalize-flash-launch-wrapper .browser-list .browser{",
            (config.browser_link.length > 1 ? "margin-left:15px;" : ""),
            "           border:none;",
            "        }",
            "        #normalize-flash-launch-wrapper .toast{",
            "            display: inline-block;",
            "            vertical-align: middle;",
            "            width:100%;",
            "            color:#fff;",
            "            text-align: center;",
            "            font-size:20px;",
            "        }",
            "        #normalize-flash-launch-wrapper .toast span{",
            "            background: #000;",
            "            padding: 10px;",
            "            border: 1px solid #f0f0f0;",
            "        }",
        ].join('');

        // add style node
        var styleNode = document.createElement("style");
        styleNode.type = "text/css";
        if (styleNode.styleSheet) {
            // ie
            styleNode.styleSheet.cssText = css_str;
        } else {
            styleNode.innerHTML = css_str;
        }
        document.getElementsByTagName("head")[0].appendChild(styleNode);

        // 处理浏览器列表
        var browser_list_html = ''
        for (var i = 0, len = config.browser_link.length; i < len; i++) {
            browser_list_html += '<a href="' + config.browser_link[i]['link'] + '" ><img data-browser="' + config.browser_link[i].name + '" title="点击下载" class="browser" src="' + config.browser_link[i].logo + '"></a>'
        }
        /**
         * 关闭按钮
         * h5版链接
         * 百田管家下载
         * 第三方浏览器下载
         */
        // 微端处理
        var game_client_html = "<a class='btgm' href='//guanjia.100bt.com/d/win'><img style='border:none;' class='game-client' data-browser='btgm' src='//resource.a0bi.com/resource/image/normalize-flash-launch/v3/btgm.png'/></a>";
        if (isMac()) {
            game_client_html = "<img class='btgm game-client unpublish-game-client' data-toast=" + VERBOSE.MAC_CLIENT_UNPUBLISHED + " style='cursor:pointer;border:none;' data-browser='btgm_for_mac' src='//resource.a0bi.com/resource/image/normalize-flash-launch/v3/btgm.png'/>"
        }
        if (isWin10()) {
            game_client_html = "<img class='btgm game-client unpublish-game-client' data-toast=" + VERBOSE.WIN10_CLIENT_UNPUBLISHED + " style='cursor:pointer;border:none;' data-browser='btgm_for_win10' src='//resource.a0bi.com/resource/image/normalize-flash-launch/v3/btgm.png'/>"
        }
        var html = [
            "<div class='bg-mask'></div>",
            "<div class='content-helper'></div>",
            // 2025年3月21日16:43 隐藏关闭按钮
            "<img id='normalize-flash-launch-close-btn' title='关闭' src='" + resource.close_btn + "' style=\"",
            "    position: absolute;",
            "    z-index: 11;",
            "    right: 10px;",
            "    top: 10px;",
            "    cursor: pointer;",
            "    display: none;",
            "\"/>",
            "<a target='_blank' href='"+ config.h5 +"' class='h5-game-link'><span class='game-client' data-browser='h5-link'>"+ config.h5 +"</span></a>",
            game_client_html,
            "<div class=\"browser-list\">" + browser_list_html + "</div>",
            "<div class='toast' id='normalize-flash-launch-toast' style='display:none'><span id='normalize-flash-launch-toast-content'></span></div>"
        ].join('');
        nd.innerHTML = html;
        nd.style.cssText = 'position:absolute;top:0';
        // 绑定统一的事件
        that.bindCommonEvent && that.bindCommonEvent();
    }

    function isMac() {
        var u = navigator.userAgent;
        //  Mac os || ios
        return u.indexOf('Macintosh') > -1 || u.indexOf('like Mac OS X') > -1
        // return true
    }

    function isWin10() {
        return browser_info.os === "Windows" && (parseInt(browser_info.osVersion) === 10);
    }

    if (isMac()) {
        BROWSER_LIST = [{
            link: '//img2.a0bi.com/browers/360Browser_for_mac_12.2.1636.0.dmg',
            logo: '//resource.a0bi.com/resource/image/normalize-flash-launch/360fast.png',
            name: '360EE_for_mac'
        }]

        BROWSER_LIST_NEW = [{
            link: '//img2.a0bi.com/browers/360Browser_for_mac_12.2.1636.0.dmg',
            logo: '//resource.a0bi.com/resource/image/normalize-flash-launch/v3/360ee.png',
            name: '360EE_for_mac'
        }]

    }



    /**
     * 奥奇
     */
    function AoqiPolyfill() {
        this.nd = document.getElementById('normalize-flash-launch-wrapper');
        this.nd_flash = document.getElementById('swfContainer');
        this.flash_inspect_url = '//' + location.host + '/resource/flash_heart_beat.swf';
        this.resource = {
            bg: '//resource.a0bi.com/resource/image/normalize-flash-launch/aoqi/bg.png',
            mask: '//resource.a0bi.com/resource/image/normalize-flash-launch/aoqi/bg-v4.png',
            close_btn: '//resource.a0bi.com/resource/image/normalize-flash-launch/close.png'
        }
        this.config = {
            browser_link: BROWSER_LIST_NEW,
            h5: 'http://aoqi.100bt.com/h5/'
        }
    }
    // 2021-3-30 奥奇自定义展示页
    AoqiPolyfill.prototype.appendUglyHint = appendUglyHint_NEW

    /**
     * 奥拉
     */
    function AolaPolyfill() {
        this.nd = document.getElementById('normalize-flash-launch-wrapper');
        this.nd_flash = document.getElementById('swfContainer');
        this.flash_inspect_url = '//aola.100bt.com/resource/flash_heart_beat.swf'
        this.resource = {
            bg: '//resource.a0bi.com/resource/image/normalize-flash-launch/aola/bg.png',
            mask: '//resource.a0bi.com/resource/image/normalize-flash-launch/aola/bg-v4.png',
            close_btn: '//resource.a0bi.com/resource/image/normalize-flash-launch/close.png'
        }
        this.config = {
            browser_link: BROWSER_LIST_NEW,
            h5: 'http://aola.100bt.com/h5/'
        }
    }
     // 2021-7-12 奥拉自定义展示页
     AolaPolyfill.prototype.appendUglyHint = appendUglyHint_NEW

    /**
     * 奥雅
     */
    function AoyaPolyfill() {
        this.nd = document.getElementById('normalize-flash-launch-wrapper');
        this.nd_flash = document.getElementById('myFlash');
        // flash探针不能是跨域资源
        this.flash_inspect_url = '//aoya.100bt.com/resource/flash_heart_beat.swf'
        this.resource = {
            bg: '//resource.a0bi.com/resource/image/normalize-flash-launch/aoya/bg.png'
        }
        this.config = {
            browser_link: BROWSER_LIST
        }
    }

    /**
     * 奥比
     */
    function AobiPolyfill() {
        this.nd = document.getElementById('normalize-flash-launch-wrapper');
        this.nd_flash = document.getElementById('swfContainer');
        // aobi除了play路径下资源不会重定向到100bt.com/aobi 其余都会注意了
        this.flash_inspect_url = '//aobi.100bt.com/play/flash_heart_beat.swf'
        this.resource = {
            bg: '//resource.a0bi.com/resource/image/normalize-flash-launch/aobi/bg.jpg'
        }
        this.config = {
            browser_link: BROWSER_LIST,
            wrapper_w: '1087px',
            wrapper_h: '684px'
        }
    }

    /**
     *  埋点字段统一新增
     *  浏览器名称
     *  浏览器版本
     *  flash版本
     */
    try {
        var flash_version = polyfill.getFlashVersion()
        // __$browserUA主要是注入给奥奇用
        window.__$browserUA = browser_info.browser;

        function appendBrowserAttr(obj) {
            if (typeof obj === 'object') {
                obj._userBrowserName = browser_info.browser;
                obj._userBrowserVersion = browser_info.version;
                obj._userFlashVersion = flash_version;
            }
            return obj
        }
        if (window.bt && window.bt.track) {
            var _oldBtTrack = window.bt.track;
            window.bt.track = function (name, param) {
                param = appendBrowserAttr(param);
                return _oldBtTrack.call(this, name, param)
            }
        }
    } catch (error) {
        _log(error)
    }

    var VERBOSE = {
        MAC_CLIENT_UNPUBLISHED: 'Mac微端暂未发布，敬请期待',
        WIN10_CLIENT_UNPUBLISHED: 'Win10微端暂未发布，敬请期待'
    }

    var BEACON = {
        'FLASH_AFFECTED': { // flash_affected 因flash不可用受影响的用户
            eventId: '501172'
        },
        'USER_DOWNLOAD_BROWSER': { // user_download_browser 记录点击下载浏览器的用户
            eventId: '501173',
            _userDownloadBrowserName: ''
        },
        'USER_DOWNLOAD_BROWSER_IN_AOQI_PAGE': '501085', // 奥奇专属 记录点击下载浏览器的用户 
        'FLASH_AFFECTED_IN_AOQI_PAGE': '501082' // 奥奇专属 因flash不可用受影响的用户
    };

    /**
     * 1. register polyfill constructor
     * 2. assign strategy by location.href
     * 3. init
     */
    var strategy = new Strategy();
    strategy.register('aoqi.100bt.com', AoqiPolyfill)
    strategy.register('www.pjx.com', AoqiPolyfill)
    strategy.register('aola.100bt.com', AolaPolyfill)
    strategy.register('aoya.100bt.com', AoyaPolyfill)
    strategy.register('aobi.100bt.com', AobiPolyfill)
    var Ctor = strategy.getCtor(location.hostname);
    if (!Ctor) {
        _log('请实现并注册当前' + location.hostname + '游戏的polyfill方法')
    } else {
        var entity = new Ctor();
        // 未安装、未启动、运行无效
        entity.flashInspect(function (val) {
            if (!val) {
                launch();
                // send beacon
                sendCantUseFlashBeacon();
            }
            _log('flash alive:' + val);
        });

        function launch() {
            if (!entity.nd) {
                entity.nd = entity.createHintNode();
            }
            _init();

            function _init() {
                entity.hiddenFlash && entity.hiddenFlash();
                entity.replaceOriginalHintNode && entity.replaceOriginalHintNode();
                entity.init();
            }
        }

        function sendCantUseFlashBeacon() {
            // ywzc 全游戏埋点
            entity.sendBeacon(BEACON.FLASH_AFFECTED);
            // aoqi group demand
            if (entity.constructor && entity.constructor.name === 'AoqiPolyfill') {
                addEventPolyfill(window, 'load', function () {
                    window.sendUserEvent(BEACON.FLASH_AFFECTED_IN_AOQI_PAGE);
                });
            }
        }
    }
})();