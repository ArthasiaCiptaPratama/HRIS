import { createServer } from 'http';
import { createReadStream, existsSync } from 'fs';
import { join, extname } from 'path';
import { stat } from 'fs/promises';
import cors from 'cors';
import { employeeRoutes } from './routes/employee';
import { leaveRoutes } from './routes/leave';
import { attendanceRoutes } from './routes/attendance';
import { businessTripRoutes } from './routes/businessTrip';
import { dashboardRoutes } from './routes/dashboard';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

async function serveStatic(req: Request): Promise<Response | null> {
  const url = new URL(req.url);
  let filePath = join(process.cwd(), 'public', url.pathname === '/' ? 'index.html' : url.pathname);

  if (!existsSync(filePath)) {
    return null;
  }

  const ext = extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  try {
    const stats = await stat(filePath);
    const file = createReadStream(filePath);

    return new Response(file as any, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': stats.size.toString(),
      },
    });
  } catch {
    return null;
  }
}

export const app = {
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const pathname = url.pathname;

    // CORS for API routes
    if (pathname.startsWith('/api/')) {
      const corsHandler = cors({
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
      });

      // Handle preflight
      if (req.method === 'OPTIONS') {
        return new Response(null, {
          status: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          },
        });
      }
    }

    // API Routes
    if (pathname.startsWith('/api/employees')) {
      return employeeRoutes(req);
    }
    if (pathname.startsWith('/api/leave-quotas')) {
      return leaveRoutes(req);
    }
    if (pathname.startsWith('/api/attendance-permissions')) {
      return attendanceRoutes(req);
    }
    if (pathname.startsWith('/api/business-trips')) {
      return businessTripRoutes(req);
    }
    if (pathname.startsWith('/api/dashboard')) {
      return dashboardRoutes(req);
    }

    // Serve static files
    const staticResponse = await serveStatic(req);
    if (staticResponse) {
      return staticResponse;
    }

    // SPA fallback - serve index.html
    const indexPath = join(process.cwd(), 'public', 'index.html');
    if (existsSync(indexPath)) {
      const file = createReadStream(indexPath);
      return new Response(file as any, {
        headers: { 'Content-Type': 'text/html' },
      });
    }

    return new Response('Not Found', { status: 404 });
  },
};
