import { createServer } from 'vite';

const host = '127.0.0.1';
const port = 5173;
const server = await createServer({
  server: {
    host,
    port,
    strictPort: true,
  },
});

await server.listen();
server.printUrls();

let closing = false;
async function close(signal) {
  if (closing) return;
  closing = true;
  try {
    await server.close();
  } finally {
    process.exit(signal ? 0 : 1);
  }
}

process.on('SIGINT', () => void close('SIGINT'));
process.on('SIGTERM', () => void close('SIGTERM'));
process.on('uncaughtException', (error) => {
  console.error(error);
  void close(null);
});
process.on('unhandledRejection', (error) => {
  console.error(error);
  void close(null);
});
