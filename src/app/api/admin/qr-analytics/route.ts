import { adminRangeEnd } from '@/lib/admin-date-range';
import { adminApiFailure, adminJson, adminQueryRange, invalidRange } from '@/server/admin-api';
import { requireAdmin } from '@/server/admin-auth';
import { prisma } from '@/server/db';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const range = adminQueryRange(request);
    if (!range) return invalidRange();
    const end = adminRangeEnd(range);
    const where = { openedAt: { gte: range.fromDate, lte: end } };
    const [daily, platforms, locations, devices, recent] = await Promise.all([
      prisma.qrOpen.groupBy({ by: ['openedDay'], where, _count: { _all: true } }),
      prisma.qrOpen.groupBy({ by: ['platform'], where, _count: { _all: true } }),
      prisma.qrOpen.groupBy({
        by: ['country', 'region', 'city'], where, _count: { _all: true },
        orderBy: [{ _count: { id: 'desc' } }, { country: 'asc' }, { region: 'asc' }, { city: 'asc' }], take: 15,
      }),
      prisma.qrOpen.groupBy({
        by: ['platform', 'model'], where, _count: { _all: true },
        orderBy: [{ _count: { id: 'desc' } }, { platform: 'asc' }, { model: 'asc' }], take: 15,
      }),
      prisma.qrOpen.findMany({ where, orderBy: [{ openedAt: 'desc' }, { id: 'desc' }], take: 100, omit: { openedDay: true } }),
    ]);
    const counts = new Map(daily.map(row => [row.openedDay, row._count._all]));
    const days = Array.from({ length: range.days }, (_, index) => {
      const day = new Date(+range.fromDate + index * 86_400_000).toISOString().slice(0, 10);
      return { day, count: counts.get(day) ?? 0 };
    });
    return adminJson({
      total: days.reduce((sum, row) => sum + row.count, 0),
      days,
      platforms: platforms.map(({ _count, ...row }) => ({ ...row, count: _count._all })),
      locations: locations.map(({ _count, ...row }) => ({ ...row, count: _count._all })),
      devices: devices.map(({ _count, ...row }) => ({ ...row, count: _count._all })),
      recent,
    });
  } catch (error) {
    return adminApiFailure(error);
  }
}
