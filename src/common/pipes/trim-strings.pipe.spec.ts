import { TrimStringsPipe } from './trim-strings.pipe.js';

describe('TrimStringsPipe', () => {
  const pipe = new TrimStringsPipe();

  it('trims strings and converts whitespace-only values to undefined', () => {
    expect(pipe.transform({ name: '  PCC  ', empty: '   ' }, { type: 'body', metatype: Object, data: undefined })).toEqual({ name: 'PCC', empty: undefined });
  });

  it('does not transform non-request values', () => {
    const value = { name: '  PCC  ' };
    expect(pipe.transform(value, { type: 'custom', metatype: Object, data: undefined })).toBe(value);
  });
});
