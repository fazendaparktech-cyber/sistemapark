/** "Meia-entrada Estudante" → "meia-entrada-estudante". Sem acentos, só letras, números e hífen. */
export function slugify(texto: string, maximo = 60): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maximo)
    .replace(/-+$/g, '');
}
