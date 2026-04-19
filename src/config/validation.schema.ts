import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3000),
  MONGO_URI: Joi.string().required(),
  JWT_SECRET: Joi.string().min(16).required(),
  JWT_EXPIRES_IN: Joi.string().default('24h'),
  SEED_ADMIN_EMAIL: Joi.string().email().default('admin@example.com'),
  SEED_ADMIN_PASSWORD: Joi.string().min(6).default('Admin@123'),
  PARTNER_RATE_LIMIT_TTL_SECONDS: Joi.number().default(60),
  PARTNER_RATE_LIMIT_MAX: Joi.number().default(60),
  IDEMPOTENCY_TTL_HOURS: Joi.number().default(24),
});
