import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { findReviewedContent } from '../src/domain/access.js';

const suffix = randomUUID().slice(0, 8);
const app = createApp();

const serviceCodes = [`svc-active-${suffix}`, `svc-inactive-${suffix}`, `svc-unverified-${suffix}`];
const areaIds: string[] = [];
const topicCodes = [`topic-${suffix}-a`, `topic-${suffix}-b`];
let reviewerAccountId = '';

let areaA = '';
let areaB = '';
let areaC = '';
let activeService = '';
let inactiveService = '';
let unverifiedService = '';
let nearFacility = '';
let pendingFacility = '';

before(async () => {
  activeService = serviceCodes[0];
  inactiveService = serviceCodes[1];
  unverifiedService = serviceCodes[2];

  await prisma.service.createMany({
    data: [
      { service_code: activeService, label: 'Test active service', sort_order: 900 },
      { service_code: inactiveService, label: 'Test inactive service', sort_order: 901, active: false },
      { service_code: unverifiedService, label: 'Test unverified service', sort_order: 902 },
    ],
  });

  const createArea = async (input: {
    name: string;
    city: string;
    region: string;
    latitude: number;
    longitude: number;
    active?: boolean;
    alias?: string;
  }) => {
    const area = await prisma.area.create({
      data: {
        country_code: 'NG',
        name: input.name,
        city: input.city,
        region: input.region,
        center_latitude: input.latitude,
        center_longitude: input.longitude,
        active: input.active ?? true,
        is_demo: true,
        ...(input.alias
          ? { aliases: { create: [{ alias_normalized: input.alias }] } }
          : {}),
      },
    });
    areaIds.push(area.id);
    return area.id;
  };

  areaA = await createArea({
    name: `Testville-${suffix}`,
    city: `Metro-${suffix}`,
    region: `Region-${suffix}`,
    latitude: 6.5244,
    longitude: 3.3792,
    alias: `alias-${suffix}`,
  });
  areaB = await createArea({
    name: `Nearby-${suffix}`,
    city: `NearCity-${suffix}`,
    region: `Region-${suffix}`,
    latitude: 6.6018,
    longitude: 3.3515,
  });
  areaC = await createArea({
    name: `Faraway-${suffix}`,
    city: `FarCity-${suffix}`,
    region: `Region-${suffix}`,
    latitude: 9.0765,
    longitude: 7.3986,
  });
  const areaInactive = await createArea({
    name: `Hidden-${suffix}`,
    city: `HiddenCity-${suffix}`,
    region: `Region-${suffix}`,
    latitude: 6.52,
    longitude: 3.37,
    active: false,
  });

  const createFacility = async (input: {
    name: string;
    areaId: string;
    latitude: number | null;
    longitude: number | null;
    status?: 'APPROVED' | 'PENDING';
    isDemo?: boolean;
    services: Array<{ code: string; verification: 'APPROVED' | 'UNVERIFIED' }>;
  }) => {
    const facility = await prisma.facility.create({
      data: {
        name: input.name,
        address: `${input.name} address`,
        area_id: input.areaId,
        latitude: input.latitude,
        longitude: input.longitude,
        phone: '+2348000000000',
        status: input.status ?? 'APPROVED',
        is_demo: input.isDemo ?? true,
        facility_services: {
          create: input.services.map((entry) => ({
            service: { connect: { service_code: entry.code } },
            verification_status: entry.verification,
            verified_at: entry.verification === 'APPROVED' ? new Date() : null,
          })),
        },
      },
    });
    return facility.id;
  };

  nearFacility = await createFacility({
    name: `Near-${suffix}`,
    areaId: areaA,
    latitude: 6.53,
    longitude: 3.38,
    isDemo: true,
    services: [
      { code: activeService, verification: 'APPROVED' },
      { code: unverifiedService, verification: 'UNVERIFIED' },
      { code: inactiveService, verification: 'APPROVED' },
    ],
  });
  await createFacility({
    name: `UnknownSame-${suffix}`,
    areaId: areaA,
    latitude: null,
    longitude: null,
    services: [{ code: activeService, verification: 'APPROVED' }],
  });
  await createFacility({
    name: `Mid-${suffix}`,
    areaId: areaB,
    latitude: 6.6018,
    longitude: 3.3515,
    isDemo: false,
    services: [{ code: activeService, verification: 'APPROVED' }],
  });
  await createFacility({
    name: `UnknownOther-${suffix}`,
    areaId: areaB,
    latitude: null,
    longitude: null,
    services: [{ code: activeService, verification: 'APPROVED' }],
  });
  await createFacility({
    name: `Far-${suffix}`,
    areaId: areaC,
    latitude: 9.0765,
    longitude: 7.3986,
    services: [{ code: activeService, verification: 'APPROVED' }],
  });
  await createFacility({
    name: `Unverified-${suffix}`,
    areaId: areaA,
    latitude: 6.53,
    longitude: 3.38,
    services: [{ code: activeService, verification: 'UNVERIFIED' }],
  });
  pendingFacility = await createFacility({
    name: `Pending-${suffix}`,
    areaId: areaA,
    latitude: 6.53,
    longitude: 3.38,
    status: 'PENDING',
    services: [{ code: activeService, verification: 'APPROVED' }],
  });
  await createFacility({
    name: `HiddenArea-${suffix}`,
    areaId: areaInactive,
    latitude: 6.52,
    longitude: 3.37,
    services: [{ code: activeService, verification: 'APPROVED' }],
  });

  const reviewer = await prisma.account.create({
    data: {
      email: `directory-reviewer-${suffix}@portal.test`,
      password_hash: 'test-password-hash',
      display_name: 'Content reviewer',
    },
  });
  reviewerAccountId = reviewer.id;

  const reviewedAt = new Date();
  await prisma.reviewedHealthContent.createMany({
    data: [
      {
        topic_code: topicCodes[0],
        version: 1,
        title: 'Old topic title',
        body: 'old body',
        status: 'PUBLISHED',
        reviewer_account_id: reviewerAccountId,
        reviewed_at: reviewedAt,
        published_at: reviewedAt,
      },
      {
        topic_code: topicCodes[0],
        version: 2,
        title: 'Current topic title',
        body: `needle-${suffix} is matched in the body`,
        status: 'PUBLISHED',
        reviewer_account_id: reviewerAccountId,
        reviewed_at: reviewedAt,
        published_at: reviewedAt,
      },
      {
        topic_code: topicCodes[0],
        version: 3,
        title: 'Draft topic',
        body: `needle-${suffix} draft`,
        status: 'DRAFT',
        reviewer_account_id: reviewerAccountId,
        reviewed_at: reviewedAt,
      },
      {
        topic_code: topicCodes[1],
        version: 2,
        title: `Second topic needle-${suffix}`,
        body: 'second body',
        status: 'PUBLISHED',
        reviewer_account_id: reviewerAccountId,
        reviewed_at: reviewedAt,
        published_at: reviewedAt,
      },
    ],
  });
});

after(async () => {
  await prisma.facility.deleteMany({ where: { area_id: { in: areaIds } } });
  await prisma.area.deleteMany({ where: { id: { in: areaIds } } });
  await prisma.service.deleteMany({ where: { service_code: { in: serviceCodes } } });
  await prisma.reviewedHealthContent.deleteMany({
    where: { topic_code: { in: topicCodes } },
  });
  if (reviewerAccountId) {
    await prisma.account.deleteMany({ where: { id: reviewerAccountId } });
  }
  await prisma.$disconnect();
});

describe('directory reads', () => {
  it('lists only active services without authentication', async () => {
    const response = await request(app).get('/v1/directory/services').expect(200);
    const codes = response.body.map((service: { service_code: string }) => service.service_code);
    assert.ok(codes.includes(activeService));
    assert.ok(codes.includes(unverifiedService));
    assert.equal(codes.includes(inactiveService), false);
  });

  it('matches areas by name, city and alias with exact matches first', async () => {
    const alias = await request(app)
      .get(`/v1/directory/areas?q=alias-${suffix}&limit=5`)
      .expect(200);
    assert.equal(alias.body[0].id, areaA);
    assert.equal(alias.body[0].is_demo, true);

    const city = await request(app)
      .get(`/v1/directory/areas?q=metro-${suffix}`)
      .expect(200);
    assert.equal(city.body[0].id, areaA);

    const name = await request(app)
      .get(`/v1/directory/areas?q=testville-${suffix}`)
      .expect(200);
    assert.equal(name.body[0].id, areaA);

    const none = await request(app)
      .get(`/v1/directory/areas?q=nothing-${suffix}`)
      .expect(200);
    assert.deepEqual(none.body, []);

    const hidden = await request(app)
      .get(`/v1/directory/areas?q=hidden-${suffix}`)
      .expect(200);
    assert.deepEqual(hidden.body, []);

    const bounded = await request(app).get('/v1/directory/areas?limit=50').expect(200);
    assert.ok(bounded.body.length <= 10);
  });

  it('finds approved facilities in radius and keeps unknown distances in-area', async () => {
    const response = await request(app)
      .get(
        `/v1/directory/facilities?service=${activeService}&area_id=${areaA}&radius_km=5&limit=10`,
      )
      .expect(200);

    const names = response.body.map((facility: { name: string }) => facility.name);
    assert.equal(names[0], `Near-${suffix}`);
    assert.ok(names.includes(`UnknownSame-${suffix}`));
    assert.equal(names.includes(`Mid-${suffix}`), false);
    assert.equal(names.includes(`UnknownOther-${suffix}`), false);
    assert.equal(names.includes(`Far-${suffix}`), false);
    assert.equal(names.includes(`Unverified-${suffix}`), false);
    assert.equal(names.includes(`Pending-${suffix}`), false);
    assert.equal(names.includes(`HiddenArea-${suffix}`), false);

    assert.equal(typeof response.body[0].distance_km, 'number');
    assert.ok(response.body[0].distance_km < 2);
    assert.equal(response.body[0].service_code, activeService);
    assert.equal(response.body[0].is_demo, true);
    assert.equal(response.body[1].distance_km, null);
  });

  it('applies the default radius, bounds limit and validates query input', async () => {
    const defaultRadius = await request(app)
      .get(`/v1/directory/facilities?service=${activeService}&area_id=${areaA}`)
      .expect(200);
    const names = defaultRadius.body.map((facility: { name: string }) => facility.name);
    assert.ok(names.includes(`Near-${suffix}`));
    assert.ok(names.includes(`Mid-${suffix}`));
    assert.ok(names.includes(`UnknownSame-${suffix}`));
    assert.equal(names.includes(`Far-${suffix}`), false);

    const bounded = await request(app)
      .get(
        `/v1/directory/facilities?service=${activeService}&area_id=${areaA}&limit=50`,
      )
      .expect(200);
    assert.ok(bounded.body.length <= 10);

    const single = await request(app)
      .get(
        `/v1/directory/facilities?service=${activeService}&area_id=${areaA}&limit=1`,
      )
      .expect(200);
    assert.equal(single.body.length, 1);

    await request(app)
      .get(`/v1/directory/facilities?service=${activeService}&area_id=${areaA}&radius_km=-2`)
      .expect(400);
    await request(app).get(`/v1/directory/facilities?area_id=${areaA}`).expect(400);
    await request(app).get('/v1/directory/facilities?service=general&area_id=nope').expect(400);

    const missingArea = await request(app)
      .get(
        `/v1/directory/facilities?service=${activeService}&area_id=${randomUUID()}`,
      )
      .expect(200);
    assert.deepEqual(missingArea.body, []);

    const noApprovedService = await request(app)
      .get(
        `/v1/directory/facilities?service=${unverifiedService}&area_id=${areaA}`,
      )
      .expect(200);
    assert.deepEqual(noApprovedService.body, []);
  });

  it('returns approved facility detail with verified active services only', async () => {
    const detail = await request(app)
      .get(`/v1/directory/facilities/${nearFacility}`)
      .expect(200);
    assert.equal(detail.body.id, nearFacility);
    assert.equal(detail.body.is_demo, true);
    assert.equal(detail.body.area.id, areaA);
    assert.equal(detail.body.source_trust, 'unknown');
    assert.deepEqual(
      detail.body.services.map((service: { service_code: string }) => service.service_code),
      [activeService],
    );

    await request(app).get(`/v1/directory/facilities/${pendingFacility}`).expect(404);
    await request(app).get(`/v1/directory/facilities/${randomUUID()}`).expect(404);
  });
});

describe('reviewed content matching', () => {
  it('returns the highest published reviewed version per topic', async () => {
    const matches = await findReviewedContent(`needle-${suffix}`, 5);
    assert.equal(matches.length, 2);
    const topicA = matches.find((match) => match.topic === topicCodes[0]);
    assert.ok(topicA);
    assert.equal(topicA.version, 2);
    assert.equal(topicA.reviewer, 'Content reviewer');
    assert.ok(topicA.reviewed_at);
    assert.equal(matches.some((match) => match.version === 3), false);

    const limited = await findReviewedContent(`needle-${suffix}`, 1);
    assert.equal(limited.length, 1);

    const blank = await findReviewedContent('   ', 3);
    assert.deepEqual(blank, []);
  });
});
