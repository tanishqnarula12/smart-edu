import { detectTrend } from '../utils/grades.js';

/**
 * Analytics agent (§33).
 *
 * Turns the numbers the analytics service produces into readable narrative.
 * Deliberately deterministic — an insight panel that says something different
 * on every refresh is worse than useless, so no model is involved here.
 */

const pct = (value) => `${Number(value ?? 0).toFixed(1)}%`;

/** Narrative insights for a student's progress page (§37). */
export function studentInsights({ attendance, performance, assignments, trend = [] }) {
  const insights = [];

  if (performance?.strongest) {
    insights.push({
      tone: 'positive',
      title: "You're performing well in",
      body: `${performance.strongest.name} at ${pct(performance.strongest.average)} — your strongest subject.`,
    });
  }

  if (performance?.weakest && performance.weakest.average < 65) {
    insights.push({
      tone: 'warning',
      title: 'You should focus more on',
      body: `${performance.weakest.name} at ${pct(performance.weakest.average)}. It is pulling your average down more than any other subject.`,
    });
  }

  if (attendance) {
    insights.push({
      tone: attendance.isBelowThreshold ? 'warning' : 'positive',
      title: 'Your attendance',
      body: attendance.isBelowThreshold
        ? `is ${pct(attendance.attendancePercentage)}, below the ${attendance.threshold}% requirement. ${attendance.absentCount} absences so far.`
        : `is ${pct(attendance.attendancePercentage)} — comfortably above the ${attendance.threshold}% requirement.`,
    });
  }

  // Read the direction of travel from the trend series rather than a snapshot.
  if (trend.length >= 3) {
    const movement = detectTrend(trend.map((point) => ({ percentage: point.score })), 3);
    const label = {
      improving: 'Your strongest improvement is',
      declining: 'Your results are slipping',
      stable: 'Your results are steady',
    }[movement.direction];

    insights.push({
      tone: movement.direction === 'declining' ? 'warning' : 'positive',
      title: label,
      body:
        movement.direction === 'stable'
          ? `holding around ${pct(movement.recentAverage)} across recent assessments.`
          : `recent assessments average ${pct(movement.recentAverage)} against ${pct(movement.previousAverage)} earlier — a change of ${movement.change > 0 ? '+' : ''}${movement.change} points.`,
    });
  }

  if (assignments) {
    insights.push({
      tone: assignments.pending > 0 ? 'warning' : 'positive',
      title: 'Assignments',
      body: assignments.pending
        ? `${assignments.pending} outstanding out of ${assignments.due} due. These are the easiest marks available to you.`
        : `all ${assignments.due} due assignments submitted. Keep it up.`,
    });
  }

  return insights;
}

/** Narrative for a class, used on teacher reports. */
export function classInsights({ attendance, performance, assignments }) {
  const insights = [];

  if (attendance) {
    insights.push({
      tone: attendance.belowThresholdCount > 0 ? 'warning' : 'positive',
      title: 'Attendance',
      body: `Class average ${pct(attendance.averageAttendance)}${
        attendance.belowThresholdCount
          ? `, with ${attendance.belowThresholdCount} of ${attendance.totalStudents} students below the threshold.`
          : ' — every student is above the threshold.'
      }`,
    });
  }

  if (performance?.subjects?.length) {
    const sorted = [...performance.subjects].sort(
      (a, b) => Number(b.average_percentage) - Number(a.average_percentage)
    );
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];

    insights.push({
      tone: 'neutral',
      title: 'Subject spread',
      body: `Strongest is ${best.subject_name} at ${pct(best.average_percentage)}; weakest is ${worst.subject_name} at ${pct(worst.average_percentage)} — a ${(Number(best.average_percentage) - Number(worst.average_percentage)).toFixed(1)} point spread.`,
    });
  }

  if (assignments) {
    insights.push({
      tone: assignments.completionRate < 75 ? 'warning' : 'positive',
      title: 'Assignment completion',
      body: `${pct(assignments.completionRate)} completion with ${assignments.pending} outstanding and ${assignments.late} submitted late.`,
    });
  }

  return insights;
}

/** Narrative for the institution dashboard. */
export function institutionInsights(overview) {
  const insights = [];

  insights.push({
    tone: overview.attendance.belowThreshold > 0 ? 'warning' : 'positive',
    title: 'Attendance',
    body: `Institution average ${pct(overview.attendance.average)}. ${overview.attendance.belowThreshold} student(s) below ${overview.attendance.threshold}%.`,
  });

  insights.push({
    tone: overview.performance.average >= 60 ? 'positive' : 'warning',
    title: 'Academic performance',
    body: `Average ${pct(overview.performance.average)} — grade ${overview.performance.grade.grade} (${overview.performance.grade.label}).`,
  });

  insights.push({
    tone: overview.assignments.completionRate >= 80 ? 'positive' : 'warning',
    title: 'Assignment completion',
    body: `${pct(overview.assignments.completionRate)} across the institution, ${overview.assignments.pending} outstanding.`,
  });

  return insights;
}

export default { studentInsights, classInsights, institutionInsights };
