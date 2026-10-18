import { describe, expect, it } from 'vitest';

import { validateNickname, validateRoomCode } from './contracts';
import { formatClock, formatScore } from './format';

describe('validateNickname', () => {
  it('2 karakterden kısa ad reddedilir', () => {
    expect(validateNickname('a')).toBe('Takma ad en az 2 karakter olmalı.');
  });
  it('20 karakterden uzun ad reddedilir', () => {
    expect(validateNickname('a'.repeat(21))).toBe('Takma ad en fazla 20 karakter olabilir.');
  });
  it('harf, rakam, boşluk ve emoji geçerlidir', () => {
    expect(validateNickname('Meme Ustası 42 🚀')).toBeNull();
  });
  it('nokta gibi işaretler reddedilir (link de girmez)', () => {
    expect(validateNickname('ad.soyad')).not.toBeNull();
  });
});

describe('validateRoomCode', () => {
  it('6 karakterden kısa kod reddedilir', () => {
    expect(validateRoomCode('ABC12')).not.toBeNull();
  });
  it('karışan karakterler reddedilir', () => {
    expect(validateRoomCode('OPIAZ1')).not.toBeNull();
    expect(validateRoomCode('ABC234')).toBeNull();
  });
});

describe('biçimleyiciler', () => {
  it('sayaç mm:ss biçiminde', () => {
    expect(formatClock(42)).toBe('0:42');
    expect(formatClock(95)).toBe('1:35');
  });
  it('ortalama 2 ondalık ve Türkçe virgülle', () => {
    expect(formatScore(4.25)).toBe('4,25');
  });
});
