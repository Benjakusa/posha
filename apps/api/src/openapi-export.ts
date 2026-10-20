import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { format } from 'prettier';
import { AppModule } from './app.module.js';

async function exportOpenApi(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api/v1');
  const config = new DocumentBuilder()
    .setTitle('POSHA API')
    .setDescription('POSHA REST API contract')
    .setVersion('1.0.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  const outputPath = resolve(process.cwd(), '../../docs/openapi.json');
  await mkdir(dirname(outputPath), { recursive: true });
  const json = await format(JSON.stringify(document), { parser: 'json' });
  await writeFile(outputPath, json);
  await app.close();
}

await exportOpenApi();
