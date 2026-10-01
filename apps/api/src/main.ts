import 'dotenv/config';
import 'reflect-metadata';
import cors from '@fastify/cors';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const adapter = new FastifyAdapter({ bodyLimit: 262_144 });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    rawBody: true
  });
  const port = Number.parseInt(process.env.API_PORT ?? '4000', 10);
  const allowedOrigin = process.env.APP_PUBLIC_URL ?? 'http://localhost:3000';

  await app.register(cors, {
    credentials: true,
    methods: ['GET'],
    origin: allowedOrigin
  });

  // La direccion de escucha se configura: en el servidor escucha solo en local (detras de nginx) y
  // dentro de un contenedor necesita 0.0.0.0 para que el puerto publicado funcione.
  const host = process.env.API_HOST ?? '127.0.0.1';
  await app.listen({ host, port });
}

void bootstrap();
