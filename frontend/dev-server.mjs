import { createServer } from 'vite'

async function start() {
  const server = await createServer({
    configFile: './vite.config.ts',
    root: '.',
    server: {
      port: 1420,
      strictPort: true,
      host: '0.0.0.0',
    },
  })
  await server.listen()
  console.log(`[DevServer] Ready at http://localhost:1420/`)
}

start().catch((err) => {
  console.error('[DevServer] Error:', err)
  process.exit(1)
})
