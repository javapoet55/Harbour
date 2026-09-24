import {nextQuestion} from './types';
import {it,expect} from 'vitest';
import {classifyTask} from './intent';
it('classifies intents conservatively without over-triggering',()=>{
 for(const title of ['Call mom','Call my plumber','Pick up dry cleaning','Do not find a plumber','Pay plumber invoice','Call mom about finding a plumber'])expect(classifyTask(title).eligible).toBe(false);
 expect(classifyTask('Find plumber for water leak')).toMatchObject({category:'PROCUREMENT',eligible:true,urgency:'urgent'});
 expect(classifyTask('Compare local painters')).toMatchObject({category:'RESEARCH'});
 expect(classifyTask('Renew passport')).toMatchObject({category:'LOGISTICS',eligible:false});
 expect(classifyTask('Find a painter for guest room')).toMatchObject({eligible:true,urgency:'flexible'});
 expect(classifyTask('Find a plumber, no rush')).toMatchObject({urgency:'flexible'});
});

it('requires a confident direct request and a supported service in the title',()=>{
 for(const title of ['Maybe find a plumber','I might need a plumber','Find a plumber or painter','Decide whether to hire a plumber']){
  expect(classifyTask(title).eligible).toBe(false);expect(classifyTask(title).score).toBeLessThan(.9);
 }
 expect(classifyTask('Find a caterer')).toMatchObject({eligible:false,category:'PROCUREMENT'});
 expect(classifyTask('Find a caterer','My plumber recommended tutoring')).toMatchObject({eligible:false,service:null});
});

it('recognizes sprinkler and irrigation provider discovery without triggering personal actions',()=>{
 expect(classifyTask('Find sprinkler repair person')).toMatchObject({eligible:true,service:'sprinkler and irrigation repair'});
 expect(classifyTask('Find an irrigation repair company')).toMatchObject({eligible:true});
 expect(classifyTask('Call sprinkler repair person')).toMatchObject({eligible:true});
});

it('offers provider discovery for generic outreach while preserving personal contacts',()=>{
 for(const title of ['Find a plumbers','Contact plumbers','Call a plumber','Call plumbers to get quotes','Please contact a local plumber','Email an electrician','Find a plumber','Get quotes for a plumber','Hire an electrician']) {
  expect(classifyTask(title),title).toMatchObject({eligible:true,category:'PROCUREMENT'});
 }
 for(const title of ['Contact my plumber','Call the plumber','Contact John the plumber','Call mom about a plumber','Do not contact plumbers','Contact a caterer','Call a plumber or electrician','Maybe contact plumbers']) {
  expect(classifyTask(title).eligible,title).toBe(false);
 }
});

it('recognizes the expanded discovery phrases and services',()=>{
 for(const title of ['Plumbers near me','Locate a nearby dentist','Get estimates for roof repair','Price out house cleaning','Schedule an AC repair','Arrange pest control','Need someone to fix my sprinkler','Compare local electricians','Find highly rated movers','Need an emergency plumber','Locked out—find a locksmith','Find a weekend cleaner','Find a Spanish-speaking dentist','Find another gardener','Need a new mechanic','Find a tutor','Find appliance repair','Find a handyman','Find garage-door repair','Find pet grooming','Find car detailing']) {
  expect(classifyTask(title).eligible,title).toBe(true);
 }
 expect(classifyTask('Find a Spanish-speaking dentist')).toMatchObject({constraints:'Spanish-speaking'});
 expect(classifyTask('Need an emergency plumber')).toMatchObject({urgency:'urgent'});
 for(const title of ['My sink is leaking','Locked out','Water leak'])expect(classifyTask(title),title).toMatchObject({eligible:true,needsConfirmation:true});
 for(const title of ['Call my mechanic','Please call mom about a plumber','Maybe schedule AC repair','Need a plumber or electrician','Do not arrange pest control','Fix my sprinkler myself'])expect(classifyTask(title).eligible,title).toBe(false);
});

it('blocks search until problem-only discovery is confirmed, including with filled slots',()=>{
 const slots={discoveryConfirmed:false,location:'San Ramon',locationConfirmed:true,urgency:'flexible' as const,budget:'',constraints:'',preferencesConfirmed:true};
 expect(nextQuestion(slots)?.key).toBe('discovery');
 expect(nextQuestion({...slots,discoveryConfirmed:true})).toBeNull();
});

it('does not ask an urgency question for older unknown-urgency runs',()=>{
 expect(nextQuestion({location:'94582',locationConfirmed:true,urgency:'unknown',budget:'',constraints:'',preferencesConfirmed:false})?.key).toBe('preferences');
});
