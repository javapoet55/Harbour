import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { ApiCosts } from './api-costs';
it('adds disjoint API and realtime estimates and labels incomplete coverage',()=>{
 const html=renderToStaticMarkup(<ApiCosts rows={[{user:'a@example.test',userId:'u',operation:'General AI',feature:'Ask AI',model:'m',requests:2,pricedRequests:1,tokenRequests:1,costUsd:1,inputTokens:100,outputTokens:10}]} realtime={[{userId:'u',user:'a@example.test',date:'2026-10-10',inputTokens:10,outputTokens:10,totalTokens:20,records:1,tokenRecords:1,textCostUsd:2,audioCostUsd:3,pricedRecords:1,unpricedRecords:0}]}/>);
 expect(html).toContain('$6.0000');expect(html).toContain('1 records have unavailable costs');expect(html).toContain('General AI');expect(html).toContain('a@example.test');
});
it('never presents missing coverage as zero dollars',()=>{
 const html=renderToStaticMarkup(<ApiCosts rows={[]} realtime={[]}/>);
 expect(html).toContain('Unavailable');expect(html).not.toContain('$0.0000');
});
