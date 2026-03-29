// Simple startup script for PM2
// This ensures the server runs correctly on Windows

const { spawn } = require('child_process');
const path = require('path');

const projectDir = __dirname;
const distDir = path.join(projectDir, 'dist');

// Check if dist exists
const fs = require('fs');
if (!fs.existsSync(distDir)) {
  console.log('Building project...');
  const build = spawn('npm', ['run', 'build'], {
    cwd: projectDir,
    shell: true,
    stdio: 'inherit'
  });
  
  build.on('close', (code) => {
    if (code !== 0) {
      console.error('Build failed!');
      process.exit(1);
    }
    startServer();
  });
} else {
  startServer();
}

function startServer() {
  console.log('Starting server on http://localhost:16718');
  
  const server = spawn('npx', ['serve', '-s', 'dist', '-l', '16718'], {
    cwd: projectDir,
    shell: true,
    stdio: 'inherit'
  });
  
  server.on('close', (code) => {
    console.log(`Server exited with code ${code}`);
    process.exit(code);
  });
}
