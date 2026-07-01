import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function haversineDistanceMeters(
  originLat: number,
  originLng: number,
  targetLat: number,
  targetLng: number,
) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadius = 6371000;
  const deltaLat = toRadians(targetLat - originLat);
  const deltaLng = toRadians(targetLng - originLng);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(toRadians(originLat)) *
      Math.cos(toRadians(targetLat)) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(earthRadius * c);
}

export function normalizePhone(phone: string) {
  const cleaned = phone.replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+")) {
    return cleaned;
  }
  const digits = cleaned.replace(/\D/g, "");
  if (digits.length === 10) {
    // Bare North American number: add the +1 country code.
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }
  return `+${digits}`;
}

export function serializeJson(data: unknown) {
  return JSON.stringify(data, null, 2);
}

export function renderTemplate(template: string, variables: Record<string, string | undefined>) {
  return Object.entries(variables).reduce((output, [key, value]) => {
    return output.replaceAll(`{{${key}}}`, value ?? "");
  }, template);
}

export function isGenericBusinessEmail(email: string) {
  const [localPart] = email.toLowerCase().split("@");
  return /^(info|hello|sales|contact|catering|orders?|support|admin|team|office|reservations?|events?)([._-]?\d+)?$/.test(
    localPart,
  );
}
