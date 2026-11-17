import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { findAreas, findFacilities } from '../../domain/access.js';
import { AppError } from '../../middleware/error.js';

export const directoryRouter = Router();

const queryParam = z.string().min(1).max(120).optional();

const areasQuery = z.object({
  q: queryParam,
  limit: z.coerce.number().int().optional(),
});

const facilitiesQuery = z.object({
  service: z.string().min(1).max(80),
  area_id: z.string().uuid(),
  radius_km: z.coerce.number().positive().optional(),
  limit: z.coerce.number().int().optional(),
});

const idParam = z.string().uuid();

function coordinate(value: unknown) {
  return value === null || value === undefined ? null : Number(value);
}

directoryRouter.get('/services', async (_req, res) => {
  const services = await prisma.service.findMany({
    where: { active: true },
    orderBy: [{ sort_order: 'asc' }, { service_code: 'asc' }],
    select: { service_code: true, label: true, description: true },
  });
  res.json(services);
});

directoryRouter.get('/areas', async (req, res) => {
  const query = areasQuery.parse(req.query);
  res.json(await findAreas(query.q, query.limit));
});

directoryRouter.get('/facilities', async (req, res) => {
  const query = facilitiesQuery.parse(req.query);
  res.json(
    await findFacilities(query.service, query.area_id, query.radius_km, query.limit),
  );
});

directoryRouter.get('/facilities/:id', async (req, res) => {
  const facilityId = idParam.parse(req.params.id);
  const facility = await prisma.facility.findFirst({
    where: { id: facilityId, status: 'APPROVED' },
    include: {
      area: { select: { id: true, name: true, region: true, city: true } },
      source: { select: { trust_tier: true } },
      facility_services: {
        where: { verification_status: 'APPROVED', service: { active: true } },
        include: { service: { select: { label: true, sort_order: true } } },
      },
    },
  });
  if (!facility) throw new AppError(404, 'Facility not found', 'not_found');

  const services = facility.facility_services
    .slice()
    .sort(
      (left, right) =>
        left.service.sort_order - right.service.sort_order ||
        left.service_code.localeCompare(right.service_code),
    )
    .map((entry) => ({
      service_code: entry.service_code,
      label: entry.service.label,
      availability_note: entry.availability_note,
    }));

  res.json({
    id: facility.id,
    name: facility.name,
    address: facility.address,
    area_id: facility.area_id,
    area: facility.area,
    latitude: coordinate(facility.latitude),
    longitude: coordinate(facility.longitude),
    phone: facility.phone,
    last_verified_at: facility.last_verified_at,
    verified_at: facility.verified_at,
    is_demo: facility.is_demo,
    source_trust: facility.source?.trust_tier ?? 'unknown',
    services,
  });
});
