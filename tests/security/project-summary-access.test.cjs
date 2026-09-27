const { assert, test, load, workspaces } = require('./helpers.cjs');
const plain = x => JSON.parse(JSON.stringify(x));
function matches(row, where = {}) {
  return Object.entries(where).every(([key,value]) => {
    if(value===undefined)return true;
    if(key==='AND')return (Array.isArray(value)?value:[value]).every(x=>matches(row,x));
    if(key==='OR')return value.some(x=>matches(row,x));
    if(key==='NOT')return !matches(row,value);
    const actual=row?.[key];
    if(value===null||typeof value!=='object')return actual===value;
    if('every'in value)return actual?.every(x=>matches(x,value.every))||false;
    if('some'in value)return actual?.some(x=>matches(x,value.some))||false;
    if('in'in value)return value.in.includes(actual);
    if('notIn'in value)return !value.notIn.includes(actual);
    if('not'in value)return actual!==value.not;
    if('gte'in value&&!(actual>=value.gte))return false;
    if('lte'in value&&!(actual<=value.lte))return false;
    if('lt'in value&&!(actual<value.lt))return false;
    if(['gte','lte','lt'].some(k=>k in value))return actual!=null;
    return actual!=null&&matches(actual,value);
  });
}
function project(row, spec={}) {
  if(row==null)return row;
  const out=spec.select?{}:{...row};
  for(const [key,rule]of Object.entries(spec.select||spec.include||{})){
    if(rule===true){out[key]=row[key];continue;}
    if(!rule)continue;
    const value=row[key];
    if(Array.isArray(value)){out[key]=query(value,rule);}
    else out[key]=value&&(!rule.where||matches(value,rule.where))?project(value,rule):null;
  }
  return out;
}
function query(rows,args={}){
  let result=rows.filter(x=>matches(x,args.where));
  if(args.orderBy){const [key,dir]=Object.entries(args.orderBy)[0];result=result.slice().sort((a,b)=>(a[key]<b[key]?-1:a[key]>b[key]?1:0)*(dir==='desc'?-1:1));}
  if(args.take!=null)result=result.slice(0,args.take);
  return result.map(x=>project(x,args));
}
function fixture(options={}){
 const reads=[],logs=[];const now=new Date(),day=86400000,date=n=>new Date(now.getTime()+n*day);
 const actor={id:'alice',email:'alice@example.test',createdAt:now,updatedAt:now};
 const spaces=structuredClone(workspaces);const projects=spaces.map(workspace=>({id:workspace.id,name:workspace.id,slug:workspace.id,workspaceId:workspace.id,workspace,color:'#fff',description:'description',createdAt:now,updatedAt:now}));
 const target=projects.find(x=>x.id===(options.target||'joined')),foreign=projects.find(x=>x.id==='foreign');const sibling={...target,id:'sibling'};projects.push(sibling);
 const statuses=[{id:'todo',name:'todo',displayName:'Todo',color:'#fff',isFinal:false,isActive:true,projectId:target.id,project:target},{id:'done',name:'done',displayName:'Done',color:'#000',isFinal:true,isActive:true,projectId:target.id,project:target}];
 const hiddenStatus={...statuses[0],id:'foreign-status',projectId:'foreign',project:foreign};
 const issue=(id,overrides={})=>({id,title:id,issueKey:id,projectId:target.id,project:target,workspaceId:target.workspaceId,workspace:target.workspace,statusId:'todo',projectStatus:statuses[0],dueDate:date(-2),updatedAt:date(-1),priority:'MEDIUM',assigneeId:null,assignee:null,parent:null,targetRelations:[],...overrides});
 const hidden=issue('foreign-parent',{projectId:'foreign',project:foreign,workspaceId:'foreign',workspace:foreign.workspace});
 const visibleParent=issue('visible-parent');
 const issues=[issue('overdue',{parent:hidden,targetRelations:[{relationType:'BLOCKS',sourceIssue:hidden},{relationType:'BLOCKS',sourceIssue:visibleParent}]}),issue('upcoming',{dueDate:date(1),parent:visibleParent}),issue('completed',{statusId:'done',projectStatus:statuses[1]}),issue('undated',{dueDate:null}),issue('foreign-workspace',{workspaceId:'foreign',workspace:foreign.workspace}),issue('foreign-status',{statusId:hiddenStatus.id,projectStatus:hiddenStatus})];
 const repo={id:'repo',fullName:'org/repo',projectId:target.id,project:target};
 const commits=[{id:'commit',repositoryId:'repo',repository:repo,sha:'abc',message:'message\nbody',authorName:'Alice',commitDate:date(-1)}];
 const pulls=[{id:'pull',repositoryId:'repo',repository:repo,githubPrId:1,title:'PR',state:'OPEN',createdAt:date(-1),updatedAt:now,mergedAt:null,createdBy:{name:'Alice'}}];
 const version={repository:repo,issueAccessInvalidated:!!options.invalidVersion,issues:options.foreignVersionIssue?[{issue:hidden}]:[]};
 const releases=[{version,id:'release',repositoryId:'repo',repository:repo,tagName:'v1',name:'Release',publishedAt:date(-1)}];
 const author={id:'alice',name:'Alice',image:null};
 const feature=(id,workspaceId)=>({id,title:id,description:id,status:'PENDING',projectId:target.id,project:target,workspaceId,workspace:projects.find(x=>x.id===workspaceId)?.workspace||null,createdAt:now,author,votes:[{value:1},{value:-1},{value:1}],_count:{comments:2}});
 const features=[feature('project-only',null),feature('same-workspace',target.workspaceId),feature('wrong-workspace','own')];
 const note=(id,overrides={})=>({id,title:id,content:id,scope:'PROJECT',projectId:target.id,project:target,workspaceId:null,workspace:null,authorId:'alice',author,isEncrypted:false,isRestricted:false,expiresAt:null,sharedWith:[],type:'NOTE',isFavorite:false,createdAt:now,updatedAt:now,tags:[],comments:[],...overrides});
 const notes=[note('project-only'),note('project-explicit',{workspaceId:target.workspaceId,workspace:target.workspace}),note('workspace',{scope:'WORKSPACE',workspaceId:target.workspaceId,workspace:target.workspace,projectId:null,project:null}),note('workspace-sibling',{scope:'WORKSPACE',workspaceId:target.workspaceId,workspace:target.workspace,projectId:sibling.id,project:sibling}),note('wrong-workspace',{workspaceId:'own',workspace:projects[0].workspace}),note('wrong-project-workspace',{scope:'WORKSPACE',workspaceId:target.workspaceId,workspace:target.workspace,projectId:foreign.id,project:foreign}),note('restricted',{authorId:'bob',isRestricted:true}),note('expired',{authorId:'bob',expiresAt:date(-1)})];
 function revoke(){target.workspace.ownerId='bob';target.workspace.members=[{userId:'alice',status:false}];}
 const db={user:{findUnique:async()=>options.deleted?null:actor},project:{findUnique:async({where,...shape})=>project(projects.find(p=>matches(p,where)),shape)||null,findFirst:async({where,...shape})=>{const value=project(projects.find(p=>matches(p,where)),shape)||null;if(value&&options.revokeLookup)revoke();return value;}},workspaceMember:{findFirst:async({where})=>{const p=projects.find(x=>x.workspaceId===where.workspaceId);const userId=options.staleEmail?'bob':'alice';return p?.workspace.members.find(m=>m.userId===userId&&m.status)|| (userId==='bob'&&p?.id==='foreign'?{userId:'bob',status:true}:null);}},projectStatus:{findMany:async args=>{reads.push('statuses');return query(statuses,args);}},issue:{
 findMany:async args=>{reads.push('issues');return query(issues,args);},count:async args=>{reads.push('count');return query(issues,args).length;},groupBy:async args=>{reads.push('group');if(options.dbError)throw new Error('private-database-detail');const groups={};for(const x of query(issues,args))groups[x.statusId]=(groups[x.statusId]||0)+1;return Object.entries(groups).map(([statusId,id])=>({statusId,_count:{id}}));}},
 repository:{findFirst:async args=>{reads.push('repository');const value=query([repo],args)[0]||null;if(value&&options.revokeRepository)revoke();return value;}},
 commit:{findMany:async args=>query(commits,args)},pullRequest:{findMany:async args=>query(pulls,args)},release:{findMany:async args=>query(releases,args)},featureRequest:{findMany:async args=>query(features,args)},note:{findMany:async args=>query(notes,args)}};
 const deps={'@/lib/prisma':{prisma:db},'@/lib/auth':{authConfig:{}},'@/lib/auth-options':{authOptions:{}},'next-auth/next':{getServerSession:async()=>options.absent?null:{user:{id:'alice',email:options.staleEmail?'bob@example.test':actor.email}}},'@/lib/request-session':{getServerSession:async()=>options.absent?null:{user:{id:'alice',email:options.staleEmail?'bob@example.test':actor.email}}},'@/lib/post-access':load('src/lib/post-access.ts'),'next/server':{NextResponse:{json:(body,init={})=>({body,status:init.status||200,headers:new Headers(init.headers)})}}};
 const globals={Error,console:{error:(...args)=>logs.push(args)}};deps['@/lib/session']=load('src/lib/session.ts',deps,globals);deps['@/lib/issue-finder']=load('src/lib/issue-finder.ts',deps,globals);deps['@/lib/secrets/access']=load('src/lib/secrets/access.ts',deps,globals);
 deps['@/lib/github/version-access']=load('src/lib/github/version-access.ts',{...deps,'./access':load('src/lib/github/access.ts',deps)});
 const route=load('src/app/api/projects/[projectId]/summary/route.ts',deps,globals);
 return{reads,logs,call:(id=target.id)=>route.GET({}, {params:Promise.resolve({projectId:id})})};
}
test('missing/deleted actor denies before summary payload queries',async()=>{for(const flag of ['absent','deleted']){const f=fixture({[flag]:true});assert.equal((await f.call()).status,401);assert.deepEqual(f.reads,[]);}});
test('foreign/inactive/missing exact project and stale-email actor are denied',async()=>{for(const id of ['foreign','revoked','missing']){const f=fixture();assert.equal((await f.call(id)).status,404);assert.deepEqual(f.reads,[]);}const f=fixture({staleEmail:true});assert.equal((await f.call('foreign')).status,404);assert.deepEqual(f.reads,[]);});
test('workspace owner without membership and active member retain summary shape',async()=>{for(const target of ['own','joined']){const r=await fixture({target}).call();assert.equal(r.status,200);for(const k of ['project','stats','statusDistribution','atRisk','recentIssues','recentlyCompleted','timeline','github','featureRequests','notes'])assert.ok(k in r.body);assert.equal(r.body.project.id,target);}});
test('all issue widgets and counts independently reject foreign workspace or status',async()=>{const r=await fixture().call();assert.equal(r.status,200);assert.equal(r.body.stats.totalIssues,4);assert.equal(r.body.stats.completedIssues,1);assert.equal(r.body.stats.openIssues,3);assert.equal(r.body.stats.issuesWithoutDates,1);assert.equal(r.body.stats.unassignedIssues,3);for(const key of ['foreign-workspace','foreign-status'])assert.equal(JSON.stringify(r.body).includes(key),false);});
test('hidden parent and blocker are excluded while readable cross references remain',async()=>{const r=await fixture().call();assert.equal(r.status,200);assert.equal(r.body.atRisk.overdue[0].epic,null);assert.deepEqual(plain(r.body.atRisk.overdue[0].blockedBy.map(x=>x.id)),['visible-parent']);assert.equal(r.body.atRisk.upcoming[0].epic.id,'visible-parent');assert.equal(r.body.timeline[0].parent.id,'visible-parent');});
test('features retain project-only and matching workspace rows, reject explicit other workspace',async()=>{const r=await fixture().call();assert.deepEqual(plain(r.body.featureRequests.map(x=>x.id)),['project-only','same-workspace']);assert.equal(r.body.featureRequests[0].voteScore,1);assert.equal(r.body.featureRequests[0]._count.comments,2);});
test('Notes preserve same-workspace and project-only rows with existing restriction/expiry rules',async()=>{const r=await fixture().call();assert.deepEqual(plain(r.body.notes.map(x=>x.id)),['project-only','project-explicit','workspace','workspace-sibling']);});
test('payload queries recheck lost project access after initial lookup',async()=>{const r=await fixture({revokeLookup:true}).call();assert.equal(r.status,200);assert.equal(r.body.stats.totalIssues,0);assert.deepEqual(plain(r.body.statusDistribution),[]);assert.deepEqual(plain(r.body.notes),[]);assert.deepEqual(plain(r.body.featureRequests),[]);assert.equal(r.body.github.connected,false);});
test('GitHub child activity queries recheck project access after repository lookup',async()=>{const r=await fixture({revokeRepository:true}).call();assert.equal(r.status,200);assert.deepEqual(plain(r.body.github.activities),[]);});
test('authorized GitHub activity, date windows and response transformations remain',async()=>{const r=await fixture().call();assert.equal(r.status,200);assert.equal(r.body.github.repositoryName,'org/repo');assert.equal(r.body.github.activities.length,3);assert.equal(r.body.github.activities.find(x=>x.type==='commit').description,'message');assert.equal(r.body.recentlyCompleted[0].id,'completed');assert.equal(r.body.timeline[0].id,'upcoming');assert.ok(r.body.atRisk.upcoming[0].daysUntilDue>=0);});
test('success is no-store and unexpected errors use fixed safe logs',async()=>{assert.equal((await fixture().call()).headers.get('cache-control'),'no-store');const f=fixture({dbError:true});assert.equal((await f.call()).status,500);assert.ok(f.logs.length&&f.logs.every(x=>x.length===1&&!x[0].includes('private-database-detail')));});

test('summary release projection hides invalidated and foreign-issue versions',async()=>{for(const options of [{invalidVersion:true},{foreignVersionIssue:true},{}]){const r=await fixture(options).call();assert.equal(r.status,200);assert.equal(r.body.github.activities.filter(x=>x.type==='release').length,Object.keys(options).length?0:1);}});
