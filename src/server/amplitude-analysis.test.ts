import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('./admin-auth', () => ({ requireAdmin: vi.fn() }));
import { requireAdmin } from './admin-auth';
import { attributionReport, funnelReport, getAmplitudeAnalysis, retentionReport } from './amplitude-analysis';
let n = 0;
beforeEach(() => { vi.mocked(requireAdmin).mockResolvedValue({id:'admin'} as never); vi.stubEnv('AMPLITUDE_API_KEY', `key-${++n}`); vi.stubEnv('AMPLITUDE_SECRET_KEY', 'secret'); vi.stubEnv('AMPLITUDE_REGION','US'); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); });
const catalog = { data: [{value:'Page'}, {value:'Submit'}] };
describe('Amplitude advanced reports', () => {
  it('uses N+1 retention indexing and distinguishes immature and absent cohorts from zero', () => {
    const combined = Array.from({length:9}, () => ({count:0,outof:20,incomplete:false}));
    combined[0].count=20; combined[1].count=19; combined[2].count=5; combined[8].incomplete=true;
    expect(retentionReport({data:{series:[{combined}]}})).toEqual([
      {day:1,retainedUsers:5,eligibleUsers:20,incomplete:false,percent:25},
      {day:7,retainedUsers:0,eligibleUsers:20,incomplete:true,percent:null},
      {day:30,retainedUsers:null,eligibleUsers:null,incomplete:true,percent:null},
    ]);
    expect(retentionReport({data:{series:[{combined:[{count:0,outof:0,incomplete:false}]}]}})[0].percent).toBeNull();
  });
  it('computes funnel dropoff and flags provisional results', () => {
    const report = funnelReport({data:[{cumulativeRaw:[100,25],dayFunnels:{isComplete:[true,false]}}]}, ['Page','Submit']);
    expect(report.steps[1]).toMatchObject({users:25,conversionPercent:25,droppedFromPrevious:75});
    expect(report.incomplete).toBe(true);
    expect(() => funnelReport({data:[{cumulativeRaw:[1,5]}]}, ['Page','Submit'])).toThrow();
  });
  it('uses period uniques for attribution and strips internal set IDs', () => {
    const result = attributionReport({data:{seriesLabels:['(none)','search'],seriesCollapsed:[[{value:4,setId:'private'}],[{value:2}]]}});
    expect(result).toEqual([{label:'(none)',uniqueUsers:4},{label:'search',uniqueUsers:2}]);
    expect(() => attributionReport({data:{seriesLabels:['x'],seriesCollapsed:[]}})).toThrow();
  });
  it('requires authorization even on cached results', async () => {
    const fetcher = vi.fn().mockImplementation(async () => Response.json(catalog)); vi.stubGlobal('fetch',fetcher);
    await getAmplitudeAnalysis('2026-10-01','2026-10-07',{kind:'catalog'});
    await getAmplitudeAnalysis('2026-10-01','2026-10-07',{kind:'catalog'});
    expect(fetcher).toHaveBeenCalledTimes(1);
    vi.mocked(requireAdmin).mockRejectedValue(new Error('FORBIDDEN'));
    await expect(getAmplitudeAnalysis('2026-10-01','2026-10-07',{kind:'catalog'})).rejects.toThrow('FORBIDDEN');
  });
  it('refuses invented funnel events without making a funnel request', async () => {
    const fetcher=vi.fn().mockImplementation(async()=>Response.json(catalog));vi.stubGlobal('fetch',fetcher);
    const result=await getAmplitudeAnalysis('2026-10-01','2026-10-07',{kind:'funnel',events:['Page','Invented Signup'],windowSeconds:120});
    expect(result).toMatchObject({status:'unavailable',availableEvents:['Page','Submit']});expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('sends ordered funnel events and exact conversion window', async () => {
    const fetcher=vi.fn().mockResolvedValueOnce(Response.json(catalog)).mockResolvedValueOnce(Response.json({data:[{cumulativeRaw:[4,1]}]}));vi.stubGlobal('fetch',fetcher);
    const result=await getAmplitudeAnalysis('2026-10-01','2026-10-07',{kind:'funnel',events:['Page','Submit'],windowSeconds:120});
    expect(result).toMatchObject({status:'connected'});
    const url=new URL(fetcher.mock.calls[1][0]);expect(url.searchParams.getAll('e')).toEqual(['{"event_type":"Page"}','{"event_type":"Submit"}']);
    expect(url.searchParams.get('cs')).toBe('120');expect(url.searchParams.get('mode')).toBe('ordered');
  });
  it('queries first-touch attribution with a fixed property allowlist', async () => {
    const fetcher=vi.fn().mockResolvedValueOnce(Response.json(catalog)).mockResolvedValueOnce(Response.json({data:{seriesLabels:['search'],seriesCollapsed:[[{value:3}]]}}));vi.stubGlobal('fetch',fetcher);
    expect(await getAmplitudeAnalysis('2026-10-01','2026-10-07',{kind:'attribution',event:'_active',dimension:'utm_source',firstTouch:true})).toMatchObject({status:'connected'});
    expect(new URL(fetcher.mock.calls[1][0]).searchParams.get('g')).toBe('gp:initial_utm_source');
  });
  it('uses live-compatible default N-day retention mode', async () => {
    const fetcher=vi.fn().mockResolvedValue(Response.json({data:{series:[{combined:[]}]}}));vi.stubGlobal('fetch',fetcher);
    expect(await getAmplitudeAnalysis('2026-10-01','2026-10-07',{kind:'retention',cohort:'new'})).toMatchObject({status:'connected'});
    const url=new URL(fetcher.mock.calls[0][0]);expect(url.searchParams.has('rm')).toBe(false);expect(JSON.parse(url.searchParams.get('se')!)).toEqual({event_type:'_new'});
  });
  it.each([400,401,403,429,500])('reports HTTP %i without provider secrets or zero metrics', async status => {
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('secret', {status})));
    const result=await getAmplitudeAnalysis('2026-10-01','2026-10-07',{kind:'retention',cohort:'new'});
    expect(result).toMatchObject({status:'unavailable'});expect(JSON.stringify(result)).not.toContain('secret');
  });
  it('handles timeout and rejects invalid arguments', async () => {
    vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('timeout')));
    expect(await getAmplitudeAnalysis('2026-10-01','2026-10-07',{kind:'catalog'})).toMatchObject({status:'unavailable'});
    await expect(getAmplitudeAnalysis('2026-10-01','2026-10-07',{kind:'funnel',events:['x'],windowSeconds:0})).rejects.toThrow();
  });
});
