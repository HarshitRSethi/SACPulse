import dns from 'dns';
if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

import express, { type Application, type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { createApiRouter } from './routes.js';
import { IssueRequestTTLScheduler } from '../domain.services/IssueRequestTTLScheduler.js';
import { IssueRequestRepository } from '../infrastructure.persistence/repositories/IssueRequestRepository.js';

export function createApp(): Application {
  const app = express();

  // Initialize TTL Scheduler with persistence delegate
  const scheduler = IssueRequestTTLScheduler.getInstance();
  scheduler.setPersistenceDelegate(new IssueRequestRepository());

  app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true
  }));
  app.use(express.json());

  // Health and Readiness Check
  app.get('/api/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'UP',
      service: 'SACPulse Backend',
      version: '1.0.0',
      timestamp: new Date().toISOString()
    });
  });

  // REST API Routes
  app.use('/api', createApiRouter());

  // Global 404 Handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ success: false, error: 'Endpoint not found.' });
  });

  // Global Error Handler
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled Application Error:', err);
    res.status(err.status || 500).json({
      success: false,
      error: err.message || 'Internal Server Error'
    });
  });

  return app;
}
