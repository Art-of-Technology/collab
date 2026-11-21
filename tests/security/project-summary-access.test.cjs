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
    if('gt'in value)return actual>value.gt;
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
 const actor={id:'alice',name:'Alice',agentSeat:null,email:'alice@example.test',createdAt:now,updatedAt:now};
 const spaces=structuredClone(workspaces);const projects=spaces.map(workspace=>({id:workspace.id,name:workspace.id,slug:workspace.id,workspaceId:workspace.id,workspace,color:'#fff',description:'description',createdAt:now,updatedAt:now}));
 const target=projects.find(x=>x.id===(options.target||'joined')),foreign=projects.find(x=>x.id==='foreign');const sibling={...target,id:'sibling'};projects.push(sibling);
 const seat = { id: 'seat', name: 'Working seat', workspaceId: target.workspaceId, project: target, retiredAt: null };
 const agent = { id: 'seat-user', name: 'Seat account', agentSeat: seat };
 seat.user = agent;
 if (options.role) target.workspace.members.find(m => m.userId === actor.id).role = options.role;
 const statuses=[{id:'todo',name:'todo',displayName:'Todo',color:'#fff',isFinal:false,isActive:true,category:null,projectId:target.id,project:target},{id:'done',name:'done',displayName:'Done',color:'#000',isFinal:true,isActive:true,projectId:target.id,project:target}];
 const hiddenStatus={...statuses[0],id:'foreign-status',projectId:'foreign',project:foreign};
 const issue=(id,overrides={})=>({id,title:id,issueKey:id,projectId:target.id,project:target,workspaceId:target.workspaceId,workspace:target.workspace,deletedAt:null,statusId:'todo',projectStatus:statuses[0],dueDate:date(-2),updatedAt:date(-1),priority:'MEDIUM',assigneeId:null,assignee:null,parent:null,targetRelations:[],createdAt:date(-60),...overrides});
 const hidden=issue('foreign-parent',{projectId:'foreign',project:foreign,workspaceId:'foreign',workspace:foreign.workspace});
 const visibleParent=issue('visible-parent');
 const issues=[issue('overdue',{parent:hidden,targetRelations:[{relationType:'BLOCKS',sourceIssue:hidden},{relationType:'BLOCKS',sourceIssue:visibleParent}]}),issue('upcoming',{dueDate:date(1),parent:visibleParent}),issue('completed',{statusId:'done',projectStatus:statuses[1]}),issue('undated',{dueDate:null}),issue('foreign-workspace',{workspaceId:'foreign',workspace:foreign.workspace}),issue('foreign-status',{statusId:hiddenStatus.id,projectStatus:hiddenStatus})];
 const activity = [];
 if (options.legacyStatuses) {
  target.createdAt = date(-90);
  statuses[0].displayName = 'To Do';
  statuses.push({ ...statuses[0], id: 'retired', name: 'deprecated', displayName: 'Deprecated' });
  const legacy = (id, status, fields) => issue(id, { statusId: null, projectStatus: null, status, ...fields });
  issues.push(
   issue('milestone', { type: 'MILESTONE', dueDate: date(14) }),
   legacy('legacy-done', 'done', { milestoneId: 'milestone', finishedAt: date(-5) }),
   legacy('legacy-completed', 'complete', { updatedAt: date(-40) }),
   legacy('legacy-to-do', 'to_do', { milestoneId: 'milestone' }),
   legacy('legacy-status-value', 'done', { statusValue: ' To Do ' }),
   legacy('legacy-deprecated', 'deprecated'),
   legacy('legacy-empty', null),
   legacy('legacy-unknown', 'previous workflow'),
  );
  issues[0].status = 'done';
  issues.find(row => row.id === 'completed').updatedAt = date(-40);
 }
 if (options.paged) {
  for (let i=0;i<520;i++) issues.push(issue(`paged-${i}`, { dueDate:null }));
 }
 if (options.overviewHistory) {
  const blockedStatus = { ...statuses[0], id:'blocked', name:'blocked', displayName:'Blocked', category:'blocked' };
  statuses.push(blockedStatus);
  const completed = issues.find(row => row.id === 'completed');
  completed.finishedAt = date(-4);
  issues.push(issue('blocked', { statusId: 'blocked', projectStatus: blockedStatus }));
  const transition = (itemId, newStatus, createdAt, user) => ({
   id: itemId + '-change', itemId, itemType: 'ISSUE', workspaceId: target.workspaceId, projectId: target.id,
   action: 'STATUS_CHANGED', oldStatusId: 'todo', oldStatus: statuses[0], newStatus, createdAt,
   user,
  });
  const closer = options.crossWorkspaceSeat
    ? { ...agent, id: 'cross-seat-user', agentSeat: { ...seat, workspaceId: foreign.workspaceId, name: 'Private seat name' } } : agent;
  activity.push(transition('completed', statuses[1], date(-4), closer), transition('blocked', blockedStatus, date(-6), actor));
  if (options.burn) {
   const finished = new Date(now.getTime() - 3_600_000);
   const nearFinish = seconds => new Date(finished.getTime() + seconds * 1_000);
   completed.finishedAt = finished;
   activity[0].createdAt = finished;
   issues.push(issue('human-completed', {statusId:'done',projectStatus:statuses[1],finishedAt:finished,assignee:agent}));
   activity.push(
    { ...transition('human-completed', statuses[1], options.rapidReopen ? nearFinish(-30) : date(-12), agent), id: 'old-close' },
    { ...transition('human-completed', statuses[1], nearFinish(options.rapidReopen ? 35 : 1), actor),
      action: 'UPDATED', fieldName: 'status', projectId: null, newStatusId: null, oldValue: 'Todo', newValue: 'Done' },
    { ...transition('human-completed', statuses[1], new Date(finished.getTime() + 2_000), agent),
      id: 'final-to-final', oldStatusId: 'done', oldStatus: statuses[1] },
    { ...transition('human-completed', statuses[0], options.rapidReopen ? nearFinish(-15) : date(-10), actor),
      id: 'old-reopen', oldStatusId: 'done', oldStatus: statuses[1] },
   );
   if (options.reopen) {
    target.createdAt = date(-60);
    issues.push(issue('reopened'));
    activity.push(
     { ...transition('reopened', statuses[1], date(-9), agent), id: 'reopened-close' },
     { ...transition('reopened', statuses[0], date(-2), actor), id: 'reopened-open', oldStatusId: 'done', oldStatus: statuses[1] },
    );
   }
   completed.assignee = actor;
   issues.push(issue('human-open', {assignee: {id:'unlogged',name:'Unlogged person',agentSeat:null}}));
  }
 }
 if (options.large) {
  for (let i=0;i<11;i++) issues.push(issue(`extra-overdue-${i}`), issue(`extra-upcoming-${i}`,{dueDate:date(1)}));
  issues.push(issue('trashed-overdue',{deletedAt:now}), issue('trashed-upcoming',{dueDate:date(1),deletedAt:now}));
 }
 const repo={id:'repo',fullName:'org/repo',isActive:!options.inactiveRepository,projectId:target.id,project:target};
 const connections=options.providers?['gitlab','forgejo'].map((provider,index)=>({id:provider,provider,repositoryPath:`team/${provider}`,projectId:target.id,project:target,isActive:true,createdAt:date(-index),credentials:'never-expose',activity:[{id:provider,kind:'commit',title:`${provider} commit`,date:now}]})):[];
 connections.push({id:'foreign-git',provider:'gitlab',repositoryPath:'secret/repo',projectId:target.id,project:foreign,isActive:true,createdAt:now,activity:[]},{id:'inactive-git',provider:'forgejo',repositoryPath:'old/repo',projectId:target.id,project:target,isActive:false,createdAt:now,activity:[]});
 const commits=[{id:'commit',repositoryId:'repo',repository:repo,sha:'abc',message:'message\nbody',authorName:'Alice',commitDate:date(-1)}];
 const pulls=[{id:'pull',repositoryId:'repo',repository:repo,githubPrId:1,title:'PR',state:'OPEN',createdAt:date(-1),updatedAt:now,mergedAt:null,createdBy:{name:'Alice'}}];
 if (options.burn) {
  const mergedAt = new Date(now.getTime() - 3_600_000);
  const merger = (user, workspaceMemberships) => ({...user, ownedWorkspaces:[],workspaceMemberships});
  const inWorkspace = [{id:'membership',workspaceId:target.workspaceId}];
  for (const [id, mergedBy, repository] of [
   ['seat-merge',merger(agent,[]),repo],['human-merge',merger(actor,inWorkspace),repo],
   ['unmatched-merge',null,repo],['foreign-merger',merger({id:'external',name:'External merger',agentSeat:null},[]),repo],
   ['foreign-merge',merger(actor,inWorkspace),{...repo,project:sibling}],
  ]) pulls.push({id,mergedAt,mergedBy,repository,state:'MERGED',updatedAt:now,createdAt:date(-1),githubPrId:pulls.length+1});
 }
 const version={repository:repo,issueAccessInvalidated:!!options.invalidVersion,issues:options.foreignVersionIssue?[{issue:hidden}]:[]};
 const releases=[{version,id:'release',repositoryId:'repo',repository:repo,tagName:'v1',name:'Release',publishedAt:date(-1)}];
 const author={id:'alice',name:'Alice',image:null};
 const feature=(id,workspaceId)=>({id,title:id,description:id,status:'PENDING',projectId:target.id,project:target,workspaceId,workspace:projects.find(x=>x.id===workspaceId)?.workspace||null,createdAt:now,author,votes:[{value:1},{value:-1},{value:1}],_count:{comments:2}});
 const features=[feature('project-only',null),feature('same-workspace',target.workspaceId),feature('wrong-workspace','own')];
 const note=(id,overrides={})=>({id,title:id,content:id,scope:'PROJECT',projectId:target.id,project:target,workspaceId:null,workspace:null,authorId:'alice',author,isEncrypted:false,isRestricted:false,expiresAt:null,sharedWith:[],type:'NOTE',isFavorite:false,createdAt:now,updatedAt:now,tags:[],comments:[],...overrides});
 const notes=[note('project-only'),note('project-explicit',{workspaceId:target.workspaceId,workspace:target.workspace}),note('workspace',{scope:'WORKSPACE',workspaceId:target.workspaceId,workspace:target.workspace,projectId:null,project:null}),note('workspace-sibling',{scope:'WORKSPACE',workspaceId:target.workspaceId,workspace:target.workspace,projectId:sibling.id,project:sibling}),note('wrong-workspace',{workspaceId:'own',workspace:projects[0].workspace}),note('wrong-project-workspace',{scope:'WORKSPACE',workspaceId:target.workspaceId,workspace:target.workspace,projectId:foreign.id,project:foreign}),note('restricted',{authorId:'bob',isRestricted:true}),note('expired',{authorId:'bob',expiresAt:date(-1)})];
 function revoke(){target.workspace.ownerId='bob';target.workspace.members=[{userId:'alice',status:false}];}
 const runs=options.costs ? [
  { usage:{estimatedUSD:17.25}, workspaceId:target.workspaceId, issue:issues[0], state:'finished', seatId:'seat', seat:{workspaceId:target.workspaceId} },
  { usage:{estimatedUSD:400}, workspaceId:target.workspaceId, issue:hidden, state:'finished', seatId:'seat', seat:{workspaceId:target.workspaceId} },
  { usage:{estimatedUSD:900}, workspaceId:target.workspaceId, issue:issues[0], state:'finished', seatId:null, seat:null },
 ].map((run, index) => ({ ...run, id: 'run-' + index, workspace: target.workspace, userId: index === 2 ? actor.id : agent.id, user: index === 2 ? actor : agent, startedAt: date(-4), endedAt: new Date(date(-4).getTime()+7_200_000) })) : [];
 if (options.paged) {
  const [run] = runs;
  for (let i=0;i<520;i++) runs.push({ ...run, id: `paged-run-${i}`, usage: { estimatedUSD: 1 } });
 }
 const boundedQuery = (rows, args) => {
  if (options.paged) assert.ok(args.take > 0 && args.take <= 500, 'fixture database rejects oversized reads');
  return query(rows, args);
 };
 const logsForBurn = options.burn ? [
  {id:'log',user:actor,timeSpent:90,issue:issues[0],workspaceId:target.workspaceId},
  {id:'seat-log',user:agent,timeSpent:600,issue:issues[0],workspaceId:target.workspaceId},
  {id:'foreign-log',user:actor,timeSpent:600,issue:hidden,workspaceId:target.workspaceId},
 ] : [];
 const db={agentSeat:{findMany:async args=>boundedQuery([seat],args)},workLog:{findMany:async args=>boundedQuery(logsForBurn,args)},projectBaseline:{findFirst:async()=>null},agentRun:{count:async args=>query(runs,args).length,findMany:async args=>{
   const selected = boundedQuery(runs,args);
   if (options.revokeBillingDuringRunRead && args.select?.usage) {
    target.workspace.members.find(m => m.userId === actor.id).role = 'MEMBER';
   }
   return selected;
  }},
 workspace:{findFirst:async args=>query(spaces,args)[0]??null},
 issueActivity:{findMany:async args=>boundedQuery(activity,args)},user:{findUnique:async()=>options.deleted?null:actor},project:{findUnique:async({where,...shape})=>project(projects.find(p=>matches(p,where)),shape)||null,findFirst:async({where,...shape})=>{const value=project(projects.find(p=>matches(p,where)),shape)||null;if(value&&options.revokeLookup)revoke();return value;}},workspaceMember:{findFirst:async({where})=>{const p=projects.find(x=>x.workspaceId===where.workspaceId);const userId=options.staleEmail?'bob':'alice';return p?.workspace.members.find(m=>m.userId===userId&&m.status)|| (userId==='bob'&&p?.id==='foreign'?{userId:'bob',status:true}:null);}},projectStatus:{findMany:async args=>{reads.push('statuses');return query(statuses,args);}},issue:{
 findMany:async args=>{reads.push('issues');return args.select?.milestoneId ? boundedQuery(issues,args) : query(issues,args);},count:async args=>{reads.push('count');return query(issues,args).length;},groupBy:async args=>{reads.push('group');if(options.dbError)throw new Error('private-database-detail');const groups={};for(const x of query(issues,args))groups[x.statusId]=(groups[x.statusId]||0)+1;return Object.entries(groups).map(([statusId,id])=>({statusId,_count:{id}}));}},
 repository:{findFirst:async args=>{reads.push('repository');const value=query(options.noRepository?[]:[repo],args)[0]||null;if(value&&options.revokeRepository)revoke();return value;}},
 gitConnection:{findMany:async args=>{reads.push('gitConnections');return query(connections,args);}},
 commit:{findMany:async args=>query(commits,args)},pullRequest:{findMany:async args=>query(pulls,args)},release:{findMany:async args=>query(releases,args)},featureRequest:{findMany:async args=>query(features,args)},note:{findMany:async args=>query(notes,args)}};
 const deps={'@/lib/prisma':{prisma:db},'@/lib/auth':{authConfig:{}},'@/lib/auth-options':{authOptions:{}},'next-auth/next':{getServerSession:async()=>options.absent?null:{user:{id:'alice',email:options.staleEmail?'bob@example.test':actor.email}}},'@/lib/request-session':{getServerSession:async()=>options.absent?null:{user:{id:'alice',email:options.staleEmail?'bob@example.test':actor.email}}},'@/lib/post-access':load('src/lib/post-access.ts'),'next/server':{NextResponse:{json:(body,init={})=>({body,status:init.status||200,headers:new Headers(init.headers)})}}};
 const globals={Error,console:{error:(...args)=>logs.push(args)}};deps['@/lib/session']=load('src/lib/session.ts',deps,globals);deps['@/lib/issue-finder']=load('src/lib/issue-finder.ts',deps,globals);deps['@/lib/secrets/access']=load('src/lib/secrets/access.ts',deps,globals);
 deps['@/lib/github/version-access']=load('src/lib/github/version-access.ts',{...deps,'./access':load('src/lib/github/access.ts',deps)});
 deps['@/lib/project-burn']=load('src/lib/project-burn.ts');
 deps['@/lib/project-overview']=load('src/lib/project-overview.ts',deps,globals);
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


test('repository summary persists active GitHub, GitLab and Forgejo links across refresh',async()=>{
 const f=fixture({providers:true});
 for(let refresh=0;refresh<2;refresh++){
  const r=await f.call();assert.equal(r.status,200);
  assert.deepEqual(plain(r.body.repositories.connections.map(c=>c.name).sort()),['org/repo','team/forgejo','team/gitlab']);
  assert.equal(r.body.repositories.activities.length,5);
  assert.equal(JSON.stringify(r.body.repositories).includes('never-expose'),false);
  assert.equal(JSON.stringify(r.body.repositories).includes('secret/repo'),false);
  assert.equal(JSON.stringify(r.body.repositories).includes('old/repo'),false);
 }
});
test('provider-only projects are connected; inactive and absent repositories are not',async()=>{
 const providers=await fixture({providers:true,noRepository:true}).call();assert.equal(providers.body.repositories.connections.length,2);assert.equal(providers.body.github.connected,false);
 for(const options of [{noRepository:true},{inactiveRepository:true}]){const r=await fixture(options).call();assert.deepEqual(plain(r.body.repositories),{connections:[],activities:[]});}
});
test('provider summary rechecks access before returning persisted metadata or activity',async()=>{
 const r=await fixture({providers:true,noRepository:true,revokeLookup:true}).call();assert.equal(r.status,200);assert.deepEqual(plain(r.body.repositories),{connections:[],activities:[]});
});

test('overdue and at-risk totals include all 12 active issues while each preview shows 10', async () => {
 const result = await fixture({large:true}).call();
 assert.equal(result.status,200);
 assert.equal(result.body.stats.overdueCount,12);
 assert.equal(result.body.stats.atRiskCount,12);
 assert.equal(result.body.atRisk.overdue.length,10);
 assert.equal(result.body.atRisk.upcoming.length,10);
});

test('project overview returns scoped spend only to workspace owners and active administrators', async () => {
 for (const [options, expected] of [
  [{ target: 'own' }, 17.25], [{ role: 'ADMIN' }, 17.25], [{ role: 'MEMBER' }, undefined],
  [{ role: 'ADMIN', revokeLookup: true }, undefined],
  [{ role: 'ADMIN', revokeBillingDuringRunRead: true }, undefined],
 ]) {
  const result = await fixture({ costs: true, ...options }).call();
  assert.equal(result.status, 200);
  assert.equal(result.body.overview.agentSpendUsd, expected);
  assert.equal(Object.hasOwn(result.body.overview, 'agentSpendUsd'), expected !== undefined);
  assert.equal(result.body.burn.spendUsd, expected);
  assert.equal(result.body.burn.contributors.find(row => row.agent)?.spendUsd, expected);
  if (expected === undefined) assert.doesNotMatch(JSON.stringify(result.body.burn), /spendUsd|spendPerIssueUsd/);
  else assert.ok(result.body.burn.weeks.some(week => week.spendUsd === expected));
  assert.doesNotMatch(JSON.stringify(result.body), /estimatedUSD|chargedUSD/);
  if (options.revokeBillingDuringRunRead) assert.equal(result.body.burn.runCount, 1);
  if (expected === undefined) assert.doesNotMatch(JSON.stringify(result.body), /17\.25/);
 }
});

test('Overview attributes recorded closures to seats and reports the age of a blocked status', async () => {
 const result = await fixture({ overviewHistory: true }).call();
 assert.equal(result.status, 200);
 assert.equal(result.body.overview.closedByAgents, 1);
 assert.equal(result.body.overview.closedByAgentsPercent, 100);
 assert.equal(result.body.overview.blocked.find(issue => issue.id === 'blocked').blockedDays, 6);
});

test('pagination preserves Overview issue counts and the authorized spend total', async () => {
 const result = await fixture({ target:'own', costs:true, paged:true }).call();
 assert.equal(result.status, 200);
 assert.equal(result.body.overview.stats.open, 523);
 assert.equal(result.body.overview.unplanned.length, 523);
 assert.equal(result.body.overview.work.length, 524);
 assert.equal(result.body.overview.work.find(issue => issue.id === 'completed').done, true);
 assert.ok(result.body.overview.work.every(issue => issue.milestoneId === null));
 assert.equal(result.body.overview.runCount, 521);
 assert.equal(result.body.overview.agentSpendUsd, 537.25);
});

test('Project Home counts legacy finishes in Overview, Burn and Plan and maps Work to configured statuses', async () => {
 const result = await fixture({ legacyStatuses: true }).call();
 assert.equal(result.status, 200);
 const { overview, burn } = result.body;
 assert.equal(overview.stats.done, 3);
 assert.equal(overview.stats.open, 8);
 assert.equal(overview.stats.donePercent, 27);
 assert.equal(overview.unplanned.length, 7);
 assert.equal(overview.pacePerWeek, 1 / 3);
 assert.equal(overview.milestones[0].completed, 1);
 const plan = overview.plan.milestones[0];
 assert.equal(plan.completed, 1);
 assert.equal(plan.forecast, plan.start + 21);
 assert.equal(burn.remaining, 8);
 assert.equal(burn.forecast.remaining, 8);
 assert.equal(burn.points.at(-1).closed, 3);

 const work = new Map(overview.work.map(row => [row.id, row]));
 for (const [id, statusId, status, done] of [
  ['legacy-done', 'done', 'Done', true],
  ['legacy-completed', 'done', 'Done', true],
  ['legacy-to-do', 'todo', 'To Do', false],
  ['legacy-status-value', 'todo', 'To Do', false],
  ['legacy-deprecated', 'retired', 'Deprecated', false],
  ['legacy-empty', null, 'No status', false],
  ['legacy-unknown', null, 'previous workflow', false],
  ['overdue', 'todo', 'To Do', false],
 ]) {
  const row = work.get(id);
  assert.deepEqual([row.statusId, row.status, row.done], [statusId, status, done], id);
 }
});

test('Burn attributes the finish transition and recorded merge actor independently of assignment', async () => {
 const result = await fixture({ overviewHistory: true, burn: true, costs: true }).call();
 assert.equal(result.status, 200);
 const { burn } = result.body;
 assert.deepEqual(plain(burn.closures), { agents: 1, people: 1, unmatched: 0 });
 const weekOf = at => burn.weeks.find(entry => entry.day <= Math.floor(at / 86400000) && Math.floor(at / 86400000) < entry.day + 7);
 const week = weekOf(Date.now() - 3_600_000);
 assert.deepEqual(plain(week.issues), { agents: 1, people: 1, unmatched: 0 });
 assert.deepEqual(plain(week.prs), { agents: 1, people: 1, unmatched: 2 });
 assert.deepEqual(plain(burn.prCounts), plain(week.prs));
 assert.equal(burn.runCount, 1);
 assert.equal(burn.runHours, 2);
 assert.equal(burn.peopleCount, 2);
 assert.equal(burn.peopleLogged, 1);
 assert.equal(burn.humanHours, 1.5);
 assert.equal(burn.contributors.find(row => row.name === 'Unlogged person').hoursLogged, 0);
 assert.doesNotMatch(JSON.stringify(burn), /External merger/);
});

test('Overview counts seats in its workspace while Burn classifies the account that closed the issue', async () => {
 const result = await fixture({ overviewHistory: true, crossWorkspaceSeat: true }).call();
 assert.equal(result.status, 200);
 assert.equal(result.body.overview.closedByAgents, 0);
 assert.equal(result.body.burn.closures.agents, 1);
 assert.doesNotMatch(JSON.stringify(result.body.burn), /Private seat name/);
});

test('Burn keeps the week and pace of a closure that was later reopened', async () => {
 const result = await fixture({ overviewHistory: true, burn: true, reopen: true }).call();
 assert.equal(result.status, 200);
 const { burn } = result.body;
 const today = Math.floor(Date.now() / 86400000);
 const total = burn.weeks.reduce((sum, entry) => sum + entry.issues.agents + entry.issues.people + entry.issues.unmatched, 0);
 // Two current finishes, the closure before the earlier reopen, and the reopened issue's closure.
 assert.equal(total, 4);
 const week = burn.weeks.find(entry => entry.day <= today - 9 && today - 9 < entry.day + 7);
 assert.ok(week.issues.agents >= 1);
 const closedOn = day => burn.points.filter(point => point.day <= day).at(-1).closed;
 assert.equal(closedOn(today - 9) - closedOn(today - 10), 1);
 assert.equal(closedOn(today - 2) - closedOn(today - 3), -1);
 assert.equal(burn.points.at(-1).closed, 2);
 assert.equal(burn.historyLimited, false);
 assert.ok(burn.forecast.remaining >= 1);
});

test('Burn counts both rapid closures and attributes the current finish to the actor after the reopen', async () => {
 const result = await fixture({ overviewHistory: true, burn: true, reopen: true, rapidReopen: true }).call();
 assert.equal(result.status, 200);
 const { burn, overview } = result.body;
 const seatClosures = burn.weeks.reduce((sum, week) => sum + week.issues.agents, 0);
 assert.equal(seatClosures, 3);
 assert.deepEqual(plain(burn.recentClosures), { agents: 3, people: 1, unmatched: 0 });
 assert.deepEqual(plain(burn.closures), { agents: 1, people: 1, unmatched: 0 });
 assert.equal(overview.closedByAgents, 1);
 assert.equal(burn.historyLimited, false);
 assert.equal(burn.points.at(-1).closed, 2);
 assert.equal(burn.forecast.day, burn.today + Math.ceil(7 * burn.forecast.remaining / (4 / 3)));
});
