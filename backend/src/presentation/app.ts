import dns from 'dns';
if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

import cors from 'cors';
import express, { type Application, type Request, type Response } from 'express';
import type { IGoogleTokenVerifier } from '../application/services/AuthService.js';
import { IssueRequestTTLScheduler } from '../application/services/IssueRequestTTLScheduler.js';
import { JwtTokenService } from '../application/services/JwtTokenService.js';
import type { IPenaltyStrategy } from '../domain/strategies/IPenaltyStrategy.js';
import {
  createDefaultRepositories,
  type RepositoryContainer
} from '../infrastructure/persistence/index.js';
import { domainErrorHandler } from './middleware/errorHandler.js';
import { createApiRouter } from './routes.js';

export interface CreateAppOptions {
  repositories?: RepositoryContainer;
  jwtService?: JwtTokenService;
  googleVerifier?: IGoogleTokenVerifier;
  penaltyStrategy?: IPenaltyStrategy;
  scheduler?: IssueRequestTTLScheduler;
}

export function createApp(options: CreateAppOptions = {}): Application {
  const app = express();

  const repositories = options.repositories ?? createDefaultRepositories();
  const scheduler = options.scheduler ?? IssueRequestTTLScheduler.getInstance();
  scheduler.setPersistenceDelegate(repositories.issueRequestRepo);

  app.use(
    cors({
      origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
      credentials: true
    })
  );
  app.use(express.json());

  // Health & Readiness Check
  app.get('/api/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'UP',
      service: 'SACPulse Backend',
      version: '2.0.0',
      timestamp: new Date().toISOString()
    });
  });

  // Mount Clean Architecture REST API Router
  app.use(
    '/api',
    createApiRouter({
      repositories,
      jwtService: options.jwtService,
      googleVerifier: options.googleVerifier,
      penaltyStrategy: options.penaltyStrategy,
      scheduler
    })
  );

  // Global 404 Handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ success: false, error: 'Endpoint not found.' });
  });

  // Centralized DomainException Error Translation Middleware
  app.use(domainErrorHandler);

  return app;
}
