const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')

const port = Number(process.env.PORT || 4866)
const rootDir = __dirname
const eventClients = new Set()

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
}

const broadcastReload = () => {
  for (const response of eventClients) {
    response.write('data: reload\n\n')
  }
}

fs.watch(rootDir, { recursive: true }, () => {
  broadcastReload()
})

const server = http.createServer((request, response) => {
  const requestPath = decodeURIComponent((request.url || '/').split('?')[0])

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

  const relativePath = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '')
  const filePath = path.join(rootDir, relativePath)

  if (!filePath.startsWith(rootDir)) {
    response.writeHead(403)
    response.end('Forbidden')
    return
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
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
  console.log(`Play detail bg preview: http://127.0.0.1:${port}`)
})
