import { prisma } from '../utils/prisma';

export async function leaveRoutes(req: Request): Response {
  const url = new URL(req.url);
  const method = req.method;
  const pathname = url.pathname;

  // GET /api/leave-quotas/:employeeId
  if (method === 'GET' && pathname.match(/^\/api\/leave-quotas\/[^/]+$/)) {
    const employeeId = pathname.split('/')[3];
    const year = parseInt(url.searchParams.get('year') || new Date().getFullYear().toString());

    const quotas = await prisma.leaveQuota.findMany({
      where: { employeeId, year },
    });

    return jsonResponse(quotas);
  }

  // GET /api/leave-quotas
  if (method === 'GET' && pathname === '/api/leave-quotas') {
    const employeeId = url.searchParams.get('employeeId');
    const year = parseInt(url.searchParams.get('year') || new Date().getFullYear().toString());

    const quotas = await prisma.leaveQuota.findMany({
      where: {
        ...(employeeId && { employeeId }),
        year,
      },
      include: { employee: { select: { id: true, name: true } } },
    });

    return jsonResponse(quotas);
  }

  // POST /api/leave-quotas
  if (method === 'POST' && pathname === '/api/leave-quotas') {
    try {
      const body = await req.json();
      const quota = await prisma.leaveQuota.create({
        data: {
          employeeId: body.employeeId,
          leaveType: body.leaveType,
          totalDays: body.totalDays,
          usedDays: body.usedDays || 0,
          year: body.year || new Date().getFullYear(),
        },
      });
      return jsonResponse(quota, 201);
    } catch (error) {
      return jsonResponse({ error: 'Invalid data' }, 400);
    }
  }

  // PUT /api/leave-quotas/:id
  if (method === 'PUT' && pathname.match(/^\/api\/leave-quotas\/[^/]+$/)) {
    const id = pathname.split('/')[3];
    try {
      const body = await req.json();
      const quota = await prisma.leaveQuota.update({
        where: { id },
        data: {
          totalDays: body.totalDays,
          usedDays: body.usedDays,
          year: body.year,
        },
      });
      return jsonResponse(quota);
    } catch (error) {
      return jsonResponse({ error: 'Leave quota not found' }, 404);
    }
  }

  // PATCH /api/leave-quotas/:id/use
  if (method === 'PATCH' && pathname.match(/^\/api\/leave-quotas\/[^/]+\/use$/)) {
    const id = pathname.split('/')[3];
    try {
      const body = await req.json();
      const daysToUse = body.days || 1;

      const current = await prisma.leaveQuota.findUnique({ where: { id } });
      if (!current) {
        return jsonResponse({ error: 'Leave quota not found' }, 404);
      }

      const newUsedDays = current.usedDays + daysToUse;
      if (newUsedDays > current.totalDays) {
        return jsonResponse({ error: 'Insufficient leave balance' }, 400);
      }

      const quota = await prisma.leaveQuota.update({
        where: { id },
        data: { usedDays: newUsedDays },
      });
      return jsonResponse(quota);
    } catch (error) {
      return jsonResponse({ error: 'Failed to use leave' }, 400);
    }
  }

  return jsonResponse({ error: 'Not found' }, 404);
}

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
