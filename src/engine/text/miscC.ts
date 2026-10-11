import { simple } from './simple';
import { splitAliases, type ConceptSpec } from './lexiconTypes';
import type { ReferenceRange } from '../types';

function vital(
  key: string,
  label: string,
  category: string,
  aliases: string,
  unit: string,
  refLow: number | null,
  refHigh: number | null,
  plausible: [number, number],
  refText?: string,
): ConceptSpec {
  const ref: ReferenceRange | undefined =
    refLow === null && refHigh === null
      ? undefined
      : { low: refLow ?? undefined, high: refHigh ?? undefined, text: refText };
  return {
    key,
    label,
    kind: 'vital',
    category,
    aliases: splitAliases(aliases),
    unit,
    ref,
    plausible,
    note: refText,
  };
}

/** Vital signs, anthropometrics and wearable summaries. */
export const VITAL_SPECS: ConceptSpec[] = [
  vital('systolic-blood-pressure', 'Systolic BP', 'Blood pressure', 'systolic blood pressure|systolic bp|sbp|systolic', 'mmHg', null, 130, [40, 320], '<130 mmHg (typical target)'),
  vital('diastolic-blood-pressure', 'Diastolic BP', 'Blood pressure', 'diastolic blood pressure|diastolic bp|dbp|diastolic', 'mmHg', null, 80, [20, 200], '<80 mmHg (typical target)'),
  vital('heart-rate', 'Heart Rate', 'Vitals', 'heart rate|pulse|hr\\b|pulse rate', 'bpm', 60, 100, [20, 300], '60-100 bpm (typical resting)'),
  vital('respiratory-rate', 'Respiratory Rate', 'Vitals', 'respiratory rate|respirations|rr\\b', 'breaths/min', 12, 20, [4, 80], '12-20 breaths/min (typical)'),
  vital('body-temperature', 'Body Temperature', 'Vitals', 'temperature|body temperature|temp\\b|oral temperature', '°F', 97, 99, [90, 112], '97-99 °F (typical oral)'),
  vital('oxygen-saturation', 'Oxygen Saturation', 'Vitals', 'oxygen saturation|spo2|o2 saturation|pulse oximetry|blood oxygen', '%', 95, 100, [40, 100], '≥95 % (typical)'),
  vital('weight', 'Weight', 'Anthropometrics', 'weight|body weight|wt\\b', 'lb', null, null, [40, 900], 'no universal reference range'),
  vital('height', 'Height', 'Anthropometrics', 'height|ht\\b', 'in', null, null, [30, 100], 'no universal reference range'),
  vital('bmi', 'Body Mass Index', 'Anthropometrics', 'body mass index|bmi', 'kg/m²', 18.5, 24.9, [8, 100], '18.5-24.9 kg/m² (typical)'),
  vital('waist-circumference', 'Waist Circumference', 'Anthropometrics', 'waist circumference|waist|waist measurement', 'in', null, 40, [15, 100], 'thresholds vary by population and sex'),
  vital('resting-heart-rate', 'Resting Heart Rate', 'Wearable', 'resting heart rate|resting hr|rhr', 'bpm', 50, 90, [25, 200], 'wearable-derived; interpretation varies'),
  vital('daily-steps', 'Daily Steps', 'Wearable', 'daily steps|steps per day|average daily steps|step count', 'steps/day', null, null, [0, 100000], 'no universal reference range'),
  vital('sleep-duration', 'Sleep Duration', 'Wearable', 'sleep duration|hours of sleep|average sleep|time asleep', 'hours', 7, 9, [0, 24], '7-9 hours (typical adult)'),
  vital('vo2-max', 'VO2 Max', 'Wearable', 'vo2 max|vo2max|cardio fitness', 'mL/kg/min', null, null, [5, 90], 'interpretation depends on age and sex'),
];

/** Social / lifestyle history. */
export const SOCIAL_SPECS: ConceptSpec[] = [
  simple('social', 'smoking-status', 'Tobacco use', 'Lifestyle', 'smoking status|tobacco use|smoker|never smoker|former smoker|current smoker|pack-year|packs per day|quit smoking'),
  simple('social', 'alcohol-use', 'Alcohol use', 'Lifestyle', 'alcohol use|alcohol consumption|drinks per week|social alcohol|etoh'),
  simple('social', 'physical-activity', 'Physical activity', 'Lifestyle', 'physical activity|exercise|exercise frequency|active lifestyle|sedentary'),
  simple('social', 'diet', 'Diet', 'Lifestyle', 'diet|dietary pattern|nutrition plan|mediterranean diet|low carb'),
];

/** Demographics that are worth tracking for consistency checks. */
export const DEMOGRAPHIC_SPECS: ConceptSpec[] = [
  simple('demographic', 'blood-type', 'Blood type', 'Administrative', 'blood type|blood group|abo type|abo blood type'),
  simple('demographic', 'date-of-birth', 'Date of birth', 'Administrative', 'date of birth|dob|birth date'),
  simple('demographic', 'sex', 'Sex', 'Administrative', 'sex assigned at birth|biological sex|gender'),
];
