Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "D:\temp\ZCode\aola\dist\aola-launcher-pack\AolaStarLauncher"
rc = sh.Run("cmd /c ""D:\temp\ZCode\aola\dist\aola-launcher-pack\AolaStarLauncher\runtime\browser\chrome.exe"" --app=http://127.0.0.1:8700/game --user-data-dir=D:\temp\ZCode\aola\dist\aola-launcher-pack\AolaStarLauncher\profile --no-first-run --no-default-browser-check --disable-features=CalculateNativeWindowOcclusion --window-size=1224,816 --no-sandbox --mute-audio --remote-debugging-port=9223 > D:\temp\ZCode\scratch\chrome_launch4.log 2>&1", 0, False)
CreateObject("Scripting.FileSystemObject").CreateTextFile("D:\temp\ZCode\scratch\chrome_rc4.txt").Write "rc=" & rc
