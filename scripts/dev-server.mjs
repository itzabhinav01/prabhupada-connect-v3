import { createServer } from 'vite'

async function start() {
  const server = await createServer({
    configFile: 'C:/prabhupadaconnectv3/frontend/vite.config.ts',
    root: 'C:/prabhupadaconnectv3/frontend',
    server: {
      port: 1420,
      strictPort: true,
      host: '0.0.0.0',
    },
  })
  await server.listen()
  console.log(`[DevServer] Listening at http://localhost:1420/`)
}

start().catch((err) => {
  console.error('[DevServer] Failed to start:', err)
  process.exit(1)
})
