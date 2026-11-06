<div align="center">
  <h1>WordRush · Web</h1>
  <p>单词闯关应用前端 · React + Vite，PWA 与 Android 壳双形态，含 AI 口语对话</p>
</div>

<div align="center">

![React](https://img.shields.io/badge/React-18-61dafb)
![Vite](https://img.shields.io/badge/Vite-6-646CFF)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6)
![Capacitor](https://img.shields.io/badge/Capacitor-Android-119EFF)
![License](https://img.shields.io/badge/License-MIT-green)

</div>

## 项目定位

WordRush 的**前端**，配套后端是 [WordRush-api](https://github.com/CheeseTJ/WordRush-api)。
同一份代码产出三种形态：浏览器 PWA、Android 原生壳（Capacitor）、以及部署在
Cloudflare Pages 的 Web 站点。

```text
React (本仓库)
  ├── 浏览器 / PWA       PWA manifest + Service Worker
  ├── Android 壳         Capacitor（filesystem / haptics / status-bar）
  └── Pages 部署         vite build → dist
        │
        └── fetch /api/* ──> WordRush-api
```

## 功能

- **闯关** —— 关卡地图、单词测验、答题反馈与连击
- **复习** —— 间隔重复队列，错题优先
- **课程** —— 课程/单元管理，学习进度
- **故事** —— 阅读短文，结合已学单词
- **场景对话** —— AI 口语对练，实时对话（走 Workers AI）
- **我的** —— 学习统计、经济余额、装扮解锁

## 快速开始

```bash
npm install
npm run dev          # 开发服务器
```

构建与部署：

```bash
npm run build        # 产物 dist/
npm run preview      # 本地预览
```

### 后端地址

由 `VITE_API_BASE` 控制（见 `.env.production`）：

```bash
VITE_API_BASE=https://api.example.com
```

留空则走同源请求——若使用 `wrangler pages deploy` 并启用 `functions/api` 同域反代，
可以清空此项回到同源。

### Android 打包

```bash
npm run build
npx cap sync android
npx cap open android
```

`capacitor.config.ts` 里 `androidScheme: https`，所以壳内页面的 origin 是
`https://localhost`——后端 CORS 白名单需要放行这个来源。

## 目录结构

```text
src/
  pages/         Home / Map / Quiz / Review / Courses / Story /
                 Scenarios / ScenarioChat / Me / Login
  components/    可复用 UI
  state/         应用状态
  api/           后端接口封装
  data/          静态数据（词库结构、装饰等）
  platform.ts    平台能力抽象（Web / Capacitor）
  styles*.css    按设备拆分的样式：desktop / tablet / mobile /
                 books / courses / chat / scenario
functions/       Pages Functions（同域反代，可选）
android/         Capacitor Android 工程
scripts/         构建辅助脚本
```

## 技术取舍

- **不引入 UI 框架**，样式按设备形态拆成多个 CSS 文件，避免媒体查询地狱
- **`platform.ts` 做能力抽象**，同一套组件在 Web 与 Android 壳里走不同实现
  （文件打开、触感反馈、状态栏）
- **状态与数据分离**：`data/` 放静态内容，`state/` 放运行态，互不污染

## License

[MIT](./LICENSE) © 2026 JuneT
