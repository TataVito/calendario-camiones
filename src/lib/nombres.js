// Para agrupar nombres escritos de distintas formas ("Sodimac", "SODIMAC", "Sodimac S.A.").

// Clave de comparación: sin mayúsculas, tildes, puntos ni espacios de más,
// y sin la forma societaria del final (S.A., SpA, Ltda., EIRL).
export function claveNombre(nombre) {
  return (nombre || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s+(s a|sa|spa|ltda|limitada|eirl|e i r l)$/, '')
    .trim();
}

// De las formas en que se escribió un nombre ({ forma: veces }), la más usada.
// En empate, la que no está toda en mayúsculas ("Sodimac" antes que "SODIMAC").
export function nombreMasUsado(formas) {
  return Object.entries(formas).sort(
    ([a, na], [b, nb]) => nb - na || (a === a.toUpperCase()) - (b === b.toUpperCase()) || a.localeCompare(b),
  )[0][0];
}
