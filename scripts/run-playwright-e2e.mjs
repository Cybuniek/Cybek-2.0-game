import { spawn } from 'node:child_process';
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

const exitCode = await new Promise((resolve) => {
  const child = spawn(
    process.execPath,
    ['node_modules/@playwright/test/cli.js', 'test'],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PLAYWRIGHT_EXTERNAL_SERVER: 'true',
      },
      stdio: 'inherit',
    },
  );

  child.on('exit', (code) => resolve(code ?? 1));
  child.on('error', (error) => {
    console.error(error);
    resolve(1);
  });
});

await server.close();
process.exit(exitCode);
