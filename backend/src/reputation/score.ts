// A user's average rating. Only called once they have at least one rating.
export function averageScore(starSum: number, ratingCount: number): number {
  return starSum / ratingCount;
}
