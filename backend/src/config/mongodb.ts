import dns from 'dns';
import { Resolver } from 'dns/promises';
import type { MongooseModuleFactoryOptions } from '@nestjs/mongoose';

const SRV_URI_RE = /^mongodb\+srv:\/\/([^/]+)@([^/?]+)(\/?[^?]*)?(\?.*)?$/;

function getMongoDnsServers(): string[] {
  return (process.env.MONGODB_DNS_SERVERS || '8.8.8.8,8.8.4.4')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Set process-wide DNS (best-effort) for any driver lookups that still use mongodb+srv. */
export function configureMongoSrvDns(): void {
  const servers = getMongoDnsServers();
  if (servers.length) dns.setServers(servers);
}

function createMongoResolver(): Resolver {
  const resolver = new Resolver();
  const servers = getMongoDnsServers();
  if (servers.length) resolver.setServers(servers);
  return resolver;
}

/** Pre-resolve SRV → standard mongodb:// URI so the driver never hits broken ISP/VPN DNS. */
export async function resolveMongoUri(mongoUri: string): Promise<string> {
  if (!mongoUri.startsWith('mongodb+srv://')) return mongoUri;

  configureMongoSrvDns();

  const match = mongoUri.match(SRV_URI_RE);
  if (!match) return mongoUri;

  const credentials = match[1];
  const clusterHost = match[2];
  const dbPath = match[3] || '';
  const query = match[4] || '';

  const resolver = createMongoResolver();
  const records = await resolver.resolveSrv(`_mongodb._tcp.${clusterHost}`);
  if (!records.length) {
    throw new Error(`No MongoDB SRV records for cluster host: ${clusterHost}`);
  }

  const hosts = records
    .map((r) => `${r.name.replace(/\.$/, '')}:${r.port}`)
    .join(',');

  const params = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query);
  if (!params.has('ssl')) params.set('ssl', 'true');
  if (!params.has('authSource')) params.set('authSource', 'admin');

  const qs = params.toString();
  return `mongodb://${credentials}@${hosts}${dbPath}${qs ? `?${qs}` : ''}`;
}

export async function buildMongooseOptions(
  mongoUri: string,
  isProd: boolean,
): Promise<MongooseModuleFactoryOptions> {
  const uri = await resolveMongoUri(mongoUri);

  return {
    uri,
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 15000,
    socketTimeoutMS: 45000,
    autoIndex: !isProd,
    family: 4,
  };
}
