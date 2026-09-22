type Props = {
  itemId: string | null;
  slot: 'weapon' | 'armor';
  alt?: string;
};

function artFor(itemId: string, slot: Props['slot']): string {
  if (slot === 'armor') return '/equipment/armor.webp';
  if (itemId !== null && /bow/i.test(itemId)) return '/equipment/bow.webp';
  if (itemId !== null && /(rod|wand|staff)/i.test(itemId)) return '/equipment/staff.webp';
  return '/equipment/sword.webp';
}

export function EquipmentArt({ itemId, slot, alt = '' }: Props) {
  if (itemId === null) return null;
  return <img className="equipment-art" src={artFor(itemId, slot)} alt={alt} loading="lazy" />;
}
