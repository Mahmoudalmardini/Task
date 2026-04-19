export interface AppConfig {
  nodeEnv: string;
  port: number;
  mongoUri: string;
  jwt: {
    secret: string;
    expiresIn: string;
  };
  seed: {
    adminEmail: string;
    adminPassword: string;
  };
  partner: {
    rateLimitTtlSeconds: number;
    rateLimitMax: number;
  };
  idempotency: {
    ttlHours: number;
  };
}

export const configuration = (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/delivery_ops',
  jwt: {
    secret: process.env.JWT_SECRET || 'change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },
  seed: {
    adminEmail: process.env.SEED_ADMIN_EMAIL || 'admin@example.com',
    adminPassword: process.env.SEED_ADMIN_PASSWORD || 'Admin@123',
  },
  partner: {
    rateLimitTtlSeconds: parseInt(process.env.PARTNER_RATE_LIMIT_TTL_SECONDS || '60', 10),
    rateLimitMax: parseInt(process.env.PARTNER_RATE_LIMIT_MAX || '60', 10),
  },
  idempotency: {
    ttlHours: parseInt(process.env.IDEMPOTENCY_TTL_HOURS || '24', 10),
  },
});
