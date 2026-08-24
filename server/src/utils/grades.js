/**
 * Grading, CGPA and the academic risk indicator.
 *
 * The risk score here is a transparent weighted blend of three observable
 * academic signals. It is an *indicator to prompt a human review*, not a
 * validated predictive model, and every consumer surfaces the contributing
 * factors alongside the band (§36).
 */

export const GRADE_SCALE = [
  { grade: 'O', min: 90, point: 10, label: 'Outstanding' },
  { grade: 'A+', min: 80, point: 9, label: 'Excellent' },
  { grade: 'A', min: 70, point: 8, label: 'Very good' },
  { grade: 'B+', min: 60, point: 7, label: 'Good' },
  { grade: 'B', min: 50, point: 6, label: 'Above average' },
  { grade: 'C', min: 40, point: 5, label: 'Pass' },
  { grade: 'F', min: 0, point: 0, label: 'Fail' },
];

export const RISK_WEIGHTS = { attendance: 0.4, performance: 0.4, assignments: 0.2 };

export function percentageToGrade(percentage) {
  if (percentage === null || percentage === undefined || Number.isNaN(Number(percentage))) {
    return { grade: '—', point: 0, label: 'Not graded' };
  }
  const value = Number(percentage);
  return GRADE_SCALE.find((entry) => value >= entry.min) ?? GRADE_SCALE[GRADE_SCALE.length - 1];
}

export function percentageToGradePoint(percentage) {
  return percentageToGrade(percentage).point;
}

/**
 * Credit-weighted CGPA on a 10-point scale.
 * @param {Array<{average_percentage:number, credits:number}>} subjects
 */
export function calculateCGPA(subjects = []) {
  const graded = subjects.filter(
    (subject) => subject.average_percentage !== null && subject.average_percentage !== undefined
  );
  if (!graded.length) return 0;

  let weightedPoints = 0;
  let totalCredits = 0;

  for (const subject of graded) {
    const credits = Number(subject.credits) || 1;
    weightedPoints += percentageToGradePoint(subject.average_percentage) * credits;
    totalCredits += credits;
  }

  if (!totalCredits) return 0;
  return Number((weightedPoints / totalCredits).toFixed(2));
}

export function attendancePercentage(present, total) {
  if (!total) return 0;
  return Number(((present / total) * 100).toFixed(2));
}

/**
 * Explainable academic risk indicator.
 *
 * Each of the three sub-scores is 0–100 where higher is *better*; they are
 * blended by RISK_WEIGHTS into a health score, and risk is its inverse.
 */
export function calculateRiskScore({
  attendancePercentage: attendance = 0,
  averagePercentage: performance = 0,
  assignmentCompletionRate: assignments = 0,
} = {}) {
  const clamp = (value) => Math.max(0, Math.min(100, Number(value) || 0));

  const attendanceScore = clamp(attendance);
  const performanceScore = clamp(performance);
  const assignmentScore = clamp(assignments);

  const healthScore =
    attendanceScore * RISK_WEIGHTS.attendance +
    performanceScore * RISK_WEIGHTS.performance +
    assignmentScore * RISK_WEIGHTS.assignments;

  const riskScore = Number((100 - healthScore).toFixed(2));

  let level = 'low';
  if (riskScore >= 50) level = 'high';
  else if (riskScore >= 30) level = 'medium';

  const factors = [];
  if (attendanceScore < 75) {
    factors.push({
      factor: 'attendance',
      detail: `Attendance is ${attendanceScore.toFixed(1)}%, below the 75% threshold`,
      severity: attendanceScore < 60 ? 'high' : 'medium',
    });
  }
  if (performanceScore < 50) {
    factors.push({
      factor: 'performance',
      detail: `Average score is ${performanceScore.toFixed(1)}%`,
      severity: performanceScore < 35 ? 'high' : 'medium',
    });
  }
  if (assignmentScore < 70) {
    factors.push({
      factor: 'assignments',
      detail: `${assignmentScore.toFixed(0)}% of assignments submitted`,
      severity: assignmentScore < 50 ? 'high' : 'medium',
    });
  }

  return {
    riskScore,
    healthScore: Number(healthScore.toFixed(2)),
    level,
    breakdown: {
      attendanceScore: Number(attendanceScore.toFixed(2)),
      performanceScore: Number(performanceScore.toFixed(2)),
      assignmentScore: Number(assignmentScore.toFixed(2)),
    },
    weights: RISK_WEIGHTS,
    factors,
    disclaimer:
      'Academic risk indicator derived from attendance, assessment averages and assignment completion. ' +
      'It highlights students who may benefit from a check-in — it is not a validated predictive model.',
  };
}

/**
 * Compare the most recent assessments against the earlier ones to spot a
 * decline. Expects `entries` newest-last.
 */
export function detectTrend(entries = [], recentWindow = 2) {
  const values = entries
    .map((entry) => Number(entry.percentage ?? entry))
    .filter((value) => Number.isFinite(value));

  if (values.length < 2) {
    return { direction: 'stable', change: 0, previousAverage: values[0] ?? 0, recentAverage: values[0] ?? 0 };
  }

  const window = Math.min(recentWindow, Math.floor(values.length / 2)) || 1;
  const recent = values.slice(-window);
  const previous = values.slice(0, -window);

  const mean = (list) => list.reduce((sum, value) => sum + value, 0) / list.length;
  const recentAverage = mean(recent);
  const previousAverage = previous.length ? mean(previous) : recentAverage;
  const change = Number((recentAverage - previousAverage).toFixed(2));

  let direction = 'stable';
  if (change <= -5) direction = 'declining';
  else if (change >= 5) direction = 'improving';

  return {
    direction,
    change,
    previousAverage: Number(previousAverage.toFixed(2)),
    recentAverage: Number(recentAverage.toFixed(2)),
  };
}

export default {
  GRADE_SCALE,
  RISK_WEIGHTS,
  percentageToGrade,
  percentageToGradePoint,
  calculateCGPA,
  attendancePercentage,
  calculateRiskScore,
  detectTrend,
};
