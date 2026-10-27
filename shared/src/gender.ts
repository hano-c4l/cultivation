/**
 * Gender decides which gear a character may wear (docs/PHASE2.md, 2b). Two of the four values are "crossed": a male
 * character who may only wear female gear, and the other way round. They can never wear the gear of their own sex, so
 * choosing one cannot be used to wear both styles. Fixed at creation (changing it is a later feature).
 */
export const GENDERS = ["male", "female", "male_wears_female", "female_wears_male"] as const;
export type Gender = (typeof GENDERS)[number];
export type GearStyle = "male" | "female";

export function isGender(v: unknown): v is Gender {
  return typeof v === "string" && (GENDERS as readonly string[]).includes(v);
}

/** The style of gear this gender may wear. */
export function gearStyleOf(gender: Gender): GearStyle {
  return gender === "male" || gender === "female_wears_male" ? "male" : "female";
}

/** The body a character is drawn with: the first word of the gender ("male_wears_female" is a male body in female gear). */
export function bodyOf(gender: Gender): "male" | "female" {
  return gender === "male" || gender === "male_wears_female" ? "male" : "female";
}

/** Maps a uniform roll in 0..3 to a gender, for data without a stored choice. */
export function genderFromRoll(roll: number): Gender {
  return GENDERS[Math.min(Math.max(Math.trunc(roll), 0), GENDERS.length - 1)] as Gender;
}
