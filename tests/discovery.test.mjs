import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOverpassQuery, discoverBusinesses, normalizeCategories, parseBbox, parseOverpassElements } from '../src/discovery.mjs';

test('discovery validates city-sized bounding boxes',()=>{
  assert.deepEqual(parseBbox('51.28,-0.51,51.69,0.33',5),[51.28,-0.51,51.69,0.33]);
  assert.throws(()=>parseBbox('0,0,40,40',5),/too large/i);
  assert.throws(()=>parseBbox('north,0,1,2',5),/must be a number/i);
});

test('discovery accepts only supported category names',()=>{
  assert.deepEqual(normalizeCategories('clinic,dentist,clinic'),['clinic','dentist']);
  assert.throws(()=>normalizeCategories('clinic"];out;'),/unsupported/i);
});

test('Overpass query is generated from whitelisted selectors',()=>{
  const query=buildOverpassQuery({bbox:'51.28,-0.51,51.69,0.33',categories:['clinic','dentist'],timeoutSeconds:20,maxSpan:5});
  assert.match(query,/\[out:json\]\[timeout:20\]/);
  assert.match(query,/amenity/);
  assert.match(query,/healthcare/);
  assert.match(query,/out center tags/);
});

test('Overpass results require a public website and deduplicate domains',()=>{
  const records=parseOverpassElements([
    {type:'node',id:1,lat:51.5,lon:-0.1,tags:{name:'North Clinic',amenity:'clinic',website:'north.example/path'}},
    {type:'way',id:2,center:{lat:51.5,lon:-0.1},tags:{name:'North Duplicate',healthcare:'clinic','contact:website':'https://www.north.example/other'}},
    {type:'node',id:3,tags:{name:'No Website',amenity:'clinic'}},
    {type:'node',id:4,tags:{name:'South Dental',amenity:'dentist','contact:website':'https://dental.example'}}
  ],{categories:['clinic','dentist'],country:'United Kingdom',city:'London'});
  assert.equal(records.length,2);
  assert.equal(records[0].company,'North Clinic');
  assert.equal(records[0].source,'openstreetmap');
  assert.equal(records[0].sourceLicense,'© OpenStreetMap contributors');
  assert.equal(records[1].niche,'dentist');
});

test('website gate rejects non-http schemes and single-label hostnames',()=>{
  const records=parseOverpassElements([
    {type:'node',id:1,tags:{name:'FTP Clinic',amenity:'clinic',website:'ftp://files.example'}},
    {type:'node',id:2,tags:{name:'Tel Clinic',amenity:'clinic',website:'tel:+201000000000'}},
    {type:'node',id:3,tags:{name:'JS Clinic',amenity:'clinic',website:'javascript:alert(1)'}},
    {type:'node',id:4,tags:{name:'Mail Clinic',amenity:'clinic',website:'mailto:x@y.example'}},
    {type:'node',id:5,tags:{name:'Bare Label',amenity:'clinic',website:'intranet'}},
    {type:'node',id:6,tags:{name:'Real Clinic',amenity:'clinic',website:'real.example/care'}}
  ],{categories:['clinic']});
  assert.equal(records.length,1);
  assert.equal(records[0].company,'Real Clinic');
  assert.equal(records[0].website,'https://real.example/care');
});

test('discovery POSTs to Overpass and obeys the result limit',async()=>{
  let request;
  const fetcher=async(url,options)=>{request={url,options};return {ok:true,status:200,json:async()=>({elements:[
    {type:'node',id:1,tags:{name:'A Clinic',amenity:'clinic',website:'https://a.example'}},
    {type:'node',id:2,tags:{name:'B Clinic',amenity:'clinic',website:'https://b.example'}}
  ]})};};
  const result=await discoverBusinesses({endpoint:'https://overpass.test/api/interpreter',categories:['clinic'],bbox:'1,1,1.5,1.5',country:'',city:'',dailyCap:10,timeoutMs:1000,maxBboxSpan:5,userAgent:'UberBondTest/1.0'},{limit:1},fetcher);
  assert.equal(request.url,'https://overpass.test/api/interpreter');
  assert.equal(request.options.method,'POST');
  assert.match(request.options.body,/data=/);
  assert.equal(result.rawCount,2);
  assert.equal(result.prospects.length,1);
});
