import { makeBank } from './sound-bank.js';
// Layered procedural effects and an adaptive industrial soundtrack; no audio downloads.
export class Sound {
  constructor(){this.enabled=true;this.volume=1;this.musicVolume=1;this.desiredRunning=false;this.revision=0;this.sources=new Set();this.step=0;this.nextBeat=0;this.lastShot=0;this.lastImpact=0;this.lastEnemy=0;this.lastVector=0;this.voices=0;this.sampleVoices=[];}
  async start(){
    this.desiredRunning=true;const revision=this.revision;
    if(this.closing)await this.closing;
    if(revision!==this.revision||!this.desiredRunning)return;
    if(!this.ctx){
      this.ctx=new(window.AudioContext||window.webkitAudioContext)();const c=this.ctx;
      this.master=c.createGain();this.master.gain.value=this.enabled?.48*this.volume:0;
      this.compressor=c.createDynamicsCompressor();this.compressor.threshold.value=-16;this.compressor.knee.value=12;this.compressor.ratio.value=5;this.compressor.attack.value=.003;this.compressor.release.value=.18;
      this.master.connect(this.compressor).connect(c.destination);this.sfx=c.createGain();this.sfx.gain.value=.9;this.sfx.connect(this.master);this.music=c.createGain();this.music.gain.value=.66;this.music.connect(this.master);this.bus=this.sfx;this.bank=makeBank(c);
      this.reverb=c.createConvolver();const impulse=c.createBuffer(2,c.sampleRate*1.4,c.sampleRate);for(let ch=0;ch<2;ch++){const data=impulse.getChannelData(ch);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*Math.pow(1-i/data.length,3)*.32;}this.reverb.buffer=impulse;
      this.musicReverb=c.createConvolver();this.musicReverb.buffer=impulse;this.musicWet=c.createGain();this.musicWet.gain.value=.13/.66;this.musicReverb.connect(this.musicWet).connect(this.music);
      this.wet=c.createGain();this.wet.gain.value=.13;this.reverb.connect(this.wet).connect(this.master);
      this.noiseBuffer=c.createBuffer(1,c.sampleRate*2,c.sampleRate);const n=this.noiseBuffer.getChannelData(0);for(let i=0;i<n.length;i++)n[i]=Math.random()*2-1;
      this.chargeOsc=c.createOscillator();this.chargeOsc.type='sawtooth';this.chargeFilter=c.createBiquadFilter();this.chargeFilter.type='lowpass';this.chargeGain=c.createGain();this.chargeGain.gain.value=0;this.chargeOsc.connect(this.chargeFilter).connect(this.chargeGain).connect(this.sfx);this.sources.add(this.chargeOsc);this.chargeOsc.start();
    }
    const c=this.ctx;
    await c.resume();
    if(c!==this.ctx||!this.desiredRunning){if(c.state==='running')await c.suspend();return;}
    this.nextBeat=c.currentTime;
    this.setVolume(this.volume,this.musicVolume);
  }
  setVolume(volume,musicVolume=this.musicVolume){
    this.volume=Math.max(0,Math.min(1,volume));this.musicVolume=Math.max(0,Math.min(1,musicVolume));
    if(this.ctx&&this.ctx.state!=='closed'){
      const t=this.ctx.currentTime;this.master.gain.cancelScheduledValues(t);
      this.master.gain.setValueAtTime(this.enabled&&this.desiredRunning?.48*this.volume:0,t);
      this.music.gain.setValueAtTime(.66*this.musicVolume,t);
    }
  }
  suspend(){
    this.desiredRunning=false;
    const c=this.ctx;if(!c||c.state==='closed')return Promise.resolve();
    this.master.gain.cancelScheduledValues(c.currentTime);this.master.gain.setValueAtTime(0,c.currentTime);
    return c.suspend().catch(()=>{});
  }
  dispose(){
    this.desiredRunning=false;this.revision++;
    const c=this.ctx;if(!c)return this.closing||Promise.resolve();
    this.master.gain.cancelScheduledValues(c.currentTime);this.master.gain.setValueAtTime(0,c.currentTime);
    for(const source of this.sources){try{source.stop();}catch{}source.onended=null;try{source.disconnect();}catch{}}
    this.sources.clear();this.sampleVoices=[];this.voices=0;
    for(const key of ['master','compressor','sfx','music','reverb','wet','musicReverb','musicWet','chargeOsc','chargeFilter','chargeGain']){try{this[key]?.disconnect();}catch{}this[key]=null;}
    this.ctx=null;this.bank=null;this.noiseBuffer=null;this.bus=null;this.step=0;this.nextBeat=0;this.lastShot=0;this.lastImpact=0;this.lastEnemy=0;
    const closing=c.state==='closed'?Promise.resolve():c.close();this.closing=closing;
    return closing.finally(()=>{if(this.closing===closing)this.closing=null;});
  }
  route(node,volume,duration,pan=0,wet=.15,delay=0){
    const c=this.ctx,t=c.currentTime+delay+(this.scheduleDelay||0),g=c.createGain(),p=c.createStereoPanner();p.pan.value=Math.max(-.85,Math.min(.85,pan));g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(volume,t+.004);g.gain.exponentialRampToValueAtTime(.0001,t+duration);node.connect(g).connect(p).connect(this.bus||this.sfx);
    const send=c.createGain();send.gain.value=wet;p.connect(send).connect(this.bus===this.music?this.musicReverb:this.reverb);
    return{t,cleanup:()=>{g.disconnect();p.disconnect();send.disconnect();}};
  }
  tone(freq,duration,type='sine',volume=.2,endFreq=freq,pan=0,cutoff=5000,delay=0){
    if(!this.ctx||!this.enabled||!this.desiredRunning||this.ctx.state!=='running'||this.voices>70)return;
    const c=this.ctx,osc=c.createOscillator(),filter=c.createBiquadFilter();filter.type='lowpass';filter.frequency.value=cutoff;filter.Q.value=.8;osc.type=type;osc.connect(filter);const route=this.route(filter,volume,duration,pan,.18,delay);osc.frequency.setValueAtTime(freq,route.t);osc.frequency.exponentialRampToValueAtTime(Math.max(20,endFreq),route.t+duration);this.sources.add(osc);osc.start(route.t);osc.stop(route.t+duration+.01);this.voices++;osc.onended=()=>{this.sources.delete(osc);this.voices--;osc.disconnect();filter.disconnect();route.cleanup();};
  }
  noise(duration,volume=.2,cutoff=1800,pan=0,type='lowpass',delay=0){
    if(!this.ctx||!this.enabled||!this.desiredRunning||this.ctx.state!=='running'||this.voices>70)return;
    const c=this.ctx,source=c.createBufferSource(),filter=c.createBiquadFilter();source.buffer=this.noiseBuffer;filter.type=type;filter.frequency.value=cutoff;filter.Q.value=.7;source.connect(filter);const route=this.route(filter,volume,duration,pan,.3,delay);this.sources.add(source);source.start(route.t,Math.random());source.stop(route.t+duration+.01);this.voices++;source.onended=()=>{this.sources.delete(source);this.voices--;source.disconnect();filter.disconnect();route.cleanup();};
  }
  reset(){for(const v of this.sampleVoices){v.gain.gain.setTargetAtTime(.0001,this.ctx.currentTime,.01);v.source.stop(this.ctx.currentTime+.05);}this.sampleVoices=[];this.step=0;this.duckUntil=0;if(this.ctx)this.nextBeat=this.ctx.currentTime;}
  sample(name,volume=.25,pan=0,rate=1){if(!this.ctx||!this.enabled||!this.desiredRunning||this.ctx.state!=='running')return;const c=this.ctx;const same=this.sampleVoices.filter(v=>v.name===name),limit=name==='explosion'?4:name==='collapse'?1:8;if(same.length>=limit){const old=same[0];old.gain.gain.setTargetAtTime(.0001,c.currentTime,.008);old.source.stop(c.currentTime+.04);this.sampleVoices=this.sampleVoices.filter(v=>v!==old);}const source=c.createBufferSource(),gain=c.createGain(),p=c.createStereoPanner();source.buffer=this.bank[name];source.playbackRate.value=rate;gain.gain.value=volume;p.pan.value=Math.max(-.8,Math.min(.8,pan));source.connect(gain).connect(p).connect(this.sfx);const voice={name,source,gain};this.sampleVoices.push(voice);this.sources.add(source);source.start();source.onended=()=>{this.sources.delete(source);this.sampleVoices=this.sampleVoices.filter(v=>v!==voice);source.disconnect();gain.disconnect();p.disconnect();};}
  event(e){
    if(!this.ctx||!this.enabled||!this.desiredRunning||this.ctx.state!=='running')return;this.bus=this.sfx;this.scheduleDelay=0;const t=this.ctx.currentTime,pan=(e.x||0)/9;
    if(e.type==='missile'){this.noise(.13,.05,2300,pan,'bandpass');this.tone(420,.12,'triangle',.04,155,pan,1800);}
    if(e.type==='vector'&&t-(this.lastVector||0)>.15){this.lastVector=t;this.tone(1100,.055,'triangle',.024,540,pan,2600);}
    if(e.type==='shoot'&&e.weapon==='RING'&&t-this.lastShot>.10){this.lastShot=t;this.tone(620,.22,'sine',.13,270,pan,3600);this.tone(930,.15,'triangle',.035,410,pan,2600);this.noise(.05,.035,4200,pan,'bandpass');}
    else if(e.type==='shoot'&&t-this.lastShot>.06){this.lastShot=t;this.sample(e.weapon==='LANCE'?'lance':e.weapon==='SPREAD'?'spread':'pulse',e.weapon==='LANCE'?.25:.19,pan,1+((e.level||1)-1)*.06);}
    if(e.type==='impact'&&t-this.lastImpact>.07){this.lastImpact=t;this.sample('impact',e.boss?.13:.18,pan,1+Math.random()*.15);}
    if(e.type==='enemyFire'&&t-this.lastEnemy>.22){this.lastEnemy=t;this.tone(e.heavy?85:260,.14,'sawtooth',.075,e.heavy?48:90,pan,1400);this.noise(.07,.055,1100,pan,'bandpass');}
    if(e.type==='armorHit'&&t-(this.lastArmor||0)>.09){this.lastArmor=t;this.noise(.045,.04,5500,pan,'highpass');this.tone(1800,.055,'triangle',.045,700,pan,4500);}
    if(e.type==='coreOpen'){this.noise(.55,.14,1200,pan,'bandpass');for(let i=0;i<3;i++)this.tone(330*Math.pow(1.5,i),.3,'triangle',.12,490,pan,3000,i*.11);}
    if(e.type==='partBreak'){this.sample('explosion',.32,pan,1.25);this.noise(.28,.15,2900,pan,'bandpass');this.tone(190,.28,'triangle',.12,45,pan,1600);}
    if(e.type==='kill'){this.sample(e.boss?'collapse':'explosion',e.boss?.8:.37,pan,.92+Math.random()*.16);if(e.boss)this.duckUntil=t+2;}
    if(e.type==='pickup'){for(let i=0;i<4;i++)this.tone([523,659,784,1047][i],.28,'sine',.14,[523,659,784,1047][i],0,4000,i*.06);}
    if(e.type==='graze'){this.noise(.06,.025,6000,pan,'highpass');}
    if(e.type==='hit'){this.noise(.5,.38,2000);this.tone(125,.5,'sawtooth',.20,35,0,1300);this.tone(55,.6,'sine',.5,25);}
    if(e.type==='laserWarning'){this.tone(140,1.5,'sawtooth',.14,850,pan,1600);this.tone(143,1.5,'sine',.12,870,pan,2200);for(let i=0;i<5;i++)this.noise(.055,.04+i*.02,4200,pan,'bandpass',i*.25);}
    if(e.type==='charge'||e.type==='laser'){this.sample('charge',.4,pan);this.duckUntil=t+.4;this.noise(.65,.35,3300,pan,'bandpass');this.tone(1600,.8,'sawtooth',.18,75,pan,3500);this.tone(60,.75,'sine',.5,24,pan);}
    if(e.type==='bomb'){this.sample('collapse',.6);this.duckUntil=t+1.8;this.noise(1.9,.55,2300);this.noise(.16,.48,6500,0,'highpass');this.tone(70,1.8,'sine',.7,22);this.tone(320,1.2,'sawtooth',.2,35,0,1800);}
    if(e.type==='end'){this.duckUntil=t+4;if(e.won)for(const [i,f]of [220,261.63,329.63,440,523.25,659.25].entries())this.tone(f,3.8,'sine',.08,f,Math.sin(i)*.4,2500,i*.12);}
    if(e.type==='act'){for(let i=0;i<3;i++)this.tone(110*Math.pow(1.5,i),1.5,'triangle',.12,110*Math.pow(1.5,i),0,1800,i*.15);}
    if(e.type==='boss'||e.type==='phase'){this.tone(41,2.4,'sawtooth',.25,36,0,600);this.tone(44,2.4,'sawtooth',.15,39,0,800);this.noise(1.3,.24,1100);for(let i=0;i<3;i++)this.tone(330,.18,'triangle',.14,300,0,1500,i*.3);}
  }
  update(active,phase=0,charge=0,act=1){
    if(!this.ctx)return;const c=this.ctx,t=c.currentTime;
    this.master.gain.setTargetAtTime(this.enabled&&this.desiredRunning?.48*this.volume:0,t,.02);
    this.chargeGain.gain.setTargetAtTime(active&&this.enabled&&charge>.1?.07*charge:0,t,.035);this.chargeOsc.frequency.setTargetAtTime(65+charge*240,t,.03);this.chargeFilter.frequency.setTargetAtTime(200+charge*1800,t,.03);
    this.music.gain.setTargetAtTime((t<(this.duckUntil||0)?.28:.66)*this.musicVolume,t,.12);this.bus=this.music;
    if(!active||!this.enabled||!this.desiredRunning){this.nextBeat=t;return;}if(t+.06<this.nextBeat)return;this.scheduleDelay=Math.max(0,this.nextBeat-t);
    this.nextBeat+=60/(phase?144:act===3?140:132)/4;if(this.nextBeat<t-.2)this.nextBeat=t;const beat=this.step%16,bar=Math.floor(this.step/16),root=[55,55,65.41,49,55,73.42,65.41,49][bar%8];
    if(beat%4===0){this.tone(135,.24,'sine',.5,32);this.noise(.028,.11,5500,0,'highpass');}
    if(beat===4||beat===12){this.noise(.18,.21,2200,0,'highpass');this.tone(180,.12,'triangle',.11,85);}
    if(beat%2===0||phase>=2)this.noise(beat===14?.13:.038,.055,7500,(beat%4?1:-1)*.22,'highpass');
    if([0,3,6,8,10,14].includes(beat)){this.tone(root*(beat===14?2:1),.16,'sawtooth',.14,root,0,phase?1200:650);this.tone(root*.5,.19,'sine',.18);}
    if(act>=2&&[1,6,9,14].includes(beat)){const melody=[1,1.5,1.2,2,1.5,1.333,1.2,1][bar%8];this.tone(root*8*melody,.42,'sine',.07,root*8*melody,Math.sin(bar)*.45,4500);this.tone(root*8*melody*1.003,.30,'triangle',.025,root*8*melody*1.003,-Math.sin(bar)*.45,2500);}
    if(beat%2===1){const interval=[1,1.5,2,2.5,1.5,3,2,1.5][Math.floor(beat/2)];this.tone(root*4*interval,.22,'triangle',.045+(phase?.018:0),root*4*interval,Math.sin(this.step)*.6,2600);}
    if(beat===0)for(const interval of [1,1.5,2.5])this.tone(root*interval,1.5,'sawtooth',.028,root*interval*.997,interval===1?-.4:.4,450);
    this.step++;this.scheduleDelay=0;
  }
}
