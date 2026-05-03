const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')

// 默认使用 4867 端口，避免与现有播放详情预览工具端口冲突。
const port = Number(process.env.PORT || 4867)

// 始终以当前工具目录作为静态资源根目录，避免读到仓库其它文件。
const rootDir = __dirname

// 保存所有 SSE 客户端连接，用于文件变更后的热刷新广播。
const eventClients = new Set()

// 统一维护静态资源的内容类型，避免浏览器以错误 MIME 打开文件。
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
}

// 当工具目录文件有变化时，通知浏览器主动刷新页面。
const broadcastReload = () => {
  for (const response of eventClients) {
    response.write('data: reload\n\n')
  }
}

// 监听整个工具目录，便于开发时改动 HTML / CSS / JS 立即生效。
fs.watch(rootDir, { recursive: true }, () => {
  broadcastReload()
})

const server = http.createServer((request, response) => {
  const requestPath = decodeURIComponent((request.url || '/').split('?')[0])

  // SSE 通道专门用于向页面发送 reload 事件。
  if (requestPath === '/__events') {
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    })
    response.write('\n')
    eventClients.add(response)
    request.on('close', () => {
      eventClients.delete(response)
    })
    return
  }

  // 根路径默认返回 index.html，其它路径直接映射到工具目录下文件。
  const relativePath = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '')
  const filePath = path.join(rootDir, relativePath)

  // 阻止目录穿越和目录访问，保证只暴露工具目录里的静态文件。
  if (!filePath.startsWith(rootDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    response.writeHead(404)
    response.end('Not found')
    return
  }

  response.writeHead(200, {
    'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream',
  })
  response.end(fs.readFileSync(filePath))
})

server.listen(port, () => {
  console.log(`Year report preview: http://127.0.0.1:${port}`)
})
