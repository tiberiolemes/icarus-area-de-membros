import Avatar from "boring-avatars";

// Cores do DS; a semente é o ID da conta, então cada pessoa tem sempre a mesma imagem.
const colors = ["#000000", "#1F1F1F", "#8A8A8A", "#EAEAEA", "#FFFFFF"];

export function FallbackAvatar({ seed, size }: { seed: string; size: number }) {
  return <Avatar className="fallback-avatar" variant="beam" square name={seed} size={size} colors={colors} aria-hidden="true" />;
}
