export function phoneDialUrl(phone: string): string | null {
  const trimmed = phone.trim();
  if (!/^\+?[\d\s().-]+$/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 3 || digits.length > 15) return null;
  const internationalPrefix = trimmed.startsWith('+') ? '+' : '';
  return `tel:${internationalPrefix}${digits}`;
}
