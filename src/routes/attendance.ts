import { prisma } from '../utils/prisma';

export async function attendanceRoutes(req: Request): Response {
  const url = new URL(req.url);
  const method = req.method;
  const pathname = url.pathname;

  // GET /api/attendance-permissions
  if (method === 'GET' && pathname === '/api/attendance-permissions') {
    const employeeId = url.searchParams.get('employeeId');
    const status = url.searchParams.get('status');

    const permissions = await prisma.attendancePermission.findMany({
      where: {
        ...(employeeId && { employeeId }),
        ...(status && { status: status as any }),
      },
      include: { employee: { select: { id: true, name: true, department: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return jsonResponse(permissions);
  }

  // GET /api/attendance-permissions/:id
  if (method === 'GET' && pathname.match(/^\/api\/attendance-permissions\/[^/]+$/)) {
    const id = pathname.split('/')[3];
    const permission = await prisma.attendancePermission.findUnique({
      where: { id },
      include: { employee: { select: { id: true, name: true } } },
    });

    if (!permission) {
      return jsonResponse({ error: 'Permission not found' }, 404);
    }
    return jsonResponse(permission);
  }

  // POST /api/attendance-permissions
  if (method === 'POST' && pathname === '/api/attendance-permissions') {
    try {
      const body = await req.json();
      const permission = await prisma.attendancePermission.create({
        data: {
          employeeId: body.employeeId,
          type: body.type,
          date: new Date(body.date),
          reason: body.reason,
          status: 'PENDING',
        },
        include: { employee: { select: { id: true, name: true } } },
      });
      return jsonResponse(permission, 201);
    } catch (error) {
      return jsonResponse({ error: 'Invalid data' }, 400);
    }
  }

  // PUT /api/attendance-permissions/:id
  if (method === 'PUT' && pathname.match(/^\/api\/attendance-permissions\/[^/]+$/)) {
    const id = pathname.split('/')[3];
    try {
      const body = await req.json();
      const permission = await prisma.attendancePermission.update({
        where: { id },
        data: {
          ...(body.status && { status: body.status }),
          ...(body.reason && { reason: body.reason }),
        },
      });
      return jsonResponse(permission);
    } catch (error) {
      return jsonResponse({ error: 'Permission not found' }, 404);
    }
  }

  // PATCH /api/attendance-permissions/:id/approve
  if (method === 'PATCH' && pathname.match(/^\/api\/attendance-permissions\/[^/]+\/approve$/)) {
    const id = pathname.split('/')[3];
    try {
      const permission = await prisma.attendancePermission.update({
        where: { id },
        data: { status: 'APPROVED' },
      });
      return jsonResponse(permission);
    } catch (error) {
      return jsonResponse({ error: 'Permission not found' }, 404);
    }
  }

  // PATCH /api/attendance-permissions/:id/reject
  if (method === 'PATCH' && pathname.match(/^\/api\/attendance-permissions\/[^/]+\/reject$/)) {
    const id = pathname.split('/')[3];
    try {
      const permission = await prisma.attendancePermission.update({
        where: { id },
        data: { status: 'REJECTED' },
      });
      return jsonResponse(permission);
    } catch (error) {
      return jsonResponse({ error: 'Permission not found' }, 404);
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
