// Local-only renderer of the real Apps Script cards using synthetic Calendar data.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const now = Date.parse('2026-10-30T15:00:00Z'); // 10:00 America/Chicago
const initial = [
  { title: 'Review the project outline', start: '2026-10-30T15:30:00Z', end: '2026-10-30T16:00:00Z', description: 'Tag: Study\nPriority: High\nFlexibility: No' },
  { title: 'Team planning session', start: '2026-10-30T18:00:00Z', end: '2026-10-30T19:00:00Z', description: 'Tag: Work\nPriority: Medium\nFlexibility: No' },
  { title: 'Read a chapter', start: '2026-10-30T20:00:00Z', end: '2026-10-30T20:30:00Z', description: 'Tag: Reading\nPriority: Low\nFlexibility: Yes' },
];
let events = structuredClone(initial);
function parts(date, zone) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'short' }).formatToParts(date).map(p => [p.type, p.value]));
}
function formatDate(date, zone, pattern) {
  const p = parts(date, zone), day = `${p.year}-${p.month}-${p.day}`, time = `${p.hour}:${p.minute}`;
  if (pattern === 'yyyy-MM-dd') return day;
  if (pattern === 'HH:mm z') return `${time} ${p.timeZoneName}`;
  if (pattern === 'yyyy-MM-dd HH:mm z') return `${day} ${time} ${p.timeZoneName}`;
  throw Error('Unsupported date format');
}
function parseDate(text, zone) {
  const wall = Date.parse(text.replace(' ', 'T') + 'Z'); let instant = wall;
  for (let i = 0; i < 4; i++) {
    const p = parts(new Date(instant), zone);
    instant += wall - Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);
  }
  return new Date(instant);
}
function builder(type) {
  const data = { type, items: [], widgets: [], sections: [] };
  const methods = {
    build: () => data,
    addWidget: w => { data.widgets.push(w.data); return proxy; },
    addSection: s => { data.sections.push(s.data); return proxy; },
    addItem: (label, value, selected) => { data.items.push({label,value,selected}); return proxy; },
  };
  const proxy = new Proxy({data}, {get(target,key){
    if (key === 'data') return data;
    if (methods[key]) return methods[key];
    if (/^(set|push|update)/.test(key)) return value => {
      data[key] = value?.data || value; return proxy;
    };
    throw Error(`Unsupported CardService method: ${key}`);
  }});
  return proxy;
}
function run(action, form) {
  class FixedDate extends Date { constructor(...args){super(...(args.length?args:[now]));} static now(){return now;} }
  const calendar = {getTimeZone:()=> 'America/Chicago',getEvents:(from,to)=>events.filter(e=>Date.parse(e.start)<to && Date.parse(e.end)>from).map(e=>({getStartTime:()=>new Date(e.start),getEndTime:()=>new Date(e.end),getDescription:()=>e.description,getTitle:()=>e.title}))};
  const ctx = vm.createContext({Date:FixedDate,CalendarApp:{getDefaultCalendar:()=>calendar},Utilities:{formatDate,parseDate},CardService:new Proxy({TextButtonStyle:{FILLED:'FILLED'},SelectionInputType:{DROPDOWN:'DROPDOWN'}},{get(target,key){return target[key]||(()=>builder(key));}}),Calendar:{Events:{insert:(e)=>events.push({title:e.summary,start:e.start.dateTime,end:e.end.dateTime,description:e.description})}}});
  for(const file of ['Code.gs','smartbreaker.gs'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx,{filename:file});
  const allowed = new Set(['onHomepage','showAddTaskForm','submitAddTask','showSmartBreaksCard']);
  if(!allowed.has(action))throw Error('Unknown demo action');
  let input={};
  if(form){const fields={};for(const [key,value] of Object.entries(form))fields[key]=key==='startTime'?{dateTimeInput:{msSinceEpoch:String(parseDate(value+':00','America/Chicago').getTime()),hasDate:true,hasTime:true}}:{stringInputs:{value:[String(value)]}};input={commonEventObject:{formInputs:fields}};}
  const result=ctx[action](input);
  return {result,events:events.map(e=>({...e,startLabel:formatDate(new Date(e.start),'America/Chicago','HH:mm z'),endLabel:formatDate(new Date(e.end),'America/Chicago','HH:mm z')}))};
}
const server = http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  try{
    if(req.method==='GET' && url.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(fs.readFileSync(path.join(__dirname,'index.html')));}
    if(req.method==='POST' && url.pathname==='/demo'){
      if(req.headers.origin && !['http://127.0.0.1:4179','http://localhost:4179'].includes(req.headers.origin)){res.writeHead(403);return res.end();}
      let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>10000)throw Error('Payload too large');}
      const body=JSON.parse(raw);if(body.action==='reset'){events=structuredClone(initial);body.action='onHomepage';}
      const data=run(body.action,body.form);res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(data));
    }
    res.writeHead(404);res.end('Not found');
  }catch(error){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:error.message}));}
});
server.listen(4179,'127.0.0.1',()=>console.log('Source demo: http://127.0.0.1:4179 (synthetic data only)'));
