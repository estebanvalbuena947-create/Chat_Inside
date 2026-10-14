import 'dotenv/config';
import 'reflect-metadata';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { NestFactory } from '@nestjs/core';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { createHttpAdapter } from './http-adapter';

async function bootstrap(): Promise<void> {
  const adapter = createHttpAdapter();
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
  // Los archivos se aceptan únicamente en el endpoint de multimedia. El límite también se
  // comprueba allí para que un cliente no pueda agotar memoria enviando un cuerpo mayor.
  await app.register(multipart, { limits: { files: 1, fileSize: 25 * 1024 * 1024 } });

  // La direccion de escucha se configura: en el servidor escucha solo en local (detras de nginx) y
  // dentro de un contenedor necesita 0.0.0.0 para que el puerto publicado funcione.
  const host = process.env.API_HOST ?? '127.0.0.1';
  await app.listen({ host, port });
}

void bootstrap();
