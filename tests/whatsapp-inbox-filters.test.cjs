/* eslint-disable @typescript-eslint/no-require-imports -- This CommonJS Node test loads the TypeScript compiler to isolate the route without a Next server. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const compiled=ts.transpileModule(fs.readFileSync('app/api/whatsapp/conversations/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
async function query(params){
 const calls=[];
 const builder={then(resolve){return Promise.resolve({data:[],error:null}).then(resolve);}};
 for(const method of ['select','eq','order','limit','is','gt','or'])builder[method]=(...args)=>{calls.push([method,...args]);return builder;};
 const server={authenticate:async()=>({companyId:'company-test',db:{from:()=>builder}}),json:data=>Response.json(data),failure:error=>Response.json({error:error.message},{status:400}),dbError:error=>{if(error)throw error;},WhatsAppError:class extends Error{},CONVERSATION_COLUMNS:'id'};
 const m={exports:{}};new Function('require','module','exports',compiled)(name=>name.endsWith('/server')?server:{},m,m.exports);
 const response=await m.exports.GET(new Request('https://nexus.example/api/whatsapp/conversations?'+params));return {response,calls};
}
test('Unassigned filters by null owner, never by a won sale',async()=>{
 const {response,calls}=await query('filter=unassigned');assert.equal(response.status,200);
 assert.ok(calls.some(c=>c[0]==='is'&&c[1]==='assigned_to'&&c[2]===null));
 assert.ok(!calls.some(c=>c[1]==='sales_stage'));
 assert.ok(calls.some(c=>c[0]==='eq'&&c[1]==='company_id'&&c[2]==='company-test'));
});
test('Sales stage and inbox filters combine with search on the server',async()=>{
 const {calls}=await query('salesStage=qualified&filter=unread&search=Sam');
 assert.ok(calls.some(c=>c[0]==='eq'&&c[1]==='sales_stage'&&c[2]==='qualified'));
 assert.ok(calls.some(c=>c[0]==='gt'&&c[1]==='unread_count'));
 assert.ok(calls.some(c=>c[0]==='or'&&c[1].includes('contact_name.ilike.%Sam%')));
 assert.ok(calls.some(c=>c[0]==='limit'&&c[1]===100));
});
test('Follow-up search preserves both due and customer-name predicates',async()=>{
 const {calls}=await query('filter=follow_up&search=Sam');
 assert.equal(calls.filter(c=>c[0]==='or').length,2);
 assert.ok(calls.some(c=>c[0]==='or'&&c[1].startsWith('attention_state.eq.follow_up_due,follow_up_at.lte.')));
});
test('Unknown stage or filter is rejected before querying data',async()=>{
 for(const params of ['filter=unexpected','salesStage=unexpected']){
 const {response,calls}=await query(params);assert.equal(response.status,400);assert.equal(calls.length,0);
 }
});
