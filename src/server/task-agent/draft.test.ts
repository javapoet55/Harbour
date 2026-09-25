import {expect,it} from 'vitest';
import {prepareDraft} from './rank';

const slots={location:'94572',urgency:'flexible' as const,budget:'',constraints:'',preferencesConfirmed:true};
it('uses the requested electrician message with the entered ZIP code',()=>{
 expect(prepareDraft('electrician',slots)).toBe('Hi, I’m looking for an electrician in zip code: 94572.\n\nCould you please share your next available appointment, an estimated quote, and any diagnostic or service-call fee?\n\nPlease let me know if you need any additional details from me. Thank you!');
});
it('preserves an entered city instead of labeling it as a ZIP code',()=>{
 expect(prepareDraft('plumber',{...slots,location:' San Ramon, CA '})).toContain('Hi, I’m looking for a plumber in San Ramon, CA.');
 expect(prepareDraft('plumber',{...slots,location:'San Ramon'})).not.toContain('zip code');
});
it('handles ZIP+4 and service names without an incorrect article',()=>{
 expect(prepareDraft('appliance repair',{...slots,location:'94572-1234'})).toContain('looking for appliance repair in zip code: 94572-1234.');
});
