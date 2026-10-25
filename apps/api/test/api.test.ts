import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ForbiddenException, NotFoundException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ProblemDetailsSchema } from '@posha/shared';
import { AppModule } from '../src/app.module.js';
import { ProblemDetailsExceptionFilter, toProblemDetails } from '../src/problem-details.filter.js';

describe('POSHA API foundation', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new ProblemDetailsExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('[P0-06] serves a minimal guarded liveness response', async () => {
    await request(app.getHttpServer()).get('/api/v1/health').expect(200).expect({ status: 'ok' });
  });

  it('[B-S1-05] boots auth, age, users, notifications, and Connect routes without a database', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/otp/request')
      .send({ identity: 'guest@example.test' })
      .expect(202)
      .expect({ status: 'accepted' });

    await request(app.getHttpServer()).get('/api/v1/age/status').expect(401);
    await request(app.getHttpServer()).get('/api/v1/me').expect(401);
    await request(app.getHttpServer()).get('/api/v1/me/notification-preferences').expect(401);
    await request(app.getHttpServer()).post('/api/v1/reports').send({}).expect(401);
  });

  it('[B-S3-01] creates a short-lived declared guest session and rejects missing declarations', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/guest/session')
      .send({ ageDeclaration: true, locale: 'en' })
      .expect(201);
    expect(response.body).toMatchObject({
      tokenType: 'Bearer',
      alias: expect.stringMatching(/^[A-Z][a-z]+ [A-Z][a-z]+$/),
    });
    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(Date.parse(response.body.expiresAt)).toBeGreaterThan(Date.now());
    await request(app.getHttpServer())
      .post('/api/v1/guest/session')
      .send({ ageDeclaration: false })
      .expect(400);
  });

  it('[B-S4-01] returns seeded catalogue records without exposing locked media URLs', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/catalog/home').expect(200);
    expect(response.body.lives).toHaveLength(5);
    expect(response.body.videos).toHaveLength(12);
    for (const video of response.body.videos as {
      locked: boolean;
      thumbnailUrl?: string;
      placeholderUrl: string;
    }[]) {
      expect(video.locked).toBe(true);
      expect(video.thumbnailUrl).toBeUndefined();
      expect(video.placeholderUrl).toMatch(/black-placeholder$/);
    }
    const placeholder = await request(app.getHttpServer())
      .get(response.body.videos[0].placeholderUrl)
      .expect(200);
    expect(placeholder.body.toString()).toContain('fill="#000000"');
  });

  it('[P0-06] maps framework errors to RFC 7807 without exposing exception text', () => {
    const result = toProblemDetails(new Error('member@example.test secret details'), 'trace-01');
    expect(result).toEqual({
      type: 'about:blank',
      title: 'Internal Server Error',
      status: 500,
      code: 'INTERNAL_SERVER_ERROR',
      detail: 'An unexpected error occurred.',
      traceId: 'trace-01',
    });
    expect(ProblemDetailsSchema.safeParse(result).success).toBe(true);
    expect(JSON.stringify(result)).not.toContain('member@example.test');
  });

  it('[P0-06] uses stable shared codes for expected HTTP errors', () => {
    const result = toProblemDetails(new NotFoundException(), 'trace-02');
    expect(result.code).toBe('NOT_FOUND');
    expect(result.status).toBe(404);
  });

  it('[P1-03] preserves allow-listed policy codes in problem responses', () => {
    const result = toProblemDetails(
      new ForbiddenException({ code: 'AGE_LEVEL_REQUIRED' }),
      'trace-03',
    );
    expect(result).toMatchObject({ status: 403, code: 'AGE_LEVEL_REQUIRED' });
  });
});
