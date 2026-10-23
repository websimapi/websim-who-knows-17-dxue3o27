// Concern is character knowledge, never the hidden alive/role table.
export const AwarenessMethods={
 hasConcern(c){
  if(this.bodies.some(b=>b.found))return true;
  const notes=[...(this.notes.get(c.id)?.facts.values()||[])];
  return notes.some(f=>['body','kill','wound','personMissing'].includes(f.kind)&&!(c.isKiller&&f.src==='self'&&['body','kill','wound'].includes(f.kind))&&(f.kind!=='personMissing'||(c.lastContactSeen?.get(f.about)??-1)<f.reportAt));
 },
 checkMissingContacts(){
  if(this.time-(this.missingCheckedAt??-99)<5||this.overtime)return;this.missingCheckedAt=this.time;
  for(const c of this.living()){
   for(const [partner,formed]of c.expectedContacts||[]){
    const last=c.lastContactSeen?.get(partner)??formed;if(this.time-last<45)continue;
    this.learn(c.id,{kind:'personMissing',about:partner,day:this.day,reportAt:this.time,room:c.room},'self');
   }
  }
 }
};
