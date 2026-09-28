import { serve } from 'bun';
import { app } from './app';
import { config } from 'dotenv';

config();

const PORT = parseInt(process.env.PORT || '3000');
const HOST = process.env.HOST || 'localhost';

console.log(`🚀 HRIS Server starting on http://${HOST}:${PORT}`);
console.log(`📁 Serving static files from ./public`);

serve({
  ...app,
  port: PORT,
  hostname: HOST,
});

export { PORT, HOST };
