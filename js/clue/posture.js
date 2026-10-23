// One stance policy and speed rule for prediction, authority and rendering.
export const CROUCH_SPEED = 1.3; // Half the player's normal 2.6 m/s walk.
export const CROUCH_EYE = 1.17;
export function canCrouch(c, phase = 'day') {
  return phase === 'day' && !!c?.alive && !c.ko && !c.seat && !c.auto && !c.convo && !c.chat;
}
export function movementLimit(c) {
  return (!c.alive ? 3.4 : c.crouched ? CROUCH_SPEED : 4.4) * (c.dragging || c.dragKO ? 0.5 : 1);
}
