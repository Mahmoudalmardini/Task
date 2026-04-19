import mongoose from 'mongoose';

export default async function globalSetup(): Promise<void> {
  const uri = process.env.MONGO_URI ?? 'mongodb://mongo:27017/delivery_ops_test';
  const conn = await mongoose.createConnection(uri).asPromise();
  try {
    await conn.db!.dropDatabase();
    await conn.db!.client.db('delivery_ops_test_ws').dropDatabase();
  } finally {
    await conn.close();
  }
}
