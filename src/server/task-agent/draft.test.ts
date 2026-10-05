import {expect,it} from 'vitest';
import {prepareDraft,refreshGeneratedDraft} from './rank';
import type {Candidate} from '@/lib/task-agent/types';
const slots={location:'94572',urgency:'flexible' as const,budget:'',constraints:'',preferencesConfirmed:true};
it('asks only for availability with the requested ZIP label',()=>{
 expect(prepareDraft('plumber',slots)).toBe('Hello there,\n\nI’m looking for a plumber in Zip: 94572. Please let me know your availability.\n\nThank you.');
 expect(prepareDraft('electrician',slots)).toContain('an electrician');
});
it('preserves cities and handles ZIP+4',()=>{
 expect(prepareDraft('plumber',{...slots,location:' San Ramon, CA '})).toContain('in San Ramon, CA.');
 expect(prepareDraft('appliance repair',{...slots,location:'94572-1234'})).toContain('for appliance repair in Zip: 94572-1234.');
});
it('refreshes the old generated screenshot copy without changing personalized drafts',()=>{
 const draft='Hello there,\n\nI’m looking for plumber services in 94572. My request: Contact Plumbers. Please let me know your availability.\nCould you provide a quote, any call-out fees and your licensing/insurance details where applicable?\n\nThank you.';
 const candidate={id:'test',draft} as Candidate;
 expect(refreshGeneratedDraft(candidate,'plumber',slots).draft).toBe(prepareDraft('plumber',slots));
 expect(refreshGeneratedDraft({...candidate,draft:draft.replace('Hello there','Hello Barnett Plumbing').replace('fees and','fees, and')},'plumber',slots).draft).toBe(prepareDraft('plumber',slots));
 expect(refreshGeneratedDraft({...candidate,draftEdited:true},'plumber',slots).draft).toBe(draft);
 expect(refreshGeneratedDraft({...candidate,draft:'Please call me about the kitchen sink.'},'plumber',slots).draft).toBe('Please call me about the kitchen sink.');
});
