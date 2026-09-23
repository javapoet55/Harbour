import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { it,expect,vi,afterEach } from 'vitest';
import { HealthDashboard } from './dashboard';
import { getHealth } from '@/server/health/service';
afterEach(()=>vi.unstubAllGlobals());
it('renders a loading status without manufactured KPI values',()=>{
 vi.stubGlobal('React',React);
 const html=renderToStaticMarkup(React.createElement(HealthDashboard));
 expect(html).toContain('Loading System Health');expect(html).not.toContain('99.99');
});
it('renders missing telemetry, read-only controls and accessible statuses',async()=>{
 vi.stubGlobal('React',React);
 const data=await getHealth('1H');
 const html=renderToStaticMarkup(React.createElement(HealthDashboard,{initialData:{...data,canOperate:false}}));
 expect(html).toContain('No telemetry');expect(html).toContain('Unknown');expect(html).toContain('Read-only');expect(html).not.toContain('Save rule');expect(html).toContain('Accessible trend data');
});

it('shows real Voice and Security statuses and explains low activity',async()=>{
 vi.stubGlobal('React',React);
 const data=await getHealth('1H');
 data.enabled=true;
 data.sections=data.sections.map(s=>({...s,status:s.name==='Voice'?'Healthy':s.name==='Security'?'Degraded':s.status}));
 data.monitoring.AI={requests:1,recentRequests:1,minimumSamples:5,lastObserved:new Date().toISOString(),reason:'low-traffic'};
 data.failures=[{id:'admin-auth',time:new Date().toISOString(),service:'API',operation:'POST /api/admin/auth',traceId:'test-trace',status:401,error:'HTTP_401'}];
 const html=renderToStaticMarkup(React.createElement(HealthDashboard,{initialData:{...data,canOperate:false}}));
 expect(html).toContain('Low traffic: 1 of 5 recent observations');
 expect(html.split('Voice API requests (not sessions)')[1].split('</tr>')[0]).toContain('health-healthy');
 expect(html.split('Authentication endpoints')[1].split('</tr>')[0]).toContain('health-degraded');
 expect(html.split('Security health')[1].split('Local process counters')[0]).toContain('POST /api/admin/auth');
});
