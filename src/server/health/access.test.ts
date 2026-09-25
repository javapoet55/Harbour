import { it,expect,vi,afterEach } from 'vitest';
vi.mock('@/server/admin-session',()=>({readAdminSession:vi.fn()}));
import { readAdminSession } from '@/server/admin-session';
import { healthAccess } from './access';
type Admin=NonNullable<Awaited<ReturnType<typeof readAdminSession>>>;
afterEach(()=>{vi.resetAllMocks();vi.unstubAllEnvs();});
it('rejects app users without an admin OTP session',async()=>{vi.mocked(readAdminSession).mockResolvedValue(null);await expect(healthAccess()).rejects.toThrow('UNAUTHENTICATED');});
it('permits admin read access but restricts elevated mutations',async()=>{vi.mocked(readAdminSession).mockResolvedValue({id:'admin'} as Admin);vi.stubEnv('NEXDO_HEALTH_OPERATOR_IDS','');await expect(healthAccess()).resolves.toMatchObject({id:'admin'});await expect(healthAccess(true)).rejects.toThrow('FORBIDDEN');vi.stubEnv('NEXDO_HEALTH_OPERATOR_IDS','admin');await expect(healthAccess(true)).resolves.toMatchObject({id:'admin'});});
