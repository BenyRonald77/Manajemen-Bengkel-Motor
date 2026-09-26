export const BOOKING_STATUS = {
  BOOKED: "BOOKED",
  SELESAI: "SELESAI",
  DIBATALKAN: "DIBATALKAN",
} as const;

export type BookingStatus = (typeof BOOKING_STATUS)[keyof typeof BOOKING_STATUS];

export const SLOT_JAM = [
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
];
