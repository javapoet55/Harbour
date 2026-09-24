import { it,expect,vi,afterEach } from 'vitest';
vi.mock('@/server/admin-session',()=>({readAdminAuth:vi.fn()}));
import { readAdminAuth } from '@/server/admin-session';
import { healthAccess } from './access';
type Auth=NonNullable<Awaited<ReturnType<typeof readAdminAuth>>>;
afterEach(()=>{vi.resetAllMocks();vi.unstubAllEnvs();});
it('rejects app users without an admin OTP session',async()=>{vi.mocked(readAdminAuth).mockResolvedValue(null);await expect(healthAccess()).rejects.toThrow('UNAUTHENTICATED');});
it('permits admin read access but restricts elevated mutations',async()=>{vi.mocked(readAdminAuth).mockResolvedValue({user:{id:'admin'},viaBearer:false} as Auth);vi.stubEnv('NEXDO_HEALTH_OPERATOR_IDS','');await expect(healthAccess()).resolves.toMatchObject({id:'admin',viaBearer:false});await expect(healthAccess(true)).rejects.toThrow('FORBIDDEN');vi.stubEnv('NEXDO_HEALTH_OPERATOR_IDS','admin');await expect(healthAccess(true)).resolves.toMatchObject({id:'admin'});});
it('reports whether the admin frontend authenticated with a bearer',async()=>{vi.mocked(readAdminAuth).mockResolvedValue({user:{id:'admin'},viaBearer:true} as Auth);await expect(healthAccess()).resolves.toMatchObject({id:'admin',viaBearer:true});});
