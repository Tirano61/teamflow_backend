import 'dotenv/config';
import 'reflect-metadata';
import { DataSource } from 'typeorm';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.BD_HOST ?? process.env.DB_HOST ?? 'localhost',
  port: +(process.env.BD_PORT ?? process.env.DB_PORT ?? 5432),
  username: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB_NAME,
  synchronize: false,
  logging: false,
  entities: [__dirname + '/**/*.entity.{ts,js}'],
  migrations: [__dirname + '/migrations/*.{ts,js}'],
  migrationsTableName: 'migrations',
});

export default AppDataSource;
// para uso en CLI de typeorm
