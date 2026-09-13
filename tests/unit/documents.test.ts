import { describe, expect, it } from 'vitest';

import {
  formatCpfInput,
  formatPhoneBR,
  isValidCpf,
  maskCpf,
  normalizePhoneBR,
  onlyDigits,
} from '@/lib/documents';

describe('CPF', () => {
  it('aceita CPF válido com ou sem pontuação', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true);
    expect(isValidCpf('52998224725')).toBe(true);
  });

  it('recusa dígito verificador errado, sequência repetida e tamanho errado', () => {
    expect(isValidCpf('529.982.247-24')).toBe(false);
    expect(isValidCpf('111.111.111-11')).toBe(false);
    expect(isValidCpf('5299822472')).toBe(false);
    expect(isValidCpf('')).toBe(false);
  });

  it('mascara mostrando só o miolo', () => {
    expect(maskCpf('529.982.247-25')).toBe('***.982.247-**');
    expect(() => maskCpf('123')).toThrow(RangeError);
  });

  it('formata enquanto a pessoa digita', () => {
    expect(formatCpfInput('529')).toBe('529');
    expect(formatCpfInput('5299822')).toBe('529.982.2');
    expect(formatCpfInput('52998224725')).toBe('529.982.247-25');
    expect(formatCpfInput('529.982.247-2599')).toBe('529.982.247-25');
  });
});

describe('telefone', () => {
  it('normaliza celulares e fixos para E.164 sem "+"', () => {
    expect(normalizePhoneBR('(73) 99999-8888')).toBe('5573999998888');
    expect(normalizePhoneBR('+55 73 99999-8888')).toBe('5573999998888');
    expect(normalizePhoneBR('073 3222-1111')).toBe('557332221111');
    expect(normalizePhoneBR('(55) 3222-1111')).toBe('555532221111');
  });

  it('recusa número inexistente', () => {
    expect(normalizePhoneBR('(73) 89999-8888')).toBeNull();
    expect(normalizePhoneBR('(20) 99999-8888')).toBeNull();
    expect(normalizePhoneBR('(73) 1222-1111')).toBeNull();
    expect(normalizePhoneBR('12345')).toBeNull();
  });

  it('formata para exibição', () => {
    expect(formatPhoneBR('5573999998888')).toBe('(73) 99999-8888');
    expect(formatPhoneBR('557332221111')).toBe('(73) 3222-1111');
  });

  it('extrai só os dígitos', () => {
    expect(onlyDigits('(73) 9.9999-8888')).toBe('73999998888');
  });
});
