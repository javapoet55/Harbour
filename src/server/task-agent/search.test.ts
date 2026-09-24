import {afterEach,it,expect,vi} from 'vitest';
import {searchBusinesses} from './search';
const slots={location:'San Jose, CA',urgency:'urgent' as const,budget:'',constraints:'',preferencesConfirmed:true};
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
it('uses Places with header credentials, explicit fields and no raw task data',async()=>{
 vi.stubEnv('GOOGLE_PLACES_API_KEY','secret-test');
 const request=vi.fn(async(url: URL | RequestInfo, options?:RequestInit)=>{expect(String(url)).not.toContain('secret-test');expect(options?.headers).toMatchObject({'X-Goog-Api-Key':'secret-test'});return Response.json({places:[{id:'123',displayName:{text:'Emergency Plumbing'},formattedAddress:'Main St',websiteUri:'javascript:alert(1)',rating:4.5,userRatingCount:50,currentOpeningHours:{openNow:true},businessStatus:'OPERATIONAL'},{id:'closed',businessStatus:'CLOSED_PERMANENTLY'}]});});vi.stubGlobal('fetch',request);
 const result=await searchBusinesses('Google','plumber',slots);expect(result).toHaveLength(1);expect(result[0].website).toBeNull();expect(result[0].googlePlaceId).toBe('123');expect(result[0].openNow).toBe(true);
 expect(String(request.mock.calls[0][0])).toBe('https://places.googleapis.com/v1/places:searchText');expect(JSON.parse(request.mock.calls[0][1]!.body as string)).toMatchObject({openNow:true,pageSize:20,textQuery:'emergency plumber in San Jose, CA'});
});
it('returns attributed reviews and location from fresh place details',async()=>{
 vi.stubEnv('GOOGLE_PLACES_API_KEY','test');vi.stubGlobal('fetch',vi.fn(async()=>Response.json({id:'one',location:{latitude:37,longitude:-122},reviews:[{rating:5,text:{text:'Helpful'},authorAttribution:{displayName:'Reviewer',uri:'https://maps.google.com/user',photoUri:'https://example.com/avatar'},googleMapsUri:'https://maps.google.com/review',relativePublishTimeDescription:'a week ago'}]})));
 const {placeDetails}=await import('./search');const result=await placeDetails('one');expect(result.feedback?.[0]).toMatchObject({author:'Reviewer',text:'Helpful',rating:5});expect(result.coordinates?.latitude).toBe(37);
});
it('sorts the returned review selection newest first with stable ties and undated reviews last',async()=>{
 vi.stubEnv('GOOGLE_PLACES_API_KEY','test');
 const reviews=[
  ['missing',undefined],['old','2024-09-01T00:00:00Z'],['invalid','unknown'],
  ['new','2026-09-23T08:00:00Z'],['tie','2026-09-23T08:00:00Z'],['middle','2026-03-01T00:00:00Z']
 ].map(([author,publishTime])=>({authorAttribution:{displayName:author},publishTime,googleMapsUri:`https://maps.google.com/review/${author}`,text:{text:`Review by ${author}`},relativePublishTimeDescription:'localized relative date'}));
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({id:'one',reviews})));
 const {placeDetails}=await import('./search');
 const result=await placeDetails('one');
 expect(result.feedback?.map(r=>r.author)).toEqual(['new','tie','middle','old','missing','invalid']);
 expect(result.feedback?.[0]).toMatchObject({text:'Review by new',url:'https://maps.google.com/review/new',published:'localized relative date'});
});
it('uses Yelp open-now search for urgency and does not treat non-closed as open-now otherwise',async()=>{
 vi.stubEnv('YELP_API_KEY','test');const request=vi.fn(async(url: URL | RequestInfo)=>(void url, Response.json({businesses:[{id:'one',name:'Plumber',url:'https://yelp.com/biz/one',is_closed:false,rating:4,review_count:10},{id:'two',name:'Closed',url:'https://yelp.com/biz/two',is_closed:true}]})));vi.stubGlobal('fetch',request);
 const urgent=await searchBusinesses('Yelp','plumber',slots);expect(urgent).toHaveLength(1);expect(urgent[0].openNow).toBe(true);expect(String(request.mock.calls[0][0])).toContain('open_now=true');
 const flexible=await searchBusinesses('Yelp','plumber',{...slots,urgency:'flexible'});expect(flexible[0].openNow).toBeNull();
});

it('excludes known-closed providers from urgent shortlists',async()=>{
 const {rankCandidates}=await import('./rank');
 const row={id:'closed',name:'Closed provider',address:'Main St',phone:'',website:null,evidence:[],openNow:false,emergencyAdvertised:true,reason:'',draft:''};
 expect(rankCandidates([row],slots)).toHaveLength(0);
 expect(rankCandidates([row],{...slots,urgency:'flexible'})).toHaveLength(1);
});
