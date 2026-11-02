import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCoverBrief } from './cover-brief.js';
import { sendImageDocument } from './telegram.js';
test('brand corrections use conversation context and never ask for music metadata',async()=>{
  const native=fetch;let body;
  globalThis.fetch=async(url,opts)=>{body=JSON.parse(opts.body);return Response.json({choices:[{message:{content:JSON.stringify({kind:'brand_design',relevant:true,visualPrompt:'Black background with the original Phaedra logo, thank the community in English',lettering:'Thank you for your support',background:'opaque'})}}]});};
  try{
    const history=[{role:'user',content:'Portada fondo negro, texto en inglés dando gracias por el support'}];
    const result=await resolveCoverBrief('Es para @phaedrasound, no es un artista, es un DAW',{artist:null,title:null,label:null,graphics:null,pending:true},{history,hasReference:true});
    assert.equal(result.text,undefined);assert.equal(result.kind,'brand_design');assert.equal(result.background,'opaque');
    assert.match(result.prompt,/Thank you for your support/);assert.doesNotMatch(result.prompt,/Artist:|Label:|Title:/);
    assert.deepEqual(JSON.parse(body.messages[1].content).conversation,history);
  }finally{globalThis.fetch=native;}
});
test('background removal is a complete edit and PNG is delivered as a document',async()=>{
  const native=fetch;let sent;
  globalThis.fetch=async(url,opts)=>{
    if(url.endsWith('/chat/completions'))return Response.json({choices:[{message:{content:JSON.stringify({kind:'photo_edit',relevant:true,visualPrompt:'Remove only the background of the original logo',background:'transparent',lettering:''})}}]});
    assert.ok(url.endsWith('/sendDocument'));sent=opts.body;return Response.json({ok:true,result:{document:{file_id:'transparent-file'}}});
  };
  try{
    const result=await resolveCoverBrief('quítale fondo',null,{hasReference:true});
    assert.equal(result.text,undefined);assert.equal(result.background,'transparent');assert.equal(result.kind,'photo_edit');
    await sendImageDocument(1,Buffer.from('original-png-bytes'),'Edición lista');
    assert.equal(sent.get('document').type,'image/png');assert.equal(await sent.get('document').text(),'original-png-bytes');
    const missing=await resolveCoverBrief('quítale fondo',null,{hasReference:false});assert.match(missing.text,/imagen original/);
  }finally{globalThis.fetch=native;}
});
test('a complete music brief proceeds without asking the user to retype the prompt',async()=>{
  const native=fetch;
  globalThis.fetch=async()=>Response.json({choices:[{message:{content:JSON.stringify({kind:'music_cover',artist:'Luna',title:'Neon Rain',label:'',graphics:'',visualPrompt:'Cabina violeta con lluvia'})}}]});
  try{
    const result=await resolveCoverBrief('Luna, Neon Rain, sin sello ni extras, cabina violeta con lluvia',{pending:true});
    assert.equal(result.text,undefined);assert.match(result.prompt,/Cabina violeta/);assert.match(result.prompt,/Artist: Luna/);
  }finally{globalThis.fetch=native;}
});
