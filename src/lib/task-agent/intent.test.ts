import {it,expect} from 'vitest';
import {classifyTask} from './intent';
it('classifies intents conservatively without over-triggering',()=>{
 for(const title of ['Call mom','Call my plumber','Pick up dry cleaning','Do not find a plumber','Pay plumber invoice','Call plumbers to get quotes','Call mom about finding a plumber'])expect(classifyTask(title).eligible).toBe(false);
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
 expect(classifyTask('Find a tutor')).toMatchObject({eligible:false,category:'PROCUREMENT'});
 expect(classifyTask('Find a tutor','My plumber recommended tutoring')).toMatchObject({eligible:false,service:null});
});

it('recognizes sprinkler and irrigation provider discovery without triggering personal actions',()=>{
 expect(classifyTask('Find sprinkler repair person')).toMatchObject({eligible:true,service:'sprinkler and irrigation repair'});
 expect(classifyTask('Find an irrigation repair company')).toMatchObject({eligible:true});
 expect(classifyTask('Call sprinkler repair person')).toMatchObject({eligible:false});
});
