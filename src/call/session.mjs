import { randomUUID } from 'node:crypto';
import { TurnManager } from './turn-manager.mjs';

export class CallSession {
  constructor({direction='outgoing'}={}) {
    this.id=randomUUID();
    this.direction=direction;
    this.state='RINGING';
    this.createdAt=new Date().toISOString();
    this.events=[];
    this.turnManager=new TurnManager();
    this.generation=0;
    this.turnId=0;
  }
}
