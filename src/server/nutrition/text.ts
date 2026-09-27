const STOP = new Set(['and', 'with', 'the', 'some', 'a', 'an', 'of', 'little', 'bit', 'cup', 'cups', 'bowl', 'plate', 'piece', 'pieces', 'slice', 'slices', 'glass', 'small', 'large', 'medium', 'half']);

/** Content words (3+ letters, no portion words) used to check an item against the backup transcript. */
export const keyWords = (text: string) => text.toLowerCase().normalize('NFKC').split(/[^\p{L}]+/u).filter(w => w.length >= 3 && !STOP.has(w));
