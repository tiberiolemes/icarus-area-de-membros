/** Endereço de link: só letras minúsculas, números e hífens, em até 120 caracteres. Com `typing`, o hífen do fim fica para a próxima palavra. */
export function slugify(text: string, typing = false) {
  const slug = text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-/, "").slice(0, 120);
  return typing ? slug : slug.replace(/-$/, "");
}
