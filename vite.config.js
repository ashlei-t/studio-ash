import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

const ALLOWED = ['context.md', 'now.md', 'log.md']

function contextApiPlugin() {
  return {
    name: 'context-api',
    configureServer(server) {
      server.middlewares.use('/api/context', (req, res) => {
        const file = req.url.replace(/^\//, '').split('?')[0]

        if (!ALLOWED.includes(file)) {
          res.writeHead(404, { 'Content-Type': 'text/plain' })
          return res.end('not found')
        }

        const filePath = path.resolve('context', file)

        if (req.method === 'GET') {
          try {
            const content = fs.readFileSync(filePath, 'utf-8')
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
            res.end(content)
          } catch {
            res.writeHead(404)
            res.end('not found')
          }

        } else if (req.method === 'POST') {
          let body = ''
          req.on('data', chunk => { body += chunk })
          req.on('end', () => {
            try {
              const { content, mode } = JSON.parse(body)
              if (mode === 'append') {
                fs.appendFileSync(filePath, '\n' + content, 'utf-8')
              } else {
                fs.writeFileSync(filePath, content, 'utf-8')
              }
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ ok: true }))
            } catch (e) {
              res.writeHead(500)
              res.end(e.message)
            }
          })

        } else {
          res.writeHead(405)
          res.end()
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), contextApiPlugin()],
  server: {
    proxy: {
      '/api/anthropic': {
        target: 'https://api.anthropic.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/anthropic/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.removeHeader('origin')
            proxyReq.removeHeader('referer')
          })
        },
      },
    },
  },
})
