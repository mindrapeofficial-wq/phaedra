import test from 'node:test';
import assert from 'node:assert/strict';
import { addUpload, saveUploads, scheduleUploadQuestion, wantsToSave, wantsToDiscard, wantsNewImage, answersFaceQuestion, isPhotoOnly } from './photo-uploads.js';

test('an album produces a single question counting every photo', async () => {
  const sent = [];
  const state = {};
  for (const id of ['a', 'b', 'c', 'a']) scheduleUploadQuestion('1:1', addUpload(state, id), text => sent.push(text), 10);
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(sent.length, 1);
  assert.match(sent[0], /3 fotos/);
  assert.doesNotMatch(sent[0], /¿Eres tú/);
});

test('saving moves photos to the library without duplicates', () => {
  const state = { library: ['a'], pendingUploads: ['a', 'b'], profile: { name: 'x' } };
  assert.equal(saveUploads(state), 2);
  assert.deepEqual(state.library, ['a', 'b']);
  assert.deepEqual(state.pendingUploads, []);
  assert.equal(state.profile.savedPhotos, 2);
  assert.equal(state.profile.name, 'x');
});

test('the wording from the real conversation is understood', () => {
  assert.equal(wantsToSave('solo quiero que guardes estas imagenes para publicaciones futuras'), true);
  assert.equal(wantsToSave('no las guardes'), false);
  assert.equal(wantsToDiscard('no las guardes'), true);
  assert.equal(answersFaceQuestion('solo quiero gestionar nyobe'), false);
  assert.equal(answersFaceQuestion('soy yo'), true);
  assert.equal(answersFaceQuestion('sí, fotorrealista'), true);
  assert.equal(wantsNewImage('haz la portada'), true);
  assert.equal(wantsNewImage('¿cuál funciona mejor en Instagram?'), false);
});

test('only captionless images count as uploads without instructions', () => {
  assert.equal(isPhotoOnly({ photo: [{}] }), true);
  assert.equal(isPhotoOnly({ photo: [{}], caption: 'portada' }), false);
  assert.equal(isPhotoOnly({ text: 'hola' }), false);
});
