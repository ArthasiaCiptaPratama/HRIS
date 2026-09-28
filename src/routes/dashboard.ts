import { prisma } from '../utils/prisma';

export async function dashboardRoutes(req: Request): Response {
  const url = new URL(req.url);
  const method = req.method;
  const pathname = url.pathname;

  // GET /api/dashboard/stats
  if (method === 'GET' && pathname === '/api/dashboard/stats') {
    const currentYear = new Date().getFullYear();

    const [
      totalEmployees,
      pendingAttendance,
      pendingBusinessTrips,
      leaveStats,
    ] = await Promise.all([
      prisma.employee.count(),
      prisma.attendancePermission.count({ where: { status: 'PENDING' } }),
      prisma.businessTrip.count({ where: { status: 'PENDING' } }),
      prisma.leaveQuota.aggregate({
        where: { year: currentYear },
        _sum: { totalDays: true, usedDays: true },
      }),
    ]);

    const stats = {
      totalEmployees,
      pendingRequests: pendingAttendance + pendingBusinessTrips,
      pendingAttendance,
      pendingBusinessTrips,
      leaveQuota: {
        total: leaveStats._sum.totalDays || 0,
        used: leaveStats._sum.usedDays || 0,
        remaining: (leaveStats._sum.totalDays || 0) - (leaveStats._sum.usedDays || 0),
      },
    };

    return jsonResponse(stats);
  }

  return jsonResponse({ error: 'Not found' }, 404);
}

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
