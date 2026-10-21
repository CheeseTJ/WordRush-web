import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Capacitor 配置：把本工程现有的 dist 打进 Android 原生壳。
 *
 * 关键点：
 *  - androidScheme: 'https' —— WebView 的 origin 变成 https://localhost。
 *    必须是 https，否则是「非安全上下文」，navigator.mediaDevices 为 undefined，
 *    跟读与口语对话的录音会直接报「当前环境不支持录音」。
 *  - webDir: 'dist' —— `npm run build` 的产物目录，`npx cap sync` 会把它拷进
 *    android/app/src/main/assets/public。
 *  - 不启 CapacitorHttp：它的 fetch 垫片对 FormData 上传与二进制 blob 响应支持不全，
 *    会打断 /speak/assess 与 /speak/tts。保持 WebView 原生 fetch，靠后端 CORS 放行
 *    https://localhost（见 WordRush-api/config.yaml 的 allowed_origins）。
 */
const config: CapacitorConfig = {
  appId: 'top.taojun.eng',
  appName: 'WordRush',
  webDir: 'dist',
  android: {
    // 录音、TTS 全部走 https，混入 http 内容没有意义，一律禁止
    allowMixedContent: false,
    // 词库/音频都是本地资源，不需要给 WebView 额外开 file 访问
    webContentsDebuggingEnabled: true,
  },
  server: {
    androidScheme: 'https',
  },
}

export default config
