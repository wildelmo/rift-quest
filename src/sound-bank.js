// Authored PCM voices: FM plasma, resonant metal, mechanical transients and low-frequency pressure.
// Buffers are generated once, so rapid fire costs one source voice rather than a chain of oscillators.
export function makeBank(ctx){
  const bank={},sr=ctx.sampleRate;
  const recipes={
    pulse:{length:.16,base:780,end:130,fm:3.7,mod:2.3,noise:.15,body:95,decay:34},
    spread:{length:.24,base:340,end:78,fm:5.2,mod:1.7,noise:.42,body:75,decay:20},
    lance:{length:.32,base:1650,end:170,fm:6.1,mod:.51,noise:.21,body:115,decay:15},
    impact:{length:.13,base:1280,end:610,fm:2.1,mod:2.77,noise:.7,body:165,decay:37},
    explosion:{length:1.1,base:84,end:27,fm:1.6,mod:3.21,noise:.65,body:50,decay:5},
    collapse:{length:3.6,base:54,end:19,fm:2.6,mod:1.21,noise:.9,body:35,decay:1.9},
    charge:{length:.9,base:900,end:65,fm:7.2,mod:.73,noise:.3,body:55,decay:6}
  };
  let seed=137;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296*2-1;};
  for(const [name,r]of Object.entries(recipes)){
    const buffer=ctx.createBuffer(2,Math.ceil(sr*r.length),sr);
    for(let ch=0;ch<2;ch++){
      const out=buffer.getChannelData(ch);let phase=0,low=0,rumble=0,peak=0;
      for(let i=0;i<out.length;i++){
        const t=i/sr,f=r.end+(r.base-r.end)*Math.exp(-t*14),env=(1-Math.exp(-t*1800))*Math.exp(-t*r.decay),n=random();
        phase+=Math.PI*2*f/sr;low+=.14*(n-low);rumble+=.012*(n-rumble);
        const plasma=Math.sin(phase+Math.sin(phase*r.mod)*r.fm*Math.exp(-t*12));
        const pressure=Math.sin(Math.PI*2*(r.body*t-16*t*t))*Math.exp(-t*(name==='collapse'?1.5:7));
        const metal=(Math.sin(t*3511)+Math.sin(t*5293)+Math.sin(t*7237))*.06*Math.exp(-t*40);
        const tail=(low*.7+rumble*2)*r.noise*Math.exp(-t*(name==='collapse'?1.5:5));
        out[i]=(plasma*.37+n*r.noise*.34+metal)*env+pressure*.31*(1-Math.exp(-t*140))+tail*.24;
        out[i]*=Math.min(1,(r.length-t)*60);peak=Math.max(peak,Math.abs(out[i]));
      }
      const gain=.86/Math.max(.86,peak);for(let i=0;i<out.length;i++)out[i]*=gain;
    }bank[name]=buffer;
  }
  return bank;
}
