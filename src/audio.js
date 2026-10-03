// Layered procedural effects and an adaptive industrial soundtrack; no audio downloads.
export class Sound {
  constructor(){this.enabled=true;this.step=0;this.nextBeat=0;this.lastShot=0;this.lastImpact=0;this.lastEnemy=0;this.voices=0;}
  async start(){
    if(!this.ctx){
      this.ctx=new(window.AudioContext||window.webkitAudioContext)();const c=this.ctx;
      this.master=c.createGain();this.master.gain.value=.48;
      this.compressor=c.createDynamicsCompressor();this.compressor.threshold.value=-16;this.compressor.knee.value=12;this.compressor.ratio.value=5;this.compressor.attack.value=.003;this.compressor.release.value=.18;
      this.master.connect(this.compressor).connect(c.destination);
      this.reverb=c.createConvolver();const impulse=c.createBuffer(2,c.sampleRate*1.4,c.sampleRate);for(let ch=0;ch<2;ch++){const data=impulse.getChannelData(ch);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*Math.pow(1-i/data.length,3)*.32;}this.reverb.buffer=impulse;
      this.wet=c.createGain();this.wet.gain.value=.22;this.reverb.connect(this.wet).connect(this.master);
      this.noiseBuffer=c.createBuffer(1,c.sampleRate*2,c.sampleRate);const n=this.noiseBuffer.getChannelData(0);for(let i=0;i<n.length;i++)n[i]=Math.random()*2-1;
      this.chargeOsc=c.createOscillator();this.chargeOsc.type='sawtooth';this.chargeFilter=c.createBiquadFilter();this.chargeFilter.type='lowpass';this.chargeGain=c.createGain();this.chargeGain.gain.value=0;this.chargeOsc.connect(this.chargeFilter).connect(this.chargeGain).connect(this.master);this.chargeOsc.start();
    }
    await this.ctx.resume();this.nextBeat=this.ctx.currentTime;
  }
  route(node,volume,duration,pan=0,wet=.15,delay=0){
    const c=this.ctx,t=c.currentTime+delay,g=c.createGain(),p=c.createStereoPanner();p.pan.value=Math.max(-.85,Math.min(.85,pan));g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(volume,t+.004);g.gain.exponentialRampToValueAtTime(.0001,t+duration);node.connect(g).connect(p).connect(this.master);
    const send=c.createGain();send.gain.value=wet;p.connect(send).connect(this.reverb);
    return{t,cleanup:()=>{g.disconnect();p.disconnect();send.disconnect();}};
  }
  tone(freq,duration,type='sine',volume=.2,endFreq=freq,pan=0,cutoff=5000,delay=0){
    if(!this.ctx||!this.enabled||this.ctx.state!=='running'||this.voices>70)return;
    const c=this.ctx,osc=c.createOscillator(),filter=c.createBiquadFilter();filter.type='lowpass';filter.frequency.value=cutoff;filter.Q.value=.8;osc.type=type;osc.connect(filter);const route=this.route(filter,volume,duration,pan,.18,delay);osc.frequency.setValueAtTime(freq,route.t);osc.frequency.exponentialRampToValueAtTime(Math.max(20,endFreq),route.t+duration);osc.start(route.t);osc.stop(route.t+duration+.01);this.voices++;osc.onended=()=>{this.voices--;osc.disconnect();filter.disconnect();route.cleanup();};
  }
  noise(duration,volume=.2,cutoff=1800,pan=0,type='lowpass',delay=0){
    if(!this.ctx||!this.enabled||this.ctx.state!=='running'||this.voices>70)return;
    const c=this.ctx,source=c.createBufferSource(),filter=c.createBiquadFilter();source.buffer=this.noiseBuffer;filter.type=type;filter.frequency.value=cutoff;filter.Q.value=.7;source.connect(filter);const route=this.route(filter,volume,duration,pan,.3,delay);source.start(route.t,Math.random());source.stop(route.t+duration+.01);this.voices++;source.onended=()=>{this.voices--;source.disconnect();filter.disconnect();route.cleanup();};
  }
  event(e){
    if(!this.ctx||!this.enabled)return;const t=this.ctx.currentTime,pan=(e.x||0)/9;
    if(e.type==='shoot'&&t-this.lastShot>.065){this.lastShot=t;
      if(e.weapon==='LANCE'){this.tone(1700,.16,'sawtooth',.09,230,pan,3000);this.noise(.08,.10,4300,pan,'bandpass');this.tone(110,.10,'sine',.12,60,pan);}
      else if(e.weapon==='SPREAD'){this.noise(.10,.12,2800,pan,'bandpass');this.tone(350,.10,'triangle',.13,90,pan);this.tone(770,.09,'sine',.055,250,pan);}
      else{this.tone(1100,.085,'sawtooth',.065,350,pan,2400);this.noise(.045,.10,5000,pan,'highpass');this.tone(190,.06,'sine',.10,70,pan);}}
    if(e.type==='impact'&&t-this.lastImpact>.05){this.lastImpact=t;this.noise(.055,.10,3200,pan,'bandpass');this.tone(270,.08,'triangle',.065,110,pan);}
    if(e.type==='enemyFire'&&t-this.lastEnemy>.22){this.lastEnemy=t;this.tone(e.heavy?85:260,.14,'sawtooth',.075,e.heavy?48:90,pan,1400);this.noise(.07,.055,1100,pan,'bandpass');}
    if(e.type==='kill'){this.noise(e.boss?1.7:.48,e.boss?.6:.24,1400,pan);this.noise(.13,.28,4800,pan,'highpass');this.tone(e.boss?68:115,e.boss?1.6:.40,'sine',e.boss?.6:.35,23,pan);this.tone(210,.22,'triangle',.16,35,pan);}
    if(e.type==='pickup'){for(let i=0;i<4;i++)this.tone([523,659,784,1047][i],.28,'sine',.14,[523,659,784,1047][i],0,4000,i*.06);}
    if(e.type==='graze'){this.noise(.06,.025,6000,pan,'highpass');}
    if(e.type==='hit'){this.noise(.5,.38,2000);this.tone(125,.5,'sawtooth',.20,35,0,1300);this.tone(55,.6,'sine',.5,25);}
    if(e.type==='charge'||e.type==='laser'){this.noise(.65,.35,3300,pan,'bandpass');this.tone(1600,.8,'sawtooth',.18,75,pan,3500);this.tone(60,.75,'sine',.5,24,pan);}
    if(e.type==='bomb'){this.noise(1.9,.55,2300);this.noise(.16,.48,6500,0,'highpass');this.tone(70,1.8,'sine',.7,22);this.tone(320,1.2,'sawtooth',.2,35,0,1800);}
    if(e.type==='boss'||e.type==='phase'){this.tone(41,2.4,'sawtooth',.25,36,0,600);this.tone(44,2.4,'sawtooth',.15,39,0,800);this.noise(1.3,.24,1100);for(let i=0;i<3;i++)this.tone(330,.18,'triangle',.14,300,0,1500,i*.3);}
  }
  update(active,phase=0,charge=0){
    if(!this.ctx)return;const c=this.ctx,t=c.currentTime;
    this.master.gain.setTargetAtTime(this.enabled?.48:0,t,.02);
    this.chargeGain.gain.setTargetAtTime(active&&this.enabled&&charge>.1?.07*charge:0,t,.035);this.chargeOsc.frequency.setTargetAtTime(65+charge*240,t,.03);this.chargeFilter.frequency.setTargetAtTime(200+charge*1800,t,.03);
    if(!active||!this.enabled||t<this.nextBeat)return;
    this.nextBeat=t+60/(phase?144:132)/4;const beat=this.step%16,bar=Math.floor(this.step/16),root=[55,55,65.41,49,55,73.42,65.41,49][bar%8];
    if(beat%4===0){this.tone(135,.24,'sine',.5,32);this.noise(.028,.11,5500,0,'highpass');}
    if(beat===4||beat===12){this.noise(.18,.21,2200,0,'highpass');this.tone(180,.12,'triangle',.11,85);}
    if(beat%2===0||phase>=2)this.noise(beat===14?.13:.038,.055,7500,(beat%4?1:-1)*.22,'highpass');
    if([0,3,6,8,10,14].includes(beat)){this.tone(root*(beat===14?2:1),.16,'sawtooth',.14,root,0,phase?1200:650);this.tone(root*.5,.19,'sine',.18);}
    if(beat%2===1){const interval=[1,1.5,2,2.5,1.5,3,2,1.5][Math.floor(beat/2)];this.tone(root*4*interval,.22,'triangle',.045+(phase?.018:0),root*4*interval,Math.sin(this.step)*.6,2600);}
    if(beat===0)for(const interval of [1,1.5,2.5])this.tone(root*interval,1.5,'sawtooth',.028,root*interval*.997,interval===1?-.4:.4,450);
    this.step++;
  }
}
