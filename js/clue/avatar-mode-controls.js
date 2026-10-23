import {avatarMode} from './avatar-policy.js';
export function setAvatarModeButtons(group,value='humans',disabled=false,onChange=null){
 const selected=avatarMode(value),buttons=[...group.querySelectorAll('button[data-avatar-mode]')];
 group.dataset.value=selected;
 group.title=disabled?'Only the host can change avatar appearance.':'Appearance only. AI still fills empty seats.';
 for(const button of buttons){
  const checked=button.dataset.avatarMode===selected;
  button.disabled=disabled;button.classList.toggle('is-selected',checked);
  button.setAttribute('aria-checked',String(checked));button.tabIndex=checked?0:-1;
  button.onclick=()=>{if(button.disabled)return;setAvatarModeButtons(group,button.dataset.avatarMode,false,onChange);onChange?.(button.dataset.avatarMode);};
 }
 group.onkeydown=event=>{
  if(!disabled&&['Enter',' '].includes(event.key)){event.stopPropagation();return;}
  if(disabled||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
  event.preventDefault();event.stopPropagation();
  const current=buttons.findIndex(b=>b===document.activeElement),index=current<0?buttons.findIndex(b=>b.dataset.avatarMode===group.dataset.value):current;
  const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(['ArrowLeft','ArrowUp'].includes(event.key)?-1:1)+buttons.length)%buttons.length;
  buttons[next].click();buttons[next].focus();
 };
}
