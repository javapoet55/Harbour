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
