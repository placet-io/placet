import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

function createAdapter(connectionString: string): PrismaPg | { url: string } {
  if (connectionString.startsWith('file:')) {
    // SQLite — dynamic import to keep the dependency optional.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@prisma/adapter-better-sqlite3') as {
      PrismaBetterSqlite3: new (opts: { url: string }) => { url: string };
    };
    return new mod.PrismaBetterSqlite3({ url: connectionString });
  }
  // PostgreSQL
  return new PrismaPg({ connectionString });
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        'DATABASE_URL environment variable is not set. ' +
          'Please provide it in your .env file or environment.',
      );
    }

    const adapter = createAdapter(connectionString);
    // Prisma driver-adapters are not reflected in the constructor typings.

    super({ adapter } as unknown as ConstructorParameters<
      typeof PrismaClient
    >[0]);
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
