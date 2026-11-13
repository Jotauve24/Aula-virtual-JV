// Grade and weight arithmetic uses hundredths so minimum scores round UP.
export const GRADE_ACTIVITY_LIMIT = 30;
export const DEFAULT_GRADE_ACTIVITIES = [
  { id: 'u1', name: 'Unidad I', weight: 10 },
  { id: 'idioma', name: 'Segundo idioma', weight: 5 },
  { id: 'u2', name: 'Unidad II', weight: 10 },
  { id: 'u3', name: 'Unidad III', weight: 15 },
  { id: 'u4', name: 'Unidad IV', weight: 15 },
  { id: 'u5', name: 'Unidad V', weight: 20 },
  { id: 'u6', name: 'Unidad VI', weight: 25 }
];

export function parseGrade(value, { optional = false, label = 'La nota' } = {}) {
  const raw = String(value ?? '').trim();
  if (!raw && optional) return null;
  if (!/^\d{1,3}(?:[.,]\d{1,2})?$/.test(raw)) {
    throw new Error(`${label} debe estar entre 0 y 100, con hasta dos decimales.`);
  }
  const number = Number(raw.replace(',', '.'));
  if (number > 100) throw new Error(`${label} debe estar entre 0 y 100.`);
  return number;
}

export function validateGradeActivities(activities) {
  if (!Array.isArray(activities) || !activities.length || activities.length > GRADE_ACTIVITY_LIMIT) {
    throw new Error(`Agrega entre 1 y ${GRADE_ACTIVITY_LIMIT} actividades.`);
  }
  const ids = new Set();
  let total = 0;
  const normalized = activities.map(activity => {
    const id = String(activity.id ?? '');
    const name = String(activity.name ?? '').trim();
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(id) || ids.has(id)) throw new Error('Revisa los identificadores de las actividades.');
    if (!name || name.length > 100) throw new Error('Cada actividad necesita un nombre de hasta 100 caracteres.');
    const weight = parseGrade(activity.weight, { label: `El porcentaje de ${name}` });
    if (!weight) throw new Error(`El porcentaje de ${name} debe ser mayor que 0.`);
    ids.add(id); total += Math.round(weight * 100);
    return { id, name, weight };
  });
  if (total !== 10000) throw new Error(`Los porcentajes deben sumar 100 %. Ahora suman ${total / 100} %.`);
  return normalized;
}

export function normalizeGradeDraft(activities, values = {}) {
  const grades = {};
  for (const activity of activities) {
    const value = parseGrade(Object.hasOwn(values, activity.id) ? values[activity.id] : undefined, { optional: true, label: `La nota de ${activity.name}` });
    if (value !== null) grades[activity.id] = value;
  }
  return grades;
}

export function calculateGrades(activities, values, goal) {
  const rows = validateGradeActivities(activities);
  const grades = normalizeGradeDraft(rows, values);
  const target = parseGrade(goal, { label: 'La meta' });
  const targetN = Math.round(target * 100) * 10000;
  let earnedN = 0, completedWeight = 0;
  const pending = [];
  for (const row of rows) {
    const weight = Math.round(row.weight * 100);
    if (Object.hasOwn(grades, row.id)) {
      completedWeight += weight;
      earnedN += Math.round(grades[row.id] * 100) * weight;
    } else pending.push({ ...row, weightUnits: weight });
  }
  const remainingWeight = 10000 - completedWeight;
  const neededN = Math.max(0, targetN - earnedN);
  const maximumN = earnedN + remainingWeight * 10000;
  return {
    grades, target,
    earned: earnedN / 1000000,
    completedWeight: completedWeight / 100,
    remainingWeight: remainingWeight / 100,
    average: completedWeight ? earnedN / completedWeight / 100 : null,
    maximum: maximumN / 1000000,
    required: remainingWeight ? Math.ceil(neededN / remainingWeight) / 100 : null,
    status: !remainingWeight ? (earnedN >= targetN ? 'complete-met' : 'complete-missed')
      : earnedN >= targetN ? 'covered' : maximumN < targetN ? 'unreachable' : 'pending',
    pending: pending.map(({ weightUnits, ...row }) => ({ ...row,
      minimum: Math.ceil(Math.max(0, neededN - (remainingWeight - weightUnits) * 10000) / weightUnits) / 100
    }))
  };
}
