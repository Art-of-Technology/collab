const { assert, test, load, matches, workspaces } = require('./helpers.cjs');
const plain = x => JSON.parse(JSON.stringify(x));
function fixture(options = {}) {
  const actor = { id: 'alice', email: 'alice@example.test', createdAt: new Date(), updatedAt: new Date() };
  const projects = structuredClone(workspaces).map(workspace => ({ id: workspace.id, workspaceId: workspace.id, name: workspace.id, workspace }));
  let statuses = projects.flatMap(project => [{ id: project.id+'-default', projectId: project.id, project, name: 'todo', displayName: 'Todo', color: '#fff', order: 1, isDefault: true, isFinal: false, isActive: true, template: { id: 'global', name: 'todo', displayName: 'Todo' } }, { id: project.id+'-inactive', projectId: project.id, project, name: 'hidden', order: 2, isDefault: false, isActive: false, template: null }]);
  const issueRows = [
    { id: 'visible', projectId: 'joined', workspaceId: 'joined', workspace: projects[1].workspace, project: projects[1], statusId: 'joined-default', projectStatus: { project: projects[1] } },
    { id: 'bad-workspace', projectId: 'joined', workspaceId: 'foreign', workspace: projects[3].workspace, project: projects[1], statusId: 'joined-default', projectStatus: { project: projects[1] } },
    { id: 'other-project', projectId: 'own', workspaceId: 'own', workspace: projects[0].workspace, project: projects[0], statusId: 'joined-default', projectStatus: { project: projects[1] } },
  ];
  const writes = [], attempts = [], logs = [];
  function visible(row, include) { const result = structuredClone(row); const scope = include?._count?.select?.issues; result._count = { issues: issueRows.filter(x => x.statusId === row.id && matches(x, scope?.where || {})).length }; return result; }
  function projectFind({ where }) { const row = projects.find(x => matches(x, where)); return row ? structuredClone(row) : null; }
  function revoke() { const p = projects.find(x => x.id === (options.target || 'joined')); p.workspace.ownerId = 'bob'; p.workspace.members = [{ userId: 'alice', status: false }]; }
  const db = {
    user: { findUnique: async ({ where }) => options.deleted || where.id !== actor.id ? null : actor },
    project: { findUnique: async ({ where }) => projectFind({ where }), findFirst: async args => { const result=projectFind(args); if(options.revokeRead)revoke(); return result; } },
    workspaceMember: { findFirst: async ({ where }) => { const p=projects.find(x=>x.workspaceId===where.workspaceId); const id=where.user?.email==='bob@example.test'?'bob':'alice'; return p?.workspace.members.find(m=>m.userId===id&&m.status) || (id==='bob'&&p?.id==='foreign'?{userId:'bob',status:true}:null); } },
  };
  function statusFacade(get, write) { return {
    findMany: async ({ where, include }) => get().filter(s => matches({ ...s, project: projects.find(p=>p.id===s.projectId) }, where)).sort((a,b)=>a.order-b.order).map(s=>visible(s,include)),
    updateMany: async ({ where, data }) => { const rows=get().filter(s=>matches({...s,project:projects.find(p=>p.id===s.projectId)},where));for(const s of rows)Object.assign(s,data);attempts.push('default-clear');write(['default-clear',rows.map(x=>x.id)]);return {count:rows.length}; },
    create: async ({ data, include }) => { attempts.push('create'); if(options.createFailure)throw new Error('private-database-detail'); if(data.templateId==='missing')throw new Error('foreign key'); const row={id:'new-status',...data,isActive:true,project:projects.find(p=>p.id===data.projectId),template:data.templateId?{id:data.templateId,name:'global',displayName:'Global'}:null};get().push(row);write(['create',row.id]);return visible(row,include); },
  }; }
  db.projectStatus=statusFacade(()=>statuses,x=>writes.push(x));
  db.$transaction=async callback=>{ if(options.revokeTx)revoke();let draft=structuredClone(statuses);const pending=[];const tx={project:{findFirst:async args=>projectFind(args)},projectStatus:statusFacade(()=>draft,x=>pending.push(x))};const result=await callback(tx);statuses=draft;writes.push(...pending);return result; };
  const dependencies={ '@/lib/prisma':{prisma:db}, '@/lib/auth':{authConfig:{}}, '@/lib/auth-options':{authOptions:{}},
    'next-auth/next':{getServerSession:async()=>options.absent?null:{user:{id:'alice',email:options.staleEmail?'bob@example.test':actor.email}}},
    '@/lib/request-session':{getServerSession:async()=>options.absent?null:{user:{id:'alice',email:options.staleEmail?'bob@example.test':actor.email}}},
    '@/lib/post-access':load('src/lib/post-access.ts'),
    'next/server':{NextResponse:{json:(body,init={})=>({body,status:init.status||200,headers:new Headers(init.headers)})}},
  };
  const globals={Error,console:{error:(...args)=>logs.push(args)}};
  dependencies['@/lib/session']=load('src/lib/session.ts',dependencies,globals);
  dependencies['@/lib/issue-finder']=load('src/lib/issue-finder.ts',dependencies,globals);
  const route=load('src/app/api/projects/[projectId]/statuses/route.ts',dependencies,globals);
  return {writes,attempts,logs,state:()=>plain(statuses.map(({project,...row})=>row)),call:(method='GET',id='joined',body={name:'new',displayName:'New',isDefault:true})=>route[method]({json:async()=>body},{params:Promise.resolve({projectId:id})})};
}
for(const method of ['GET','POST'])test(method+' denies absent/deleted actor and foreign, inactive or missing exact project',async()=>{
  for(const flag of ['absent','deleted']){const f=fixture({[flag]:true});assert.equal((await f.call(method)).status,401);assert.deepEqual(f.writes,[]);}
  for(const id of ['foreign','revoked','missing']){const f=fixture();assert.equal((await f.call(method,id)).status,404);assert.deepEqual(f.writes,[]);}
});
for(const method of ['GET','POST'])test(method+' uses immutable subject rather than stale recipient email',async()=>{const f=fixture({staleEmail:true});assert.equal((await f.call(method,'foreign')).status,404);assert.deepEqual(f.writes,[]);});
test('GET owner without member and active member retain status/template/order projection',async()=>{for(const id of ['own','joined']){const f=fixture();const r=await f.call('GET',id);assert.equal(r.status,200);assert.equal(r.body.statuses.length,1);assert.equal(r.body.statuses[0].id,id+'-default');assert.equal(r.body.statuses[0].template.id,'global');assert.equal(r.body.statuses[0].order,1);}});
test('GET status issue counts exclude inaccessible and different-project linked issues',async()=>{const r=await fixture().call();assert.equal(r.status,200);assert.equal(r.body.statuses[0].issueCount,1);});
test('GET payload repeats current project access after preliminary lookup',async()=>{const r=await fixture({revokeRead:true}).call();assert.equal(r.status,200);assert.deepEqual(plain(r.body.statuses),[]);});
test('POST owner without member and active member preserve defaults, template and201 response',async()=>{for(const id of ['own','joined']){const f=fixture();const r=await f.call('POST',id,{name:'new',displayName:'New',isDefault:true,isFinal:true,templateId:'global',order:7});assert.equal(r.status,201);assert.equal(r.body.status.order,7);assert.equal(r.body.status.template.id,'global');assert.equal(r.body.status.isFinal,true);assert.equal(f.state().find(x=>x.id===id+'-default').isDefault,false);assert.equal(f.state().filter(x=>x.projectId===id&&x.isDefault).length,1);assert.equal(f.state().find(x=>x.id==='foreign-default').isDefault,true);}});
test('POST active member omitted optional fields preserve defaults without clearing existing default',async()=>{const f=fixture();const r=await f.call('POST','joined',{name:'new',displayName:'New'});assert.equal(r.status,201);assert.equal(r.body.status.color,'#6366f1');assert.equal(r.body.status.order,0);assert.equal(r.body.status.isDefault,false);assert.equal(r.body.status.isFinal,false);assert.equal(f.state().find(x=>x.id==='joined-default').isDefault,true);});
test('POST changed project access at transaction entry rejects with409 and zero writes',async()=>{const f=fixture({revokeTx:true});const before=f.state();assert.equal((await f.call('POST')).status,409);assert.deepEqual(f.writes,[]);assert.deepEqual(f.state(),before);});
test('POST create or template failure rolls back prior default clearing',async()=>{for(const options of [{createFailure:true},{}]){const f=fixture(options);const before=f.state();const r=await f.call('POST','joined',{name:'new',displayName:'New',isDefault:true,templateId:options.createFailure?'global':'missing'});assert.equal(r.status,500);assert.deepEqual(f.state(),before);assert.deepEqual(f.writes,[]);assert.deepEqual(f.attempts,['default-clear','create']);assert.ok(f.logs.every(x=>x.length===1&&!x[0].includes('private-database-detail')));}});
test('both successful endpoints use no-store',async()=>{for(const method of ['GET','POST'])assert.equal((await fixture().call(method)).headers.get('cache-control'),'no-store');});
