import { normalizeTeamName } from './team-ui.js?v=0.27.7';
// Local-only classroom simulation. It never calls Supabase or changes students.
export const DEMO_STUDENT = Object.freeze({
  id:'zombieadmin-demo',
  name:'Jair Valdés',
  email:'jair.demo@ejemplo.com',
  phone:'6000-0011'
});
const sampleMessage = (text, minutes=0) => ({
  id:'sample-'+minutes, senderId:'sample-peer', name:'Compañero de ejemplo',
  body:text, mine:false, createdAt:new Date(Date.now()-minutes*60000).toISOString()
});
export function createDemoExperience() {
  let chosenId=null, sharing=false, counter=0;
  const messages=new Map(), files=new Map(), names=new Map();
  const nameOf=topic=>names.get(topic.id) ?? topic.name;
  const getMessages=topicId=>{
    if(!messages.has(topicId))messages.set(topicId,[
      sampleMessage('¡Hola! ¿Cómo nos organizaremos para realizar la actividad?',10),
      sampleMessage('Podemos repartir las tareas y revisar los avances aquí.',8)
    ]);
    return messages.get(topicId);
  };
  return {
    get chosenId(){return chosenId;},
    get sharing(){return sharing;},
    nameOf,
    rename(topic,name,expectedName,topics=[]) {
      if(topic.id!==chosenId)throw new Error('Solo puedes cambiar el nombre de tu equipo.');
      const value=normalizeTeamName(name);
      if(nameOf(topic)!==expectedName)throw new Error('El nombre cambió. Cancela y vuelve a abrir el lápiz.');
      if(topics.some(other=>other.id!==topic.id && nameOf(other).toLocaleLowerCase()===value.toLocaleLowerCase()))
        throw new Error('Ya existe un equipo con ese nombre. Elige otro.');
      names.set(topic.id,value);return value;
    },
    choose(topic) {
      if(chosenId)return false;
      if(!topic || topic.locked || topic.members.length>=topic.capacity)return false;
      chosenId=topic.id;
      getMessages(chosenId);
      return true;
    },
    share(value) { sharing=!!value; },
    members(topic) {
      return [...topic.members,...(topic.id===chosenId?[{
        ...DEMO_STUDENT, mine:true, sharing, virtual:true
      }]:[])];
    },
    messages(topicId) {return [...getMessages(topicId)];},
    send(topicId,body='',file=null,info=null) {
      if(topicId!==chosenId || (!body.trim()&&!file))return false;
      const id='demo-'+(++counter);
      const entry={id,name:DEMO_STUDENT.name,senderId:DEMO_STUDENT.id,
        body:body.trim().slice(0,500),mine:true,createdAt:new Date().toISOString()};
      if(file&&info) {
        const key='local:'+id;
        files.set(key,file);
        entry.attachment={path:key,name:info.name,size:info.size,type:info.type};
      }
      getMessages(topicId).push(entry);
      return true;
    },
    receive(topicId,body='¿Viste el mensaje que llegó al equipo?') {
      if(topicId!==chosenId)return false;
      const entry={id:'demo-incoming-'+(++counter),
        name:'Compañero de ejemplo',senderId:'sample-peer',
        body:body.trim().slice(0,500),mine:false,createdAt:new Date().toISOString()};
      getMessages(topicId).push(entry);
      return true;
    },
    file(path){return files.get(path)||null;},
    reset() {chosenId=null;sharing=false;counter=0;messages.clear();files.clear();names.clear();}
  };
}
