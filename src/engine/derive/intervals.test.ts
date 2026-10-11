import { describe, expect, it } from 'vitest';
import { buildSampleGraph } from '../../data/sampleCorpus';
import { buildMedicationCourses, relate, intersects } from './intervals';
import { buildAllTrajectories } from './trajectory';

const graph = buildSampleGraph();

describe('interval algebra', () => {
  it('classifies Allen relations correctly', () => {
    expect(relate({ start: '2025-01-01', end: '2025-03-01' }, { start: '2025-04-01' })).toBe('before');
    expect(
      relate({ start: '2025-01-01', end: '2025-03-01' }, { start: '2025-03-01', end: '2025-05-01' }),
    ).toBe('meets');
    expect(
      relate({ start: '2025-01-01', end: '2025-06-01' }, { start: '2025-03-01', end: '2025-04-01' }),
    ).toBe('contains');
    expect(
      relate({ start: '2025-03-01', end: '2025-04-01' }, { start: '2025-01-01', end: '2025-06-01' }),
    ).toBe('during');
    expect(relate({ start: '2025-01-01' }, { start: '2025-01-01' })).toBe('equals');
  });

  it('reconstructs medication courses with open and closed states', () => {
    const courses = buildMedicationCourses(graph);
    const atorvastatin = courses.filter((c) => c.entityKey === 'medication:atorvastatin');
    expect(atorvastatin.length).toBeGreaterThanOrEqual(1);
    expect(atorvastatin[0].interval.start).toBe('2022-03-14');
    expect(atorvastatin.some((c) => c.state === 'closed')).toBe(true);
    for (const course of courses) {
      expect(course.interval.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('treats an open course as intersecting any later date', () => {
    expect(intersects({ start: '2025-01-01' }, { start: '2026-01-01', end: '2026-02-01' })).toBe(true);
  });

  it('never marks a course closed without a closing statement', () => {
    for (const course of buildMedicationCourses(graph)) {
      if (course.state === 'closed') {
        expect(course.interval.end).toBeDefined();
        expect(course.endFactId).toBeDefined();
      } else {
        expect(course.interval.end).toBeUndefined();
      }
    }
  });
});

describe('trajectory analysis', () => {
  const trajectories = buildAllTrajectories(graph);

  it('fits a line only where there are enough readings', () => {
    const a1c = trajectories.find((t) => t.entityKey === 'measurement:hemoglobin-a1c');
    expect(a1c).toBeDefined();
    expect(a1c!.n).toBeGreaterThanOrEqual(3);
    expect(a1c!.direction).toBe('rising');
    expect(a1c!.r2).toBeGreaterThan(0);
  });

  it('excludes restated values from the fit', () => {
    const a1c = trajectories.find((t) => t.entityKey === 'measurement:hemoglobin-a1c')!;
    expect(
      a1c.points.every(
        (p) => graph.facts.find((f) => f.id === p.factId)!.attrs.restated !== true,
      ),
    ).toBe(true);
  });

  it('never compares values across units', () => {
    for (const trajectory of trajectories) {
      const units = new Set(
        trajectory.points.map((p) => graph.facts.find((f) => f.id === p.factId)?.unit),
      );
      expect(units.size).toBe(1);
    }
  });

  it('marks insufficient data rather than guessing a direction', () => {
    for (const trajectory of trajectories) {
      if (trajectory.n < 3) expect(trajectory.direction).toBe('insufficient');
    }
  });
});
