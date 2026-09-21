import { redirect } from 'next/navigation';
import { readAdminSession } from '@/server/admin-session';
import { HealthDashboard } from '@/components/admin/health/dashboard';
export default async function SystemHealthPage() {
 if(!await readAdminSession()) redirect('/admin/login');
 return <HealthDashboard/>;
}
