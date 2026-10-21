import { describe, expect, it } from 'vitest';
import { TOY } from '../src/look';

describe('the look', () => {
  it('asks for FXAA, not multisampling: the frame is a fifth to a third cheaper for edges it softens only a touch', () => {
    expect(TOY.antialias).toBe('fxaa');
  });
});
