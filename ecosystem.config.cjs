/* global module, __dirname */
// Arranque de la API y el trabajador en el servidor, vigilados por PM2.
// Uso:  pm2 start ecosystem.config.cjs  &&  pm2 save
module.exports = {
  apps: [
    {
      name: 'wepflash-api',
      cwd: __dirname,
      script: 'apps/api/dist/main.js',
      env_file: 'apps/api/.env',
      instances: 1,
      autorestart: true,
      max_memory_restart: '500M',
      out_file: 'logs/api.log',
      error_file: 'logs/api.error.log',
      time: true
    },
    {
      name: 'wepflash-worker',
      cwd: __dirname,
      script: 'apps/worker/dist/main.js',
      env_file: 'apps/worker/.env',
      instances: 1,
      autorestart: true,
      max_memory_restart: '500M',
      out_file: 'logs/worker.log',
      error_file: 'logs/worker.error.log',
      time: true
    }
  ]
};
