import test from 'node:test';
import assert from 'node:assert/strict';
import cloudinaryLoader from './cloudinaryLoader';

test('leaves local /images/ paths unmodified', () => {
  const local = '/images/tee_black_classic_1795513062767.jpg';
  assert.equal(cloudinaryLoader({ src: local, width: 640 }), local);
});

test('injects responsive Cloudinary transformations for res.cloudinary.com assets', () => {
  const url = 'https://res.cloudinary.com/demo/image/upload/v1732000000/teestore/products/crest.jpg';
  const transformed = cloudinaryLoader({ src: url, width: 640, quality: 85 });
  assert.equal(
    transformed,
    'https://res.cloudinary.com/demo/image/upload/f_auto,q_85,c_limit,w_640/v1732000000/teestore/products/crest.jpg',
  );
});

test('does not duplicate transforms when URL is already transformed', () => {
  const url = 'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto/v1/tee.jpg';
  assert.equal(cloudinaryLoader({ src: url, width: 800 }), url);
});
