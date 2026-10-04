import { requireUser } from '@/server/auth';
import { prisma } from '@/server/db';
import { consumeLimit } from '@/server/signup/abuse';
import { storeBrandService } from '@/server/shopping/brands/service';
import { jsonError } from '@/lib/http';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const id = new URL(req.url).searchParams.get('listId');
    if (!id || id.length > 100) return Response.json({ error: 'Choose a shopping list.' }, { status: 400, headers });
    const list = await prisma.shoppingList.findFirst({ where: { id, userId: user.id }, select: { storeName: true, storeWebsite: true } });
    if (!list) return Response.json({ error: 'List not found.' }, { status: 404, headers });
    await consumeLimit('shopping-store-brand', user.id, 30, 60000);
    return Response.json({ brand: await storeBrandService.resolve(list.storeName ?? '', list.storeWebsite) }, { headers });
  } catch (e) { return jsonError(e); }
}
