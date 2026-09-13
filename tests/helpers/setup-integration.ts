import { inject } from 'vitest';

// Cada arquivo de teste conecta no banco descartável criado pelo global-setup.
process.env.DATABASE_URL = inject('databaseUrl');
process.env.EMAIL_PROVIDER = 'mock';
process.env.APP_URL = 'http://localhost:3000';
