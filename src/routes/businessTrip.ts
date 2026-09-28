import { prisma } from '../utils/prisma';

export async function businessTripRoutes(req: Request): Response {
  const url = new URL(req.url);
  const method = req.method;
  const pathname = url.pathname;

  // GET /api/business-trips
  if (method === 'GET' && pathname === '/api/business-trips') {
    const employeeId = url.searchParams.get('employeeId');
    const status = url.searchParams.get('status');

    const trips = await prisma.businessTrip.findMany({
      where: {
        ...(employeeId && { employeeId }),
        ...(status && { status: status as any }),
      },
      include: { employee: { select: { id: true, name: true, department: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return jsonResponse(trips);
  }

  // GET /api/business-trips/:id
  if (method === 'GET' && pathname.match(/^\/api\/business-trips\/[^/]+$/)) {
    const id = pathname.split('/')[3];
    const trip = await prisma.businessTrip.findUnique({
      where: { id },
      include: { employee: { select: { id: true, name: true } } },
    });

    if (!trip) {
      return jsonResponse({ error: 'Business trip not found' }, 404);
    }
    return jsonResponse(trip);
  }

  // POST /api/business-trips
  if (method === 'POST' && pathname === '/api/business-trips') {
    try {
      const body = await req.json();
      const trip = await prisma.businessTrip.create({
        data: {
          employeeId: body.employeeId,
          destination: body.destination,
          purpose: body.purpose,
          startDate: new Date(body.startDate),
          endDate: new Date(body.endDate),
          status: 'PENDING',
        },
        include: { employee: { select: { id: true, name: true } } },
      });
      return jsonResponse(trip, 201);
    } catch (error) {
      return jsonResponse({ error: 'Invalid data' }, 400);
    }
  }

  // PUT /api/business-trips/:id
  if (method === 'PUT' && pathname.match(/^\/api\/business-trips\/[^/]+$/)) {
    const id = pathname.split('/')[3];
    try {
      const body = await req.json();
      const trip = await prisma.businessTrip.update({
        where: { id },
        data: {
          destination: body.destination,
          purpose: body.purpose,
          startDate: body.startDate ? new Date(body.startDate) : undefined,
          endDate: body.endDate ? new Date(body.endDate) : undefined,
          status: body.status,
        },
      });
      return jsonResponse(trip);
    } catch (error) {
      return jsonResponse({ error: 'Business trip not found' }, 404);
    }
  }

  // PATCH /api/business-trips/:id/approve
  if (method === 'PATCH' && pathname.match(/^\/api\/business-trips\/[^/]+\/approve$/)) {
    const id = pathname.split('/')[3];
    try {
      const trip = await prisma.businessTrip.update({
        where: { id },
        data: { status: 'APPROVED' },
      });
      return jsonResponse(trip);
    } catch (error) {
      return jsonResponse({ error: 'Business trip not found' }, 404);
    }
  }

  // PATCH /api/business-trips/:id/reject
  if (method === 'PATCH' && pathname.match(/^\/api\/business-trips\/[^/]+\/reject$/)) {
    const id = pathname.split('/')[3];
    try {
      const trip = await prisma.businessTrip.update({
        where: { id },
        data: { status: 'REJECTED' },
      });
      return jsonResponse(trip);
    } catch (error) {
      return jsonResponse({ error: 'Business trip not found' }, 404);
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
