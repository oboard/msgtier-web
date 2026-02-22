# MsgTier Web

MsgTier 的前端界面，用于查看网络状态与进行聊天。基于 Vue 3 + Vite + Tailwind + DaisyUI。

## 开发

```bash
npm install
npm run dev
```

默认通过相同域名的 `/api` 访问后端。后端需要启动并提供 `/api/status` 与 `/api/ws`。

## 构建

```bash
npm run build
```

产物在 `dist/`。

## 主要页面

- Home：节点状态总览
- Chat：聊天与文件/图片/视频消息
- Network：节点拓扑与路由
- Connections：连接详情与带宽

## WebSocket 行为

- 前端使用 `/api/ws` 建立连接
- 内置心跳与断线重连，保证消息持续可接收

## 常见问题

如果前端只能发送不能接收，请确认后端 WebSocket 正常，并检查反向代理是否支持升级连接。
