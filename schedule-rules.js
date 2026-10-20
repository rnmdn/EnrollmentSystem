// Matches the server's half-open time overlap and inclusive academic date ranges.
// A missing academic range means the weekly meeting applies throughout the term.
export function meetingsOverlap(first, second) {
  if (first.day !== second.day || first.start >= second.end || second.start >= first.end) return false;
  if (!first.startDate || !second.startDate) return true;
  return first.startDate <= second.endDate && second.startDate <= first.endDate;
}
