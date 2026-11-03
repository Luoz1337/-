# 构建 Android APK（无需 Gradle / Android Studio）
# 依赖：Android SDK（platforms;android-34、build-tools;34.0.0）、JDK 17

$ErrorActionPreference = 'Stop'

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $here
$sdk = if ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT } elseif ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { 'E:\AndroidSdk' }
$jdk = if ($env:JAVA_HOME) { $env:JAVA_HOME } else { 'C:\Program Files\Java\jdk-17' }
$build = Join-Path $here 'build'
$assets = Join-Path $here 'assets'
$www = Join-Path $assets 'www'
$androidJar = Join-Path $sdk 'platforms\android-34\android.jar'

if (-not (Test-Path $androidJar)) { throw "找不到 $androidJar，请先安装 platforms;android-34" }

$buildTools = Get-ChildItem (Join-Path $sdk 'build-tools') -Directory |
    Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1
if (-not $buildTools) { throw '找不到 build-tools' }
$bt = $buildTools.FullName

Write-Host "SDK: $sdk"
Write-Host "Build tools: $($buildTools.Name)"

# 1. 准备 Web 资源
Remove-Item -Recurse -Force $assets -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force $build -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $www | Out-Null
New-Item -ItemType Directory -Force $build | Out-Null

Copy-Item (Join-Path $root 'index.html') $www
Copy-Item (Join-Path $root 'manifest.webmanifest') $www
Copy-Item (Join-Path $root 'sw.js') $www
Copy-Item -Recurse (Join-Path $root 'css') $www
Copy-Item -Recurse (Join-Path $root 'js') $www
Copy-Item -Recurse (Join-Path $root 'icons') $www

# 1.1 压缩并加密 Web 资源，APK 中只保留密文包
Write-Host 'pack / encrypt web assets ...'
$assetKey = '7d3f9a2c5e8b1f4a6c9d0e3b7a5f2c8d1e4b6a9f0c3d5e7a2b4c6d8e0f1a3b5c'
& python (Join-Path $here 'pack_assets.py') $www (Join-Path $build 'www.zip')
& node (Join-Path $here 'encrypt_assets.mjs') (Join-Path $build 'www.zip') (Join-Path $assets 'www.enc') $assetKey
if (-not (Test-Path (Join-Path $assets 'www.enc'))) { throw 'Web 资源加密失败' }
Remove-Item -Recurse -Force $www

# 2. 资源编译与链接
Write-Host 'aapt2 compile / link ...'
& (Join-Path $bt 'aapt2.exe') compile --dir (Join-Path $here 'res') -o (Join-Path $build 'res.zip')
& (Join-Path $bt 'aapt2.exe') link `
    -o (Join-Path $build 'base.apk') `
    -I $androidJar `
    --manifest (Join-Path $here 'AndroidManifest.xml') `
    -R (Join-Path $build 'res.zip') `
    --java (Join-Path $build 'gen') `
    --min-sdk-version 26 `
    --target-sdk-version 34 `
    --auto-add-overlay

# aapt2 在 Windows 下会把 assets 路径写成反斜杠，Android 无法读取；
# 这里改用 Python 以正斜杠追加 assets 条目
Write-Host 'add assets ...'
& python (Join-Path $here 'add_assets.py') (Join-Path $build 'base.apk') $assets

# 3. 编译 Java
Write-Host 'javac ...'
$sources = @()
$sources += (Get-ChildItem (Join-Path $build 'gen') -Recurse -Filter *.java | ForEach-Object FullName)
$sources += (Get-ChildItem (Join-Path $here 'java') -Recurse -Filter *.java | ForEach-Object FullName)
& (Join-Path $jdk 'bin\javac.exe') -encoding UTF-8 --release 11 `
    -classpath $androidJar -d (Join-Path $build 'classes') $sources
if ($LASTEXITCODE -ne 0) { throw 'javac 编译失败' }

# 4. dex（R8 混淆与压缩，失败时回退 d8）
Write-Host 'R8 ...'
New-Item -ItemType Directory -Force (Join-Path $build 'dex') | Out-Null
$classFiles = (Get-ChildItem (Join-Path $build 'classes') -Recurse -Filter *.class | ForEach-Object FullName)
$r8Jar = Join-Path $bt 'lib\d8.jar'
$r8Out = Join-Path $build 'r8'
New-Item -ItemType Directory -Force $r8Out | Out-Null
$useR8 = $env:USE_R8 -ne '0'
if ($useR8) {
    & (Join-Path $jdk 'bin\java.exe') -cp $r8Jar com.android.tools.r8.R8 `
        --release --min-api 26 `
        --lib $androidJar `
        --pg-conf (Join-Path $here 'proguard-rules.pro') `
        --output $r8Out $classFiles
}
if (-not $useR8 -or $LASTEXITCODE -ne 0 -or -not (Test-Path (Join-Path $r8Out 'classes.dex'))) {
    Write-Host 'R8 failed, fallback to d8'
    & (Join-Path $bt 'd8.bat') --lib $androidJar --min-api 26 --output (Join-Path $build 'dex') $classFiles
    Copy-Item (Join-Path $build 'dex\classes.dex') (Join-Path $r8Out 'classes.dex') -Force
}

Push-Location $r8Out
& (Join-Path $jdk 'bin\jar.exe') --update --file (Join-Path $build 'base.apk') classes.dex
Pop-Location

# 5. 对齐与签名
Write-Host 'zipalign ...'
& (Join-Path $bt 'zipalign.exe') -f 4 (Join-Path $build 'base.apk') (Join-Path $build 'aligned.apk')

$ks = Join-Path $here 'keystore.jks'
$pass = if ($env:SUPERTABLE_KS_PASS) { $env:SUPERTABLE_KS_PASS } else { 'change-me-before-signing' }
if (-not (Test-Path $ks)) {
    Write-Host 'create keystore ...'
    & (Join-Path $jdk 'bin\keytool.exe') -genkeypair -noprompt `
        -keystore $ks -alias supertable -keyalg RSA -keysize 2048 -validity 10000 `
        -storepass $pass -keypass $pass `
        -dname 'CN=SuperTable,OU=App,O=SuperTable,L=Wuhan,ST=Hubei,C=CN'
}

$dist = Join-Path $root 'dist'
New-Item -ItemType Directory -Force $dist | Out-Null
$apk = Join-Path $dist '课表SuperTable.apk'
Remove-Item -Force $apk -ErrorAction SilentlyContinue

Write-Host 'apksigner ...'
& (Join-Path $bt 'apksigner.bat') sign `
    --ks $ks --ks-key-alias supertable `
    --ks-pass "pass:$pass" --key-pass "pass:$pass" `
    --out $apk (Join-Path $build 'aligned.apk')

& (Join-Path $bt 'apksigner.bat') verify --print-certs $apk

$size = [math]::Round((Get-Item $apk).Length / 1MB, 2)
Write-Host "APK: $apk ($size MB)"
