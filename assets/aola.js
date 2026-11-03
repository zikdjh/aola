		/**
		###### 初始化配置 ########
	*/
	var oldLoad = window.onload;
	window.onload = function () {
	    oldLoad && oldLoad();
	    return; //暂时撤下，等替代方案
	    var dataAppKey = "B4pSSNZyKjgPelNXCUZRJDJc"; //TODO 每个游戏的AppKey不一样，看前面配置
	    var dataDomain = "//bgno194r0qm5.predem.qiniuapi.com";

	    var scriptElement = document.createElement("script");
	    scriptElement.src = "//pub-static.100bt.com/pre-dem-web-v.js";
	    scriptElement.setAttribute("data-app-key", dataAppKey);
	    scriptElement.setAttribute("data-domain", dataDomain);
	    scriptElement.setAttribute("crossorigin", "");
	    document.body.appendChild(scriptElement);
	};
	 
	 
	/**
		###### 1.文件下载成功统计 ########
	*/
	function sendResourceData(isUnload, searchElementName) {
	    return; //暂时撤下，等替代方案
		//alert("sendResourceData");
		try {
			var loadStatusArr = [];
			var sendData = [];
			if (isUnload) {//关闭页面补发数据
				loadStatusArr = window.performance.getEntriesByType && window.performance.getEntriesByType("resource");
			} else {
				loadStatusArr = window.performance.getEntries && window.performance.getEntries();
			}
			for (var i = 0; i < loadStatusArr.length; i++) {
				if (!!loadStatusArr[i].transferSize && loadStatusArr[i].transferSize != 0 && !!loadStatusArr[i].name && loadStatusArr[i].name.indexOf("start.xml") == -1) {
					if(searchElementName == null || loadStatusArr[i].name.indexOf(searchElementName) != -1){
						sendData.push({ eventName: "resourceData", eventData: loadStatusArr[i] });
					}
				}
			}
			if(sendData.length > 0){
				predem && predem.sendEvents(sendData);
				window.performance.webkitClearResourceTimings && window.performance.webkitClearResourceTimings();
				window.performance.clearResourceTimings && window.performance.clearResourceTimings();
			}
		} catch (e) {
			console.log(e)
		}
	}
	 
	/**
		###### 2.文件下载失败统计 ########
	*/
	function addIOErrorLog(url) {
	    return; //暂时撤下，等替代方案
		window.predem && window.predem.sendEvents([{ eventName: "errorResourceData", eventData: { u: url} }]);
	}
	 
	/**
		###### 3.Http请求失败统计 ########
	*/
	function addHttpReqFailLog(eventData) {
	    return;//暂时撤下，等替代方案
		window.predem && window.predem.sendEvents([{ eventName: "HttpReqFailData", eventData: eventData}]);
		console.log("addHttpRequestFailLog");
	}
	 
	/**
		###### 3.Socket链接失败统计 ########
	*/
	function addSocketConnectFailLog(eventData) {
	    return; //暂时撤下，等替代方案
		window.predem && window.predem.sendEvents([{ eventName: "SocketFailData", eventData: eventData}]);
		console.log("addSocketConnectFailLog");
	}

    function getQS(key)
	{
		var search = window.location.search;
		if (search == "" || search == "?")
		{
			return null;
		}
		var qs = window.location.search.substring(1);    
		var kvItems = qs.split("&");
		var kv;
		for (i=0; i < kvItems.length; i++) 
		{
			kv =  kvItems[i].split("=");
			if (kv[0] == key)
		   {
				return kv.length == 1 ? "" : kv[1];
			}
		}
	}

	function getU()
	{
		return getQS("u");	    
	}
		
	function getCode()
	{
		return getQS("code");
	}
		
	function isReg()
	{
	   return getQS("reg") !=  null;
	}
	
    function getCookie(name) {
        var arr, reg = new RegExp("(^| )" + name + "=([^;]*)(;|$)");
        if (arr = document.cookie.match(reg))
            return decodeURIComponent(arr[2]);
        else
            return null;
    }
	
	function addCookieFromAs() {
		var params = arguments[0];
		addCookie(params[0], params[1], params[2], params[3]);
	}

    function addCookie(name, value, expiresMs) { 
        var cookieString=name+"="+encodeURIComponent(value); 
        //判断是否设置过期时间 
	    if(expiresMs>0) { 
		    var date=new Date(); 
            date.setTime(date.getTime()+expiresMs); 
            cookieString=cookieString+"; expires="+date.toGMTString(); 
	    }
	    var domain = ".100bt.com";
	    cookieString = cookieString+';path=/;domain='+domain;
        document.cookie=cookieString;
    } 
	function delCookie(name, domain) {
		addCookie(name, "", -1000, domain);
	}
    function getHref() {
        return location.href;
    }
	function showWebLogin(url){
		location.href = url + "&" + (new Date() - 0);
	}
   
    function addFav(key) {
        try
        {
            window.external.addFavorite("//aola.100bt.com/?fav=" + key  ,"奥拉星-奇趣奥拉星，你我快乐行");
        }
        catch (e)
        {
            try{
                window.external.addToFavoritesBar("//aola.100bt.com/?fav=" + key  ,"奥拉星-奇趣奥拉星，你我快乐行", "slice");    
            }
            catch(e)
            {
                try
                {
                    window.sidebar.addPanel("奥拉星-奇趣奥拉星，你我快乐行","//aola.100bt.com/?fav=" + key  , "");
                }
                catch (e)
                {
                    alert("非常抱歉，你的浏览器目前还不支持此功能！请在浏览器的收藏夹或书签菜单里进行手动添加。");
                }
            }
        }
        
        return "callsuccess";
    }
        
    function setHomePage() {
        if (document.all) {
            document.body.style.behavior='url(#default#homepage)';
            document.body.setHomePage('//aola.100bt.com'); 
        }
    }
        
    function navToHelp() {
        window.location.href = "http://www.9aola.com/help/quickstart.html";
    }   
    
    function bOver(btn){
        btn.src = btn.src.replace('.jpg', '_active.jpg');
    }
    
    function bOut(btn){
        btn.src = btn.src.replace('_active.jpg', '.jpg');
    }
    
    function logout(){
        window.location.href = "//aola.100bt.com/";
    }
	
	function getRef() {
	    var ref = document.referrer;	
	    return (ref == null || ref == "") ? getFrom() : ref;
    }

    function getFrom() {
	    var from = getQS("site");
	    return from == null ? "" : from;
    }


    function getSN() {
	    return getDomain(getRef());
    }

    //http://www.aobi.com/blabla..... -> www.aobi.com
    function getDomain(url) {
	    var urlItems = url.split('/'); 
	    if (urlItems.length == 1) return url;
	    return urlItems[2];
    }
    
    var needAddFav = false;
        //JS调用AS

   function callASFun(){
       try{
          thisMovie("myFlash").closeSocket("关闭Socket");
          }
          catch(e){}
    }
    window.onbeforeunload = onbeforeunload_handler;
    window.onunload = onunload_handler;
    function onbeforeunload_handler(){
	    if(needAddFav){
		    addFav("activate");
	    }
       }

     function onunload_handler(){
	    callASFun();
    }

     function thisMovie(movieName) {
        if (navigator.appName.indexOf("Microsoft") != -1) {
             return window[movieName];
        }else{
             return document[movieName+"Embed"];
        }
      }

	function setNeedAddFav()
	{
		needAddFav = true;
	}
	function getO(id) {
		return document.getElementById(id);
	}
	
	function showVideoPlayer() {   
       var url = "//v.100bt.com/video/gamevdo/aola/list.html";
       showVideo(url);		
	}
	
	function showAnniversaryVideo(){
	    var url = "//v.100bt.com/video/aola/37591.html";
        showVideo(url);	
	}
	
	function showWarTeamVideo(){
	    var url = "//aola.100bt.com/gwActivity/20121227/play.html";
        showVideo(url);	
	}
	
	function showJazzKaKaVideo(){
	    var url = "//www.100bt.com/special/20130613/index.html";
        showVideo(url);
    }

    function showUrlInGame(url) {
	    showUrlByInnerHtml(url, false);
	}

	function showVideo(url){
	    showUrlByInnerHtml(url, true);
	}

    function showUrlByInnerHtml(url, isNeedClosButton) {
        var vBoxW = 960;
        var vBoxH = 560;

        clearVideoPlayer();
        var innerHtml = isNeedClosButton ? createInnerHtmlWithCloseButton(url, vBoxW, vBoxH) : createInnerHtmlWithOutCloseButton(url, vBoxW, vBoxH);
        var oDiv = createODiv(vBoxW, vBoxH, innerHtml);
        document.body.appendChild(oDiv);
    }

    function createODiv(vBoxW, vBoxH, innerHtml) {
        var oDiv = document.createElement("div");
        oDiv.setAttribute("id", "vDiv");
        oDiv.setAttribute("align", "center");
        oDiv.style.position = "absolute";

        var posLeft = (document.body.scrollWidth - vBoxW) / 2;
        var posTop = (document.body.scrollHeight - vBoxH) / 2;
        oDiv.style.left = "0px";
        oDiv.style.top = "0px";
        oDiv.style.width = vBoxW + "px";
        oDiv.style.height = vBoxH + "px";
        oDiv.style.zIndex = "10001";
        oDiv.style.overflow = "hidden";
        oDiv.innerHTML = innerHtml;
        return oDiv;
    }

    function createInnerHtmlWithCloseButton(url, vBoxW, vBoxH) { 
     return  '<div class="vcbtnDiv"><a class="vcbtnA" href="javascript:;" onclick="clearDiv();"></a></div>'
		+ 
		 '<iframe id="vIframe" src="'+url+'" width="' + vBoxW + '" height="' + vBoxH + '" frameborder="0" overflow="hidden"></iframe>';
   }
   function createInnerHtmlWithOutCloseButton(url, vBoxW, vBoxH){
    return '<iframe id="vIframe" src="'+url+'" width="' + vBoxW + '" height="' + vBoxH + '" frameborder="0" overflow="hidden"></iframe>';
   }
 
	function clearVideoPlayer(){
		var vDiv = getO('vDiv');
		var vIframe = getO('vIframe');		
		
		if(vIframe){
			vIframe.src = "";
		}
		
		if(vDiv)	{
			if(document.all) vDiv.removeNode(true);
			else vDiv.parentNode.removeChild(vDiv);
		}	
	}
	
    function clearDiv(){
	    clearVideoPlayer();
	    thisMovie("myFlash").openVoice("开启声音");
	}

    //关服页面
    function goCloseMainPageUrl(){
           var url = "//aola.100bt.com#gameName=aola&buttonName=官网引导";
           window.open(url);
    }
    //关服页面
    function goCloseAolaQuUrl(){
           var url = "//qq.100bt.com/TTQInfo/13_0_0/0.html#gameName=aola&buttonName='圈圈引导'";
           window.open(url);
    }
    
    //周年庆页面
    function goAnniversaryUrl(){
         var url = "//aola.100bt.com/gwActivity/20130725/aola.html#";
          window.open(url);
      }

      //微博授权登陆后回调函数
      function bindRdHandler(isSuccess) {
         if(isSuccess){
             thisMovie("myFlash").openWeiBoSharePanel("打开微博分享页面");
         }
      }

      function wenjuan(qId) {
			clearVideoPlayer();
            thisMovie("myFlash").afterCloseWenJuan(qId);
      }

       function closeAccount() {
			clearVideoPlayer();
            thisMovie("myFlash").afterCloseAccount();
        }

        function setCurWindow() {
            window.location = "//www.4399.com";
        }

        function getCurWindow() {
            //return window.location.href.substring(0);
            return document.URL;
        }

        function getWindowLocationHref() {
            return window.location.href;
        }

        function showPayDialog(data) {
            data = data[0];
            data.userInfo.role = decodeURIComponent(data.userInfo.role);
            data.userInfo.nick = decodeURIComponent(data.userInfo.nick);
            return window.payObject.showPayDialog(data);
        }
		
		function getUserAgent(){
			 return window.navigator.userAgent.toLowerCase();
		}
    