# 二次加固说明（XopProtector）

本项目在自身 R8 混淆、Web 资源 AES-256-GCM 加密、签名校验的基础上，使用
[XopProtector](https://github.com/xopJack/XopProtector) 对 APK 再做一层 DEX 加密与原生壳保护。

## 学习到的机制

XopProtector 是构建期 packer + 设备端原生壳：

- **DEX 加密**：原始 `classes*.dex` 被加密进 `assets/protector/dexes.zip`，运行时由壳解密并合并；
- **原生壳**：`libprotector.so`（arm64-v8a / armeabi-v7a）负责解密、class hook、RASP；
- **垃圾 DEX**：`classes2.dex` 为噪声，增加静态分析成本；
- **可选能力**：PVM1/PVM2 VMP、业务 SO `.text` 加密、assets 加密、RASP、反调试/反 Hook；
- **二次打包防护**：签名校验 + 壳内完整性检查。

## 本项目实际使用的命令

版本：XopProtector 0.6.26（Windows x64 便携版）

```powershell
java -jar protector-packer.jar 课表SuperTable.apk ^
  -o 课表SuperTable-xop.apk ^
  --shell-dir shell-files ^
  --profile balanced ^
  --no-protect-so ^
  --no-encrypt-assets ^
  --rasp-action 0 ^
  --risk-flags 0 ^
  --report-enabled 0 ^
  --keystore android\keystore.jks --alias supertable ^
  --storepass <自己填> --keypass <自己填>
```

说明：

- `--no-protect-so`：应用没有业务 SO，避免无意义处理；
- `--no-encrypt-assets`：`assets/www.enc` 已经由本项目 AES-GCM 加密，保留原有逻辑；
- `--rasp-action 0`：关闭壳的主动 RASP 动作。其 ART hook 在 x86_64 模拟器上会触发
  `ART class hooks failed` 并崩溃；关闭后可在模拟器（ARM 转译）与 arm64 手机上启动。
  在真机 arm64 上如需要可改为 `--rasp-action 2`，但本项目未在真机验证，默认关闭；
- 签名使用原 keystore，`SecurityCheck` 的证书 SHA-256 保持不变。

## 产物确认

- `assets/protector/dexes.zip`：加密后的原始 DEX；
- `assets/protector/code.bin` / `config.json`：壳配置；
- `lib/arm64-v8a/libprotector.so`、`lib/armeabi-v7a/libprotector.so`：原生壳；
- `assets/www.enc`：应用自身的加密 Web 资源，未被破坏；
- 已安装到模拟器验证：启动、WebView 页面、本地服务（47821）、提醒任务均正常。

## 限制

- 壳只包含 **arm64-v8a / armeabi-v7a**，x86/x86_64 设备不支持；vivo X300 Ultra 为 arm64，适用。
- 加固只能提高逆向成本，不能保证绝对不可破解。
- XopProtector 为 Apache-2.0 开源项目，使用前请遵守其许可证；本说明不构成对其安全性的担保。
