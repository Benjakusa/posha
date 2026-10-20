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
