import { prisma } from '../utils/prisma';

export async function employeeRoutes(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const method = req.method;
  const pathname = url.pathname;

  // GET /api/employees
  if (method === 'GET' && pathname === '/api/employees') {
    const employees = await prisma.employee.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            leaveQuotas: true,
            attendancePermissions: true,
            businessTrips: true,
          },
        },
      },
    });
    return jsonResponse(employees);
  }

  // GET /api/employees/:id
  if (method === 'GET' && pathname.match(/^\/api\/employees\/[^/]+$/)) {
    const id = pathname.split('/')[3];
    const employee = await prisma.employee.findUnique({
      where: { id },
      include: {
        leaveQuotas: { where: { year: new Date().getFullYear() } },
        attendancePermissions: { orderBy: { createdAt: 'desc' }, take: 10 },
        businessTrips: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });

    if (!employee) {
      return jsonResponse({ error: 'Employee not found' }, 404);
    }
    return jsonResponse(employee);
  }

  // POST /api/employees
  if (method === 'POST' && pathname === '/api/employees') {
    try {
      const body = await req.json();
      const employee = await prisma.employee.create({
        data: {
          name: body.name,
          email: body.email,
          phone: body.phone,
          address: body.address,
          department: body.department,
          position: body.position,
          joinDate: new Date(body.joinDate),
          photo: body.photo,
        },
      });
      return jsonResponse(employee, 201);
    } catch (error: any) {
      if (error.code === 'P2002') {
        return jsonResponse({ error: 'Email already exists' }, 409);
      }
      return jsonResponse({ error: 'Invalid data' }, 400);
    }
  }

  // PUT /api/employees/:id
  if (method === 'PUT' && pathname.match(/^\/api\/employees\/[^/]+$/)) {
    const id = pathname.split('/')[3];
    try {
      const body = await req.json();
      const employee = await prisma.employee.update({
        where: { id },
        data: {
          name: body.name,
          email: body.email,
          phone: body.phone,
          address: body.address,
          department: body.department,
          position: body.position,
          joinDate: body.joinDate ? new Date(body.joinDate) : undefined,
          photo: body.photo,
        },
      });
      return jsonResponse(employee);
    } catch (error: any) {
      if (error.code === 'P2025') {
        return jsonResponse({ error: 'Employee not found' }, 404);
      }
      return jsonResponse({ error: 'Invalid data' }, 400);
    }
  }

  // DELETE /api/employees/:id
  if (method === 'DELETE' && pathname.match(/^\/api\/employees\/[^/]+$/)) {
    const id = pathname.split('/')[3];
    try {
      await prisma.employee.delete({ where: { id } });
      return jsonResponse({ message: 'Employee deleted' });
    } catch (error: any) {
      if (error.code === 'P2025') {
        return jsonResponse({ error: 'Employee not found' }, 404);
      }
      return jsonResponse({ error: 'Failed to delete' }, 400);
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
